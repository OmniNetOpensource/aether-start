CREATE TABLE IF NOT EXISTS conversation_metas (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_metas_updated_id
ON conversation_metas(updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS conversation_bodies (
  id TEXT PRIMARY KEY,
  current_path_json TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(id) REFERENCES conversation_metas(id) ON DELETE CASCADE
);
