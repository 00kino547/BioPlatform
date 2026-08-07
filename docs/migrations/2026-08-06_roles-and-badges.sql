BEGIN;

-- =====================================================================
-- Roles (replaces the `Role` enum on users.role)
-- =====================================================================

CREATE TABLE "roles" (
  "id"          UUID        NOT NULL,
  "name"        TEXT        NOT NULL,
  "slug"        TEXT        NOT NULL,
  "description" TEXT,
  "is_system"   BOOLEAN     NOT NULL DEFAULT false,
  "permissions" TEXT[]      NOT NULL DEFAULT '{}',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_name_key" ON "roles" ("name");
CREATE UNIQUE INDEX "roles_slug_key" ON "roles" ("slug");

INSERT INTO "roles" ("id", "name", "slug", "description", "is_system", "permissions", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Admin', 'admin', 'Full platform access', true,
   ARRAY['users.view','users.manage','profiles.manage','invites.manage','bans.manage','roles.manage','badges.manage','logs.view'],
   now(), now()),
  (gen_random_uuid(), 'User', 'user', 'Standard member', true, ARRAY[]::text[], now(), now());

ALTER TABLE "users" ADD COLUMN "role_id" UUID;

UPDATE "users" u
SET "role_id" = r.id
FROM "roles" r
WHERE r.slug = CASE WHEN u."role" = 'ADMIN' THEN 'admin' ELSE 'user' END;

ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

ALTER TABLE "users" DROP COLUMN "role";
DROP TYPE IF EXISTS "Role";

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "users_role_id_idx" ON "users" ("role_id");

-- =====================================================================
-- Badges (replaces the `Badge` enum on users.badges / profiles.badges)
-- =====================================================================

CREATE TABLE "badges" (
  "id"         UUID        NOT NULL,
  "slug"       TEXT        NOT NULL,
  "label"      TEXT        NOT NULL,
  "color"      TEXT        NOT NULL DEFAULT '#22c55e',
  "icon"       TEXT        NOT NULL DEFAULT 'Award',
  "is_system"  BOOLEAN     NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "badges_slug_key" ON "badges" ("slug");

INSERT INTO "badges" ("id", "slug", "label", "color", "icon", "is_system", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'dev',        'Developer',  '#a78bfa', 'Code',       true, now(), now()),
  (gen_random_uuid(), 'owner',      'Owner',      '#fbbf24', 'Crown',      true, now(), now()),
  (gen_random_uuid(), 'staff',      'Staff',      '#34d399', 'Wrench',     true, now(), now()),
  (gen_random_uuid(), 'moderator',  'Moderator',  '#38bdf8', 'Shield',     true, now(), now()),
  (gen_random_uuid(), 'verified',   'Verified',   '#4ade80', 'BadgeCheck', true, now(), now()),
  (gen_random_uuid(), 'premium',    'Premium',    '#e879f9', 'Gem',        true, now(), now()),
  (gen_random_uuid(), 'enterprise', 'Enterprise', '#fb923c', 'Building2',  true, now(), now());

CREATE TABLE "_BadgeToUser" (
  "A" UUID NOT NULL,
  "B" UUID NOT NULL,
  CONSTRAINT "_BadgeToUser_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_BadgeToUser_B_index" ON "_BadgeToUser" ("B");

ALTER TABLE "_BadgeToUser" ADD CONSTRAINT "_BadgeToUser_A_fkey"
  FOREIGN KEY ("A") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_BadgeToUser" ADD CONSTRAINT "_BadgeToUser_B_fkey"
  FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "_BadgeToUser" ("A", "B")
SELECT b.id, u.id
FROM "users" u
CROSS JOIN unnest(u."badges"::text[]) AS sv
JOIN "badges" b ON b.slug = sv;

CREATE TABLE "_BadgeToProfile" (
  "A" UUID NOT NULL,
  "B" UUID NOT NULL,
  CONSTRAINT "_BadgeToProfile_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_BadgeToProfile_B_index" ON "_BadgeToProfile" ("B");

ALTER TABLE "_BadgeToProfile" ADD CONSTRAINT "_BadgeToProfile_A_fkey"
  FOREIGN KEY ("A") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_BadgeToProfile" ADD CONSTRAINT "_BadgeToProfile_B_fkey"
  FOREIGN KEY ("B") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "_BadgeToProfile" ("A", "B")
SELECT b.id, p.id
FROM "profiles" p
CROSS JOIN unnest(p."badges"::text[]) AS sv
JOIN "badges" b ON b.slug = sv;

ALTER TABLE "users" DROP COLUMN "badges";
ALTER TABLE "profiles" DROP COLUMN "badges";
DROP TYPE IF EXISTS "Badge";

COMMIT;
