-- Operator accounts: record deemed acceptance of the Terms / Privacy Policy.
--
-- The consent gate refuses every authenticated call until an account accepts the
-- current POLICY_VERSIONS. That is correct for customers, but it also locked the
-- admin account out of the panel it administers for the full 30-day review window
-- after each policy bump — the platform had become unadministrable by the person
-- who runs it, discovered here while verifying the paid-invite flow end to end.
--
-- This column records *how* an acceptance came about. It defaults to false, so
-- every existing acceptance keeps meaning exactly what it meant before: a person
-- clicked accept. Only the new operator auto-accept rule sets it, and it still
-- respects the 30-day deemed-acceptance window rather than accepting immediately.
--
-- Additive only: a new nullable-free column with a constant default, so this is
-- safe to apply to a live database and needs no backfill.
ALTER TABLE "users"
  ADD COLUMN "policies_auto_accepted" BOOLEAN NOT NULL DEFAULT false;
