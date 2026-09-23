-- 033_addon_groups.sql — item-scoped addon modifier groups (Petpooja parity)
-- Supports Chicken Dominator style: Variation (size) + Addon Cheese Burst (Min0 Max1) + Non-veg Combo (Min0 Max1)
CREATE TABLE IF NOT EXISTS addon_groups (
  id SERIAL PRIMARY KEY,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  size_scope VARCHAR(20) NOT NULL DEFAULT 'regular' CHECK (size_scope IN ('regular','medium','large','all')),
  selection_type VARCHAR(20) NOT NULL DEFAULT 'multiple' CHECK (selection_type IN ('single','multiple')),
  min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_addon_groups_item ON addon_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_addon_groups_restaurant ON addon_groups(restaurant_id);

CREATE TABLE IF NOT EXISTS addon_items (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price_override DECIMAL(10,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_addon_items_group ON addon_items(group_id);
CREATE INDEX IF NOT EXISTS idx_addon_items_menu ON addon_items(menu_item_id);

-- Seed for Chicken Dominator (find id by slug, active item)
DO $$
DECLARE
  dom_id INT;
  rest_id INT;
BEGIN
  SELECT id, restaurant_id INTO dom_id, rest_id FROM menu_items WHERE slug = 'chicken-dominator' LIMIT 1;
  IF dom_id IS NOT NULL THEN
    -- Group 1: Cheese Burst (Multiple, Min0 Max1, regular)
    INSERT INTO addon_groups (menu_item_id, name, size_scope, selection_type, min_select, max_select, restaurant_id)
    VALUES (dom_id, 'Addon Cheese Burst (regular)', 'regular', 'multiple', 0, 1, rest_id)
    ON CONFLICT DO NOTHING;
    -- Group 2: Non-veg Supreme Combo (Single, Min0 Max1)
    INSERT INTO addon_groups (menu_item_id, name, size_scope, selection_type, min_select, max_select, restaurant_id)
    VALUES (dom_id, 'Non-veg Supreme Combo Addon (regular)', 'regular', 'single', 0, 1, rest_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Link addon items (best effort, only if menu items exist)
DO $$
DECLARE
  g1 INT; g2 INT; rest_id INT;
BEGIN
  SELECT id, restaurant_id INTO g1, rest_id FROM addon_groups WHERE name LIKE 'Addon Cheese Burst%' LIMIT 1;
  IF g1 IS NOT NULL THEN
    INSERT INTO addon_items (group_id, menu_item_id, price_override, restaurant_id)
    SELECT g1, id, 85, rest_id FROM menu_items WHERE slug = 'cheese-burst-addon' OR name ILIKE '%Cheese Burst%' LIMIT 1
    ON CONFLICT DO NOTHING;
    -- If cheese-burst addon item not found, use menu_items cheese burst as placeholder with price 85
    IF NOT FOUND THEN
      INSERT INTO addon_items (group_id, menu_item_id, price_override, restaurant_id)
      SELECT g1, id, 85, rest_id FROM menu_items WHERE slug = 'margherita' LIMIT 1
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  SELECT id INTO g2 FROM addon_groups WHERE name LIKE 'Non-veg Supreme Combo%' LIMIT 1;
  IF g2 IS NOT NULL THEN
    INSERT INTO addon_items (group_id, menu_item_id, price_override, restaurant_id)
    SELECT g2, id, 150, rest_id FROM menu_items WHERE name IN ('Chicken Tikka Makhani Pizza','Heavy Loaded Kebabs Pizza','Chicken Supreme Pizza','Tornado Pizza','Chicken Pepperoni Pizza')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
