# Deployment

## Docker (Recommended)

### Full Stack with Nginx

```bash
docker compose --profile nginx up -d --build
```

App available at `http://localhost:80`.

### Without Nginx

```bash
docker compose up -d --build
```

Frontend at `http://localhost:5173`, backend at `http://localhost:3000`.

### Services

| Service | Description | Port |
|---------|-------------|------|
| `postgres` | PostgreSQL 16 database | 5432 |
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

The backend container applies the Prisma schema and runs the idempotent seed automatically
before starting the API. The seed creates the bootstrap admin and initial invite codes only
when that admin email does not already exist; it never overwrites an existing admin password.

## Manual Deployment

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- pnpm 11 (via corepack)

### Steps

```bash
git clone https://github.com/00kino547/BioPlatform.git
cd BioPlatform
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm db:seed
pnpm --filter frontend build
pnpm --filter backend start
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
(`127.0.0.1`) in `docker-compose.yml` (like postgres and the backend), so only
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

```bash
git pull
pnpm install
pnpm db:generate
docker compose --profile nginx up -d --build
```

## Backup

- **Database:** `pg_dump` or Docker volume backup
- **Uploads:** Regular file backup of `./uploads`
- **Environment:** Keep `.env` in a secure location

---

← [Admin Guide](./admin-guide.md) · [Contributing](./contributing.md) →
