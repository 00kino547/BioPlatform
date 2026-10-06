BEGIN;

-- =====================================================================
-- Affiliate/referral program: per-user discount, referral edge, and an
-- idempotent ledger of granted milestone rewards.
-- =====================================================================

ALTER TABLE "users" ADD COLUMN "discount_percent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "discount_expires_at" TIMESTAMP(3) WITHOUT TIME ZONE;
ALTER TABLE "users" ADD COLUMN "referred_by_id" UUID;

CREATE TABLE "affiliate_rewards" (
    "id" UUID NOT NULL PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "ref" TEXT,
    "created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "affiliate_rewards_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id")
      ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "affiliate_rewards_user_id_idx" ON "affiliate_rewards" ("user_id");
CREATE UNIQUE INDEX "affiliate_rewards_user_id_kind_level_key" ON "affiliate_rewards" ("user_id", "kind", "level");
CREATE INDEX "users_referred_by_id_idx" ON "users" ("referred_by_id");

COMMIT;