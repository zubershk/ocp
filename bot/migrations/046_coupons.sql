-- ============================================================
-- 046_coupons.sql
-- Coupon system for promo/discount codes.
-- ============================================================

CREATE TABLE IF NOT EXISTS coupons (
    id               SERIAL PRIMARY KEY,
    restaurant_id    INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    code             VARCHAR(50) NOT NULL,
    type             VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed')),
    value            DECIMAL(10,2) NOT NULL CHECK (value >= 0),
    min_subtotal     DECIMAL(10,2) NOT NULL DEFAULT 0,
    max_discount     DECIMAL(10,2) DEFAULT NULL,
    usage_limit      INT DEFAULT NULL,
    used_count       INT NOT NULL DEFAULT 0,
    starts_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at       TIMESTAMPTZ DEFAULT NULL,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_restaurant
    ON coupons(code, restaurant_id);

CREATE INDEX IF NOT EXISTS idx_coupons_restaurant
    ON coupons(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_coupons_code_active
    ON coupons(code, restaurant_id)
    WHERE is_active = TRUE;

COMMENT ON TABLE coupons IS 'Coupon codes for discounts on orders';
COMMENT ON COLUMN coupons.code IS 'Unique coupon code (case-insensitive)';
COMMENT ON COLUMN coupons.type IS 'percentage or fixed';
COMMENT ON COLUMN coupons.value IS 'Percentage value (0-100) or fixed amount';
COMMENT ON COLUMN coupons.min_subtotal IS 'Minimum order subtotal required to apply';
COMMENT ON COLUMN coupons.max_discount IS 'Maximum discount amount (for percentage type)';
COMMENT ON COLUMN coupons.usage_limit IS 'Maximum number of times this coupon can be used (null = unlimited)';
COMMENT ON COLUMN coupons.used_count IS 'Number of times this coupon has been used';