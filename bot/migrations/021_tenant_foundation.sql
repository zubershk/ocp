-- ============================================================
-- 021_tenant_foundation.sql — PR 1 of Phase 1 (SaaS foundation)
-- SCHEMA ONLY. No application behavior changes.
--
-- Creates: organizations, restaurants, outlets, users, roles,
-- permissions, role_permissions, user_outlets, subscriptions,
-- feature_flags. Migrates restaurant_outlets -> outlets.
-- Adds NULLABLE tenant columns (NOT NULL enforced in PR 3,
-- once app code writes them — nullable keeps current INSERTs
-- working untouched).
--
-- Scope model (deliberate split):
--   restaurant-scoped: menu, customers, reviews, settings, pages,
--     bot messages, branding, campaigns (definitions, CRM)
--   outlet-scoped: orders (+ assignment), tables, KDS, staff
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- ============================================================

-- ---------- core tenant tables ----------

CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restaurants (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  slug            VARCHAR(100) NOT NULL,
  currency        VARCHAR(10) NOT NULL DEFAULT 'INR',
  timezone        VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS outlets (
  id              SERIAL PRIMARY KEY,
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  slug            VARCHAR(100) NOT NULL,
  address_lines   TEXT[] DEFAULT '{}',
  phones          TEXT[] DEFAULT '{}',
  delivery_hours  VARCHAR(120) DEFAULT '',
  online_ordering BOOLEAN NOT NULL DEFAULT true,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL DEFAULT '',
  key_hash        VARCHAR(200) UNIQUE NOT NULL,
  role            VARCHAR(40) NOT NULL DEFAULT 'viewer',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS roles (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(40) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  is_system       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(80) UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_outlets (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outlet_id INTEGER NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, outlet_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan            VARCHAR(40) NOT NULL DEFAULT 'free',
  status          VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             VARCHAR(80) NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, key)
);

-- ---------- seed: OCP organization / restaurant ----------

INSERT INTO organizations (name, slug)
VALUES ('Orange Cheese Pizza', 'ocp')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO restaurants (organization_id, name, slug, currency, timezone)
SELECT id, 'Orange Cheese Pizza', 'ocp', 'INR', 'Asia/Kolkata' FROM organizations WHERE slug = 'ocp'
ON CONFLICT (organization_id, slug) DO NOTHING;

-- ---------- migrate restaurant_outlets -> outlets ----------

INSERT INTO outlets (restaurant_id, name, slug, address_lines, phones, delivery_hours, online_ordering, active, sort_order)
SELECT r.id, ro.name, ro.slug, ro.address_lines, ro.phones, ro.delivery_hours, ro.online_ordering, ro.active, ro.sort_order
FROM restaurant_outlets ro
CROSS JOIN restaurants r
JOIN organizations o ON o.id = r.organization_id
WHERE o.slug = 'ocp' AND r.slug = 'ocp'
ON CONFLICT (restaurant_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  address_lines = EXCLUDED.address_lines,
  phones = EXCLUDED.phones,
  delivery_hours = EXCLUDED.delivery_hours,
  online_ordering = EXCLUDED.online_ordering,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- Fresh installs (no outlets yet): bootstrap a main outlet so the product boots.
INSERT INTO outlets (restaurant_id, name, slug, active, sort_order)
SELECT r.id, 'Main Outlet', 'main', true, 0 FROM restaurants r
JOIN organizations o ON o.id = r.organization_id
WHERE o.slug = 'ocp' AND r.slug = 'ocp'
  AND NOT EXISTS (SELECT 1 FROM outlets WHERE restaurant_id = r.id)
ON CONFLICT (restaurant_id, slug) DO NOTHING;

-- ---------- migrate admin_users -> users ----------

INSERT INTO users (organization_id, name, key_hash, role, active, created_at, last_seen_at)
SELECT o.id, au.name, au.key_hash, au.role, au.active, au.created_at, au.last_seen_at
FROM admin_users au
CROSS JOIN organizations o
WHERE o.slug = 'ocp'
ON CONFLICT (key_hash) DO NOTHING;

-- ---------- seed permissions ----------

INSERT INTO permissions (key, description) VALUES
  ('orders.view', 'View orders'),
  ('orders.create', 'Create orders (incl. POS)'),
  ('orders.update', 'Confirm / advance / complete orders'),
  ('orders.cancel', 'Cancel orders'),
  ('orders.refund', 'Refund orders'),
  ('menu.view', 'View menu catalog'),
  ('menu.update', 'Create / edit / delete menu items, categories, crusts'),
  ('customers.view', 'View customers and order history'),
  ('chat.view', 'View WhatsApp conversations'),
  ('chat.send', 'Reply to WhatsApp conversations'),
  ('broadcast.send', 'Send bulk WhatsApp campaigns'),
  ('reviews.view', 'View customer reviews'),
  ('reviews.moderate', 'Approve / hide reviews'),
  ('reports.view', 'View analytics and reports'),
  ('settings.view', 'View restaurant settings'),
  ('settings.update', 'Edit settings, brand, pages, offers, banners'),
  ('bot.update', 'Edit WhatsApp bot messages'),
  ('config.update', 'Edit business configuration'),
  ('team.manage', 'Manage users and roles'),
  ('audit.view', 'View audit log'),
  ('pos.access', 'Use the POS terminal'),
  ('kds.access', 'Use the kitchen display'),
  ('api.access', 'Use API keys and webhooks')
ON CONFLICT (key) DO NOTHING;

-- ---------- seed system roles + presets (per organization) ----------

INSERT INTO roles (organization_id, name, description, is_system)
SELECT o.id, x.name, x.description, true FROM organizations o
CROSS JOIN (VALUES
  ('owner', 'Full access to everything'),
  ('manager', 'Everything except team management'),
  ('kitchen', 'Orders + chats, kitchen display'),
  ('cashier', 'POS terminal + order lookup'),
  ('viewer', 'Read-only dashboards')
) AS x(name, description)
WHERE o.slug = 'ocp'
ON CONFLICT (organization_id, name) DO NOTHING;

-- owner: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN organizations o ON o.id = r.organization_id
CROSS JOIN permissions p
WHERE o.slug = 'ocp' AND r.name = 'owner' AND r.is_system
ON CONFLICT DO NOTHING;

-- manager: everything except team.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN organizations o ON o.id = r.organization_id
JOIN permissions p ON p.key != 'team.manage'
WHERE o.slug = 'ocp' AND r.name = 'manager' AND r.is_system
ON CONFLICT DO NOTHING;

-- kitchen: orders view/update, chat view, kds
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN organizations o ON o.id = r.organization_id
JOIN permissions p ON p.key IN ('orders.view', 'orders.update', 'chat.view', 'kds.access')
WHERE o.slug = 'ocp' AND r.name = 'kitchen' AND r.is_system
ON CONFLICT DO NOTHING;

-- cashier: POS + order lookup/create
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN organizations o ON o.id = r.organization_id
JOIN permissions p ON p.key IN ('pos.access', 'orders.view', 'orders.create', 'orders.update', 'menu.view', 'customers.view')
WHERE o.slug = 'ocp' AND r.name = 'cashier' AND r.is_system
ON CONFLICT DO NOTHING;

-- viewer: read-only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN organizations o ON o.id = r.organization_id
JOIN permissions p ON p.key IN ('orders.view', 'menu.view', 'customers.view', 'reports.view', 'reviews.view', 'settings.view')
WHERE o.slug = 'ocp' AND r.name = 'viewer' AND r.is_system
ON CONFLICT DO NOTHING;

-- ---------- subscriptions + feature flags ----------

INSERT INTO subscriptions (organization_id, plan, status)
SELECT id, 'free', 'active' FROM organizations WHERE slug = 'ocp'
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO feature_flags (organization_id, key, enabled)
SELECT o.id, x.key, x.enabled FROM organizations o
CROSS JOIN (VALUES ('pos', false), ('kds', false), ('multi_outlet', true)) AS x(key, enabled)
WHERE o.slug = 'ocp'
ON CONFLICT (organization_id, key) DO NOTHING;

-- ---------- tenant columns (NULLABLE — enforced in PR 3) ----------

-- restaurant-scoped: menu, CRM, content, settings
ALTER TABLE menu_items       ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE menu_categories  ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE menu_crusts      ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE customers        ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE reviews          ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE site_settings    ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE site_pages       ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE bot_messages     ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE restaurant_config ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);

-- outlet-scoped: orders (assignment lives here; lines inherit via parent).
-- NOTE: order_items.outlet_id is intentionally NOT stored — outlet is
-- always inherited through the parent order. Storing it would create
-- redundant state that can disagree with orders.outlet_id.
ALTER TABLE orders      ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
ALTER TABLE orders      ADD COLUMN IF NOT EXISTS outlet_id INTEGER REFERENCES outlets(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant      ON menu_items (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_crusts_restaurant     ON menu_crusts (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_restaurant       ON customers (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant         ON reviews (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_site_settings_restaurant   ON site_settings (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_site_pages_restaurant      ON site_pages (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bot_messages_restaurant    ON bot_messages (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant          ON orders (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_outlet              ON orders (outlet_id);
CREATE INDEX IF NOT EXISTS idx_order_items_restaurant     ON order_items (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_users_org                  ON users (organization_id);
CREATE INDEX IF NOT EXISTS idx_outlets_restaurant         ON outlets (restaurant_id);

-- ---------- backfill everything to the OCP tenant ----------

DO $$
DECLARE
  v_restaurant_id INT;
  v_outlet_id INT;
BEGIN
  SELECT r.id INTO v_restaurant_id FROM restaurants r
  JOIN organizations o ON o.id = r.organization_id
  WHERE o.slug = 'ocp' AND r.slug = 'ocp';

  -- Historical orders without outlet information are assigned to the
  -- first active outlet by sort order. This is a migration fallback only.
  -- New orders must always receive an explicit outlet_id.
  SELECT id INTO v_outlet_id FROM outlets
  WHERE restaurant_id = v_restaurant_id AND active = true
  ORDER BY sort_order, id LIMIT 1;

  UPDATE menu_items       SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE menu_categories  SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE menu_crusts      SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE customers        SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE reviews          SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE site_settings    SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE site_pages       SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE bot_messages     SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE restaurant_config SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE orders           SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE order_items      SET restaurant_id = v_restaurant_id WHERE restaurant_id IS NULL;
  UPDATE orders           SET outlet_id = v_outlet_id WHERE outlet_id IS NULL AND v_outlet_id IS NOT NULL;
END $$;
