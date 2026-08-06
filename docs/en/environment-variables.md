# Environment Variables

## Application

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Application name | `BioPlatform` |
| `APP_TAGLINE` | Short tagline | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Full description | `Create a stunning profile page...` |
| `APP_URL` | Public URL | `http://localhost:80` |
| `APP_GITHUB_URL` | GitHub repository URL | `https://github.com/00kino547/BioPlatform` |

## Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL (use `/api` for Nginx proxy) | `/api` |
| `VITE_APP_NAME` | Frontend app name | `BioPlatform` |
| `VITE_APP_TAGLINE` | Frontend tagline | `Your digital identity, beautifully crafted.` |
| `VITE_APP_DESCRIPTION` | Frontend description | `Create a stunning profile page...` |
| `VITE_APP_URL` | Frontend public URL | `http://localhost:80` |
| `VITE_APP_GITHUB_URL` | Frontend GitHub URL | `https://github.com/00kino547/BioPlatform` |
| `VITE_CONTACT_URL` | Contact/support URL | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | Status page URL | _(empty)_ |
| `VITE_DOCS_URL` | Documentation URL | `https://github.com/00kino547/BioPlatform/tree/main/docs` |

> Frontend variables must be prefixed with `VITE_` to be accessible in React code via `import.meta.env.VITE_*`.

## Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `3000` |
| `API_PREFIX` | API route prefix | `/api` |
| `NODE_ENV` | Environment mode | `development` |

## Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | — (required) |
| `POSTGRES_USER` | PostgreSQL username | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `postgres` |
| `POSTGRES_DB` | PostgreSQL database name | `bioplatform` |

## Security

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret (min 32 chars) | — (required) |
| `JWT_EXPIRES_IN` | JWT token expiration | `7d` |
| `TRUST_PROXY` | Number of trusted proxy hops (used to resolve the real client IP for auth rate limiting) | `1` |
| `AUTH_LOCK_POLICY` | Account lock policy: `block` (reject all), `trusted_ip` (registered + last-login IPs may sign in without unlocking), `email` (unlock requires an email link) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Lock duration in minutes after the free attempts run out; `-1` = permanent lock | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | TTL in minutes for the email unlock link (`email` policy) | `30` |
| `AUTH_LOG_RETENTION_DAYS` | Auth log retention in days before the cleanup job deletes entries | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | How often the auth log cleanup job runs (in minutes) | `60` |

## CORS

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Allowed origins (comma-separated) | `http://localhost:5173` |

## Nginx

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_INTERNAL_NGINX` | Enable Nginx container | `true` |
| `NGINX_PORT` | Nginx HTTP port | `80` |
| `NGINX_HTTPS_PORT` | Nginx HTTPS port | `443` |
| `TLS_MODE` | TLS certificate mode: `development` auto-generates self-signed certs stored as `self-signed.pem`/`self-signed.key` in `./certs` (symlinked to `cert.pem`/`key.pem`); `production` deletes any self-signed files and requires valid user-provided `cert.pem` + `key.pem` (nginx fails to start otherwise) | `development` |
| `SEND_HSTS_ON_DEV` | Send the `Strict-Transport-Security` header in development mode too (`true`/`false`). In `production` mode HSTS is always sent. | `false` |

## Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_PROVIDER` | Storage backend (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Local upload directory | `./uploads` |

## Branding

All branding variables (`APP_NAME`, `APP_TAGLINE`, etc.) are used in:

- Navbar, Hero, Footer (React components)
- SEO meta tags, OpenGraph, Twitter cards
- Structured data (JSON-LD)
- Browser title
- FAQ content
- Public profile "Powered by" link
- Privacy Policy and Terms of Service pages

See [Configuration](./configuration.md) for detailed descriptions of each variable.

---

← [Getting Started](./getting-started.md) · [Configuration](./configuration.md) →
