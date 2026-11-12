-- ============================================================
-- 049_combo_custom_quantity.sql
-- Allows a pool item to carry quantity 0 in a pick-N combo.
--
-- quantity is the item's share of the combo's STARTING mix. A value
-- of 0 means the item is offered in the pool but is not part of the
-- default mix — the customer may still pick it up to max_qty.
--
-- Relaxing the CHECK on 047 (quantity > 0) requires dropping and
-- re-adding the constraint.
-- ============================================================

ALTER TABLE combo_items DROP CONSTRAINT IF EXISTS combo_items_quantity_check;

ALTER TABLE combo_items
    ADD CONSTRAINT combo_items_quantity_check CHECK (quantity >= 0);

COMMENT ON COLUMN combo_items.quantity IS
    'Units of this item in the combo''s starting mix (0 = offered in the pool but not in the default mix)';
