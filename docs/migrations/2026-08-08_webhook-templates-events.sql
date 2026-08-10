BEGIN;

-- =====================================================================
-- Webhook custom payload templates
-- =====================================================================

ALTER TABLE "webhooks" ADD COLUMN "template" TEXT;

COMMIT;
