CREATE TABLE IF NOT EXISTS conversation_artifacts (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY(user_id, conversation_id) REFERENCES conversation_metas(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_artifacts_user_conversation_created_id
ON conversation_artifacts(user_id, conversation_id, created_at DESC, id DESC);
