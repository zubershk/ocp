-- ============================================================
-- 028_domains.sql — Phase 2: domain / storefront routing
--
-- tenant resolver needs a canonical Host -> restaurant mapping.
-- Supports:
--   restaurant.ocp.app (subdomain)
--   www.restaurant.com (custom, verified)
--   /r/:slug fallback for local dev (no DB row needed)
--
-- Domains are globally unique (DNS), verified flag gates
-- resolution priority: verified custom > verified subdomain > unverified (not served).
-- ============================================================

CREATE TABLE IF NOT EXISTS domains (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  domain        VARCHAR(253) NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (domain)
);
CREATE INDEX IF NOT EXISTS idx_domains_restaurant ON domains(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE UNIQUE INDEX IF NOT EXISTS uq_domains_restaurant_primary ON domains(restaurant_id) WHERE is_primary = true;

-- seed primary domain for bootstrap restaurant so local dev works without manual row
DO $$
DECLARE v_rest_id INT;
  v_slug TEXT;
BEGIN
  SELECT id, slug INTO v_rest_id, v_slug FROM restaurants WHERE slug='ocp' LIMIT 1;
  IF v_rest_id IS NOT NULL THEN
    INSERT INTO domains (restaurant_id, domain, is_primary, verified_at)
    VALUES (v_rest_id, v_slug || '.ocp.app', true, CURRENT_TIMESTAMP)
    ON CONFLICT (domain) DO NOTHING;
  END IF;
END $$;

-- helper for updated_at
DO $$ BEGIN
  CREATE OR REPLACE FUNCTION set_domains_updated_at() RETURNS TRIGGER AS $f$
  BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $f$ LANGUAGE plpgsql;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS trg_domains_updated ON domains;
CREATE TRIGGER trg_domains_updated BEFORE UPDATE ON domains FOR EACH ROW EXECUTE FUNCTION set_domains_updated_at();
