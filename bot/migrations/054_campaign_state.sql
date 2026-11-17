-- Durable, shared state for the campaign runner. One row per store name
-- (settings, customers, campaigns, ...) replaces the per-replica data/*.json
-- files, so restarts and multiple runner replicas neither lose state nor
-- duplicate sends. PII stores are stored encrypted by the runner.
CREATE TABLE IF NOT EXISTS campaign_state (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE campaign_state IS 'Shared key/value state for the campaign runner (replaces local JSON files).';
COMMENT ON COLUMN campaign_state.updated_at IS 'Last write time; runner replicas use it to refresh their in-memory cache.';
