-- 2026-10-07_profile-hide-ads.sql
-- Per-profile opt-out of instance ads (FOLLOW-UP 3).
--
-- Backed by the Prisma field: Profile.hideAds Boolean @default(false) @map("hide_ads")
-- Applied via: pnpm prisma db execute --file docs/migrations/2026-10-07_profile-hide-ads.sql
-- (also reproducible through `pnpm db:push` from prisma/schema.prisma).

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "hide_ads" BOOLEAN NOT NULL DEFAULT false;