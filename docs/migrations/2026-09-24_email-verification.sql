-- Email verification (double opt-in for new local registrations).
--
-- Adds User.emailVerified / emailVerifiedAt. Existing accounts predate
-- verification, so they are backfilled to verified — nothing that was usable
-- before becomes locked out by the new login gate.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ;

-- Backfill: every pre-existing account is treated as verified.
UPDATE "users" SET "email_verified" = TRUE WHERE "email_verified" = FALSE;