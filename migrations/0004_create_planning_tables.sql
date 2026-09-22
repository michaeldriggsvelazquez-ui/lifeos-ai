CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    plan_type TEXT,
    plan_date TEXT,
    status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plans_user_id
ON plans(user_id);

CREATE INDEX IF NOT EXISTS idx_plans_plan_date
ON plans(plan_date);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    priority TEXT,
    status TEXT,
    due_date TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id
ON tasks(user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_plan_id
ON tasks(plan_id);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
ON tasks(due_date);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    timezone TEXT,
    wake_time TEXT,
    sleep_time TEXT,
    planning_preferences TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS saved_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_plans_user_plan
ON saved_plans(user_id, plan_id);

CREATE INDEX IF NOT EXISTS idx_saved_plans_user_id
ON saved_plans(user_id);
