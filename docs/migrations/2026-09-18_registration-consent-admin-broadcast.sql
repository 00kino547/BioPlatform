-- Registration consent + platform admin broadcast.
-- Mirrors apps/backend/prisma/schema.prisma: new User consent columns plus the
-- AdminNewsletterSend model.

ALTER TABLE "users"
  ADD COLUMN "accepted_tos_version"      TEXT,
  ADD COLUMN "accepted_privacy_version"  TEXT,
  ADD COLUMN "accepted_policies_at"      TIMESTAMPTZ,
  ADD COLUMN "newsletter_opt_in"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "newsletter_opt_in_at"      TIMESTAMPTZ,
  ADD COLUMN "broadcast_unsubscribed_at" TIMESTAMPTZ;

CREATE TABLE "admin_newsletter_sends" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "subject"         TEXT NOT NULL,
  "recipient_count" INTEGER NOT NULL,
  "success_count"   INTEGER NOT NULL,
  "sent_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "admin_newsletter_sends_sent_at_idx" ON "admin_newsletter_sends" ("sent_at");