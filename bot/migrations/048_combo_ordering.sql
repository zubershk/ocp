-- ============================================================
-- 048_combo_ordering.sql
-- Makes combos sellable at the combo price, with a configurable
-- "pick N from the pool" limit.
--
-- 1) combos gains:
--    - menu_item_id  → the backing menu_items row that makes the combo
--                      orderable through the normal cart/checkout pipeline
--    - selection_limit → 0 = fixed bundle (customer takes the pool as
--                      defined); N>0 = customer picks exactly N units
--                      from the pool (each capped by combo_items.max_qty)
--    - show_in_menu  → whether the combo also appears in the storefront
--                      menu grid (pick-N combos are never shown there,
--                      so they cannot be bought without a selection)
--
-- 2) combo_items gains max_qty → how many of that pool item may be
--    selected in pick-N mode.
--
-- 3) order_items gains combo_id + combo_snapshot so a combo order
--    line records WHICH items were chosen (kitchen needs it) while
--    being billed at the combo price.
--
-- Idempotent: safe to run on every bot start.
-- ============================================================

ALTER TABLE combos
    ADD COLUMN IF NOT EXISTS menu_item_id     INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS selection_limit  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS show_in_menu     BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN combos.menu_item_id IS 'Backing sellable menu item; the combo is ordered through it';
COMMENT ON COLUMN combos.selection_limit IS '0 = fixed bundle (take the pool as defined); N>0 = customer picks exactly N units from the pool';
COMMENT ON COLUMN combos.show_in_menu IS 'Show the combo in the storefront menu grid (pick-N combos are always hidden there)';

ALTER TABLE combo_items
    ADD COLUMN IF NOT EXISTS max_qty INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN combo_items.max_qty IS 'Max units of this pool item selectable in pick-N mode';
COMMENT ON COLUMN combo_items.quantity IS 'Exact units included in fixed-bundle mode';

-- ------------------------------------------------------------
-- Order lines can be a combo
-- ------------------------------------------------------------
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS combo_id      INTEGER REFERENCES combos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS combo_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_combo_snapshot_is_array') THEN
        ALTER TABLE order_items ADD CONSTRAINT order_items_combo_snapshot_is_array CHECK (jsonb_typeof(combo_snapshot) = 'array');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_combo_snapshot_size') THEN
        ALTER TABLE order_items ADD CONSTRAINT order_items_combo_snapshot_size CHECK (jsonb_array_length(combo_snapshot) <= 100);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_combo ON order_items (combo_id);
CREATE INDEX IF NOT EXISTS idx_combos_menu_item ON combos (menu_item_id);

-- ------------------------------------------------------------
-- Backfill: give every existing combo its backing sellable item
-- ------------------------------------------------------------
-- Each restaurant that owns a combo needs a 'combos' category.
INSERT INTO menu_categories (name, slug, description, sort_order, active, restaurant_id)
SELECT 'Combos', 'combos', 'Curated combo meals', 90, true, c.restaurant_id
FROM (SELECT DISTINCT restaurant_id FROM combos) c
ON CONFLICT (slug, restaurant_id) DO UPDATE
    SET active = true, updated_at = CURRENT_TIMESTAMP;

-- Backing item slug must be globally unique (menu_items.slug is a
-- global unique index), so the combo id is embedded in it.
INSERT INTO menu_items
    (category_id, name, slug, description, price, image_url, available, sort_order,
     active, no_crust, dietary, restaurant_id)
SELECT cat.id,
       c.name,
       'combo-' || c.id || '-' || LEFT(c.slug, 120),
       c.description,
       c.combo_price,
       c.image_url,
       c.is_active AND (c.selection_limit = 0),
       c.sort_order,
       c.is_active,
       true,
       'veg',
       c.restaurant_id
FROM combos c
JOIN menu_categories cat
  ON cat.slug = 'combos' AND cat.restaurant_id = c.restaurant_id
WHERE c.menu_item_id IS NULL
ON CONFLICT (slug) DO NOTHING;

UPDATE combos c
SET menu_item_id = mi.id
FROM menu_items mi
WHERE mi.slug = 'combo-' || c.id || '-' || LEFT(c.slug, 120)
  AND c.restaurant_id = mi.restaurant_id
  AND c.menu_item_id IS NULL;
