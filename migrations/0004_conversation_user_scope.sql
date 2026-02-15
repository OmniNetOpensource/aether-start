PRAGMA foreign_keys=OFF;

DELETE FROM conversation_bodies;
DELETE FROM conversation_metas;

ALTER TABLE conversation_bodies RENAME TO conversation_bodies_old;
ALTER TABLE conversation_metas RENAME TO conversation_metas_old;

CREATE TABLE IF NOT EXISTS conversation_metas (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_metas_user_updated_id
ON conversation_metas(user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS conversation_bodies (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  current_path_json TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY(user_id, id) REFERENCES conversation_metas(user_id, id) ON DELETE CASCADE
);

DROP TABLE conversation_bodies_old;
DROP TABLE conversation_metas_old;

PRAGMA foreign_keys=ON;
