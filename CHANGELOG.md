# Changelog

All notable changes to BioPlatform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- Pausing a YouTube track no longer resumes playback after a window focus change caused by clicking elsewhere on the profile.
- Presence activity buttons now detect their destination from both the Discord activity type and platform name, linking Spotify, YouTube, Twitch, SoundCloud, and Apple Music activities to their native search pages before using the generic fallback.

## [1.3.0-dev-beta.2] - 2026-08-15

### Added
- **Badge ordering.** Badges on a profile now have a user-controlled display order. In the dashboard's **Appearance** tab you can drag badges to reorder them and save; the order persists per profile and is used everywhere badges render: the public profile page, the own-profile endpoints, and the social/AI card (`og:image` + OG page). New badges earned later automatically appear after the ordered ones. The order is stored in a new `badgeOrder` column (`string[]`) on `profiles`, validated by the new `PUT /api/profiles/me/:profileId/badges/order` endpoint (only badge ids currently on the profile are accepted; duplicates and unknown ids are rejected). Profiles with no saved order are unaffected. Docs (`api.md`, `user-guide`) updated. The backend test suite (Node/tsx built-in runner against a dedicated `bioplatform_test` database) covers the ordering unit helper plus endpoint and public/OG integration behavior.
- **SEO files are now real, cached endpoints.** `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/llms-full.txt` are generated server-side by the backend (TTL-cached, `Cache-Control: public`) and served by nginx instead of falling through to the SPA shell — `robots.txt` used to return the app HTML (Lighthouse `robots-txt` failure). The sitemap lists the home page plus every public profile with `lastmod`; `llms.txt`/`llms-full.txt` give AI agents a markdown index of profiles with bio and social links. Reserved by the SPA router.
- **Server-rendered pages for social + AI crawlers.** The backend renders profile pages (and the landing page) for bot user-agents via nginx (30+ social and AI/LLM agents incl. GPTBot, ClaudeBot, AnthropicAI, PerplexityBot, ChatGPT-User, OAI-SearchBot, Google-Extended, Bytespider, CCBot, Amazonbot, cohere-ai, Meta-ExternalAgent, Applebot-Extended): richer Open Graph meta (`og:image:width/height/alt`, `og:locale`), `robots` meta, and JSON-LD structured data (`ProfilePage` + `Person` with `sameAs` from social links, `WebSite` on the landing page). The SPA injects equivalent `Person`/`WebSite` JSON-LD client-side via a `useJsonLd` helper (the old inline script was removed so it no longer trips the CSP).
- **Passkeys now work on custom domains.** The WebAuthn relying-party ID and expected origin are derived per request: for the app host (or any host in `WEBAUTHN_ORIGIN`) the configured env values are used unchanged, and for active custom domains the rpID/origin come from the request's `Host` header (`https://<hostname>`). Passkeys are scoped per domain — one registered on the main domain works there, one registered on a custom domain works on that custom domain. Docs (`user-guide`, `deployment`) updated accordingly.
- **Social platforms expanded.** `ALLOWED_PLATFORMS` (backend validation), the platform picker, display names, brand colors and SVG icons (frontend) now also support **GitLab, Reddit, Pinterest, Snapchat, Threads, Bluesky, Mastodon, WhatsApp, Telegram, Signal, Kick, Steam, SoundCloud** (previous: Twitter/X, GitHub, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email).
- Note: Lighthouse best-practices (92 → stays 92) still logs a CSP console error caused by Cloudflare's injected inline challenge script (`__CF$cv$params`, per-request dynamic, cannot be hashed). Our strict `script-src` correctly blocks it; operators who want a clean console can disable Bot Fight Mode / the JS challenge for the app hostname in the Cloudflare zone (this is external to the repo).

### Security
- **TLS private keys and user data no longer enter Docker build contexts.** `.dockerignore` now excludes `certs/` (certificates and private keys), `uploads/` (avatars/banners), database dumps and backups, and local DB files — previously these were part of every build context sent to the Docker daemon.
- **ACME challenge tokens are bounded in memory.** The in-memory challenge map now stores a creation timestamp and prunes entries older than 10 minutes (also on each read), so a burst of challenge attempts can no longer grow it without limit.

### Performance
- **Music no longer downloads media before you enter a profile.** Local tracks switch from eager `preload="auto"` to `preload="none"` until the EnterGate is dismissed (`started`), then return to `preload="auto"` and start playing on entry — a 3–7 MB MP3 is no longer fetched on a cold visit (measured: `/zdrayk` page weight 7,632 KiB → 500 KiB, LCP 39.7 s → 2.5 s, Lighthouse perf 73 → 96). YouTube embeds are now initialized lazily: the IFrame API, embed iframe, player JS/CSS and video buffering load only after the user enters the gate. Previously a cold visit with a YouTube track pulled ~1 MB of YouTube assets plus ~9 MB of buffered video and caused a layout-shift spike on the floating player (`/00kino547` CLS 0.221 → 0.001, page weight 4,527 KiB → 3,462 KiB, perf 62 → 73; `/nord` perf 73 → 79, LCP 20.3 s → 5.3 s). Spotify embeds, track switching, the mute control, the start-with-sound chain and autoplay-after-entry are unchanged. The harmless third-party `Unrecognized feature: 'web-share'` warning from YouTube's widget API still appears only after the player is actually used.
- **Profile images are resized and re-encoded server-side.** `/uploads` now serves on-the-fly optimized WebP variants (`?w=<width>&f=webp`, generated with `sharp` on first request and cached on disk behind `Cache-Control: public, max-age=31536000, immutable`); original uploads are served immutable-cached too (UUID filenames never change). The public profile page delivers the banner and avatar with responsive `srcset`/`sizes` (480/960/1440 px for banners, 96/160/256 px for avatars), marks the banner as the LCP element with `fetchpriority="high"` + `decoding="async"`, and keeps the original as the no-`srcset` fallback so older browsers are unaffected. Non-image uploads, animated GIFs and the music pipeline (including `Range` requests) pass through untouched. Measured (Lighthouse, throttled, cold): `/00kino547` banner 2.6 MB PNG → 52 KB WebP and avatar 590 KB → 9 KB, page weight 3,462 → 298 KiB, LCP 19.1 s → 3.2 s, perf 73 → 92, CLS 0.001; `/nord` 713 → 254 KiB, LCP 5.3 s → 2.4 s, perf 79 → 96, CLS 0.004; `/zdrayk` 500 → 226 KiB, LCP 2.5 s → 3.0 s (run variance), perf 96 → 93 (run variance), CLS 0.004. Original files stay on disk and keep working everywhere else (social-card avatar, OG rendering, direct `/uploads/` links).
- **Hashed static assets are now immutable-cached.** The frontend nginx config serves `/assets/*` with `Cache-Control: public, max-age=31536000, immutable` (content-hashed names never change) while `index.html` is served `no-cache` — repeat visits revalidate only the app shell and load every chunk straight from the browser cache.
- **Admin lists are paginated server-side.** `GET /api/admin/users` and `GET /api/admin/invites` accept `limit` (default 50, max 100) and `offset` and return `{ data, pagination: { total, limit, offset } }`; `/invites` also supports `filter` (`all` | `available` = unused/unexpired/unrevoked | `mine` = created by the caller). The admin panel now pages through results (Previous/Next + `x–y of total`) instead of loading the whole table on every visit.
- **Public API responses are cacheable.** `GET /api/badges` is served `Cache-Control: public, max-age=300` and `GET /api/profiles/:identifier` `no-cache`, both with a content-based `ETag` so clients revalidate with a cheap `304`. The profile revalidates on every fetch — edits and live presence are never stale, and public views are still counted.
- **Presence polling halved (15s → 30s).** Presence state stays centralized server-side (Discord gateway cache with a TTL sweep), so the client-side poll exists only to pick up live updates.
- **Dashboard render cost reduced.** The 30-day analytics chart series are built once with `useMemo` instead of inside the render body, and route pages are code-split via `React.lazy` + `Suspense` (the landing shell loads first; Dashboard, Admin, public profile, legal and API-docs chunks load on demand).
- **Analytics queries run in parallel.** The seven 30-day `$queryRaw` aggregates on `/api/analytics/me` now run via `Promise.all` instead of serially.
- **OG render avoids a double DB load.** `profileOgImageUrl` accepts an already-loaded profile data object, so `renderProfileOgPage` no longer re-reads the profile to build the card URL.
- **nginx upstream keepalive.** Upstream pools use `keepalive 32` and a `$connection_upgrade` map now drops the `Connection` header on non-WebSocket requests (previously every proxied request was sent with `Connection: upgrade`), letting nginx reuse upstream connections.
- **Scroll-reveal no longer animates `filter: blur`** (only opacity + transform), removing a per-frame paint cost on landing-page reveals.
- **Index analysis: no new indexes (deliberate).** `EXPLAIN ANALYZE` on the analytics queries showed `page_views` (242 rows) and `link_clicks` (2 rows) already carry the composite indexes `(profileId, createdAt)` and `(profileId, visitorId)`, and a forced index scan (0.133 ms) only marginally beat the seq scan (0.187 ms). No index was added — revisit when the tables grow.
- Notes: the Google Fonts setup and Docker CPU/RAM limits were reviewed and intentionally left unchanged (out of scope for this work); the frontend's >500 kB initial-chunk Vite warning also persists.

### Fixed
- **Webhook retry sweep is now re-entrant and non-N+1.** The sweep guards against overlapping runs, fetches the webhook row in the same query as the due deliveries, processes them in `nextRetryAt` order, and starts only after the database connection is ready (previously it fired at module load).
- **Auth-log pruning is guarded against overlapping runs** (the interval could previously overlap and run two concurrent delete sweeps).
- **YouTube music player leaks no timers.** The start-with-sound timeout chain is now tracked and cleared when the player unmounts or the `started` flag flips, so a destroyed player can no longer receive a late mute/unmute tick.

### Changed
- Admin panel **Users** and **Invite Codes** tabs now page and filter server-side, and invite filters are permission-aware (`mine` returns codes the caller created).
- `GET /api/profiles/:identifier` and the admin list endpoints are documented in `docs/en|es/api.md` and the OpenAPI spec (cache headers, pagination and `filter` params).

### Security
- **Token-purpose confusion could bypass 2FA (CRITICAL).** `requireAuth` and `getViewerId` accepted *any* JWT signed with `JWT_SECRET` as a full session bearer — including the short-lived `purpose: "twofactor"` token issued after a password login and the `purpose: "unlock"` email-unlock token — so a password-only attacker could skip TOTP/passkey. Session tokens are now signed with `purpose: "auth"`, and both middlewares reject any other purpose (401).
- **Webhook SSRF via redirects and DNS rebinding (HIGH).** Delivery used `fetch()` with automatic redirect following, so `Location` targets (including HTTP downgrades) were never re-validated; and the hostname was resolved separately from the later connect, so DNS-rebinding and IPv4-mapped-IPv6 (`::ffff:7f00:1`) answers evaded the private-IP check. Delivery now follows redirects manually, re-validates every hop with `isSafeWebhookTarget`, enforces `MAX_REDIRECTS`, allows `https:` only, resolves once and pins the socket to the validated IP via `lookup`, and rejects every private/reserved range (RFC1918, CGNAT, link-local, loopback, multicast, NAT64, IPv4-mapped-IPv6, …) with a `net.BlockList`.
- **`X-Forwarded-For` was fully spoofable (HIGH).** `TRUST_PROXY=1` plus nginx echoing the client-supplied `X-Forwarded-For` let any visitor set their own `req.ip`, bypassing the public view/click rate limit, the auth fingerprint IP, and analytics. Nginx now overwrites `X-Forwarded-For`/`X-Real-IP` with the client IP it computed from trusted reverse-proxy sources, so a forged chain never reaches the backend. See *Changed* for the follow-up that makes the restoration generic and network-level unforgeable.
- **`POST /api/profiles/click` abuse (MEDIUM).** The click endpoint had no `isPublic` gate, no platform-existence check, and accepted any `profileId`, enabling DB-row spam, notify-on-click email floods, `link.clicked` webhook spam, and enumeration of private profiles by leaked UUID. Clicks now 404 unless the profile is public (owner still allowed), 400 if the platform is not in the profile's `socialLinks`, and a per-profile sliding-window rate limit (60/min) is applied before recording.
- **Privilege escalation via `users.manage` (MEDIUM).** Any `users.manage` holder could assign the system **admin** role or `ENTERPRISE` tier, and `reset-password` lacked a self-guard so the root admin's password could be reset. Role/tier changes now require `roles.manage`, the target role is rejected if it grants permissions beyond the caller's own (subset check), tier assignment cannot exceed the caller's own tier, and `reset-password` rejects `id === req.userId`.
- **`/unlock` enumeration + unthrottled email bomb (MEDIUM).** The unlock endpoint returned `sent:false` for unknown/not-locked accounts and `sent:true` for locked ones, leaking account existence with no rate limit. All cases now return the same `{ sent: true }`, a per-account email cooldown (10 min) silently skips duplicate sends, and a per-IP limit (5/hr) returns 429.
- **Brute-force bypass (MEDIUM).** `fingerprintBlock` only blocked when ≥2 fingerprint vectors were locked, and the `trusted_ip` policy skipped the account lock when the request IP matched `registeredIp`/`lastLoginIp`. Fingerprint blocking now triggers on any single locked vector, and account locks always apply regardless of request-IP equality.
- **Spreadsheet formula injection in export (MEDIUM).** `bio`/`displayName`/`location` were written raw into exported sheets, so leading `=`, `+`, `-`, `@` or tab/CR/LF executed in Excel/LibreOffice (the import path was guarded, export was not). All user-controlled export values now pass through `sanitizeExportValue`, which prefixes `'` for values matching the formula-injection signature; the import guard regex was extended with `-`.
- **ACME tick stall (MEDIUM).** `acmeTick` processed NULL-expiry (`FAILED`/`PENDING`) domains first, so one unreachable domain could monopolize a run and delay real renewals. The tick now splits the run — `ISSUED` domains actually expiring (`tlsExpiresAt <= renewBy`) first, then non-`ISSUED` domains to fill remaining capacity, with `PENDING`/`FAILED` retried only after a 60-minute backoff.
- **Client IP can no longer be faked from the network.** The nginx published ports (`NGINX_PORT`/`NGINX_HTTPS_PORT`) are now bound to loopback (`127.0.0.1`) in `docker-compose.yml` (matching postgres and the backend), so only host-local processes (cloudflared, localhost dev) can reach nginx — a remote attacker cannot connect directly to inject a forged `X-Forwarded-For`/`CF-Connecting-IP`; every request must arrive via the trusted reverse proxy. Local traffic through docker-proxy (which masquerades its source as the docker bridge gateway) is surfaced as `127.0.0.1` instead of the gateway address. Residual trust boundary: a process already on the host or a sibling container on the same bridge could still forge the header, and binding the ports to `0.0.0.0` voids this guarantee.

### Changed
- Admin badge form: the `slug` field in the admin **Badges** tab is now labelled **Internal ID** (frontend-only rename; the API field and DB column stay `slug`), with a hint that it is a machine-readable identifier auto-derived from the label when left empty.
- Reverse-proxy client IP restoration is now generic: nginx restores the real client IP from the standard `X-Forwarded-For` chain set by **any** reverse proxy in front (Cloudflare Tunnel, Nginx, Caddy, Traefik, HAProxy, …) instead of Cloudflare's `CF-Connecting-IP` header specifically. Trusted sources are configured via `CF_TRUSTED_IPS` (default now `172.16.0.0/12,127.0.0.1,::1` — the docker bridge range plus loopback), and nginx overwrites `X-Real-IP`/`X-Forwarded-For` with the computed client IP so a client-supplied chain can never reach the backend.
- The Dashboard **Appearance** tab is now split into three sections: **Themes** (fully functional, unchanged behavior), plus **Layout** and **Background** placeholders that reserve space for future functionality and show a clear "Coming Soon" state (no logic, uploads, storage, or backend changes yet).

## [1.3.0-dev-beta.1] - 2026-08-12

### Security
- Private-profile presence leak closed: `GET /api/profiles/:identifier/presence` now returns 404 for non-public profiles (it previously exposed online status and current activity to anyone who knew the slug).
- Invite generation is now atomic: the allowance check and the spend run inside a single transaction with `SELECT … FOR UPDATE` on the user row, closing the check-then-spend race that could overdraw an allowance and mint more codes than credits.
- Discord presence is now event-driven like Discord's own clients: the cached status holds the last value the gateway reported and only flips to "offline" when Discord actually broadcasts an offline update — idle users no longer show as offline after a few minutes of no activity. Memory is still bounded by a background sweep that evicts entries unused for 2 hours (plus a full resync on gateway reconnect), so stale entries from users who leave the shared guild eventually clear.
- `requireAdmin` now requires a real admin-gate permission (`users.view/manage`, `profiles.manage`, `invites.manage`, `bans.manage`, `roles.manage`, `badges.manage`, `logs.view`) instead of passing any role with ≥1 permission (e.g. `api.basic`).
- `user.deleted` webhooks now actually fire: the event is awaited **before** the account row is deleted — previously the delete cascaded the user's webhooks first, so no delivery was ever attempted.
- Webhook transport hardened: destinations must be `https:` and every resolved IP must be public (loopback/private/ULA/multicast are rejected, with a DNS re-check on each redirect), and redirects are only followed to `https:` — no more plaintext sniffing, HTTP downgrades, or SSRF to internal services.
- Boolean env vars are parsed correctly: `ACME_ENABLED` and `SMTP_ENABLED` used `z.coerce.boolean()`, which coerces the string `"false"` to `true` — so with the env default `ACME_ENABLED=false` in `docker-compose.yml` the ACME certificate service ran even when explicitly disabled (and the same latent bug affected SMTP). Both now parse via an explicit `"true"`/`"1"` check, so `false` means disabled.

### Added
- **Custom domain support (self-serve)** — users on the PRO/ENTERPRISE tier whose role has the new `profiles.customDomain` permission can connect their own domain from a new Dashboard **Domain** tab: request a plain hostname (validated server-side, app host/`www.` rejected, one per profile, REJECTED entries reusable), prove ownership with a DNS TXT record (`_bioplatform.<domain>`, value `bioplatform-verify=<hex>`, checked live by the backend with a 10s timeout), then an admin activates it from the new **Custom Domains** tab (`GET/POST /api/admin/custom-domains[/:id/approve|reject]`, `profiles.manage` gate, only VERIFIED → ACTIVE). Active domains are resolved by `resolveCustomDomain` middleware (`ProfileDomain` model + `CustomDomainStatus` enum, migration `docs/migrations/2026-08-11_custom-domains.sql`).
- **Custom-domain root + host-aware OG** — the domain root serves either the landing page or a user-selected public profile (`PUT …/domain` rootTarget, validated against public slugs) and is mirrored client-side by `CustomDomainRoot` + `DomainContext` (`GET /api/domain`); social crawlers hitting a custom-domain root or profile URL get server-rendered OG from the backend with canonical/OG URLs pointing at the custom domain (nginx app-host map from `APP_URL_HOST` routes only non-app-host root bots to the backend, per-domain TLS `server` blocks generated from `./certs/<domain>/cert.pem`+`key.pem`, skipping with a warning when absent).
- **Automatic TLS for custom domains (ACME)** — with `ACME_ENABLED=true` the backend issues and auto-renews Let's Encrypt certificates (HTTP-01, `acme-client`) for every ACTIVE domain: an ACME account key is persisted under `./certs/acme/`, challenges are answered by a new `GET /.well-known/acme-challenge/:token` backend route, and certificates are written to `./certs/<domain>/` and tracked on the `ProfileDomain` row (`TlsStatus` enum `NONE/PENDING/ISSUED/FAILED`, `tlsIssuedAt/tlsExpiresAt/tlsError`). The backend now owns the generated nginx `custom-domains.conf` (per-domain HTTP blocks exposing the challenge + HTTPS→redirect, plus HTTPS blocks when a cert exists); the nginx entrypoint watches the file and reloads automatically when it changes, so manual cert drops are also picked up (default hourly). Admins can force issuance per domain (`POST /api/admin/custom-domains/:id/issue-cert`); the admin Custom Domains tab shows a TLS column and an **Issue cert** button, and the user Domain tab shows the certificate status/renewal date. New env vars: `ACME_ENABLED`, `ACME_DIRECTORY_URL`, `ACME_EMAIL`, `ACME_RENEW_BEFORE_DAYS`, `ACME_INTERVAL_MINUTES`, `ACME_MAX_DOMAINS_PER_RUN`, `ACME_CERTS_PATH`.

### Changed
- Discord bot invite button: the Discord settings tab now offers **Invite the bot to your server** (a new `botInviteUrl` field on `GET /api/discord`, built from `DISCORD_CLIENT_ID`), so any user can add the instance bot to a server they manage and start sharing presence without joining a shared hub. The bot was already multi-guild aware (per-user presence cache keyed by Discord user id, fed by every `GUILD_CREATE` and `PRESENCE_UPDATE`), so it works in any number of servers.
- Cloudflare Tunnel client IPs: nginx now restores the real visitor IP from Cloudflare's `CF-Connecting-IP` header for trusted sources only (new `CF_TRUSTED_IPS` env var, default `172.18.0.0/16,127.0.0.1,::1` — the docker bridge gateway plus loopback), so backend logs, analytics, and auth rate limiting record public IPs instead of the tunnel's local address. Keep `TRUST_PROXY=1`; raising it would trust spoofed `X-Forwarded-For` values.

### Fixed
- OG card cache now includes the track count in its cache key, so adding/removing music tracks invalidates the cached card and ETag immediately instead of serving a stale image for up to 5 minutes.
- Renaming a system role (Admin/User) no longer re-slugs it: system-role slugs are frozen (`admin`/`user`) and only the display name can change — fixing the footgun where renaming the Admin role away from `admin` locked it out of its full-permission branch and couldn't be renamed back.
## [1.2.1-dev-beta.1] - 2026-08-10

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

[1.3.0-dev-beta.2]: https://github.com/00kino547/BioPlatform/compare/v1.3.0-dev-beta.1...v1.3.0-dev-beta.2
[1.3.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.2.1-dev-beta.1...v1.3.0-dev-beta.1
[1.2.1-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.2.0-dev-beta.1...v1.2.1-dev-beta.1
[1.2.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.1.0-dev-beta.1...v1.2.0-dev-beta.1
[1.1.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.2...v1.1.0-dev-beta.1
[1.0.1-dev-beta.2]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.1...v1.0.1-dev-beta.2
[1.0.1-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.0-dev-beta.1...v1.0.1-dev-beta.1
[1.0.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/releases/tag/v1.0.0-dev-beta.1
