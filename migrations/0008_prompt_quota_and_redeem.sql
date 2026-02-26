-- User prompt quota balance (one row per user)
CREATE TABLE IF NOT EXISTS user_prompt_quota (
  user_id TEXT NOT NULL PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Idempotent consumption log (prevents double charge per request_id)
CREATE TABLE IF NOT EXISTS prompt_quota_consumptions (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompt_quota_consumptions_user_request
ON prompt_quota_consumptions(user_id, request_id);

-- Redeem codes (single-use, fixed amount)
CREATE TABLE IF NOT EXISTS redeem_codes (
  id TEXT NOT NULL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  used_at TEXT,
  used_by_user_id TEXT,
  created_by_user_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (used_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes(code);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_is_active ON redeem_codes(is_active);

-- Redemption audit log
CREATE TABLE IF NOT EXISTS redeem_code_redemptions (
  id TEXT NOT NULL PRIMARY KEY,
  redeem_code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (redeem_code_id) REFERENCES redeem_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_redeem_code_redemptions_user
ON redeem_code_redemptions(user_id);

-- Trigger: grant 100 quota to new users on signup
CREATE TRIGGER IF NOT EXISTS tr_user_prompt_quota_on_insert
AFTER INSERT ON user
FOR EACH ROW
BEGIN
  INSERT OR IGNORE INTO user_prompt_quota (user_id, balance, created_at, updated_at)
  VALUES (NEW.id, 100, datetime('now'), datetime('now'));
END;

-- Backfill: grant 100 quota to existing users who have no row yet
INSERT OR IGNORE INTO user_prompt_quota (user_id, balance, created_at, updated_at)
SELECT id, 100, datetime('now'), datetime('now')
FROM user
WHERE id NOT IN (SELECT user_id FROM user_prompt_quota);
