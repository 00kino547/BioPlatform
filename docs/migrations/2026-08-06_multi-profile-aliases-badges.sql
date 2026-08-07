BEGIN;

CREATE TYPE "Badge" AS ENUM ('DEV', 'OWNER', 'STAFF', 'MODERATOR', 'VERIFIED', 'PREMIUM', 'ENTERPRISE');

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_limit" INTEGER,
  ADD COLUMN IF NOT EXISTS "alias_limit" INTEGER,
  ADD COLUMN IF NOT EXISTS "badges" "Badge"[] NOT NULL DEFAULT '{}';

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "badges" "Badge"[] NOT NULL DEFAULT '{}';

UPDATE "profiles" p SET "slug" = u.username, "is_primary" = true
FROM "users" u WHERE p.user_id = u.id AND p.slug IS NULL;

ALTER TABLE "profiles" ALTER COLUMN "slug" SET NOT NULL;

DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT slug FROM "profiles" GROUP BY slug HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'Duplicate slug % after backfill; resolve manually', dup.slug;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "profiles_slug_key" ON "profiles" ("slug");

CREATE TABLE "profile_aliases" (
  "id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "profile_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profile_aliases_slug_key" ON "profile_aliases" ("slug");
CREATE INDEX "profile_aliases_profile_id_idx" ON "profile_aliases" ("profile_id");

ALTER TABLE "discord_connections" ADD COLUMN IF NOT EXISTS "profile_id" UUID;

UPDATE "discord_connections" dc SET "profile_id" = p.id
FROM "users" u
JOIN "profiles" p ON p.user_id = u.id AND p.is_primary = true
WHERE dc.user_id = u.id AND dc.profile_id IS NULL;

DO $$
DECLARE
  orphan RECORD;
BEGIN
  FOR orphan IN SELECT id FROM "discord_connections" WHERE profile_id IS NULL
  LOOP
    RAISE EXCEPTION 'Discord connection % has no matching profile', orphan.id;
  END LOOP;
END $$;

ALTER TABLE "discord_connections" ALTER COLUMN "profile_id" SET NOT NULL;
CREATE UNIQUE INDEX "discord_connections_profile_id_key" ON "discord_connections" ("profile_id");
CREATE INDEX "discord_connections_profile_id_idx" ON "discord_connections" ("profile_id");
DROP INDEX IF EXISTS "discord_connections_user_id_idx";
ALTER TABLE "discord_connections" DROP COLUMN IF EXISTS "user_id";

ALTER TABLE "profile_aliases" ADD CONSTRAINT "profile_aliases_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "discord_connections" ADD CONSTRAINT "discord_connections_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
