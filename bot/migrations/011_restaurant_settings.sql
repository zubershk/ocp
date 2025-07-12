-- 011_restaurant_settings.sql — SaaS settings for OCP dashboard
-- Outlets per-tenant + ensure restaurant_config has row. Idempotent.

CREATE TABLE IF NOT EXISTS restaurant_outlets (
    id               SERIAL PRIMARY KEY,
    slug             VARCHAR(60) UNIQUE NOT NULL,
    name             VARCHAR(120) NOT NULL,
    address_lines    TEXT[] DEFAULT '{}',
    phones           TEXT[] DEFAULT '{}',
    delivery_hours   VARCHAR(60) DEFAULT '11:00 AM to 04:00 AM',
    online_ordering  BOOLEAN DEFAULT true,
    active           BOOLEAN DEFAULT true,
    sort_order       INT DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed OCP outlets (match frontend/src/data/outlets.ts) — idempotent
INSERT INTO restaurant_outlets (slug, name, address_lines, phones, delivery_hours, online_ordering, sort_order, active) VALUES
('mira-road', 'Mira Road East',
 ARRAY['Shop 21, B Wing, Winstone PNK','next to Pinna Cola Building','Beverly Park, Mira Road East','Thane, Maharashtra 401107'],
 ARRAY['8369293998','8591683998','8591983998'], '11:00 AM to 04:00 AM', true, 1, true),
('vasai-west', 'Vasai West',
 ARRAY['Shop No. 1 & 3, Opal Fairybell','Bhabola Chulna Road, Suyog Nagar','Vasai West, Palghar','Maharashtra 401201'],
 ARRAY['9665043998','9156043998'], '11:00 AM to 04:00 AM', false, 2, true),
('bhayandar-west', 'Bhayandar West',
 ARRAY['Shop No. 11, OM Hema Residency','Opposite Narayana E-Techno School','Burhani Nagar, Bhayandar West','Mira Bhayandar, Maharashtra 401101'],
 ARRAY['8591643998'], '11:00 AM to 04:00 AM', false, 3, true)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, address_lines=EXCLUDED.address_lines, phones=EXCLUDED.phones,
  delivery_hours=EXCLUDED.delivery_hours, online_ordering=EXCLUDED.online_ordering, active=true;

-- Ensure single restaurant_config row exists (used by Settings page)
INSERT INTO restaurant_config (name, phone, address, map_url, opening_hours, delivery_area, payment_info, support_phone)
SELECT 'Orange Cheese Pizza','8369293998','Shop 21, B Wing, Winstone PNK, Beverly Park, Mira Road East','',
       '{"hours":"11:00 AM to 04:00 AM"}'::jsonb,'{}'::jsonb,'{"delivery_fee":0}'::jsonb,'8369293998'
WHERE NOT EXISTS (SELECT 1 FROM restaurant_config);
