BEGIN;

-- A4: session invalidation — bump this per-user counter whenever credentials
-- change (password change, admin password reset). JWTs carry the counter at
-- issue time; authenticated requests are rejected once the DB counter moves
-- past the counter embedded in the token. For pre-existing rows the default 0
-- matches tokens issued before this migration.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_version" INTEGER NOT NULL DEFAULT 0;

COMMIT;