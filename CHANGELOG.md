# Changelog

All notable changes to BioPlatform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
- `bio_sid` HttpOnly cookie (server-issued, stored hashed), `TRUST_PROXY`, `AUTH_LOCK_*`, and `AUTH_LOG_*` environment variables

### Security
- Auth requests blocked at the API layer (429 + `Retry-After` for temporary lockouts, 403 for permanent bans) instead of host firewall rules
- WebAuthn registrations and assertions verify origin, relying party ID, and challenge server-side
- TOTP codes verified server-side with a ±30 second window
- Passkey public keys stored base64url-encoded; counters updated after every authentication
- Successful auth resets failure counters and records the last-login IP; registration records the registered IP

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

[1.0.1-dev-beta.2]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.1...v1.0.1-dev-beta.2
[1.0.1-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.0-dev-beta.1...v1.0.1-dev-beta.1
[1.0.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/releases/tag/v1.0.0-dev-beta.1
