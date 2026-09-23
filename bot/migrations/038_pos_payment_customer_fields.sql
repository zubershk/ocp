-- 038_pos_payment_customer_fields.sql — PR #2 payment + customer-field foundations
-- Normalized payment methods (canonical for new admin/POS APIs, legacy business_config stays for compat)
-- + customer-field configuration (validation metadata only, enforcement deferred to PR #4)
-- No outlet_pos_config rows yet (ResolvePOSConfig stub stays restaurant-only).

-- ---------- restaurant_payment_methods ----------
CREATE TABLE IF NOT EXISTS restaurant_payment_methods (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  key           VARCHAR(30) NOT NULL CHECK (key ~ '^[a-z0-9_]{2,30}$'),
  label         VARCHAR(40) NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  icon          VARCHAR(40) NOT NULL DEFAULT 'cash',
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
  is_system     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (restaurant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_rpm_restaurant ON restaurant_payment_methods(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_rpm_restaurant_active ON restaurant_payment_methods(restaurant_id) WHERE active;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rpm_key_lower_check') THEN
    ALTER TABLE restaurant_payment_methods ADD CONSTRAINT rpm_key_lower_check CHECK (key = lower(key));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rpm_icon_len_check') THEN
    ALTER TABLE restaurant_payment_methods ADD CONSTRAINT rpm_icon_len_check CHECK (char_length(icon) BETWEEN 1 AND 40);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_rpm_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_rpm_updated_at ON restaurant_payment_methods;
CREATE TRIGGER trg_rpm_updated_at BEFORE UPDATE ON restaurant_payment_methods
  FOR EACH ROW EXECUTE FUNCTION set_rpm_updated_at();

-- Seed 4 system payment rails per restaurant (idempotent, ON CONFLICT DO NOTHING).
-- is_system=true means protected (cannot delete key), but active can be toggled.
INSERT INTO restaurant_payment_methods (restaurant_id, key, label, icon, active, sort_order, is_system)
SELECT r.id, v.key, v.label, v.icon, true, v.ord, true
FROM restaurants r
CROSS JOIN (VALUES
  ('cash',   'Cash',   'cash',  0),
  ('upi',    'UPI',    'phone', 1),
  ('card',   'Card',   'card',  2),
  ('online', 'Online', 'card',  3)
) AS v(key, label, icon, ord)
ON CONFLICT (restaurant_id, key) DO NOTHING;

-- ---------- pos_customer_fields ----------
CREATE TABLE IF NOT EXISTS pos_customer_fields (
  id               SERIAL PRIMARY KEY,
  restaurant_id    INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  field_key        VARCHAR(20) NOT NULL CHECK (field_key IN ('phone','name','address','locality')),
  label            VARCHAR(40) NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  visible          BOOLEAN NOT NULL DEFAULT true,
  required         BOOLEAN NOT NULL DEFAULT false,
  for_order_types  JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(for_order_types) = 'array'),
  sort_order       INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (restaurant_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_pcf_restaurant ON pos_customer_fields(restaurant_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pcf_required_visible_check') THEN
    ALTER TABLE pos_customer_fields ADD CONSTRAINT pcf_required_visible_check CHECK (required = false OR visible = true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_pcf_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_pcf_updated_at ON pos_customer_fields;
CREATE TRIGGER trg_pcf_updated_at BEFORE UPDATE ON pos_customer_fields
  FOR EACH ROW EXECUTE FUNCTION set_pcf_updated_at();

-- Seed 4 customer fields per restaurant (idempotent).
INSERT INTO pos_customer_fields (restaurant_id, field_key, label, visible, required, for_order_types, sort_order)
SELECT r.id, v.field_key, v.label, v.visible, v.required, v.for_types::jsonb, v.ord
FROM restaurants r
CROSS JOIN (VALUES
  ('phone',    'Phone',    true, true,  '["delivery","takeaway"]',               0),
  ('name',     'Name',     true, false, '["dine_in","delivery","takeaway"]',    1),
  ('address',  'Address',  true, false, '["delivery"]',                          2),
  ('locality', 'Locality', true, false, '["delivery"]',                          3)
) AS v(field_key, label, visible, required, for_types, ord)
ON CONFLICT (restaurant_id, field_key) DO NOTHING;
