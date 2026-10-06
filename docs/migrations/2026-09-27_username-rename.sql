BEGIN;

-- @username change: record the last time a user renamed their handle so the
-- 30-day rename cooldown can be enforced. NULL = never renamed (no cooldown).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_username_change_at" TIMESTAMP(3);

COMMIT;