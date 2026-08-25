# TASKS.md

> High, Medium, Low priority. Move completed items to Completed.

## High Priority

- [ ] Affiliate/referral program — referrers earn a discount on their own plan and invited users also get a discount (e.g., % off PRO/ENTERPRISE for both parties) — Task Numbered H1
- [ ] Affiliate rewards — referrers get a reward for reaching referral milestones (e.g., a discount on upgrading to a paid plan, or premium perks), not new plan tiers — Task Numbered H2

## Medium Priority
- [ ] Appearance zone — Profiles layouts — Task Numbered M1
- [ ] Appearance zone — Profiles backgrounds — Task Numbered M2
- [ ] SSO (Single Sign-On) — let users sign in through a third-party identity provider (Google, GitHub, Discord OAuth, etc.) instead of username + password; link multiple providers to one account and expose a button next to the normal login form — Task Numbered M3
- [ ] Enterprise team management — the "leader" of an ENTERPRISE workspace can invite team members, assign each a role/permissions, manage seats, and see the whole team from the dashboard — Task Numbered M4
- [x] ~~GitHub version checker~~ — implemented (see Completed) — Task Numbered M5
- [ ] Configure SMTP for production (email unlock links, notifications) — SMTP_ENABLED=false until final production deployment — Task Numbered M6
- [x] ~~REST API for third-party integrations~~ — implemented (OpenAPI 3.0 spec at `/api/openapi.json`) — Task Numbered M7
- [ ] S3/R2/B2 storage providers — Task Numbered M8

## Low Priority

## Completed

- [x] GitHub version checker — backend fetches the public CHANGELOG (GitHub raw → GitHub API → jsDelivr, 8 s timeouts) and returns installed/latest/severity via public `GET /api/version`; TTL cache (12 h) + in-flight dedupe + stale-while-error (24 h), **fails open** (private repo / network / rate limit never locks anything); severity from skipped releases (`security` when any has security fixes, `critical` on security + ancient install or `UPDATE_CRITICAL_STALE_THRESHOLD` (3) skipped, or ancient-only, or skip-count-only); footer **version badge** for everyone (green/amber/red) opening a shared update dialog that renders the skipped releases' changelog sections and links to GitHub, admin panel Updates button + auto-popup on critical/security; **update lockdown** — security/critical blocks server-side (403 `updateRequired:true`) + disables in UI: passkey register/remove, TOTP setup/enable/disable, password change, admin user delete / tier/limits/role/badge / invite-ban / roles / badges mutations, webhook create/edit/pause/rotate/delete (test + deliveries keep working); env `UPDATE_CHECK_*` + `APP_GITHUB_URL`, OpenAPI `/api/version`, en/es docs + CHANGELOG parity
- [x] REST API for third-party integrations — the OpenAPI 3.0 spec at `/api/openapi.json` (+ in-app `/api-docs`) is the machine-readable contract: public profile, badges, music, email, analytics, Discord presence, webhooks, invites & admin endpoints, tier-gated access levels (`basic`/`advanced`/`enterprise`) overridable per role
- [x] Social link labels + editing — optional per-link `label` shown on the public profile, inline edit form in the Dashboard Links tab (platform/URL/label), zod strip+trim+max-64 validation on the backend, OpenAPI/docs/CHANGELOG parity
- [x] Invites tab crash fix — the dashboard Invites tab read the wrong API response shape and crashed the whole page; now consumes the real `{ success, data, meta }` shape and tolerates unexpected responses
- [x] Registration validation and invite failure counting — register reports field-specific validation errors, and only invalid invite attempts increment auth blacklist counters
- [x] SEO + agent browsing — real `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt` served from the backend (TTL-cached) with nginx locations and SPA reservations; server-rendered OG pages (richer OG meta + `ProfilePage`/`Person`/`WebSite` JSON-LD with `sameAs`) served to 30+ social + AI crawler UAs via an nginx `$is_bot` map; client-side `useJsonLd` replaces the removed inline script. Lighthouse SEO 92 → 100 (the remaining best-practices 92 console error is Cloudflare's injected inline challenge script, blocked by CSP — documented)
- [x] Passkeys on custom domains — WebAuthn rpID/origin derived per request from the `Host` header for hosts outside `WEBAUTHN_ORIGIN` (custom domains keep the app-host env config); passkeys are per-domain scoped; en/es docs + CHANGELOG updated
- [x] Social platform expansion — added GitLab, Reddit, Pinterest, Snapchat, Threads, Bluesky, Mastodon, WhatsApp, Telegram, Signal, Kick, Steam, SoundCloud to `ALLOWED_PLATFORMS`, the Dashboard platform picker, `PlatformIcon` (SVG + color + display name); en/es docs + CHANGELOG updated
- [x] Custom domain support — self-serve DNS TXT verification (`_bioplatform.<domain>` = `bioplatform-verify=<hex>`, checked live by the backend) + mandatory admin approval (new **Custom Domains** admin tab, `profiles.manage` gate), gated on PRO/ENTERPRISE tier **and** the new `profiles.customDomain` permission; user-selected root behavior (landing page or a public profile, validated against public slugs) mirrored client-side (`CustomDomainRoot` + `DomainContext` via `GET /api/domain`) and served to social crawlers with host-aware server-rendered OG (canonical/OG URLs point at the custom domain); nginx per-domain TLS `server` blocks generated from `./certs/<domain>/cert.pem`+`key.pem` (warning+skip when absent) and an `APP_URL_HOST` app-host map so only non-app-host root bots hit the backend OG; `ProfileDomain` model + `CustomDomainStatus` enum, migration `docs/migrations/2026-08-11_custom-domains.sql` (applied live), Dashboard **Domain** tab (request/verify/root/disconnect), OpenAPI + en/es docs + CHANGELOG parity
- [x] Automatic TLS for custom domains (ACME) — backend issues/auto-renews Let's Encrypt certs (HTTP-01 via `acme-client`) for every ACTIVE domain when `ACME_ENABLED=true`: persisted account key under `./certs/acme/`, `GET /.well-known/acme-challenge/:token` backend route, certs written to `./certs/<domain>/` and tracked on `ProfileDomain` (`TlsStatus` enum + `tlsIssuedAt/tlsExpiresAt/tlsError`); backend owns the generated nginx `custom-domains.conf` (HTTP blocks with challenge + redirect, HTTPS blocks when a cert exists), nginx entrypoint watches and reloads automatically (manual cert drops picked up hourly); admin per-domain **Issue cert** (`POST /api/admin/custom-domains/:id/issue-cert`) + TLS column in admin tab, cert status/renewal date in user Domain tab; env vars `ACME_*` + `./certs` volume in backend; OpenAPI + en/es docs + CHANGELOG parity. E2E-verified end-to-end against a local Pebble ACME server (docker network, `acme1.example`/`acme2.example` issued 90-day certs, `admin-acme.example` re-issued on expiry within the renew window proving renewal, `fail3.example` marked FAILED on unreachable DNS; HTTP-01 challenge + HTTP→HTTPS redirect + HTTPS serving + auto-reload all confirmed via curl; 401/403/400 admin gate checks passed). Test rows, temp user, Pebble container, and `NODE_EXTRA_CA_CERTS` override all removed afterwards. Deployment-level named-tunnel ingress rules per domain (routing `/.well-known/acme-challenge/*` to the backend) remain external to the repo.

- [x] Post-release audit fixes (round 3) — M1 private-profile presence 404, M2 Discord presence reworked to event-driven state (status holds the last gateway-reported value and only shows offline when Discord broadcasts it; 2h background sweep + READY resync keep memory bounded), M3 atomic invite allowance transaction (`SELECT … FOR UPDATE`), L4 `requireAdmin` admin-gate permission set, L5 `user.deleted` webhook dispatched before account delete, L6 webhook https-only + public-IP-only DNS guard + https-only redirects, L7 OG cache key includes track count, L8 system-role slugs frozen (display name only) — plus Cloudflare Tunnel client-IP forwarding: nginx `real_ip` restores the visitor IP from `CF-Connecting-IP` for `CF_TRUSTED_IPS` sources only, so backend logs/analytics/auth rate limiting see public IPs; `.env`, `docker-compose.yml`, nginx entrypoint/site.conf, en/es docs updated

- [x] Self-service invite system — global **User invite generation** master switch in the admin panel (new `system_settings` table, `GET/PUT /api/admin/invite-settings`, no environment variable), new `invites.generate` permission + per-role invite config (`inviteBatchLimit`, `inviteOutstandingLimit`, `inviteCooldownMinutes`, `inviteDefaultExpiryDays`, `inviteMinExpiryDays`, `inviteMaxExpiryDays`) managed in the admin Roles tab, **invite events** (`POST /api/admin/invite-events`, `count` + `expiryDays`/weeks) granting every non-banned user an expiring **allowance** recorded in a new `invite_grant_events` table (existing unexpired allowances extended via `GREATEST(...)` SQL), user-side generation from the Dashboard **Invites** tab with quota/cooldown/expiry-bounds enforcement (max capped by remaining allowance days), **refund sweep** (`runInviteRefundSweep`, lazy on GET/POST `/api/invites`) returning credits for allowance codes that expire unused before the allowance does (`fromAllowance` + `refundedAt` columns), **per-user invite bans** (`PATCH /api/admin/users/:id` `inviteBanned` → zeroes allowance, revokes outstanding codes in one transaction, excludes from events; unban restores access without the old allowance), admin audit of events via `GET /api/admin/invite-events`, user codes table with EVENT badge, migration `docs/migrations/2026-08-10_invite-system.sql` (applied live), OpenAPI + en/es docs + CHANGELOG parity

- [x] Webhook event expansion — admin/user events (`profile.created`, `profile.deleted`, `user.registered`, `user.updated`) and per-webhook custom JSON payload templates with `{{placeholders}}` (max 2000 chars, validated on save, rendered at delivery time, signature covers the rendered body)
- [x] Rich Discord activity card — large album art for music, app art for games/streams/YouTube with type label + title + subtitle, and presence buttons rendered as pills (labels only, since Discord presence payloads never include button URLs)
- [x] Live presence on the public bio page — lightweight public endpoint `GET /api/profiles/:identifier/presence` polled every 15s (while the gate is open and tab visible), so switching game/music/streams updates the widget without reload; activity `timestamps` captured in the gateway and exposed, driving a live progress timebar (elapsed / total, `mm:ss`)

- [x] Project scaffolding (monorepo, Docker, Prisma, Express, React)
- [x] Docker Compose (postgres, backend, frontend, nginx)
- [x] Prisma schema (User + InviteCode + Profile models)
- [x] Express server with health endpoint
- [x] React + Vite + TailwindCSS setup
- [x] Shared types package
- [x] StorageProvider interface
- [x] Landing page (Hero, Features, Showcase, Pricing, FAQ, Footer)
- [x] Scroll-reveal animations
- [x] Interactive theme selector in Showcase
- [x] Configurable branding via env vars
- [x] SEO meta tags, OpenGraph, structured data
- [x] README.md and README.es.md
- [x] LICENSE (MIT)
- [x] .gitignore
- [x] AI documentation (AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md, PROMPTS.md)
- [x] Docker build fix (copy source before install)
- [x] Pricing content update (correct features per tier)
- [x] FAQ invite system explanation
- [x] Premium badge centering fix
- [x] Pricing hover flickering fix
- [x] Auth system (JWT, bcrypt at 12 rounds, register/login/me)
- [x] Invite-only registration (invite codes with soft revoke, seed script)
- [x] Auth middleware (requireAuth, requireAdmin)
- [x] Frontend auth (API client, AuthContext, ProtectedRoute)
- [x] Login and Register pages
- [x] Dashboard page (user) + Admin Dashboard (admin)
- [x] Admin/user view toggle via navbar links
- [x] React Router with /dashboard and /admin routes
- [x] Invite code revoke (backend + frontend)
- [x] Invite code expiry display in table
- [x] Change own password route
- [x] Admin user management (list users, update details, reset password)
- [x] CORS fix (relative API URLs via Nginx proxy)
- [x] Branding used everywhere (no hardcoded names/URLs)
- [x] Profile model (bio, avatar, banner, displayName, location, website, socialLinks JSON, theme JSON, isPublic)
- [x] Profile API routes (GET/PUT /me, POST avatar/banner, DELETE avatar/banner, GET /:username)
- [x] Public profile page (/:username route, themed, social links with icons)
- [x] Dashboard profile editor (Profile, Links, Appearance tabs)
- [x] File uploads (multer, local storage, 5MB limit, extension-only filter)
- [x] Private profiles (owner-only visibility with optional JWT on public endpoint)
- [x] Admin profile editing (view/edit any user's profile from admin dashboard)
- [x] Auto-profile creation on registration
- [x] Avatar and banner removal (DELETE routes + UI buttons)
- [x] Theme presets (8 built-in themes: Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal)
- [x] Appearance tab in Dashboard with interactive theme selector
- [x] Platform icons (SVG icons for Twitter/X, GitHub, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email)
- [x] Email platform: auto-prepend mailto:, mailto links on public profile
- [x] Discord platform: username validation (new format, no discriminator) + invite link support
- [x] Save error display in Dashboard (red banner on failed saves)
- [x] Input sanitization (strip HTML-like characters from displayName, bio, location, social link URLs)
- [x] Platform allowlist (backend rejects unknown platform names)
- [x] Docker network fix (renamed to bioplatform_net)
- [x] Privacy Policy page (/privacy)
- [x] Terms of Service page (/terms)
- [x] PublicProfile "Powered by" links to GitHub repo
- [x] CHANGELOG.md (starting from 1.0.0-beta.1)
- [x] Landing page buttons fully functional (Hero CTA, nav, pricing, footer links)
- [x] Footer links configurable via env (Changelog, Docs, Status, Privacy, Terms, Contact)
- [x] Analytics dashboard (PageView + LinkClick models, stats API, Dashboard Analytics tab with bar charts)
- [x] Email notifications via SMTP (Gmail preset + custom SMTP, Dashboard Email tab with test button)
- [x] Link click tracking on public profiles
- [x] Global SMTP config via .env (SMTP_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_*)
- [x] Per-user email notification preferences (notifyOnView, notifyOnClick) with Dashboard toggles
- [x] Anti-spam email headers (HELO, List-Unsubscribe, X-Mailer, X-Priority, Precedence, envelope)
- [x] Admin credentials via .env (ADMIN_EMAIL, ADMIN_PASSWORD)
- [x] Unique view/click tracking (visitor_id from IP + User-Agent + bp_vid cookie)
- [x] Owner view/click exclusion (owner's own activity not counted)
- [x] Non-auth link click tracking (POST /click works for anonymous visitors)
- [x] Enhanced analytics graphs (dual total/unique bars, hover tooltips with date, platform colors)
- [x] Privacy policy update (bp_vid cookie, analytics data collection, 90-day retention)
- [x] Music player integration (local audio uploads + Spotify + YouTube embeds, tier-based track limits, admin trackLimit control)
- [x] Two-factor authentication (TOTP via authenticator apps, verify-and-enable + disable, QR setup in Security tab)
- [x] WebAuthn passkeys (passwordless login + passkey as 2FA, resident/non-resident choice, Security tab management, server-side challenge store)
- [x] Multi-step login flow (username/email → passwordless or password → TOTP/passkey 2FA)
- [x] Anti-brute-force auth rate limiting (fingerprint 2-of-3 blocks, per-account lockouts, permanent bans, trusted-IP cap, admin unban panel)
- [x] Configurable auth lock policy (AUTH_LOCK_POLICY: block / trusted_ip / email with email unlock link) and lock duration (AUTH_LOCK_DURATION_MINUTES, -1 = permanent)
- [x] Auth log table + admin Logs tab (failed attempts, reason, penalty, trigger) with cron cleanup of expired/retention-aged entries
- [x] Admin account unlock (POST /api/admin/auth-unlock) — clears the account ban plus the fingerprint (IP/cookie) bans recorded against that account, and its failed auth-log entries
- [x] Security audit fixes — seed admin creds from env (no hardcoded default), admin-only invite minting, per-IP rate limit on public view/click endpoints, atomic invite consumption + email normalization on register, trusted `req.ip` + sanitized referer in analytics, Nginx CSP/Permissions-Policy/`server_tokens off`, Postgres bound to loopback
- [x] TLS on 443 — `TLS_MODE` env var (development = auto self-signed certs as `self-signed.pem`/`self-signed.key` in `./certs/`, production = deletes them + requires real cert.pem/key.pem), HSTS sent in production only (`SEND_HSTS_ON_DEV=true` opt-in for dev), `JWT_SECRET` min 32 chars validation
- [x] Security audit round 2 — server-side `theme` CSS validation (hex/rgb/rgba/hsl/hsla + safe font-family charset, rejects CSS injection), uniform login responses to stop user enumeration (always-found `/login/start` + generic 401 on passkey/2FA for unknown users), email unlock now clears the account's fingerprint bans and failed auth-log entries (localStorage JWT kept with CSP as accepted risk)
- [x] Webhook support for integrations — per-account webhooks (`/api/webhooks`) with AES-256-GCM encrypted one-time secrets, HMAC-SHA256 signature header, events `profile.viewed` / `link.clicked` / `profile.updated`, test delivery, retry sweep (0s/60s/5m/15m/60m, max 5 attempts) with delivery log, Dashboard **Webhooks** tab (create/edit/pause/test/rotate/delete, secret shown once)
- [x] Profile export / data portability — single-sheet spreadsheet export (`.xlsx` default / `.ods`) and import (`.xlsx`/`.ods`/`.csv`), macro files rejected, formula-looking values skipped with warnings, Dashboard **Data** tab
- [x] API documentation — OpenAPI 3.0 served at `/api/openapi.json`, in-app `/api-docs` reference page, `docs/en/api.md` + `docs/es/api.md` (exact parity), AGENTS.md docs-parity rule added
- [x] Discord presence + link previews — OAuth2 account link (scope `identify`, `prompt=consent`) plus a shared bot gateway session (`DISCORD_BOT_TOKEN`, `GUILDS|GUILD_PRESENCES` intents, heartbeat/resume/reconnect, fatal-close handling) that feeds an in-memory presence cache keyed by user id (user must share a guild with the bot), public presence widget (status/activity/custom status), OG meta page (`GET /:username`) + server-rendered 1200×630 PNG card (`GET /api/profiles/:username/og.png`), "Post to Discord" webhook embed button, Dashboard **Discord** tab, `DiscordConnection` model, AES-256-GCM encrypted token/webhook storage, bot session starts on boot, env-gated by `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_REDIRECT_URI` (OAuth) + `DISCORD_BOT_TOKEN` (presence), optional `DISCORD_GUILD_INVITE` renders a "Join presence hub" button; **Invite the bot to your server** button (`botInviteUrl` on `GET /api/discord`, built from `DISCORD_CLIENT_ID`, perms 0, scope `bot`) so users can add the bot to any server they manage — bot is multi-guild aware and works in any number of servers
- [x] Multi-profile, aliases, and badges — `Profile.slug`/`isPrimary`/`badges` (badge enum: DEV, OWNER, STAFF, MODERATOR, VERIFIED, PREMIUM, ENTERPRISE), `ProfileAlias` model, per-profile scoping via `?profileId=` across music/email/analytics/discord settings, tier limits (profiles FREE 1 / PRO 3 / ENTERPRISE 10; aliases FREE 0 / PRO 5 / ENTERPRISE 25) with admin per-user overrides (`profileLimit`, `aliasLimit`), public resolution by slug or alias (`GET /api/profiles/:identifier`) with `requestedSlug`, primary-slug-rename rejected, Dashboard **Profiles** tab (create/delete/set-primary/aliases/badges) + header profile switcher, badge pills on public pages, OpenAPI/docs/admin-UI parity, migration SQL recorded in `docs/migrations/`
- [x] WebAuthn multi-origin — `WEBAUTHN_ORIGIN` accepts a comma-separated list of origins (e.g. `http://localhost:80,https://localhost`) so passkeys work on both an HTTP local deployment and an HTTPS domain; `.env.example` + docs parity
- [x] Role-based access control (RBAC) — `Role` model replacing the USER/ADMIN enum (`User.roleId`, `Role.permissions String[]`), permission constants in `lib/permissions.ts` (`users.view`, `users.manage`, `profiles.manage`, `invites.manage`, `bans.manage`, `roles.manage`, `badges.manage`, `logs.view`), admin middleware `requirePermission`, `admin`/`user` system roles (admin locked full-access, user is the registration default, reserved slugs not reusable, custom roles deletable only when unassigned), admin Roles tab with permission checkboxes, role dropdown in user edit, `isAdmin`/permissions/role object in auth payloads, invite route re-gated on `invites.manage`, register requires the `user` role to exist
- [x] Badge catalog — `Badge` model (slug/label/color/icon, `isSystem`) replacing the fixed badge list, admin Badges tab (create/edit/delete with live preview, system badges undeletable with fixed slugs), public `GET /api/badges` catalog, profile/user badges now reference catalog ids, colored-icon `BadgePill` rendering on public profiles, Dashboard badge toggles, OpenAPI + docs + CHANGELOG parity
- [x] Security audit round 3 (pre-RC) — token-purpose confusion (session tokens signed `purpose: "auth"`, `requireAuth`/`getViewerId` reject `twofactor`/`unlock`); webhook SSRF via redirects + DNS rebinding (manual redirect loop, per-hop validation, `https:`-only, resolved-IP socket pinning, `net.BlockList` private/reserved ranges incl. IPv4-mapped-IPv6); `X-Forwarded-For` spoofing (nginx overwrites `X-Forwarded-For`/`X-Real-IP` with the computed client IP); `/api/profiles/click` abuse (isPublic gate, platform-existence check, per-profile rate limit); privilege escalation via `users.manage` (role/tier changes need `roles.manage`, permission-subset check, tier ceiling, reset-password self-guard); `/unlock` enumeration + email bomb (uniform response, 10-min per-account cooldown, 5/hr per-IP limit); brute-force bypass (single locked vector blocks, `trusted_ip` never skips account locks); spreadsheet formula injection on export (`sanitizeExportValue` `'`-prefix); ACME tick stall (ISSUED-expiring-first scheduling, 60-min FAILED backoff)
- [x] Generic, unforgeable reverse-proxy client IPs — nginx restores the real client IP from the standard `X-Forwarded-For` chain for trusted sources only (`CF_TRUSTED_IPS`, default `172.16.0.0/12,127.0.0.1,::1`), works with any reverse proxy (Cloudflare Tunnel, Nginx, Caddy, Traefik, HAProxy, …), overwrites `X-Forwarded-For`/`X-Real-IP` so client-supplied chains never reach the backend, and the nginx published ports are bound to loopback (`127.0.0.1`) so remote clients cannot forge the header; docker-proxy gateway traffic is surfaced as `127.0.0.1`; docs en/es parity
- [x] Admin badge form — the badge `slug` field is labelled **Internal ID** in the admin Badges tab (frontend-only rename, API/DB field unchanged)
- [x] Security audit round 4 (rc.2→rc.3) — 21 findings remediated: docker-compose `build:` section restored (B1), build scripts fixed to use repo root context (B2), PowerShell build scripts populated (B3), `FALLBACK_VERSION` changed from `"0.0.0"` to `"unknown"` with severity guard against self-lockdown (S2), `lastGoodAt` stale-cache expiry fix (S3), `.env.example` localhost-only placeholders (S4), per-IP registration probe counter (S5), music upload Zod failure returns 400 + file cleanup (S6), version-check unit tests (S7), entrypoint `db push` removed + conditional `SEED_ON_START` (S8), Dashboard `removeLink` cancels edit (S1), `Cache-Control: no-store` on `/api/version` (N1), `refresh()` catch block (N2), frontend version fallback `"unknown"` (N3), dialog `role="dialog"` + `aria-modal` + focus (N4), `releaseUrl` protocol check (N5), 2 MB body size limit on version fetch (N6), frontend entrypoint JSON escape newlines (N7), CI dead `VITE_*` build-args removed (N9), public profile label truncation (N10), `nanoid`→3.3.18 + `deepmerge-ts`→8.0.0 pnpm overrides (0 vulnerabilities)
