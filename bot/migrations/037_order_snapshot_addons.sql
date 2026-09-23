-- 037_order_snapshot_addons.sql — PR #2 addon price snapshot (foundation only)
-- Establishes durable price snapshot for historical orders.
-- Only addons_snapshot JSONB array is added in PR #2. Order-level business columns
-- (container/tip/round/is_complimentary/advance/guest/customer_snapshot) are PR #4.
-- Optional normalized order_item_addons table is intentionally DEFERRED per clarification
-- (addons_snapshot alone satisfies invariant: existing order never changes when admin edits addon).
-- See migration plan note: keep 037 minimal, migration 038 holds payment/customer config.

-- ---------- order_items.addons_snapshot ----------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS addons_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill nulls if column existed without default before
UPDATE order_items SET addons_snapshot = '[]'::jsonb WHERE addons_snapshot IS NULL;

-- Guard: must be a JSON array; each element should carry {group,item,quantity,price}
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_addons_snapshot_is_array') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_addons_snapshot_is_array CHECK (jsonb_typeof(addons_snapshot) = 'array');
  END IF;
END $$;

-- Optional: ensure snapshot not absurdly large (1k entries max) — defensive, not business
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_addons_snapshot_size') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_addons_snapshot_size CHECK (jsonb_array_length(addons_snapshot) <= 1000);
  END IF;
END $$;

-- GIN index for analytics (optional, low cost, not required for receipt)
CREATE INDEX IF NOT EXISTS idx_order_items_addons_snapshot_gin ON order_items USING GIN (addons_snapshot);
