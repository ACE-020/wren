CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 一个回合 = 一条用户消息 + agent 为它产生的全部消息（可能多步工具调用）。
CREATE TABLE turns (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'stopped', 'failed')),
  error TEXT,
  usage TEXT,            -- JSON：本回合累计 token 用量
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_turns_session ON turns (session_id, id);

-- 模型可见的完整记录，字段与 OpenAI Chat Completions 的 message 一一对应。
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  reasoning_content TEXT,
  tool_calls TEXT,       -- JSON 数组，仅 assistant
  tool_call_id TEXT,     -- 仅 tool
  name TEXT,             -- tool 消息对应的工具名
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_session ON messages (session_id, id);
CREATE INDEX idx_messages_turn ON messages (turn_id, id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,   -- JSON
  updated_at TEXT NOT NULL
);
