-- ============================================================
-- 006_order_access_token.sql
-- Phase 4 security fix (IDOR): public order lookup now requires a
-- per-order random access token. Tokens are issued once at creation
-- and returned in the POST /api/orders response only.
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS access_token VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_orders_access_token ON orders(access_token);
