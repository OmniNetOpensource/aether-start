CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  preferred_model_id TEXT NOT NULL
);
