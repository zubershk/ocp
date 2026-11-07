-- ============================================================
-- Authentication hardening (Phase 4)
-- Login attempt lockout, email verification, password reset tokens
-- ============================================================

-- Login attempt tracking (per email, per restaurant)
CREATE TABLE IF NOT EXISTS customer_login_attempts (
    id               SERIAL PRIMARY KEY,
    email            VARCHAR(255) NOT NULL,
    restaurant_id    INT NOT NULL,
    attempts         INT DEFAULT 0,
    locked_until     TIMESTAMP,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_rid
    ON customer_login_attempts(email, restaurant_id);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS customer_email_verification (
    id               SERIAL PRIMARY KEY,
    email            VARCHAR(255) NOT NULL,
    restaurant_id    INT NOT NULL,
    token_hash       VARCHAR(255) NOT NULL,
    expires_at       TIMESTAMP NOT NULL,
    verified_at      TIMESTAMP,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verification_email_rid
    ON customer_email_verification(email, restaurant_id)
    WHERE verified_at IS NULL;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS customer_password_reset (
    id               SERIAL PRIMARY KEY,
    email            VARCHAR(255) NOT NULL,
    restaurant_id    INT NOT NULL,
    token_hash       VARCHAR(255) NOT NULL,
    expires_at       TIMESTAMP NOT NULL,
    used_at          TIMESTAMP,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_email_rid
    ON customer_password_reset(email, restaurant_id)
    WHERE used_at IS NULL;

-- Add password_hash and email_verified columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'whatsapp';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ALTER COLUMN whatsapp_number DROP NOT NULL;

-- Add email column to customer_sessions for email-based login sessions
ALTER TABLE customer_sessions ADD COLUMN IF NOT EXISTS email VARCHAR(255);