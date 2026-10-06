#!/bin/sh
# Backend container entrypoint.
#
# Two jobs, in this order, and both of them run BEFORE the server is started:
#
#   1. Bring the database schema up to date (`prisma migrate deploy`).
#   2. Optionally seed (SEED_ON_START).
#
# Why the migration is here at all: without it a *fresh* PostgreSQL volume was
# unusable. The server booted, logged "Database connected", and then every
# background task failed with `P2021 … table public.auth_logs does not exist`,
# while the healthcheck stayed red and the SEED_ON_START path swallowed the real
# error behind a "Warning: seed failed" line. `prisma migrate deploy` is the
# correct command for a production database (it applies only *pending*
# migrations and is a no-op when the database is already current), but no
# compose path ran it, so a clean-room install needed a manual
# `prisma db push`. Running it here makes `docker compose up` on an empty volume
# reach a healthy state with no manual Prisma command anywhere in the
# documented installation flow.
#
# The baseline migration `prisma/migrations/0_init` is the squashed full schema,
# so a brand-new database is created complete by this step and an existing,
# already-migrated database simply reports "already in sync".
set -eu

# ---------------------------------------------------------------- migrations

# Set to "false" to boot without touching the schema. `update.sh` uses this for
# the single one-shot container that applies migrations explicitly, so there is
# exactly one code path for migrating and the ordering (backup → migrate) stays
# visible in the script that performs it.
MIGRATE_ON_START=${MIGRATE_ON_START:-true}

# PostgreSQL is started as a sibling container with a health-gated
# `depends_on`, but a healthcheck is a poll, not a guarantee, and the operator
# may also run the backend against an external/remote database. Retry the
# migration a bounded number of times before giving up: `migrate deploy` applies
# each migration in its own transaction, so retrying after a failed connection
# can never half-apply anything.
DB_WAIT_ATTEMPTS=${DB_WAIT_ATTEMPTS:-30}
DB_WAIT_INTERVAL=${DB_WAIT_INTERVAL:-2}

# Apply pending migrations, retrying while the database is still unreachable.
# Returns non-zero only when the LAST attempt failed.
apply_migrations() {
  attempt=1
  while :; do
    if pnpm --filter @bioplatform/backend db:migrate:prod; then
      return 0
    fi

    if [ "$attempt" -ge "$DB_WAIT_ATTEMPTS" ]; then
      return 1
    fi

    attempt=$((attempt + 1))
    echo "Migration attempt $((attempt - 1)) failed; waiting ${DB_WAIT_INTERVAL}s for the database (retry $attempt/$DB_WAIT_ATTEMPTS)..."
    sleep "$DB_WAIT_INTERVAL"
  done
}

if [ "$MIGRATE_ON_START" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "FATAL: MIGRATE_ON_START=true but DATABASE_URL is empty — cannot apply migrations." >&2
    exit 1
  fi

  # Preflight: the image itself has to contain the migrations. `prisma migrate
  # deploy` with no migrations directory exits 0 and applies NOTHING, so a fresh
  # database would come up empty while this script cheerfully printed "up to
  # date" — the exact silent failure the whole step exists to prevent. This
  # happened for real: images built from a checkout where `prisma/migrations/`
  # was never committed shipped with no migrations at all.
  MIGRATIONS_DIR=${MIGRATIONS_DIR:-apps/backend/prisma/migrations}
  if [ ! -d "$MIGRATIONS_DIR" ] || [ -z "$(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -n 1)" ]; then
    echo "FATAL: this image contains no Prisma migrations (looked in $MIGRATIONS_DIR)." >&2
    echo "The database schema would be left EMPTY on a fresh install, so the server will not start." >&2
    echo "Cause: the image was built from a tree without prisma/migrations (a git checkout" >&2
    echo "missing them, or an exclude in .dockerignore / Dockerfile COPY)." >&2
    echo "Fix: rebuild the image from a checkout where apps/backend/prisma/migrations exists" >&2
    echo "and contains at least 0_init/, then run it again." >&2
    echo "If you deliberately manage the schema yourself, set MIGRATE_ON_START=false." >&2
    exit 1
  fi

  echo "Applying database migrations (prisma migrate deploy)..."
  if ! apply_migrations; then
    # Fail hard instead of starting the server: a server that boots against a
    # schema it does not match fails every request with P2021 while still
    # reporting a successful start, which is exactly the failure mode this step
    # exists to prevent. Exiting non-zero also makes compose report the service
    # as failed rather than healthy-but-broken.
    echo "FATAL: 'prisma migrate deploy' failed after ${DB_WAIT_ATTEMPTS} attempt(s)." >&2
    echo "The database schema was NOT applied. The server was not started." >&2
    echo "Fix the migration error above (or restore the database from a backup) and restart the service." >&2
    exit 1
  fi
  echo "Database schema is up to date."
fi

# --------------------------------------------------------------------- seed

# Runs after the migration so a fresh database has its tables before the seed
# writes roles/badges/admin. `db:seed` loads ../../.env with
# --env-file-if-exists: the file exists for a source checkout but never inside
# the image, and `--env-file` (without -if-exists) exits non-zero on a missing
# path — which used to make this step fail in Docker while local runs worked.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START is enabled — running database seed..."
  pnpm --filter @bioplatform/backend db:seed || echo "Warning: seed failed (database may already be initialized)"
fi

exec "$@"