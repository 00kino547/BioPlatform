-- Phase 2: manual billing orders (checkout placeholder before gateways)
-- Adds the Order table + enums. Contact-method config reuses system_settings.

CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE "OrderMethod" AS ENUM ('MANUAL');

CREATE TABLE "orders" (
    "id"           UUID        NOT NULL,
    "user_id"      UUID        NOT NULL,
    "plan"         "UserTier"  NOT NULL,
    "method"       "OrderMethod" NOT NULL DEFAULT 'MANUAL',
    "status"       "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency"     TEXT        NOT NULL DEFAULT 'USD',
    "base_price_cents"   INTEGER NOT NULL,
    "discount_percent"   INTEGER NOT NULL DEFAULT 0,
    "final_price_cents"  INTEGER NOT NULL,
    "admin_note"   TEXT,
    "paid_at"      TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");

ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;