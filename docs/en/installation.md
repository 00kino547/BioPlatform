# Installation

The one-command installer (`install.sh`), the uninstaller (`uninstall.sh`) and
the updater (`update.sh`) are the three operator scripts shipped in the
repository root. They share a single helper library, a single `.env` schema and
the same TUI style (numbered menus, `--yes`, `--dry-run`, `--help`, `--version`),
so whatever works for one works for all three — see
[TASKS.md](../TASKS.md) "Medium Priority".

## install.sh — from an empty server to a running stack

```bash
curl -fsSL https://raw.githubusercontent.com/00kino547/BioPlatform/2.0.0-canary.2/install.sh | bash
# or, from a checkout of the repository:
sh install.sh
```

The script walks through, in order:

1. **Self-verification** — when piped, it re-fetches its own bytes and checks
   them against the published `install.sh.sha256`; a mismatch aborts before
   anything is written. A checkout verifies against `BIOPLATFORM_SHA256` /
   `--checksum`.
2. **Preflight** — Docker + Compose v2 present, current user can write the
   deploy directory, at least 2 GiB free.
3. **Install type** — the first menu:
   - `[1] docker — published images pulled from a registry (recommended)`: the
     compose file `docker-compose.prebuilt.yml`, nginx config and `.env.example`
     are fetched/copied into the deploy directory.
   - `[2] standalone — build the images from source`: the deployment directory
     *is* the source tree (a checkout, or the release tarball extracted in place)
     and the stack is built with `docker compose build`.
4. **Clobber guard** — an existing `.env` always refuses to be overwritten; an
   existing compose file refuses unless `--force` (standalone-into-checkout is
   exempt: the compose file *is* the deployment).
5. **.env generation** — `.env.example` is copied (mode `600`), then prompted
   values override it: `APP_URL` (full URL) and everything derived from its
   host, `NODE_ENV`, `BILLING_CURRENCY`, `INVITE_PRICE_PACKS`, the admin
   account (password entered twice, validated against the backend's
   known-weak list, never echoed), optional SMTP, storage
   (`local` / `s3` / `b2`), captcha (`none` / `turnstile`) and TLS.
   `POSTGRES_PASSWORD` and `JWT_SECRET` are generated and never printed.
6. **Plan + confirmation** — the full plan is printed, then `1/5 migrate`
   (fresh database), `2/5 pull/build`, `3/5 up --profile nginx`, `4/5 health`
   (`/api/health`, then the public `/api/version`), `5/5` summary with the
   admin URL. Any failure rolls back what was started and prints the recovery
   commands; volumes and `.env` are never removed.

### Options

```
  -d, --deployment-dir DIR   (default: /srv/bioplatform, or the checkout for standalone)
  -t, --type MODE            docker | standalone (skips the menu)
      --image-tag TAG        image tag for docker mode (default: latest)
      --seed                 SEED_ON_START=true on first boot (admin + invite codes)
      --checksum SHA256      expected SHA-256 of this script
  -s, --set KEY=VALUE        override any .env value (repeatable, wins)
      --defaults             non-interactive: every prompt falls back to defaults
  -f, --force                allow an existing compose file (never overwrites .env)
  -n, --dry-run              print the plan, change nothing
      --health-timeout SECS  default 180
  -y, --yes                  do not ask for confirmation
```

## update.sh — backup, migrate, rollback

See [Deployment](./deployment.md#updates) and the script header. The one rule
that is not negotiable: a **verified** `pg_dump` happens before any migration.
`--dry-run` prints the plan without touching anything; `--yes` skips the
confirmation. Piped mode fetches exactly two helpers
(`bioplatform-common.sh`, `bioplatform-backup.sh`), pinned to the script's own
version tag.

## uninstall.sh — reversible teardown, dry-run by default

```bash
sh uninstall.sh            # dry run: prints the inventory, changes nothing
sh uninstall.sh --yes      # stop the stack (volumes, .env and files kept)
sh uninstall.sh --purge --yes   # also remove volumes, images and .env
```

- **Dry-run is the default.** The inventory (containers, volumes, networks,
  images, existing dumps, certs) is printed and nothing is touched.
- **A verified backup always comes first** (the same `pg_dump` pipeline as
  update.sh), so data survives any mistake. `--skip-backup` is refused together
  with `--purge`.
- **Half-stopped support** — if the stack is already down, only `postgres` is
  started long enough for the dump, then stopped again.
- **The data volumes are never dropped by `--yes`.** `--purge` removing
  `postgres_data` / `uploads_data` requires typing the deployment path exactly
  (no TTY, no purge).
- `docker compose down` never uses `-v`; without `--purge` the install is
  fully repeatable.

## Safety contract

These rules are shared by all three scripts:

- One `.env` schema (`.env.example`); an env var added there is understood by
  all scripts (`BIOPLATFORM_COMPOSE_FILE` is what ties a deployment together).
- Nothing it did not fetch is ever executed (piped mode downloads its helpers
  from the same version tag it was fetched from).
- Secrets are written root-only and never echoed.
- Docs stay mirrored in `docs/es/installation.md`.