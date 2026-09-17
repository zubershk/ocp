-- 031_onboarding_progress.sql — onboarding wizard server-authoritative state
CREATE TABLE IF NOT EXISTS onboarding_progress (
  restaurant_id   INTEGER PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  current_step    TEXT NOT NULL DEFAULT 'business_info',
  completed_steps TEXT[] NOT NULL DEFAULT '{}',
  data            JSONB NOT NULL DEFAULT '{}',
  is_complete     BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_onboarding_restaurant ON onboarding_progress(restaurant_id);
