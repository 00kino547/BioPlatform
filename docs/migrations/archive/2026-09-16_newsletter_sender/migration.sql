-- AlterTable
ALTER TABLE "users" ADD COLUMN "newsletter_sender_whitelisted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "newsletter_senders" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "smtp_host" TEXT NOT NULL,
    "smtp_port" INTEGER NOT NULL DEFAULT 587,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_user" TEXT,
    "smtp_pass_enc" TEXT,
    "verification_token" TEXT,
    "verified_at" TIMESTAMPTZ,
    "tested_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "newsletter_senders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_senders_profile_id_key" ON "newsletter_senders"("profile_id");

-- AddForeignKey
ALTER TABLE "newsletter_senders" ADD CONSTRAINT "newsletter_senders_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;