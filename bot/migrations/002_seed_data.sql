-- Insert default restaurant config
INSERT INTO restaurant_config (name, phone, address, map_url, opening_hours, delivery_area, payment_info, support_phone)
VALUES (
    'Orange Cheese Pizza',
    '',
    '',
    '',
    '{"monday": {"open": "11:00", "close": "23:00"}, "tuesday": {"open": "11:00", "close": "23:00"}, "wednesday": {"open": "11:00", "close": "23:00"}, "thursday": {"open": "11:00", "close": "23:00"}, "friday": {"open": "11:00", "close": "23:00"}, "saturday": {"open": "11:00", "close": "23:00"}, "sunday": {"open": "11:00", "close": "23:00"}}'::jsonb,
    '[]'::jsonb,
    '{"cash": true, "upi": true, "online": false}'::jsonb,
    ''
)
ON CONFLICT DO NOTHING;

-- Insert menu categories
INSERT INTO menu_categories (name, description, sort_order, active) VALUES
('Pizza', 'Delicious handcrafted pizzas', 1, true),
('Combos', 'Value combo meals', 2, true),
('Sides', 'Tasty side dishes', 3, true),
('Beverages', 'Refreshing drinks', 4, true),
('Deals', 'Special offers and deals', 5, true)
ON CONFLICT DO NOTHING;

-- Insert menu items for Pizza category
INSERT INTO menu_items (category_id, name, description, price, image_url, available, sort_order, active) VALUES
(1, 'Margherita', 'Classic pizza with tomato sauce, mozzarella, and fresh basil', 299.00, '', true, 1, true),
(1, 'Farmhouse', 'Loaded with veggies - onions, capsicum, tomatoes, and mushrooms', 399.00, '', true, 2, true),
(1, 'Cheese Burst', 'Extra cheese filled crust with mozzarella topping', 449.00, '', true, 3, true),
(1, 'Pepperoni', 'Classic pepperoni with mozzarella cheese', 379.00, '', true, 4, true),
(1, 'Veggie Supreme', 'Assorted vegetables with olives and jalapenos', 389.00, '', true, 5, true)
ON CONFLICT DO NOTHING;

-- Insert menu items for Combos category
INSERT INTO menu_items (category_id, name, description, price, image_url, available, sort_order, active) VALUES
(2, 'Pizza + Garlic Bread + Drink', 'Any regular pizza with garlic bread and a soft drink', 449.00, '', true, 1, true),
(2, '2 Pizzas + 2 Drinks', 'Two regular pizzas with two soft drinks', 699.00, '', true, 2, true),
(2, 'Family Combo', '2 pizzas, garlic bread, pasta, and 2 drinks', 999.00, '', true, 3, true)
ON CONFLICT DO NOTHING;

-- Insert menu items for Sides category
INSERT INTO menu_items (category_id, name, description, price, image_url, available, sort_order, active) VALUES
(3, 'Garlic Bread', 'Classic garlic bread with herbs', 99.00, '', true, 1, true),
(3, 'Cheesy Garlic Bread', 'Garlic bread topped with melted cheese', 149.00, '', true, 2, true),
(3, 'French Fries', 'Crispy golden french fries', 129.00, '', true, 3, true),
(3, 'Cheese Sticks', 'Mozzarella cheese sticks with marinara sauce', 179.00, '', true, 4, true),
(3, 'Chicken Wings', 'Spicy chicken wings (6 pcs)', 249.00, '', true, 5, true)
ON CONFLICT DO NOTHING;

-- Insert menu items for Beverages category
INSERT INTO menu_items (category_id, name, description, price, image_url, available, sort_order, active) VALUES
(4, 'Coke', 'Coca-Cola 500ml', 49.00, '', true, 1, true),
(4, 'Sprite', 'Sprite 500ml', 49.00, '', true, 2, true),
(4, 'Fanta', 'Fanta 500ml', 49.00, '', true, 3, true),
(4, 'Water Bottle', 'Mineral water 1L', 29.00, '', true, 4, true),
(4, 'Fresh Lime Soda', 'Fresh lime soda', 79.00, '', true, 5, true)
ON CONFLICT DO NOTHING;

-- Insert menu items for Deals category
INSERT INTO menu_items (category_id, name, description, price, image_url, available, sort_order, active) VALUES
(5, 'Weekday Special', 'Any 2 regular pizzas at special price', 549.00, '', true, 1, true),
(5, 'Late Night Deal', 'Pizza + Garlic Bread after 10 PM', 349.00, '', true, 2, true)
ON CONFLICT DO NOTHING;

-- Insert sample options for pizzas
INSERT INTO menu_item_options (menu_item_id, name, option_type, price_delta, active) VALUES
(1, 'Extra Cheese', 'single', 50.00, true),
(1, 'Thin Crust', 'single', 0.00, true),
(1, 'Thick Crust', 'single', 0.00, true),
(2, 'Extra Cheese', 'single', 50.00, true),
(2, 'Thin Crust', 'single', 0.00, true),
(2, 'Thick Crust', 'single', 0.00, true),
(3, 'Extra Cheese', 'single', 50.00, true),
(3, 'Thin Crust', 'single', 0.00, true),
(3, 'Thick Crust', 'single', 0.00, true)
ON CONFLICT DO NOTHING;