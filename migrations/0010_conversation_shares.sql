CREATE TABLE IF NOT EXISTS conversation_shares (
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  title TEXT,
  snapshot_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_shares_token
ON conversation_shares(share_token);
