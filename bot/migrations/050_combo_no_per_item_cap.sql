-- ============================================================
-- 050_combo_no_per_item_cap.sql
-- Removes the per-item cap on combo pool items.
--
-- Previously each pool item carried its own max_qty (e.g. 2), so a
-- customer could take at most 2 of any one item. The rule is now:
-- the customer may take ANY number of ANY pool item, bounded only
-- by the combo's total selection_limit (e.g. 4 of 4 as onion).
--
-- max_qty is kept as a DERIVED column so clients can see the
-- effective cap of a pool item without re-deriving it themselves.
-- It is no longer admin-set.
--
-- Idempotent: safe to run on every bot start.
-- ============================================================

-- Pick-N combos: the effective cap is the combo's selection limit.
UPDATE combo_items ci
SET max_qty = c.selection_limit
FROM combos c
WHERE c.id = ci.combo_id
  AND c.selection_limit > 0
  AND ci.max_qty <> c.selection_limit;

-- Fixed bundles: the pool is taken as defined, so the cap is the
-- configured quantity.
UPDATE combo_items ci
SET max_qty = ci.quantity
FROM combos c
WHERE c.id = ci.combo_id
  AND c.selection_limit = 0
  AND ci.max_qty <> ci.quantity;

COMMENT ON COLUMN combo_items.max_qty IS
    'Derived: effective cap on this pool item (the combo''s selection_limit for pick-N combos, the configured quantity for fixed bundles). Not admin-set.';
