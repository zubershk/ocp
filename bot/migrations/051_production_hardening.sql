-- ============================================================
-- 051_production_hardening.sql
-- Production hardening of the data model discovered during audit:
--   D1: per-tenant unique email (global unique blocked multi-tenant signup)
--   D2: FK constraints on auth tables carrying restaurant_id
--   D3: NOT NULL on backfilled tenant columns
--   D4: stronger CHECK constraints on coupons
-- All statements are idempotent / defensive so they are safe to apply to
-- databases of any age (001..050) and on fresh installs.
-- ============================================================

-- ---------- D1: per-tenant unique email ----------
-- The old index idx_customers_email ON customers(email) prevented the same
-- email from registering at two restaurants. Replace it with a composite,
-- case-insensitive partial unique index scoped to the tenant.
DROP INDEX IF EXISTS idx_customers_email;
-- Remove duplicate (restaurant_id, lower(email)) rows, keeping the oldest.
-- This only affects data created while the old (global) index was absent.
DELETE FROM customers a USING customers b
 WHERE a.id > b.id
   AND a.restaurant_id IS NOT DISTINCT FROM b.restaurant_id
   AND lower(a.email) = lower(b.email)
   AND a.email IS NOT NULL AND a.email != '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_email
  ON customers(restaurant_id, lower(email))
  WHERE email IS NOT NULL AND email != '';

-- ---------- D2: FKs on auth tables ----------
-- Add restaurant_id FK where missing (guarded by catalog lookup so a
-- pre-existing differently-named constraint is not duplicated).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'customer_login_attempts','customer_email_verification',
      'customer_password_reset','customer_login_sessions',
      'customer_otps','customer_sessions'
    ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
       WHERE tc.table_name = t
         AND tc.constraint_type = 'FOREIGN KEY'
         AND tc.constraint_name = 'fk_' || t || '_restaurant'
    ) THEN
      -- Drop rows pointing at a deleted tenant before adding the constraint.
      EXECUTE format(
        'DELETE FROM %I WHERE restaurant_id IS NOT NULL AND restaurant_id NOT IN (SELECT id FROM restaurants)', t);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE',
        t, 'fk_' || t || '_restaurant');
    END IF;
  END LOOP;
END $$;

-- ---------- D3: NOT NULL on backfilled tenant columns ----------
-- Only set NOT NULL when no NULLs remain; log-and-skip otherwise so a bad
-- row does not brick a deployment. Legacy single-tenant rows were backfilled
-- in 027; anything still NULL is assigned the bootstrap restaurant first.
DO $$
DECLARE v_rest_id INT;
        t text;
        n bigint;
BEGIN
  SELECT id INTO v_rest_id FROM restaurants ORDER BY id LIMIT 1;
  IF v_rest_id IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY[
        'carts','customer_states','whatsapp_cart_items',
        'whatsapp_conversations','whatsapp_messages',
        'customer_otps','customer_sessions','processed_messages'
      ]
    LOOP
      EXECUTE format('UPDATE %I SET restaurant_id = $1 WHERE restaurant_id IS NULL', t) USING v_rest_id;
    END LOOP;
  END IF;
  FOREACH t IN ARRAY ARRAY[
      'carts','customer_states','whatsapp_cart_items',
      'whatsapp_conversations','whatsapp_messages',
      'customer_otps','customer_sessions','processed_messages'
    ]
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE restaurant_id IS NULL', t) INTO n;
    IF n = 0 THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN restaurant_id SET NOT NULL', t);
    ELSE
      RAISE NOTICE '051: % has % NULL restaurant_id rows; leaving nullable', t, n;
    END IF;
  END LOOP;
END $$;

-- ---------- D4: stronger coupon checks ----------
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS ck_coupon_percentage_range;
ALTER TABLE coupons ADD CONSTRAINT ck_coupon_percentage_range
  CHECK (type <> 'percentage' OR value <= 100);
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS ck_coupon_used_nonneg;
ALTER TABLE coupons ADD CONSTRAINT ck_coupon_used_nonneg CHECK (used_count >= 0);
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS ck_coupon_window;
ALTER TABLE coupons ADD CONSTRAINT ck_coupon_window
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at);

COMMENT ON INDEX uq_customers_tenant_email IS 'One email per tenant (case-insensitive)';
