-- Scarpe AI schema synchronization
-- Migration 0005
-- Aligns the existing D1 schema with src/index.js.

PRAGMA foreign_keys = OFF;

-- =========================
-- sAI MEMORY
-- =========================
ALTER TABLE sai_memory ADD COLUMN memory_key TEXT;
ALTER TABLE sai_memory ADD COLUMN memory_value TEXT;
ALTER TABLE sai_memory ADD COLUMN category TEXT;

UPDATE sai_memory
SET memory_key = COALESCE(memory_key, memory_type),
    memory_value = COALESCE(memory_value, content),
    category = COALESCE(category, memory_type)
WHERE memory_key IS NULL
   OR memory_value IS NULL
   OR category IS NULL;

-- =========================
-- sAI PREFERENCES
-- =========================
ALTER TABLE sai_preferences ADD COLUMN personality TEXT;
ALTER TABLE sai_preferences ADD COLUMN motivation_level TEXT;
ALTER TABLE sai_preferences ADD COLUMN planning_style TEXT;
ALTER TABLE sai_preferences ADD COLUMN custom_instructions TEXT;

UPDATE sai_preferences
SET personality = COALESCE(personality, style, 'natural'),
    motivation_level = COALESCE(motivation_level, 'medium'),
    planning_style = COALESCE(planning_style, 'adaptive'),
    custom_instructions = COALESCE(custom_instructions, instructions);

-- =========================
-- SUBSCRIPTIONS
-- =========================
CREATE TABLE subscriptions_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'FREE',
    status TEXT NOT NULL DEFAULT 'active',
    billing_cycle TEXT,
    started_at TEXT,
    renews_at TEXT,
    external_customer_id TEXT,
    external_subscription_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO subscriptions_new (
    id,
    user_id,
    plan,
    billing_cycle,
    status,
    started_at,
    renews_at,
    created_at,
    updated_at
)
SELECT
    id,
    user_id,
    plan,
    billing_cycle,
    status,
    started_at,
    renews_at,
    created_at,
    updated_at
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_new RENAME TO subscriptions;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id
ON subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
ON subscriptions(plan);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
ON subscriptions(status);

-- =========================
-- ADMIN AUDIT LOG
-- =========================
ALTER TABLE admin_audit_log ADD COLUMN result TEXT;

PRAGMA foreign_keys = ON;
