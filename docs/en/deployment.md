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
