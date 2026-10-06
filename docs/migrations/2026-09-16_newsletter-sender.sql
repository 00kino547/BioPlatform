-- Own-SMTP newsletter deliverer: per-profile SMTP sender with DNS (TXT) and
-- SMTP-test verification, plus an admin allowlist flag on the user account.
-- Mirrors apps/backend/prisma/schema.prisma model NewsletterSender and the
-- User.newsletterSenderWhitelisted column.

ALTER TABLE "users" ADD COLUMN "newsletter_sender_whitelisted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "newsletter_senders" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"         UUID NOT NULL UNIQUE REFERENCES "profiles" ("id") ON DELETE CASCADE,
  "from_name"          TEXT NOT NULL,
  "from_email"         TEXT NOT NULL,
  "smtp_host"          TEXT NOT NULL,
  "smtp_port"          INTEGER NOT NULL DEFAULT 587,
  "smtp_secure"        BOOLEAN NOT NULL DEFAULT false,
  "smtp_user"          TEXT,
  "smtp_pass_enc"      TEXT,
  "verification_token" TEXT,
  "verified_at"        TIMESTAMPTZ,
  "tested_at"          TIMESTAMPTZ,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);