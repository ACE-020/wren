/**
 * OpenAI 兼容 Chat Completions 的流式客户端。
 *
 * 只做一件事：发一次请求，边收边回调增量，最后拼出完整的 assistant 消息。
 * 循环、工具执行、上下文都不在这里。
 */

/**
 * @typedef {object} CompletionRequest
 * @property {import('./types.js').ModelSettings} model
 * @property {import('./types.js').ChatMessage[]} messages
 * @property {object[]} [tools]  OpenAI tools 数组；为空时不发送
 * @property {'none'|'auto'} [toolChoice]
 * @property {AbortSignal} [signal]
 * @property {(delta: { reasoning?: string, text?: string }) => void} [onDelta]
 */

/**
 * @typedef {object} CompletionResult
 * @property {import('./types.js').ChatMessage} message
 * @property {string|null} finishReason
 * @property {Record<string, number>|null} usage
 */

export class LLMError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, retryable?: boolean }} [info]
   */
  constructor(message, info = {}) {
    super(message);
    this.status = info.status;
    this.retryable = info.retryable ?? false;
  }
}

/**
 * @param {CompletionRequest} req
 * @returns {Promise<CompletionResult>}
 */
export async function streamCompletion(req) {
  const { model, messages, tools, toolChoice, signal, onDelta } = req;
  if (!model.api_key) throw new LLMError('尚未配置 API key（设置 → 模型）');

  /** @type {Record<string, unknown>} */
  const body = {
    model: model.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools?.length) body.tools = tools;
  if (tools?.length && toolChoice) body.tool_choice = toolChoice;
  if (model.thinking !== 'default') body.thinking = { type: model.thinking };
  if (model.reasoning_effort) body.reasoning_effort = model.reasoning_effort;

  let res;
  try {
    res = await fetch(`${model.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${model.api_key}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new LLMError(`无法连接模型服务：${errorText(err)}`, { retryable: true });
  }
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    throw new LLMError(`模型服务返回 ${res.status}：${detail}`, {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
    });
  }

  const acc = new MessageAccumulator();
  let finishReason = null;
  let usage = null;
  for await (const data of sseData(res.body)) {
    if (data === '[DONE]') break;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      throw new LLMError(`模型服务返回了无法解析的数据：${data.slice(0, 200)}`);
    }
    if (chunk.error) throw new LLMError(`模型服务报错：${JSON.stringify(chunk.error)}`);
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};
    const out = acc.add(delta);
    if (onDelta && (out.reasoning || out.text)) onDelta(out);
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }
  return { message: acc.message(), finishReason, usage: flattenUsage(usage) };
}

/** 把流式 delta 拼成完整消息；tool_calls 按 index 合并参数片段。 */
export class MessageAccumulator {
  constructor() {
    this.content = '';
    this.reasoning = '';
    this.sawReasoning = false;
    /** @type {Map<number, import('./types.js').ToolCall>} */
    this.calls = new Map();
  }

  /** @param {any} delta */
  add(delta) {
    const out = /** @type {{ reasoning?: string, text?: string }} */ ({});
    if (typeof delta.reasoning_content === 'string') {
      this.sawReasoning = true;
      if (delta.reasoning_content) {
        this.reasoning += delta.reasoning_content;
        out.reasoning = delta.reasoning_content;
      }
    }
    if (typeof delta.content === 'string' && delta.content) {
      this.content += delta.content;
      out.text = delta.content;
    }
    for (const tc of delta.tool_calls ?? []) {
      const index = tc.index ?? 0;
      let call = this.calls.get(index);
      if (!call) {
        call = { id: '', type: 'function', function: { name: '', arguments: '' } };
        this.calls.set(index, call);
      }
      if (tc.id) call.id = tc.id;
      if (tc.function?.name) call.function.name += tc.function.name;
      if (tc.function?.arguments) call.function.arguments += tc.function.arguments;
    }
    return out;
  }

  /** @returns {import('./types.js').ChatMessage} */
  message() {
    /** @type {import('./types.js').ChatMessage} */
    const msg = { role: 'assistant', content: this.content };
    // 思考模式下必须原样保留（含空字符串），后续带 tools 的请求要回传。
    if (this.sawReasoning) msg.reasoning_content = this.reasoning;
    if (this.calls.size) {
      msg.tool_calls = [...this.calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call], i) => ({ ...call, id: call.id || `call_${i}` }));
    }
    return msg;
  }
}

/**
 * 解析 text/event-stream，逐个产出 data 字段。
 * @param {ReadableStream<Uint8Array>} stream
 */
export async function* sseData(stream) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) yield data;
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith('data:')) yield tail.slice(5).trim();
}

/** @param {any} usage */
function flattenUsage(usage) {
  if (!usage) return null;
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    if (Number.isInteger(usage[key])) out[key] = usage[key];
  }
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
  if (Number.isInteger(cached)) out.cached_tokens = cached;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  if (Number.isInteger(reasoning)) out.reasoning_tokens = reasoning;
  return out;
}

/** @param {unknown} err */
function errorText(err) {
  if (err instanceof Error) {
    const cause = /** @type {any} */ (err).cause;
    return cause?.code || cause?.message || err.message;
  }
  return String(err);
}
