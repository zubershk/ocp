-- 010_live_chat.sql — Live chat history for bot dashboard
-- Stores every inbound/outbound WhatsApp message per customer phone
-- for the OCP live chat board. Idempotent.

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id             SERIAL PRIMARY KEY,
    customer_phone VARCHAR(20) NOT NULL,
    direction      VARCHAR(10) NOT NULL CHECK (direction IN ('in','out')),
    body           TEXT NOT NULL,
    message_id     VARCHAR(100),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wa_msg_phone ON whatsapp_messages(customer_phone);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created ON whatsapp_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_wa_msg_phone_created ON whatsapp_messages(customer_phone, created_at);
