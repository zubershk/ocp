-- ============================================================
-- 029_evolution_and_hardening.sql — Phase 5 & 6 (open-source only, no billing)
--
-- Per-restaurant Evolution instance, user key metadata,
-- audit hardening, and operational defaults.
-- ============================================================

-- per-restaurant Evolution / WhatsApp config
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS evolution_instance VARCHAR(120) DEFAULT '';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS evolution_instance_token TEXT DEFAULT '';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20) DEFAULT '';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS webhook_secret TEXT DEFAULT '';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS single_tenant_mode BOOLEAN NOT NULL DEFAULT false;

-- user credential metadata (label/rotation). key_hash stays UNIQUE globally, but per-org lookup is app-enforced.
ALTER TABLE users ADD COLUMN IF NOT EXISTS label VARCHAR(120) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_ip INET;
CREATE INDEX IF NOT EXISTS idx_users_org_active ON users(organization_id, active);
CREATE INDEX IF NOT EXISTS idx_users_expires ON users(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_revoked ON users(revoked_at) WHERE revoked_at IS NOT NULL;

-- ensure roles/permissions seeded for any org beyond 'ocp' (021 seeded only ocp)
DO $$
DECLARE org RECORD;
BEGIN
  FOR org IN SELECT id, slug FROM organizations LOOP
    -- seed base permissions handled by app bootstrap, but ensure pos.* from 026 is present for orgs created after 026
    INSERT INTO roles (organization_id, name, is_system, description) VALUES
      (org.id, 'owner', true, 'Full access'), (org.id, 'manager', true, ''), (org.id, 'cashier', true, ''), (org.id, 'kitchen', true, ''), (org.id, 'viewer', true, '')
    ON CONFLICT (organization_id, name) DO NOTHING;
  END LOOP;
END $$;

-- processed_messages already per-restaurant from 027
