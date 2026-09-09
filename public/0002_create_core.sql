-- LIFEOS AI
-- Migration 0002
-- Core planning, chat and user data

PRAGMA foreign_keys = ON;

-- =========================
-- CONVERSATIONS
-- =========================

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
ON conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
ON conversations(updated_at);


-- =========================
-- MESSAGES
-- =========================

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
ON messages(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
ON messages(created_at);


-- =========================
-- PLANS
-- =========================

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    plan_type TEXT NOT NULL,
    plan_date TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plans_user_id
ON plans(user_id);

CREATE INDEX IF NOT EXISTS idx_plans_plan_date
ON plans(plan_date);

CREATE INDEX IF NOT EXISTS idx_plans_status
ON plans(status);


-- =========================
-- TASKS
-- =========================

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    due_date TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id
ON tasks(user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_plan_id
ON tasks(plan_id);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
ON tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_status
ON tasks(status);


-- =========================
-- USER PREFERENCES
-- =========================

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    timezone TEXT,
    wake_time TEXT,
    sleep_time TEXT,
    planning_preferences TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- =========================
-- SAVED PLANS
-- =========================

CREATE TABLE IF NOT EXISTS saved_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_plans_unique
ON saved_plans(user_id, plan_id);

CREATE INDEX IF NOT EXISTS idx_saved_plans_user_id
ON saved_plans(user_id);
