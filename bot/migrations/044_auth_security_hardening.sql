-- ============================================================
-- Authentication hardening phase 2
-- Password history, login session tracking, CSRF tokens
-- ============================================================

-- Password history to prevent reuse (keep last 5 passwords)
CREATE TABLE IF NOT EXISTS customer_password_history (
    id               SERIAL PRIMARY KEY,
    customer_id      INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    password_hash    VARCHAR(255) NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_password_history_customer
    ON customer_password_history(customer_id);

-- Login session tracking for security notifications
CREATE TABLE IF NOT EXISTS customer_login_sessions (
    id               SERIAL PRIMARY KEY,
    customer_id      INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    restaurant_id    INT NOT NULL,
    token_hash       VARCHAR(255) NOT NULL,
    ip_address       VARCHAR(45),
    user_agent       TEXT,
    country_code     CHAR(2),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at       TIMESTAMP,
    is_active        BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_customer_login_sessions_customer
    ON customer_login_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_login_sessions_token
    ON customer_login_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_customer_login_sessions_active
    ON customer_login_sessions(customer_id, is_active);

-- CSRF tokens (short-lived, per-session)
CREATE TABLE IF NOT EXISTS customer_csrf_tokens (
    id               SERIAL PRIMARY KEY,
    customer_id      INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    token_hash       VARCHAR(255) NOT NULL UNIQUE,
    expires_at       TIMESTAMP NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_csrf_tokens_customer
    ON customer_csrf_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_csrf_tokens_token
    ON customer_csrf_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_customer_csrf_tokens_expires
    ON customer_csrf_tokens(expires_at);