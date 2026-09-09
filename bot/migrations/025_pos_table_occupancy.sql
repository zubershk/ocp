-- ============================================================
-- 025_pos_table_occupancy.sql — PR 5 hardening (5/6)
--
-- Table concurrency: two POS terminals must never both claim the
-- same table. The application uses conditional updates and
-- SELECT ... FOR UPDATE (see table_service.go), and this index is
-- the database-level backstop: at most one open order per table.
--
-- Completed/cancelled orders are excluded so history never blocks
-- reuse. IDEMPOTENT and safe to run repeatedly.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_open_order_per_table
  ON orders(table_id)
  WHERE table_id IS NOT NULL
    AND status NOT IN ('completed', 'cancelled');
