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
2. Set `DATABASE_URL` for PostgreSQL
3. Set a strong `JWT_SECRET`
4. Configure `APP_URL` to your domain
5. Run with `--profile nginx` for production

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

### Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:80
```

## Production Checklist

- [ ] Strong `JWT_SECRET` (32+ random characters)
- [ ] `TLS_MODE=production` with real certs in `./certs/` (no self-signed certs)
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
