# Changelog

All notable changes to BioPlatform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

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

[Unreleased]: https://github.com/00kino547/BioPlatform/compare/v1.0.1-dev-beta.1...HEAD
[1.0.1-dev-beta.1]: https://github.com/00kino547/BioPlatform/compare/v1.0.0-dev-beta.1...v1.0.1-dev-beta.1
[1.0.0-dev-beta.1]: https://github.com/00kino547/BioPlatform/releases/tag/v1.0.0-dev-beta.1
