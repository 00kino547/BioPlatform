# Getting Started

## Prerequisites

- Node.js 22+
- PostgreSQL 16+
- pnpm 11 (via corepack)

## Quick Start

```bash
git clone https://github.com/00kino547/BioPlatform.git
cd bio
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm dev
```

## Docker

```bash
docker compose --profile nginx up -d
```

App available at http://localhost:80.

## Environment Variables

See [Environment Variables](./environment-variables.md) for the full reference.

## Next Steps

- [Environment Variables](./environment-variables.md) — full reference
- [User Guide](./user-guide.md) — profiles, passkeys/2FA, analytics, locked-out help
- [Admin Guide](./admin-guide.md) — invite codes, user management, unlocking accounts
