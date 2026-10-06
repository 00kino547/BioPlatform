-- Phase 5: Product shop — product catalog + purchase ledger + per-profile
-- discount/promo config. Mirrors apps/backend/prisma/schema.prisma models
-- Product/ProductPurchase and the Profile.shopDiscountPercent column.

ALTER TABLE "profiles" ADD COLUMN "shop_discount_percent" INTEGER;

CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');
CREATE TYPE "PurchaseMethod" AS ENUM ('STRIPE', 'PAYPAL', 'CRYPTO', 'FREE');

CREATE TABLE "products" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"     UUID NOT NULL REFERENCES "profiles" ("id") ON DELETE CASCADE,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "price_cents"    INTEGER NOT NULL,
  "enabled"        BOOLEAN NOT NULL DEFAULT true,
  "file_path"      TEXT NOT NULL,
  "file_name"      TEXT NOT NULL,
  "file_size"      INTEGER NOT NULL,
  "preview_image"  TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "products_profile_id_idx" ON "products" ("profile_id");

CREATE TABLE "product_purchases" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id"           UUID NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
  "buyer_user_id"        UUID REFERENCES "users" ("id") ON DELETE SET NULL,
  "buyer_email"          TEXT,
  "title"                TEXT NOT NULL,
  "file_name"            TEXT NOT NULL,
  "file_path"            TEXT NOT NULL,
  "file_size"            INTEGER NOT NULL,
  "method"               "PurchaseMethod" NOT NULL,
  "status"               "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "currency"             TEXT NOT NULL DEFAULT 'USD',
  "base_price_cents"     INTEGER NOT NULL,
  "discount_percent"     INTEGER NOT NULL DEFAULT 0,
  "final_price_cents"    INTEGER NOT NULL,
  "gateway_transaction_id" TEXT,
  "gateway_status"         TEXT,
  "gateway_checkout_url"   TEXT,
  "crypto_coin"            TEXT,
  "crypto_amount"          DECIMAL(18, 8),
  "crypto_rate_usd"        DECIMAL(20, 8),
  "invoice_id"             TEXT UNIQUE,
  "paid_at"                TIMESTAMPTZ,
  "refunded_at"            TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "product_purchases_product_id_idx" ON "product_purchases" ("product_id");
CREATE INDEX "product_purchases_buyer_user_id_idx" ON "product_purchases" ("buyer_user_id");
CREATE INDEX "product_purchases_status_idx" ON "product_purchases" ("status");