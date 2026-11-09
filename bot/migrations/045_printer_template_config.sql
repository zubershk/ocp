-- ============================================================
-- Printer Template Config
-- Stores per-restaurant receipt template configuration
-- in site_settings table (key: 'printer_template_config')
-- Same pattern as pos_config / offers / banners.
-- ============================================================

-- No separate table needed — uses site_settings with upsert pattern.
-- This migration is a no-op placeholder for schema version tracking.
-- The actual storage uses INSERT ... ON CONFLICT in SavePrinterTemplateConfig.

-- Add index for faster lookups on site_settings (if not already present)
CREATE INDEX IF NOT EXISTS idx_site_settings_key_restaurant
    ON site_settings(key, restaurant_id);

COMMENT ON TABLE site_settings IS 'Stores per-restaurant configuration including printer_template_config';
