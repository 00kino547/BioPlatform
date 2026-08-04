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
