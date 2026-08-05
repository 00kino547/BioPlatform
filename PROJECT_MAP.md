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
│   ├── validation.ts     # Shared sanitization (stripHtml) + URL/platform/discord validators, profile update schema
│   ├── webauthn.ts       # Passkey helpers (register/login options, challenge store, verify register/login/2FA)
│   └── authGuard.ts      # Auth rate limiting: fingerprint (IP/cookie/UA), lock policy (block/trusted_ip/email), lock duration, auth log helpers
├── middleware/auth.ts     # JWT verification middleware (requireAuth, requireAdmin)
├── middleware/rateLimit.ts # Auth anti-brute-force middleware (cookie issuance, 2-of-3 fingerprint block, policy-aware account lock, outcome + log recording)
└── routes/
    ├── auth.ts           # Register, login/start, login (password + 2FA), passkey login/2FA, passkey CRUD, TOTP setup/enable/disable, me, change-password, unlock, unlock/verify
    ├── invite.ts         # Invite code CRUD (create, list, revoke)
│   ├── profile.ts        # Profile CRUD, avatar/banner upload+delete, public profile, click tracking
    ├── admin.ts          # Admin: list users, update user, reset password, edit profiles, list/unban auth bans, account unlock, auth log
    ├── analytics.ts      # Analytics stats (views, clicks, referrers, platform breakdown)
    ├── email.ts          # Email notification settings (SMTP config, test endpoint)
    └── music.ts          # Music tracks CRUD (create, upload, patch, reorder, delete)
apps/backend/prisma/
├── schema.prisma         # User (tier, trackLimit, totpSecret, totpEnabled, registeredIp, lastLoginIp), Profile, InviteCode, PageView, LinkClick, MusicTrack, Passkey, WebAuthnChallenge, AuthBan, AuthLog models
└── seed.ts               # Bootstrap admin + invite codes
```

## Frontend

```
apps/frontend/src/
├── main.tsx              # Entry point
├── App.tsx               # Root component + React Router (/, /login, /register, /unlock, /dashboard, /admin, /privacy, /terms, /:username)
├── index.css             # TailwindCSS + animations + scroll-reveal
├── config/branding.ts    # Branding env vars (VITE_*)
├── contexts/
│   └── AuthContext.tsx    # Auth state (login, register, logout)
├── lib/
│   ├── api.ts            # API client (auth incl. passkeys/TOTP/2FA, profile, upload, analytics, email, music)
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
│   ├── music/
│   │   └── MusicPlayer.tsx   # Playlist picker + embedded player (local/Spotify/YouTube, full version + Open in Spotify)
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
│   ├── Dashboard.tsx     # Profile editor (Profile, Links, Appearance, Analytics, Email, Music, Security tabs)
│   ├── AdminDashboard.tsx # Admin panel (Invite Codes, Users, Bans, Logs tabs, profile editing modal, tier control, Unlock account actions)
│   ├── PublicProfile.tsx # Themed public profile page (/:username, includes MusicPlayer)
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
pnpm-workspace.yaml   # Workspace + pnpm config (allowBuilds, node-linker)
.env / .env.example   # Environment variables
nginx/nginx.conf      # Reverse proxy config (/api, /uploads, SPA fallback)
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
docs/en/          # English docs (getting-started, environment-variables)
docs/es/          # Spanish docs
```
