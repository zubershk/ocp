-- 039_pos_hardening_order_fields.sql — POS Hardening: transport/persist customer, financial, addon fields without business semantics
-- Customer info maps to existing orders.customer_* but add guest_count, container, tip, complimentary, advance for hardening verification.
-- No totals semantics changed: RecalculateOrderTotals still owns pricing; these fields are stored and returned.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count BETWEEN 1 AND 50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS container_charge DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (container_charge >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(customer_snapshot) = 'object');

-- Ensure order_items.addons_snapshot exists (from 037) — no change, but backfill nulls if any
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='addons_snapshot') THEN
    UPDATE order_items SET addons_snapshot = '[]'::jsonb WHERE addons_snapshot IS NULL;
  END IF;
END $$;

-- Indexes for hardening queries
CREATE INDEX IF NOT EXISTS idx_orders_advance_at ON orders(advance_at) WHERE advance_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_is_complimentary ON orders(is_complimentary) WHERE is_complimentary;

-- Backfill guest_count for existing rows (already default 1)
UPDATE orders SET guest_count = 1 WHERE guest_count IS NULL;
