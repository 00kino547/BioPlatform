-- Phase 2: presence status line, countdown block, per-link click analytics.
ALTER TABLE "profiles" ADD COLUMN "presence_status" TEXT;
ALTER TABLE "profiles" ADD COLUMN "countdown" JSONB;
ALTER TABLE "link_clicks" ADD COLUMN "slug" TEXT;
CREATE INDEX "link_clicks_profile_id_slug_idx" ON "link_clicks" ("profile_id", "slug");