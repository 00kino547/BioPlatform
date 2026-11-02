-- CreateTable
CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "processed_webhook_events_key_key" ON "processed_webhook_events"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "processed_webhook_events_gateway_processed_at_idx" ON "processed_webhook_events"("gateway", "processed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_gateway_transaction_id_idx" ON "orders"("gateway_transaction_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_purchases_gateway_transaction_id_idx" ON "product_purchases"("gateway_transaction_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invite_purchase_orders_gateway_transaction_id_idx" ON "invite_purchase_orders"("gateway_transaction_id");
