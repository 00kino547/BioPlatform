BEGIN;

-- =====================================================================
-- Purge auth_bans rows that never represented an active ban.
--
-- Before the backend change, recordFailure() upserted an auth_bans row
-- for EVERY failed attempt (fail_count 1..3), and recordSuccess() reset
-- the counters to 0 while keeping the row. Rows persisted for IPs, auth
-- cookies and user agents that were never locked out. This bloats the
-- table and pollutes the admin Bans panel with rows that have an unban /
-- unlock action but hold no actual ban.
--
-- After this change the backend only persists a row once a real lockout
-- occurs (permanent = true, or locked_until in the future). This purge
-- removes the pre-existing rows that are not active bans: non-permanent
-- rows with no future expiry (which also covers counters zeroed by a
-- later successful login).
-- =====================================================================

DELETE FROM "auth_bans"
WHERE "permanent" = false
  AND ("locked_until" IS NULL OR "locked_until" <= now());

COMMIT;