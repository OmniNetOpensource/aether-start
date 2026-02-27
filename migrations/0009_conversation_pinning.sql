ALTER TABLE conversation_metas ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_metas ADD COLUMN pinned_at TEXT;

CREATE INDEX IF NOT EXISTS idx_conversation_metas_user_pin_sort
ON conversation_metas(user_id, is_pinned DESC, pinned_at DESC, updated_at DESC, id DESC);

UPDATE conversation_metas
SET pinned_at = NULL
WHERE is_pinned = 0;
