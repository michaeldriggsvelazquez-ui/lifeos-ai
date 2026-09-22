ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'FREE',
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    renews_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS sai_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sai_memory_user_id
ON sai_memory(user_id);

CREATE TABLE IF NOT EXISTS sai_preferences (
    user_id TEXT PRIMARY KEY,
    tone TEXT,
    style TEXT,
    language TEXT,
    instructions TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id
ON admin_audit_log(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_user_id
ON admin_audit_log(target_user_id);
