BEGIN;

-- =====================================================================
-- Full invite system: per-role generation config, per-user event
-- allowance, invite bans, global toggle, and grant-event audit log.
-- =====================================================================

ALTER TABLE "users" ADD COLUMN "invite_allowance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "invite_allowance_expires_at" TIMESTAMP(3) WITHOUT TIME ZONE;
ALTER TABLE "users" ADD COLUMN "invite_last_generated_at" TIMESTAMP(3) WITHOUT TIME ZONE;
ALTER TABLE "users" ADD COLUMN "invite_banned" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "users" ADD COLUMN "invite_banned_at" TIMESTAMP(3) WITHOUT TIME ZONE;

ALTER TABLE "roles" ADD COLUMN "invite_batch_limit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "roles" ADD COLUMN "invite_outstanding_limit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "roles" ADD COLUMN "invite_cooldown_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "roles" ADD COLUMN "invite_default_expiry_days" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "roles" ADD COLUMN "invite_min_expiry_days" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "roles" ADD COLUMN "invite_max_expiry_days" INTEGER NOT NULL DEFAULT 365;

ALTER TABLE "invite_codes" ADD COLUMN "from_allowance" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "invite_codes" ADD COLUMN "refunded_at" TIMESTAMP(3) WITHOUT TIME ZONE;
CREATE INDEX IF NOT EXISTS "invite_codes_created_by_id_idx" ON "invite_codes" ("created_by_id");

CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "invite_grant_events" (
    "id" UUID NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "expiry_days" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invite_grant_events_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
      ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX "invite_grant_events_created_at_idx" ON "invite_grant_events" ("created_at");

COMMIT;
