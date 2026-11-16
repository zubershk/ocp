-- ============================================================
-- 052_broadcast_queue.sql
-- Durable, shared broadcast job queue. Replaces the in-process serial loop
-- and in-memory idempotency map so campaigns survive restarts, scale across
-- replicas, and return 202 immediately instead of blocking 60s+.
-- ============================================================

CREATE TABLE IF NOT EXISTS broadcast_jobs (
    id               BIGSERIAL PRIMARY KEY,
    restaurant_id    INT,
    org_id           INT,
    phones           JSONB NOT NULL,
    message          TEXT NOT NULL,
    image_url        TEXT,
    idempotency_base TEXT,
    status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
    total            INT NOT NULL DEFAULT 0,
    success          INT NOT NULL DEFAULT 0,
    failed           INT NOT NULL DEFAULT 0,
    results          JSONB NOT NULL DEFAULT '[]'::jsonb,
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_status ON broadcast_jobs(status, id)
  WHERE status IN ('queued','processing');

-- Per-recipient idempotency stored in DB (shared across replicas).
CREATE TABLE IF NOT EXISTS broadcast_idem (
    key         TEXT PRIMARY KEY,
    job_id      BIGINT NOT NULL REFERENCES broadcast_jobs(id) ON DELETE CASCADE,
    phone       TEXT NOT NULL,
    ok          BOOLEAN NOT NULL,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE broadcast_jobs IS 'Durable WhatsApp broadcast jobs (async queue)';
COMMENT ON TABLE broadcast_idem IS 'Cross-replica per-recipient send idempotency';
