-- ============================================================
-- 018_item_no_crust.sql
-- Adds a per-item flag to hide the crust selector for fixed
-- bundles (family packs) and any other item where crust
-- choice is meaningless. Managed via Admin Menu checkbox.
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- ============================================================

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS no_crust BOOLEAN DEFAULT false;

-- Existing pack bundles ship with the selector hidden.
UPDATE menu_items SET no_crust = true WHERE slug LIKE 'fp-%';
