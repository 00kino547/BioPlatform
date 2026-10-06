-- Invite credit ledger + paid-invite provenance.
--
-- `user.invite_allowance` is a bare counter with no record of where its credits
-- came from, which makes both a refund and an expiry unresolvable. This adds a
-- durable grant ledger and tags invite codes with the grant that funded them.
--
-- NOTE ON TABLE OWNERSHIP: this migration performs a bulk UPDATE on `invite_codes`.
-- That table is owned by the same role the application connects as, so the
-- rewrite is permitted. If this migration is ever applied by a role that does not
-- own the table, grant ownership first rather than silently skipping the backfill.

-- CreateEnum
CREATE TYPE "InviteCreditSource" AS ENUM ('EVENT', 'AFFILIATE', 'PURCHASED', 'REFUND');

-- AlterTable: a guest invite purchase mints codes before the buyer has an
-- account, so the codes have no creator until they are claimed. Every other code
-- keeps its NOT NULL creator.
ALTER TABLE "invite_codes" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable: paid-invite provenance on codes
ALTER TABLE "invite_codes"
  ADD COLUMN "purchased" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "purchased_at" TIMESTAMP(3),
  ADD COLUMN "source_grant_id" UUID;

-- CreateTable: the credit grant ledger
CREATE TABLE "invite_credit_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "InviteCreditSource" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "order_id" TEXT,
    "recovered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_credit_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invite_credit_grants_user_id_idx" ON "invite_credit_grants"("user_id");

-- CreateIndex
CREATE INDEX "invite_credit_grants_order_id_idx" ON "invite_credit_grants"("order_id");

-- CreateIndex
CREATE INDEX "invite_credit_grants_source_expires_at_recovered_at_idx" ON "invite_credit_grants"("source", "expires_at", "recovered_at");

-- CreateIndex: serves the resale listing and the ban sweep
CREATE INDEX "invite_codes_created_by_id_purchased_used_at_revoked_at_idx" ON "invite_codes"("created_by_id", "purchased", "used_at", "revoked_at");

-- AddForeignKey
ALTER TABLE "invite_credit_grants" ADD CONSTRAINT "invite_credit_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_source_grant_id_fkey" FOREIGN KEY ("source_grant_id") REFERENCES "invite_credit_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: pre-existing allowance-funded codes are marked purchased so the UI
-- does not show an inconsistent mix. They keep `source_grant_id = NULL`, which
-- the expiry-restore path treats as "no ledger row, leave the counter alone" —
-- so this backfill never causes a legacy balance to be restored or double-counted.
UPDATE "invite_codes"
SET "purchased" = true,
    "purchased_at" = CURRENT_TIMESTAMP
WHERE "from_allowance" = true;
-- CreateTable: paid invite purchases
CREATE TABLE "invite_purchase_orders" (
    "id" TEXT NOT NULL,
    "user_id" UUID,
    "buyer_email" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "OrderMethod" NOT NULL DEFAULT 'MANUAL',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_transaction_id" TEXT,
    "gateway_status" TEXT,
    "gateway_checkout_url" TEXT,
    "crypto_coin" TEXT,
    "crypto_amount" DECIMAL(18,8),
    "crypto_rate_usd" DECIMAL(20,8),
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "codes_notified_at" TIMESTAMP(3),
    "claimed_by_id" UUID,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invite_purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invite_purchase_orders_user_id_idx" ON "invite_purchase_orders"("user_id");
CREATE INDEX "invite_purchase_orders_status_idx" ON "invite_purchase_orders"("status");

ALTER TABLE "invite_purchase_orders" ADD CONSTRAINT "invite_purchase_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_purchase_orders" ADD CONSTRAINT "invite_purchase_orders_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
