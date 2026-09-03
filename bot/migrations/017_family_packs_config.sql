-- ============================================================
-- 017_family_packs_config.sql
-- Creates the empty offers-page config structure
-- (promo card + pack list) in site_settings so it is editable
-- from the admin panel from day one.
--
-- Intentionally EMPTY: this is open-source SaaS — every
-- business enters its own content via admin. No business-
-- specific content belongs in seeds.
--
-- Prices/descriptions stay live from menu items; this stores
-- titles, subtitles, slugs and active flags only.
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- ============================================================

INSERT INTO site_settings (key, value) VALUES ('family_packs', '{
  "bogo": {
    "title": "",
    "subtitle": "",
    "description": "",
    "pricing": "",
    "active": false
  },
  "packs": []
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
