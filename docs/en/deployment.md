# Deployment

## Docker (Recommended)

### Full Stack with Nginx

The quickest way to run the stack uses the published prebuilt images — no local build step:

```bash
docker compose -f docker-compose.prebuilt.yml --profile nginx up -d
```

App available at `http://localhost:80` — frontend, API (`/api`), and uploads all served on a single port through the internal Nginx reverse proxy. This is the recommended setup for production and simple deployments.

### Building from Local Source (Optional)

If you fork the repo or modify the backend/frontend source, build the images from your local checkout instead:

```bash
docker compose --profile nginx up -d --build
```

The same services and ports are used; only the image source differs. See [Building](./building.md) for registry options and version pinning.

### Without Nginx

```bash
docker compose -f docker-compose.prebuilt.yml up -d
```

Backend at `http://localhost:3000`. The frontend has no exposed port without Nginx — use the Nginx profile for browser access.

(To use locally-built images without Nginx, run `docker compose up -d --build`.)

### Services

| Service | Description | Port |
|---------|-------------|------|
| `postgres` | PostgreSQL 16 database | 5432 |
| `redis` | Valkey cache (Redis-compatible, used by `CACHE_DRIVER=redis`) | 6379 |
| `backend` | Express API server | 3000 |
| `frontend` | React SPA (Nginx) | 80 |
| `nginx` | Reverse proxy (optional) | 80 |

### Environment

1. Copy `.env.example` to `.env`
2. Set a unique `POSTGRES_PASSWORD` and use the same value in `DATABASE_URL` when running outside Docker Compose
3. Set a strong `JWT_SECRET`
4. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` for the bootstrap administrator
5. Configure `APP_URL`, `APP_URL_HOST`, the `VITE_APP_*` URLs, and the WebAuthn values to your domain
6. Run with `--profile nginx` for production

By default the backend uses `CACHE_DRIVER=redis` against the bundled Valkey service (a Redis-compatible
cache on port `6379`, bound to localhost). If you run the backend outside Docker Compose, point
`CACHE_REDIS_URL` at any wire-compatible server (Redis, Valkey, KeyDB, Dragonfly) or switch to the
`memory`/`file`/`db` drivers — see [Environment Variables](./environment-variables.md#caching).

On first run, set `SEED_ON_START=true` in `.env` to create the bootstrap admin and initial invite codes.
The seed is idempotent — it only creates the admin when that email does not already exist and never
overwrites an existing admin password. Remove `SEED_ON_START=true` after the first successful start.

> **Note:** `.env` is excluded from the build context (`.dockerignore`), so it never exists inside the
> container. `db:seed` therefore loads it with `node --env-file-if-exists=…`, which is a no-op in
> Docker and a real load in a source checkout — the seed takes its configuration from the container
> environment that compose sets. Older images used `--env-file=` (without `-if-exists`), which exits
> non-zero on a missing file and produced `ELIFECYCLE … exit code 9` with a "seed failed" warning;
> rebuild the image if you see that.

## Manual Deployment

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- pnpm 12 (via corepack, pinned to 12.4.0)

### Steps

```bash
git clone https://github.com/00kino547/BioPlatform.git
cd BioPlatform
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm --filter @bioplatform/backend db:seed
pnpm --filter @bioplatform/frontend build
pnpm --filter @bioplatform/backend start
```

## TLS / HTTPS

The bundled Nginx listens on both HTTP (80) and HTTPS (443). Certificate handling is
controlled by `TLS_MODE`:

- **`development` (default)** — if no valid certificate exists, Nginx auto-generates a
  self-signed certificate (valid 10 years, SAN for `localhost` / `127.0.0.1`) on container
  startup. It is stored as `self-signed.pem` / `self-signed.key` in `./certs/` and symlinked
  as `cert.pem` / `key.pem`. Browsers will warn.
- **`production`** — Nginx deletes any `self-signed.*` files and the dev symlinks on startup,
  then requires a valid certificate/key pair, refusing to start without it. Drop your
  certificate and private key into `./certs/`:

  ```
  certs/
    cert.pem      # your certificate (or fullchain)
    key.pem       # your private key
  ```

  Both files are gitignored (`certs/*.pem`). Generate with Let's Encrypt (Certbot), a
  CA of your choice, or Cloudflare Origin Certificates.

### HSTS

HSTS (`Strict-Transport-Security`, 1 year) is sent automatically on port 443 in
**production** mode. It is **not** sent in development mode (browsers ignore it for
self-signed certs anyway); set `SEND_HSTS_ON_DEV=true` to force it on dev too. If you
terminate TLS elsewhere (Cloudflare, Load Balancer), leave `TLS_MODE=development` or remove
the 443 mapping.

## Reverse Proxy

### Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads/ {
        alias /path/to/BioPlatform/uploads/;
    }

    location / {
        root /path/to/BioPlatform/apps/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

### Reverse Proxy (Cloudflare Tunnel)

```bash
cloudflared tunnel --url http://localhost:80
```

When the tunnel terminates at this repo's nginx (the included `docker-compose.yml`),
set `CF_TRUSTED_IPS` in `.env` to the source IPs/CIDRs that the reverse proxy connects
from (default `172.16.0.0/12,127.0.0.1,::1` — the docker bridge range plus loopback).
Nginx restores the real client IP from the standard `X-Forwarded-For` chain only for
those sources (any reverse proxy that appends the client IP — Cloudflare Tunnel,
Nginx, Caddy, Traefik, HAProxy, ...), so backend logs, analytics, and auth rate
limiting see public IPs instead of the tunnel/local address. Nginx overwrites
`X-Forwarded-For`/`X-Real-IP` with the computed client IP, so a forged client-supplied
chain never reaches the backend.

The nginx published ports (`NGINX_PORT`/`NGINX_HTTPS_PORT`) are bound to loopback
(`127.0.0.1`) in both compose files (like postgres and the backend), so only
host-local processes can reach nginx — no remote client can connect directly to forge
the proxy headers; every request must arrive via the trusted reverse proxy. Local
traffic that comes through docker-proxy (which masquerades its source as the docker
bridge gateway) is surfaced as `127.0.0.1` instead of the gateway address. Keep
`TRUST_PROXY=1`; do **not** raise it, or spoofed `X-Forwarded-For` values become
trusted. Binding the ports to `0.0.0.0` (direct public exposure) voids the
anti-spoofing guarantee.

## Custom Domains

Users can self-serve a custom domain (PRO/Enterprise tier + `profiles.customDomain`
permission): they request a hostname, add a TXT record (`_bioplatform.<domain>`) that the
backend verifies live, and an admin activates it from the admin panel. To actually serve a
custom domain you must also:

1. **Route it** — quick tunnels (`cloudflared tunnel --url …`) only carry traffic for the
   tunnel's own hostname. Use a **named tunnel** with an ingress rule per custom domain so
   requests arrive at nginx with the correct `Host` header (and point the domain's
   `A`/`AAAA`/`CNAME` records at the tunnel).
2. **Install a certificate** — two options:

   **Automatic (ACME).** Set `ACME_ENABLED=true` (plus `ACME_EMAIL`) and point each custom
   domain's `A`/`AAAA` record at this server with port 80 reachable from the internet. The
   backend then issues and auto-renews Let's Encrypt certificates (HTTP-01 challenge) for
   every ACTIVE domain, writes them to `./certs/<domain>/`, regenerates the nginx config and
   reloads nginx automatically. Custom-domain HTTP server blocks always expose
   `/.well-known/acme-challenge/` (proxied to the backend) and redirect everything else to
   HTTPS. An admin can also trigger issuance immediately per domain (Admin → Custom Domains →
   "Issue cert"). Use
   `ACME_DIRECTORY_URL=https://acme-staging-v02.api.letsencrypt.org/directory` for testing.
   Behind a named tunnel, add an ingress rule routing `/.well-known/acme-challenge/*` to the
   backend.

   **Manual.** Drop the certificate and key into a per-domain directory:

   ```
   certs/
     example.com/
       cert.pem      # your certificate (or fullchain)
       key.pem       # your private key
   ```

   The backend picks up manual certs on its next ACME check (default every 60 minutes) and
   regenerates the nginx config; nginx reloads automatically. Until the cert exists, the
   domain falls through to the main servers.

   Each block listens for both `example.com` and `www.example.com`, reuses the production
   SSL parameters, sends HSTS, and proxies the API/upload/SPA the same way as the main site.
   Set `APP_URL_HOST` (bare hostname, e.g. `preview.example.com`) so nginx knows which host
   is the app's own domain: social crawlers hitting the **root** of a **custom** domain are
   then served server-rendered OG from the backend, while the app host keeps its static SPA
   OG.

The custom-domain root behavior (landing page vs. a specific public profile) is configured
by the user in their **Dashboard → Domain** tab; social crawlers and the SPA both honor it.
Passkeys work on the main `WEBAUTHN_ORIGIN` domain as well as on active custom domains: for
custom domains the relying-party ID and expected origin are derived from the request's `Host`
header (the custom domain's hostname), so passkeys are scoped per domain — a passkey registered
on the main domain works there, and one registered on a custom domain works on that custom domain.

## Production Checklist

- [ ] Strong `JWT_SECRET` (32+ random characters)
- [ ] `TLS_MODE=production` with real certs in `./certs/` (no self-signed certs)
- [ ] Custom domains: `ACME_ENABLED=true` + `ACME_EMAIL`, or manual per-domain certs
- [ ] `NODE_ENV=production`
- [ ] HTTPS enabled (reverse proxy or Cloudflare)
- [ ] `APP_URL` set to your domain
- [ ] `CORS_ORIGIN` set to your domain
- [ ] PostgreSQL on a dedicated instance
- [ ] Regular database backups (`pg_dump`)
- [ ] Regular uploads backup (`./uploads`)
- [ ] `.env` file secured (not in version control)

## Updating

### One-command update (recommended)

`update.sh` in the repository root does the whole sequence and enforces the one
ordering rule that protects your data: **the backup is taken and verified before
anything is pulled, migrated or recreated.**

```bash
# from a checkout
sh update.sh --deployment-dir /srv/bioplatform

# or straight from the network, no checkout needed
curl -fsSL https://raw.githubusercontent.com/00kino547/BioPlatform/main/update.sh | bash -s -- -y
```

What it does, in order:

1. Checks Docker/Compose, resolves the deployment directory, `.env`, compose
   file and project name, and prints the images currently running.
2. Reports the schema state Prisma has recorded (`_prisma_migrations`), so you
   see what is pending *before* anything changes.
3. Takes a custom-format `pg_dump` into `backups/`, checks it is a readable
   archive (≥ 128 bytes and a parseable `pg_restore --list` table of contents),
   and prints the path and size. **A failed backup aborts the update** unless you
   explicitly pass `--no-backup --force`, which prints the risk loudly.
4. Pulls the new images and applies migrations in a one-shot container with the
   entrypoint's auto-migrate switched off (`MIGRATE_ON_START=false`), so there is
   exactly one migrate step and its ordering is visible in the script.
5. Recreates the stack and waits for `/api/health` (and `/api/version` when
   `ADMIN_TOKEN` is set), rolling back to the previous image digests if the
   backend does not come up.

Useful flags: `--dry-run` (prints every command, changes nothing),
`--verify-restore` (also restores the dump into a scratch database and compares
table counts), `--skip-pull`, `--skip-migration`, `--no-rollback`,
`--backup-dir DIR`, `--image-tag TAG`, `-y`.

On any failure the script prints the dump path and the exact restore command, so
you never have to reconstruct the recovery path from memory.

When the script is piped in (`curl … | bash`) it downloads its two helper
libraries (`scripts/lib/bioplatform-common.sh`, `scripts/lib/bioplatform-backup.sh`)
from the same versioned raw URL as the script itself — from a tag, not from a
branch, so a pinned updater never runs helpers from a different revision.

### Manual update

Pull the latest prebuilt images and recreate the stack:

```bash
git pull
docker compose -f docker-compose.prebuilt.yml --profile nginx pull
docker compose -f docker-compose.prebuilt.yml --profile nginx up -d
```

Or, when using locally-built images, rebuild instead:

```bash
git pull
pnpm install
pnpm db:generate
docker compose --profile nginx up -d --build
```

### Schema migrations

The backend **applies pending migrations on start** (`MIGRATE_ON_START`, default
`true`): the entrypoint runs `prisma migrate deploy` before the server, waits for
the database to become reachable (`DB_WAIT_ATTEMPTS` × `DB_WAIT_INTERVAL`), and
refuses to start the server if the migration fails — so a fresh volume reaches a
healthy state with no manual Prisma command anywhere in the documented flow.

Two guards make that safe:

- **An image that ships no `prisma/migrations/` directory is rejected** with a
  `FATAL` message instead of letting `migrate deploy` "succeed" while applying
  nothing (which would leave a fresh database empty and the server pretending to
  be fine). Set `MIGRATE_ON_START=false` only if you manage the schema yourself.
- Schema history is managed with **Prisma Migrate** (baseline migration
  `prisma/migrations/0_init` represents the full current schema). `migrate deploy`
  applies only *pending* migrations and is a no-op when the database is already
  current, so restarting an up-to-date instance does nothing.

For an explicit, script-visible step (what `update.sh` uses), run:

```bash
pnpm --filter @bioplatform/backend db:generate
pnpm --filter @bioplatform/backend db:migrate:prod
```

#### First-time adoption of Prisma Migrate on an existing database

Databases created before the baseline migration exist (they were provisioned via `prisma db push` / the legacy `docs/migrations/*.sql` files) and have **no `_prisma_migrations` history**. Do not re-run `migrate deploy` blindly on them. The safe adoption sequence:

1. **Detect drift** against the current schema (non-mutating):

   ```bash
   pnpm --filter @bioplatform/backend exec prisma migrate diff \
     --from-url "$DATABASE_URL" \
     --to-schema-datamodel prisma/schema.prisma
   ```

2. **Converge the schema if the diff is non-empty.** The legacy history lives in `docs/migrations/` (dated, apply in date order) and any remaining drift must be reconciled with an **additive** migration — do not `prisma db push --accept-data-loss` unless you have verified it only adds tables/columns. Confirm the diff is now empty before proceeding.

3. **Record every migration the database already satisfies** (this marks them as applied without running them — nothing is executed against your data):

   ```bash
   pnpm --filter @bioplatform/backend db:baseline
   # then, for each later migration whose objects you applied by hand:
   pnpm --filter @bioplatform/backend exec prisma migrate resolve \
     --applied 20261001120000_invite_credit_ledger
   ```

   Skip this step for any migration whose tables/columns are **not** already present, or `migrate deploy` will try to create them again on the next release.

4. From then on, every release applies through `pnpm --filter @bioplatform/backend db:migrate:prod` (prisma migrations only).

New schema changes are added as normal Prisma migrations (`prisma migrate dev --create-only` then review, or regenerated with `prisma migrate diff --from-migrations --to-schema-datamodel`). The legacy `docs/migrations/*.sql` files remain archived for historical reference.

#### Keep the baseline honest

`prisma/migrations/0_init` is a **squashed baseline**, not a historical record: nothing has ever run it, it just has to make a fresh install complete. Two rules keep it that way:

- Every schema change after it needs its own migration directory in `prisma/migrations/` — including any change you also apply to a live database with hand-written SQL.
- Before releasing, replay the migrations and prove they equal `schema.prisma`:

  ```bash
  export SHADOW_DATABASE_URL="postgresql://user:pw@host:5432/some_empty_scratch_db"
  pnpm --filter @bioplatform/backend db:verify-drift   # exit 0 = migrations match the schema
  ```

  `SHADOW_DATABASE_URL` must point at an **empty** database: Prisma replays every migration into it to work out the final schema. CI runs this step on every push, so a schema change that never got a migration fails the build instead of silently missing from fresh installs.

### Check for new environment variables

New releases may add settings to `.env.example`. Compare your `.env` against it and copy any new variables — and confirm the variable is also forwarded in `docker-compose.yml` before recreating the stack. Example for this release: `NEWSLETTER_SELF_RECIPIENT_CAP` (cap on how many recipients a user's own SMTP deliverer may send to per newsletter).

## Running two instances on one host

Both compose files are parameterised so a second deployment does not collide
with the first. Each instance needs its own `.env` (deployment directory) with
its own ports, project name, network and host paths:

```bash
# instance A — defaults are unchanged: 5432 / 6379 / 3000 / 80 / 443
# instance B — a second, fully independent stack
COMPOSE_PROJECT_NAME=bioplatform-b
POSTGRES_HOST_PORT=15432
REDIS_HOST_PORT=16379
BACKEND_HOST_PORT=13001
NGINX_PORT=18081
NGINX_HTTPS_PORT=18444
NETWORK_NAME=bioplatform_b_net
CERTS_DIR=./certs-b
NGINX_CONFIG_DIR=./nginx-b
SEED_ON_START=false
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_HOST_PORT` | `5432` | Host port for PostgreSQL |
| `REDIS_HOST_PORT` | `6379` | Host port for Redis/Valkey |
| `BACKEND_HOST_PORT` | `3000` | Host port for the backend API |
| `NGINX_PORT` / `NGINX_HTTPS_PORT` | `80` / `443` | Host ports for nginx |
| `NETWORK_NAME` | `bioplatform_net` | Docker network — **must differ**, or the two stacks share the `postgres`/`redis` DNS names and resolve to each other |
| `CERTS_DIR` | `./certs` | TLS material (must differ) |
| `NGINX_CONFIG_DIR` | `./nginx` | nginx config to mount (must differ) |

Rules that make this actually work:

- **Run each instance from its own directory** (or set `COMPOSE_PROJECT_NAME`),
  so containers, volumes and compose state never mix. Volumes are already
  project-scoped (`<project>_postgres_data`, …).
- **Every published port must differ** — the values above are examples, any free
  set works. Inside the network the container ports stay `5432`/`6379`/`3000`,
  so `DATABASE_URL` and `CACHE_REDIS_URL` are untouched.
- **`NETWORK_NAME` must differ**, otherwise the second stack joins the first
  network and its `postgres` host resolves to the *other* instance's database.
- Give each instance its own `.env` with its own `JWT_SECRET`, `POSTGRES_PASSWORD`
  and `ADMIN_PASSWORD`. Never share them.

Verified: two instances plus an existing stack ran simultaneously, each with its
own volumes, network and ports, all healthy at the same time.

## Backup

- **Database:** `pg_dump` or Docker volume backup — `update.sh` does this for you
  before every update and prints the restore command for the dump it wrote
  (`backups/bioplatform-YYYYMMDD-HHMMSS.dump`)
- **Uploads:** Regular file backup of `./uploads`
- **Environment:** Keep `.env` in a secure location

---

← [Admin Guide](./admin-guide.md) · [Contributing](./contributing.md) →
