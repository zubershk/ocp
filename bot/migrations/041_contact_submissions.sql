-- 041_contact_submissions.sql
-- Contact form submissions — stored for admin review and follow-up.
-- Captures inquiry type, priority, and message for audit trail.

CREATE TABLE IF NOT EXISTS contact_submissions (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  category      TEXT NOT NULL DEFAULT 'general',
  priority      TEXT NOT NULL DEFAULT 'normal',
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_restaurant ON contact_submissions (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions (restaurant_id, status);
