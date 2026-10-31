/**
 * 测试用的 OpenAI 兼容模型服务：按顺序回放预先写好的回复，并记录收到的请求。
 *
 * 回复格式（每次请求消费一个）：
 *   { reasoning?: string, text?: string, tool_calls?: [{ name, arguments }], status?: number,
 *     delayMs?: number, hang?: boolean }
 * 也可以传函数 `(request) => reply`，根据请求内容决定回复。
 *
 * 校验与真实服务一致的一条规则：思考模式下，带 tools 的请求里，历史上每条 assistant 消息
 * 都必须带 reasoning_content，否则返回 400。
 */

import { createServer } from 'node:http';

/**
 * @typedef {object} FakeReply
 * @property {string} [reasoning]
 * @property {string} [text]
 * @property {{ name: string, arguments: string|object }[]} [tool_calls]
 * @property {number} [status]  非 200 时直接返回错误
 * @property {number} [delayMs]  每个分片之间的间隔
 * @property {boolean} [hang]  发完已有分片后不结束，直到客户端断开
 */

/**
 * @param {{ replies?: (FakeReply | ((req: any) => FakeReply))[], fallback?: FakeReply }} [options]
 */
export async function startFakeLLM(options = {}) {
  const replies = [...(options.replies ?? [])];
  const fallback = options.fallback ?? { text: '（fake-llm：没有更多预设回复）' };
  /** @type {any[]} */
  const requests = [];
  let callSeq = 0;

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(body);

    const violation = checkReasoningPassback(body);
    if (violation) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: violation, type: 'invalid_request_error' } }));
      return;
    }

    const next = replies.length ? replies.shift() : fallback;
    const reply = typeof next === 'function' ? next(body) : next;
    if (reply.status && reply.status !== 200) {
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `fake error ${reply.status}` } }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const id = `fake-${requests.length}`;
    const send = (delta, extra = {}) =>
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: body.model,
        choices: [{ index: 0, delta, ...extra }] })}\n\n`);
    const wait = () => new Promise((r) => setTimeout(r, reply.delayMs ?? 0));

    let closed = false;
    res.on('close', () => { closed = true; });

    for (const piece of split(reply.reasoning)) {
      if (closed) return;
      send({ role: 'assistant', content: '', reasoning_content: piece });
      await wait();
    }
    for (const piece of split(reply.text)) {
      if (closed) return;
      send({ role: 'assistant', content: piece });
      await wait();
    }
    if (reply.hang) return; // 保持连接，直到客户端断开
    (reply.tool_calls ?? []).forEach((call, index) => {
      const args = typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments);
      callSeq += 1;
      send({ tool_calls: [{ index, id: `call_${callSeq}`, type: 'function',
        function: { name: call.name, arguments: '' } }] });
      send({ tool_calls: [{ index, function: { arguments: args } }] });
    });
    const finish = reply.tool_calls?.length ? 'tool_calls' : 'stop';
    send({}, { finish_reason: finish });
    res.write(`data: ${JSON.stringify({ id, choices: [], usage: {
      prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 0 } } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    /** @param {...(FakeReply | ((req: any) => FakeReply))} more */
    push(...more) {
      replies.push(...more);
    },
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve(undefined));
    }),
  };
}

/** @param {any} body */
function checkReasoningPassback(body) {
  if (body.thinking?.type === 'disabled' || !body.tools?.length) return null;
  const bad = (body.messages ?? []).findIndex(
    (m) => m.role === 'assistant' && typeof m.reasoning_content !== 'string',
  );
  return bad === -1 ? null : `messages[${bad}]: reasoning_content must be passed back in thinking mode`;
}

/** @param {string|undefined} text */
function split(text) {
  if (!text) return [];
  const out = [];
  for (let i = 0; i < text.length; i += 4) out.push(text.slice(i, i + 4));
  return out;
}
