-- ============================================================
-- 019_reviews.sql
-- Verified-purchase reviews: customers rate delivered orders
-- (overall + optional per-item stars). Reviews are moderated
-- (approved flag) before going public.
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_slug     TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  approved      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One review per order per item ('' = overall order review).
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_item_uniq
  ON reviews(order_id, item_slug);

CREATE INDEX IF NOT EXISTS reviews_approved_idx
  ON reviews(approved, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_item_idx
  ON reviews(item_slug, approved);
