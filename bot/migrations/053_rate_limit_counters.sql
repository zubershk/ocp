-- ============================================================
-- 053_rate_limit_counters.sql
-- Shared rate-limit counters so limits hold across bot replicas.
-- Used when RATE_LIMIT_BACKEND=postgres (default in production).
-- Fixed-window counters are compact and cleaned periodically.
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key          TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    count        INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_counters(window_start);

COMMENT ON TABLE rate_limit_counters IS 'Shared (cross-replica) fixed-window rate-limit counters';
