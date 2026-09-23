-- 036_tables_hardening.sql — PR #2 tables operational hardening
-- Keeps pos_schema (023) tables table, adds stricter bounds, indexes, and audit fields.
-- No outlet_pos_config yet (deferred).

ALTER TABLE tables ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS sort_order_backup INTEGER;

-- Tighten capacity to 1..50 (023 was >0, now bounded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tables_capacity_range_check') THEN
    ALTER TABLE tables ADD CONSTRAINT tables_capacity_range_check CHECK (capacity BETWEEN 1 AND 50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tables_name_len_check') THEN
    ALTER TABLE tables ADD CONSTRAINT tables_name_len_check CHECK (char_length(name) BETWEEN 1 AND 40);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tables_position_range_check') THEN
    ALTER TABLE tables ADD CONSTRAINT tables_position_range_check CHECK (position BETWEEN 0 AND 999);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tables_description_len_check') THEN
    ALTER TABLE tables ADD CONSTRAINT tables_description_len_check CHECK (description IS NULL OR char_length(description) <= 500);
  END IF;
END $$;

-- Tenant-filtered indexes for POS floor queries (per spec PR #2)
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_outlet_active ON tables(restaurant_id, outlet_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_tables_outlet_position ON tables(outlet_id, position) WHERE active;
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_active_position ON tables(restaurant_id, position) WHERE active;

-- Updated_at trigger already via pos_schema? ensure it's present
CREATE OR REPLACE FUNCTION set_tables_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tables_updated_at ON tables;
CREATE TRIGGER trg_tables_updated_at BEFORE UPDATE ON tables
  FOR EACH ROW EXECUTE FUNCTION set_tables_updated_at();
