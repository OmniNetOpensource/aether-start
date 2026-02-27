CREATE TABLE IF NOT EXISTS notes (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated
ON notes(user_id, updated_at DESC, id DESC);
