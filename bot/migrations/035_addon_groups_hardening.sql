-- 035_addon_groups_hardening.sql — PR #2 addon foundation hardening
-- Keep addon_groups.menu_item_id NOT NULL (033 invariant) + add junction for future reuse.
-- Validates min/max, single=>max=1, adds indexes, description, updated_at, and tenant-safe junction.

-- ---------- addon_groups hardening ----------
ALTER TABLE addon_groups ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE addon_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill updated_at for existing rows (if column was added without default on some PG versions)
UPDATE addon_groups SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;

-- Add min/max consistency checks (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addon_groups_minmax_check') THEN
    ALTER TABLE addon_groups ADD CONSTRAINT addon_groups_minmax_check CHECK (max_select >= min_select);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addon_groups_single_max_check') THEN
    ALTER TABLE addon_groups ADD CONSTRAINT addon_groups_single_max_check CHECK (selection_type <> 'single' OR max_select = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addon_groups_min_range_check') THEN
    ALTER TABLE addon_groups ADD CONSTRAINT addon_groups_min_range_check CHECK (min_select BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addon_groups_max_range_check') THEN
    ALTER TABLE addon_groups ADD CONSTRAINT addon_groups_max_range_check CHECK (max_select BETWEEN 1 AND 20);
  END IF;
END $$;

-- Name length guard
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addon_groups_name_len_check') THEN
    ALTER TABLE addon_groups ADD CONSTRAINT addon_groups_name_len_check CHECK (char_length(name) BETWEEN 1 AND 200);
  END IF;
END $$;

-- Per-restaurant unique on (restaurant, menu_item, name) — idempotent index
CREATE UNIQUE INDEX IF NOT EXISTS uq_addon_groups_restaurant_item_name ON addon_groups(restaurant_id, menu_item_id, name);

-- Tenant-filtered indexes for active groups (pos catalog queries)
CREATE INDEX IF NOT EXISTS idx_addon_groups_restaurant_active ON addon_groups(restaurant_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_addon_groups_item_active ON addon_groups(menu_item_id) WHERE active;

-- Updated_at trigger (idempotent)
CREATE OR REPLACE FUNCTION set_addon_groups_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_addon_groups_updated_at ON addon_groups;
CREATE TRIGGER trg_addon_groups_updated_at BEFORE UPDATE ON addon_groups
  FOR EACH ROW EXECUTE FUNCTION set_addon_groups_updated_at();

-- ---------- addon_items hardening ----------
ALTER TABLE addon_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE addon_items SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addon_items_price_check') THEN
    ALTER TABLE addon_items ADD CONSTRAINT addon_items_price_check CHECK (price_override IS NULL OR price_override >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addon_items_price_max_check') THEN
    ALTER TABLE addon_items ADD CONSTRAINT addon_items_price_max_check CHECK (price_override IS NULL OR price_override <= 10000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_addon_items_restaurant ON addon_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_addon_items_group_active ON addon_items(group_id) WHERE active;

CREATE OR REPLACE FUNCTION set_addon_items_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_addon_items_updated_at ON addon_items;
CREATE TRIGGER trg_addon_items_updated_at BEFORE UPDATE ON addon_items
  FOR EACH ROW EXECUTE FUNCTION set_addon_items_updated_at();

-- ---------- junction for reuse (future, optional in PR #2) ----------
-- Allows one addon_group to be reused across multiple menu_items without dropping the item-scoped FK.
-- PR #2 does not require populating this table; it only establishes the extension point.
CREATE TABLE IF NOT EXISTS item_addon_groups (
  menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  addon_group_id INTEGER NOT NULL REFERENCES addon_groups(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (menu_item_id, addon_group_id)
);

CREATE INDEX IF NOT EXISTS idx_item_addon_groups_group ON item_addon_groups(addon_group_id);
CREATE INDEX IF NOT EXISTS idx_item_addon_groups_restaurant ON item_addon_groups(restaurant_id);

-- Tenant consistency guard: junction restaurant must match both sides — enforced best-effort via trigger
CREATE OR REPLACE FUNCTION check_item_addon_groups_tenant() RETURNS TRIGGER AS $$
DECLARE
  g_rest INT;
  m_rest INT;
BEGIN
  SELECT restaurant_id INTO g_rest FROM addon_groups WHERE id = NEW.addon_group_id;
  SELECT restaurant_id INTO m_rest FROM menu_items WHERE id = NEW.menu_item_id;
  IF g_rest IS NULL OR m_rest IS NULL OR g_rest <> NEW.restaurant_id OR m_rest <> NEW.restaurant_id THEN
    RAISE EXCEPTION 'item_addon_groups tenant mismatch: junction restaurant_id must match both menu_item and addon_group (%)', NEW.restaurant_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_item_addon_groups_tenant ON item_addon_groups;
CREATE TRIGGER trg_item_addon_groups_tenant BEFORE INSERT OR UPDATE ON item_addon_groups
  FOR EACH ROW EXECUTE FUNCTION check_item_addon_groups_tenant();
