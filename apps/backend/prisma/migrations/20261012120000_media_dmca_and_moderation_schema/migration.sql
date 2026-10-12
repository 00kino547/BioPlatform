-- This migration adds the schema that shipped after the `0_init` baseline but
-- was never captured as a migration: the media fingerprint / DMCA takedown
-- subsystem (enums `MediaKind` and `DmcaStatus`, tables `media_files`,
-- `dmca_reports`, `banned_hashes`) plus the profile ad controls and the user
-- moderation/appeal columns.
--
-- Why this exists: `0_init` predates these features, so a database created
-- from the migration history alone was missing the `MediaKind` type. Every
-- upload path (avatar, banner, link icon, music, shop) touches `media_files`
-- and therefore failed at runtime with
-- `PostgresError 42704: type "public.MediaKind" does not exist`.
-- Databases provisioned with `prisma db push` happened to have the columns,
-- which is why the mismatch went unnoticed.

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('AVATAR', 'BANNER', 'LINK_ICON', 'BACKGROUND', 'MUSIC', 'SHOP_PREVIEW', 'SHOP_PRODUCT');

-- CreateEnum
CREATE TYPE "DmcaStatus" AS ENUM ('NEW', 'TAKEN_DOWN', 'DISMISSED', 'COUNTER_NOTICE');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "adblock_detector_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hide_ads" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "appeal_decision" TEXT,
ADD COLUMN     "appeal_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "appeal_submitted_at" TIMESTAMP(3),
ADD COLUMN     "appeal_text" TEXT,
ADD COLUMN     "disabled_at" TIMESTAMP(3),
ADD COLUMN     "disabled_notice_sent_at" TIMESTAMP(3),
ADD COLUMN     "disabled_reason" TEXT;

-- CreateTable
CREATE TABLE "media_files" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "profile_id" UUID,
    "kind" "MediaKind" NOT NULL,
    "sha256" TEXT NOT NULL,
    "p_hash_hex" TEXT,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmca_reports" (
    "id" UUID NOT NULL,
    "status" "DmcaStatus" NOT NULL DEFAULT 'NEW',
    "claimant_name" TEXT NOT NULL,
    "claimant_email" TEXT NOT NULL,
    "work_url" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "infringing_urls" JSONB NOT NULL,
    "contact_note" TEXT,
    "filed_by_user_id" UUID,
    "handled_by_id" UUID,
    "handled_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "counter_notice" TEXT,
    "counter_notice_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dmca_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_hashes" (
    "id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "p_hash_hex" TEXT,
    "reason" TEXT NOT NULL,
    "dmca_report_id" UUID,
    "banned_by_id" UUID,
    "banned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unbanned_by_id" UUID,
    "unbanned_at" TIMESTAMP(3),

    CONSTRAINT "banned_hashes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_files_sha256_idx" ON "media_files"("sha256");

-- CreateIndex
CREATE INDEX "media_files_p_hash_hex_idx" ON "media_files"("p_hash_hex");

-- CreateIndex
CREATE INDEX "media_files_user_id_idx" ON "media_files"("user_id");

-- CreateIndex
CREATE INDEX "media_files_profile_id_idx" ON "media_files"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_files_sha256_file_path_key" ON "media_files"("sha256", "file_path");

-- CreateIndex
CREATE INDEX "dmca_reports_status_idx" ON "dmca_reports"("status");

-- CreateIndex
CREATE INDEX "dmca_reports_created_at_idx" ON "dmca_reports"("created_at");

-- CreateIndex
CREATE INDEX "banned_hashes_sha256_idx" ON "banned_hashes"("sha256");

-- CreateIndex
CREATE INDEX "banned_hashes_p_hash_hex_idx" ON "banned_hashes"("p_hash_hex");

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dmca_reports" ADD CONSTRAINT "dmca_reports_filed_by_user_id_fkey" FOREIGN KEY ("filed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dmca_reports" ADD CONSTRAINT "dmca_reports_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_hashes" ADD CONSTRAINT "banned_hashes_dmca_report_id_fkey" FOREIGN KEY ("dmca_report_id") REFERENCES "dmca_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_hashes" ADD CONSTRAINT "banned_hashes_banned_by_id_fkey" FOREIGN KEY ("banned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_hashes" ADD CONSTRAINT "banned_hashes_unbanned_by_id_fkey" FOREIGN KEY ("unbanned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
