# DECISIONS.md

> Architecture decisions — WHY, not HOW.

## Monorepo with apps/ and packages/

- `apps/` for deployable apps, `packages/` for shared libs
- pnpm workspaces manage cross-package deps

## pnpm v11

- `allowBuilds` and `node-linker: hoisted` in `pnpm-workspace.yaml`
- `.npmrc` is auth/registry-only
- Hoisted layout for Docker compatibility

## Backend single-stage Dockerfile

- pnpm symlinks break multi-stage COPY of Prisma client
- Single-stage avoids symlink issues

## StorageProvider abstraction

- Interface in `packages/shared/src/storage/types.ts`
- Methods: `upload`, `delete`, `getSignedUrl`
- Add providers by implementing the interface

## Zod-based env validation

- Fail fast on missing/invalid env vars
- Single source of truth: `apps/backend/src/config/env.ts`

## Dark mode by default

- Matches premium aesthetic (guns.lol, fakecrime.bio)
- CSS variables in `index.css`, `.dark` class on `<html>`

## CSS animations over framer-motion

- framer-motion adds ~30KB gzipped
- CSS animations are GPU-accelerated
- IntersectionObserver handles triggers

## IntersectionObserver scroll-reveal

- No external animation library needed
- CSS transitions for GPU-accelerated reveals
- Staggered reveals via `delay` prop

## Bento grid for Features

- Varied card spans create visual hierarchy
- Matches premium SaaS sites

## Gradient border on pricing card

- `background-clip: border-box` for distinct highlight
- Gradient: violet → cyan → violet

## Configurable branding via env vars

- All branding in `VITE_*` env vars
- `apps/frontend/src/config/branding.ts` reads `import.meta.env`
- Navbar, Hero, Footer, FAQ, SEO all use `branding.*`

## Docker: copy source before install

- pnpm hoisted `node_modules` creates symlinks in workspace packages
- Docker COPY cannot follow these symlinks
- Solution: copy source code before `pnpm install`

## Relative API URLs through Nginx proxy

- Frontend uses `VITE_API_URL=/api` (relative, not absolute)
- Nginx proxies `/api/` to backend, eliminating CORS entirely
- Backend `CORS_ORIGIN` is fallback for local dev only

## bcrypt at 12 rounds always

- Used in register, change-password, admin reset-password
- Never stores plaintext passwords
- 12 rounds is the OWASP-recommended default

## Multer: extension-only file filter

- Checks file extension (not MIME types) against allowlist
- `ALLOWED_EXTS = .jpeg, .jpg, .png, .gif, .webp`
- 5MB limit per file
- `handleUpload()` wrapper catches MulterError codes with specific messages

## Invite codes use soft revoke

- `revokedAt` field on InviteCode model
- Codes are never deleted, only revoked
- Revoked codes cannot be used for registration

## Auto-profile creation on registration

- `POST /api/auth/register` creates a blank Profile in the same transaction
- Prevents "profile not found" errors for new users

## Private profiles with optional JWT on public endpoint

- Owner can see private profile via JWT in Authorization header
- Public endpoint (`GET /profiles/:username`) optionally reads JWT
- Non-owners get 404 for private profiles

## Platform icons as inline SVGs

- No external icon library for brand icons (lucide-react doesn't have them)
- `PlatformIcon` component renders SVG per platform
- Accepts `color` prop for theme adaptation
- Falls back to first letter for unknown platforms

## Email platform: mailto: normalization

- Frontend auto-prepends `mailto:` when adding email links
- Backend normalizes email to `mailto:` prefix on save
- Public profile opens mail client instead of new tab

## Discord: username + invite link support

- Accepts new Discord usernames (2-32 chars, lowercase, no discriminator)
- Accepts invite URLs: `discord.gg/x`, `discord.com/invite/x`
- Usernames stored as plain text, not clickable on public profile
- Invite links stored as full URLs, clickable on public profile

## Input sanitization on write

- `stripHtml()` removes `<`, `>`, `{`, `}` characters from text fields
- Applied to displayName, bio, location, and social link URLs via Zod transforms
- Defense-in-depth: React already escapes JSX content, but sanitization prevents stored XSS in edge cases

## Platform allowlist on backend

- Only known platform names accepted (Twitter, GitHub, YouTube, etc.)
- Zod `.refine()` on `platform` field rejects unknown values
- Prevents injection of arbitrary platform data into the database

## Theme presets stored as JSON

- Profile `theme` field is a JSON object with bg, cardBg, text, accent, fontFamily
- 8 built-in presets selectable in Dashboard Appearance tab
- PublicProfile applies theme via inline styles
- Default theme (Midnight) applied when no theme is set

## Badge ordering stored server-side

- Display order persisted as `Profile.badgeOrder String[]` (default `[]`) — not a client-side preference
- One shared `orderBadges()` helper applies the order in every representation (own-profile serializer, badge toggle response, public profile, OG card/page) so there is no duplicated ordering logic
- `badgeOrder` holds only badge ids; unknown/stale ids are inert at render time, and new badges automatically follow the ordered ones — so toggling badges on/off never corrupts the saved order
- The order endpoint validates that every submitted id is currently on the profile (400 on unknown/duplicate ids) so arbitrary orderings can't be stored
- Drag-and-drop uses native HTML5 drag events (no drag library), matching the CSS-over-libraries direction of the project

## Analytics: PageView and LinkClick models

- Separate models for page views and link clicks (not combined)
- Indexed on `(profileId, createdAt)` for fast time-range queries
- Fire-and-forget writes (`.catch(() => {})`) to avoid blocking responses
- IP and UserAgent stored for basic analytics (no full request logging)
- 30-day, 7-day, 24-hour breakdowns in the stats API
- Bar charts rendered with pure CSS (no chart library)

## Email notifications: per-user SMTP settings

- Email settings stored as JSON in Profile model (not env vars)
- Supports Gmail preset (service: "gmail" with App Password) and custom SMTP
- nodemailer for transport (widely used, battle-tested)
- Test endpoint sends a real email to verify configuration
- Settings are per-user, not global — each user configures their own SMTP

## Music player: embeds over API keys

- No API keys for Spotify/YouTube — URLs are parsed server-side into embed URLs
- Spotify: open/embed URLs and `spotify:` URIs → `open.spotify.com/embed/...`
- YouTube: watch/shorts/youtu.be/embed URLs → `www.youtube-nocookie.com/embed` (privacy-enhanced — no third-party cookies; embeds never set tracking cookies on the visitor)
- Local uploads: extension-only filter (`.mp3 .opus .ogg .wav .m4a .flac .aac .webm .oga`), 25MB limit

## Music: full-version streaming source (`MusicTrack.fullUrl`)

- Spotify embeds only play 30-second previews unless the viewer has Premium — an inherent platform restriction
- Creators may supply an optional `fullUrl` so visitors can hear the full song, at the creator's own risk
- `fullUrl` accepted for ALL providers (local, Spotify, YouTube); rendered as a "Play full version" player/button when present
- Full-version URL accepts http/https only; YouTube URLs normalized via `parseYouTubeUrl`; direct audio file URLs (`.mp3 .opus .ogg .wav .m4a .flac .aac .webm .oga`) and any http(s) URL kept as-is
- Stored in `MusicTrack.fullUrl String? @map("full_url")`; nullable, cleared with explicit `null` on PATCH
- Terms of Service (section 5) discloses that a "full version" source relying on the creator's own account/session may violate the third-party platform's TOS — creator assumes full responsibility
- Spotify player UI renders a full-width accent "Open in Spotify" button under the embed (embed URL → open URL by replacing `/embed/` with `/`)

## Tier-based track limits

- `UserTier` enum: FREE (2 tracks), PRO (5), ENTERPRISE (10) in `DEFAULT_LIMITS`
- Admin can override per-user via `trackLimit` (int 0-100, nullable)
- Enforcement on the backend in the music routes (create/upload), not just UI

## MusicTracks ordered by position

- `position` integer column for ordering, `@@index([profileId])`
- Reorder via transaction (`POST /music/reorder`)
- Public profile includes `musicTracks` ordered by position, inserted below bio and above links
- Public music player re-sorts for playback: YouTube tracks first, then Spotify, then local (user's saved order is preserved in the DB)
- Local file cleanup on delete (unlink from disk when track removed)

## Music: autoplay behavior

- Active track autoplays on all three providers: local `<audio autoPlay>`, Spotify embed `autoplay=true`, YouTube embed `autoplay=1`
- `mute=1` is NOT set on the YouTube embed — the browser may still mute unmuted autoplay without user interaction, but we don't force it
- Full-version player does NOT autoplay (avoids double playback with the main player)

## Two-factor authentication: TOTP + WebAuthn passkeys

- Two independent second factors: TOTP via authenticator apps and passkeys via WebAuthn
- `otplib` for TOTP (maintained, small) and `@simplewebauthn/server` + `@simplewebauthn/browser` for WebAuthn (de-facto standard)
- Password sign-in no longer returns a full JWT when 2FA is enabled — it issues a short-lived (5 min) `purpose: "twofactor"` token that must be redeemed with a valid TOTP code or passkey assertion
- WebAuthn challenges are stored server-side (`WebAuthnChallenge`, 5 min TTL) and consumed once; origin, RP ID, and challenge are always verified server-side

## Passkey resident vs non-resident

- Resident (discoverable) credentials are stored on the authenticator and enable true passwordless login — the user can sign in without typing a username because the credential is discoverable (empty/omitted `allowCredentials`)
- Non-resident credentials are re-derived each time from a key handle; the server must list the credential in `allowCredentials`, so the user must be identified first — this is the classic security-key / second-factor style (a credential is "a passkey" only if it is discoverable)
- Users choose between Non-resident (2FA / security key, `residentKey: "discouraged"`, default) and Resident (Passwordless, `residentKey: "preferred"`)
- "Preferred" (not "required") lets the authenticator fall back to a non-resident credential when the device can't create a resident one (e.g. YubiKey with full resident slots)
- Non-resident is the default because resident credentials consume limited on-device slots; our login is username-first and always enumerates credentials by ID (`allowCredentials`), so non-resident keys work fine as passwordless-in-practice there too — the resident choice only adds username-less sign-in

## TOTP secret lifecycle

- `User.totpSecret` is generated and stored before verification, then `totpEnabled` flips true only after a correct 6-digit code is entered (classic verify-and-enable flow)
- Disabling requires the current code
- Secret is a Base32 string generated with `otplib`; QR encodes a standard `otpauth://totp/{rpName}:{username}` URI

## Auth anti-brute-force: fingerprint + account locking

- Three fingerprints per request: client IP (`req.ip` with `TRUST_PROXY`), a server-signed HttpOnly cookie (`bio_sid`, random UUID, sha256-hashed in the DB), and the User-Agent header
- **2-of-3 rule:** a request is blocked only when ≥2 of its 3 fingerprints are locked or permanently banned — a single banned fingerprint is allowed through (protects CG-NAT users and shared browsers)
- **Free attempts:** 3 failed attempts per fingerprint and per account are free; the 4th failure applies the lock
- **Lock duration is uniform and configurable:** `AUTH_LOCK_DURATION_MINUTES` (default `-1` = permanent). There are no escalating tiers — a lock is either permanent or lasts exactly the configured duration; `-1` means a lock persists until a successful auth, an email unlock, or an admin unban
- Failures are counted only on *responses*: a locked request is rejected before the route runs, so counters climb only as lockouts expire
- A successful auth (token issued, or password verified into the 2FA step) resets the fingerprint and account counters and deletes the account's failed auth-log entries; success also records `User.lastLoginIp`
- `User.registeredIp` is captured at registration
- **Account lock policy (`AUTH_LOCK_POLICY`)** decides how a locked account can be used again:
  - `block` — a locked account rejects every sign-in attempt until the lock ends or an admin unbans
  - `trusted_ip` (default) — the account's `registeredIp` or `lastLoginIp` can still sign in **without** unlocking; a successful trusted-IP sign-in clears the lock, so a user who mistypes their password repeatedly can't permanently lock themselves out (and an attacker can't DoS the account from its own IP)
  - `email` — a locked account can only be recovered via a signed unlock link emailed to the account address (`POST /auth/unlock` → email → `POST /auth/unlock/verify`); requires SMTP, and trusted IPs provide no bypass (strongest protection)
- **Auth log:** every rejected/failed attempt is recorded in `AuthLog` (timestamp, username, IP, hashed User-Agent, cookie fingerprint, reason, penalty minutes / permanent, trigger) and surfaced in the admin panel
- **Storage hygiene:** successful auth deletes the account's failed entries immediately; a background job prunes expired (`expiresAt < now`) and retention-aged entries on `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` — the middleware never computes expiry on request
- **App-level enforcement:** bans live in the `AuthBan` table and are enforced in the API layer (403 for permanent, 429 + `Retry-After` for temporary) — no host firewall/iptables, since the backend is a Docker container; only admins can unban via the admin panel
- **Admin unlock = full restore:** `POST /api/admin/auth-unlock` deletes the account's `ACCOUNT` ban **and** the `IP`/`COOKIE` bans recorded against that account in `AuthLog`, plus its failed entries. Deleting only the account row is not enough — the same attacker fingerprint (e.g. IP + cookie + UA) is banned under the 2-of-3 rule, so a "full" unlock clears the fingerprint too. `UA` bans are left in place (the log stores only the hashed UA, so they can't be matched reliably) but a single leftover UA ban can never satisfy the 2-of-3 rule alone
- The rate limiter fails **open** on DB errors so an outage can never lock everyone out
- Block messages are generic and identical regardless of the reason, avoiding account-enumeration feedback; `/unlock` also returns success for unknown accounts so it can't be used to probe for valid usernames
- **Version checker:** the backend periodically checks GitHub for newer releases (cached, severity-computed, `UPDATE_CHECK_INCLUDE_PRERELEASES` opt-in), and the admin panel surfaces an "update available" notice — see TASKS.md

## Cloudflare & CDN compatibility

- **All static assets served through `/uploads/`** — Cloudflare caches these via the existing upload serving middleware (proper `Cache-Control` and ETag headers). New uploads (favicon images, future product files) reuse this path.
- **Public API endpoints set `Cache-Control: public, max-age=...`** — same pattern as `/api/landing/config` (60s), `/api/captcha/config`, etc. The new `/api/features` endpoint follows this.
- **Client-side generation preferred over server rendering** — QR codes, profile decorations, etc. are rendered client-side where possible to avoid server load and CDN invalidation complexity.
- **Media proxy remains CF-safe** — the existing `/api/media/proxy` (SSRF-safe, nosniff, same-site CORP) is the only way external images are loaded; no CSP relaxation for Cloudflare-proxied URLs.
- **Redis cache invalidation** — new read-heavy endpoints (feature flags, aggregate link stats) cache via the existing `getCacheDriver()` abstraction; TTLs match the existing pattern (60–300s for volatile config, 24h for immutable assets).

## Feature flags (opt-in by instance owner)

- **Pattern:** boolean env vars (e.g. `LINKS_CUSTOM_ICONS_ENABLED`, `LINKS_QR_ENABLED`) default `false`; the backend validates/stores data regardless (no data loss on toggle), but the public profile and dashboard UI respect the flags.
- **Public exposure:** `GET /api/features` returns all feature flags as `{ customIconsEnabled, qrEnabled, ... }` — cached 60s.
- **Dashboard gating:** when a flag is off, the corresponding UI controls are hidden/disabled in the editor; the backend still accepts the data so the owner can enable features without re-entering.

## Seasonal & holiday themes

- **DB-backed `themes.manage`:** themes are stored in a `seasonal_themes` table (not code), authored through the admin panel via a new `themes.manage` permission added to the default admin role — not tier-gated for users, since theming is an operator/platform concern
- **Recurring windows:** each theme carries an optional year-repeating month/day start/end window (e.g. Christmas Dec 1 – Jan 8), so scheduling needs no per-year maintenance
- **Resolution order** (`resolveActiveSeasonalTheme` / `resolveProfileSeasonalTheme`): a manual override `on` wins; otherwise holiday > season; otherwise the higher `sortOrder`; the whole feature is gated by a master `enabled` switch plus `autoSchedule`; while a theme is active it **entirely replaces** the user's custom theme
- **Christmas always-allow:** a user's `alwaysAllowChristmas` opt-in beats even an operator `off` override, but only for that user and only that theme — a deliberate "don't take away users' holidays" carve-out
- **Locally-editable preview re-use:** the admin preview and the landing Showcase share one reusable `SampleProfilePreview` component whose edits run entirely in the browser (server keeps defaults) so concurrent admins never overlap real data; the admin passes a `theme` overlay (with a badge), the landing passes a preset with no badge
- **Animated FX overlay:** each theme config carries an editable `effect` (`none, snow, pumpkins, hearts, leaves, stars, confetti, sparkle`) rendered as a lightweight canvas particle overlay (`FxOverlay.tsx`) that is animated most of the time but cheap (DPR-capped, area-scaled counts, respects `prefers-reduced-motion`, pauses on hidden tabs). Each profile also has its own `animatedFx` toggle + `effect` picker in Appearance — the user's per-profile effect wins first, then the active global theme's effect. Applied to **both** public profiles and the landing page (`GET /api/theming/active`).
- **Global = whole platform:** the active theme recolors public profiles **and** the landing page; it is **not** a separate theme type — the same `seasonal_themes` DB table/model/columns are reused, and only the UI + API are renamed to "Theming" (back-compat `seasonal-themes` API aliases + `seasonal`/`theming` response aliases preserved).

## Schema migrations run at container start — with a guard, not a hope

- **Decision:** `docker-entrypoint.sh` applies pending Prisma migrations (`db:migrate:prod`) *before* starting the server when `MIGRATE_ON_START=true` (the default), retrying while the database is unreachable (`DB_WAIT_ATTEMPTS` × `DB_WAIT_INTERVAL`, 30 × 2 s) and exiting non-zero if the migration fails.
- **Why:** a brand-new volume previously connected, logged `Database connected`, then failed every background query with `P2021` while the healthcheck never went green — the documented path required a manual `prisma migrate deploy` that no compose path ran. Making it automatic removes the only manual step a clean-room install has.
- **The guard that makes it safe:** if `MIGRATE_ON_START=true` and the image ships no (or an empty) `prisma/migrations/`, the container prints an actionable `FATAL` and exits instead of letting `migrate deploy` report success while applying nothing. Silence here would leave an empty database behind a server that looks healthy — exactly the class of bug the `PORT=0` failure taught us.
- **Escape hatch:** `MIGRATE_ON_START=false` for operators who manage the schema themselves; `update.sh` sets it explicitly for its one-shot migrate container so the migration is a single, visible, ordered step in the script rather than a side effect of a restart.
- **Idempotence:** `migrate deploy` only applies what is pending, so restarting an up-to-date instance changes nothing (`No pending migrations to apply`) — verified live on both empty and populated volumes.
- **Seed stays separate:** `SEED_ON_START` runs *after* the schema exists, and `db:seed` loads `../../.env` with `--env-file-if-exists` because `.env` is `.dockerignore`d and never present in the container (older `--env-file=` exited 9 there).

## update.sh: a backup it has verified, or it does not migrate

- **Decision:** before any pull/migrate/recreate, `update.sh` writes a `pg_dump` to `backups/` and validates it (≥128 bytes **and** a parseable `pg_restore --list` table of contents). If validation fails the run aborts; `--no-backup` additionally requires `--force` and prints the risk loudly.
- **Why:** this is the one script that writes to a live database. "We took a dump" is not evidence — an empty or truncated file passes that claim and fails at restore time, which is the worst possible moment to discover it. `--verify-restore` goes further and restores into a scratch database.
- **Ordering is code, not convention:** resolve deployment → report schema state → verified dump → pull → one-shot migrate → recreate → health gate → rollback by image digest. Each step prints what it did; on any failure the script prints the dump path and the exact restore command.
- **Piped installs (`curl | bash`) fetch helpers from the script's own version tag**, never from `main`, and validate each download (non-empty, contains `bp_`) before sourcing — a pinned updater must not execute helper libraries from a different revision. `$0`-based piped detection was dropped (`$0` is `bash` when piped); absence of `scripts/lib/` is the signal instead.
- **`--dry-run` never waits:** it prints the health wait it *would* do and exits 0, rather than falling into the real 180 s health/rollback loop.

## Two instances on one host: parameterise the compose files, not the code

- **Decision:** `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`, `BACKEND_HOST_PORT`, `NGINX_PORT`, `NGINX_HTTPS_PORT`, `CERTS_DIR`, `NGINX_CONFIG_DIR` and `NETWORK_NAME` are env-parameterised in **both** compose files, with the previous literal values as defaults.
- **Why:** the hardcoded `networks.default.name: bioplatform_net` meant a second stack silently *joined* the production network, where `postgres`/`redis` are DNS aliases — a throwaway backend's `postgres` resolved against the live database. The parameterisation must live in both files because they are interchangeable deploy paths (`pnpm compose:check` keeps them in lockstep).
- **Container ports stay 5432/6379/3000:** only host publishes move, so `DATABASE_URL` and `CACHE_REDIS_URL` — the values operators actually configure — never change. That is what keeps the second instance a copy of the same deployment rather than a fork of it.
- **Rules for operators:** one directory (or `COMPOSE_PROJECT_NAME`) per instance so containers/volumes/state never mix; every published port unique; `NETWORK_NAME` **must** be unique or the stacks resolve each other's databases; separate `JWT_SECRET`/`POSTGRES_PASSWORD`/`ADMIN_PASSWORD` per instance, never shared.
- **`PORT` is the one variable whose empty value mattered:** `${PORT}` with no fallback supplies `""`, and `z.coerce.number()` made that `0`. Both compose files now use `${PORT:-3000}` and the schema preprocesses `""` → `undefined`, so the default is reachable however the variable arrives (`docker run -e PORT=` included).
