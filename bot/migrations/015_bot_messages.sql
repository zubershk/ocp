-- Migration 015: Bot message templates (configurable WhatsApp responses)
-- All bot responses stored in DB, editable via admin dashboard.

CREATE TABLE IF NOT EXISTS bot_messages (
    id SERIAL PRIMARY KEY,
    message_key VARCHAR(80) UNIQUE NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'general',
    description TEXT DEFAULT '',
    message_text TEXT NOT NULL,
    variables TEXT DEFAULT '',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bot_messages_key ON bot_messages(message_key);
CREATE INDEX IF NOT EXISTS idx_bot_messages_category ON bot_messages(category);

-- Seed all default messages (insert only if not already present)

-- GREETING
INSERT INTO bot_messages (message_key, category, description, message_text, variables) VALUES
('welcome', 'greeting', 'Main menu greeting (new customer)', E'\U0001F355 {{.RestaurantName}}\n\nWelcome! What would you like to do?', 'RestaurantName'),
('welcome_back', 'greeting', 'Greeting with first name', E'\U0001F355 Welcome back, {{.Name}}! \U0001F44B\n\nWhat would you like to do?', 'Name'),
('welcome_back_with_cart', 'greeting', 'Welcome back with items in cart', E'\U0001F44B Welcome back!\n\nYou have {{.ItemCount}} item(s) in your cart.\n', 'ItemCount'),
('welcome_back_in_flow', 'greeting', 'Welcome back mid-flow', E'\U0001F44B Welcome back!\n\nYou were in the middle of: {{.State}}\n\nContinue below, or type ''cancel''.', 'State'),
('help', 'greeting', 'Global help text', E'\U0001F916 I can help you with:\n\n\U0001F355 Ordering\n\U0001F6D2 Cart\n\U0001F4E6 Order tracking\n\U0001F464 Profile\n\U0001F4CD Restaurant location\n\u260E Human support\n\nTap a button above, or type: menu - cart - status - orders', ''),
('welcome_footer', 'greeting', 'Footer text for welcome message', 'We''re ready when you are.', ''),

-- ORDERING
('category_title', 'ordering', 'Category browser title', E'\U0001F355 What would you like to order?', ''),
('category_empty', 'ordering', 'No categories available', 'Menu is temporarily unavailable. Please try again shortly.', ''),
('item_title', 'ordering', 'Items in a category', E'\U0001F355 {{.CategoryName}} - choose your item', 'CategoryName'),
('item_empty', 'ordering', 'No items in category', 'No items available in that category right now. Type ''menu'' to browse.', ''),
('item_unavailable', 'ordering', 'Selected item unavailable', 'That item is unavailable right now. Type ''menu'' to browse.', ''),
('item_became_unavailable', 'ordering', 'Item became unavailable mid-flow', 'That item became unavailable. Type ''menu'' to pick another.', ''),
('size_title', 'ordering', 'Size selection prompt', 'Choose your size', ''),
('crust_title', 'ordering', 'Crust selection prompt', E'\U0001F956 Choose your crust', ''),
('quantity_title', 'ordering', 'Quantity selection prompt', 'How many would you like?', ''),
('quantity_invalid', 'ordering', 'Invalid quantity entered', 'Please send a number between 1 and 20, or type ''cancel''.', ''),
('quantity_more_prompt', 'ordering', 'Free-text quantity prompt', 'How many would you like? Send a number (1-20).', ''),
('item_added', 'ordering', 'Item added to cart confirmation', E'\u2705 Added to your cart!', 'ItemName,Size,CrustName,Quantity,Total'),
('selection_summary', 'ordering', 'Selection echo before quantity', '*Your selection:*\n\n\U0001F355 {{.ItemName}}\n{{.Size}}\n{{.CrustName}}\nRs.{{.Price}}', 'ItemName,Size,CrustName,Price'),

-- CART
('cart_empty', 'cart', 'Cart is empty message', E'Your cart is empty. \U0001F6D2\nType ''menu'' to start an order!', ''),
('cart_title', 'cart', 'Cart view title', E'\U0001F6D2 Your Cart', ''),
('cart_item_added', 'cart', 'Item added to cart body', '{{.ItemName}}\n{{.Size}}\n{{.CrustName}}\nQty: {{.Quantity}}\nRs.{{.Total}}', 'ItemName,Size,CrustName,Quantity,Total'),
('cart_clear_confirm', 'cart', 'Clear cart confirmation', E'\U0001F5D1 Clear your cart?', ''),
('cart_clear_body', 'cart', 'Clear cart description', 'This removes all items.', ''),
('cart_cleared', 'cart', 'Cart cleared message', E'\U0001F9F9 Cart cleared.\nType ''menu'' to start fresh!', ''),
('cart_cleared_alt', 'cart', 'Cart cleared (alternate)', E'\U0001F9F9 Cart cleared.\nType ''menu'' to start a new order!', ''),
('cart_line_gone', 'cart', 'Cart line no longer exists', 'That cart line no longer exists.', ''),
('cart_item_empty', 'cart', 'Cart is empty checkout attempt', E'Your cart is empty. \U0001F6D2 Type ''menu'' to add items.', ''),
('cart_item_first', 'cart', 'Cart empty - order first', E'Your cart is empty. \U0001F6D2 Type ''menu'' first.', ''),
('cart_done', 'cart', 'Cart edit done prompt', 'Done. Type ''cart'' to see your cart.', ''),
('cart_empty_checkout', 'cart', 'Cart empty at checkout', 'Cart is empty - type ''menu'' to start over.', ''),
('cart_empty_place', 'cart', 'Cart empty when placing order', 'Cart is empty - nothing placed. Type ''menu''.', ''),

-- CHECKOUT
('fulfillment_title', 'checkout', 'Delivery vs pickup prompt', 'How would you like to receive your order?', ''),
('fulfillment_body', 'checkout', 'Delivery vs pickup body', 'Choose one:', ''),
('pickup_info', 'checkout', 'Pickup store info', E'\U0001F3EA Pickup from:\n{{.RestaurantName}}\n{{.Address}}', 'RestaurantName,Address'),
('pickup_name_prompt', 'checkout', 'Pickup name prompt', 'What''s your name?', ''),
('name_prompt', 'checkout', 'Customer name prompt', 'What name should we use for your order?', ''),
('name_greeting_delivery', 'checkout', 'Name received for delivery', 'Nice to meet you, {{.Name}}!\n\nWhat''s your delivery address?', 'Name'),
('name_greeting_pickup', 'checkout', 'Name received for pickup', 'Thanks, {{.Name}}!', 'Name'),
('address_prompt', 'checkout', 'Delivery address prompt', 'Any landmark nearby? Type it, or type ''skip''.', ''),
('address_too_short', 'checkout', 'Address too short', 'That address looks too short. Please enter your complete delivery address.', ''),
('address_confirm_saved', 'checkout', 'Confirm saved address', E'\U0001F4CD Saved address', ''),
('address_saved_body', 'checkout', 'Saved address body', 'We have your saved address:\n\n{{.Address}}\n\nUse this address?', 'Address'),
('address_new_prompt', 'checkout', 'New address prompt', 'Please send your delivery address first, then we''ll continue.', ''),
('payment_title', 'checkout', 'Payment method prompt', E'\U0001F4B3 Choose payment method:', ''),
('payment_body', 'checkout', 'Payment method body', 'Cash on delivery available.', ''),
('payment_how', 'checkout', 'Payment how to pay', 'How would you like to pay?', ''),
('name_invalid', 'checkout', 'Invalid name entered', 'Please enter a valid name (2-60 characters).', ''),

-- ORDER CONFIRMATION
('order_summary_title', 'confirmation', 'Final review title', 'Ready to place your order?', ''),
('order_summary_body', 'confirmation', 'Order summary', E'\U0001F355 ORDER SUMMARY\n\nCustomer: {{.Name}}\nOrder type: {{.DeliveryType}}\n\nItems:\n{{.Items}}\nSubtotal: Rs.{{.Subtotal}}\nDelivery: Rs.0\nTotal: Rs.{{.Total}}\n\nPayment: {{.Payment}}\n\n{{.AddressBlock}}', 'Name,DeliveryType,Items,Subtotal,Total,Payment,AddressBlock'),
('order_placed', 'confirmation', 'Order placed confirmation', E'\u2705 *ORDER PLACED!*\n\nThank you{{.ThankSuffix}}! \U0001F355\n\nOrder:\n*{{.OrderNumber}}*\n\nTotal:\nRs.{{.Total}}\n\nWe''ll keep you updated here.', 'ThankSuffix,OrderNumber,Total'),
('order_placed_title', 'confirmation', 'Order placed title', E'\U0001F389 Thank you!', ''),
('order_failed', 'confirmation', 'Order placement failed', 'Couldn''t place your order: {{.Error}}\n\nType ''cart'' to review and retry.', 'Error'),
('confirm_cancel', 'confirmation', 'Order not placed', E'\u274C Order not placed - your cart is safe.', ''),

-- ORDER STATUS
('status_update', 'status', 'Customer status notification', E'\U0001F355 {{.RestaurantName}}\n\nOrder: {{.OrderNumber}}\nStatus: {{.Status}}\n\n{{.Message}}', 'RestaurantName,OrderNumber,Status,Message'),
('status_confirmed', 'status', 'Order confirmed message', E'We have received your order and it will start shortly. \U0001F468\u200D\U0001F373', ''),
('status_preparing', 'status', 'Order preparing message', 'Your order is being prepared.', ''),
('status_ready', 'status', 'Order ready message', 'Your order is ready!', ''),
('status_out_for_delivery', 'status', 'Order out for delivery', E'Your order is on its way! \U0001F6F5', ''),
('status_delivered', 'status', 'Order delivered message', E'Order completed. Thank you for ordering with us! \u2764\uFE0F', ''),
('status_cancelled', 'status', 'Order cancelled message', 'This order has been cancelled. Contact us if this was a mistake.', ''),
('status_default', 'status', 'Default status message', 'Status updated.', ''),
('status_none', 'status', 'No active order', E'You have no active orders right now. \U0001F355', ''),
('status_no_active', 'status', 'No active order button', 'You don''t have an active order right now.', ''),

-- NOTIFICATIONS
('notification_new_website_order', 'notification', 'Restaurant alert for website orders', E'\U0001F355 {{.RestaurantName}}\nNew Website Order', 'RestaurantName'),
('notification_new_wa_order', 'notification', 'Restaurant alert for WhatsApp orders', E'\U0001F355 {{.RestaurantName}}\nNEW WHATSAPP ORDER', 'RestaurantName'),
('notification_otp', 'notification', 'OTP login message', E'\U0001F355 {{.RestaurantName}}\n\nYour login code is *{{.Code}}*\nValid for 5 minutes. Do not share this code.\n\nIf you didn''t request this, ignore this message.', 'RestaurantName,Code'),
('notification_support_request', 'notification', 'Admin support alert', '*CUSTOMER REQUESTED SUPPORT*\n\nWhatsApp: {{.Phone}}\nName: {{.Name}}\nCurrent order: {{.Order}}\nCart lines: {{.CartCount}}\n\nReply to them directly on WhatsApp.', 'Phone,Name,Order,CartCount'),

-- PROFILE
('profile_title', 'profile', 'Profile view title', E'\U0001F464 {{.Name}}', 'Name'),
('profile_body', 'profile', 'Profile details', 'WhatsApp: {{.Phone}}\nAddress: {{.Address}}\nLandmark: {{.Landmark}}\nOrders: {{.OrderCount}}\nSpent: Rs.{{.TotalSpent}}', 'Phone,Address,Landmark,OrderCount,TotalSpent'),
('profile_edit_name', 'profile', 'Profile name edit prompt', 'Send the new name you''d like to use.', ''),
('profile_edit_addr', 'profile', 'Profile address edit prompt', 'Send your new default delivery address.', ''),

-- SUPPORT
('support_customer', 'support', 'Customer support message', E'\U0001F44B I''ll connect you with the restaurant team.\nSomeone from {{.RestaurantName}} will respond shortly.', 'RestaurantName'),
('support_team_notified', 'support', 'Team notified message', 'The team will reach out here.\nType ''menu'' whenever you''re ready.', ''),
('support_team_notified_menu', 'support', 'Support wait message', 'The team has been notified. Type ''menu'' when ready.', ''),

-- LOCATION
('location_title', 'location', 'Location view title', E'\U0001F4CD {{.RestaurantName}}', 'RestaurantName'),
('location_body', 'location', 'Location details', '{{.Address}}\n\nTel: {{.Phone}}\nKitchen: {{.KitchenHours}}\nDelivery: {{.DeliveryHours}}', 'Address,Phone,KitchenHours,DeliveryHours'),
('location_maps_hint', 'location', 'Maps link fallback', '{{.RestaurantName}} Mira Road', 'RestaurantName'),

-- ERRORS
('unknown_input', 'errors', 'Unrecognized input', 'I didn''t quite understand that.\n\n{{.Options}}', 'Options'),
('menu_unavailable', 'errors', 'Menu service unavailable', 'Menu is temporarily unavailable. Please try again shortly.', ''),
('session_expired', 'errors', 'Paginated list session expired', 'Session expired for that list - type ''menu'' to browse again.', ''),
('nothing_to_show', 'errors', 'Pager has no items', 'Nothing to show. Type ''menu''.', ''),
('order_not_found', 'errors', 'Order not found', 'That order was not found on this account.', ''),
('cart_update_failed', 'errors', 'Cart update failed', 'Couldn''t update the cart. Please try again.', ''),

-- GLOBAL COMMANDS
('cancel_message', 'commands', 'Cancel current flow', E'\U0001F9F9 Current flow cancelled. Your cart was kept - type ''cart'' or ''menu''.', ''),
('restart_message', 'commands', 'Restart and clear cart', E'\U0001F504 Fresh start! Cart cleared.\n\n', ''),
('state_name', 'commands', 'Name state help', 'Please type your name, or ''cancel'' to abort.', ''),
('state_address', 'commands', 'Address state help', 'Please type your full delivery address, or ''cancel''.', ''),
('state_landmark', 'commands', 'Landmark state help', 'Type a landmark or ''skip''.', ''),
('state_payment', 'commands', 'Payment state help', 'Choose Cash, UPI or Online using the buttons above.', ''),
('state_confirmation', 'commands', 'Confirmation state help', 'Tap ''Place Order'' or ''Cancel'' above, or ''cancel'' to exit.', ''),
('state_human_support', 'commands', 'Human support state help', 'The team has been notified. Type ''menu'' when ready.', ''),

-- REORDER
('reorder_added', 'commands', 'Items added from reorder', E'\u2705 Added {{.Count}} item(s) from {{.OrderNumber}} to your cart.', 'Count,OrderNumber'),
('reorder_unavailable', 'commands', 'Reorder item unavailable', E'\u26A0\uFE0F {{.ItemName}} is currently unavailable.', 'ItemName'),

-- ORDER HISTORY
('history_empty', 'ordering', 'No past orders', 'Your first pizza awaits!', ''),
('history_title', 'ordering', 'Recent orders title', E'\U0001F4E6 Your recent orders', ''),

-- STATUS VIEW
('status_view_title', 'ordering', 'Status view title', E'\U0001F4E6 {{.OrderNumber}}', 'OrderNumber'),
('status_view_body', 'ordering', 'Status view body', 'Status: {{.Emoji}} {{.Status}}\n\n{{.Items}}\nTotal: Rs.{{.Total}}', 'Emoji,Status,Items,Total'),
('status_order_detail', 'ordering', 'Order detail view', 'Status: {{.Emoji}} {{.Status}}\nPlaced: {{.Date}}\n\n{{.Items}}Total: Rs.{{.Total}}', 'Emoji,Status,Date,Items,Total')

ON CONFLICT (message_key) DO NOTHING;
