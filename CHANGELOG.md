# Changelog

All notable changes to BioPlatform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- Badge toggle state on the Dashboard was always "inactive": `GET /api/profiles/me` and the profile detail/update/create responses didn't return the profile's applied badges, so badges you had already activated appeared greyed out again after every reload ("the badge disappeared from my profile"). All authenticated profile responses now include `badges` (array of badge ids), so the Profiles tab reflects the real applied badges.
- The Dashboard rendered the **entire** badge catalog as toggleable, so clicking a badge you didn't own failed with a confusing `403 "You don't have this badge."`. Badges you don't own are now shown locked (greyed out with a lock icon, not clickable) until an admin grants them; only owned badges are toggleable.
- On a hard refresh, the Dashboard briefly showed **all** badges as locked: the owned-badge set came from the auth session (`AuthContext.user.badges`), which loads asynchronously, so while `GET /api/auth/me` was still in flight every badge was treated as unowned. `GET /api/profiles/me` now returns the user's `ownedBadges` in the same request that loads the profiles, and the Dashboard derives the locked/unlocked state from that — no more flicker between "blocked" and "available".
- Editing the **Admin** or **User** system role from the admin Roles tab failed with `"That role name is reserved"` (saving the role always re-sent its name, which re-slugged to a reserved slug). The reserved-name check now only fires when renaming a role *to* a reserved slug from something else, so system roles can be edited (description, invite config) without breaking.
- The **Admin** role could not be saved at all — the UI sends the role's full permission set on every save and the backend rejected any `permissions` on the Admin role. Saving now accepts the Admin role's full permission set and only rejects an actual removal (matching the locked permission checkboxes).
- Music autoplay restarted on **every** click or keypress on a public profile: both the local-audio and YouTube players registered document-level `pointerdown`/`keydown` listeners that forced `play()` whenever a track was loaded and paused (even after a manual pause). Those listeners are gone — music now starts only once, when the visitor dismisses the "Press to enter" gate (button or any key), and a manual pause stays paused until the visitor resumes it.

### Changed
- **Ban invites** / **Unban invites** moved out of the Users table row into the **Edit Profile** modal (new "Invite access" panel), with a confirmation dialog before banning (it revokes the user's unused invites and zeroes their allowance). The Users table keeps the "INVITE BANNED" badge.

### Added
- Admin **Invite Codes** tab now lists **all** invite codes from every admin (new `GET /api/admin/invites`, with the creator and — when redeemed — the account that used the code), with filter chips for **All / Available / Created by me** and a **Created by** column. Admins with `invites.manage` can revoke any unused code, not just their own.
- Self-service invite generation: the master switch now lives in the admin panel (new `GET/PUT /api/admin/invite-settings`, key `invites.userGenerationEnabled` in a new `system_settings` table — no environment variable), and every non-admin user with the new `invites.generate` permission and a role batch limit > 0 can generate their own invite codes from the Dashboard's new **Invites** tab, subject to per-role limits: **max per batch**, **max outstanding unused** (both default 0 = off/unlimited), a **cooldown** in minutes, and **default/min/max expiry days** (users pick an expiry clamped between min and max; role default is used when omitted). Admin-generated codes stay unconstrained.
- Invite events: admins can run a `POST /api/admin/invite-events` event (`count` + `expiryDays` in days or weeks from the UI) that grants every non-banned user an **allowance** of invite credits expiring on the chosen date (raw `UPDATE ... GREATEST(...)` extends an existing unexpired allowance). Users generate codes against the allowance, picking an expiry up to the allowance expiry (the default); a code that expires unused **before** the allowance expiry is **refunded** to the allowance automatically by a lazy sweep (`runInviteRefundSweep`) on the user's next invites load, while codes dying exactly at allowance expiry are not refunded. Codes drawn from an allowance are tagged `fromAllowance` and shown as **EVENT**. Events are recorded in a new `invite_grant_events` table and auditable via `GET /api/admin/invite-events`.
- Per-user invite bans: admins can **ban invites** on a user (`PATCH /api/admin/users/:id` with `inviteBanned: true`) to exclude them from the invite system — they can't generate, are skipped by future events, their outstanding unused codes are revoked immediately, and their allowance is zeroed (all in one transaction). **Unban invites** restores access without restoring the old allowance.
- **Invites** tab on the Dashboard: allowance/quota/outstanding stat cards, a generation form (count + optional expiry with min–max hints), cooldown and generation-disabled states, a banned banner, and a table of your codes with copy, revoke, and an EVENT badge.

### Fixed
- Admin **Users** tab can now **permanently delete** a user (`DELETE /api/admin/users/:id`): a full GDPR erasure that removes the account, every profile, uploaded files, webhooks and deliveries, passkeys, badges, invite codes, and the user's auth-log and account-ban references (new `user.deleted` webhook event). You cannot delete your own account.
- "Post to Discord" now keeps a single message in sync: the posted message id and the webhook URL it was sent to are stored (webhook AES-256-GCM-encrypted), so posting again — or editing the profile while a posted message exists (profile edits, avatar/banner changes, and imports all refresh it) — `PATCH`es the same message in place instead of sending a new one. Switching webhooks deletes the old message before posting a fresh one; if the stored message can no longer be edited (e.g. the webhook was deleted), it's recreated. `POST /api/discord/post` returns `{ messageId, mode: "created" | "updated" }`, and `PUT /api/discord/settings` deletes the old posted message when the webhook URL changes.
- Richer OpenGraph card and card-image Discord embed: the 1200×630 PNG now renders a full banner strip with the avatar overlapping it, display name + `@username`, the bio, **all** badges (wrapping pills), social tiles, and link/track counts. Because Discord caches embed images aggressively, the card shows only stable profile data — live presence (status/song) is deliberately excluded so it can't look stale; presence stays on the live profile widget and `/presence` endpoint. The card is cached in memory (~5 min) and served with an `ETag`; the `og:image` URL is content-versioned (`?v=…`) so crawlers refetch when the profile actually changes. The "Post to Discord" webhook embed now shows the card image with a short title instead of presence text fields, and the `og:description` is just the bio (no more "bio · now playing · counts" jumble).
- Fluid responsive bio layout: the public profile card, banner, avatar, typography, and spacing now scale continuously with the viewport (`clamp`-based fluid sizing via the existing sm/lg steps) up to a 640px desktop cap. The presence widget and social links fill the card width instead of being capped at a fixed width, on both the bio page and the landing Showcase mock.
- Webhook expansion: four new events — `profile.created`, `profile.deleted`, `user.registered`, `user.updated` (fires on password change and admin edits) — plus optional per-webhook custom JSON payload templates with `{{placeholders}}` (`{{id}}`, `{{event}}`, `{{timestamp}}`, `{{data}}`, `{{data.<field>}}`, max 2000 chars). Templates are validated on save, rendered at delivery time (signature still covers the raw rendered body), and managed from the Webhooks tab.
- Discord presence upgrade: the activity card now renders the primary activity as a rich card — a large album-cover (music) or app art (games/streams/YouTube-style) with a type label, title, and subtitle (artist for music, video title for YouTube), plus pill buttons when the activity exposes them (Discord delivers labels only, not URLs).
- Live presence on the public profile: the bio page now polls a new lightweight endpoint (`GET /api/profiles/:identifier/presence`, public, same opt-in gating as the profile) every 15s while the gate is open and the tab is visible, so switching game/music/streams updates the presence widget without a page reload. The activity card also gains a live progress timebar (elapsed / total, `mm:ss`) for activities with start/end timestamps, e.g. Spotify — driven by Discord's activity `timestamps`, now captured in the gateway and exposed in the API.
- Tier-based API access: every account gets an effective `apiLevel` — `basic` (FREE: profile/socials/theme/music/email/badges), `advanced` (PRO/Premium: analytics, Discord integration, data export/import), `enterprise` (ENTERPRISE: webhooks). Admins can override the tier default by granting the new `api.basic`/`api.advanced`/`api.enterprise` permissions to any role (visible in the admin Roles tab); admins always have enterprise. Gated endpoints return 403 with `{ required, apiLevel }`; the Dashboard shows a lock + upgrade card on gated tabs (Analytics, Webhooks, Data, Discord).
- Premium and Enterprise theme presets: 6 new presets (Aurora, Royal, Golden for Premium; Obsidian, Nebula, Pearl for Enterprise), badged in the Appearance tab and on the landing Showcase, where the premium/enterprise themes render the more elaborate mock.
- Landing shows a **Dashboard** button (in the navbar and hero CTA) when you're already signed in instead of the register/sign-in prompts.
- Presence buttons are now clickable: Discord only delivers button labels (never URLs), so the widget links each button to the best target it can derive — a Spotify search for the track/artist when listening, a YouTube search for watch/view activities, and a web search otherwise.
- Discord webhook URLs are now valid outbound webhook destinations: deliveries to `discord.com`/`discordapp.com` (incl. `ptb.`/`canary.`) are sent as a formatted embed (`BioPlatform · <event>` title, event timestamp, one field per top-level `data` entry) instead of raw JSON, which Discord previously rejected with HTTP 400. Templates that already produce a Discord message shape pass through untouched; other template payloads render as pretty-printed JSON in the embed description.

## [1.2.0-dev-beta.1] - 2026-08-08

### Added
- Multiple profiles, aliases, and badges: `Profile.slug` + `isPrimary` + `badges`, a `ProfileAlias` model, per-profile scoping (`?profileId=`) for music/email/analytics/discord settings, tier-based profile limits (FREE 1, PRO 3, ENTERPRISE 10) and alias limits (FREE 0, PRO 5, ENTERPRISE 25) with admin per-user overrides. New Dashboard **Profiles** tab (create/delete/set-primary/aliases/badges) and a profile switcher in the header. Public pages resolve by slug or alias (`GET /api/profiles/:identifier`) and render badges. The primary profile's slug is fixed to the username (rename is rejected); aliases cover extra short URLs. Docs, OpenAPI, and admin UI updated.
- Webhooks: per-account endpoints (`/api/webhooks`) with AES-256-GCM-encrypted signing secrets, HMAC-SHA256 signature header (`X-BioPlatform-Signature`), events `profile.viewed`, `link.clicked`, `profile.updated`, test deliveries (`webhook.test`), and a retry sweep (0s/60s/5m/15m/60m backoff, max 5 attempts) with a per-delivery log. Managed from a new Dashboard **Webhooks** tab.
- Profile data portability: single-sheet spreadsheet export (`.xlsx` default, `.ods` optional) and import (`.xlsx`/`.ods`/`.csv`) via `GET /api/profiles/me/export` and `POST /api/profiles/me/import`. Macro-enabled files (`.xlsm`/`.xls`) are rejected; formula-looking values are skipped and reported as warnings. Managed from a new Dashboard **Data** tab.
- API documentation: machine-readable OpenAPI 3.0 at `/api/openapi.json`, a rendered in-app reference at `/api-docs`, and human-readable `docs/en/api.md` / `docs/es/api.md`.
- Discord integration (OAuth2 link + shared bot): a **Discord** tab in the Dashboard to connect/disconnect a Discord account, toggle presence sharing (`showDiscordPresence` / `showDiscordActivity`) and configure a "Post to Discord" webhook button. The account link uses the `identify` scope (`prompt=consent`); live presence is delivered by a single shared bot gateway session (`DISCORD_BOT_TOKEN`, `GUILDS|GUILD_PRESENCES` intents) that reads `GUILD_CREATE`/`PRESENCE_UPDATE` and is cached in memory keyed by user id — users must share a guild with the bot for their status to be shown. It powers a public presence widget (status, activity line, current song, custom status) and rich link previews: an OG meta page (`GET /:username` for crawlers) and a server-rendered 1200×630 PNG card (`GET /api/profiles/:username/og.png`). The feature is gated on `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_REDIRECT_URI` (empty = fully disabled) with `DISCORD_BOT_TOKEN` enabling presence and an optional `DISCORD_GUILD_INVITE` shown as a "Join presence hub" button in the Discord tab. New `DiscordConnection` model; the bot session starts on boot.
- WebAuthn multi-origin support: `WEBAUTHN_ORIGIN` now accepts a comma-separated list of origins (e.g. `http://localhost:80,https://localhost`), so passkeys work across both an HTTP local deployment and an HTTPS domain.
- Role-based access control: the `USER`/`ADMIN` enum is replaced by a `Role` model with a permission set (`users.view`, `users.manage`, `profiles.manage`, `invites.manage`, `bans.manage`, `roles.manage`, `badges.manage`, `logs.view`). Two system roles ship (Admin — always full permissions, permissions locked — and User), plus admins can create/edit/delete custom roles with per-permission toggles in a new admin **Roles** tab. Admin endpoints and the admin UI are gated by the calling role's permissions instead of a global admin flag. Users are assigned a role in the admin user editor.
- Badge system overhaul: badges are now a `Badge` catalog (`slug`, `label`, `color`, `icon`) managed by admins in a new **Badges** tab (create/edit/delete, hex color + lucide icon). Badges render everywhere as colored icons (`GET /api/badges` is public; profiles/users reference badges by id). Seven system badges ship (developer, owner, staff, moderator, verified, premium, enterprise).
- Profiles tab: the primary profile can now be deleted; the backend re-assigns primary status to the oldest remaining profile, and the last profile is still protected.

### Fixed
- Discord OAuth connect returned "Discord connection failed" — Discord rejected the OAuth request with `invalid_scope` because the `gateway.connect` scope is no longer supported. The authorize scope is now just `identify` (account link + webhook embeds still work), and live presence is instead delivered by a shared bot gateway session (`DISCORD_BOT_TOKEN`, `GUILDS|GUILD_PRESENCES` intents) so presence keeps working without per-user OAuth gateway access.
- Login via the web UI returned `Required` — the frontend sent `email`+`password` to `/api/auth/login` while the backend expects `identifier`+`password` since the username/email-first flow. The frontend (`api.login`) now sends `identifier`, and the OpenAPI spec + API docs were corrected to match.
- Passkey login failed with a generic error — the frontend passed the whole response envelope (`data`) into `startAuthentication` instead of unwrapping `data.options`. `loginPasskeyOptions`/`twoFactorPasskeyOptions` types were tightened and both call sites now use `optionsJSON` correctly.
- Public profile pages returned 500 after the schema rework — the deployed backend image was stale and still queried the removed `Profile.username` column. Rebuild the Docker images and restart the stack to pick up the multi-profile backend.
- YouTube embeds no longer autoplay — removing `mute=1` made browsers block the unmuted embed entirely. The music player now uses the YouTube IFrame Player API to try playing with sound and falls back to muted playback (with an Unmute button) when the browser's autoplay policy rejects unmuted autoplay.

### Security
- CSP `img-src` now also allows `https://cdn.discordapp.com` (Discord avatars + activity app icons) and `https://i.scdn.co` (Spotify album art) so the presence widget renders — the strict allowlist otherwise stays unchanged
- HTTPS served on 443 with HSTS (production mode only; `SEND_HSTS_ON_DEV=true` opts in for dev). `TLS_MODE=development` auto-generates self-signed certs stored as `self-signed.pem`/`self-signed.key`; `TLS_MODE=production` deletes them and requires real certs- `JWT_SECRET` must be at least 32 characters (backend refuses to boot with a weak secret)
- Profile `theme` values are validated server-side: colors must be hex / `rgb()` / `rgba()` / `hsl()` / `hsla()` and `fontFamily` is restricted to a safe character set — rejects CSS injection (`url()`, `var()`, `calc()`, `;`, `{}`) before it reaches inline styles
- Login responses made uniform to stop user enumeration: `/auth/login/start` always reports a found account with password method, and `/auth/login/passkey/options` + 2FA endpoints return a generic 401 "Invalid credentials" instead of 404/distinct messages for unknown users
- Email unlock (`/auth/unlock/verify`) now clears the account's IP/cookie fingerprint bans and failed auth-log entries alongside the account ban, matching the admin unlock behavior
- Webhook signing secrets are never returned after creation (shown once) and are stored AES-256-GCM encrypted; delivery signatures are HMAC-SHA256 over the raw body
- Spreadsheet imports reject macro-bearing files (`.xlsm`/`.xls`) and values that could be interpreted as formulas (leading `=`, `+`, `@`, tab/CR); webhook payloads and profile exports contain no PII
- Discord OAuth access/refresh tokens and webhook URLs are stored AES-256-GCM encrypted with purpose-scoped keys (`bioplatform:discord:token` / `...:webhook`); presence is never exposed unless the owner explicitly opts in (`showDiscordPresence`, `showDiscordActivity`), OAuth state tokens are signed with `JWT_SECRET` and expire after 10 minutes, and the shared presence bot token is read only from the environment (never stored or logged), with fatal gateway close codes (invalid token / disallowed intents) disabling the bot instead of retrying blindly
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

[1.2.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.1.0-dev-beta.1...v1.2.0-dev-beta.1
[1.1.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.2...v1.1.0-dev-beta.1
[1.0.1-dev-beta.2]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.1...v1.0.1-dev-beta.2
[1.0.1-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.0-dev-beta.1...v1.0.1-dev-beta.1
[1.0.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/releases/tag/v1.0.0-dev-beta.1
