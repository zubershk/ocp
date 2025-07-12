-- 013_phone_canonical.sql — unify web (10-digit) and WA (91+10) to 10-digit local
-- SaaS fix for customer sync vulnerability. Idempotent.

-- customers: handle duplicates first (12-digit WA + 10-digit web same person) — delete WA duplicate, keep web
DELETE FROM customers WHERE whatsapp_number ~ '^91[0-9]{10}$' AND SUBSTRING(whatsapp_number, 3) IN (SELECT whatsapp_number FROM customers WHERE whatsapp_number ~ '^[0-9]{10}$');
DELETE FROM customers WHERE whatsapp_number ~ '^0[0-9]{10}$' AND SUBSTRING(whatsapp_number, 2) IN (SELECT whatsapp_number FROM customers WHERE whatsapp_number ~ '^[0-9]{10}$');
-- now safe to canonicalize remaining
UPDATE customers SET whatsapp_number = SUBSTRING(whatsapp_number, 3) WHERE whatsapp_number ~ '^91[0-9]{10}$';
UPDATE customers SET whatsapp_number = SUBSTRING(whatsapp_number, 2) WHERE whatsapp_number ~ '^0[0-9]{10}$';

-- orders: 12-digit -> 10-digit
UPDATE orders SET customer_phone = SUBSTRING(customer_phone, 3) WHERE customer_phone ~ '^91[0-9]{10}$';
UPDATE orders SET customer_phone = SUBSTRING(customer_phone, 2) WHERE customer_phone ~ '^0[0-9]{10}$';

-- whatsapp_messages
UPDATE whatsapp_messages SET customer_phone = SUBSTRING(customer_phone, 3) WHERE customer_phone ~ '^91[0-9]{10}$';
UPDATE whatsapp_messages SET customer_phone = SUBSTRING(customer_phone, 2) WHERE customer_phone ~ '^0[0-9]{10}$';

-- whatsapp_conversations via customer_id join — no phone column to fix
-- carts
UPDATE carts SET customer_phone = SUBSTRING(customer_phone, 3) WHERE customer_phone ~ '^91[0-9]{10}$';
UPDATE carts SET customer_phone = SUBSTRING(customer_phone, 2) WHERE customer_phone ~ '^0[0-9]{10}$';

-- customer_otps / sessions
UPDATE customer_otps SET phone = SUBSTRING(phone, 3) WHERE phone ~ '^91[0-9]{10}$';
UPDATE customer_otps SET phone = SUBSTRING(phone, 2) WHERE phone ~ '^0[0-9]{10}$';
UPDATE customer_sessions SET phone = SUBSTRING(phone, 3) WHERE phone ~ '^91[0-9]{10}$';
UPDATE customer_sessions SET phone = SUBSTRING(phone, 2) WHERE phone ~ '^0[0-9]{10}$';

-- deduplicate customers that now collide on whatsapp_number (keep earliest)
DELETE FROM customers a USING customers b WHERE a.id > b.id AND a.whatsapp_number = b.whatsapp_number;
