PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (length(name) > 0 AND length(name) <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_active
ON projects(lower(name))
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  project_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (length(name) > 0 AND length(name) <= 100),
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_name_project_active
ON tasks(lower(name), ifnull(project_id, 0))
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  started_minute INTEGER NOT NULL,
  ended_minute INTEGER,
  paused_total_minutes INTEGER NOT NULL DEFAULT 0,
  paused_started_minute INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id),
  CHECK (ended_minute IS NULL OR ended_minute >= started_minute),
  CHECK (paused_total_minutes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_time_entries_open
ON time_entries(ended_minute)
WHERE ended_minute IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_date
ON time_entries(date_key);

CREATE INDEX IF NOT EXISTS idx_time_entries_task_date
ON time_entries(task_id, date_key);
