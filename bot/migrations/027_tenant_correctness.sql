-- ============================================================
-- 027_tenant_correctness.sql — SaaS hard gate (Phase 0)
--
-- Tenant-scoping corrections: the API is moving to strict
-- RequireTenant, but the DB must first stop allowing cross-tenant
-- collisions/ambient leakage.
--
-- 1. customers (whatsapp_number, restaurant_id) UNIQUE (was global)
-- 2. menu_categories (slug, restaurant_id) UNIQUE (was global)
-- 3. orders / order_payments idempotency scoped to restaurant
-- 4. Add restaurant_id (and outlet where relevant) to ambient tables:
--    carts, customer_states, whatsapp_cart_items, whatsapp_conversations,
--    whatsapp_messages, customer_otps, customer_sessions, processed_messages
--    Backfill to bootstrap restaurant, then enforce NOT NULL where safe.
-- 5. Per-tenant order counter (restaurant_orders_seq)
--
-- Idempotent and safe to run repeatedly on existing installs.
-- ============================================================

-- ---------- helpers: bootstrap tenant ----------
DO $$
DECLARE
  v_org_id INT;
  v_rest_id INT;
  v_outlet_id INT;
BEGIN
  SELECT id INTO v_org_id FROM organizations ORDER BY id LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE '027: no organization yet, deferring backfills';
    RETURN;
  END IF;
  SELECT id INTO v_rest_id FROM restaurants WHERE organization_id = v_org_id ORDER BY id LIMIT 1;
  IF v_rest_id IS NULL THEN
    RAISE NOTICE '027: no restaurant yet';
    RETURN;
  END IF;
  SELECT id INTO v_outlet_id FROM outlets WHERE restaurant_id = v_rest_id ORDER BY sort_order, id LIMIT 1;

  -- Pre-fill any new columns that already exist from a prior partial run
  BEGIN
    UPDATE carts SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN
    UPDATE customer_states SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN
    UPDATE whatsapp_cart_items SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN
    UPDATE whatsapp_conversations SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN
    UPDATE whatsapp_messages SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN
    UPDATE customer_otps SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN
    UPDATE customer_sessions SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN
    UPDATE processed_messages SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  EXCEPTION WHEN undefined_column THEN NULL; END;
END $$;

-- ---------- 1. customers: global -> per-restaurant ----------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);

-- backfill nulls to bootstrap
DO $$
DECLARE v_rest_id INT;
BEGIN
  SELECT id INTO v_rest_id FROM restaurants ORDER BY id LIMIT 1;
  IF v_rest_id IS NOT NULL THEN
    UPDATE customers SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  END IF;
END $$;

-- drop global unique if present, add composite
DO $$ BEGIN
  ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_whatsapp_number_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DROP INDEX IF EXISTS customers_whatsapp_number_key;
DROP INDEX IF EXISTS idx_customers_whatsapp;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone_restaurant ON customers(whatsapp_number, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(whatsapp_number);

-- ---------- 2. menu_categories: global slug -> per-restaurant ----------
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);

DO $$
DECLARE v_rest_id INT;
BEGIN
  SELECT id INTO v_rest_id FROM restaurants ORDER BY id LIMIT 1;
  IF v_rest_id IS NOT NULL THEN
    UPDATE menu_categories SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  END IF;
END $$;

-- drop global unique index, replace with composite
DROP INDEX IF EXISTS uq_menu_categories_slug;
DO $$ BEGIN
  ALTER TABLE menu_categories DROP CONSTRAINT IF EXISTS menu_categories_slug_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_menu_categories_slug_restaurant') THEN
    -- Use index for uniqueness to allow IF NOT EXISTS handling
    CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_categories_slug_restaurant ON menu_categories(slug, restaurant_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories(restaurant_id);

-- ---------- 3. orders idempotency: global -> per-restaurant ----------
DROP INDEX IF EXISTS uq_orders_idempotency_key;
DO $$ BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Deduplicate before reindexing: keep earliest id per (restaurant_id, key)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='idempotency_key') THEN
    DELETE FROM orders a USING orders b
    WHERE a.id > b.id
      AND a.idempotency_key IS NOT NULL
      AND a.idempotency_key = b.idempotency_key
      AND a.restaurant_id = b.restaurant_id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_restaurant
  ON orders(restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_idempotency ON orders(restaurant_id, idempotency_key);

-- ---------- order_payments idempotency: global -> per-restaurant ----------
DROP INDEX IF EXISTS uq_order_payments_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_payments_idempotency_restaurant
  ON order_payments(restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_payments_restaurant_key ON order_payments(restaurant_id, idempotency_key);

-- ---------- per-restaurant order counter ----------
CREATE TABLE IF NOT EXISTS restaurant_order_counters (
  restaurant_id INTEGER PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  last_number   INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- seed counters from existing max per restaurant (best-effort parse suffix)
DO $$
DECLARE r RECORD;
  v_max INT;
BEGIN
  FOR r IN SELECT id FROM restaurants LOOP
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '([0-9]+)$') AS INTEGER)), 0)
      INTO v_max FROM orders WHERE restaurant_id = r.id AND order_number ~ '[0-9]+$';
    INSERT INTO restaurant_order_counters (restaurant_id, last_number)
    VALUES (r.id, v_max)
    ON CONFLICT (restaurant_id) DO NOTHING;
  END LOOP;
END $$;

-- ---------- 4. ambient tables: add restaurant_id ----------
ALTER TABLE carts ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE customer_states ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE whatsapp_cart_items ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE customer_otps ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE customer_sessions ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE processed_messages ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);

-- whatsapp_conversations previously had 1 row per customer_id (global). Keep FK, add restaurant for fast filter + future composite.
-- (customer_id already implies restaurant via customers, but direct column prevents join for hot path)

-- backfill ambient tables after columns exist
DO $$
DECLARE v_rest_id INT;
BEGIN
  SELECT id INTO v_rest_id FROM restaurants ORDER BY id LIMIT 1;
  IF v_rest_id IS NULL THEN RETURN; END IF;
  UPDATE carts SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  UPDATE customer_states SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  UPDATE whatsapp_cart_items SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  UPDATE whatsapp_conversations SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  UPDATE whatsapp_messages SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  UPDATE customer_otps SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  UPDATE customer_sessions SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
  UPDATE processed_messages SET restaurant_id = v_rest_id WHERE restaurant_id IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_carts_restaurant ON carts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_carts_restaurant_phone ON carts(restaurant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_states_restaurant ON customer_states(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customer_states_restaurant_phone ON customer_states(restaurant_id, phone);
CREATE INDEX IF NOT EXISTS idx_wa_cart_restaurant ON whatsapp_cart_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_wa_cart_restaurant_phone ON whatsapp_cart_items(restaurant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_restaurant ON whatsapp_conversations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_restaurant ON whatsapp_messages(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_restaurant_phone ON whatsapp_messages(restaurant_id, customer_phone, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_otps_restaurant ON customer_otps(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customer_otps_restaurant_phone ON customer_otps(restaurant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_restaurant ON customer_sessions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_restaurant_token ON customer_sessions(restaurant_id, token);
CREATE INDEX IF NOT EXISTS idx_processed_messages_restaurant ON processed_messages(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_processed_messages_restaurant_msg ON processed_messages(restaurant_id, message_id);

-- processed_messages global UNIQUE -> per-restaurant
DO $$ BEGIN
  ALTER TABLE processed_messages DROP CONSTRAINT IF EXISTS processed_messages_message_id_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
DROP INDEX IF EXISTS processed_messages_message_id_key;
DROP INDEX IF EXISTS idx_processed_messages_message_id;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_processed_messages_restaurant_msg') THEN
    -- keep as index, not constraint, to allow WHERE clause style if needed later
    CREATE UNIQUE INDEX IF NOT EXISTS uq_processed_messages_restaurant_msg ON processed_messages(restaurant_id, message_id);
  END IF;
END $$;

-- enforce NOT NULL where we have backfilled (leave outlets/opt flexible for self-host single-tenant transition)
DO $$ BEGIN
  ALTER TABLE customers ALTER COLUMN restaurant_id SET NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'customers NOT NULL defer: %', SQLERRM; END $$;
DO $$ BEGIN
  ALTER TABLE menu_categories ALTER COLUMN restaurant_id SET NOT NULL;
EXCEPTION WHEN others THEN RAISE NOTICE 'menu_categories NOT NULL defer: %', SQLERRM; END $$;

-- carts etc remain nullable until app code stamps them (Phase 1), to keep existing INSERTs working during deploy
