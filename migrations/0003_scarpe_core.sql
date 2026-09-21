-- SCARPE AI
-- Migration 0003
-- User memory, sAI personalization, roles, subscriptions and admin audit

PRAGMA foreign_keys = ON;


-- =========================
-- USER ROLES
-- =========================
-- USER
-- SAI SUPPORT
-- MODERATOR
-- ADMIN
-- SENIOR ADMIN
-- SYSTEM ADMIN
-- DEVELOPER
-- CEO ADMIN

ALTER TABLE users
ADD COLUMN role TEXT NOT NULL DEFAULT 'USER';

CREATE INDEX IF NOT EXISTS idx_users_role
ON users(role);


-- =========================
-- sAI MEMORY
-- =========================

CREATE TABLE IF NOT EXISTS sai_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    memory_key TEXT NOT NULL,
    memory_value TEXT NOT NULL,
    category TEXT,
    importance TEXT NOT NULL DEFAULT 'medium',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sai_memory_user_key
ON sai_memory(user_id, memory_key);

CREATE INDEX IF NOT EXISTS idx_sai_memory_user_id
ON sai_memory(user_id);

CREATE INDEX IF NOT EXISTS idx_sai_memory_category
ON sai_memory(category);


-- =========================
-- sAI PERSONALIZATION
-- =========================

CREATE TABLE IF NOT EXISTS sai_preferences (
    user_id TEXT PRIMARY KEY,
    tone TEXT NOT NULL DEFAULT 'balanced',
    personality TEXT NOT NULL DEFAULT 'natural',
    motivation_level TEXT NOT NULL DEFAULT 'medium',
    planning_style TEXT NOT NULL DEFAULT 'adaptive',
    custom_instructions TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);


-- =========================
-- SUBSCRIPTIONS
-- =========================

CREATE TABLE IF NOT EXISTS subscriptions (
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

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id
ON subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
ON subscriptions(plan);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
ON subscriptions(status);


-- =========================
-- ADMIN AUDIT LOG
-- =========================

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT,
    details TEXT,
    result TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY (admin_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (target_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin
ON admin_audit_log(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target
ON admin_audit_log(target_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at
ON admin_audit_log(created_at);
