-- ============================================================
-- 008_customer_auth.sql
-- Customer web auth synced to WhatsApp via phone:
--   customer_otps (WhatsApp OTP, 5m expiry, 3 attempts)
--   customer_sessions (opaque token, 90d expiry)
--   customers.phone normalized to 91-prefixed digits for WA dest
-- Idempotent; safe to run on every bot start.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_otps (
    id         SERIAL PRIMARY KEY,
    phone      VARCHAR(20) NOT NULL,
    code       VARCHAR(10) NOT NULL,
    attempts   INT DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_otps_phone ON customer_otps(phone);
CREATE INDEX IF NOT EXISTS idx_customer_otps_expires ON customer_otps(expires_at);

CREATE TABLE IF NOT EXISTS customer_sessions (
    id         SERIAL PRIMARY KEY,
    phone      VARCHAR(20) NOT NULL,
    token      VARCHAR(96) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(token);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_phone ON customer_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires ON customer_sessions(expires_at);
