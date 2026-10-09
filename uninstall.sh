#!/bin/sh
# BioPlatform uninstaller.
#
#   curl -fsSL https://raw.githubusercontent.com/00kino547/BioPlatform/main/uninstall.sh | bash
#
# Tears down a deployment created by install.sh. The default is a DRY RUN: it
# prints exactly what exists and what would be removed without touching a thing.
# Real teardown only happens when the operator walks through the confirmation
# menu (or passes --yes), and the named database/uploads volumes are NEVER dropped
# unless the operator types the full deployment path.
#
# WHY THIS SCRIPT IS CAREFUL
#
# Uninstall is the destructive sibling of install, so the same rules apply in
# reverse:
#
#     a verified backup happens BEFORE the stack is stopped.
#
# Data is never destroyed before a dump of this run exists. --purge extends the
# teardown to volumes, images and .env — but even then the backup file is kept,
# and the typed-path confirmation is still required because that is the one
# barrier --yes cannot cross.
#
# Exit codes: 0 success · 1 preflight/detection/backup/teardown failure.

set -eu

UNINSTALL_SH_VERSION="2.0.0-canary.2"

# ------------------------------------------------------------------- usage ---

usage() {
  cat <<'EOF'
BioPlatform uninstaller — back up, then tear down an install.sh deployment.

USAGE
  ./uninstall.sh [options]         (or: curl -fsSL <url>/uninstall.sh | bash)
  sh uninstall.sh [options]

DEFAULT BEHAVIOUR (dry run)
  Prints the full inventory of the deployment (containers, volumes, network,
  images, .env, certs) and what would be removed. Changes nothing.

OPTIONS
  -d, --deployment-dir DIR   Directory holding the compose file and .env
                             (default: current directory; auto-detected)
  -f, --compose-file FILE    Compose file to use (default: auto-detected)
      --env-file FILE        Env file to use (default: <deployment-dir>/.env)
  -b, --backup-dir DIR       Where dumps are written (default: <deployment-dir>/backups)
      --skip-backup          Do not take a pg_dump before stopping the stack.
                             Forbidden with --purge (data must not be destroyed
                             without a dump from this run).
      --purge                EXTEND the teardown to the named volumes, the
                             images and .env. Still keeps the backup file. The
                             named volumes still require the typed-path check.
  -n, --dry-run              Force dry-run mode (already the default — useful
                             to say "yes, I mean the plan" more than once)
  -y, --yes                  Answer confirmations automatically. Never bypasses
                             the typed-path guard on the data volumes.
  -h, --help                 This text
      --version              Print the script version

ENVIRONMENT
  BIOPLATFORM_COMPOSE_FILE   Compose file to use (same as --compose-file)
  BP_TRACE_FILE              Append one line per operation, in order (diagnostics)

A successful run prints the dump path and the exact command to bring the stack
back or to restore the database, e.g.
  <backup-dir>/bioplatform-20261005-160000.dump
EOF
}

# ------------------------------------------------------------------- flags ---

BP_DEPLOY_DIR=${BP_DEPLOY_DIR:-$(pwd)}
BP_COMPOSE_FILE_OVERRIDE=${BP_COMPOSE_FILE_OVERRIDE:-}
BP_ENV_FILE_OVERRIDE=${BP_ENV_FILE_OVERRIDE:-}
BP_BACKUP_DIR=${BP_BACKUP_DIR:-}
BP_SKIP_BACKUP=${BP_SKIP_BACKUP:-false}
BP_PURGE=${BP_PURGE:-false}
BP_DRY_RUN=${BP_DRY_RUN:-false}
BP_ASSUME_YES=${BP_ASSUME_YES:-false}
BP_DRY_PLAN_ONCE=${BP_DRY_PLAN_ONCE:-false}

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
    -b | --backup-dir)
      BP_BACKUP_DIR=${2:?--backup-dir needs a value}
      shift 2
      ;;
    --skip-backup) BP_SKIP_BACKUP=true; shift ;;
    --purge) BP_PURGE=true; shift ;;
    -n | --dry-run) BP_DRY_RUN=true; shift ;;
    -y | --yes) BP_ASSUME_YES=true; shift ;;
    -h | --help)
      usage
      exit 0
      ;;
    --version)
      printf '%s\n' "$UNINSTALL_SH_VERSION"
      exit 0
      ;;
    *)
      printf 'error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# The libraries live next to this script in a git checkout. When the script is
# piped from `curl`, that checkout does not exist — fetch all three libraries
# from the same raw URL so the piped form is self-contained. "$0" is never
# trusted to detect piping: the only reliable signal is whether the libraries
# are actually next to me.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
LIB_DIR=$SCRIPT_DIR/scripts/lib

if [ ! -f "$LIB_DIR/bioplatform-common.sh" ]; then
  case "${BIOPLATFORM_RAW_BASE:-}" in
    "")
      # Default to the tag this script itself belongs to, not to a moving branch.
      RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/$UNINSTALL_SH_VERSION"
      if [ "$UNINSTALL_SH_VERSION" = "dev" ]; then
        RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/main"
      fi
      ;;
    *) RAW_BASE=$BIOPLATFORM_RAW_BASE ;;
  esac

  LIB_DIR=${BP_LIB_DIR:-/tmp/bioplatform-uninstall-lib-$$}
  mkdir -p "$LIB_DIR"
  printf 'This script was piped in, so it is fetching its own helpers from %s ...\n' "$RAW_BASE"
  for lib in bioplatform-common.sh bioplatform-backup.sh bioplatform-cli.sh; do
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

  # A truncated or error-page download must never be sourced.
  for lib in bioplatform-common.sh bioplatform-backup.sh bioplatform-cli.sh; do
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
# shellcheck source=scripts/lib/bioplatform-cli.sh
. "$LIB_DIR/bioplatform-cli.sh"

# ------------------------------------------------------------- failure path ---

# Called from failure points after the deployment is known. The teardown is
# safe by construction (data volumes are never dropped before a verified dump
# of this run exists), so this is mostly about telling the operator what is
# still there and what to do next.
report_teardown_failure() {
  _why=$1
  bp_step "Uninstall failed: $_why"
  bp_error "nothing was destroyed without a verified dump from this run."
  bp_info ""
  bp_info "The deployment still exists in: $BP_DEPLOY_DIR"
  bp_info "State:"
  bp_compose ps -a 2>/dev/null || true
  bp_info ""
  if [ -n "${BP_BACKUP_FILE:-}" ] && [ -f "$BP_BACKUP_FILE" ]; then
    bp_info "A verified dump from this run is on disk:"
    bp_info "  $BP_BACKUP_FILE ($(bp_human_size "${BP_BACKUP_BYTES:-0}"))"
    bp_info ""
    bp_backup_restore_recipe "$BP_BACKUP_FILE"
  fi
  bp_info ""
  bp_info "Recovery:"
  bp_info "  sh $BP_DEPLOY_DIR/install.sh --force      # re-run; volumes and .env are preserved"
  bp_info "  docker compose -f $BP_COMPOSE_FILE up -d  # bring the stack back as it was"
  exit 1
}

# -------------------------------------------------------------- deployment ---

bp_banner "BioPlatform uninstaller" "reversible up to the data volumes; dry run by default"

# Refuse to guess where a deployment lives when there is nothing to inspect.
bp_require_docker
bp_resolve_deployment "$BP_DEPLOY_DIR"

bp_ok "deployment dir: $BP_DEPLOY_DIR"
bp_ok "compose file:   ${BP_COMPOSE_FILE##*/}"
if [ -f "$BP_ENV_FILE" ]; then
  bp_ok "env file:       $BP_ENV_FILE"
else
  bp_warn "no .env in the deployment directory — the deployment may be unused, or already partially removed"
fi
bp_ok "project:        $BP_COMPOSE_PROJECT"

# ------------------------------------------------------- what exists now -----

# Containers (running or not) of this project, one per line: service|name|status.
BP_CONTAINERS=$(bp_compose_capture ps -a --format '{{.Service}}|{{.Name}}|{{.Status}}' 2>/dev/null || true)

# Named volumes belonging to this project (project_volume).
BP_VOLUMES=$(docker volume ls --format '{{.Name}}' 2>/dev/null |
  grep "^${BP_COMPOSE_PROJECT}_" || true)

# The compose-managed network(s) of this project.
BP_NETWORKS=$(docker network ls --format '{{.Name}}' 2>/dev/null |
  grep "^${BP_COMPOSE_PROJECT}_" || true)

# Images the compose file actually references, so a purge removes what this
# project uses and nothing it does not.
BP_IMAGES=$(bp_compose_capture config --images 2>/dev/null || true)

# Backup files already on disk (the operator may have dumps from earlier runs).
BP_BACKUP_DIR_RESOLVED=$(bp_backup_dir "$BP_BACKUP_DIR")
BP_OLD_DUMPS=$(find "$BP_BACKUP_DIR_RESOLVED" -maxdepth 1 -name 'bioplatform-*.dump' 2>/dev/null | wc -l | tr -d ' ')
BP_OLD_DUMP_LIST=$(find "$BP_BACKUP_DIR_RESOLVED" -maxdepth 1 -name 'bioplatform-*.dump' 2>/dev/null |
  while IFS= read -r _f; do basename "$_f"; done || true)

BP_NGINX_CERTS=$BP_DEPLOY_DIR/nginx/certs
BP_HAS_CERTS=false
[ -d "$BP_NGINX_CERTS" ] && BP_HAS_CERTS=true

# Counts only non-empty lines; an empty inventory is 0, never 1 (the artifact
# an empty-string `printf | grep -c`.` would produce).
bp_count() {
  _lines=$1
  [ -n "$_lines" ] && printf '%s\n' "$_lines" | grep -c . || printf '0\n'
}

# --------------------------------------------------------------- inventory ----

bp_step "1/5  Inventory"

cat <<EOF
  project            $BP_COMPOSE_PROJECT
  directories        $BP_DEPLOY_DIR  ($(du -sh "$BP_DEPLOY_DIR" 2>/dev/null | cut -f1 || echo '?'), .env kept unless --purge)
  containers         $(bp_count "$BP_CONTAINERS")
  volumes            $(bp_count "$BP_VOLUMES")
  network(s)         $(bp_count "$BP_NETWORKS")
  images             images referenced by ${BP_COMPOSE_FILE##*/}
  existing dumps     $BP_OLD_DUMPS in $BP_BACKUP_DIR_RESOLVED
  ACME certs         $BP_NGINX_CERTS (${BP_HAS_CERTS:-false})
EOF

if [ -n "$BP_CONTAINERS" ]; then
  bp_info "containers (stopped or running):"
  printf '%s\n' "$BP_CONTAINERS" | awk -F'|' '{ printf "    %-28s %-40s %s\n", $1, $2, $3 }'
fi
if [ -n "$BP_VOLUMES" ]; then
  bp_info "named volumes (kept unless --purge):"
  printf '%s\n' "$BP_VOLUMES" | sed 's/^/    /'
fi

if [ "$BP_DRY_RUN" = "true" ] && [ "$BP_DRY_PLAN_ONCE" != "true" ]; then
  bp_info ""
  bp_info "dry run: nothing was changed. Re-run to actually tear down, or pass --yes."

  # In dry-run the backup path is only announced, never created.
  if [ "$BP_SKIP_BACKUP" = "true" ]; then
    bp_warn "would skip the backup (--skip-backup)."
  else
    bp_info "would first take a verified dump into $BP_BACKUP_DIR_RESOLVED"
  fi
  bp_info "would stop the stack with 'docker compose down' (no -v: volumes survive repeat installs)."
  if [ "$BP_PURGE" = "true" ]; then
    bp_warn "would ALSO remove the named volumes, the images and .env (--purge)."
    bp_warn "the data volumes would still require typing: $BP_DEPLOY_DIR"
  fi
  exit 0
fi

# --------------------------------------------------- back up before stopping --

bp_step "2/5  Backup before teardown"
bp_info "a verified dump is mandatory before the stack is stopped."

if [ "$BP_SKIP_BACKUP" = "true" ]; then
  if [ "$BP_PURGE" = "true" ]; then
    bp_die "--skip-backup combined with --purge is refused: the data volumes must not be destroyed without a dump from this run. Remove --skip-backup, or back up manually first."
  fi
  bp_warn "PROCEEDING WITHOUT A BACKUP (--skip-backup)."
  bp_warn "If a restore is needed later, there is no dump from this run to use."
else
  # Half-stopped support: if nothing is running, start only postgres long enough
  # for the dump, then stop it again so the stack is left exactly as found.
  BP_RUNNING_SERVICES=$(bp_compose_capture ps --services 2>/dev/null || true)
  BP_STARTED_FOR_BACKUP=false
  if ! printf '%s\n' "$BP_RUNNING_SERVICES" | grep -qx postgres; then
    if [ "$BP_DRY_RUN" = "true" ]; then
      bp_info "[dry-run] would start the postgres service alone for the dump"
    else
      bp_warn "the stack does not appear to be running — starting only postgres to take the dump."
      if ! bp_compose up -d postgres; then
        bp_die "could not start postgres to take the backup — .env/data untouched, nothing was removed."
      fi
      BP_STARTED_FOR_BACKUP=true
      bp_ok "postgres started for backup"
    fi
  fi

  if [ "$BP_DRY_RUN" = "true" ]; then
    bp_info "[dry-run] would run: bp_backup_database $BP_BACKUP_DIR"
  elif ! bp_backup_database "$BP_BACKUP_DIR"; then
    bp_trace "backup failed — teardown refused"
    bp_die "the backup did not succeed, so the teardown refused to proceed — nothing was removed. Fix disk space / permissions on $BP_BACKUP_DIR_RESOLVED and run again."
  else
    bp_ok "verified dump: $BP_BACKUP_FILE ($(bp_human_size "${BP_BACKUP_BYTES:-0}"))"
  fi

  # Leave the stack how we found it when we started postgres ourselves.
  if [ "$BP_STARTED_FOR_BACKUP" = "true" ] && [ "$BP_DRY_RUN" != "true" ]; then
    bp_info "stopping the postgres service we started (the stack was down when this run began)."
    bp_compose down postgres >/dev/null 2>&1 || bp_warn "could not stop postgres cleanly; stop it later with: docker compose -f $BP_COMPOSE_FILE down"
  fi
fi

if [ "$BP_DRY_RUN" = "true" ]; then
  bp_info ""
  bp_info "dry run: backup phase planned only. Re-run without --dry-run to execute."
  exit 0
fi

# ------------------------------------------------------------------- plan -----

bp_step "3/5  Confirmation"

_what="stop the stack and leave all files, volumes and data in place"
if [ "$BP_PURGE" = "true" ]; then
  _what="stop the stack AND remove the named volumes, images and .env"
fi

if [ "$BP_ASSUME_YES" = "true" ]; then
  bp_warn "--yes: proceeding to $_what."
else
  bp_menu "What should uninstall do?" \
    "teardown — $_what" \
    "cancel — do nothing and exit"
  case "$BP_MENU_RESULT" in
    cancel*) bp_info "cancelled — nothing was changed."; exit 0 ;;
  esac
fi

# The one barrier that --yes cannot cross: unnamed "are you sure" inputs are
# just skipped by --yes, but deleting the data volumes requires typing the
# deployment path exactly.
if [ "$BP_PURGE" = "true" ]; then
  if ! bp_confirm_type "$BP_DEPLOY_DIR" "Type the deployment directory to destroy its data volumes:"; then
    bp_die "typed path mismatch — the data volumes will NOT be removed. The stack teardown can still be completed without --purge by re-running."
  fi
  bp_ok "confirmation accepted — data volumes of $BP_DEPLOY_DIR will be removed."
fi

# ----------------------------------------------------------- stop the stack ---

bp_step "4/5  Stopping the stack"

if [ "$BP_DRY_RUN" = "true" ]; then
  bp_info "[dry-run] docker compose -f $BP_COMPOSE_FILE --env-file $BP_ENV_FILE down --remove-orphans (no -v)"
else
  # `down` never uses -v: the named volumes are the data. Only --purge removes
  # them and only after the typed-path confirmation above.
  if ! bp_compose down --remove-orphans; then
    report_teardown_failure "docker compose down failed"
  fi
  bp_ok "stack stopped; containers and networks removed"
fi

# ---------------------------------------------------------------- purge -------

if [ "$BP_PURGE" = "true" ]; then
  bp_step "4.5/5  Purging data (volumes, images, .env)"

  if [ "$BP_DRY_RUN" = "true" ]; then
    bp_info "[dry-run] would remove volumes:"
    printf '%s\n' "$BP_VOLUMES" | sed 's/^/    /'
    bp_info "[dry-run] would remove images:"
    printf '%s\n' "$BP_IMAGES" | sed 's/^/    /'
    bp_info "[dry-run] would remove: $BP_ENV_FILE, $BP_NGINX_CERTS"
  else
    # Volumes. Only the ones this run inventoried, never a glob of something the
    # operator might share with another stack.
    if [ -n "$BP_VOLUMES" ]; then
      # shellcheck disable=SC2086
      docker volume rm $BP_VOLUMES || bp_warn "some volumes could not be removed — check 'docker volume ls | grep ^${BP_COMPOSE_PROJECT}_'"
      bp_ok "named volumes removed"
    fi

    # Images this compose file references.
    if [ -n "$BP_IMAGES" ]; then
      # shellcheck disable=SC2046
      docker rmi $BP_IMAGES 2>/dev/null || bp_warn "some images could not be removed (likely still in use by another deployment) — left in place"
    fi

    # The .env carries secrets and is only created by install.sh; removing it is
    # part of purge, but the backup dump and the backups dir are always kept.
    if [ -f "$BP_ENV_FILE" ]; then
      rm -f "$BP_ENV_FILE" && bp_ok "removed $BP_ENV_FILE"
    fi
    if [ "$BP_HAS_CERTS" = "true" ]; then
      rm -rf "${BP_NGINX_CERTS:?}/" && bp_ok "removed ACME certs in $BP_NGINX_CERTS"
    fi
  fi
fi

# ------------------------------------------------------------------- done -----

bp_step "5/5  Uninstall complete"

bp_ok "the BioPlatform stack in $BP_DEPLOY_DIR was torn down."

if [ "$BP_DRY_RUN" != "true" ] && [ -n "${BP_BACKUP_FILE:-}" ] && [ -f "$BP_BACKUP_FILE" ]; then
  bp_info "Keep the dump — it is the only complete copy of the data:"
  bp_info "  $BP_BACKUP_FILE ($(bp_human_size "${BP_BACKUP_BYTES:-0}"))"
  bp_info ""
  bp_backup_restore_recipe "$BP_BACKUP_FILE"
fi

bp_info ""
bp_info "How to undo each part of this teardown:"
bp_info "  bring the stack back (volumes kept):"
bp_info "    sh $BP_DEPLOY_DIR/install.sh --force      # re-runs with the existing .env"
bp_info "    docker compose -f $BP_COMPOSE_FILE up -d  # if .env survived (no --purge)"
bp_info "  restore the database from a dump: see the recipe above"
bp_info "  fully delete the deployment directory (after a purge):"
bp_info "    rm -rf $BP_DEPLOY_DIR"
bp_info ""
bp_info "Data that is kept no matter what: the backup dumps in $BP_BACKUP_DIR_RESOLVED."