# BioPlatform
### Not production-ready yet. Expect bugs.

> Your digital identity, beautifully crafted.

A modern link-in-bio platform for creators, developers, and anyone who wants a polished digital presence.

## Features

- Custom profiles with avatars, banners, and bios
- Social links with platform icons (Twitter/X, GitHub, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email, etc...)
- Discord username and invite link support
- Live Discord presence (status, activity, current song) with an opt-in profile widget and rich link previews (OpenGraph meta + server-rendered card)
- 8 built-in theme presets (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal)
- Theme customization with accent colors
- Invite-only access
- Self-hostable with Docker
- Admin panel (user management, invite codes, profile editing...)
- Secure file uploads (local storage, S3-compatible)
- Input sanitization and platform validation
- Privacy Policy and Terms of Service pages
- Modern, responsive design

## Screenshots

> Screenshots coming soon.

## 📊 Project Stats

[![Stars](https://img.shields.io/github/stars/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/stargazers)
[![Forks](https://img.shields.io/github/forks/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/network/members)
[![Issues](https://img.shields.io/github/issues/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/pulls)
[![Latest Release](https://img.shields.io/github/v/release/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/releases)
[![License](https://img.shields.io/github/license/00kino547/BioPlatform?style=flat-square)](LICENSE)

## Requirements

- Node.js 22+
- PostgreSQL 16+
- Docker & Docker Compose (for containerized deployment)
- pnpm 11 (via corepack)

## Installation

```bash
git clone https://github.com/00kino547/BioPlatform.git
cd BioPlatform
cp .env.example .env
```

## Quick Start

```bash
# Enable corepack and install dependencies
corepack enable
pnpm install

# Generate Prisma client
pnpm db:generate

# Seed admin user and invite codes
pnpm db:seed

# Start development servers
pnpm dev
```

Open http://localhost:5173 (frontend) and http://localhost:3000/api/health (backend).

# Docker Deployment (recommended)

```bash
# Full stack with Nginx
docker compose --profile nginx up -d --build

# Without Nginx (direct access)
docker compose up -d --build
```

The app will be available at http://localhost:80.

## Docker Compose Services

- `postgres` — PostgreSQL 16 database
- `backend` — Express API server (port 3000)
- `frontend` — React SPA served by Nginx (port 80)
- `nginx` — Reverse proxy (optional, requires `--profile nginx`)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Application name | `BioPlatform` |
| `APP_TAGLINE` | Short tagline | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Full description | `Create a stunning profile page...` |
| `APP_URL` | Public URL | `http://localhost:80` |
| `APP_GITHUB_URL` | GitHub repository URL | `https://github.com/00kino547/BioPlatform` |
| `VITE_API_URL` | Backend API URL (relative for Nginx proxy) | `/api` |
| `VITE_CONTACT_URL` | Contact/support URL | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | Status page URL | _(empty)_ |
| `VITE_DOCS_URL` | Documentation URL | `https://github.com/00kino547/BioPlatform/tree/main/docs` |
| `PORT` | Backend port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | JWT signing secret | — |
| `JWT_EXPIRES_IN` | Token expiration | `7d` |
| `CORS_ORIGIN` | Allowed origins (comma-separated) | `http://localhost:5173` |
| `STORAGE_PROVIDER` | Storage backend (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Local upload directory | `./uploads` |

See `/docs/en/environment-variables.md` for the full list.

## Branding

All branding is configurable via environment variables. Change `APP_NAME`, `APP_TAGLINE`, and `APP_DESCRIPTION` in `.env` to rebrand the entire application. Variables are used in:

- Navbar, Hero, Footer
- SEO meta tags, OpenGraph, Twitter cards
- Structured data (JSON-LD)
- Browser title
- FAQ content
- Public profile footer
- Privacy Policy and Terms of Service pages

## Supported Platforms

Social links support the following platforms with custom SVG icons:

| Platform | Input Format | Display |
|----------|-------------|---------|
| Twitter / X | URL | Clickable link |
| GitHub | URL | Clickable link |
| YouTube | URL | Clickable link |
| Twitch | URL | Clickable link |
| Discord | Username or invite link | Username: display only. Invite: clickable |
| TikTok | URL | Clickable link |
| Instagram | URL | Clickable link |
| Facebook | URL | Clickable link |
| LinkedIn | URL | Clickable link |
| Spotify | URL | Clickable link |
| Email | Email address | Opens mail client |

## Updating

```bash
git pull
pnpm install
pnpm db:generate
docker compose --profile nginx up -d --build
```

## Backup Recommendations

- Database: `pg_dump` or volume backup
- Uploads: regular file backup of `./uploads` or S3, etc...
- Environment: keep `.env` in a secure location (not in version control)

## Production Recommendations

- Use a strong `JWT_SECRET` (32+ random characters)
- Enable HTTPS via reverse proxy or Cloudflare
- Use S3-compatible storage for file uploads
- Set `NODE_ENV=production`
- Use a dedicated PostgreSQL instance

## Security

- All user input sanitized before storage (HTML-like characters stripped)
- Platform names validated against an allowlist
- URLs validated for correct protocol (no `javascript:` etc.)
- File uploads limited to image files (JPEG, PNG, GIF, WebP)
- bcrypt password hashing at 12 rounds
- JWT authentication with configurable expiration
- No `dangerouslySetInnerHTML` in frontend (React escapes all content by default)

## Folder Overview

```
BioPlatform/
├── apps/
│   ├── frontend/          # React SPA
│   └── backend/           # Express API
├── packages/
│   └── shared/            # Shared types + storage
├── docs/                  # Documentation (English + Spanish)
├── nginx/                 # Nginx config
├── docker-compose.yml
├── .env.example
├── AGENTS.md              # AI agent instructions
├── PROJECT_MAP.md         # File locations
├── DECISIONS.md           # Architecture decisions
├── TASKS.md               # Task tracking
├── PROMPTS.md             # Reusable AI prompts
└── CHANGELOG.md           # Version history
```

## Documentation

- [English](docs/en/)
- [Español](docs/es/)

## 🤝 Contributing

Contributions are welcome.

Before opening a pull request, please read [CONTRIBUTING.md](/docs/en/contributing.md).

## FAQ

**Q: Can I self-host BioPlatform?**
A: Yes. It's fully open source and Docker-compatible.

**Q: Is it free?**
A: The core platform is free. Premium features are available via subscription.

**Q: How do I get an invite?**
A: BioPlatform is invite-only. Contact existing members or reach out via [GitHub Issues](https://github.com/00kino547/BioPlatform/issues).

**Q: Can I use Discord usernames instead of links?**
A: Yes. Enter your new Discord username (no discriminator) or a discord.gg invite link.

**Q: How do themes work?**
A: Choose a preset theme in Dashboard > Appearance. Your public profile will use the selected colors.

## 🧑‍💻 Core Team

- **@00kino547** · Founder & Lead Developer
- **@gtaqwsgt** · Contributor, Bug Hunter & Beta Tester

## 🧪 Beta Testers & Security Researchers

Special thanks to everyone who helped find bugs, test features and break things before users had the opportunity to do it.

## ❤️ Special Thanks

Special thanks to everyone who contributed ideas, reported bugs, tested experimental features, or helped shape BioPlatform.

This project would be significantly more broken without you.

## 👥 Contributors

Thanks to everyone who contributed code, ideas, testing, documentation, bug reports, or general suffering to BioPlatform.

<a href="https://github.com/00kino547/BioPlatform/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=00kino547/BioPlatform" />
</a>
