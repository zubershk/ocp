-- ============================================================
-- 047_combos.sql
-- Combo builder: a named bundle of menu items sold at a single
-- combo price (e.g. "2 Medium Pizzas + Garlic Bread + Coke").
--
-- The combo header owns the sellable price and merchandising
-- fields; combo_items records the constituent menu items with
-- the size and quantity that make up the bundle. MRP is derived
-- from the constituents at read time so it always reflects the
-- live menu prices.
-- ============================================================

CREATE TABLE IF NOT EXISTS combos (
    id            SERIAL PRIMARY KEY,
    restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name          VARCHAR(160) NOT NULL,
    slug          VARCHAR(180) NOT NULL,
    description   TEXT,
    image_url     TEXT,
    combo_price   DECIMAL(10,2) NOT NULL CHECK (combo_price >= 0),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order    INT NOT NULL DEFAULT 0,
    starts_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMPTZ DEFAULT NULL,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_combos_slug_restaurant
    ON combos(slug, restaurant_id);

CREATE INDEX IF NOT EXISTS idx_combos_restaurant
    ON combos(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_combos_active
    ON combos(restaurant_id, is_active);

-- Constituent items. menu_item_id is restricted (not cascade) so a
-- combo can never be silently emptied by deleting a menu item.
CREATE TABLE IF NOT EXISTS combo_items (
    id          SERIAL PRIMARY KEY,
    combo_id    INT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
    menu_item_id INT NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    size        VARCHAR(10) NOT NULL DEFAULT 'regular',
    quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo
    ON combo_items(combo_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_combo_items_unique
    ON combo_items(combo_id, menu_item_id, size);

COMMENT ON TABLE combos IS 'Named bundles of menu items sold at a single combo price';
COMMENT ON COLUMN combos.combo_price IS 'Final selling price of the combo (all taxes included, like menu items)';
COMMENT ON TABLE combo_items IS 'Constituent menu items of a combo with size and quantity';
COMMENT ON COLUMN combo_items.size IS 'Size variant of the constituent item (regular/medium/large)';
