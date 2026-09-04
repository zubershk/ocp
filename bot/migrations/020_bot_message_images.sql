-- ============================================================
-- 020_bot_message_images.sql
-- Adds an optional image per bot message template. When set,
-- the image is sent as a photo header (button messages) or
-- photo-with-caption (text messages) on WhatsApp.
-- Managed from Admin → Bot Messages.
--
-- This migration is IDEMPOTENT and safe to run repeatedly.
-- ============================================================

ALTER TABLE bot_messages
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
