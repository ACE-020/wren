/**
 * 笔记工具：数据存在后端（/internal/notes），agent 只负责调用。
 * 保存成功后发一个 `note_saved` 自定义事件，前端在对话里显示一张笔记卡片。
 */

/** @type {import('./registry.js').ToolDefinition} */
export const saveNote = {
  name: 'save_note',
  description:
    '把内容保存为一条笔记，用户之后可以在「笔记」页查看。用户明确要求记下、保存、记录某些内容时调用。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '简短标题，不超过 80 字' },
      body: { type: 'string', description: '笔记正文，可以用 Markdown' },
    },
    required: ['title', 'body'],
  },
  async execute({ title, body }, { backend, sessionId, signal, emit }) {
    const note = await backend.request('POST', '/internal/notes', { title, body, session_id: sessionId }, signal);
    emit({ type: 'note_saved', note: { id: note.id, title: note.title } });
    return { saved: true, id: note.id };
  },
};

/** @type {import('./registry.js').ToolDefinition} */
export const searchNotes = {
  name: 'search_notes',
  description: '按关键词搜索用户已保存的笔记（多个关键词用空格分隔，全部命中才返回）。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '关键词' },
    },
    required: ['query'],
  },
  async execute({ query }, { backend, signal }) {
    const q = encodeURIComponent(String(query ?? ''));
    const { notes } = await backend.request('GET', `/internal/notes/search?q=${q}&limit=5`, undefined, signal);
    if (!notes.length) return '没有找到相关笔记。';
    return notes.map((n) => ({ id: n.id, title: n.title, body: n.body, updated_at: n.updated_at }));
  },
};
