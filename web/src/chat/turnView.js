/**
 * 把一个回合（落库的消息 或 实时事件）整理成界面用的块列表。
 *
 * 块类型：
 *   { kind: 'reasoning', text }
 *   { kind: 'text', text }
 *   { kind: 'tool', callId, name, arguments, status: 'running'|'done'|'error'|'interrupted', result }
 *   { kind: 'custom', event }   工具通过 ctx.emit 发出的事件，交给渲染注册表
 */

/**
 * @typedef {object} TurnView
 * @property {number} id
 * @property {'running'|'done'|'stopped'|'failed'} status
 * @property {string|null} error
 * @property {string} userText
 * @property {any[]} blocks
 * @property {any} usage
 * @property {{ tools: string[], history_turns: number, dropped_turns: number }|null} info
 */

/**
 * 从后端 `GET /sessions/:id/turns` 的数据还原。
 * @param {any} turn
 * @returns {TurnView}
 */
export function fromStored(turn) {
  const view = emptyView(turn.id, turn.status);
  view.error = turn.error;
  view.usage = turn.usage;
  for (const msg of turn.messages) {
    if (msg.role === 'user') view.userText = msg.content;
    else if (msg.role === 'assistant') pushAssistant(view, msg);
    else if (msg.role === 'tool') attachToolResult(view, msg);
  }
  if (turn.status !== 'running') settleTools(view);
  return view;
}

/**
 * @param {number} id
 * @param {string} userText
 * @returns {TurnView}
 */
export function newLiveView(id, userText) {
  const view = emptyView(id, 'running');
  view.userText = userText;
  return view;
}

/**
 * 把一个实时事件应用到视图上（原地修改）。
 * 增量（*_delta）先显示；`message` 事件到达时以完整消息为准，替换本步的增量。
 * @param {TurnView} view
 * @param {any} event
 */
export function applyEvent(view, event) {
  switch (event.type) {
    case 'turn_start':
    case 'usage':
      return;
    case 'turn_info':
      view.info = { tools: event.tools, history_turns: event.history_turns,
        dropped_turns: event.dropped_turns };
      return;
    case 'step_start':
      view.draft = { reasoning: '', text: '' };
      return;
    case 'reasoning_delta':
      draft(view).reasoning += event.text;
      return;
    case 'text_delta':
      draft(view).text += event.text;
      return;
    case 'message':
      if (event.message.role === 'assistant') {
        view.draft = null;
        pushAssistant(view, event.message);
      } else if (event.message.role === 'tool') {
        attachToolResult(view, event.message);
      }
      return;
    case 'tool_start':
      // message(assistant) 已经建好了工具块，这里只确认状态
      return;
    case 'tool_end': {
      const block = view.blocks.find((b) => b.kind === 'tool' && b.callId === event.call_id);
      if (block) block.status = event.ok ? 'done' : 'error';
      return;
    }
    case 'turn_end':
      view.status = event.status;
      view.error = event.error ?? null;
      view.usage = event.usage ?? view.usage;
      view.draft = null;
      settleTools(view);
      return;
    default:
      view.blocks.push({ kind: 'custom', event });
  }
}

/** @param {TurnView} view */
function draft(view) {
  if (!view.draft) view.draft = { reasoning: '', text: '' };
  return view.draft;
}

/** @param {number} id @param {string} status */
function emptyView(id, status) {
  return /** @type {TurnView & { draft: any }} */ ({
    id, status, error: null, userText: '', blocks: [], usage: null, info: null, draft: null,
  });
}

/** @param {TurnView} view @param {any} msg */
function pushAssistant(view, msg) {
  if (msg.reasoning_content) view.blocks.push({ kind: 'reasoning', text: msg.reasoning_content });
  if (msg.content) view.blocks.push({ kind: 'text', text: msg.content });
  for (const call of msg.tool_calls ?? []) {
    view.blocks.push({
      kind: 'tool', callId: call.id, name: call.function.name,
      arguments: call.function.arguments, status: 'running', result: null,
    });
  }
}

/** @param {TurnView} view @param {any} msg */
function attachToolResult(view, msg) {
  const block = view.blocks.find((b) => b.kind === 'tool' && b.callId === msg.tool_call_id);
  if (!block) return;
  block.result = msg.content;
  if (block.status === 'running') block.status = msg.content.startsWith('错误：') ? 'error' : 'done';
}

/** @param {TurnView} view */
function settleTools(view) {
  for (const b of view.blocks) {
    if (b.kind === 'tool' && b.status === 'running') b.status = 'interrupted';
  }
}
