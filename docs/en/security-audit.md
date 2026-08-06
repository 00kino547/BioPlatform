# Security Audit Report

> Full-stack security review of the auth system (backend, API, frontend, Docker/Nginx).
> Date: 2026-08-05 · Commits: see CHANGELOG "Unreleased → Security".

## Scope

- Backend: `app.ts`, `middleware/*`, `lib/*` (authGuard, rateLimit, webauthn, totp, validation, email, music), `routes/*` (auth, admin, invite, profile, analytics, email, music), `config/env.ts`, `prisma/schema.prisma`, `prisma/seed.ts`
- Frontend: `lib/api.ts`, `contexts/AuthContext.tsx`, pages (Login, Unlock, AdminDashboard), route guards
- Infra: `docker-compose.yml`, `nginx/nginx.conf`, Dockerfiles

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | High | Default admin credentials hardcoded in `seed.ts`; `ADMIN_PASSWORD` env var ignored | Fixed |
| 2 | High | Invite-code creation not admin-gated (`POST /api/invites` only required `requireAuth`) | Fixed |
| 3 | Medium | Public profile view / click tracking unthrottled → email-bombing + DB write abuse | Fixed |
| 4 | Medium | Invite code could be consumed twice under concurrent registrations (race) | Fixed |
| 5 | Medium | Email case not normalized on registration → case-variant duplicate accounts | Fixed |
| 6 | Low | `profile.ts` trusted the first `X-Forwarded-For` entry instead of `req.ip` | Fixed |
| 7 | Low | `referer` header stored unsanitized (violates input-sanitization rule) | Fixed |
| 8 | Low | Nginx lacked CSP / Permissions-Policy; Nginx version banner exposed | Fixed |
| 9 | Low | PostgreSQL port exposed on all interfaces in `docker-compose.yml` | Fixed |
| 10 | Info | Username/email enumeration via `/auth/login/start` (by design) | Documented |
| 11 | Info | Email unlock clears only the account ban, not fingerprint bans | Documented |
| 12 | Info | JWT stored in `localStorage` (XSS-exposed) — mitigated by new CSP | Documented |
| 13 | Info | No TLS/HSTS configured in Nginx (443 mapped but not served) | Recommended |
| 14 | Info | `theme` JSON accepts arbitrary CSS values (own-profile only) | Recommended |

## Fixed Findings

### 1. High — Default admin credentials (CVE-style predictable default)

`prisma/seed.ts` hardcoded `admin@bioplatform.com` / `admin123456` and ignored the
`ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars that `env.ts` already declared (defaulting to
the same weak password). Any deployment that ran the seed without explicit env vars got a
predictable admin account.

**Fix** (`prisma/seed.ts`, `config/env.ts`, `.env.example`):
- Seed now reads `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` from validated env.
- Seed refuses to run with a password shorter than 12 chars or equal to the known default
  `admin123456`.
- Added `ADMIN_USERNAME` to the env schema and `.env.example`; `.env` was regenerated with
  a strong 24-char admin password.

**Action for operators:** the pre-existing admin account created with the old default
still has the old hash — rotate it in production after deployment.

### 2. High — Invite minting was open to any authenticated user

`POST /api/invites` required only `requireAuth`, so any registered user could mint up to
50 invite codes at once, bypassing the invite-only registration gate. The only UI for
creating codes is the admin dashboard.

**Fix** (`routes/invite.ts`, `middleware/admin.ts`, `routes/admin.ts`):
- Extracted `requireAdmin` into `middleware/admin.ts` (reused by admin + invite routers).
- `POST /api/invites` now requires `requireAuth` **and** `requireAdmin`.

### 3. Medium — Unthrottled public tracking endpoints

`GET /api/profiles/:username` and `POST /api/profiles/click` are unauthenticated and
unthrottled. With `notifyOnView` / `notifyOnClick` + SMTP enabled, an attacker could
repeatedly hit them to spam a profile owner's inbox and flood the analytics tables.

**Fix** (`routes/profile.ts`): added an in-memory per-IP sliding-window limiter
(60 requests / minute) on both endpoints, with periodic map cleanup. (The existing
auth lock system already covers the `/api/auth/*` routes.)

### 4. Medium — Invite code double-use race

Two simultaneous registrations could both pass the `usedById === null` pre-check and
consume the same invite code.

**Fix** (`routes/auth.ts`): the registration transaction now consumes the code with a
conditional `updateMany({ where: { id, usedById: null, revokedAt: null } })` and aborts
the transaction if `count !== 1`, returning 409.

### 5. Medium — Email case normalization

`register` stored the email verbatim, so `User@Example.com` and `user@example.com` were
distinct accounts while login looked them up case-insensitively.

**Fix** (`routes/auth.ts`, `routes/admin.ts`): emails are lowercased on registration and on
admin user updates; duplicate registrations return 409 (also via `P2002` catch for the
race between the pre-check and insert).

### 6. Low — Trusted-client IP resolution

`profile.ts` parsed `X-Forwarded-For` manually and used its first (client-spoofable)
entry for analytics IPs and visitor IDs, while the auth system used Express `req.ip`
(trust-proxy aware). This made analytics IPs spoofable and was inconsistent.

**Fix** (`routes/profile.ts`): `getClientIp` / `getVisitorId` now use `req.ip`.

### 7. Low — Unsanitized referer

The `Referer` header was stored verbatim in `page_views.referer`, contrary to the
"sanitize all input before storage" rule.

**Fix** (`routes/profile.ts`): referer is run through `stripHtml` before storage.

### 8. Low — Missing security headers / Nginx version banner

Nginx had no `Content-Security-Policy` and no `Permissions-Policy`, and disclosed its
version. Given the JWT is stored in `localStorage`, a strict `script-src 'self'` CSP is
important defense-in-depth against XSS.

**Fix** (`nginx/nginx.conf`):
- `server_tokens off;`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; media-src 'self'; frame-src https://www.youtube-nocookie.com https://open.spotify.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), autoplay=(self)`

### 9. Low — PostgreSQL exposed to the host network

`docker-compose.yml` published `5432:5432` on all interfaces.

**Fix**: bind to loopback (`127.0.0.1:5432:5432`). Restart with `docker compose up -d`
to apply; backend/frontend containers reach Postgres over the internal network regardless.

## Verified Good (no change)

- bcrypt at 12 rounds everywhere (register, login, change-password, admin reset).
- JWT verify with a string secret (no `alg` confusion); token purposes checked for
  2FA and unlock flows.
- `requireAdmin` DB role check per request on all `/api/admin/*`.
- Strict Zod schemas; username allowlist; URL protocol allowlist; `stripHtml` on all
  free-text profile fields; platform allowlist.
- Auth rate limiting on all protected `/api/auth` POST routes with fingerprint
  (2-of-3) + account lockouts + trusted-IP policy.
- WebAuthn: server-side challenge store (5-min TTL), origin/RPID verification,
  duplicate credential check, counter updates.
- TOTP: 6-digit code, ±30 s window, secret never returned after setup.
- Uploads: random UUID filenames, size limits, extension allowlist, served with
  `X-Content-Type-Options: nosniff` (backend + Nginx).
- No `dangerouslySetInnerHTML` anywhere in the frontend; React escaping + backend
  sanitization are in place.
- `.env` is gitignored.

## Documented Risks / Recommendations

1. **User enumeration (info):** `/auth/login/start` returns `found: true/false` and the
   enabled methods; `/auth/login/passkey/options` returns 404 with a distinct message for
   unknown users. This is intentional for the username-first login UX. Accept as-is or
   return a uniform response and always allow the passkey flow.
2. **Email unlock scope (info):** `/auth/unlock/verify` clears only the account ban.
   Fingerprint (IP/cookie/UA) bans persist; under the default `trusted_ip` policy a user
   can still sign in from a registered/last-login IP, after which all bans reset. Documented
   behavior.
3. **Token storage (info):** the JWT lives in `localStorage` and is therefore reachable by
   any script running on the origin. The new CSP `script-src 'self'` is the compensating
   control. Moving to an HttpOnly cookie is a larger refactor and optional.
4. **TLS (addressed):** Nginx now serves HTTPS on 443. `TLS_MODE=development` auto-generates
   self-signed certs (`self-signed.pem`/`self-signed.key`) for dev; `TLS_MODE=production`
   deletes those and requires real certs in `./certs/`. HSTS is sent in production mode only
   (`SEND_HSTS_ON_DEV=true` opts in for dev). Deploy with real certs + HSTS in production.
5. **Theme CSS values (recommended):** `theme` fields accept arbitrary strings rendered via
   React inline styles. This is limited to the user's own profile; consider validating
   color/gradient/font-family patterns if theme sharing is ever added.
6. **JWT secret strength (addressed):** `JWT_SECRET` is now validated as ≥ 32 characters in
   `apps/backend/src/config/env.ts`; the backend refuses to boot with a weak secret.

## Verification

- `pnpm --filter @bioplatform/backend exec tsc --noEmit` ✓
- `pnpm --filter @bioplatform/backend exec eslint .` ✓
- `pnpm --filter @bioplatform/frontend exec tsc --noEmit` ✓
- `pnpm --filter @bioplatform/frontend exec eslint src` ✓ (3 pre-existing react-refresh warnings)
- Runtime: register (mixed-case email) → stored lowercase; duplicate email → 409;
  invite creation as non-admin → 403; `/api/profiles/*` → 60×200/404 then 429.
