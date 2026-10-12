-- 2026-10-08_dmca-takedowns.sql
-- DMCA report intake + file fingerprinting (permanent banned-hash registry) and
-- account-level disable/recover for takedown appeals.
--
-- Backed by the Prisma models: MediaFile, DmcaReport, BannedHash + the
-- User.disabledAt / disabledReason / disabledNoticeSentAt / appealText /
-- appealSubmittedAt / appealDecision / appealReviewedAt fields. Also grants the
-- new `moderation.manage` permission to the system admin role.
-- Applied via: pnpm prisma db execute --file docs/migrations/2026-10-08_dmca-takedowns.sql
-- (also reproducible through `pnpm db:push` from prisma/schema.prisma).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_reason" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled_notice_sent_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "appeal_text" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "appeal_submitted_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "appeal_decision" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "appeal_reviewed_at" TIMESTAMPTZ;

-- Every stored user file gets a fingerprint row at upload time.
CREATE TABLE IF NOT EXISTS "media_files" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" UUID REFERENCES "profiles"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "p_hash_hex" TEXT,
  "file_path" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "media_files_sha256_file_path_key" UNIQUE ("sha256", "file_path")
);
CREATE INDEX IF NOT EXISTS "media_files_sha256_idx" ON "media_files"("sha256");
CREATE INDEX IF NOT EXISTS "media_files_p_hash_hex_idx" ON "media_files"("p_hash_hex");
CREATE INDEX IF NOT EXISTS "media_files_user_id_idx" ON "media_files"("user_id");
CREATE INDEX IF NOT EXISTS "media_files_profile_id_idx" ON "media_files"("profile_id");

CREATE TABLE IF NOT EXISTS "dmca_reports" (
  "id" UUID PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "claimant_name" TEXT NOT NULL,
  "claimant_email" TEXT NOT NULL,
  "work_url" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "infringing_urls" JSONB NOT NULL,
  "contact_note" TEXT,
  "filed_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "handled_at" TIMESTAMPTZ,
  "decision_note" TEXT,
  "counter_notice" TEXT,
  "counter_notice_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dmca_reports_status_idx" ON "dmca_reports"("status");
CREATE INDEX IF NOT EXISTS "dmca_reports_created_at_idx" ON "dmca_reports"("created_at");

CREATE TABLE IF NOT EXISTS "banned_hashes" (
  "id" UUID PRIMARY KEY,
  "sha256" TEXT NOT NULL,
  "p_hash_hex" TEXT,
  "reason" TEXT NOT NULL,
  "dmca_report_id" UUID REFERENCES "dmca_reports"("id") ON DELETE SET NULL,
  "banned_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "banned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "unbanned_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "unbanned_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "banned_hashes_sha256_idx" ON "banned_hashes"("sha256");
CREATE INDEX IF NOT EXISTS "banned_hashes_p_hash_hex_idx" ON "banned_hashes"("p_hash_hex");

-- New `moderation.manage` permission for the system admin role (idempotent).
UPDATE "roles"
SET "permissions" = "permissions" || ARRAY['moderation.manage']
WHERE "slug" = 'admin' AND NOT ("permissions" @> ARRAY['moderation.manage']);