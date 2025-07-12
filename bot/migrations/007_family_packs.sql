-- ============================================================
-- 007_family_packs.sql
-- Makes the printed July 2026 Family Packs real, cart-orderable
-- menu items (they were previously phone/WhatsApp-only offers).
--
-- Prices match the printed offers exactly (tax inclusive):
--   FP1 Regular  : Veg 515  / Non-Veg 625
--   FP2 Regular  : Veg 640  / Non-Veg 720
--   FP3 Medium   : Veg 1025 / Non-Veg 1200
--   FP4 Medium   : Veg 1120 / Non-Veg 1380
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- ============================================================

INSERT INTO menu_categories (name, slug, description, sort_order, active) VALUES
('Family Packs', 'family-packs', 'Complete family meals - pizzas, garlic bread & choco lava cake', 13, true)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order  = EXCLUDED.sort_order,
  active      = true,
  updated_at  = CURRENT_TIMESTAMP;

INSERT INTO menu_items
  (category_id, name, slug, description, price, image_url, dietary, available, active, sort_order)
VALUES
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 1 - Veg',
 'fp-1-veg',
 '2 Regular Veg Pizzas + Garlic Breadstick + Choco Lava Cake. Serves 3-4.',
 515,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-1-veg',
 'veg', true, true, 1),
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 1 - Non-Veg',
 'fp-1-nonveg',
 '2 Regular Pizzas (any non-veg) + Garlic Breadstick + Choco Lava Cake. Serves 3-4.',
 625,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-1-nonveg',
 'nonveg', true, true, 2),
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 2 - Veg',
 'fp-2-veg',
 '2 Regular Signature or Supreme Veg Pizzas + Garlic Breadstick + Choco Lava Cake. Serves 3-4.',
 640,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-2-veg',
 'veg', true, true, 3),
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 2 - Non-Veg',
 'fp-2-nonveg',
 '2 Regular Signature or Supreme Non-Veg Pizzas + Garlic Breadstick + Choco Lava Cake. Serves 3-4.',
 720,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-2-nonveg',
 'nonveg', true, true, 4),
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 3 - Veg (Medium)',
 'fp-3-veg',
 '2 Medium Veg Pizzas + Garlic Breadstick + Choco Lava Cake + Coke 600ml. Serves 4-5.',
 1025,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-3-veg',
 'veg', true, true, 5),
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 3 - Non-Veg (Medium)',
 'fp-3-nonveg',
 '2 Medium Pizzas (any non-veg) + Garlic Breadstick + Choco Lava Cake + Coke 600ml. Serves 4-5.',
 1200,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-3-nonveg',
 'nonveg', true, true, 6),
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 4 - Veg (Medium)',
 'fp-4-veg',
 '2 Medium Signature or Supreme Veg Pizzas + 2 Garlic Breadsticks + 2 Choco Lava Cakes + Coke 600ml. Serves 5-6.',
 1120,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-4-veg',
 'veg', true, true, 7),
((SELECT id FROM menu_categories WHERE slug='family-packs'), 'Family Pack 4 - Non-Veg (Medium)',
 'fp-4-nonveg',
 '2 Medium Signature or Supreme Non-Veg Pizzas + 2 Garlic Breadsticks + 2 Choco Lava Cakes + Coke 600ml. Serves 5-6.',
 1380,
 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&h=500&fit=crop&auto=format&q=80#fp-4-nonveg',
 'nonveg', true, true, 8)
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, image_url = EXCLUDED.image_url, dietary = EXCLUDED.dietary,
  available = true, active = true, sort_order = EXCLUDED.sort_order, updated_at = CURRENT_TIMESTAMP;
