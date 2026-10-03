-- =====================================================
-- SCARPE AI
-- Migration 0006
-- Goals + Projects
-- =====================================================

PRAGMA foreign_keys = ON;

-- =====================================================
-- GOALS
-- =====================================================

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    title TEXT NOT NULL,
    description TEXT,

    category TEXT,
    status TEXT NOT NULL DEFAULT 'active',

    priority TEXT DEFAULT 'medium',

    target_date TEXT,
    progress INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id
ON goals(user_id);

CREATE INDEX IF NOT EXISTS idx_goals_status
ON goals(status);

CREATE INDEX IF NOT EXISTS idx_goals_target_date
ON goals(target_date);


-- =====================================================
-- PROJECTS
-- =====================================================

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    title TEXT NOT NULL,
    description TEXT,

    category TEXT,
    status TEXT NOT NULL DEFAULT 'active',

    priority TEXT DEFAULT 'medium',

    target_date TEXT,
    progress INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id
ON projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
ON projects(status);

CREATE INDEX IF NOT EXISTS idx_projects_target_date
ON projects(target_date);
