CREATE TABLE IF NOT EXISTS for_you_suggestions (
  user_id TEXT NOT NULL PRIMARY KEY,
  suggestions_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
