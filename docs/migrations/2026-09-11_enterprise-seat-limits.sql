-- Enterprise team seat limits (M2)
-- Admin-managed per-user cap on consumed invites for gifted ENTERPRISE accounts
-- (tier assigned without a PAID order). NULL = unlimited (no cap enforced).
ALTER TABLE "users" ADD COLUMN "seat_limit" integer;