-- ============================================================
-- 032_db_correctness_indexes.sql — PR A (DB correctness + indexes)
--
-- SCOPE (deliberately narrow):
--   1. Missing indexes on hot paths + FK columns (additive only).
--   2. Tenant/sort composites for KDS, dashboard, order history.
--   3. Drops limited to indexes VERIFIED redundant against a
--      surviving unique/PK/composite leftmost (see list below).
--
-- EXPLICITLY OUT (later migrations):
--   - per-tenant uniqueness relaxations (customer_states.phone,
--     menu_items.slug, orders.order_number) — data-model decision,
--     needs stamping code first.
--   - RLS, pgx/PgBouncer, server tuning (PR C).
--
-- Notes:
--   - No CONCURRENTLY: the boot runner (database/migrate.go)
--     executes this file inside a transaction where CONCURRENTLY
--     is illegal. Tables are small (single restaurant); run
--     during low traffic once multi-tenant.
--   - Every statement is IF [NOT] EXISTS-guarded: safe to re-run
--     and safe on DBs where 021-031 applied partially.
-- ============================================================

-- ---------- P0: hot-path indexes (orders / items / events) ----------

-- Order-detail fetch + cascade delete. Previously: seq scan per order.
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

-- KDS / open-order / dashboard filters. Previously: no status index at all.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_outlet_status ON orders(outlet_id, status);

-- Order history + analytics sort. Previously: sort without index.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created ON orders(restaurant_id, created_at DESC);

-- Phone order history (menu_service GetOrdersByPhone, CustomerOrdersFor):
-- filter + sort covered by one composite.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_phone ON orders(restaurant_id, customer_phone, created_at DESC);

-- Single-tenant config lookup on every public /api/config hit.
CREATE INDEX IF NOT EXISTS idx_restaurant_config_restaurant ON restaurant_config(restaurant_id);

-- ---------- FK indexes (unindexed foreign keys) ----------

CREATE INDEX IF NOT EXISTS idx_menu_item_options_item ON menu_item_options(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_carts_menu_item ON carts(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item ON order_items(menu_item_id);
-- Nullable FKs: partial indexes stay small (most rows NULL).
CREATE INDEX IF NOT EXISTS idx_orders_discount ON orders(discount_id) WHERE discount_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_payments_receiver ON order_payments(received_by) WHERE received_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_outlets_outlet ON user_outlets(outlet_id);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by) WHERE created_by IS NOT NULL;

-- ---------- tenant/sort composites (replace single-col originals) ----------

-- Admin audit log: WHERE organization_id ORDER BY id DESC LIMIT.
CREATE INDEX IF NOT EXISTS idx_audit_org_id ON admin_audit_log(organization_id, id DESC);

-- Admin customer list: WHERE restaurant_id ORDER BY last_seen_at DESC NULLS LAST.
CREATE INDEX IF NOT EXISTS idx_customers_restaurant_seen ON customers(restaurant_id, last_seen_at DESC NULLS LAST);

-- Admin user list: WHERE organization_id ORDER BY id.
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(organization_id, id);

-- Public reviews: WHERE restaurant_id AND approved ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_approved ON reviews(restaurant_id, approved, created_at DESC);

-- ---------- hot-path expression indexes (lower() defeats B-trees) ----------

-- Domain resolver runs per public request; verified_at gate included.
CREATE INDEX IF NOT EXISTS idx_domains_lower ON domains(lower(domain)) WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurants_slug_lower ON restaurants(lower(slug));

-- ---------- verified redundant-index removals ----------
-- Each name below was confirmed in its defining migration to be an
-- exact duplicate or a leftmost-prefix of a surviving unique/PK/
-- composite. All drops are IF EXISTS.

-- Exact duplicate of UNIQUE(token) (008:24).
DROP INDEX IF EXISTS idx_customer_sessions_token;
-- Exact duplicate of UNIQUE(key_hash) (012:8).
DROP INDEX IF EXISTS idx_admin_users_key_hash;
-- Leftmost of UNIQUE(message_key, restaurant_id) (022:84).
DROP INDEX IF EXISTS idx_bot_messages_key;
-- Leftmost of UNIQUE(restaurant_id, slug) (021:55).
DROP INDEX IF EXISTS idx_outlets_restaurant;
-- Leftmost-prefix of the idx_users_org_id composite added above
-- (non-unique; covers organization_id equality).
DROP INDEX IF EXISTS idx_users_org;
-- Leftmost of UNIQUE(outlet_id, name) (023:77).
DROP INDEX IF EXISTS idx_tables_outlet;
-- Exact duplicate of UNIQUE(domain) (028:22).
DROP INDEX IF EXISTS idx_domains_domain;
-- Exact duplicate of PK(restaurant_id) (031:2).
DROP INDEX IF EXISTS idx_onboarding_restaurant;
-- Exact duplicates of partial uniques (027:133, 027:140).
DROP INDEX IF EXISTS idx_orders_restaurant_idempotency;
DROP INDEX IF EXISTS idx_order_payments_restaurant_key;
-- Prefix of idx_wa_msg_phone_created(customer_phone, created_at) (010:15).
DROP INDEX IF EXISTS idx_wa_msg_phone;
-- Prefixes of uq_processed_messages_restaurant_msg (027:219).
DROP INDEX IF EXISTS idx_processed_messages_restaurant;
DROP INDEX IF EXISTS idx_processed_messages_restaurant_msg;
-- Misnamed exact duplicate of idx_customer_otps_phone (008:18);
-- DDL is (phone) only despite the _code suffix (009:9).
DROP INDEX IF EXISTS idx_customer_otps_phone_code;
-- Prefix-redundant singles: surviving composites in 027 cover
-- restaurant_id-only equality via leftmost column.
DROP INDEX IF EXISTS idx_carts_restaurant;
DROP INDEX IF EXISTS idx_customer_states_restaurant;
DROP INDEX IF EXISTS idx_wa_cart_restaurant;
DROP INDEX IF EXISTS idx_wa_messages_restaurant;
DROP INDEX IF EXISTS idx_customer_otps_restaurant;
DROP INDEX IF EXISTS idx_customer_sessions_restaurant;
-- Replaced by composites added above (same leftmost coverage).
DROP INDEX IF EXISTS idx_orders_restaurant;
DROP INDEX IF EXISTS idx_customers_restaurant;
DROP INDEX IF EXISTS idx_reviews_restaurant;
DROP INDEX IF EXISTS idx_audit_org;
