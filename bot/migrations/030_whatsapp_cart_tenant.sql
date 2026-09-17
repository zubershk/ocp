-- 030_whatsapp_cart_tenant.sql — fix cart uniqueness per restaurant
DROP INDEX IF EXISTS uq_wa_cart_variant;
-- ensure restaurant_id column exists (added in 027) and backfilled
DO $$
DECLARE v_rest INT;
BEGIN
  SELECT id INTO v_rest FROM restaurants ORDER BY id LIMIT 1;
  IF v_rest IS NOT NULL THEN
    UPDATE whatsapp_cart_items SET restaurant_id = v_rest WHERE restaurant_id IS NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_cart_variant_restaurant ON whatsapp_cart_items(customer_phone, restaurant_id, menu_item_id, size, crust);
