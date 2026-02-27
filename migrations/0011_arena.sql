CREATE TABLE IF NOT EXISTS arena_sessions (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS arena_rounds (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  response_a_json TEXT NOT NULL,
  response_b_json TEXT NOT NULL,
  model_a_role TEXT NOT NULL,
  model_b_role TEXT NOT NULL,
  vote_choice TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id, session_id) REFERENCES arena_sessions(user_id, id) ON DELETE CASCADE,
  CHECK (vote_choice IS NULL OR vote_choice IN ('a', 'b', 'tie', 'both_bad'))
);

CREATE TABLE IF NOT EXISTS arena_model_ratings (
  model_id TEXT NOT NULL PRIMARY KEY,
  rating REAL NOT NULL,
  matches INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  draws INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_arena_sessions_user_updated
ON arena_sessions(user_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_arena_rounds_user_session_created
ON arena_rounds(user_id, session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_arena_rounds_models
ON arena_rounds(model_a_role, model_b_role);

CREATE INDEX IF NOT EXISTS idx_arena_ratings_score
ON arena_model_ratings(rating DESC, matches DESC, model_id ASC);
