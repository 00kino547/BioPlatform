# Configuration

## Overview

BioPlatform is configured entirely through environment variables. Copy `.env.example` to `.env` and modify the values.

```bash
cp .env.example .env
```

## Application

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Application name shown in navbar, footer, emails | `BioPlatform` |
| `APP_TAGLINE` | Short tagline for the landing page | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Full description for SEO and meta tags | `Create a stunning profile page...` |
| `APP_URL` | Public URL of your instance | `http://localhost:80` |
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
| `VITE_CONTACT_URL` | Contact/support URL (footer, legal pages) | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | Status page URL (footer link) | _(empty)_ |
| `VITE_DOCS_URL` | Documentation URL (footer link) | `https://github.com/00kino547/BioPlatform/tree/main/docs` |

> **Important:** Frontend variables must be prefixed with `VITE_` to be accessible in React code via `import.meta.env.VITE_*`.

## Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `3000` |
| `API_PREFIX` | API route prefix | `/api` |
| `NODE_ENV` | Environment mode | `development` |
| `CONFIG_FILE` | Path to the instance configuration file (config.yml) | `config.yml` |
| `CONFIG_AUTO_RELOAD` | Hot-reload policy: `true` = auto on save, `false` = explicit `config reload` only | `true` |
| `ADS_FREE_OPT_OUT_ALLOWED` | Grants FREE-tier profiles the right to hide instance ads (`hideAds: true`). PRO/Enterprise always may. | `false` |

### Instance configuration (config.yml)

The public-facing, data-driven parts of an instance (landing copy, legal
operator identity, announcement bar, pricing visibility) live in **one human
editable YAML file** instead of build-time env vars. A missing file is fine —
the instance runs on schema defaults. Add yours with:

```bash
cp config.yml.example config.yml
```

Bind-mount it **read-write** into the backend container (the mount must be
writable so reload signals can bump its mtime):

```yaml
backend:
  volumes:
    - ./config.yml:/app/config.yml   # NOT :ro
```

Structure (see `config.yml.example` for the full commented file):

```yaml
public:
  landing:      # tagline, hero heading/subheading, footerAbout
  policy:       # operatorName, operatorContact, jurisdiction (Terms/Privacy)
  operational:  # announcement { message, href }, hidePricing
  ads:          # enabled, verificationMeta, slots (see "Instance ads" below)
private:
  operatorContactEmail:   # server-side only, never served to browsers
  ads:                    # ad-network secrets, server-side only
```

- **`public`** is served verbatim by `GET /api/config` and rendered by the SPA.
- **`private`** is validated in memory but **never** serialized to any endpoint
  or page (spambot defense).
- Every string is sanitized on load (HTML-like `< > { }` stripped); the
  announcement `href` accepts `http(s)` only.

**Hot reload:** the server re-reads the file every ~5 seconds.
`CONFIG_AUTO_RELOAD=true` (default) applies any save automatically; `=false`
ignores manual edits. An invalid change NEVER replaces the running config —
the last-good snapshot keeps serving, the error is logged, and the fix applies
on the next poll. A broken file at **boot** refuses to start on purpose.

**CLI (inside the backend container):**

```bash
pnpm --filter @bioplatform/backend cli config validate   # offline check, exit 0/1
pnpm --filter @bioplatform/backend cli config reload     # apply to the RUNNING server
```

`reload` validates first (never signals a broken file), then bumps the file's
mtime and touches `config.yml.reload`; the running server picks the new state
up on its next poll — even with `CONFIG_AUTO_RELOAD=false`.

### Instance ads

Instance owners can serve third-party ads at the bottom of every public profile
page (below the links, above the footer) with zero code — everything is
config.yml + one env var. Enabling projects the Google AdSense, Adsterra,
AADS (BTC-only), PopAds, PropellerAds, HilltopAds, Media.net and Infolinks
networks from the registry in `apps/backend/src/lib/ads.ts`.

```yaml
public:
  ads:
    enabled: true
    verificationMeta:            # meta tags for network site-ownership checks
      - name: "google-site-verification"
        content: "AbCdEfGhIjKl..."
    slots:
      - network: "adsense"       # <ins> unit + loader
        placement: "below-links"
        params:
          adsense: { client: "ca-pub-…", slot: "…", autoEnabled: false }
      - network: "adsterra"      # or aads/popads/propellerads/hilltopads/medianet/infolinks
        placement: "below-links"
        params:
          script: { src: "https://a.magsrv.com/ad.js", token: "1234567" }
      - network: "raw"           # operator-pasted official snippet
        placement: "below-links"
        params:
          raw: "<div class='ad'>…</div>"
private:
  ads:                           # network secrets — validated, NEVER serialized
    adsenseOauthToken: "..."
```

Behaviour and guarantees:

- **Two embed strategies.** `adsense`/script-based networks use the canonical
  mounts in `apps/frontend/src/components/ads/adEmbeds.ts`: the frontend builds
  the loader/unit itself. `network: raw` is a verbatim paste of the network's
  official snippet, rendered inside the ad slot **only**.
- **Allowlist at load time.** Every `script.src` a slot can produce is verified
  against that network's registry hosts (`resolveAdScriptSrc`); a `javascript:`
  URL or an off-list host fails the whole file at boot/reload.
- **Raw field is the one unsanitized channel.** `public.ads.slots[].params.raw`
  bypasses the `< > { }` string sanitizer on purpose (operator-authored HTML,
  by design it reaches the browser) — it must never carry secrets and should
  only come from the ad network's own panel.
- **Pop-unders** (PopAds, PropellerAds) fire at most once per visit from a
  client-side sessionStorage guard, keeping the network's original script.
- **Privacy.** Ad clicks reuse the existing click pipeline (`POST
  /api/profiles/click` with `platform: ad:<network>`) — same visitor-hash
  dedupe, same DNT/GPC-honouring gate, visible in the Dashboard analytics.
- **Opt-out.** `Profile.hideAds` is shown in the Dashboard whenever ads are on.
  PRO/Enterprise can always hide them; FREE plans only when you grant that via
  the `ADS_FREE_OPT_OUT_ALLOWED=true` env var (default `false`).
- **Adblock notice.** When a profile renders ads, a slim, dismissible notice is
  shown to visitors whose browser blocks ads (after a 10-second grace period,
  once per session). It is gated per profile via `Profile.adblockDetectorEnabled`
  in the Dashboard: FREE profiles **always** show it (the API rejects disabling
  it for FREE), while PRO/Enterprise may turn it off while keeping the ads.
- **CSP.** `nginx/site.conf` carries the static super-set of every registry
  network's script/image/frame/connect hosts. If a network's real loader loads
  from a host not listed there, add it to **both** the registry and the header.
- **Secrets stay server-side.** `private.ads` is validated at load but never
  serialized; `GET /api/config` only ever carries `public.ads`.

A slot is validated at load: AdSense needs `client` (+ `slot`, unless
`autoEnabled`), script networks need their loader `src` on an allowlisted host,
and `raw` needs an actual snippet.

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
| `JWT_SECRET` | Secret key for signing JWT tokens | — (required) |
| `JWT_EXPIRES_IN` | JWT token expiration | `7d` |
| `TRUST_PROXY` | Number of trusted proxy hops (real client IP for auth rate limiting) | `1` |
| `AUTH_LOCK_POLICY` | Account lock policy: `block` (reject all), `trusted_ip` (registered + last-login IPs may sign in without unlocking), `email` (unlock via email link) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Lock duration in minutes; `-1` = permanent lock | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | TTL in minutes of the email unlock link (`email` policy) | `30` |
| `AUTH_LOG_RETENTION_DAYS` | Auth log retention in days before the cleanup job deletes entries | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | How often the auth log cleanup job runs (in minutes) | `60` |

> Use a strong random string (32+ characters) for `JWT_SECRET` in production.

### Account lock & unlock

- After `MAX_FREE_ATTEMPTS` failed attempts (3), a lock is applied to the fingerprint (IP, cookie, user agent) and the account; by default it is permanent (`AUTH_LOCK_DURATION_MINUTES=-1`).
- With `trusted_ip`, signing in from the registered or last-login IP works without unlocking and resets the counters.
- With `email`, the user must open the unlock link emailed to them (`AUTH_UNLOCK_TOKEN_TTL_MINUTES`); requires SMTP configured.
- Admins can unlock accounts from the admin panel (**Bans** and **Logs** tabs). The unlock removes the account ban plus the IP/cookie bans recorded against that account.

## CORS

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Allowed origins (comma-separated) | `http://localhost:5173` |

> When using Nginx, the frontend uses relative API URLs (`/api`), so CORS is not needed. This is a fallback for local development.

## Nginx

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_INTERNAL_NGINX` | Enable Nginx container | `true` |
| `NGINX_PORT` | Nginx HTTP port | `80` |
| `NGINX_HTTPS_PORT` | Nginx HTTPS port | `443` |
| `APP_URL_HOST` | Bare hostname of the app's own domain (e.g. `example.com`). Nginx generates an app-host map at startup so social crawlers requesting the **root** of a **custom** domain get server-rendered OG from the backend, while the app host keeps its static SPA OG. | _(empty)_ |
| `ACME_ENABLED` | Enable automatic TLS (Let's Encrypt) for ACTIVE custom domains. | `false` |
| `ACME_DIRECTORY_URL` | ACME directory URL (staging for testing). | `https://acme-v02.api.letsencrypt.org/directory` |
| `ACME_EMAIL` | ACME account contact email. | _(empty)_ |
| `ACME_RENEW_BEFORE_DAYS` | Renew certs expiring within this many days. | `30` |
| `ACME_INTERVAL_MINUTES` | How often the backend checks certs and regenerates nginx config. | `60` |
| `ACME_MAX_DOMAINS_PER_RUN` | Max domains issued per check. | `20` |
| `ACME_CERTS_PATH` | Certificate/nginx-config directory (same host folder as nginx `/etc/nginx/certs` in Docker). | `certs` |

### Custom domains & TLS

Users can request a custom domain (PRO/Enterprise tier + `profiles.customDomain` permission), prove ownership with a TXT record (`_bioplatform.<domain>`), and an admin activates it after the TXT check passes. Active custom domains get:

- **Automatic TLS (ACME)**: with `ACME_ENABLED=true`, the backend issues and auto-renews Let's Encrypt certificates (HTTP-01) for every ACTIVE domain, writes them to `./certs/<domain>/`, regenerates the nginx config, and triggers a reload. Custom-domain HTTP server blocks expose `/.well-known/acme-challenge/` (proxied to the backend) and redirect everything else to HTTPS. Admin can force issuance per domain (Admin → Custom Domains → "Issue cert"). Requires the domain to point at this server with port 80 open.
- **Manual TLS**: drop a certificate and key per domain in `./certs/<domain>/cert.pem` + `key.pem` (gitignored). The backend picks them up on its next check (default hourly) and regenerates the nginx config; nginx reloads automatically.
- **Host-aware routing**: the custom-domain root serves the configured root target (a public profile) or the landing page; the SPA resolves the same redirect client-side.
- **Host-aware OG**: social crawlers hitting the root or a profile URL on a custom domain get server-rendered meta with canonical/OG URLs pointing at the custom domain.

Quick tunnels (`cloudflared tunnel --url …`) cannot route arbitrary custom domains — use a **named tunnel** with per-domain ingress rules so traffic for each custom domain reaches nginx with the correct `Host` header (and route `/.well-known/acme-challenge/*` to the backend).

## Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_PROVIDER` | Storage backend (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Local upload directory | `./uploads` |

Uploads (avatars, banners, profile/seasonal backgrounds, music) are stored under `LOCAL_STORAGE_PATH` (local) or pushed to a cloud bucket (`s3`/`r2`/`b2`) with UUID filenames and recorded in the database. See [Storage providers](storage.md) for the full comparison; [Orphan upload cleanup](#orphan-upload-cleanup) describes how the cleanup job is storage-provider aware.

### Orphan upload cleanup

A scheduled job removes **orphaned uploads** — files no longer referenced by any profile, seasonal theme, or music track. Orphans appear when an avatar/banner is overwritten, a profile, theme or user is deleted, or an upload fails mid-way after the file was written to disk.

How it works:

- On boot and then every `ORPHAN_CLEANUP_INTERVAL_MINUTES` (default 360), the backend builds the set of in-use filenames by querying `Profile.avatar`, `Profile.banner`, `Profile.theme.backgroundImage`, `SeasonalTheme.config.backgroundImage` and `MusicTrack.filePath`, lists the storage provider's objects, and deletes any unreferenced file.
- Files younger than `ORPHAN_CLEANUP_GRACE_HOURS` (default 24) are **never** touched, so an upload whose database write hasn't committed yet is safe.
- `.media-cache` thumbnails (derived, regenerable images) are pruned once older than `MEDIA_CACHE_MAX_AGE_HOURS` (default 168 = 7 days).
- The job takes a PostgreSQL advisory lock, so it is safe across multiple backend replicas; an in-process guard prevents overlapping runs on the same instance.
- Deletion is strictly confined to the storage root: names are basename-matched and traversal attempts are rejected. Set `ORPHAN_CLEANUP_ENABLED=false` to disable the job.

## Branding

All branding variables (`APP_NAME`, `APP_TAGLINE`, etc.) propagate to:

- Navbar, Hero, Footer (React components)
- SEO meta tags, OpenGraph, Twitter cards
- Structured data (JSON-LD)
- Browser title
- FAQ content
- Public profile "Powered by" link
- Privacy Policy and Terms of Service pages

To rebrand the entire application, change these values in `.env` and rebuild.

---

← [Environment Variables](./environment-variables.md) · [User Guide](./user-guide.md) →
