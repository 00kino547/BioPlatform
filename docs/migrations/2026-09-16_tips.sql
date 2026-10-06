-- Phase 4: Tips — tip ledger table + profile wallet/visibility flags.
-- Mirrors apps/backend/prisma/schema.prisma models Tip/TipStatus and the
-- Profile tips_* columns.

ALTER TABLE "profiles" ADD COLUMN "tips_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "tips_heading" TEXT;
ALTER TABLE "profiles" ADD COLUMN "tips_btc_address" TEXT;
ALTER TABLE "profiles" ADD COLUMN "tips_ltc_address" TEXT;

CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "tips" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL REFERENCES "profiles" ("id") ON DELETE CASCADE,
  "coin"       TEXT NOT NULL,
  "amount"     DECIMAL(18, 8) NOT NULL,
  "name"       TEXT,
  "message"    TEXT,
  "status"     "TipStatus" NOT NULL DEFAULT 'PENDING',
  "source"     TEXT NOT NULL DEFAULT 'address',
  "invoice_id" TEXT UNIQUE,
  "paid_at"    TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "tips_profile_id_created_at_idx" ON "tips" ("profile_id", "created_at");