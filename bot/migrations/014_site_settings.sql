-- 014: Site settings — brand config, pages content, offers, banners
-- All-in-one configurable SaaS settings

-- Brand settings (colors, logo, social, SEO, footer, notifications)
CREATE TABLE IF NOT EXISTS site_settings (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults
INSERT INTO site_settings (key, value) VALUES
  ('brand', '{
    "logo_url": "",
    "favicon_url": "",
    "primary_color": "#ea580c",
    "secondary_color": "#1c1917",
    "accent_color": "#f59e0b",
    "font_heading": "Outfit",
    "font_body": "Inter"
  }'::jsonb),
  ('seo', '{
    "meta_title": "",
    "meta_description": "",
    "og_image_url": "",
    "favicon_url": ""
  }'::jsonb),
  ('social', '{
    "instagram": "",
    "facebook": "",
    "twitter": "",
    "youtube": "",
    "whatsapp": ""
  }'::jsonb),
  ('footer', '{
    "copyright_text": "",
    "tagline": "100% Real Mozzarella · All prices include tax",
    "extra_links": []
  }'::jsonb),
  ('notifications', '{
    "order_confirmation": "Your order {order_number} has been placed! We are preparing it now.",
    "order_confirmed": "Great news! Your order {order_number} has been confirmed and is being prepared.",
    "order_ready": "Your order {order_number} is ready! Our delivery partner is on the way.",
    "order_delivered": "Your order {order_number} has been delivered. Enjoy your meal!",
    "order_cancelled": "Your order {order_number} has been cancelled. Contact us if you have questions."
  }'::jsonb),
  ('pages', '{
    "about_title": "Our Story",
    "about_content": "",
    "terms_content": "",
    "privacy_content": "",
    "faq_items": []
  }'::jsonb),
  ('offers', '[]'::jsonb),
  ('banners', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Add image_url to menu_categories if missing (table may already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='menu_categories' AND column_name='image_url'
  ) THEN
    ALTER TABLE menu_categories ADD COLUMN image_url TEXT DEFAULT '';
  END IF;
END $$;

-- Pages content (CMS-like)
CREATE TABLE IF NOT EXISTS site_pages (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  meta_title  TEXT DEFAULT '',
  meta_desc   TEXT DEFAULT '',
  published   BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
