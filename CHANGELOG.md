# Changelog

All notable changes to BioPlatform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0-beta.1] - 2026-07-27

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

[1.0.0-beta.1]: https://github.com/00kino547/BioPlatform/releases/tag/v1.0.0-beta.1
