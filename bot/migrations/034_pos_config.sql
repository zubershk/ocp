-- 034_pos_config.sql — Admin-configurable POS foundation
-- Per-restaurant pos_config with strict validation, outlet override ready via ResolvePOSConfig(restaurantID, outletID)
-- No behavior change yet: POS still reads hardcoded defaults until PR 3 wires usePosConfig().
-- Seed for every existing restaurant on first run; new provisioning creates its own row.

-- Seed default pos_config for each existing restaurant (idempotent, ON CONFLICT DO NOTHING)
INSERT INTO site_settings (key, value, restaurant_id)
SELECT
  'pos_config',
  '{
    "order_types": [
      {"key":"dine_in","label":"Dine In","short":"Dine In","icon":"utensils","active":true,"requires_table":true,"requires_address":false},
      {"key":"delivery","label":"Delivery","short":"Delivery","icon":"bike","active":true,"requires_table":false,"requires_address":true},
      {"key":"takeaway","label":"Take Away","short":"Take Away","icon":"bag","active":true,"requires_table":false,"requires_address":false}
    ],
    "size_meta": {
      "regular": {"label":"Regular","inches":"7 Inches"},
      "medium": {"label":"Medium","inches":"10 Inches"},
      "large": {"label":"Large","inches":"13 Inches"}
    },
    "bill_rows": [
      {"key":"subtotal","label":"Sub Total","visible":true},
      {"key":"discount","label":"Discount","visible":true},
      {"key":"container","label":"Container Charge","visible":true,"editable":true,"default":0},
      {"key":"tax","label":"Tax","visible":true},
      {"key":"round_off","label":"Round Off","visible":true},
      {"key":"customer_paid","label":"Customer Paid","visible":true},
      {"key":"return_to_customer","label":"Return to Customer","visible":true},
      {"key":"tip","label":"Tip","visible":true,"editable":true,"default":0}
    ],
    "charges": {"container_default":0,"tip_enabled":true,"round_mode":"nearest","tax_source":"restaurant.tax_percent"},
    "customer_fields": {
      "phone": {"visible":true,"required":true,"for":["delivery","takeaway"]},
      "name": {"visible":true,"required":false,"for":["dine_in","delivery","takeaway"]},
      "address": {"visible":true,"required":false,"for":["delivery"]},
      "locality": {"visible":true,"required":false,"for":["delivery"]}
    },
    "features": {"bogo":false,"split_bill":false,"complimentary":true,"advance_order":true,"kot":true,"hold":true},
    "ui": {"header_title":"OCP POS","currency_symbol":"₹","pos_accent":"#b91c1c"},
    "version": 1
  }'::jsonb,
  r.id
FROM restaurants r
ON CONFLICT (key, restaurant_id) DO NOTHING;
