BEGIN;

-- =====================================================================
-- Affiliate/invite anti-abuse: store the registration fingerprint
-- (IP, auth cookie hash, user-agent hash) per user so a repeated claim
-- from the same device/network can be detected (same principle as the
-- auth blacklist's IP/COOKIE/UA fingerprinting).
-- =====================================================================

ALTER TABLE "users" ADD COLUMN "registered_fingerprint" TEXT;
ALTER TABLE "users" ADD COLUMN "registered_user_agent_hash" TEXT;

-- These columns are nullable and should never be indexed globally
-- (only matched point-wise in a referral/invite check), so no index.

COMMIT;