-- Phase 3: online payment gateways (Stripe, PayPal, crypto via BTCPay/BitPay adapters).
-- Extends the Phase 2 Order table; backfills nothing (no feature orders exist yet).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'STRIPE' AND enumtypid = '"OrderMethod"'::regtype) THEN
        ALTER TYPE "OrderMethod" ADD VALUE 'STRIPE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PAYPAL' AND enumtypid = '"OrderMethod"'::regtype) THEN
        ALTER TYPE "OrderMethod" ADD VALUE 'PAYPAL';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CRYPTO' AND enumtypid = '"OrderMethod"'::regtype) THEN
        ALTER TYPE "OrderMethod" ADD VALUE 'CRYPTO';
    END IF;
END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gateway_transaction_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gateway_status" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gateway_checkout_url" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "crypto_coin" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "crypto_amount" DECIMAL(18, 8);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "crypto_rate_usd" DECIMAL(20, 8);