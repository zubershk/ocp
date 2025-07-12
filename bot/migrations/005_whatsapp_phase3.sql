-- ============================================================
-- 005_whatsapp_phase3.sql
-- WhatsApp customer conversation layer:
--   customers, whatsapp_conversations, whatsapp_cart_items
--   orders.source ('website' | 'whatsapp')
-- Idempotent; safe to run on every bot start.
-- ============================================================

-- ------------------------------------------------------------
-- 1) customers — identity = whatsapp_number
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id               SERIAL PRIMARY KEY,
    whatsapp_number  VARCHAR(20) UNIQUE NOT NULL,
    name             VARCHAR(200),
    email            VARCHAR(255),
    default_address  TEXT,
    landmark         TEXT,
    latitude         DECIMAL(10,7),
    longitude        DECIMAL(10,7),
    total_orders     INT DEFAULT 0,
    total_spent      DECIMAL(12,2) DEFAULT 0,
    first_order_at   TIMESTAMP,
    last_order_at    TIMESTAMP,
    last_seen_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_whatsapp ON customers(whatsapp_number);

-- ------------------------------------------------------------
-- 2) whatsapp_conversations — one session row per customer
--    state values: IDLE, MAIN_MENU, CATEGORY, ITEM, SIZE, CRUST,
--    QUANTITY, CART_MENU, FULFILLMENT, NAME, ADDRESS, LANDMARK,
--    PAYMENT, CONFIRMATION, HUMAN_SUPPORT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id              SERIAL PRIMARY KEY,
    customer_id     INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    state           VARCHAR(40) NOT NULL DEFAULT 'IDLE',
    context         JSONB DEFAULT '{}',
    last_message_id VARCHAR(100),
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_conv_customer ON whatsapp_conversations(customer_id);

-- ------------------------------------------------------------
-- 3) whatsapp_cart_items — variant-aware persistent cart.
--    Same pizza at different size/crust = separate lines.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_cart_items (
    id             SERIAL PRIMARY KEY,
    customer_phone VARCHAR(20) NOT NULL,
    menu_item_id   INT NOT NULL REFERENCES menu_items(id),
    size           VARCHAR(10) NOT NULL DEFAULT '',
    crust          VARCHAR(60) NOT NULL DEFAULT '',
    quantity       INT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
    unit_price     DECIMAL(10,2) NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_cart_variant
  ON whatsapp_cart_items(customer_phone, menu_item_id, size, crust);

CREATE INDEX IF NOT EXISTS idx_wa_cart_phone ON whatsapp_cart_items(customer_phone);

-- ------------------------------------------------------------
-- 4) orders.source — distinguish website vs whatsapp orders
--    (existing rows default to 'website')
-- ------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'website';
UPDATE orders SET source = 'website' WHERE source IS NULL;
