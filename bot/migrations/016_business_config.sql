-- Migration 016: Business configuration
-- Makes sizes, payment methods, category icons, delivery fee,
-- order prefix, and other business-specific settings fully configurable.
-- Stored in site_settings as 'bot_config' key.

-- Seed bot_config with sensible defaults (only if not already present)
INSERT INTO site_settings (key, value, updated_at)
VALUES ('bot_config', '{
  "order_prefix": "ORD",
  "delivery_fee": 0,
  "min_order_amount": 0,
  "sizes": [
    {"key": "regular", "label": "Regular", "active": true},
    {"key": "medium", "label": "Medium", "active": true},
    {"key": "large", "label": "Large", "active": true}
  ],
  "payment_methods": [
    {"key": "cod", "label": "Cash on Delivery", "icon": "cash", "active": true},
    {"key": "upi", "label": "UPI", "icon": "phone", "active": true},
    {"key": "online", "label": "Online Payment", "icon": "card", "active": true}
  ],
  "category_icons": {
    "default": "🍽️"
  },
  "kitchen_hours": "11 AM - 11 PM",
  "delivery_hours": "11 AM - 4 AM",
  "business_type": "restaurant",
  "currency_symbol": "₹",
  "tax_label": "taxes included"
}', NOW())
ON CONFLICT (key) DO NOTHING;
