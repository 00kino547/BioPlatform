# Environment Variables

## Application

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Application name | `BioPlatform` |
| `APP_TAGLINE` | Short tagline | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Full description | `Create a stunning profile page...` |
| `APP_URL` | Public URL | `http://localhost:80` |
| `APP_URL_HOST` | Bare hostname of the app's own domain (e.g. `example.com`). Nginx uses it to detect app-host requests and only route social-crawler root requests from **custom** domains to the backend for server-rendered OG. | _(empty → only $host matching is skipped, app host never detected)_ |
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

> Frontend variables are injected at runtime by the container entrypoint from `window.__APP_CONFIG__`. They also work at build time via `import.meta.env.VITE_*`.

## Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |

## Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | — (required) |
| `POSTGRES_USER` | PostgreSQL username | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `postgres` |
| `POSTGRES_DB` | PostgreSQL database name | `bioplatform` |
| `MIGRATE_ON_START` | When `true`, the container applies pending Prisma migrations **before** the server starts (`prisma migrate deploy`), retrying while the database is unreachable and refusing to start the server if the migration fails or the image ships no `prisma/migrations/`. Set `false` only if you manage the schema yourself. | `true` |
| `DB_WAIT_ATTEMPTS` | How many times the startup migration retries while the database is not yet reachable | `30` |
| `DB_WAIT_INTERVAL` | Seconds to wait between those retries | `2` |

## Security

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret (min 32 chars) | — (required) |
| `JWT_EXPIRES_IN` | JWT token expiration | `7d` |
| `TRUST_PROXY` | Number of trusted proxy hops (used to resolve the real client IP for auth rate limiting) | `1` |
| `CF_TRUSTED_IPS` | Comma-separated trusted proxy source IPs/CIDRs whose `X-Forwarded-For` nginx trusts to restore the real client IP (where the reverse proxy connects from; see `docs/en/deployment.md` → Reverse Proxy). Only these sources' header is trusted. | `172.16.0.0/12,127.0.0.1,::1` |
| `AUTH_LOCK_POLICY` | Account lock policy: `block` (reject all), `trusted_ip` (registered + last-login IPs may sign in without unlocking), `email` (unlock requires an email link) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Lock duration in minutes after the free attempts run out; `-1` = permanent lock | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | TTL in minutes for the email unlock link (`email` policy) | `30` |
| `EMAIL_VERIFY_TOKEN_TTL_HOURS` | TTL in hours for the email verification link sent after registration (accounts whose email is unverified cannot sign in until it is confirmed) | `72` |
| `AUTH_LOG_RETENTION_DAYS` | Auth log retention in days before the cleanup job deletes entries | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | How often the auth log cleanup job runs (in minutes) | `60` |

## Admin / Seed

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_EMAIL` | Bootstrap admin email (seed creates this account) | `admin@localhost.localhost` |
| `ADMIN_USERNAME` | Bootstrap admin username | `admin` |
| `ADMIN_PASSWORD` | Bootstrap admin password (set a strong, unique value) | — (required for first start) |
| `SEED_ON_START` | When `true`, the entrypoint runs the database seed on startup (creates admin + invite codes if they don't exist). Set to `true` on first run, then remove. | `false` |

## Email (SMTP)

SMTP is used for account unlock links and notifications. Leave `SMTP_ENABLED=false` to disable.

| Variable | Description | Default |
|----------|-------------|---------|
| `SMTP_ENABLED` | Enable email sending | `false` |
| `POLICY_NOTICE_AUTO_EMAIL` | Automatically email every account that has not accepted the current Terms of Service / Privacy Policy when the policy versions change. Runs once at boot, is deduplicated by the notified version pair (restarts never re-send), and is skipped when SMTP is off. **First run only records a baseline and sends nothing**, so upgrading an existing deployment never emails every user a "changed" notice that did not happen — bump `POLICY_VERSIONS` afterwards to trigger a real send. The **Admin → Legal** button works regardless of this setting | `true` |
| `POLICY_ADMIN_AUTO_ACCEPT` | Automatically record acceptance of a new Terms of Service / Privacy Policy version for **operator accounts**, so bumping the policy versions does not lock the admin out of the panel they administer. Applies only after the same 30-day review window (`DEEMED_ACCEPTANCE_DAYS`) every other account gets — never on the spot — and the acceptance is written to the account row with a marker recording that the platform recorded it rather than a person clicking accept. Set to `false` to require staff to click through like any other account. **This is a grant of blanket legal acceptance: only widen it to a trusted staff list** | `true` |
| `POLICY_ADMIN_AUTO_ACCEPT_ROLES` | Comma-separated role slugs that count as operator accounts for `POLICY_ADMIN_AUTO_ACCEPT`. Defaults to the single built-in `admin` role. Changing it is an operator decision and is published in Terms §14 | `admin` |
| `SMTP_PROVIDER` | Email provider preset (`gmail`, `outlook`, `custom`) | `gmail` |
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username / email | _(empty)_ |
| `SMTP_PASS` | SMTP password / app password | _(empty)_ |
| `SMTP_FROM_NAME` | Sender display name | `BioPlatform` |
| `SMTP_FROM_EMAIL` | Sender email address | _(empty)_ |

## Newsletter

Newsletters are delivered through the same mail stack; `NEWSLETTER_PROVIDER` selects the transport. Two delivery paths exist: a profile can send with its **own SMTP deliverer** (`/api/newsletter/sender`, DNS-verified + test-passed, PRO/ENTERPRISE or allowlisted), or — for admins and, optionally, instance-owner-approved users — through the **platform sender** (the instance's `SMTP_*`/Resend stack). Sending respects per-tier volume limits (defaults FREE 0 / PRO 1 / ENTERPRISE 5 sends per 24 h) which the admin panel can override per tier.

| Variable | Description | Default |
|----------|-------------|---------|
| `NEWSLETTER_PROVIDER` | Newsletter transport: `smtp` (configure `SMTP_*` above) or `resend` (configure `RESEND_API_KEY`) | `smtp` |
| `RESEND_API_KEY` | API key for the `resend` provider | _(empty)_ |
| `RESEND_FROM` | Sender address for the `resend` provider | _(empty)_ |
| `NEWSLETTER_UNSUBSCRIBE_TTL_DAYS` | Validity of one-click unsubscribe links (days) | `365` |
| `NEWSLETTER_MAILING_ADDRESS` | Physical postal address required by CAN-SPAM/CASL, included in every newsletter footer. When empty, the site URL (`VITE_APP_URL`) is used instead as the required postal-address fallback | _(empty)_ |
| `NEWSLETTER_SELF_RECIPIENT_CAP` | Per-send recipient cap for profiles sending with their own SMTP deliverer | `1000` |
| `NEWSLETTER_PLATFORM_SMTP_ENABLED` | Instance-owner opt-in that lets **non-admin** users send through the platform sender. Off by default. When enabled, the account must **also** be allowlisted per user in **Admin → Newsletter → Sender allowlist** (the same flag that waives own-deliverer tier/DNS checks) | `false` |
| `NEWSLETTER_PLATFORM_RECIPIENT_CAP` | Per-send recipient cap for owner-approved users on the platform sender (admins keep the fixed 5000 cap) | `100` |

Every newsletter email includes a working one-click unsubscribe link, sender identity and postal address (or website fallback) regardless of the above settings.

## Product shop

The per-profile product storefront (digital goods sold per product and paid through the configured payment gateways) is configured with these variables. Deliverable files are stored under the private `products/` storage subtree and served only through the signed download route; the per-profile product limit comes from the tier (FREE = 3, PRO/Enterprise unlimited).

| Variable | Description | Default |
|----------|-------------|---------|
| `PRODUCT_FILE_MAX_MB` | Maximum size of a single product deliverable file (megabytes) | `50` |
| `PRODUCT_DOWNLOAD_TTL_HOURS` | Validity of the signed download links buyers receive (hours) | `168` |
| `PRODUCT_PURCHASE_TOKEN_TTL_DAYS` | Validity of the guest purchase-status client token used while polling a checkout (days) | `30` |

## Update check

The backend periodically fetches the public CHANGELOG from `APP_GITHUB_URL` to decide whether an update is available and how severe it is. On a `security` or `critical` result, security-sensitive endpoints (passkeys, TOTP, password change, admin user/role/badge mutations, webhook create/update/rotate/delete) return `403` until the app is updated. Failures never lock down the app (`GET /api/version` fails open).

| Variable | Description | Default |
|----------|-------------|---------|
| `UPDATE_CHECK_ENABLED` | When `false`, the version check is disabled entirely and `/api/version` always reports the installed version with severity `none` | `true` |
| `UPDATE_CHECK_INTERVAL_MINUTES` | How often a fresh check is performed (both the background scheduler and the request cache). A check also runs automatically on every container/stack restart. Use `?force=1` to bypass the cache | `720` |
| `UPDATE_CHECK_STALE_MAX_MINUTES` | Maximum age of a cached result that is still served when a fresh fetch fails (stale-while-error) | `1440` |
| `UPDATE_CRITICAL_STALE_THRESHOLD` | Number of skipped releases that alone raises the severity to `critical` | `3` |
| `UPDATE_CHECK_INCLUDE_PRERELEASES` | When `false` (default), pre-release versions (`1.3.0-rc.1`, `1.0.0-beta.2`, …) are excluded from the update check: they don't appear as updates, don't count toward the skipped/stale thresholds, and never raise severity or lock the admin panel — they only surface as a minimal "Pre-release vX.Y.Z available" notification to admins in the admin panel. When `true`, pre-releases are included as normal updates and can raise severity to `security` (which locks security-sensitive settings), but never to `critical` | `false` |

## Caching

The platform caches hot data through a pluggable driver: update-check results, the landing Open Graph card, profile Open Graph cards, the featured-profile setting and the active seasonal theme. Every driver is best-effort — if the cache backend is unreachable the app falls back to the live source (DB / external fetch) and keeps working.

| Variable | Description | Default |
|----------|-------------|---------|
| `CACHE_DRIVER` | Cache backend: `memory` (in-process Map, single instance only), `redis` (shared, recommended), `file` (JSON files on disk), `db` (PostgreSQL `cache_entries` table) | `redis` |
| `CACHE_REDIS_URL` | Redis connection URL. Inside the Docker network this is `redis://redis:6379`. Wire-compatible with Redis, Valkey, KeyDB, Dragonfly, etc. | `redis://localhost:6379` |
| `CACHE_FILE_DIR` | Directory for the `file` driver | `./data/cache` (Docker: `/app/data/cache`) |

The Docker stack provisions its own Redis-compatible cache (Valkey) at the `redis` service on port `6379`, bound to localhost only. Memoized in-memory caches (profile OG map, version-check) remain above the driver, with the driver acting as the shared layer.

## Captcha

Human-verification on registration and login. When a provider is configured (`CAPTCHA_PROVIDER` is not `none`), the frontend shows a widget on the register and login forms and `POST /api/auth/register` + `POST /api/auth/login` require a valid challenge `captchaToken` (verified server-side against the provider's siteverify API).

| Variable | Description | Default |
|----------|-------------|---------|
| `CAPTCHA_PROVIDER` | Challenge provider: `none` \| `turnstile` (Cloudflare) \| `recaptcha` (Google) \| `hcaptcha` | `none` |
| `CAPTCHA_SITE_KEY` | Public client key — safe to expose in the browser | `""` |
| `CAPTCHA_SECRET_KEY` | Server-side secret key — never exposed to the client | `""` |

## Analytics

Optional external/self-hosted analytics. The tracker is **consent-gated client-side**: scripts are only loaded after a visitor accepts non-essential cookies, and never for visitors who send Do Not Track (`DNT: 1`) or Global Privacy Control (`Sec-GPC: 1`). The backend also refuses to record its own aggregate analytics (page views, link clicks) for visitors sending those signals.

| Variable | Description | Default |
|----------|-------------|---------|
| `ANALYTICS_PROVIDER` | Provider: `none` \| `matomo` (self-hosted) | `none` |
| `ANALYTICS_MATOMO_URL` | Base URL of the self-hosted Matomo instance (e.g. `https://analytics.example.com`) — both values are safe to expose | `""` |
| `ANALYTICS_MATOMO_SITE_ID` | Matomo site (website) ID to track into | `0` |

## PocketBase (optional sign-in provider)

PocketBase is **optional and supports exactly one capability: sign-in.** BioPlatform never depends on it. With `POCKETBASE_URL` empty, PocketBase absent, or PocketBase unreachable, the platform behaves exactly as if it were not installed — accounts, links, shop, billing, newsletter and admin all live in PostgreSQL.

The sign-in flow posts credentials from the browser to PocketBase through the same-origin proxy path `POCKETBASE_CLIENT_URL` (nginx `/api/pb-speed → pocketbase:8090`), so the password reaches PocketBase and never the BioPlatform backend. The backend then verifies the resulting token and provisions a normal PostgreSQL account.

| Variable | Description | Default |
|----------|-------------|---------|
| `POCKETBASE_URL` | Server-facing PocketBase base URL (empty `""` = sign-in provider disabled) | `""` |
| `POCKETBASE_CLIENT_URL` | Public path/URL the browser posts to (the nginx proxy for `pb-speed`) | `/api/pb-speed` |
| `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` | PocketBase superuser used for internal reads — never exposed | `""` |
| `POCKETBASE_AUTH_COLLECTION` | Auth collection holding the identity records (used for PB sign-in) | `users` |
| `POCKETBASE_OAUTH_ENABLED` | Enable the PocketBase sign-in button on Login/Register and the `/api/auth/oauth/pocketbase/*` endpoints | `false` |

Both `POCKETBASE_URL` and `POCKETBASE_OAUTH_ENABLED` must be set for the provider to appear; it is reported to the SPA as `pocketbaseOauth` in `GET /api/features`.

### Removed variables

These are ignored if present in your `.env` (the env schema strips unknown keys rather than rejecting them), so leaving them behind will not break a boot — but they now do nothing and should be deleted.

| Removed variable | Why |
|------------------|-----|
| `POCKETBASE_ANALYTICS_ENABLED` | Pageviews and link clicks are stored, aggregated and pruned (90 days) in PostgreSQL. The PocketBase module wrote a second copy that nothing ever read back. |
| `POCKETBASE_STORAGE_ENABLED` / `POCKETBASE_CONTENT_ENABLED` | Declared and advertised through `GET /api/features`, but never implemented. |
| `POCKETBASE_MAX_UPLOAD_MB` | Only served the unimplemented storage module. Use the built-in storage drivers (B2 / S3 / local) for files. |
| `POCKETBASE_BOOTSTRAP` | Existed only to auto-create the two analytics collections at boot. |

### Operator cleanup after upgrading

If you previously ran with `POCKETBASE_ANALYTICS_ENABLED=true`, **delete the `analytics_pageviews` and `analytics_linkclicks` collections** in the PocketBase admin UI.

Those collections hold visitor identifiers, user agents, referrers and (for clicks) the full clicked URL. The platform never pruned them and provided no way to erase a visitor's data on request, while the same data in PostgreSQL is pruned automatically after 90 days. Nothing has read those collections since analytics moved to PostgreSQL, so deleting them loses no functionality.

The `users` auth collection must be kept: it is where the sign-in provider keeps its credentials.

## Link sections, icons and QR codes

Instance-owner opt-in feature flags for the social-links editor and public profile. When a flag is **off**, the corresponding editor controls are hidden **and** the public profile ignores the stored data (the backend still stores it, so turning a flag on later needs no re-entry). They are read by `GET /api/features`.

| Variable | Description | Default |
|----------|-------------|---------|
| `LINKS_SECTIONS_ENABLED` | Group links under free-text section headings (`heading` per link, max 48 chars) | `false` |
| `LINKS_CUSTOM_ICONS_ENABLED` | Allow a per-link custom favicon — an emoji (`icon`, max 24 chars) or an uploaded image (`image`, from `POST /api/profiles/me/link-icon`) — shown instead of the platform logo | `false` |
| `LINKS_QR_ENABLED` | Enable per-link QR codes: generate/download in the dashboard and show a scannable QR on the public profile for links with `showQr` | `false` |

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
| `ENABLE_INTERNAL_NGINX` | Enable the Nginx reverse proxy container (requires `--profile nginx` in docker compose) | `true` |
| `NGINX_PORT` | Nginx HTTP port | `80` |
| `NGINX_HTTPS_PORT` | Nginx HTTPS port | `443` |
| `TLS_MODE` | TLS certificate mode: `development` auto-generates self-signed certs stored as `self-signed.pem`/`self-signed.key` in `./certs` (symlinked to `cert.pem`/`key.pem`); `production` deletes any self-signed files and requires valid user-provided `cert.pem` + `key.pem` (nginx fails to start otherwise) | `development` |
| `SEND_HSTS_ON_DEV` | Send the `Strict-Transport-Security` header in development mode too (`true`/`false`). In `production` mode HSTS is always sent. | `false` |

## Ports and multiple instances

Host-side publishes, parameterised so two instances can share one machine. The
container ports stay fixed (`5432` / `6379` / `3000`), so `DATABASE_URL` and
`CACHE_REDIS_URL` never change — only what the host exposes does.

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_HOST_PORT` | Host port published for PostgreSQL | `5432` |
| `REDIS_HOST_PORT` | Host port published for Redis/Valkey | `6379` |
| `BACKEND_HOST_PORT` | Host port published for the backend API | `3000` |
| `NETWORK_NAME` | Docker network name — **must be unique per instance**, or a second stack joins the first one and its `postgres`/`redis` DNS names resolve to the wrong database | `bioplatform_net` |
| `CERTS_DIR` | Host directory mounted as nginx's certificates (must be unique per instance) | `./certs` |
| `NGINX_CONFIG_DIR` | Host directory holding `nginx.conf`, `site.conf` and `entrypoint.sh` (must be unique per instance) | `./nginx` |

## Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_PROVIDER` | Storage backend (`local`, `s3`, `r2`, `b2`) | `local` |
| `LOCAL_STORAGE_PATH` | Local upload directory | `./uploads` |
| `S3_ENDPOINT` | S3-compatible endpoint URL. Leave empty for AWS S3; set to your R2 (`https://<account>.r2.cloudflarestorage.com`), MinIO, Wasabi or DigitalOcean Spaces endpoint for others | _(empty)_ |
| `S3_REGION` | AWS region (or `auto` for providers that ignore it) | `auto` |
| `S3_ACCESS_KEY_ID` | S3-compatible access key ID | _(empty)_ |
| `S3_SECRET_ACCESS_KEY` | S3-compatible secret access key | _(empty)_ |
| `S3_BUCKET` | Bucket name. Auto-created on first upload if missing | _(empty → required for `s3`/`r2`)_ |
| `S3_PREFIX` | Optional key prefix inside the bucket (e.g. `bio/uploads`) | _(empty)_ |
| `S3_FORCE_PATH_STYLE` | Use path-style addressing (`true` for MinIO) | `false` |
| `B2_APPLICATION_KEY_ID` | Backblaze B2 application key ID | _(empty)_ |
| `B2_APPLICATION_KEY` | Backblaze B2 application key secret | _(empty)_ |
| `B2_BUCKET` | B2 bucket name. Auto-created on first upload if missing | _(empty → required for `b2`)_ |
| `B2_PREFIX` | Optional key prefix inside the bucket (e.g. `bio/uploads`) | _(empty)_ |
| `B2_API_URL` | Backblaze B2 API base URL (only override for custom/regional endpoints) | `https://api.backblazeb2.com` |
| `STORAGE_COMPRESS_ENABLED` | gzip (level 9) cloud uploads at rest (files ≥ 1 KB); local disk stays raw. Read side detects gzip by magic bytes, so toggling is non-destructive | `true` |
| `ORPHAN_CLEANUP_ENABLED` | Enable the scheduled orphan-upload cleanup job (`true`/`false`) | `true` |
| `ORPHAN_CLEANUP_INTERVAL_MINUTES` | How often the orphan cleanup job scans storage (in minutes) | `360` |
| `ORPHAN_CLEANUP_GRACE_HOURS` | Minimum age (hours) before an unreferenced file is considered orphaned; protects in-flight uploads | `24` |
| `MEDIA_CACHE_MAX_AGE_HOURS` | Max age of `.media-cache` thumbnails + materialized originals before the cleanup job prunes them (regenerated on demand) | `168` |
| `MEDIA_CACHE_MAX_ENTRIES` | Max number of files in `.media-cache`; oldest files are evicted when exceeded | `2000` |
| `MEDIA_CACHE_MAX_SIZE_MB` | Max total size of `.media-cache` in MB; oldest files are evicted when exceeded | `512` |

> Both S3-compatible (`s3`/`r2` via the AWS SDK) and native Backblaze B2 (`b2` via the B2 HTTP API) providers are supported. See `docs/en/storage.md` for provider setup and `docs/en/storage-migration.md` for the migration CLI.

## Discord

The Discord integration (account link, presence widget, link previews, "Post to Discord") is enabled only when the three OAuth variables are set. Leave them empty to disable the feature entirely — the Dashboard shows an "unavailable" card. Live presence additionally requires `DISCORD_BOT_TOKEN`; without it, connecting still works but no presence is shown.

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | Discord application client ID | _(empty)_ |
| `DISCORD_CLIENT_SECRET` | Discord application client secret | _(empty)_ |
| `DISCORD_REDIRECT_URI` | OAuth2 redirect URI (must match the Discord Developer Portal) | `http://localhost:80/api/discord/callback` |
| `DISCORD_BOT_TOKEN` | Bot token that tracks live presence (enable the privileged **Presence Intent** and invite the bot to a server your users share) | _(empty)_ |
| `DISCORD_GUILD_INVITE` | Optional Discord server invite shown as a "Join presence hub" button in the Dashboard Discord tab | _(empty)_ |

## ACME (automatic TLS for custom domains)

| Variable | Description | Default |
|----------|-------------|---------|
| `ACME_ENABLED` | When `true`, the backend automatically issues and renews Let's Encrypt certificates (HTTP-01) for every ACTIVE custom domain and manages the nginx custom-domain config. Requires each custom domain's DNS to point at this server and port 80 to be reachable. | `false` |
| `ACME_DIRECTORY_URL` | ACME directory URL. Use the Let's Encrypt staging URL for testing to avoid rate limits. | `https://acme-v02.api.letsencrypt.org/directory` |
| `ACME_EMAIL` | Contact email registered with the ACME account. | _(empty)_ |
| `ACME_RENEW_BEFORE_DAYS` | Renew certificates that expire within this many days. | `30` |
| `ACME_INTERVAL_MINUTES` | How often the backend checks for certificates that need issuing or renewing (also regenerates the nginx custom-domain config). | `60` |
| `ACME_MAX_DOMAINS_PER_RUN` | Maximum domains processed per check (safety against ACME rate limits). | `20` |
| `ACME_CERTS_PATH` | Directory where certificates, the ACME account key, and the generated nginx config live. In Docker this is the same host folder mounted into nginx at `/etc/nginx/certs` (`./certs`). | `certs` |

> Create the application in the [Discord Developer Portal](https://discord.com/developers/applications) (Applications → New Application). Register the redirect URI under **OAuth2 → Redirects**, then copy the Client ID and Client Secret. Authorized users grant only `identify` with `prompt=consent` (account link + webhook embeds). For live presence, create a **Bot** user under the same app (Bot → Add Bot), enable the privileged "Presence Intent" (Settings → Bot → Privileged Gateway Intents), copy the bot token, and invite the bot to a server. A user's status is visible only while they are in a server shared with the bot.

## Billing / Orders

| Variable | Description | Default |
|----------|-------------|---------|
| `BILLING_MODE` | Billing mode for plan purchases. `one-time` is active now; `subscription` and `fixed-term` are planned placeholders for the future checkout layer. | `one-time` |
| `BILLING_PRICE_PRO_CENTS` | Base price of the Premium (PRO) plan in minor units (cents). | `500` |
| `BILLING_PRICE_ENTERPRISE_CENTS` | Base price of the Enterprise plan in minor units (cents). | `2900` |
| `BILLING_CURRENCY` | ISO-4217 currency code applied to plan prices (shown to users). | `USD` |
| `INVITE_PRICE_PACKS` | Packs of invite credits a buyer may purchase, as `quantity:priceInMinorUnits` pairs separated by commas (prices in `BILLING_CURRENCY` minor units, e.g. `1:100,3:200,10:600`). Quantities are **discrete** — only listed quantities can be bought, so a volume discount can never be improvised by requesting an arbitrary amount. Invalid entries are skipped instead of being fatal. An **empty value disables the store entirely**, whatever the Admin -> Invites toggle says. | — (empty = store closed) |
| `INVITE_PURCHASE_CODE_TTL_DAYS` | Lifetime in days of invite codes emailed to a guest buyer who has no account yet. Credits bought by a signed-in member sit on the account balance and never expire. | `30` |
| `STRIPE_ENABLED` | Toggle card (Stripe Checkout) payments. When `false`, the Stripe method is hidden and rejected. | `false` |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_...`). Used to create Checkout sessions and to refund payments server-side. | — |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) used to verify `checkout.session.completed` / `checkout.session.expired` events on `POST /api/payments/webhooks/stripe`. | — |
| `PAYPAL_ENABLED` | Toggle PayPal payments (PayPal Checkout orders). | `false` |
| `PAYPAL_MODE` | PayPal environment: `sandbox` or `live`. | `sandbox` |
| `PAYPAL_CLIENT_ID` | PayPal API client id used to mint OAuth access tokens. | — |
| `PAYPAL_CLIENT_SECRET` | PayPal API client secret (stored server-side only). | — |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook id used to verify incoming IPN events via the `verify-webhook-signature` API. | — |
| `CRYPTO_ENABLED` | Toggle crypto payments (BTCPay Server + BitPay invoices). | `false` |
| `CRYPTO_PROVIDERS` | Comma-separated enabled providers. Order matters: it defines the default and the order shown to users. `btcpayserver`, `bitpay`. | `btcpayserver` |
| `BTCPAY_URL` | BTCPay Server base URL (e.g. `https://pay.example.com`). Optional unless `btcpayserver` is enabled. | — |
| `BTCPAY_API_KEY` | BTCPay Server API key (`token ...`) with store/read and invoice/create permissions. | — |
| `BTCPAY_STORE_ID` | BTCPay Server store id. | — |
| `BTCPAY_WEBHOOK_SECRET` | BTCPay Server webhook secret, verified as `sha256=HMAC-SHA256(payload, secret)` from the `BTCPay-Sig` header. | — |
| `BITPAY_API_KEY` | BitPay pairing token used both as the `X-Identity` header and as the HMAC-SHA512 key for the `X-Signature` request header. | — |
| `BITPAY_WEBHOOK_SECRET` | BitPay webhook secret, verified as HMAC-SHA512 of the raw body (header `x-bitpay-signature`). | — |
| `CRYPTO_COINS` | Comma-separated coins offered to crypto buyers: `BTC`, `LTC`, `XMR`, `USDT`, `ETH`. | `BTC,LTC,XMR` |
| `CRYPTO_RATE_SOURCE` | Source for USD prices of crypto coins. `coingecko` uses the CoinGecko `simple/price` API. | `coingecko` |
| `CRYPTO_RATE_FALLBACK` | Comma-separated `COIN=USD` env fallback prices (e.g. `BTC=90000,LTC=80`) used whenever the live source is unreachable. | — |
| `CRYPTO_RATE_CACHE_SECONDS` | How long a fetched `COIN → USD` rate is cached. `0` disables the cache and always re-fetches. | `300` |

When no online gateway is enabled, checkout is manual: users place a `PENDING` "MANUAL" order from the dashboard Billing tab (using the server-computed, affiliate-discounted price) and the platform owner marks it paid/cancelled/refunded from the admin **Orders** tab once the payment is received. The admin also configures the manual-payment contact method (email/Telegram/Discord/WhatsApp) stored as a system setting, shown to users and on the public pricing page.

With a gateway enabled, `POST /api/orders/me` still creates the PENDING order **and** the payment session at Stripe / PayPal / the crypto provider, returning a `checkout.url` the user opens to pay. Fulfillment is automatic: the provider's webhook (`/api/payments/webhooks/*`) marks the order PAID and upgrades the buyer's tier immediately. Refunds are stored but never downgrade a tier; cancelled/expired sessions only cancel PENDING orders.

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
