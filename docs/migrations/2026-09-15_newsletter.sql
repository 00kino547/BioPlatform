-- Phase 3: Newsletter — subscriber + send-history tables, profile flags.
-- Mirrors apps/backend/prisma/schema.prisma models NewsletterSubscriber, NewsletterSend
-- and the Profile newsletter_* columns.

ALTER TABLE "profiles" ADD COLUMN "newsletter_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "newsletter_visible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "newsletter_heading" TEXT;

CREATE TABLE "newsletter_subscribers" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"      UUID NOT NULL REFERENCES "profiles" ("id") ON DELETE CASCADE,
  "email"           TEXT NOT NULL,
  "subscribed_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "agreed_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "tos_version"     TEXT NOT NULL,
  "privacy_version" TEXT NOT NULL,
  "unsubscribed_at" TIMESTAMPTZ,
  CONSTRAINT "newsletter_subscribers_profile_email_unique" UNIQUE ("profile_id", "email")
);
CREATE INDEX "newsletter_subscribers_profile_id_idx" ON "newsletter_subscribers" ("profile_id");
CREATE INDEX "newsletter_subscribers_email_idx" ON "newsletter_subscribers" ("email");

CREATE TABLE "newsletter_sends" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"      UUID NOT NULL REFERENCES "profiles" ("id") ON DELETE CASCADE,
  "subject"         TEXT NOT NULL,
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "success_count"   INTEGER NOT NULL DEFAULT 0,
  "sent_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "newsletter_sends_profile_id_sent_at_idx" ON "newsletter_sends" ("profile_id", "sent_at");