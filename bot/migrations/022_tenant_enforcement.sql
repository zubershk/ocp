-- ============================================================
-- 022_tenant_enforcement.sql — PR 3 of Phase 1 (lock isolation)
--
-- 1. Repeats the PR 1 backfills defensively (fresh/partial DBs).
-- 2. Adds restaurant_id to restaurant_outlets; organization_id to
--    admin_audit_log; backfills both.
-- 3. Converts global UNIQUE keys to per-tenant composites so two
--    restaurants can own the same slug/key independently.
-- 4. Enforces NOT NULL on every tenant column. From here on, an
--    unscoped write fails loudly instead of leaking silently.
--
-- Requires: application code from PR 3 (all writers stamp tenant
-- columns). Deploy code + migration together.
--
-- This migration is IDEMPOTENT and safe to run repeatedly, EXCEPT
-- the constraint swaps which assume single-tenant uniqueness
-- (true for all pre-PR-3 data).
-- ============================================================

-- ---------- new columns (must exist before backfills) ----------

ALTER TABLE restaurant_outlets ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE admin_audit_log    ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);

-- ---------- backfills (idempotent; repeat PR 1 coverage for fresh rows) ----------

DO $$
DECLARE
  v_restaurant_id INT;
  v_outlet_id INT;
  v_org_id INT;
BEGIN
  SELECT o.id INTO v_org_id FROM organizations o ORDER BY o.id LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'tenant enforcement: no organization yet, skipping backfills';
    RETURN;
  END IF;

  SELECT r.id INTO v_restaurant_id FROM restaurants r
  WHERE r.organization_id = v_org_id ORDER BY r.id LIMIT 1;

  SELECT id INTO v_outlet_id FROM outlets
  WHERE restaurant_id = v_restaurant_id AND active = true
  ORDER BY sort_order, id LIMIT 1;

  UPDATE menu_items        SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE menu_categories   SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE menu_crusts       SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE customers         SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE reviews           SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE site_settings     SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE site_pages        SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE bot_messages      SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE restaurant_config SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE orders            SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE order_items       SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE orders            SET outlet_id = v_outlet_id WHERE outlet_id IS NULL AND v_outlet_id IS NOT NULL;
  UPDATE restaurant_outlets SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE admin_audit_log   SET organization_id = v_org_id WHERE organization_id IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_restaurant_outlets_restaurant ON restaurant_outlets (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON admin_audit_log (organization_id);

-- ---------- per-tenant unique constraints ----------

ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_key_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_key_restaurant_uniq') THEN
    ALTER TABLE site_settings ADD CONSTRAINT site_settings_key_restaurant_uniq UNIQUE (key, restaurant_id);
  END IF;
END $$;

ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_slug_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_pages_slug_restaurant_uniq') THEN
    ALTER TABLE site_pages ADD CONSTRAINT site_pages_slug_restaurant_uniq UNIQUE (slug, restaurant_id);
  END IF;
END $$;

ALTER TABLE bot_messages DROP CONSTRAINT IF EXISTS bot_messages_message_key_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_messages_key_restaurant_uniq') THEN
    ALTER TABLE bot_messages ADD CONSTRAINT bot_messages_key_restaurant_uniq UNIQUE (message_key, restaurant_id);
  END IF;
END $$;

ALTER TABLE menu_crusts DROP CONSTRAINT IF EXISTS menu_crusts_slug_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_crusts_slug_restaurant_uniq') THEN
    ALTER TABLE menu_crusts ADD CONSTRAINT menu_crusts_slug_restaurant_uniq UNIQUE (slug, restaurant_id);
  END IF;
END $$;

-- ---------- enforce NOT NULL ----------

ALTER TABLE menu_items        ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE menu_categories   ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE menu_crusts       ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE customers         ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE reviews           ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE site_settings     ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE site_pages        ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE bot_messages      ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE restaurant_config ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE orders            ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE orders            ALTER COLUMN outlet_id SET NOT NULL;
ALTER TABLE order_items       ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE restaurant_outlets ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE admin_audit_log   ALTER COLUMN organization_id SET NOT NULL;
