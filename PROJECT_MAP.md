# PROJECT_MAP.md

> Update when files move or new modules are created.

## Backend

```
apps/backend/src/
├── index.ts              # Entry point
├── app.ts                # Express setup, middleware, routes
├── config/env.ts         # Zod-validated env vars
├── lib/
│   ├── prisma.ts         # Prisma client singleton
│   ├── email.ts          # Email service (nodemailer, Gmail preset, custom SMTP)
│   ├── music.ts          # Track limits per tier, Spotify/YouTube URL parsing → embed URLs, fullUrl parsing
│   ├── totp.ts           # TOTP secret generation + code verification (otplib)
│   ├── validation.ts     # Shared sanitization (stripHtml) + URL/platform/discord validators, profile/alias/slug schemas
│   ├── limits.ts         # Tier limits: profileLimit/aliasLimit/trackLimit per tier + admin per-user overrides, limits summary for /profiles/me
│   ├── profile.ts        # Profile helpers: slug/alias resolution (byProfileOrAlias), primary profile resolution, backfill/slug normalization, sanitize
│   ├── webauthn.ts       # Passkey helpers (register/login options, challenge store, verify register/login/2FA)
│   ├── authGuard.ts      # Auth rate limiting: fingerprint (IP/cookie/UA), lock policy (block/trusted_ip/email), lock duration, auth log helpers
│   ├── webhook.ts        # Webhook lib: events, secret gen/encryption (AES-256-GCM), HMAC signing, delivery + retry sweep
│   ├── profileTransfer.ts# Spreadsheet export/import (xlsx/ods/csv via @e965/xlsx, macro reject, formula-injection guard)
│   ├── discord.ts        # Discord OAuth2: scopes, state create/verify, code exchange + refresh grant, @me fetch, avatar URLs, purpose-scoped secret encryption (token/webhook), webhook URL validation
│   ├── discordGateway.ts # Shared bot gateway session (GUILDS|GUILD_PRESENCES intents, heartbeat/resume/reconnect, fatal-close handling), in-memory presence cache keyed by user id, describeActivities
│   ├── profileOg.ts      # OG data builder for a public profile (presence line + counts) → PNG card + HTML meta page (host-aware: custom-domain canonical/base URLs)
│   ├── ogCard.ts         # Server-rendered 1200x630 OG card PNG (@napi-rs/canvas)
│   ├── og.ts             # OpenGraph/Twitter meta HTML (escapeHtml + buildOgPage + buildLandingOgPage)
│   ├── customDomains.ts  # Custom domains: hostname validator, app-host detection, TXT verification token + DNS check, PRO/ENTERPRISE + permission gate, status list
│   ├── badges.ts         # Badge ordering helper (orderBadges: saved order first, remaining badges keep original order, stale/duplicate ids ignored)
│   ├── acme.ts           # ACME (Let's Encrypt) service: HTTP-01 challenge map, account key, issue/renew certs, nginx custom-domains.conf generator, interval loop
│   ├── seo.ts            # robots.txt/sitemap.xml/llms.txt/llms-full.txt builders with TTL cache
│   └── openapi.ts        # OpenAPI 3.0 document served at /api/openapi.json
├── middleware/auth.ts     # JWT verification middleware (requireAuth, requireAdmin)
├── middleware/rateLimit.ts # Auth anti-brute-force middleware (cookie issuance, 2-of-3 fingerprint block, policy-aware account lock, outcome + log recording)
├── middleware/domain.ts   # resolveCustomDomain: maps active ProfileDomain → req.customDomain (skips app host)
└── routes/
    ├── auth.ts           # Register, login/start, login (password + 2FA), passkey login/2FA (host-aware rpID/origin for custom domains), passkey CRUD, TOTP setup/enable/disable, me, change-password, unlock, unlock/verify
    ├── invite.ts         # Invite code CRUD (create, list, revoke)
│   ├── profile.ts        # Multi-profile CRUD (list/create, get/update/delete per profileId, set-primary), aliases CRUD, badges toggle + order, avatar/banner upload+delete, spreadsheet export/import, public profile by slug/alias (incl. discord presence), click tracking, OG card PNG
    ├── admin.ts          # Admin: list users, update user (tier, track/profile/alias limits, badges), reset password, edit profiles, list/unban auth bans, account unlock, auth log, custom-domain list/approve/reject/issue-cert
    ├── analytics.ts      # Analytics stats (views, clicks, referrers, platform breakdown) — ?profileId scoped
    ├── email.ts          # Email notification settings (SMTP config, test endpoint) — ?profileId scoped
    ├── music.ts          # Music tracks CRUD (create, upload, patch, reorder, delete) — ?profileId scoped
    ├── webhook.ts        # Webhook CRUD (list, create, patch, rotate-secret, test, deliveries, delete)
    ├── domain.ts         # Custom domains: public GET /api/domain (host/active/root), user self-serve request/verify/root/remove
    └── discord.ts        # Discord: status, OAuth connect/callback, disconnect, settings, post-to-webhook, session restore on boot — ?profileId scoped
apps/backend/prisma/
├── schema.prisma         # User (tier, trackLimit, profileLimit, aliasLimit, badges, totpSecret, totpEnabled, registeredIp, lastLoginIp), Profile (slug, isPrimary, badges, customDomain relation, incl. showDiscordPresence/showDiscordActivity/discordWebhookUrlEncrypted), ProfileDomain (custom domains + TLS cert status fields), ProfileAlias (slug per profile), DiscordConnection, InviteCode, PageView, LinkClick, MusicTrack, Passkey, WebAuthnChallenge, AuthBan, AuthLog, Webhook, WebhookDelivery models
└── seed.ts               # Bootstrap admin + invite codes
apps/backend/tests/
├── setup-env.ts          # Test env bootstrap (loads .env, points DATABASE_URL at bioplatform_test)
└── badges-order.test.ts  # Unit + integration tests for badge ordering (Node test runner via tsx)
```

## Frontend

```
apps/frontend/src/
├── main.tsx              # Entry point
├── App.tsx               # Root component + React Router (/, /login, /register, /unlock, /dashboard, /admin, /privacy, /terms, /:username) — wraps in DomainProvider, CustomDomainRoot resolves the custom-domain root (redirect to root-target profile slug, else Landing)
├── index.css             # TailwindCSS + animations + scroll-reveal
├── config/branding.ts    # Branding env vars (VITE_*)
├── config/env.ts           # Env accessor: window.__APP_CONFIG__ (runtime, injected by the container) over import.meta.env (build time)
├── contexts/
│   ├── AuthContext.tsx    # Auth state (login, register, logout)
│   └── DomainContext.tsx  # Custom-domain info for the current host (active, host, root slug, canonical) via GET /api/domain
├── lib/
│   ├── api.ts            # API client (auth incl. passkeys/TOTP/2FA, multi-profile CRUD + aliases + badges + badge order, upload, export/import, analytics, email, music, webhooks, discord, custom domains) — profile-scoped calls take profileId
│   ├── seo.ts            # usePageMeta + JSON-LD (optional baseUrl for custom domains)
│   └── utils.ts          # cn() utility
├── components/
│   ├── ui/
│   │   ├── button.tsx        # Button (5 variants)
│   │   ├── card.tsx          # Card (6 subcomponents)
│   │   ├── badge.tsx         # Badge (5 variants)
│   │   ├── scroll-reveal.tsx # IntersectionObserver wrapper
│   │   └── PlatformIcon.tsx  # SVG icons for social platforms (11 platforms)
│   ├── auth/
│   │   ├── ProtectedRoute.tsx # Redirect to /login if unauthenticated
│   │   └── SecurityTab.tsx    # Dashboard Security tab (passkeys + TOTP management)
│   ├── settings/
│   │   ├── WebhooksTab.tsx    # Dashboard Webhooks tab (create/edit/toggle/test/rotate/secret/deliveries)
│   │   ├── DataTab.tsx        # Dashboard Data tab (spreadsheet export/import)
│   │   ├── InvitesTab.tsx     # Dashboard Invites tab (generate/revoke codes, allowance, cooldown)
│   │   ├── DomainTab.tsx      # Dashboard Domain tab (request TXT-verified custom domain, verify, root target, disconnect)
│   │   └── DiscordTab.tsx     # Dashboard Discord tab (connect/disconnect, presence toggles, webhook + post, invite bot)
│   ├── music/
│   │   └── MusicPlayer.tsx   # Playlist picker + embedded player (local/Spotify/YouTube, full version + Open in Spotify)
│   ├── discord/
│   │   └── PresenceWidget.tsx # Shared Discord presence card (status dot, activity line/icon, custom status, album art)
│   ├── layout/
│   │   ├── Container.tsx     # Max-width container (3 sizes)
│   │   └── Navbar.tsx        # Sticky navbar, scroll-aware glass
│   └── landing/
│       ├── Hero.tsx          # Hero with animated grid, stats
│       ├── Features.tsx      # Bento grid (10 cards)
│       ├── Showcase.tsx      # Browser + mobile mockups, theme selector
│       ├── Pricing.tsx       # 3-tier pricing
│       ├── FAQ.tsx           # Accordion FAQ (6 questions)
│       └── Footer.tsx        # Footer with links, social
├── pages/
│   ├── Login.tsx         # Multi-step login (identifier → passwordless/password → 2FA, email unlock)
│   ├── Register.tsx      # Register form (invite code required)
│   ├── Unlock.tsx        # Email unlock link handler (/unlock?token=)
│   ├── Dashboard.tsx     # Profile editor (Profiles, Profile, Links, Appearance, Analytics, Email, Music, Webhooks, Data, Discord, Invites, Domain, Security tabs) with multi-profile switcher
│   ├── AdminDashboard.tsx # Admin panel (Invite Codes, Users, Roles, Badges, Bans, Logs, Custom Domains tabs, profile editing modal, tier control, Unlock account actions)
│   ├── PublicProfile.tsx # Themed public profile page (/:username, includes MusicPlayer + Discord presence widget; custom-domain host-aware canonical/OG via useDomain)
│   ├── ApiDocs.tsx       # In-app API reference (/api-docs, renders /api/openapi.json)
│   ├── Privacy.tsx       # Privacy Policy page (/privacy)
│   └── Terms.tsx         # Terms of Service page (/terms)
```

## Shared Package

```
packages/shared/src/
├── index.ts              # Public exports
├── types/user.ts         # User, Role, ApiResponse
└── storage/              # StorageProvider interface + local stub
```

## Configuration

```
docker-compose.yml    # Service orchestration (postgres, backend, frontend, nginx profile)
apps/frontend/Dockerfile.test  # Prebuilt-friendly frontend image: no build args; docker-entrypoint.sh injects VITE_* env vars at container start
apps/frontend/public/env.js    # Runtime config stub overwritten by the container entrypoint
pnpm-workspace.yaml   # Workspace + pnpm config (allowBuilds, node-linker)
.env / .env.example   # Environment variables
nginx/nginx.conf      # Reverse proxy config (/api, /uploads, ACME challenge, SPA fallback, custom-domains.conf include, app-host map)
nginx/site.conf       # Server block (ACME challenge proxy, bot root rule, social-crawler OG proxying, security headers)
nginx/entrypoint.sh   # Startup: real-IP conf, HSTS, backend-managed custom-domains.conf watch + reload, app-host map
```

## Documentation

```
AGENTS.md         # AI agent instructions
PROJECT_MAP.md    # This file
DECISIONS.md      # Architecture decisions
TASKS.md          # Task tracking
PROMPTS.md        # Reusable AI prompts
CHANGELOG.md      # Version history (Keep a Changelog format)
README.md         # Human documentation (English)
README.es.md      # Human documentation (Spanish)
docs/en/          # English docs (getting-started, environment-variables, configuration, deployment, user-guide, admin-guide, contributing, api)
docs/es/          # Spanish docs (same files as docs/en)
```
