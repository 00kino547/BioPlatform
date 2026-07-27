# PROJECT_MAP.md

> Update when files move or new modules are created.

## Backend

```
apps/backend/src/
├── index.ts              # Entry point
├── app.ts                # Express setup, middleware, routes
├── config/env.ts         # Zod-validated env vars
├── lib/prisma.ts         # Prisma client singleton
├── middleware/auth.ts     # JWT verification middleware (requireAuth, requireAdmin)
└── routes/
    ├── auth.ts           # Register, login, me, change-password
    ├── invite.ts         # Invite code CRUD (create, list, revoke)
    ├── profile.ts        # Profile CRUD, avatar/banner upload+delete, public profile
    └── admin.ts          # Admin: list users, update user, reset password, edit profiles
apps/backend/prisma/
├── schema.prisma         # User, Profile, InviteCode models
└── seed.ts               # Bootstrap admin + invite codes
```

## Frontend

```
apps/frontend/src/
├── main.tsx              # Entry point
├── App.tsx               # Root component + React Router (/, /login, /register, /dashboard, /admin, /privacy, /terms, /:username)
├── index.css             # TailwindCSS + animations + scroll-reveal
├── config/branding.ts    # Branding env vars (VITE_*)
├── contexts/
│   └── AuthContext.tsx    # Auth state (login, register, logout)
├── lib/
│   ├── api.ts            # API client with auth headers (register, login, profile, upload, remove)
│   └── utils.ts          # cn() utility
├── components/
│   ├── ui/
│   │   ├── button.tsx        # Button (5 variants)
│   │   ├── card.tsx          # Card (6 subcomponents)
│   │   ├── badge.tsx         # Badge (5 variants)
│   │   ├── scroll-reveal.tsx # IntersectionObserver wrapper
│   │   └── PlatformIcon.tsx  # SVG icons for social platforms (11 platforms)
│   ├── auth/
│   │   └── ProtectedRoute.tsx # Redirect to /login if unauthenticated
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
│   ├── Login.tsx         # Login form
│   ├── Register.tsx      # Register form (invite code required)
│   ├── Dashboard.tsx     # Profile editor (Profile, Links, Appearance tabs)
│   ├── AdminDashboard.tsx # Admin panel (Invite Codes, Users tabs, profile editing modal)
│   ├── PublicProfile.tsx # Themed public profile page (/:username)
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
