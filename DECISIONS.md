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

## Auth anti-brute-force: fingerprint + account escalation

- Three fingerprints per request: client IP (`req.ip` with `TRUST_PROXY`), a server-signed HttpOnly cookie (`bio_sid`, random UUID, sha256-hashed in the DB), and the User-Agent header
- **2-of-3 rule:** a request is blocked only when ≥2 of its 3 fingerprints are locked or permanently banned — a single banned fingerprint is allowed through (protects CG-NAT users and shared browsers)
- **Escalation tiers (per fingerprint and per account):** 3 failed attempts are free; failures 4–5 add +10 min each; failures 6–10 add +1h each on top; the 11th failure is a permanent blacklist
- Failures are counted only on *responses*: a locked request is rejected before the route runs, so counters climb only as lockouts expire (an attacker must persist for hours to reach a permanent ban)
- A successful auth (token issued, or password verified into the 2FA step) resets the fingerprint and account counters; success also records `User.lastLoginIp`
- `User.registeredIp` is captured at registration
- **Trusted-IP cap:** when the failing IP equals the account's `registeredIp` or `lastLoginIp`, the account lockout is capped at 1h and can never become permanent — protection is never disabled, but a user who simply keeps mistyping their password can't permanently lock their own account (or let an attacker DoS the account via its own IP)
- **App-level enforcement:** bans live in the `AuthBan` table and are enforced in the API layer (403 for permanent, 429 + `Retry-After` for temporary) — no host firewall/iptables, since the backend is a Docker container; only admins can unban via the admin panel
- The rate limiter fails **open** on DB errors so an outage can never lock everyone out
- Block messages are generic and identical regardless of the reason, avoiding account-enumeration feedback
