-- ============================================================
-- 003_website_menu.sql
-- Website catalog: size-based pricing, slugs, dietary/pizza flags,
-- and the real Orange Cheese Pizza July 2026 menu seed.
--
-- Source of truth: frontend/src/data/menu.ts (July 2026 printed menu).
-- All prices INCLUDE TAX. Legacy placeholder rows are deactivated,
-- never deleted (carts/orders keep their FK integrity).
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- ============================================================

-- ------------------------------------------------------------
-- 1) menu_categories: add slug (stable public identifier)
--    NOTE: historical 002 seed re-ran on every bot start without
--    conflict targets, so duplicate names exist. We derive
--    deterministic unique slugs (losers get '-<id>' suffix)
--    BEFORE creating the unique index, and never delete rows
--    (carts/orders keep FK integrity).
-- ------------------------------------------------------------
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS slug VARCHAR(120);

UPDATE menu_categories
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE COALESCE(slug, '') = ''
  AND NOT EXISTS (
    SELECT 1 FROM menu_categories d
    WHERE d.slug = LOWER(REGEXP_REPLACE(menu_categories.name, '[^a-zA-Z0-9]+', '-', 'g'))
  );

-- Colliders (e.g. 002 re-inserted 'Pizza' while 'pizza' is taken):
-- force-unique with a deterministic '-<id>' suffix.
UPDATE menu_categories c
SET slug = LOWER(REGEXP_REPLACE(c.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || c.id
WHERE COALESCE(c.slug, '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_categories_slug ON menu_categories(slug);

-- ------------------------------------------------------------
-- 2) menu_items: size pricing + catalog metadata
-- ------------------------------------------------------------
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS slug              VARCHAR(160);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_regular     DECIMAL(10,2);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_medium      DECIMAL(10,2);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS price_large       DECIMAL(10,2);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS dietary           VARCHAR(10) DEFAULT 'veg';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS pizza_subcategory VARCHAR(50);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS pizza_type        VARCHAR(10);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_spicy          BOOLEAN DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_jain           BOOLEAN DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_new            BOOLEAN DEFAULT false;

-- Backfill stable slugs for pre-existing rows, then deactivate them.
-- They remain in the DB for historical cart/order references.
UPDATE menu_items
SET slug = 'legacy-' || LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || id
WHERE slug IS NULL OR slug = '';

UPDATE menu_items SET active = false, available = false WHERE slug LIKE 'legacy-%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_items_slug ON menu_items(slug);

CREATE INDEX IF NOT EXISTS idx_menu_items_category_active ON menu_items(category_id, active);
CREATE INDEX IF NOT EXISTS idx_menu_items_dietary ON menu_items(dietary);

-- ------------------------------------------------------------
-- 3) Website categories (ordering mirrors the website menu)
-- ------------------------------------------------------------
INSERT INTO menu_categories (name, slug, description, sort_order, active) VALUES
('Veg Pizzas',         'veg-pizzas',         'Hand-tossed pizzas with 100% real mozzarella',        1,  true),
('Non-Veg Pizzas',     'nonveg-pizzas',      'Chicken pizzas with 100% real mozzarella',            2,  true),
('Value Pizza',        'value-pizza',        'Everyday value pizzas',                               3,  true),
('Pasta',              'pasta',              'Red and white sauce pastas',                          4,  true),
('Garlic Bread',       'garlic-bread',       'Round garlic breads, sticks and dips',                5,  true),
('Tacos',              'tacos',              'Mexican style tacos',                                 6,  true),
('Appetizers',         'appetizers',         'Crispy parcels',                                      7,  true),
('Speciality Chicken', 'speciality-chicken', 'Popcorn, wings, nuggets and kebabs',                  8,  true),
('Momos',              'momos',              'Steam, tandoori and cheesy baked momos',              9,  true),
('Burgers',            'burgers',            'Veg and chicken burgers',                             10, true),
('French Fries',       'french-fries',       'Plain and flavored fries with dips',                  11, true),
('Desserts',           'desserts',           'Sweet endings',                                       12, true)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order  = EXCLUDED.sort_order,
  active      = true,
  updated_at  = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 4) Menu items — VEG PIZZAS
--    Classic 205/385/615 · Favourite 235/425/675
--    Signature 285/505/755 · Supreme & Desi Tadka 325/595/865
-- ------------------------------------------------------------
INSERT INTO menu_items
  (category_id, name, slug, description, price, price_regular, price_medium, price_large,
   image_url, dietary, pizza_subcategory, pizza_type, is_spicy, is_jain, is_new, available, active, sort_order)
VALUES
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Cheese & Tomato', 'cheese-tomato',
 'A delectable combination of cheese and juicy tomato.', 205, 205, 385, 615,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#cheese-tomato',
 'veg', 'classic', 'veg', false, false, false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Cheese & Corn', 'cheese-corn',
 'Sweet & juicy golden corn and 100% real mozzarella cheese in a delectable combination.', 205, 205, 385, 615,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#cheese-corn',
 'veg', 'classic', 'veg', false, false, false, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Fresh Veggie', 'fresh-veggie',
 'Delectable combination of onion & capsicum, a veggie lovers pick.', 235, 235, 425, 675,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#fresh-veggie',
 'veg', 'favourite', 'veg', false, false, false, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Spicy Veggie', 'spicy-veggie',
 'Delectable combination of onion, juicy tomato with spicy green chillies.', 235, 235, 425, 675,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#spicy-veggie',
 'veg', 'favourite', 'veg', true, false, false, true, true, 4),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Moroccan Spice Pasta Pizza - Veg', 'moroccan-pasta-veg',
 'A pizza loaded with a spicy combination and delicious pasta.', 235, 235, 425, 675,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#moroccan-veg',
 'veg', 'favourite', 'veg', true, false, false, true, true, 5),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Double Cheese Margherita', 'double-cheese-margherita',
 'A classic delight loaded with extra cheese.', 235, 235, 425, 675,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#double-cheese',
 'veg', 'favourite', 'veg', false, false, false, true, true, 6),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Jain Hara Bhara', 'jain-hara-bhara',
 'Jain sauce, Pahadi Paneer, green capsicum, coriander, green chilli.', 235, 235, 425, 675,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#jain-hara',
 'veg', 'favourite', 'veg', true, true, false, true, true, 7),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Veggie Lover', 'veggie-lover',
 'Delightful combination of onion, capsicum, tomato & mushroom.', 285, 285, 505, 755,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#veggie-lover',
 'veg', 'signature', 'veg', false, false, false, true, true, 8),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Tandoori Paneer', 'tandoori-paneer',
 'Flavorful trio of juicy paneer, crisp capsicum, spicy red paprika with Kasoori methi.', 285, 285, 505, 755,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#tandoori-paneer',
 'veg', 'signature', 'veg', true, false, false, true, true, 9),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Paradise Veg', 'paradise-veg',
 'A awesome foursome of golden corn, black olives, capsicum & red paprika.', 285, 285, 505, 755,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#paradise-veg',
 'veg', 'signature', 'veg', true, false, false, true, true, 10),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Kadai Paneer', 'kadai-paneer',
 'Authentic Indian flavor of Makhani sauce loaded with juicy paneer, capsicum, onion & Kadai masala, sprinkled with oregano.', 285, 285, 505, 755,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#kadai-paneer',
 'veg', 'signature', 'veg', false, false, false, true, true, 11),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Mexican Green Wave', 'mexican-green-wave',
 'Mexican herbs sprinkled on onion, capsicum, tomato & jalapeno.', 285, 285, 505, 755,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#mexican-wave',
 'veg', 'signature', 'veg', true, false, false, true, true, 12),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Country Feast', 'country-feast',
 'Veg feast with onion, capsicum, mushroom, corn & paneer.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#country-feast',
 'veg', 'supreme', 'veg', false, false, false, true, true, 13),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Veg Supreme', 'veg-supreme',
 'Loaded with onion, capsicum, tomato, mushroom, olives, jalapenos, corn & extra cheese.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#veg-supreme',
 'veg', 'supreme', 'veg', false, false, false, true, true, 14),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Veg Exotica', 'veg-exotica',
 'Fresh exotic veggies, olives, jalapenos, red capsicum, capsicum and baby corn.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#veg-exotica',
 'veg', 'supreme', 'veg', false, false, false, true, true, 15),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Super 5 Pepper', 'super-5-pepper',
 'An exotic pizza topped with red bell pepper, yellow bell pepper, capsicum, red paprika, jalapeno & sprinkled with exotic herb.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#super-5-pepper',
 'veg', 'supreme', 'veg', true, false, false, true, true, 16),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Paneer Makhani', 'paneer-makhani',
 'Flavorful twist of spicy Makhani sauce topped with paneer, red paprika & capsicum with mint mayo.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#paneer-makhani',
 'veg', 'supreme', 'veg', true, false, false, true, true, 17),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Veg Korean Spicy', 'veg-korean-spicy',
 'Veg Manchurian balls, baby corn, sweet corn, and onion tossed in Korean spicy sauce.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#veg-korean',
 'veg', 'supreme', 'veg', true, false, true, true, true, 18),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Hyderabadi Paneer Tikka', 'hyderabadi-paneer-tikka',
 'Pizza with Makhani sauce, paneer tossed in Hyderabadi seasoning, delicious crispy green & red bell pepper, onion & coriander.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#hyd-paneer',
 'veg', 'desi-tadka', 'veg', true, false, false, true, true, 19),
((SELECT id FROM menu_categories WHERE slug='veg-pizzas'), 'Lucknowi Paneer Masala', 'lucknowi-paneer-masala',
 'Pizza tossed with Makhani sauce, paneer in Lucknowi seasoning, delicious crispy green & yellow bell pepper, red paprika & coriander.', 325, 325, 595, 865,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#lucknowi-paneer',
 'veg', 'desi-tadka', 'veg', true, false, false, true, true, 20)
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, price_regular = EXCLUDED.price_regular, price_medium = EXCLUDED.price_medium,
  price_large = EXCLUDED.price_large, image_url = EXCLUDED.image_url, dietary = EXCLUDED.dietary,
  pizza_subcategory = EXCLUDED.pizza_subcategory, pizza_type = EXCLUDED.pizza_type,
  is_spicy = EXCLUDED.is_spicy, is_jain = EXCLUDED.is_jain, is_new = EXCLUDED.is_new,
  available = true, active = true, sort_order = EXCLUDED.sort_order, updated_at = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 5) Menu items — NON-VEG PIZZAS
--    Classic 275/495/735 · Favourite 305/545/805
--    Signature 335/605/895 · Supreme & Desi Tadka 385/645/985
-- ------------------------------------------------------------
INSERT INTO menu_items
  (category_id, name, slug, description, price, price_regular, price_medium, price_large,
   image_url, dietary, pizza_subcategory, pizza_type, is_spicy, is_jain, is_new, available, active, sort_order)
VALUES
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Spicy Chicken', 'spicy-chicken',
 'Fragrance spicy chicken with onion.', 275, 275, 495, 735,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#spicy-chicken',
 'nonveg', 'classic', 'nonveg', true, false, false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Pepper BBQ Chicken', 'pepper-bbq-chicken',
 'A classic favorite with pepper barbeque chicken & onion.', 275, 275, 495, 735,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#pepper-bbq',
 'nonveg', 'classic', 'nonveg', false, false, false, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Hot N Spicy', 'chicken-hot-n-spicy',
 'Chicken hot & spicy, capsicum, mushroom.', 305, 305, 545, 805,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#hot-n-spicy',
 'nonveg', 'favourite', 'nonveg', true, false, false, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Keema Do Pyaza', 'keema-do-pyaza',
 'Chicken keema & onion, green chillies.', 305, 305, 545, 805,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#keema',
 'nonveg', 'favourite', 'nonveg', true, false, false, true, true, 4),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Mexican', 'chicken-mexican',
 'Mexican seasoning sprinkled on sauce, chicken hot & spicy, onion and red paprika.', 305, 305, 545, 805,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#chicken-mexican',
 'nonveg', 'favourite', 'nonveg', true, false, false, true, true, 5),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Fiesta', 'chicken-fiesta',
 'Grilled chicken rashers, peri peri chicken, onion & capsicum.', 305, 305, 545, 805,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#chicken-fiesta',
 'nonveg', 'favourite', 'nonveg', true, false, false, true, true, 6),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Moroccan Spice Pasta Pizza - Chicken', 'moroccan-pasta-nonveg',
 'A pizza loaded with a spicy combination of Harissa sauce, Peri Peri chicken chunks and delicious pasta.', 305, 305, 545, 805,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#moroccan-chicken',
 'nonveg', 'favourite', 'nonveg', true, false, false, true, true, 7),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Super Chicken Delight', 'super-chicken-delight',
 'Double pepper BBQ chicken, golden corn and extra cheese, true delight.', 335, 335, 605, 895,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#super-chicken',
 'nonveg', 'signature', 'nonveg', false, false, false, true, true, 8),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Tandoori Chicken Seekh Kebab', 'tandoori-seekh-kebab',
 'Tandoori sauce, Kastoori methi, onion, capsicum, chicken seekh kebab & mint mayo.', 335, 335, 605, 895,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#seekh-kebab',
 'nonveg', 'signature', 'nonveg', false, false, false, true, true, 9),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Butter Chicken', 'butter-chicken-pizza',
 'Butter chicken, onion, coriander, Tandoori sauce.', 335, 335, 605, 895,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#butter-chicken',
 'nonveg', 'signature', 'nonveg', false, false, false, true, true, 10),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Sezchuan Chicken', 'sezchuan-chicken',
 'Sezchuan chicken, capsicum, green chillies and spring onion.', 335, 335, 605, 895,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#sezchuan',
 'nonveg', 'signature', 'nonveg', true, false, false, true, true, 11),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Impossible Supreme', 'impossible-supreme',
 'Grilled chicken rashers, mushroom, olives, jalapenos with oregano & spring onions.', 335, 335, 605, 895,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#impossible',
 'nonveg', 'signature', 'nonveg', true, false, false, true, true, 12),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Korean Chicken', 'korean-chicken',
 'Chicken meatballs tossed in Korean spicy sauce with onion, green capsicum and red capsicum.', 335, 335, 605, 895,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#korean-chicken',
 'nonveg', 'signature', 'nonveg', true, false, true, true, true, 13),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Tikka Makhani', 'chicken-tikka-makhani',
 'Flavorful twist of spicy Makhani sauce with chicken tikka, onion, red paprika, mint mayo.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#tikka-makhani',
 'nonveg', 'supreme', 'nonveg', true, false, false, true, true, 14),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Non-Veg Extravaganza', 'chicken-extravaganza',
 'Loaded as it gets, BBQ chicken and grilled chicken rashers with tangy black olives, onions, crisp capsicum & delectable mushrooms.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#extravaganza',
 'nonveg', 'supreme', 'nonveg', false, false, false, true, true, 15),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Supreme', 'chicken-supreme',
 'Supreme combination of pepper BBQ chicken, chicken tikka, chicken hot spicy & keema.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#chicken-supreme',
 'nonveg', 'supreme', 'nonveg', false, false, false, true, true, 16),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Tornado', 'tornado',
 'Tandoori sauce, spicy chicken keema, chicken tikka & onion.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#tornado',
 'nonveg', 'supreme', 'nonveg', true, false, false, true, true, 17),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Pepperoni', 'chicken-pepperoni',
 'A classic American taste! Relish the delectable flavor of chicken pepperoni, topped with extra extra cheese.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#pepperoni',
 'nonveg', 'supreme', 'nonveg', false, false, false, true, true, 18),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Chicken Dominator', 'chicken-dominator',
 'Loaded with chicken sausage, chicken tikka, chicken kebab & chicken rashers for chicken lovers.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#dominator',
 'nonveg', 'supreme', 'nonveg', false, false, false, true, true, 19),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Spice of Hyderabadi Chicken Tikka', 'hyderabadi-chicken-tikka',
 'Pizza with Makhani sauce, chicken tossed in Hyderabadi seasoning, delicious crispy green & red bell pepper, onion, spicy green chilli.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#hyd-chicken',
 'nonveg', 'desi-tadka', 'nonveg', true, false, false, true, true, 20),
((SELECT id FROM menu_categories WHERE slug='nonveg-pizzas'), 'Lucknowi Chicken Masala', 'lucknowi-chicken-masala',
 'Pizza with Makhani sauce, chicken tossed in Lucknowi seasoning, crispy green & yellow bell pepper, mushroom & jalapenos.', 385, 385, 645, 985,
 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#lucknowi-chicken',
 'nonveg', 'desi-tadka', 'nonveg', true, false, false, true, true, 21)
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, price_regular = EXCLUDED.price_regular, price_medium = EXCLUDED.price_medium,
  price_large = EXCLUDED.price_large, image_url = EXCLUDED.image_url, dietary = EXCLUDED.dietary,
  pizza_subcategory = EXCLUDED.pizza_subcategory, pizza_type = EXCLUDED.pizza_type,
  is_spicy = EXCLUDED.is_spicy, is_jain = EXCLUDED.is_jain, is_new = EXCLUDED.is_new,
  available = true, active = true, sort_order = EXCLUDED.sort_order, updated_at = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 6) Menu items — VALUE PIZZA (single Regular price)
-- ------------------------------------------------------------
INSERT INTO menu_items
  (category_id, name, slug, description, price, image_url, dietary, is_spicy, available, active, sort_order)
VALUES
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Onion - Value Pizza', 'vp-onion', 'Single topping value pizza.', 110, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#vp-onion', 'veg', false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Tomato - Value Pizza', 'vp-tomato', 'Single topping value pizza.', 110, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#vp-tomato', 'veg', false, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Capsicum - Value Pizza', 'vp-capsicum', 'Single topping value pizza.', 110, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#vp-capsicum', 'veg', false, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Golden Corn - Value Pizza', 'vp-golden-corn', 'Single topping value pizza.', 110, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#vp-corn', 'veg', false, true, true, 4),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Spicy Chicken - Value Pizza', 'vp-spicy-chicken', 'Spicy chicken value pizza.', 145, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#vp-spicy-chicken', 'nonveg', true, true, true, 5),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Onion & Tomato - Value Pizza', 'vp-onion-tomato', 'Double topping veg value pizza.', 145, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#vp-double-1', 'veg', false, true, true, 6),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Cheese Lovers Paradise', 'vp-cheese-paradise', 'Loaded with Mozzarella, Cheddar & Gouda Cheese.', 135, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#cheese-paradise', 'veg', false, true, true, 7),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Veg Loaded', 'vp-veg-loaded', 'Tomato, Mushroom, Gold Corn, Jalapenos.', 200, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#veg-loaded', 'veg', true, true, true, 8),
((SELECT id FROM menu_categories WHERE slug='value-pizza'), 'Non-Veg Loaded', 'vp-nonveg-loaded', 'BBQ Chicken, Chicken Tikka, Sausages.', 210, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop&auto=format&q=80#nonveg-loaded', 'nonveg', false, true, true, 9)
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, image_url = EXCLUDED.image_url, dietary = EXCLUDED.dietary,
  is_spicy = EXCLUDED.is_spicy, available = true, active = true, sort_order = EXCLUDED.sort_order, updated_at = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 7) Menu items — SIDES & OTHERS (single price)
-- ------------------------------------------------------------
INSERT INTO menu_items
  (category_id, name, slug, description, price, image_url, dietary, is_spicy, available, active, sort_order)
VALUES
-- Pasta
((SELECT id FROM menu_categories WHERE slug='pasta'), 'Red Sauce Pasta - Veg', 'pasta-red-veg', 'Capsicum, onion, corn, spicy dressing.', 140, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', true, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='pasta'), 'White Sauce Pasta - Veg', 'pasta-white-veg', 'Onion, black olives, capsicum.', 140, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='pasta'), 'White Sauce Pasta - Non-Veg', 'pasta-white-nonveg', 'BBQ chicken, onion, capsicum.', 150, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='pasta'), 'Red Sauce Pasta - Non-Veg', 'pasta-red-nonveg', 'Peri Peri chicken, onion, capsicum.', 150, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', true, true, true, 4),
-- Garlic Bread
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Round Garlic Bread Tossed', 'garlic-bread-tossed', 'Classic tossed garlic bread.', 90, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Round Garlic Bread with Cheese', 'garlic-bread-cheese', 'Tossed garlic bread with cheese.', 120, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Round Garlic Bread Veg. Spicy Supreme', 'garlic-bread-spicy-supreme', 'Veg spicy supreme garlic bread.', 135, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', true, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Round Garlic Bread with Keema', 'garlic-bread-keema', 'Garlic bread with chicken keema.', 160, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', true, true, true, 4),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Round Garlic Bread with Chicken', 'garlic-bread-chicken', 'Garlic bread topped with chicken.', 160, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 5),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Garlic Breadstick', 'garlic-breadstick', 'Crispy garlic breadsticks.', 120, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 6),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Stuffed Garlic Bread', 'stuffed-garlic-bread', 'Cheese stuffed garlic bread.', 170, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 7),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Paneer Tikka Stuffed GB', 'paneer-tikka-stuffed-gb', 'Stuffed garlic bread with paneer tikka.', 180, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', true, true, true, 8),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Chicken Pepperoni Stuffed GB', 'chicken-pepperoni-stuffed-gb', 'Stuffed garlic bread with chicken pepperoni.', 180, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 9),
((SELECT id FROM menu_categories WHERE slug='garlic-bread'), 'Garlic Bread Dip', 'garlic-bread-dip', 'Garlic dip for breads.', 130, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 10),
-- Desserts
((SELECT id FROM menu_categories WHERE slug='desserts'), 'Choco Lava Cake', 'choco-lava', 'Warm chocolate lava cake with molten centre.', 110, 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&h=500&fit=crop', 'veg', false, true, true, 1),
-- Tacos
((SELECT id FROM menu_categories WHERE slug='tacos'), 'Taco Mexican Veg', 'taco-veg', 'Mexican style veg taco.', 85, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', true, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='tacos'), 'Taco Mexican Non-Veg', 'taco-nonveg', 'Mexican style non-veg taco.', 100, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', true, true, true, 2),
-- Appetizers
((SELECT id FROM menu_categories WHERE slug='appetizers'), 'Veg Parcel', 'veg-parcel', 'Crispy veg parcel.', 55, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='appetizers'), 'Chicken Parcel', 'chicken-parcel', 'Crispy chicken parcel.', 65, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 2),
-- Speciality Chicken
((SELECT id FROM menu_categories WHERE slug='speciality-chicken'), 'Chicken Pop Corn (120gm)', 'chicken-popcorn', 'Crispy chicken popcorn bites.', 130, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='speciality-chicken'), 'Roasted Chicken Wings (4 pcs)', 'chicken-wings', 'Roasted chicken wings - Peri Peri / Classic Hot Sauce.', 150, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', true, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='speciality-chicken'), 'Chicken Nuggets (6 pcs)', 'chicken-nuggets-6', 'Crispy chicken nuggets.', 170, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='speciality-chicken'), 'Chicken Nuggets (9 pcs)', 'chicken-nuggets-9', 'Crispy chicken nuggets - larger pack.', 210, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 4),
((SELECT id FROM menu_categories WHERE slug='speciality-chicken'), 'Hara Bhara Kebab (6 pcs)', 'hara-bhara-kebab', 'Veg hara bhara kebabs.', 100, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 5),
((SELECT id FROM menu_categories WHERE slug='speciality-chicken'), 'Chicken Seekh Kebab (4 pcs)', 'chicken-seekh-kebab', 'Juicy chicken seekh kebabs.', 150, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', true, true, true, 6),
-- Momos
((SELECT id FROM menu_categories WHERE slug='momos'), 'Veg Steam Momos (6 pcs)', 'veg-steam-momos', 'Steamed veg momos.', 100, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='momos'), 'Veg Steam Cheese Corn Momos (6 pcs)', 'veg-cheese-corn-momos', 'Cheese corn steamed momos.', 115, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='momos'), 'Chicken Steam Momos (6 pcs)', 'chicken-steam-momos', 'Steamed chicken momos.', 125, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='momos'), 'Chicken Tandoori Steam Momos (6 pcs)', 'chicken-tandoori-momos', 'Tandoori flavored steamed chicken momos.', 125, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', true, true, true, 4),
((SELECT id FROM menu_categories WHERE slug='momos'), 'Cheesy Baked Veg Momos (4 pcs)', 'cheesy-baked-veg-momos', 'Baked veg momos with cheese.', 150, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 5),
((SELECT id FROM menu_categories WHERE slug='momos'), 'Cheesy Baked Non-Veg Momos (4 pcs)', 'cheesy-baked-nonveg-momos', 'Baked non-veg momos with cheese.', 160, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 6),
-- Burgers
((SELECT id FROM menu_categories WHERE slug='burgers'), 'Veg Aloo Tikki Burger', 'veg-aloo-tikki', 'Delicious combination with Aloo Tikki & crunchy lettuce with mayonnaise dressing.', 75, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='burgers'), 'Veg Classic Burger', 'veg-classic-burger', 'Delicious combination with Veg Patty & crunchy lettuce with mayonnaise dressing.', 110, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 2),
((SELECT id FROM menu_categories WHERE slug='burgers'), 'Triple Cheese American Burger - Veg', 'triple-cheese-american-veg', 'Topped with 3 layer of cheese, juicy jalapenos, shredded lettuce & cheese & corn patty.', 170, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 3),
((SELECT id FROM menu_categories WHERE slug='burgers'), 'Spicy Paneer Burger', 'spicy-paneer-burger', 'Rich & filling spicy paneer patty served with creamy sauce and crispy lettuce.', 180, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', true, true, true, 4),
((SELECT id FROM menu_categories WHERE slug='burgers'), 'Chicken Classic Burger', 'chicken-classic-burger', 'Tender & juicy chicken patty with creamy mayonnaise & crunchy lettuce.', 100, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 5),
((SELECT id FROM menu_categories WHERE slug='burgers'), 'Spicy Chicken Burger', 'spicy-chicken-burger', 'Delicious combination with spicy chicken patty, onion, jalapenos & lettuce with creamy dressing.', 130, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', true, true, true, 6),
((SELECT id FROM menu_categories WHERE slug='burgers'), 'Triple Cheese American Burger - Chicken', 'triple-cheese-american-chicken', 'Topped with 3 layer of cheese, juicy jalapenos, shredded lettuce & flame grilled chicken.', 180, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'nonveg', false, true, true, 7),
-- French Fries + dip
((SELECT id FROM menu_categories WHERE slug='french-fries'), 'French Fries - Plain', 'fries-plain', 'Crispy golden fries. Flavors +Rs10, Dressing +Rs30 (Mayo/Thousand Island).', 80, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 1),
((SELECT id FROM menu_categories WHERE slug='french-fries'), 'Cheesy Dip', 'cheesy-dip', 'Creamy cheesy dip.', 40, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&h=500&fit=crop', 'veg', false, true, true, 2)
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, image_url = EXCLUDED.image_url, dietary = EXCLUDED.dietary,
  is_spicy = EXCLUDED.is_spicy, available = true, active = true, sort_order = EXCLUDED.sort_order, updated_at = CURRENT_TIMESTAMP;

-- French fries size pricing (Regular 80 / Medium 100 / Large 120)
UPDATE menu_items SET price_regular = 80, price_medium = 100, price_large = 120
WHERE slug = 'fries-plain' AND (price_regular IS NULL OR price_regular <> 80 OR price_medium <> 100 OR price_large <> 120);

-- ------------------------------------------------------------
-- 8) Deactivate every non-website category (legacy placeholders).
--    Website categories were set active=true by the upserts above.
-- ------------------------------------------------------------
UPDATE menu_categories
SET active = false, updated_at = CURRENT_TIMESTAMP
WHERE slug NOT IN (
  'veg-pizzas','nonveg-pizzas','value-pizza','pasta','garlic-bread',
  'tacos','appetizers','speciality-chicken','momos','burgers',
  'french-fries','desserts'
);
