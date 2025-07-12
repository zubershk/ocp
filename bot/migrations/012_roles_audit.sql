-- 012_roles_audit.sql — SaaS roles + audit for OCP dashboard
-- Single-tenant roles: owner > manager > kitchen > viewer
-- Idempotent.

CREATE TABLE IF NOT EXISTS admin_users (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    key_hash   VARCHAR(128) UNIQUE NOT NULL,
    role       VARCHAR(20) NOT NULL CHECK (role IN ('owner','manager','kitchen','viewer')),
    active     BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_users_key_hash ON admin_users(key_hash);
CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(active);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id             SERIAL PRIMARY KEY,
    admin_user_id  INT REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_name     VARCHAR(120),
    action         VARCHAR(60) NOT NULL,
    target         VARCHAR(120),
    details        JSONB DEFAULT '{}',
    ip             VARCHAR(45),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_user_id);

-- Seed owner from existing BOT_ADMIN_KEY if not already seeded
-- Note: app will also auto-seed on boot via Go code for env key, so this is best-effort
-- We store hash, not plain — app hashes on insert
