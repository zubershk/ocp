-- 040_pos_payment_method_check.sql — PR4 Config Trust: ledger accepts configured methods
-- The hardcoded order_payments.method allow-list moves to application
-- validation (system rails + active restaurant-configured keys checked
-- inside the payment transaction). The DB CHECK would reject any
-- admin-created method, so it is dropped; method validity is enforced
-- by TakePayment/isAcceptedPayMethod instead.
ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_method_check;
