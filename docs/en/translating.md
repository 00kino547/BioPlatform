# Translating BioPlatform

This page explains how translations work and how to run the optional, self-hosted Weblate instance that powers them. It is written for the instance operator (who starts Weblate) and for contributors (who translate).

English is the **source of truth**. Every user-visible string is written in English first, then translated. See the [Language Policy](contributing.md#language-policy) and its [Localization Exception](contributing.md#localization-exception) in the contributing guide.

## What Weblate is here

[Weblate](https://weblate.org/) is an open-source continuous localization platform. In BioPlatform it plays one role: a **translation editor** for the frontend's user-visible strings. It reads the English source strings from this repository, lets contributors translate them in a browser, and turns finished translations into a **Pull Request against `main`**.

Weblate is **optional and opt-in**. It lives behind the `weblate` Docker Compose profile, so a normal deployment (`docker compose up -d`) never starts it. When enabled it runs as a fully isolated stack:

- a Weblate app service,
- its own dedicated PostgreSQL,
- its own dedicated Redis (cache + Celery broker).

These containers share nothing with the application's `postgres`/`redis`. Weblate publishes a **loopback-only** host port (`WEBLATE_HOST_PORT`, default `8080`) so the `weblate` profile is usable on its own. For public access you front it with a reverse proxy that terminates TLS: either the bundled nginx (run the `nginx` profile, recommended) or your own. The translation files themselves are never served at runtime; they are **bundled into the frontend build** (see [How translations reach the app](#how-translations-reach-the-app)).

## Prerequisites

- Docker and the Docker Compose plugin.
- A hostname for Weblate (for example `translate.example.com`). Terminate TLS in front of it — either with the bundled nginx (`--profile nginx`; it auto-generates the vhost while the Weblate container is running) or your own reverse proxy that forwards to the Weblate container on **port 8080** (internal service name `weblate`, or `127.0.0.1:<WEBLATE_HOST_PORT>` from the host).
- A GitHub OAuth app (for contributor sign-in) — see [GitHub OAuth app setup](#github-oauth-app-setup).
- Outgoing SMTP credentials — see [SMTP setup](#smtp-setup).
- Repository access for Weblate to clone the repository and open Pull Requests (a GitHub personal access token or a GitHub App installed on the repository). This is separate from the OAuth app used for sign-in.
- At least the minimum Weblate hardware (about 3 GB RAM, 2 CPU cores, 1 GB storage to start).

## GitHub OAuth app setup

Contributors sign in with GitHub, the same account they use to open translation Pull Requests.

1. In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL** to `https://<WEBLATE_SITE_DOMAIN>`.
3. Set **Authorization callback URL** to `https://<WEBLATE_SITE_DOMAIN>/accounts/complete/github/`.
4. Register the app, then copy the **Client ID** into `WEBLATE_SOCIAL_AUTH_GITHUB_KEY` and generate a **Client secret** into `WEBLATE_SOCIAL_AUTH_GITHUB_SECRET` in your `.env`.

The OAuth app only authenticates users. Pushing to the repository and opening Pull Requests needs its own credential — create a GitHub **personal access token** with read/write access to **Contents** and **Pull requests** (or install a GitHub App), and enter it when configuring the component inside Weblate.

> **Reusing the application's OAuth app.** A GitHub OAuth app accepts up to **10 redirect URIs** (since August 2026), so you do not need a separate app: reuse the existing `SSO_GITHUB_CLIENT_ID` / `SSO_GITHUB_CLIENT_SECRET` and simply add `https://<WEBLATE_SITE_DOMAIN>/accounts/complete/github/` as an extra redirect URI on that app.

## SMTP setup

Weblate sends registration confirmations, notifications, and commit mail, so it needs a working SMTP server. Set these in `.env`:

| Variable | Meaning |
| --- | --- |
| `WEBLATE_EMAIL_HOST` | SMTP server hostname. |
| `WEBLATE_EMAIL_PORT` | SMTP port (587 for STARTTLS, 465 for implicit TLS). |
| `WEBLATE_EMAIL_HOST_USER` | SMTP username. |
| `WEBLATE_EMAIL_HOST_PASSWORD` | SMTP password or app password. |
| `WEBLATE_EMAIL_USE_TLS` | `1` to enable STARTTLS (port 587); `0` for implicit SSL (port 465). |
| `WEBLATE_SERVER_EMAIL` | Envelope sender for error mail (for example `weblate@example.com`). |
| `WEBLATE_DEFAULT_FROM_EMAIL` | From address on outgoing mail. |

Weblate's configuration is independent of the application's own `SMTP_*` variables; you can point both at the same server, but they are set separately because Weblate runs in its own container. Set `WEBLATE_EMAIL_HOST` / `WEBLATE_EMAIL_HOST_USER` / `WEBLATE_EMAIL_HOST_PASSWORD` to the same values as `SMTP_*` to reuse the application's mail account.

## Starting Weblate

1. Copy the example environment file and fill in the `WEBLATE_*` values:

   ```sh
   cp .env.example .env
   ```

2. Start Weblate. On its own it is served on `http://127.0.0.1:${WEBLATE_HOST_PORT:-8080}`:

   ```sh
   docker compose --profile weblate up -d
   ```

   Or start it behind the bundled nginx (recommended for public access):

   ```sh
   docker compose --profile nginx --profile weblate up -d
   ```

   This builds nothing — it pulls the pinned images (`weblate/weblate:5`, `postgres:16-alpine`, `redis:7-alpine`) and starts the three isolated services.

3. Serve it on `https://<WEBLATE_SITE_DOMAIN>`. With the `nginx` profile, setting `WEBLATE_SITE_DOMAIN` is enough: nginx generates a virtual host for that hostname that proxies to `weblate:8080` and forces `X-Forwarded-Proto: https` — but only when the `weblate` container is reachable. If nginx is already running when you start Weblate, restart nginx (`docker compose --profile nginx restart nginx`) to generate the vhost. On an nginx-only stack the translate hostname has no vhost and falls through to the default app site instead of returning 502. If you use your own proxy instead, point it at `weblate:8080` on the Compose network, or at the published loopback port `127.0.0.1:8080`.

4. Stop the stack without touching the application's services:

   ```sh
   docker compose --profile weblate down
   ```

   The named volumes `weblate_data` and `weblate_postgres_data` persist, so translations and configuration survive a restart.

> The image tags are pinned deliberately. `weblate/weblate:5` follows the 5.x stable line; bump it only after reading the Weblate upgrade notes, since a new release can run database migrations on first start.

## Reverse proxy, TLS and Cloudflare Tunnel

When public traffic reaches Weblate through a TLS-terminating proxy (the bundled nginx, Cloudflare Tunnel, Caddy, Traefik, ...) Weblate must be told, or it redirect-loops and rejects form submissions. The Compose file sets safe defaults; keep these in `.env`:

| Variable | Purpose |
| --- | --- |
| `WEBLATE_SECURE_PROXY_SSL_HEADER` | `HTTP_X_FORWARDED_PROTO,https`. **Required on Weblate 5.13+ (granian)** so Weblate knows the client scheme is HTTPS. The value is comma-separated and case-sensitive. |
| `WEBLATE_CSRF_TRUSTED_ORIGINS` | The public https origin, for example `https://translate.example.com`. Without it Django rejects POSTs with "Origin checking failed". |
| `WEBLATE_IP_PROXY_HEADER` / `WEBLATE_TRUSTED_PROXY_ADDRESSES` | Which header carries the client IP, and which peers may set it. Defaults to `HTTP_X_FORWARDED_FOR` and the docker bridge range (where the bundled nginx lives). |

`WEBLATE_CSP_SCRIPT_SRC` is set by the Compose file to the narrow addition Weblate needs: its inline repository-page bootstrap. Cloudflare Insights is intentionally not allowed. Do not replace this with a broad script allowlist.

With the bundled nginx, `WEBLATE_SITE_DOMAIN` is all you set; nginx does the rest while the Weblate container is running. Then add a **Cloudflare Tunnel ingress** (or reverse-proxy rule) that maps `translate.example.com` to the nginx port — for a host-run `cloudflared`, `http://localhost:80`. The tunnel terminates TLS at the edge; Weblate's own host port is bound to loopback only, so it is not reachable from the LAN.

## First login and admin creation

On the first start, Weblate creates an **admin** account from the environment:

- `WEBLATE_ADMIN_NAME`, `WEBLATE_ADMIN_EMAIL`, and `WEBLATE_ADMIN_PASSWORD` define the account.
- If `WEBLATE_ADMIN_PASSWORD` is set, the account is created on first boot and its name, e-mail, and password are re-applied on every later start — so keep the value in `.env` and change it there to recover the login.
- If it is left empty, Weblate generates a random password and prints it in the container log.

Sign in at `https://<WEBLATE_SITE_DOMAIN>` with that account.

## How Weblate reads source strings and opens Pull Requests

Weblate works on the same files the app ships, so there is no export/import step:

- **Source of truth:** the English locale files under `apps/frontend/src/locales/en/*.json`.
- **Component format:** i18next JSON files (one file per namespace: `common`, `auth`, `landing`, `profile`, `invite`, `dashboard`, `admin`, `legal`, `shared`).
- **Monolingual base file:** `apps/frontend/src/locales/en/*.json`.
- **Translation path:** `apps/frontend/src/locales/<language>/*.json`.

Create two Weblate projects. In each project's components, set the repository URL to `WEBLATE_GIT_REPO`, choose **GitHub** as the version-control system, and configure these exact pairs:

- `bioplatform-canary`: repository branch `public-canary`; component Push branches `weblate_canary_<component>`.
- `bioplatform-main`: repository branch `main`; component Push branches `weblate_main_<component>`.

Weblate clones the repository, extracts the English strings, and stores translations in its own database until they are committed.

When translations are committed, Weblate pushes each component to its own source branch, for example `weblate_canary_profile` or `weblate_main_profile`, and opens a **Pull Request** against its paired target branch. Separate branches are required because Weblate processes components independently; sharing one source branch lets components overwrite each other and close PRs. These source branches must stay distinct from `public-canary` and `main`. Do not use Git direct-push mode or set either target branch as Push branch. Maintainers review and merge each PR; nothing reaches either target branch without that merge. Configure the repository credential (personal access token or GitHub App) for each project so Weblate can open PRs.

After a Weblate PR merges, the repository workflow resets that PR's source branch to its target branch. This prevents already-merged Weblate commits from becoming stale outgoing commits or rebase conflicts. The workflow only handles merged same-repository branches named `weblate_canary_<component>` or `weblate_main_<component>`.

## Review before commit

Review is **enforced**, not optional:

- `WEBLATE_DEFAULT_TRANSLATION_REVIEW=1` makes new translations require review/approval before they are committed.
- `WEBLATE_DEFAULT_SOURCE_REVIEW=1` makes changes to the English **source** strings require review too.
- Reviewers need the **Review strings** permission for the language they review. Add contributors who should approve translations to a team with that role.

Only approved strings are eligible for a commit, so unreviewed work never appears in a Pull Request. This is the review-before-commit guarantee: no translation is committed without moderation.

## Machine translation as suggestions only

Machine translation (MT) is available as a **suggestion source** in the editor, never as an automatic commit:

- Add MT engines under **Configuration → Machine translation**; their output appears as suggestions the translator can accept or edit.
- Do **not** enable the "Automatic translation" add-on or any add-on that auto-fills strings, because those would commit MT without human review.
- Weblate never commits MT on its own when only suggestion providers are configured.

The result: MT speeds up translators, but a human still reviews and approves every string before it can be committed.

## Glossary and string context

Weblate supports both a shared glossary and per-string context, which keep terminology consistent across a language:

- **Glossary:** create a glossary component in the project (**Manage → Add component → Glossary**). Terms added there appear in the editor's glossary panel for every translator, so names and key phrases are translated the same way everywhere.
- **String context:** the English JSON keys and any developer comments are shown next to each source string, so translators see where a string is used.
- **Screenshots:** upload a screenshot to a component and highlight the strings it contains. Translators then see the string in its real UI context, which removes most ambiguity.

These are configured in the Weblate UI rather than through environment variables — the Compose file enables reviews and registration, and the rest is per-project setup.

## Adding a new language

1. Inside Weblate, open the project and add the language. Weblate creates the locale file (`apps/frontend/src/locales/<language>/*.json`) through the translation commit + Pull Request.
2. In the repository, a maintainer makes the small code change that registers the locale in the frontend bundle:
   - add the locale's files to the resource bundle and to `SUPPORTED_LOCALES` in `apps/frontend/src/i18n/index.ts`, and
   - add the locale code to `public.i18n.locales` in `config.yml`.
3. Merge the Pull Request and rebuild the frontend (see below).

Any language is welcome. Until the code change in step 2 is merged, the locale exists in Weblate but is not offered to users.

## How translations reach the app

Translation files are **bundled into the frontend at build time** — the backend never serves them. A merged translation is therefore live only after the frontend is rebuilt:

1. A Pull Request from Weblate is reviewed and merged into `main`.
2. Multi-language is enabled for the instance: set `public.i18n.enabled: true` in `config.yml` (see `config.yml.example` → `i18n`).
3. The frontend image is rebuilt and redeployed, for example:

   ```sh
   docker compose --profile nginx up -d --build
   ```

The new or updated strings ship with that build. Editing translations in Weblate alone does not change the running app until the merge and rebuild happen.

## Operator TODO and security notes

- Provide the reverse proxy and a valid TLS certificate for `<WEBLATE_SITE_DOMAIN>`; Weblate expects to run behind HTTPS (`WEBLATE_ENABLE_HTTPS=1`). Keep the proxy-header variables above set, or Weblate will redirect-loop / reject logins.
- Create the GitHub API credential and configure it on each component so Weblate can open Pull Requests. Because these projects use named upstream source branches, configure `git@github.com:00kino547/BioPlatform.git` as the SSH Repository push URL. Add Weblate's public SSH key to the GitHub account with repository write access. Do not put a token in a repository URL.
- Weblate signs translation commits with its generated RSA 4096 GPG identity `Weblate BioPlatform <weblate@dexlunmc.com>` (`99D23FCF97EC4F2F3254450211F08400D52F367F`). Add the exported public key to GitHub's signing keys to show commits as verified. Components currently commit/push automatically after a 24-hour pending age.
- Keep `WEBLATE_ADMIN_PASSWORD`, `WEBLATE_POSTGRES_PASSWORD`, and the SMTP password in `.env` only. Never commit `.env`, and rotate these values if they leak.
- No port is published for Weblate or its datastores; do not add one. Expose Weblate only through the proxy.
- Expect to spend roughly 3 GB RAM and 2 CPU cores, more as the amount of hosted text grows.
