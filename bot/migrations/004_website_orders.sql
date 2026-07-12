-- ============================================================
-- 004_website_orders.sql
-- Phase 2.2: website orders.
--
-- Extends the EXISTING orders/order_items tables (no new tables
-- for orders), adds idempotency + order-number sequence, and a
-- menu_crusts catalog so the BACKEND owns crust pricing instead
-- of trusting the client. Crust prices are the printed July 2026
-- menu values (same source as 003_website_menu.sql).
--
-- Idempotent: safe to run on every bot start.
-- ============================================================

-- ------------------------------------------------------------
-- 1) orders: email (website checkout) + Idempotency-Key support
-- ------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_key
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ------------------------------------------------------------
-- 2) Human-friendly unique order numbers: OCP-YYYYMMDD-NNNN
--    Global sequence guarantees uniqueness; date is cosmetic.
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS ocp_order_number_seq START 1;

-- ------------------------------------------------------------
-- 3) Crust catalog (backend-owned pricing)
--    Values = July 2026 printed menu / frontend data/menu.ts.
--      Tossed / Italian Thin ............ no charge (included)
--      Wheat Thin ....................... +30 R / +60 M
--      Cheese Burst ..................... +85 R / +110 M / +135 L
--      Double Cheese Crunch (DCC) ....... +120 M
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_crusts (
    id            SERIAL PRIMARY KEY,
    slug          VARCHAR(60) UNIQUE NOT NULL,
    name          VARCHAR(120) NOT NULL,
    description   TEXT,
    price_regular DECIMAL(10,2) DEFAULT 0,
    price_medium  DECIMAL(10,2) DEFAULT 0,
    price_large   DECIMAL(10,2) DEFAULT 0,
    active        BOOLEAN DEFAULT true,
    sort_order    INT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO menu_crusts (slug, name, description, price_regular, price_medium, price_large, active, sort_order) VALUES
('tossed',       'Tossed Pizza',              'Fresh dough base pizza',        0,   0,   0, true, 1),
('thin-italian', 'Italian Thin Crust',        'Fresh dough thin pizza',        0,   0,   0, true, 2),
('wheat-thin',   'Thin Crust (100% Wheat)',   'Healthy wheat base',           30,  60,   0, true, 3),
('cheese-burst', 'Cheese Burst',              'Loaded with molten cheese',    85, 110, 135, true, 4),
('dcc',          'Double Cheese Crunch (DCC)','Extra crunchy & cheesy',        0, 120,   0, true, 5)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_regular = EXCLUDED.price_regular,
  price_medium = EXCLUDED.price_medium,
  price_large = EXCLUDED.price_large,
  active = true,
  updated_at = CURRENT_TIMESTAMP;
