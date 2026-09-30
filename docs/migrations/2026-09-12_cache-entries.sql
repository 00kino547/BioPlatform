-- Cache entries table for the pluggable CACHE_DRIVER=db backend.
CREATE TABLE IF NOT EXISTS "cache_entries" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "cache_entries_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "cache_entries_expires_at_idx" ON "cache_entries" ("expires_at");