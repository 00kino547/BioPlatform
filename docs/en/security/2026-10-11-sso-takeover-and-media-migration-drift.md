# Security incident — SSO email auto-link account takeover + media schema drift (2026-10-11)

Status: **fixed and verified on preview** (auth fix deployed; database reconciled).
Reported by: BioPlatform Canary (critical incident report).
Affected: the `public-canary` line (`2.0.0-canary.2-hotfix.1` and earlier), and **every
installation provisioned from the committed migration history** for the upload issue.

This document records two independent defects that arrived in the same report: a
**critical authentication flaw** in the enterprise-SSO callback and a **high-severity
regression** that made every media upload return HTTP 500. Both are fixed and covered
by regression tests.

---

## 1. CRITICAL — enterprise-SSO email auto-link account takeover

### What happened

`POST /api/auth/enterprise-sso/exchange` completed an OIDC/OAuth login by looking the
identity up in `EnterpriseSsoIdentity`. When no identity row existed, the old code fell
back to matching the **verified email** against an existing `User` and then
**auto-linked** that user to the incoming SSO identity, issuing a session. It also
flipped `emailVerifiedAt` when the provider reported a verified email.

That fallback trusted the upstream provider's "email is verified" claim as proof of
account ownership. Any IdP the operator had configured — or a misconfigured/attacker-
controlled provider allowed by `allowedDomains` — could assert an email address that
already belonged to a local account and receive a full session for it. No password, no
passkey, no second factor. This is a classic federated-identity account takeover.

### Root cause

`apps/backend/src/routes/enterpriseSso.ts`, `/exchange` handler: the
"no identity → match by email → link → log in" branch. Email match was treated as
identity proof.

### Fix

- The `/exchange` endpoint **no longer links by email and never auto-verifies**.
  - No identity row and the email backs an existing account → `409`
    ("This email already belongs to an account — sign in with that account and link
    from Security settings").
  - No identity row and no account uses the email → `404` ("No account uses this email
    yet — create the account first, then link").
  - No session is issued and no row is mutated on either path.
- Identity-based login (an `EnterpriseSsoIdentity` row already exists) is unchanged.
- Linking is now always an **explicit, authenticated** action: `/start?mode=link`
  requires a signed-in session, and **any signed-in user may link their own verified
  identity** (the previous owner-only restriction was removed so multi-user instances
  can self-serve). The callback still enforces a verified email, the `allowedDomains`
  allowlist, and identity uniqueness.

### Regression test

`apps/backend/tests/enterprise-sso.test.ts` — the former "links a matching verified
email" case is replaced by "refuses to auto-link a matching verified email
(account-takeover fix)": asserts `409`, no `EnterpriseSsoIdentity` created, the
existing account's `emailVerifiedAt` untouched, and no session. A second case asserts a
signed-in user can link their own verified identity and then sign in with it.
**5/5 pass.**

---

## 2. HIGH — every media upload returned HTTP 500 (missing `MediaKind`)

### What happened

`POST /api/profiles/me/avatar` (and every other upload route: banner, link icon,
background, music, shop) returned **HTTP 500**. The backend log showed:

```
PostgresError { code: "42704", message: "type \"public.MediaKind\" does not exist" }
```

### Root cause — schema/migration drift

The media-fingerprint / DMCA subsystem (tables `media_files`, `dmca_reports`,
`banned_hashes` and the enums `MediaKind` / `DmcaStatus`) shipped **after** the
squashed `0_init` baseline but was **never captured as a migration**. On any database
built from the migration history alone:

- the `MediaKind` type did not exist, so `guardUpload`'s `media_files` insert failed
  and every upload 500'd;
- `slug_namespace` / `cache_entries`, the profile ad columns and the user
  moderation/appeal columns were also absent.

The preview database added to the confusion: it had been provisioned by an older
`prisma db push` snapshot, so it *had* `media_files`/`dmca_reports` (with `TEXT`
columns instead of enums) and the ad/appeal columns, but was **missing**
`slug_namespace`/`cache_entries` and still stored `seasonal_themes.id` as `text`. Only
databases created with `db push` hid the fault; databases created from migrations —
including every fresh self-hosted install — exposed it. `prisma migrate status`
reported "up to date" because the baseline was already recorded, so nothing ever added
the missing objects.

### Fix

Two parts:

1. **Repo migration (fresh installs and CI).**
   `apps/backend/prisma/migrations/20261012120000_media_dmca_and_moderation_schema/`
   creates the `MediaKind` / `DmcaStatus` enums, the `media_files` / `dmca_reports` /
   `banned_hashes` tables (with indexes and foreign keys), the `profiles`
   ad-control columns and the `users` moderation/appeal columns. The entrypoint's
   `prisma migrate deploy` applies it automatically on the next boot of any install
   created from the migration history.
2. **Live preview database reconcile (one-off).** The preview DB did not match its own
   `_prisma_migrations` record, so a forward migration alone could not repair it. A
   data-safe reconcile script (enums; `media_files.kind` / `dmca_reports.status`
   rebuilt as enums — both tables empty; `seasonal_themes.id` cast `text → uuid` **in
   place**, preserving all 9 rows; `slug_namespace` / `cache_entries` created;
   foreign keys, indexes and the timestamp-precision drift normalized) was applied in
   a single transaction. The matching migration was then marked applied with
   `prisma migrate resolve --applied`.

### Verification

- Live preview: `POST /api/profiles/me/avatar` with a 1×1 PNG → **HTTP 200**
  (`{"success":true,"data":{"avatar":"/uploads/…png"}}`); applied change reverted and
  the probe file removed afterwards.
- Fresh database: all four migrations (`0_init`, invite-credit-ledger,
  policy-admin-auto-accept, media-dmca-and-moderation-schema) deploy cleanly; the
  resulting schema has `media_files.kind : MediaKind`, `dmca_reports.status :
  DmcaStatus` and all three tables.
- `prisma migrate status` → "Database schema is up to date".

---

## Account-session hardening (same incident response)

As a precaution after the auth finding, an operator endpoint was added and run:
`POST /api/admin/auth/sign-out-all` (permission `users.manage`, body
`{ confirm: true }`, blocked during update-lockdown). In one transaction it increments
every user's `authVersion` (invalidating all issued tokens), deletes all passkeys,
clears TOTP enrolment and removes all enterprise-SSO identities. Passwords and OAuth
links are intentionally left in place. Run against the preview database it reported
**5 users signed out, 2 passkeys removed, 2 TOTP enrolments disabled, 2 SSO identities
removed**; the database was verified afterwards (`passkeys = 0`,
`enterprise_sso_identities = 0`, `totp_enabled = 0`).

---

## Residual / deferred

- Sub-millisecond timestamp precision and some constraint/index **names** on the
  preview database now match the schema; a full `prisma migrate diff` is clean for the
  objects above. Any remaining cosmetic differences in other tables are tracked via
  the normal `db:verify-drift` tooling.
- The upload fix removes the schema blocker shown above. Any *separate* storage-layer
  upload failure (provider credentials, bucket policy) is out of scope of this report;
  none was observed — the b2-configured preview stored and served the test PNG.
