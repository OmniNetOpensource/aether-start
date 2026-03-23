-- Client-side error reports (public ingest, optional user_id when session exists)
CREATE TABLE client_error_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  error_name TEXT,
  stack TEXT,
  component_stack TEXT,
  source TEXT,
  line INTEGER,
  "column" INTEGER,
  page_url TEXT NOT NULL,
  user_agent TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_client_error_logs_created
  ON client_error_logs (created_at DESC, id DESC);
