-- Track when a passkey last proved it is discoverable (resident). Discoverability
-- can only be positively verified by a successful authentication using the empty
-- allowCredentials (discoverable) flow; this timestamp is refreshed on such logins
-- and never derived from registration claims.
--   resident_verified_at: TIMESTAMPTZ | NULL
--     NULL      → never verified via a discoverable login
--     < TTL     → verified but outside PASSKEY_RESIDENCY_TTL_DAYS (stale)
--     >= TTL    → freshly verified within the TTL window
ALTER TABLE passkeys
  ADD COLUMN IF NOT EXISTS resident_verified_at TIMESTAMPTZ;