-- POS Printer Configuration per restaurant
-- Stores printer connection details and auto-print preference in site_settings as JSONB,
-- keyed 'printer_config' (consistent with pos_config, offers, banners pattern).
--
-- Table stores a canonical copy for queries; site_settings holds the runtime JSON.
-- The Go service reads from site_settings key='printer_config' per restaurant_id.

CREATE TABLE IF NOT EXISTS pos_printer_config (
    id               SERIAL PRIMARY KEY,
    restaurant_id    INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    printer_type     VARCHAR(20) NOT NULL DEFAULT 'none',   -- none | usb | network | browser | virtual
    printer_port     VARCHAR(64),                           -- COM3 or 192.168.1.50
    printer_port_num INTEGER DEFAULT 9100,                  -- TCP port for network/virtual
    paper_width      INTEGER DEFAULT 58,                    -- 58 or 80 mm
    auto_print       BOOLEAN NOT NULL DEFAULT FALSE,        -- print on new online order
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_printer_config_restaurant ON pos_printer_config(restaurant_id);

-- Seed default (disabled) row for existing restaurants only when missing.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM restaurants LOOP
    INSERT INTO pos_printer_config (restaurant_id, printer_type, printer_port, printer_port_num, paper_width, auto_print)
    VALUES (r.id, 'none', NULL, 9100, 58, FALSE)
    ON CONFLICT (restaurant_id) DO NOTHING;
  END LOOP;
END $$;

-- Ensure new restaurants get a default row via trigger (idempotent).
CREATE OR REPLACE FUNCTION fn_ensure_pos_printer_config()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pos_printer_config (restaurant_id, printer_type, printer_port, printer_port_num, paper_width, auto_print)
  VALUES (NEW.id, 'none', NULL, 9100, 58, FALSE)
  ON CONFLICT (restaurant_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_pos_printer_config ON restaurants;
CREATE TRIGGER trg_ensure_pos_printer_config
AFTER INSERT ON restaurants
FOR EACH ROW EXECUTE FUNCTION fn_ensure_pos_printer_config();
