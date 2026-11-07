-- ============================================================
-- Email + password authentication (hybrid with WhatsApp phone sync)
-- Adds password_hash to customers, makes whatsapp_number nullable
-- for email-only registrations.
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'whatsapp';
ALTER TABLE customers ALTER COLUMN whatsapp_number DROP NOT NULL;

-- Unique email index (only for non-null, non-empty emails)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL AND email != '';

-- Index for fast email lookup
CREATE INDEX IF NOT EXISTS idx_customers_email_lookup ON customers(email);