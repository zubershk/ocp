-- 009_auth_hash.sql — harden OTP/sessions (hash instead of plaintext)
-- OTP code is now SHA256 hex (64 chars); token is SHA256 hex (64 chars).
-- Widen columns for hash storage; existing plaintext rows (if any) remain readable
-- until naturally expired/cleaned. Idempotent.

ALTER TABLE customer_otps ALTER COLUMN code TYPE VARCHAR(128);
ALTER TABLE customer_sessions ALTER COLUMN token TYPE VARCHAR(128);
-- Ensure indexes still exist for hashed lookups (hash is deterministic, equality still works)
CREATE INDEX IF NOT EXISTS idx_customer_otps_phone_code ON customer_otps(phone);
