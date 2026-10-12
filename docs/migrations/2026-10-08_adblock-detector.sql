-- 2026-10-08_adblock-detector.sql
-- Per-profile adblock-notice gate (ad:INSTANCE follow-up).
--
-- Backed by the Prisma field:
--   Profile.adblockDetectorEnabled Boolean @default(true) @map("adblock_detector_enabled")
-- Applied via: pnpm prisma db execute --file docs/migrations/2026-10-08_adblock-detector.sql
-- (also reproducible through `pnpm db:push` from prisma/schema.prisma).
--
-- Semantics: FREE profiles ALWAYS keep the notice (value stays true, the PATCH
-- route rejects false). PRO/Enterprise may set false to skip the notice while
-- still showing instance ads.

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "adblock_detector_enabled" BOOLEAN NOT NULL DEFAULT true;