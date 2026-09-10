-- ============================================================
-- 024_pos_payment_idempotency.sql — PR 5 hardening (1/6)
--
-- Payment idempotency: the same payment operation must never
-- produce two ledger rows when a cashier double-clicks or the
-- browser retries after a timeout.
--
-- Reuses the orders.idempotency_key pattern from 004: a nullable
-- key with a partial UNIQUE index, checked before insert and
-- re-checked on unique-violation (concurrent duplicate race).
--
-- Also widens order_payments.method to admit 'refund': RecordRefund
-- has always written method='refund', which the 023 CHECK rejected.
--
-- IDEMPOTENT and safe to run repeatedly.
-- ============================================================

ALTER TABLE order_payments
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_payments_idempotency_key
  ON order_payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The 023 inline method CHECK was auto-named; drop it if present,
-- then re-add with 'refund' admitted.
DO $$ BEGIN
  ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_method_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_method_check'
  ) THEN
    ALTER TABLE order_payments
      ADD CONSTRAINT order_payments_method_check
      CHECK (method IN ('cash', 'upi', 'card', 'online', 'other', 'refund'));
  END IF;
END $$;
