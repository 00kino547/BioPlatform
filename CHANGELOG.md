# Changelog

All notable changes to BioPlatform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Multiple profiles, aliases, and badges: `Profile.slug` + `isPrimary` + `badges`, a `ProfileAlias` model, per-profile scoping (`?profileId=`) for music/email/analytics/discord settings, tier-based profile limits (FREE 1, PRO 3, ENTERPRISE 10) and alias limits (FREE 0, PRO 5, ENTERPRISE 25) with admin per-user overrides. New Dashboard **Profiles** tab (create/delete/set-primary/aliases/badges) and a profile switcher in the header. Public pages resolve by slug or alias (`GET /api/profiles/:identifier`) and render badges. The primary profile's slug is fixed to the username (rename is rejected); aliases cover extra short URLs. Docs, OpenAPI, and admin UI updated.
- Webhooks: per-account endpoints (`/api/webhooks`) with AES-256-GCM-encrypted signing secrets, HMAC-SHA256 signature header (`X-BioPlatform-Signature`), events `profile.viewed`, `link.clicked`, `profile.updated`, test deliveries (`webhook.test`), and a retry sweep (0s/60s/5m/15m/60m backoff, max 5 attempts) with a per-delivery log. Managed from a new Dashboard **Webhooks** tab.
- Profile data portability: single-sheet spreadsheet export (`.xlsx` default, `.ods` optional) and import (`.xlsx`/`.ods`/`.csv`) via `GET /api/profiles/me/export` and `POST /api/profiles/me/import`. Macro-enabled files (`.xlsm`/`.xls`) are rejected; formula-looking values are skipped and reported as warnings. Managed from a new Dashboard **Data** tab.
- API documentation: machine-readable OpenAPI 3.0 at `/api/openapi.json`, a rendered in-app reference at `/api-docs`, and human-readable `docs/en/api.md` / `docs/es/api.md`.
- Discord integration (per-user OAuth2, no bot): a **Discord** tab in the Dashboard to connect/disconnect a Discord account, toggle presence sharing (`showDiscordPresence` / `showDiscordActivity`) and configure a "Post to Discord" webhook button. Presence is delivered over a private per-user gateway session (scopes `identify gateway.connect`, `prompt=consent`, intents 0, invisible session) that reads `READY`/`SESSIONS_REPLACE` and is cached in memory. It powers a public presence widget (status, activity line, current song, custom status) and rich link previews: an OG meta page (`GET /:username` for crawlers) and a server-rendered 1200×630 PNG card (`GET /api/profiles/:username/og.png`). The whole feature is gated on `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_REDIRECT_URI` (empty = fully disabled); the obsolete `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` were removed. New `DiscordConnection` model; sessions are restored on boot for profiles that opted in.
- WebAuthn multi-origin support: `WEBAUTHN_ORIGIN` now accepts a comma-separated list of origins (e.g. `http://localhost:80,https://localhost`), so passkeys work across both an HTTP local deployment and an HTTPS domain.
- Role-based access control: the `USER`/`ADMIN` enum is replaced by a `Role` model with a permission set (`users.view`, `users.manage`, `profiles.manage`, `invites.manage`, `bans.manage`, `roles.manage`, `badges.manage`, `logs.view`). Two system roles ship (Admin — always full permissions, permissions locked — and User), plus admins can create/edit/delete custom roles with per-permission toggles in a new admin **Roles** tab. Admin endpoints and the admin UI are gated by the calling role's permissions instead of a global admin flag. Users are assigned a role in the admin user editor.
- Badge system overhaul: badges are now a `Badge` catalog (`slug`, `label`, `color`, `icon`) managed by admins in a new **Badges** tab (create/edit/delete, hex color + lucide icon). Badges render everywhere as colored icons (`GET /api/badges` is public; profiles/users reference badges by id). Seven system badges ship (developer, owner, staff, moderator, verified, premium, enterprise).
- Profiles tab: the primary profile can now be deleted; the backend re-assigns primary status to the oldest remaining profile, and the last profile is still protected.

### Fixed
- Login via the web UI returned `Required` — the frontend sent `email`+`password` to `/api/auth/login` while the backend expects `identifier`+`password` since the username/email-first flow. The frontend (`api.login`) now sends `identifier`, and the OpenAPI spec + API docs were corrected to match.
- Passkey login failed with a generic error — the frontend passed the whole response envelope (`data`) into `startAuthentication` instead of unwrapping `data.options`. `loginPasskeyOptions`/`twoFactorPasskeyOptions` types were tightened and both call sites now use `optionsJSON` correctly.
- Public profile pages returned 500 after the schema rework — the deployed backend image was stale and still queried the removed `Profile.username` column. Rebuild the Docker images and restart the stack to pick up the multi-profile backend.
- YouTube embeds no longer autoplay — removing `mute=1` made browsers block the unmuted embed entirely. The music player now uses the YouTube IFrame Player API to try playing with sound and falls back to muted playback (with an Unmute button) when the browser's autoplay policy rejects unmuted autoplay.

### Security
- HTTPS served on 443 with HSTS (production mode only; `SEND_HSTS_ON_DEV=true` opts in for dev). `TLS_MODE=development` auto-generates self-signed certs stored as `self-signed.pem`/`self-signed.key`; `TLS_MODE=production` deletes them and requires real certs
- `JWT_SECRET` must be at least 32 characters (backend refuses to boot with a weak secret)
- Profile `theme` values are validated server-side: colors must be hex / `rgb()` / `rgba()` / `hsl()` / `hsla()` and `fontFamily` is restricted to a safe character set — rejects CSS injection (`url()`, `var()`, `calc()`, `;`, `{}`) before it reaches inline styles
- Login responses made uniform to stop user enumeration: `/auth/login/start` always reports a found account with password method, and `/auth/login/passkey/options` + 2FA endpoints return a generic 401 "Invalid credentials" instead of 404/distinct messages for unknown users
- Email unlock (`/auth/unlock/verify`) now clears the account's IP/cookie fingerprint bans and failed auth-log entries alongside the account ban, matching the admin unlock behavior
- Webhook signing secrets are never returned after creation (shown once) and are stored AES-256-GCM encrypted; delivery signatures are HMAC-SHA256 over the raw body
- Spreadsheet imports reject macro-bearing files (`.xlsm`/`.xls`) and values that could be interpreted as formulas (leading `=`, `+`, `@`, tab/CR); webhook payloads and profile exports contain no PII
- Discord OAuth access/refresh tokens and webhook URLs are stored AES-256-GCM encrypted with purpose-scoped keys (`bioplatform:discord:token` / `...:webhook`); presence is never exposed unless the owner explicitly opts in (`showDiscordPresence`, `showDiscordActivity`), OAuth state tokens are signed with `JWT_SECRET` and expire after 10 minutes, and gateway token refreshes run only when a session is active
- Profile slugs and aliases are validated against the same allowlist pattern (`^[a-z0-9][a-z0-9-_]{2,31}$`), case-normalized to lowercase, and sanitized before storage; primary slugs cannot be renamed and reserved collisions are rejected
- Every admin endpoint now checks a specific permission (`requirePermission`) tied to the caller's role instead of a single admin flag, so restricted roles can't reach operations they don't own

> **Accepted / deferred risks:** the JWT stays in `localStorage` (XSS-exposed) with the strict `script-src 'self'` CSP as the compensating control — an HttpOnly-cookie refactor is deferred. `/auth/login/start` still reveals a real account's enabled methods (passkey/totp), intentional for the username-first UX. Production operators must deploy real TLS certs + HSTS and rotate the pre-existing admin password created before the seed fix. Webhook delivery runs in-process (no separate worker queue); long endpoint delays hold the retry sweep and the 5-min sweep interval is the lower bound between attempts.

## [1.1.0-dev-beta.1] - 2026-08-05

### Added
- Two-factor authentication with authenticator apps (TOTP) using `otplib`
- WebAuthn passkeys (`@simplewebauthn/server` + `@simplewebauthn/browser`): passwordless login and passkey as a second factor
- Username/email-first login flow — after identifying, choose Passwordless (passkey) or Password
- Two-factor challenge flow: password step issues a short-lived (5 min) token, then TOTP or passkey completes sign-in
- Passkey registration with Non-resident (2FA / security key) vs Resident (passwordless) choice and automatic fallback when the device can't create the selected type
- Passkey management in Dashboard Security tab (add with name/type, list with last-used, remove)
- TOTP setup in Security tab: QR code (`qrcode.react`), manual secret, verify-and-enable, disable
- Server-side WebAuthn challenge storage (`WebAuthnChallenge` model) with 5-minute TTL and periodic cleanup
- Passkey counter tracking with last-used timestamps (`Passkey` model)
- `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_NAME` environment variables
- Anti-brute-force protection on auth endpoints: fingerprint (IP + HttpOnly cookie + User-Agent) and per-account failure tracking — 3 free failures, then a configurable lock (`AUTH_LOCK_DURATION_MINUTES`, default `-1` = permanent)
- 2-of-3 fingerprint blocking so shared IPs / shared browsers are not locked out by a single banned fingerprint
- Account lock policy (`AUTH_LOCK_POLICY`): `block` (reject all), `trusted_ip` (registered + last-login IPs may sign in without unlocking, default), or `email` (unlock requires a signed email link via new `/auth/unlock` + `/auth/unlock/verify` endpoints and `/unlock` page)
- `AuthBan` model, admin ban listing and unban endpoint + Bans tab in the admin panel
- `AuthLog` table recording every rejected/failed attempt (username, IP, hashed User-Agent, fingerprint, reason, penalty, trigger) with an admin Logs tab and scheduled cleanup of expired / retention-aged entries
- Admin account unlock (`POST /api/admin/auth-unlock`) — removes the account ban plus the IP/cookie fingerprint bans recorded against that account and its failed auth-log entries, with **Unlock** actions in the admin Bans and Logs tabs
- `bio_sid` HttpOnly cookie (server-issued, stored hashed), `TRUST_PROXY`, `AUTH_LOCK_*`, and `AUTH_LOG_*` environment variables

### Security
- Auth requests blocked at the API layer (429 + `Retry-After` for temporary lockouts, 403 for permanent bans) instead of host firewall rules
- WebAuthn registrations and assertions verify origin, relying party ID, and challenge server-side
- TOTP codes verified server-side with a ±30 second window
- Passkey public keys stored base64url-encoded; counters updated after every authentication
- Successful auth resets failure counters and records the last-login IP; registration records the registered IP
- Seed admin credentials now come from `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` (validated, refuses weak defaults) instead of a hardcoded default account
- Invite-code creation is admin-only (`POST /api/invites` now requires `requireAdmin`), closing the invite-gate bypass
- Public profile view + click tracking rate-limited per IP (60 req/min) to prevent email-bombing and analytics flooding
- Registration consumes invite codes atomically and normalizes emails to lowercase — closes a double-use race and case-variant duplicate accounts
- Profile analytics use the trusted `req.ip` and sanitize the `Referer` header before storage
- Nginx hardening: `Content-Security-Policy`, `Permissions-Policy`, `server_tokens off`

### Changed
- `ADMIN_USERNAME` environment variable added (seed only); `ADMIN_PASSWORD` must be ≥ 12 chars and not the known default
- PostgreSQL port in `docker-compose.yml` bound to loopback only (`127.0.0.1:5432:5432`)
- Backend published port bound to loopback only (`127.0.0.1:3000:3000`) so the API can't be reached directly, bypassing nginx
- `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` now passed into the backend container (required by the boot-time env validation)

## [1.0.1-dev-beta.2] - 2026-08-04

### Fixed
- YouTube embed autoplay was muted (`mute=1`); removed the parameter so embeds autoplay with sound where the browser allows it

## [1.0.1-dev-beta.1] - 2026-08-04

### Added
- Music player integration: local audio uploads (25MB, MP3/OGG/OPUS/WAV/M4A/FLAC/AAC/WebM) plus Spotify and YouTube embeds
- Tier-based track limits (FREE: 2, PRO: 5, ENTERPRISE: 10) with admin `trackLimit` override
- Spotify/YouTube URL parsing to privacy-enhanced embed URLs (no API keys required) — YouTube uses `youtube-nocookie.com`, supports `/shorts/`
- Music tab in Dashboard (add, edit, reorder, delete, upload)
- MusicPlayer component on public profiles (below bio, above links)
- Track reordering via transaction (`POST /music/reorder`)
- Local file cleanup on track deletion
- Optional full-version streaming source (`MusicTrack.fullUrl`) with "Play full version" player/button
- "Open in Spotify" button rendered under Spotify embeds (previews only)
- Terms of Service section covering creator-supplied full-streaming sources and third-party TOS liability
- Discord username validation case-insensitive (matches frontend, fixes false "invalid URL or username" save error)
- Autoplay on all three music providers (local, Spotify, YouTube) for the active track
- YouTube tracks sorted first in the public music player
- Privacy Policy section on third-party embedded content (Spotify/YouTube cookies, nocookie embeds)

### Changed
- Nginx `client_max_body_size` raised from 10M to 25M for audio uploads
- YouTube embeds use `youtube-nocookie.com` (no third-party cookies on visitors)
- Analytics dashboard redesigned: larger stat cards, taller gradient bar charts with gridlines, date axis labels, and improved hover tooltips

## [1.0.0-dev-beta.1] - 2026-07-27

### Added
- Landing page (Hero, Features, Showcase, Pricing, FAQ, Footer)
- Scroll-reveal animations with IntersectionObserver
- Interactive theme selector in Showcase
- Configurable branding via env vars
- SEO meta tags, OpenGraph, Twitter cards, JSON-LD structured data
- Auth system (JWT, bcrypt at 12 rounds, register/login/me)
- Invite-only registration (invite codes with soft revoke)
- Dashboard profile editor (Profile, Links, Appearance tabs)
- Admin panel (invite code management, user list, profile editing)
- Public profile pages with themed display (`/:username`)
- Avatar and banner uploads with preview and removal
- Social links with platform icons (12 platforms)
- Discord username and invite link support
- Email `mailto:` link support
- 8 built-in theme presets (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal)
- Theme customization with accent colors on public profiles
- Private profiles (owner-only visibility)
- Auto-profile creation on registration
- Input sanitization (HTML-like character stripping)
- Platform allowlist validation
- Privacy Policy and Terms of Service pages
- Docker Compose deployment (postgres, backend, frontend, optional nginx)
- Comprehensive documentation (AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md)
- English and Spanish documentation
- CHANGELOG.md

### Security
- All user input sanitized before storage
- Platform names validated against allowlist
- URLs validated for correct protocol (no `javascript:` etc.)
- Multer file filter checks extensions only
- No `dangerouslySetInnerHTML` in frontend
- React escapes all JSX content by default

[1.1.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.2...v1.1.0-dev-beta.1
[1.0.1-dev-beta.2]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.1...v1.0.1-dev-beta.2
[1.0.1-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.0-dev-beta.1...v1.0.1-dev-beta.1
[1.0.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/releases/tag/v1.0.0-dev-beta.1
