-- ============================================================
-- 023_pos_schema.sql — PR 4 of Phase 2 (POS domain model)
--
-- Adds the minimum POS primitives before any backend/UI work:
--   tables, order_payments, discounts.
-- Extends the existing orders table with the Phase 2 order_type
-- taxonomy and POS linkages. There is intentionally NO pos_orders
-- table: one order system, one source of truth.
--
-- order_type vocabulary (per Phase 2 spec):
--     dine_in, takeaway, delivery   — POS fulfillment modes
--     online, whatsapp              — channel-tagged orders
-- Legacy 'pickup' maps to 'takeaway'.
--
-- orders.source already exists (005, website/whatsapp); it is
-- widened to (pos, website, whatsapp, qr) and made NOT NULL.
--
-- Payments: every payment is recorded and never deleted. Refunds
-- are negative-amount rows linked via refund_of. orders.payment_method
-- stays as the legacy display/summary field; order_payments is the
-- authoritative ledger for POS.
--
-- Hold/resume uses the existing orders row with status='held'
-- (no schema change: status is CHECK-free VARCHAR(30)).
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- Deploy together with the PR 4 Go changes (order writers must not
-- emit 'pickup' once the CHECK exists).
-- ============================================================

-- ---------- order_type backfill (before CHECK) ----------

UPDATE orders SET order_type = 'takeaway' WHERE order_type = 'pickup';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('dine_in', 'takeaway', 'delivery', 'online', 'whatsapp'));

-- ---------- source: widen + lock down ----------

UPDATE orders SET source = 'website' WHERE source IS NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check
  CHECK (source IN ('pos', 'website', 'whatsapp', 'qr'));

ALTER TABLE orders ALTER COLUMN source SET NOT NULL;

-- ---------- new order fields ----------

-- Nullable FK targets are added after their tables exist (below).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id    INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_id INTEGER;
-- tax_amount persists the computed tax so receipts stay consistent
-- even if rates change later. Default 0 = today's tax-inclusive pricing.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount  DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ---------- tables ----------

-- One row per physical table at an outlet. status is stored (not
-- derived) so cheap clients render the floor without joins; the POS
-- floor view reconciles it from open orders at query time:
--   occupied = an order on this table with status NOT IN
--              ('completed','cancelled') exists.
CREATE TABLE IF NOT EXISTS tables (
  id            SERIAL PRIMARY KEY,
  outlet_id     INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(40) NOT NULL,
  capacity      INTEGER NOT NULL DEFAULT 4 CHECK (capacity > 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'free'
                CHECK (status IN ('free', 'occupied', 'reserved', 'dirty')),
  position      INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (outlet_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tables_outlet     ON tables (outlet_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_status     ON tables (outlet_id, status) WHERE active;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_table_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_table_id_fkey
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_table ON orders (table_id) WHERE table_id IS NOT NULL;

-- ---------- order_payments ----------

CREATE TABLE IF NOT EXISTS order_payments (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  outlet_id       INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  method          VARCHAR(20) NOT NULL
                  CHECK (method IN ('cash', 'upi', 'card', 'online', 'other')),
  amount          DECIMAL(10,2) NOT NULL,           -- signed; refunds negative
  tendered        DECIMAL(10,2) NOT NULL DEFAULT 0, -- cash handed over
  change_due      DECIMAL(10,2) NOT NULL DEFAULT 0, -- cash returned
  reference       VARCHAR(120) NOT NULL DEFAULT '', -- UPI txn id / card auth
  refund_of       INTEGER REFERENCES order_payments(id) ON DELETE SET NULL,
  received_by     INTEGER REFERENCES users(id) ON DELETE SET NULL, -- cashier
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A 0-amount row is meaningless bookkeeping. Refunds are strictly
  -- negative and must link to the original payment.
  CONSTRAINT order_payments_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT order_payments_refund_negative CHECK (refund_of IS NULL OR amount < 0)
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order      ON order_payments (order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_restaurant ON order_payments (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_outlet     ON order_payments (outlet_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_refund_of  ON order_payments (refund_of) WHERE refund_of IS NOT NULL;

-- ---------- discounts ----------

-- Order-header discounts (line-level discounts come later via
-- modifier pricing). type:
--   percent: value = percent (0-100); applied to subtotal.
--   flat:    value = absolute currency amount.
-- code '' = open/manual discount (cashier-applied, no code needed).

CREATE TABLE IF NOT EXISTS discounts (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  code          VARCHAR(40) NOT NULL DEFAULT '',
  type          VARCHAR(20) NOT NULL CHECK (type IN ('percent', 'flat')),
  value         DECIMAL(10,2) NOT NULL CHECK (value >= 0),
  active        BOOLEAN NOT NULL DEFAULT true,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  min_subtotal  DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (restaurant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_discounts_restaurant ON discounts (restaurant_id) WHERE active;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_discount_id_fkey
      FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------- tax rate (used by the Phase 2B pricing engine) ----------

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

-- ---------- seed: demo tables on the default outlet ----------

INSERT INTO tables (outlet_id, restaurant_id, name, capacity, position)
SELECT o.id, o.restaurant_id, t.name, t.cap, t.pos
FROM outlets o
CROSS JOIN (VALUES
  ('T01', 4, 0),
  ('T02', 4, 1),
  ('T03', 6, 2),
  ('T04', 2, 3)
) AS t(name, cap, pos)
WHERE o.id = (
  SELECT id FROM outlets WHERE active = true
  ORDER BY restaurant_id, sort_order, id LIMIT 1
)
ON CONFLICT (outlet_id, name) DO NOTHING;
