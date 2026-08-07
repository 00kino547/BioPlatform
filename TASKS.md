# TASKS.md

> High, Medium, Low priority. Move completed items to Completed.

## High Priority

- [ ] Custom domain support
- [ ] Affiliate/referral program — referrers earn a discount on their own plan and invited users also get a discount (e.g., % off PRO/ENTERPRISE for both parties)
- [ ] Affiliate rewards — referrers get a reward for reaching referral milestones (e.g., a discount on upgrading to a paid plan, or premium perks), not new plan tiers

## Medium Priority

- [ ] GitHub version checker — on every admin panel entry, show an update warning banner with the CHANGELOG.md loaded and rendered formatted; footer shows the app version (in red when the pending update is critical/security), plus an "Update" state when the installed version is outdated
- [ ] Configure SMTP for production (email unlock links, notifications) — SMTP_ENABLED=false until final production deployment
- [ ] REST API for third-party integrations
- [ ] S3/R2/B2 storage providers

## Low Priority

- [ ] Webhook event expansion (admin/user events, custom payload templates)

## Completed

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
- [x] Discord presence + link previews — per-user OAuth2 gateway session (scopes `identify gateway.connect`, `prompt=consent`, intents 0, invisible presence; 4004→refresh, 4015 backoff), in-memory presence cache, public presence widget (status/activity/custom status), OG meta page (`GET /:username`) + server-rendered 1200×630 PNG card (`GET /api/profiles/:username/og.png`), "Post to Discord" webhook embed button, Dashboard **Discord** tab, `DiscordConnection` model, AES-256-GCM encrypted token/webhook storage, session restore on boot, fully env-gated by `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_REDIRECT_URI` (removed `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID`)
- [x] Multi-profile, aliases, and badges — `Profile.slug`/`isPrimary`/`badges` (badge enum: DEV, OWNER, STAFF, MODERATOR, VERIFIED, PREMIUM, ENTERPRISE), `ProfileAlias` model, per-profile scoping via `?profileId=` across music/email/analytics/discord settings, tier limits (profiles FREE 1 / PRO 3 / ENTERPRISE 10; aliases FREE 0 / PRO 5 / ENTERPRISE 25) with admin per-user overrides (`profileLimit`, `aliasLimit`), public resolution by slug or alias (`GET /api/profiles/:identifier`) with `requestedSlug`, primary-slug-rename rejected, Dashboard **Profiles** tab (create/delete/set-primary/aliases/badges) + header profile switcher, badge pills on public pages, OpenAPI/docs/admin-UI parity, migration SQL recorded in `docs/migrations/`
- [x] WebAuthn multi-origin — `WEBAUTHN_ORIGIN` accepts a comma-separated list of origins (e.g. `http://localhost:80,https://localhost`) so passkeys work on both an HTTP local deployment and an HTTPS domain; `.env.example` + docs parity
- [x] Role-based access control (RBAC) — `Role` model replacing the USER/ADMIN enum (`User.roleId`, `Role.permissions String[]`), permission constants in `lib/permissions.ts` (`users.view`, `users.manage`, `profiles.manage`, `invites.manage`, `bans.manage`, `roles.manage`, `badges.manage`, `logs.view`), admin middleware `requirePermission`, `admin`/`user` system roles (admin locked full-access, user is the registration default, reserved slugs not reusable, custom roles deletable only when unassigned), admin Roles tab with permission checkboxes, role dropdown in user edit, `isAdmin`/permissions/role object in auth payloads, invite route re-gated on `invites.manage`, register requires the `user` role to exist
- [x] Badge catalog — `Badge` model (slug/label/color/icon, `isSystem`) replacing the fixed badge list, admin Badges tab (create/edit/delete with live preview, system badges undeletable with fixed slugs), public `GET /api/badges` catalog, profile/user badges now reference catalog ids, colored-icon `BadgePill` rendering on public profiles, Dashboard badge toggles, OpenAPI + docs + CHANGELOG parity
