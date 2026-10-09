#!/bin/sh
# BioPlatform updater.
#
#   curl -fsSL https://raw.githubusercontent.com/00kino547/BioPlatform/main/update.sh | bash
#
# Updates a running deployment to a newer published image and applies the
# database migrations that release needs.
#
# WHY THIS SCRIPT IS CAREFUL
#
# This is the only one of the operator scripts that writes to the database. A
# migration cannot be undone, so the one rule that is not negotiable is:
#
#     a verified backup happens BEFORE anything else happens.
#
# Not before the migration, and not before the images are swapped — before all of
# it. `pg_dump` exiting 0 is not treated as a backup: the dump must be
# non-trivially sized and its archive table of contents must parse inside the
# postgres container, otherwise the update stops and says so loudly. The
# operator can override with --force, which prints the risk in capitals, but the
# default is refusal. Nothing in the script can reach `migrate deploy` without
# that verified dump existing first, and tests/update-backup-flow.test.ts asserts
# the ordering from the recorded order of real commands rather than by reading
# this comment.
#
# Failure behaviour: no partial update is left silently behind. Every failure
# path prints the dump path, the exact restore command, and whether the previous
# images were restored (automatic rollback, or explicit recovery steps).
#
# Idempotent: running it twice in a row is safe — the second run reports that the
# deployment is already current, takes a fresh backup and re-applies nothing.
#
# Exit codes: 0 success · 1 preflight/detection/backup/migration/health failure.

set -eu

UPDATE_SH_VERSION="2.0.0-canary.2"

# ------------------------------------------------------------------- usage ---

usage() {
  cat <<'EOF'
BioPlatform updater — pull new images and apply the database migrations they need.

USAGE
  ./update.sh [options]              (or: curl -fsSL <url>/update.sh | bash)
  sh update.sh [options]

OPTIONS
  -d, --deployment-dir DIR   Directory holding the compose file and .env
                             (default: current directory)
  -f, --compose-file FILE    Compose file to use (default: auto-detected:
                             docker-compose.prebuilt.yml, else docker-compose.yml)
      --env-file FILE        Env file to use (default: <deployment-dir>/.env)
  -t, --image-tag TAG        Image tag to update to (default: latest)
  -b, --backup-dir DIR       Where dumps are written (default: <deployment-dir>/backups)
      --verify-restore       Additionally prove the dump by restoring it into a
                             scratch database and comparing table counts
                             (needs room for a second copy of the database)
      --no-backup            Skip the backup. Requires --force; prints the risk.
      --force                Proceed even when the backup fails or was skipped
  -n, --dry-run              Print the plan and the commands, change nothing
  -s, --skip-pull            Do not pull images (use what is already local)
  -m, --skip-migration       Recreate the stack but do not run migrate deploy
                             (for operators who manage the schema themselves)
      --no-rollback          On failure, do not restore the previous images;
                             print recovery steps instead
      --health-timeout SECS  How long to wait for /api/health (default: 180)
  -y, --yes                  Do not ask for confirmation (required when stdin
                             is not a terminal, e.g. CI or a piped script)
  -h, --help                 This text
      --version              Print the script version

ENVIRONMENT
  BIOPLATFORM_COMPOSE_FILE   Compose file to use (same as --compose-file)
  BP_TRACE_FILE              Append one line per operation, in order (diagnostics)
  ADMIN_TOKEN                Admin bearer token; when set, /api/version is also
                             health-checked (it is admin-only, so without this
                             token that endpoint is reported as skipped)

A successful run always leaves a verified dump behind, e.g.
  <backup-dir>/bioplatform-20261005-160000.dump
EOF
}

# ------------------------------------------------------------------- flags ---

BP_DEPLOY_DIR=${BP_DEPLOY_DIR:-$(pwd)}
BP_COMPOSE_FILE_OVERRIDE=${BP_COMPOSE_FILE_OVERRIDE:-}
BP_ENV_FILE_OVERRIDE=${BP_ENV_FILE_OVERRIDE:-}
BP_IMAGE_TAG=${BP_IMAGE_TAG:-latest}
BP_BACKUP_DIR=${BP_BACKUP_DIR:-}
BP_VERIFY_RESTORE=${BP_VERIFY_RESTORE:-false}
BP_SKIP_BACKUP=${BP_SKIP_BACKUP:-false}
BP_FORCE=${BP_FORCE:-false}
BP_DRY_RUN=${BP_DRY_RUN:-false}
BP_SKIP_PULL=${BP_SKIP_PULL:-false}
BP_SKIP_MIGRATION=${BP_SKIP_MIGRATION:-false}
BP_NO_ROLLBACK=${BP_NO_ROLLBACK:-false}
BP_HEALTH_TIMEOUT=${BP_HEALTH_TIMEOUT:-180}
BP_ASSUME_YES=${BP_ASSUME_YES:-false}

while [ $# -gt 0 ]; do
  case "$1" in
    -d | --deployment-dir)
      BP_DEPLOY_DIR=${2:?--deployment-dir needs a value}
      shift 2
      ;;
    -f | --compose-file)
      BP_COMPOSE_FILE_OVERRIDE=${2:?--compose-file needs a value}
      shift 2
      ;;
    --env-file)
      BP_ENV_FILE_OVERRIDE=${2:?--env-file needs a value}
      shift 2
      ;;
    -t | --image-tag)
      BP_IMAGE_TAG=${2:?--image-tag needs a value}
      shift 2
      ;;
    -b | --backup-dir)
      BP_BACKUP_DIR=${2:?--backup-dir needs a value}
      shift 2
      ;;
    --verify-restore) BP_VERIFY_RESTORE=true; shift ;;
    --no-backup) BP_SKIP_BACKUP=true; shift ;;
    --force) BP_FORCE=true; shift ;;
    -n | --dry-run) BP_DRY_RUN=true; BP_ASSUME_YES=true; shift ;;
    -s | --skip-pull) BP_SKIP_PULL=true; shift ;;
    -m | --skip-migration) BP_SKIP_MIGRATION=true; shift ;;
    --no-rollback) BP_NO_ROLLBACK=true; shift ;;
    --health-timeout)
      BP_HEALTH_TIMEOUT=${2:?--health-timeout needs a value}
      shift 2
      ;;
    -y | --yes) BP_ASSUME_YES=true; shift ;;
    -h | --help)
      usage
      exit 0
      ;;
    --version)
      printf '%s\n' "$UPDATE_SH_VERSION"
      exit 0
      ;;
    *)
      bp_error "unknown option: $1"
      usage >&2
      exit 1
      ;;
  esac
done

# The libraries live next to this script in a git checkout. When the script is
# piped from `curl`, that checkout does not exist — fetch the two libraries from
# the same raw URL so the piped form is a single, self-contained download rather
# than a script that silently half-works.
#
# How the script was started is NOT inferred from `$0`: when a script is fed
# through a pipe, `$0` is the *shell's* name (`bash`, `sh`, `-bash`), never
# `/dev/stdin`, so a `$0` test rejects the documented `curl … | bash` form. The
# only reliable signal is "are the libraries actually next to me?".
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
LIB_DIR=$SCRIPT_DIR/scripts/lib

if [ ! -f "$LIB_DIR/bioplatform-common.sh" ]; then
  case "${BIOPLATFORM_RAW_BASE:-}" in
    "")
      # Default to the tag this script itself belongs to, not to a moving branch:
      # an operator pinning 2.0.0-canary.1 must not silently get helper code from
      # whatever main looks like today.
      RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/$UPDATE_SH_VERSION"
      if [ "$UPDATE_SH_VERSION" = "dev" ]; then
        RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/main"
      fi
      ;;
    *) RAW_BASE=$BIOPLATFORM_RAW_BASE ;;
  esac

  LIB_DIR=${BP_LIB_DIR:-/tmp/bioplatform-update-lib-$$}
  mkdir -p "$LIB_DIR"
  printf 'This script was piped in, so it is fetching its own helpers from %s ...\n' "$RAW_BASE"
  for lib in bioplatform-common.sh bioplatform-backup.sh; do
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$RAW_BASE/scripts/lib/$lib" -o "$LIB_DIR/$lib" || {
        printf 'Failed to download %s — cannot continue safely.\n' "$lib" >&2
        exit 1
      }
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$LIB_DIR/$lib" "$RAW_BASE/scripts/lib/$lib" || {
        printf 'Failed to download %s — cannot continue safely.\n' "$lib" >&2
        exit 1
      }
    else
      printf 'Neither curl nor wget is available; download the script and run it locally.\n' >&2
      exit 1
    fi
  done

  # A truncated or error-page download must never be sourced: `set -e` does not
  # protect against a file that exists but contains something else.
  for lib in bioplatform-common.sh bioplatform-backup.sh; do
    if [ ! -s "$LIB_DIR/$lib" ] || ! grep -q 'bp_' "$LIB_DIR/$lib"; then
      printf 'Downloaded %s does not look like the BioPlatform helper library — aborting.\n' "$lib" >&2
      exit 1
    fi
  done
fi

# shellcheck source=scripts/lib/bioplatform-common.sh
. "$LIB_DIR/bioplatform-common.sh"
# shellcheck source=scripts/lib/bioplatform-backup.sh
. "$LIB_DIR/bioplatform-backup.sh"

bp_banner "BioPlatform updater" "verified backup first; migration cannot skip it"

# ------------------------------------------------------------- failure path ---

# Called from every failure point after the deployment is known. Prints the
# rollback/recovery story, including the dump, so the operator never has to work
# out what to do next from memory.
report_failure() {
  _why=$1

  bp_step "Update failed: $_why"
  bp_error "the deployment was NOT left silently half-updated."
  bp_info ""

  if [ -n "${BP_BACKUP_FILE:-}" ] && [ -f "$BP_BACKUP_FILE" ]; then
    bp_info "A verified dump from this run is on disk:"
    bp_info "  $BP_BACKUP_FILE ($(bp_human_size "${BP_BACKUP_BYTES:-0}"))"
    bp_info ""
    bp_backup_restore_recipe "$BP_BACKUP_FILE"
  else
    bp_warn "No verified dump was produced by this run, so there is nothing to roll the database back to."
    bp_warn "The database schema was not modified: migrations run only after a verified dump exists."
  fi

  bp_info ""

  if [ "${BP_ROLLBACK_DONE:-false}" = "true" ]; then
    bp_ok "The previous images were restored and the stack was recreated. Your data is unchanged."
  elif [ "${BP_ROLLBACK_ATTEMPTED:-false}" = "true" ]; then
    bp_warn "Automatic rollback did not complete. Restore the previous images manually:"
    bp_info "  cd $BP_DEPLOY_DIR"
    if [ -n "${BP_PREV_BACKEND_IMAGE:-}" ]; then bp_info "  BACKEND_IMAGE=$BP_PREV_BACKEND_IMAGE \\"; fi
    if [ -n "${BP_PREV_FRONTEND_IMAGE:-}" ]; then bp_info "  FRONTEND_IMAGE=$BP_PREV_FRONTEND_IMAGE \\"; fi
    bp_info "  docker compose -f $BP_COMPOSE_FILE up -d"
  elif [ -n "${BP_PREV_BACKEND_IMAGE:-}" ]; then
    bp_info "Roll back to the images that were running before this run:"
    bp_info "  cd $BP_DEPLOY_DIR"
    if [ -n "${BP_PREV_BACKEND_IMAGE:-}" ]; then bp_info "  BACKEND_IMAGE=$BP_PREV_BACKEND_IMAGE \\"; fi
    if [ -n "${BP_PREV_FRONTEND_IMAGE:-}" ]; then bp_info "  FRONTEND_IMAGE=$BP_PREV_FRONTEND_IMAGE \\"; fi
    bp_info "  docker compose -f $BP_COMPOSE_FILE up -d"
  fi

  bp_info ""
  bp_info "See the backup section of docs/en/deployment.md for the full recovery procedure."
  exit 1
}

# -------------------------------------------------------------- deployment ---

bp_step "Checking the deployment"
bp_require_docker
bp_resolve_deployment "$BP_DEPLOY_DIR"

bp_ok "deployment dir: $BP_DEPLOY_DIR"
bp_ok "compose file:   ${BP_COMPOSE_FILE##*/}"
[ -f "$BP_ENV_FILE" ] && bp_ok "env file:       $BP_ENV_FILE" || bp_warn "no .env in the deployment directory — compose will use its built-in defaults"

bp_trace "detect dir=$BP_DEPLOY_DIR compose=${BP_COMPOSE_FILE} project=$BP_COMPOSE_PROJECT tag=$BP_IMAGE_TAG"

if ! bp_compose ps --status running >/dev/null 2>&1; then
  if [ "$BP_DRY_RUN" = "true" ]; then
    bp_warn "no running stack detected (ignored in dry-run)"
  else
    bp_die "no running BioPlatform stack found in $BP_DEPLOY_DIR. Use 'docker compose -f ${BP_COMPOSE_FILE} up -d' to start it, or point at the right directory with --deployment-dir."
  fi
fi

BP_RUNNING_SERVICES=$(bp_compose_capture ps --services 2>/dev/null || true)
if [ -z "$BP_RUNNING_SERVICES" ] && [ "$BP_DRY_RUN" != "true" ]; then
  bp_die "the stack in $BP_DEPLOY_DIR has no running services."
fi

if [ -n "$BP_RUNNING_SERVICES" ] && ! printf '%s\n' "$BP_RUNNING_SERVICES" | grep -qx backend; then
  bp_warn "the backend service is not running; the update will start it."
fi

# The nginx service is behind a compose profile. Only include the profile when it
# is already part of this deployment — adding it to a stack that never had nginx
# would silently start a web server (and bind 80/443) the operator did not ask
# for, while omitting it from a stack that does have nginx would leave nginx
# pointing at the old containers.
BP_PROFILES=""
if printf '%s\n' "$BP_RUNNING_SERVICES" | grep -qx nginx; then
  BP_PROFILES="--profile nginx"
fi

bp_ok "compose project: $BP_COMPOSE_PROJECT"

# ------------------------------------------------- what is running now -------

# Remember exactly which image each service is running, by digest. A tag is not
# enough: the operator may already be on `:latest`, in which case the tag stays
# the same across the update and only the digest changes.
current_image_digest() {
  _svc=$1
  _id=$(bp_compose_capture ps -q "$_svc" 2>/dev/null | head -n 1)
  [ -n "$_id" ] || return 0

  _ref=$(docker inspect --format '{{.Config.Image}}' "$_id" 2>/dev/null || true)
  _digest=$(docker image inspect --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' "$_ref" 2>/dev/null || true)
  printf '%s|%s' "${_ref:-unknown}" "${_digest:-$_id}"
}

BP_CUR_BACKEND=$(current_image_digest backend)
BP_CUR_FRONTEND=$(current_image_digest frontend)
BP_PREV_BACKEND_IMAGE=$(printf '%s' "$BP_CUR_BACKEND" | cut -d'|' -f2)
BP_PREV_FRONTEND_IMAGE=$(printf '%s' "$BP_CUR_FRONTEND" | cut -d'|' -f2)

bp_step "Current deployment"
bp_info "  backend:  $(printf '%s' "$BP_CUR_BACKEND" | cut -d'|' -f1)  ${BP_PREV_BACKEND_IMAGE:+($BP_PREV_BACKEND_IMAGE)}"
bp_info "  frontend: $(printf '%s' "$BP_CUR_FRONTEND" | cut -d'|' -f1)  ${BP_PREV_FRONTEND_IMAGE:+($BP_PREV_FRONTEND_IMAGE)}"

# --------------------------------------------------------- migration state ---

# Migrations already recorded by Prisma in the live database. The table only
# exists once `migrate deploy` has run at least once; a database created before
# Prisma Migrate was adopted has none, which is reported rather than hidden.
applied_migrations() {
  # `tr -d '[:space:]'` would also eat the newlines and glue every row into one
  # line; only carriage returns need removing. The comparison later is
  # line-by-line, so this has to stay one migration per line.
  bp_compose_capture exec -T postgres psql -U "$_pg_user" -d "$_pg_db" -tAc \
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name" \
    2>/dev/null | tr -d '\r' | grep -v '^[[:space:]]*$' || true
}

bp_pg_env
BP_APPLIED=$(applied_migrations)

bp_step "Schema state"
if [ -z "$BP_APPLIED" ]; then
  bp_warn "this database has no _prisma_migrations history."
  bp_warn "It was probably provisioned before Prisma Migrate was adopted (prisma db push or the legacy docs/migrations SQL)."
  bp_warn "migrate deploy is safe here because it applies only pending migrations, but if the tables already exist"
  bp_warn "by another route you must first record them: prisma migrate resolve --applied <name>. See docs/en/deployment.md."
  BP_PENDING="unknown (no migration history)"
else
  bp_ok "$(printf '%s\n' "$BP_APPLIED" | wc -l | tr -d ' ') migrations already applied (newest last):"
  printf '%s\n' "$BP_APPLIED" | tail -n 3 | sed 's/^/    /'
  BP_PENDING="see the list printed after the images are pulled"
fi

# ------------------------------------------------------------ release info ---

# Advisory only: the newest GitHub release, if the network allows it. Never
# fatal, never used to decide anything — the images and the database are the
# source of truth.
BP_RELEASE_TAG=""
if bp_have curl; then
  BP_RELEASE_TAG=$(curl -fsSL --max-time 10 \
    "https://api.github.com/repos/${BIOPLATFORM_REPO:-00kino547/BioPlatform}/releases/latest" 2>/dev/null |
    sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1) || true
  if [ -n "$BP_RELEASE_TAG" ]; then
    bp_info "newest published release: $BP_RELEASE_TAG"
  fi
fi

bp_step "Plan"
cat <<EOF
  deployment   $BP_DEPLOY_DIR
  project      $BP_COMPOSE_PROJECT
  image tag    $BP_IMAGE_TAG
  backups      $(bp_backup_dir "$BP_BACKUP_DIR")
EOF

if [ "$BP_SKIP_BACKUP" = "true" ]; then
  bp_warn "NO BACKUP WILL BE TAKEN (--no-backup)."
else
  bp_info "  backup      verified pg_dump before ANY migration (mandatory)"
fi
[ "$BP_VERIFY_RESTORE" = "true" ] && bp_info "  extra check dump restored into a scratch database and compared"
[ "$BP_SKIP_PULL" = "true" ] && bp_info "  pull        skipped (--skip-pull)"
[ "$BP_SKIP_MIGRATION" = "true" ] && bp_info "  migrations  skipped (--skip-migration)"

if [ "$BP_DRY_RUN" = "true" ]; then
  bp_info ""
  bp_info "dry run: nothing below is executed."
fi

if ! bp_confirm "Update this deployment to :$BP_IMAGE_TAG now?"; then
  bp_info "cancelled — nothing was changed."
  exit 0
fi

# ------------------------------------------------------------------ backup ---
#
# FIRST operation that touches anything. Everything after this point is
# recoverable from the dump taken here.

bp_step "1/5  Backing up the database (this happens before anything is changed)"

if [ "$BP_SKIP_BACKUP" = "true" ]; then
  if [ "$BP_FORCE" != "true" ]; then
    bp_die "--no-backup was passed without --force. A migration without a backup is not something this script will do."
  fi
  bp_warn "PROCEEDING WITHOUT A BACKUP, AS INSTRUCTED WITH --force."
  bp_warn "If the migration is wrong, there is no dump to restore from."
  bp_trace "backup skipped by operator"
else
  if ! bp_backup_database "$BP_BACKUP_DIR"; then
    if [ "$BP_FORCE" != "true" ]; then
      bp_trace "backup failed — refusing to migrate"
      bp_error "The backup did not succeed, so NO MIGRATION WILL RUN and nothing has been changed."
      bp_error "Fix the backup (disk space, permissions on $(bp_backup_dir "$BP_BACKUP_DIR")) and run this again."
      bp_error "If you are certain the database cannot be harmed by this release, re-run with --force."
      exit 1
    fi

    bp_warn "THE BACKUP FAILED AND --force WAS GIVEN."
    bp_warn "Continuing WITHOUT a backup. If the migration is wrong, this database cannot be restored."
    bp_trace "backup failed — continuing because of --force"
  else
    if [ "$BP_VERIFY_RESTORE" = "true" ]; then
      if ! bp_backup_verify_restore "$BP_BACKUP_FILE"; then
        if [ "$BP_FORCE" != "true" ]; then
          bp_trace "backup restore-check failed — refusing to migrate"
          bp_error "The dump did not restore cleanly, so NO MIGRATION WILL RUN."
          exit 1
        fi
        bp_warn "The restore check failed and --force was given; continuing anyway."
      fi
    fi

    bp_info ""
    bp_info "Keep this path. It is the only way back if the migration is wrong:"
    bp_info "  $BP_BACKUP_FILE"
  fi
fi

# ------------------------------------------------------------------- images ---

if [ "$BP_SKIP_PULL" = "true" ]; then
  bp_step "2/5  Images"
  bp_warn "pulling was skipped (--skip-pull) — using the images already on this host"
else
  bp_step "2/5  Pulling the new images (:$BP_IMAGE_TAG)"

  # Respect an image the deployment pinned. An operator who set BACKEND_IMAGE /
  # FRONTEND_IMAGE in .env (a private registry, a digest, a canary track) must
  # not have it silently replaced by the public one; --image-tag only decides the
  # tag when nothing is pinned. These are process-env assignments, so compose
  # interpolates them over the .env value for this run only and the operator's
  # file is never rewritten.
  BP_TARGET_BACKEND=${BP_TARGET_BACKEND:-$(bp_env_get BACKEND_IMAGE)}
  BP_TARGET_FRONTEND=${BP_TARGET_FRONTEND:-$(bp_env_get FRONTEND_IMAGE)}
  if [ -z "$BP_TARGET_BACKEND" ]; then
    BP_TARGET_BACKEND=dracoservices/bioplatform-backend:$BP_IMAGE_TAG
  fi
  if [ -z "$BP_TARGET_FRONTEND" ]; then
    BP_TARGET_FRONTEND=dracoservices/bioplatform-frontend:$BP_IMAGE_TAG
  fi
  if ! printf '%s' "$BP_TARGET_BACKEND" | grep -q ":$BP_IMAGE_TAG\$" && [ -z "$(bp_env_get BACKEND_IMAGE)" ]; then
    bp_warn "backend image $BP_TARGET_BACKEND does not carry the requested tag :$BP_IMAGE_TAG"
  fi

  # `--ignore-pull-failures` is deliberately NOT used: an update that quietly
  # continues on a stale image is worse than an update that stops.
  # shellcheck disable=SC2086
  if ! BACKEND_IMAGE=$BP_TARGET_BACKEND FRONTEND_IMAGE=$BP_TARGET_FRONTEND bp_compose $BP_PROFILES pull; then
    report_failure "could not pull the :$BP_IMAGE_TAG images"
  fi
  bp_ok "images pulled"
fi

# The authoritative pending-migration list, read from the image that is about to
# run (`--no-deps` + an overridden entrypoint, so this touches neither the
# database nor the running stack). The entrypoint applies migrations itself on
# boot, so this is printed for the operator rather than used as a gate — but it
# is printed BEFORE the migration runs, so nobody discovers a schema change
# afterwards.
BP_MIGRATION_DIR_IN_IMAGE=/app/apps/backend/prisma/migrations
BP_IMAGE_MIGRATIONS=$(bp_compose_capture run --rm --no-deps --entrypoint ls backend -1 "$BP_MIGRATION_DIR_IN_IMAGE" 2>/dev/null |
  grep -v '^$' | grep -v '^migration_lock.toml$' || true)

if [ -n "$BP_IMAGE_MIGRATIONS" ]; then
  bp_info "  migrations shipped in the image that is about to run:"
  printf '%s\n' "$BP_IMAGE_MIGRATIONS" | sed 's/^/    /'
  if [ -n "$BP_APPLIED" ]; then
    BP_PENDING_LIST=$(printf '%s\n' "$BP_IMAGE_MIGRATIONS" | while read -r m; do
      [ -n "$m" ] || continue
      printf '%s\n' "$BP_APPLIED" | grep -qx "$m" || printf '%s\n' "$m"
    done)
    if [ -n "$BP_PENDING_LIST" ]; then
      bp_warn "pending migrations (applied in the next step):"
      printf '%s\n' "$BP_PENDING_LIST" | sed 's/^/    /'
    else
      bp_ok "no pending migrations in this release"
    fi
  fi
else
  bp_warn "could not read the migration list from the image; the migration step below still runs."
fi

# -------------------------------------------------------------- migrations ---
#
# Run as its own one-shot container against the new image, with the entrypoint's
# own auto-migration switched off (MIGRATE_ON_START=false) so the order
# "backup -> migrate -> recreate" is enforced by this script and is visible in
# `docker compose ps` output rather than hidden inside a service start.

bp_step "3/5  Applying database migrations"

if [ "$BP_SKIP_MIGRATION" = "true" ]; then
  bp_warn "migrations skipped (--skip-migration) — the new version expects the schema of $BP_IMAGE_TAG"
else
  if bp_compose run --rm -e MIGRATE_ON_START=false backend \
    pnpm --filter @bioplatform/backend db:migrate:prod; then
    bp_ok "migrations applied"
  else
    bp_trace "migration failed"
    report_failure "'prisma migrate deploy' failed"
  fi
fi

# -------------------------------------------------------------- recreate -----

bp_step "4/5  Recreating the stack"

# shellcheck disable=SC2086
if ! bp_compose $BP_PROFILES up -d; then
  bp_trace "recreate failed"
  report_failure "docker compose up -d failed"
fi
bp_ok "stack recreated"

# ------------------------------------------------------------------ health ---

bp_step "5/5  Health check"

BP_HEALTH_URL=${BP_HEALTH_URL:-http://127.0.0.1:$(bp_env_get BACKEND_HOST_PORT 3000)/api/health}
BP_WAITED=0

# A dry run recreates nothing, so there is nothing new to wait for: polling a
# stack this script did not touch would burn the whole timeout (180s by default)
# and then "roll back" images it never changed. Say what would be checked and move on.
if [ "$BP_DRY_RUN" = "true" ]; then
  bp_info "[dry-run] would wait up to ${BP_HEALTH_TIMEOUT}s for $BP_HEALTH_URL"
  if [ -n "${ADMIN_TOKEN:-}" ]; then
    bp_info "[dry-run] would then check $BP_HEALTH_URL/../version with ADMIN_TOKEN"
  else
    bp_info "/api/version is admin-only; set ADMIN_TOKEN to have this script check it too"
  fi
  bp_ok "dry run complete — nothing was changed"
  exit 0
fi

bp_info "waiting for $BP_HEALTH_URL (timeout ${BP_HEALTH_TIMEOUT}s)..."
while [ "$BP_WAITED" -lt "$BP_HEALTH_TIMEOUT" ]; do
  if bp_http_ok "$BP_HEALTH_URL"; then
    bp_ok "backend is healthy after ${BP_WAITED}s"
    break
  fi
  sleep 3
  BP_WAITED=$((BP_WAITED + 3))
done

if [ "$BP_WAITED" -ge "$BP_HEALTH_TIMEOUT" ]; then
  bp_trace "health check timed out"
  if [ "$BP_NO_ROLLBACK" = "true" ] || [ -z "$BP_PREV_BACKEND_IMAGE" ]; then
    bp_warn "the new backend never became healthy within ${BP_HEALTH_TIMEOUT}s."
    bp_info "Recent backend logs (the usual cause is a failed migration):"
    bp_compose logs --tail=60 backend || true
    report_failure "health check timed out"
  fi

  bp_warn "the new backend never became healthy within ${BP_HEALTH_TIMEOUT}s — rolling back to the previous images."
  BP_ROLLBACK_ATTEMPTED=true
  if BACKEND_IMAGE=$BP_PREV_BACKEND_IMAGE FRONTEND_IMAGE=$BP_PREV_FRONTEND_IMAGE bp_compose up -d; then
    BP_ROLLBACK_DONE=true
    bp_info "Recent logs from the failed attempt:"
    bp_compose logs --tail=60 backend || true
    report_failure "health check timed out (previous images restored)"
  fi

  report_failure "health check timed out (rollback failed)"
fi

# /api/version is admin-only, so it is only probed when a token is available.
# Reporting it as skipped is honest; reporting success without asking would not.
if [ -n "${ADMIN_TOKEN:-}" ]; then
  if bp_http_ok "${BP_HEALTH_URL%/api/health}/api/version?force=1"; then
    bp_ok "/api/version answered"
  else
    bp_warn "/api/version did not answer with the supplied ADMIN_TOKEN"
  fi
else
  bp_info "/api/version is admin-only; set ADMIN_TOKEN to have this script check it too"
fi

# ------------------------------------------------------------------- done ----

bp_step "Update complete"

NEW_BACKEND=$(current_image_digest backend)
if [ "$(printf '%s' "$NEW_BACKEND" | cut -d'|' -f2)" = "$BP_PREV_BACKEND_IMAGE" ]; then
  bp_ok "the backend image did not change — you were already on this build"
else
  bp_ok "backend image: ${BP_PREV_BACKEND_IMAGE:-unknown} -> $(printf '%s' "$NEW_BACKEND" | cut -d'|' -f2)"
fi

if [ -n "${BP_BACKUP_FILE:-}" ] && [ -f "$BP_BACKUP_FILE" ]; then
  bp_info ""
  bp_info "Verified backup kept at: $BP_BACKUP_FILE ($(bp_human_size "${BP_BACKUP_BYTES:-0}"))"
fi