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
| `VITE_APP_OG_IMAGE` | Default Open Graph/Discord embed image | `<VITE_APP_URL>/og.png` |
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
| `CF_TRUSTED_IPS` | Comma-separated source IPs/CIDRs allowed to set `CF-Connecting-IP` in nginx (where cloudflared connects from; see `docs/en/deployment.md` → Cloudflare Tunnel). Only these sources' header is trusted. | `172.18.0.0/16,127.0.0.1,::1` |
| `AUTH_LOCK_POLICY` | Account lock policy: `block` (reject all), `trusted_ip` (registered + last-login IPs may sign in without unlocking), `email` (unlock requires an email link) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Lock duration in minutes after the free attempts run out; `-1` = permanent lock | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | TTL in minutes for the email unlock link (`email` policy) | `30` |
| `AUTH_LOG_RETENTION_DAYS` | Auth log retention in days before the cleanup job deletes entries | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | How often the auth log cleanup job runs (in minutes) | `60` |

## WebAuthn (passkeys)

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBAUTHN_RP_ID` | Relying-party ID — the registrable domain **without port** (e.g. `localhost`, `example.com`) | `localhost` |
| `WEBAUTHN_ORIGIN` | The **exact** origin(s) the browser uses to reach the app (scheme + host + port; default ports are omitted). Comma-separate multiple origins (e.g. `http://localhost:80,https://localhost`). Must match the address bar precisely or passkey registration/authentication will fail with "Passkey registration failed". | `http://localhost:80` |
| `WEBAUTHN_RP_NAME` | Display name shown in the passkey prompt | `BioPlatform` |

> The origin is compared byte-for-byte against the browser-reported origin. If your deployment is served over HTTPS on the default port (as the Docker setup is), use `https://<host>` — not `http://<host>:80`. If you access it over plain HTTP on port 80, use `http://<host>:80`. In production this is your public domain (e.g. `https://bio.example.com`). If you want to allow both (e.g. an HTTP local deployment plus an HTTPS domain), list both origins separated by commas.

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

## Discord

The Discord integration (account link, presence widget, link previews, "Post to Discord") is enabled only when the three OAuth variables are set. Leave them empty to disable the feature entirely — the Dashboard shows an "unavailable" card. Live presence additionally requires `DISCORD_BOT_TOKEN`; without it, connecting still works but no presence is shown.

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | Discord application client ID | _(empty)_ |
| `DISCORD_CLIENT_SECRET` | Discord application client secret | _(empty)_ |
| `DISCORD_REDIRECT_URI` | OAuth2 redirect URI (must match the Discord Developer Portal) | `http://localhost:80/api/discord/callback` |
| `DISCORD_BOT_TOKEN` | Bot token that tracks live presence (enable the privileged **Presence Intent** and invite the bot to a server your users share) | _(empty)_ |
| `DISCORD_GUILD_INVITE` | Optional Discord server invite shown as a "Join presence hub" button in the Dashboard Discord tab | _(empty)_ |

> Create the application in the [Discord Developer Portal](https://discord.com/developers/applications) (Applications → New Application). Register the redirect URI under **OAuth2 → Redirects**, then copy the Client ID and Client Secret. Authorized users grant only `identify` with `prompt=consent` (account link + webhook embeds). For live presence, create a **Bot** user under the same app (Bot → Add Bot), enable the privileged "Presence Intent" (Settings → Bot → Privileged Gateway Intents), copy the bot token, and invite the bot to a server. A user's status is visible only while they are in a server shared with the bot.

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
