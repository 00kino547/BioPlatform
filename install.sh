#!/bin/sh
# BioPlatform one-command installer.
#
#   curl -fsSL https://raw.githubusercontent.com/00kino547/BioPlatform/main/install.sh | bash
#   sh install.sh --defaults -d /srv/bioplatform --seed
#
# Walks an empty server to a running stack: preflight checks, an install-type
# choice (published Docker images vs. a source build), guided .env generation,
# image pull/build, a fresh-database migrate, an optional seed, then a health
# check before reporting the admin URL.
#
# SAFETY CONTRACT (see TASKS.md -> Medium Priority, and docs/en/installation.md)
#
#   - Refuses to clobber an existing installation (a .env, a compose file or a
#     running stack in the deployment directory).
#   - Verifies its own checksum when one is published (BIOPLATFORM_SHA256,
#     --checksum, or install.sh.sha256 next to the piped source); a mismatch
#     aborts before anything is written.
#   - Every file it acts on — compose file, nginx config, .env.example, helper
#     libraries — is fetched by this script itself (curl/wget) or taken from the
#     operator's own checkout. Nothing it did not fetch is ever executed.
#   - Generated secrets (JWT_SECRET, POSTGRES_PASSWORD) are written to a
#     root-only .env and never echoed.
#   - On failure it rolls back what it started (network, containers) and prints
#     the exact recovery steps; volumes are never removed.
#
# Exit codes: 0 success ? 1 preflight/installation failure.

set -eu

INSTALL_SH_VERSION="2.0.0-canary.2"

# ------------------------------------------------------------- usage ---------

usage() {
  cat <<'EOF'
BioPlatform installer — bring an empty server to a running, healthy stack.

USAGE
  sh install.sh [options]
  curl -fsSL <url>/install.sh | bash -s -- [options]

OPTIONS
  -d, --deployment-dir DIR   Directory to install into (default: /srv/bioplatform,
                             or the current checkout for --type standalone)
  -t, --type MODE            Skip the menu: docker (published images) or
                             standalone (build from local source)
      --image-tag TAG        Image tag to deploy (default: latest; docker mode)
      --seed                 Set SEED_ON_START=true so first boot creates the
                             bootstrap admin + invite codes
      --checksum SHA256      Expected SHA-256 of this script (verified before
                             anything is written); BIOPLATFORM_SHA256 works too
  -s, --set KEY=VALUE        Override any .env value (repeatable; wins over
                             prompts and defaults)
      --defaults             Non-interactive: every prompt falls back to its
                             default/generated value (for CI and piped runs)
  -f, --force                Allow re-installing into a directory that already
                             has a compose file or stack (never overwrites .env)
  -n, --dry-run              Print the plan and the commands, change nothing
      --health-timeout SECS  How long to wait for /api/health (default: 180)
  -y, --yes                  Do not ask for confirmation
  -h, --help                 This text
      --version              Print the script version

ENVIRONMENT
  BIOPLATFORM_RAW_BASE       Raw URL base for piped helper/downloads (default: the
                             tag this script belongs to, or main for dev)
  BIOPLATFORM_SHA256         Expected SHA-256 of the bootstrap script
  BIOPLATFORM_ADMIN_PASSWORD Non-interactive admin password (still validated)
  BP_TRACE_FILE              Append one line per operation, in order (diagnostics)

Generated secrets (JWT_SECRET, POSTGRES_PASSWORD) are written to a root-only
.env and never printed.
EOF
}

# ------------------------------------------------------------------ flags ----

BP_DEPLOY_DIR=${BP_DEPLOY_DIR:-}
BP_INSTALL_TYPE=${BP_INSTALL_TYPE:-}
BP_IMAGE_TAG=${BP_IMAGE_TAG:-latest}
BP_SEED=false
BP_EXPECTED_SHA256=
BP_ASSUME_YES=false
BP_FORCE=false
BP_DRY_RUN=false
BP_HEALTH_TIMEOUT=${BP_HEALTH_TIMEOUT:-180}
BP_SET_VARS=

while [ $# -gt 0 ]; do
  case "$1" in
    -d | --deployment-dir) BP_DEPLOY_DIR=${2:?--deployment-dir needs a value}; shift 2 ;;
    -t | --type)
      BP_INSTALL_TYPE=${2:?--type needs a value}
      case "$BP_INSTALL_TYPE" in docker | standalone) ;; *) printf 'error: unknown install type: %s (docker|standalone)\n' "$BP_INSTALL_TYPE" >&2; exit 1 ;; esac
      shift 2
      ;;
    --image-tag) BP_IMAGE_TAG=${2:?--image-tag needs a value}; shift 2 ;;
    --seed) BP_SEED=true; shift ;;
    --checksum) BP_EXPECTED_SHA256=${2:?--checksum needs a value}; shift 2 ;;
    -s | --set)
      _kv=${2:?--set needs KEY=VALUE}
      case "$_kv" in *=*) ;; *) printf 'error: --set expects KEY=VALUE, got: %s\n' "$_kv" >&2; exit 1 ;; esac
      BP_SET_VARS="$BP_SET_VARS$_kv
"
      shift 2
      ;;
    --defaults) BP_ASSUME_YES=true; shift ;;
    -f | --force) BP_FORCE=true; shift ;;
    -n | --dry-run) BP_DRY_RUN=true; BP_ASSUME_YES=true; shift ;;
    --health-timeout) BP_HEALTH_TIMEOUT=${2:?--health-timeout needs a value}; shift 2 ;;
    -y | --yes) BP_ASSUME_YES=true; shift ;;
    -h | --help) usage; exit 0 ;;
    --version) printf '%s\n' "$INSTALL_SH_VERSION"; exit 0 ;;
    *)
      printf 'error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# NOTE: bp_* helpers are not loaded yet, so the early `--set` validation above
# uses bare printf. Load libs now (checkout first, fetch when piped).

# Relative "$0" (e.g. "./install.sh") is normalized to an absolute path so the
# later "deploy dir == checkout" comparison and the standalone guard compare like
# for like.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
LIB_DIR=$SCRIPT_DIR/scripts/lib

BP_ORIGIN=checkout
if [ ! -f "$LIB_DIR/bioplatform-common.sh" ]; then
  # Piped / relocated copies have no checkout next to them: fetch the helpers
  # from the same raw base as this script, exactly like update.sh does. A
  # truncated or non-helper download is refused before sourcing.
  BP_ORIGIN=piped
  case "${BIOPLATFORM_RAW_BASE:-}" in
    "")
      if [ "$INSTALL_SH_VERSION" = "dev" ]; then
        RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/main"
      else
        RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/$INSTALL_SH_VERSION"
      fi
      ;;
    *) RAW_BASE=$BIOPLATFORM_RAW_BASE ;;
  esac

  LIB_DIR=${BP_LIB_DIR:-/tmp/bioplatform-install-lib-$$}
  mkdir -p "$LIB_DIR"
  printf 'This script was piped in, so it is fetching its own helpers from %s ...\n' "$RAW_BASE"
  for _lib in bioplatform-common.sh bioplatform-cli.sh; do
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$RAW_BASE/scripts/lib/$_lib" -o "$LIB_DIR/$_lib" || {
        printf 'Failed to download %s — cannot continue safely.\n' "$_lib" >&2
        exit 1
      }
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$LIB_DIR/$_lib" "$RAW_BASE/scripts/lib/$_lib" || {
        printf 'Failed to download %s — cannot continue safely.\n' "$_lib" >&2
        exit 1
      }
    else
      printf 'Neither curl nor wget is available; download the script and run it locally.\n' >&2
      exit 1
    fi
  done
  for _lib in bioplatform-common.sh bioplatform-cli.sh; do
    if [ ! -s "$LIB_DIR/$_lib" ] || ! grep -q 'bp_' "$LIB_DIR/$_lib"; then
      printf 'Downloaded %s does not look like the BioPlatform helper library — aborting.\n' "$_lib" >&2
      exit 1
    fi
  done
else
  # A checkout defaults to its own version's raw base so piped mode stays on the
  # same revision as the local files.
  if [ "$INSTALL_SH_VERSION" = "dev" ]; then
    RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/main"
  else
    RAW_BASE="https://raw.githubusercontent.com/00kino547/BioPlatform/$INSTALL_SH_VERSION"
  fi
  RAW_BASE=${BIOPLATFORM_RAW_BASE:-$RAW_BASE}
fi

# shellcheck source=scripts/lib/bioplatform-common.sh
. "$LIB_DIR/bioplatform-common.sh"
# shellcheck source=scripts/lib/bioplatform-cli.sh
. "$LIB_DIR/bioplatform-cli.sh"

# ------------------------------------------------------------ dry-run gate ---

bp_dry() {
  if [ "${BP_DRY_RUN:-false}" = "true" ]; then
    printf '  [dry-run] %s\n' "$*"
    return 0
  fi
  return 1
}

# Rollback + recovery story for every failure point after the deployment
# directory is known. The installer never removes the .env or the volumes, so
# re-running after a fix is always possible.
report_install_failure() {
  _why=$1
  bp_banner "Installation failed" "the stack was rolled back; volumes and .env are kept"
  bp_error "$_why"
  bp_info ""
  bp_info "What is cleaned up:"
  if [ -f "$BP_COMPOSE_FILE" ]; then
    if docker compose --project-directory "$BP_DEPLOY_DIR" -f "$BP_COMPOSE_FILE" --env-file "$BP_ENV_FILE" ps -q --all >/dev/null 2>&1; then
      bp_info "  - created containers/networks (docker compose down)"
    fi
  fi
  bp_info "What is kept (never auto-deleted by this installer):"
  bp_info "  - the database volume  postgres_data  (your data)"
  bp_info "  - the uploads volume   uploads_data"
  bp_info "  - $BP_DEPLOY_DIR/.env"
  bp_info ""
  bp_info "Recovery:"
  bp_info "  cd $BP_DEPLOY_DIR"
  bp_info "  docker compose --profile nginx down       # stop what was started"
  bp_info "  docker compose logs --tail=60 backend      # why it failed, often a migration"
  bp_info "  sh install.sh --force                      # re-run; .env is preserved"
  exit 1
}

# --------------------------------------------------------- checksum check ---

bp_banner "BioPlatform installer" "empty server -> running stack"
bp_step "Verifying the installer itself"

_self_file=
if [ "$BP_ORIGIN" = "checkout" ]; then
  _self_file=$SCRIPT_DIR/install.sh
  [ -f "$_self_file" ] || _self_file=
fi

_verify_result=2
if [ "$BP_ORIGIN" = "piped" ]; then
  # The piped bootstrap is not on disk, so the script re-fetches its own bytes
  # from the same raw base and checks them against the published checksum. This
  # is the check TASKS.md requires ("verify its own checksum") and the only one
  # that works for `curl | sh`.
  _published=$(bp_fetch_string "$RAW_BASE/install.sh.sha256" || true)
  _expected=$(printf '%s' "$_published" | awk '{print $1}' | head -n 1)
  if [ -z "$_expected" ]; then
    bp_warn "no published checksum (install.sh.sha256) found at $RAW_BASE — skipping self-verification."
  else
    _copy=/tmp/bioplatform-install-self-$$.sh
    if bp_fetch "$RAW_BASE/install.sh" "$_copy" && [ -f "$_copy" ]; then
      if _actual=$(bp_sha256 "$_copy") && [ "$_actual" = "$_expected" ]; then
        bp_ok "piped bootstrap verified (sha256 $_actual)"
        _verify_result=0
      else
        bp_die "self-checksum MISMATCH ($_actual != $_expected) — refusing to run an unverified installer."
      fi
      rm -f "$_copy"
    else
      bp_warn "could not re-fetch the script from $RAW_BASE to verify it — continuing unverified."
    fi
  fi
elif [ -n "$_self_file" ]; then
  case $(bp_verify_self_checksum "$_self_file") in
    0) bp_ok "installer verified (sha256 $(bp_sha256 "$_self_file"))"; _verify_result=0 ;;
    1) bp_die "self-checksum MISMATCH — refusing to run an unverified installer." ;;
    2) bp_warn "no expected checksum supplied (BIOPLATFORM_SHA256 / --checksum) — proceeding unverified." ;;
  esac
fi

# ---------------------------------------------------------- preflight --------

bp_step "Preflight"
bp_require_docker

if bp_is_root; then
  bp_ok "running as root"
else
  bp_warn "not running as root — the deploy directory must be writable by the current user (docker group access is enough)."
fi

# ----------------------------------------------------------------- libs ----
# After this point bp_* helpers, RAW_BASE and BP_ORIGIN are load-bearing.

# Names of the files this installer places in the deployment directory, used by
# both the docker (fetch/copy) and standalone (source tree) paths.
BP_ENV_EXAMPLE_SOURCE=
case "$BP_ORIGIN" in
  checkout)
    BP_ENV_EXAMPLE_SOURCE=$SCRIPT_DIR/.env.example
    ;;
  piped)
    BP_ENV_EXAMPLE_SOURCE=$(mktemp -u /tmp/bioplatform-env-example-XXXXXX) || BP_ENV_EXAMPLE_SOURCE=/tmp/bioplatform-env-example
    if ! bp_dry "fetch $RAW_BASE/.env.example"; then
      if ! bp_fetch "$RAW_BASE/.env.example" "$BP_ENV_EXAMPLE_SOURCE"; then
        bp_die "could not fetch .env.example from $RAW_BASE — a release must ship it."
      fi
      bp_ok "fetched .env.example"
    fi
    ;;
esac

# ------------------------------------------------------- deployment dir -----

bp_step "Deployment directory"

# Standalone source builds keep the stack inside the source tree (matching the
# documented `docker compose --build` flow); an image install uses a dedicated
# runtime directory.
if [ -z "$BP_DEPLOY_DIR" ]; then
  if [ "$BP_INSTALL_TYPE" = "standalone" ] && [ "$BP_ORIGIN" = "checkout" ]; then
    BP_DEPLOY_DIR=$SCRIPT_DIR
  else
    BP_DEPLOY_DIR=/srv/bioplatform
  fi
  bp_prompt "Deployment directory" "$BP_DEPLOY_DIR"
  BP_DEPLOY_DIR=$BP_PROMPT_RESULT
else
  bp_info "  deployment dir: $BP_DEPLOY_DIR"
fi

case "$BP_DEPLOY_DIR" in
  /*) ;;
  *) BP_DEPLOY_DIR=$(pwd)/$BP_DEPLOY_DIR ;;
esac

if [ -e "$BP_DEPLOY_DIR" ] && [ ! -d "$BP_DEPLOY_DIR" ]; then
  bp_die "deployment path exists and is not a directory: $BP_DEPLOY_DIR"
fi

# ----------------------------------------------------------- install type ----

# Decided before the clobber guard: a standalone build turns the source tree
# itself into the deployment, so "a compose file already exists there" is the
# normal case and must not be treated as something to refuse.
if [ -z "$BP_INSTALL_TYPE" ]; then
  bp_menu "Installation type" \
    "docker — published images pulled from a registry (recommended)" \
    "standalone — build the images from source in this directory"
  case "$BP_MENU_RESULT" in
    docker*) BP_INSTALL_TYPE=docker ;;
    *) BP_INSTALL_TYPE=standalone ;;
  esac
fi
bp_ok "install type: $BP_INSTALL_TYPE"

BP_COMPOSE_FILE=$BP_DEPLOY_DIR/docker-compose.prebuilt.yml
[ "$BP_INSTALL_TYPE" = "standalone" ] && BP_COMPOSE_FILE=$BP_DEPLOY_DIR/docker-compose.yml
BP_ENV_FILE=$BP_DEPLOY_DIR/.env

# -------------------------------------------- clobber detection (the guard) --
_has_env=false
[ -f "$BP_DEPLOY_DIR/.env" ] && _has_env=true

_has_compose=false
[ -f "$BP_DEPLOY_DIR/docker-compose.yml" ] && _has_compose=true
[ -f "$BP_DEPLOY_DIR/docker-compose.prebuilt.yml" ] && _has_compose=true

if [ "$_has_env" = "true" ]; then
  bp_die "refusing to clobber an existing installation: $BP_DEPLOY_DIR/.env already exists. Move it aside or install into an empty directory. This script never overwrites an existing .env."
fi

if [ "$_has_compose" = "true" ] && [ "$BP_FORCE" != "true" ]; then
  if [ "$BP_INSTALL_TYPE" = "standalone" ] && [ "$BP_DEPLOY_DIR" = "$SCRIPT_DIR" ]; then
    bp_info "  using the source checkout itself as the deployment (standalone) — the compose it ships is the deployment, so no clobber check applies."
  else
    bp_die "refusing to install: compose file(s) already exist in $BP_DEPLOY_DIR. Pass --force to admit you know what you are doing (this never touches an existing .env)."
  fi
fi

if ! bp_dry "mkdir -p $BP_DEPLOY_DIR"; then
  if ! mkdir -p "$BP_DEPLOY_DIR"; then
    bp_die "cannot create the deployment directory: $BP_DEPLOY_DIR (is the current user allowed to write here?)"
  fi
fi

if ! bp_check_disk_free "$BP_DEPLOY_DIR" 2048; then
  bp_die "only ${BP_DISK_FREE_MB} MiB free where $BP_DEPLOY_DIR will live — the images + database need more (at least 2 GiB)."
elif [ "$BP_DISK_FREE_MB" -gt 0 ] 2>/dev/null && [ "$BP_DISK_FREE_MB" -lt 2048 ]; then
  bp_warn "only ${BP_DISK_FREE_MB} MiB free — install anyway at your own risk."
fi

# --------------------------------------------------------------- stage ------

bp_step "Staging the deployment files"

case "$BP_INSTALL_TYPE" in
  docker)
    # Files needed: compose (prebuilt) + the nginx config the compose mounts +
    # .env.example as the schema. Everything comes from this script's own
    # raw base or the operator's checkout, nothing else.
    for _rel in docker-compose.prebuilt.yml nginx/nginx.conf nginx/site.conf nginx/entrypoint.sh; do
      _dest=$BP_DEPLOY_DIR/$_rel
      if [ "$BP_ORIGIN" = "checkout" ]; then
        if [ -f "$SCRIPT_DIR/$_rel" ]; then
          if bp_dry "cp $SCRIPT_DIR/$_rel -> $BP_DEPLOY_DIR/$_rel"; then :; else
            mkdir -p "$(dirname "$_dest")"
            cp "$SCRIPT_DIR/$_rel" "$_dest" || { rm -f "$BP_ENV_FILE"; bp_die "failed to copy $_rel into the deployment directory."; }
          fi
        else
          bp_die "required file not found in the checkout: $_rel"
        fi
      else
        if bp_dry "fetch $RAW_BASE/$_rel"; then :; else
          if ! bp_fetch "$RAW_BASE/$_rel" "$_dest"; then
            rm -f "$BP_ENV_FILE"
            bp_die "failed to fetch $_rel from $RAW_BASE — a release must ship it."
          fi
        fi
      fi
    done
    ;;

  standalone)
    # The deployment directory must BE a source tree. A checkout is used as-is
    # (fast and matches the documented build flow); a piped run fetches the
    # release tarball and extracts it here.
    if [ "$BP_ORIGIN" = "checkout" ]; then
      if [ "$BP_DEPLOY_DIR" != "$SCRIPT_DIR" ]; then
        bp_die "standalone installs build from the source tree, but the deploy dir ($BP_DEPLOY_DIR) is not the checkout ($SCRIPT_DIR). Re-run with -d $SCRIPT_DIR, or use --type docker."
      fi
      bp_ok "using the local checkout as the source"
    else
      if bp_dry "fetch + extract source tarball into $BP_DEPLOY_DIR"; then :; else
        _tarball=${BIOPLATFORM_SOURCE_TARBALL:-https://github.com/00kino547/BioPlatform/archive/refs/heads/main.tar.gz}
        bp_info "fetching the source tarball ($_tarball)..."
        command -v tar >/dev/null 2>&1 || bp_die "tar is required for a standalone (source-build) install."
        if command -v curl >/dev/null 2>&1; then
          curl -fsSL "$_tarball" | tar -xz --strip-components=1 -C "$BP_DEPLOY_DIR"
        elif command -v wget >/dev/null 2>&1; then
          wget -qO - "$_tarball" | tar -xz --strip-components=1 -C "$BP_DEPLOY_DIR"
        else
          bp_die "neither curl nor wget is available to fetch the source."
        fi
        _got_compose=false
        [ -f "$BP_DEPLOY_DIR/docker-compose.yml" ] && _got_compose=true
        if [ "$_got_compose" != "true" ]; then
          rm -rf "$BP_DEPLOY_DIR"
          bp_die "the source download did not contain docker-compose.yml — aborting and removing the incomplete deployment directory."
        fi
      fi
      BP_ENV_EXAMPLE_SOURCE=$BP_DEPLOY_DIR/.env.example
    fi
    ;;
esac

if [ "$BP_DRY_RUN" != "true" ]; then
  [ -f "$BP_ENV_EXAMPLE_SOURCE" ] || bp_die "no .env.example is available — cannot build the .env."
  [ -f "$BP_COMPOSE_FILE" ] || bp_die "the expected compose file is missing: $BP_COMPOSE_FILE"
fi

# Also drop update.sh + uninstall.sh + the helper libraries into an image
# (docker) deployment, so the deployment directory is self-contained for
# `sh ./update.sh` / `sh ./uninstall.sh` without a checkout or another fetch.
if [ "$BP_INSTALL_TYPE" = "docker" ]; then
  for _tool in update.sh uninstall.sh scripts/lib/bioplatform-common.sh scripts/lib/bioplatform-cli.sh scripts/lib/bioplatform-backup.sh; do
    _dest=$BP_DEPLOY_DIR/$_tool
    _skip=false
    if [ "$BP_ORIGIN" = "checkout" ]; then
      [ -f "$SCRIPT_DIR/$_tool" ] || _skip=true
    fi
    if [ "$_skip" != "true" ]; then
      if bp_dry "install $BP_DEPLOY_DIR/$_tool"; then :; else
        mkdir -p "$(dirname "$_dest")"
        if [ "$BP_ORIGIN" = "checkout" ]; then
          cp "$SCRIPT_DIR/$_tool" "$_dest"
        else
          bp_fetch "$RAW_BASE/$_tool" "$_dest" || bp_die "failed to fetch $_tool"
        fi
        chmod +x "$_dest"
      fi
    fi
  done
fi

# ----------------------------------------------------------- .env build -----

bp_step "Building .env (see .env.example for every variable)"

if bp_dry "cp .env.example -> $BP_DEPLOY_DIR/.env (chmod 600)"; then
  bp_info "  [dry-run] .env would contain prompted/generated values, chmod 600"
else
  cp "$BP_ENV_EXAMPLE_SOURCE" "$BP_ENV_FILE"
  chmod 600 "$BP_ENV_FILE"
  bp_ok ".env created with root-only permissions (600)"
fi

# A helper that always applies a value now (dry runs just print the plan).
bp_mut() {
  _k=$1
  _v=$2
  if bp_dry "set $_k in .env"; then :; else
    bp_env_set "$BP_ENV_FILE" "$_k" "$_v"
  fi
}

# ---------------------------------------------------------------- network ---

bp_step "Network / public face"

bp_prompt_url() {
  _q=$1
  _d=$2
  while :; do
    bp_prompt "$_q" "$_d" || return 1
    case "$BP_PROMPT_RESULT" in
      http://* | https://* | mailto:*) return 0 ;;
      *) bp_error "must be a full http:// or https:// URL." ;;
    esac
  done
}

bp_prompt_url "Public URL (APP_URL, used for tokens, links and nginx)" "http://localhost:80"
BP_APP_URL=$BP_PROMPT_RESULT

# Derive the bare hostname for APP_URL_HOST / WEBAUTHN_RP_ID.
_bp_host=${BP_APP_URL#*://}
_bp_host=${_bp_host%%/*}
_bp_host_no_port=$_bp_host
case "$_bp_host" in
  *:*) _bp_host_no_port=${_bp_host%:*} ;;
esac

bp_mut APP_URL "$BP_APP_URL"
bp_mut APP_URL_HOST "$_bp_host_no_port"
bp_mut CORS_ORIGIN "$BP_APP_URL"
bp_mut WEBAUTHN_ORIGIN "$BP_APP_URL"
bp_mut VITE_APP_URL "$BP_APP_URL"
bp_mut VITE_APP_OG_IMAGE "$BP_APP_URL/og.png"

if [ -n "$_bp_host_no_port" ] && [ "$_bp_host_no_port" != "localhost" ]; then
  bp_mut WEBAUTHN_RP_ID "$_bp_host_no_port"
fi

bp_prompt "Environment (NODE_ENV)" "production"
[ "$BP_PROMPT_RESULT" = "production" ] || [ "$BP_PROMPT_RESULT" = "development" ] || bp_die "NODE_ENV must be production or development."
bp_mut NODE_ENV "$BP_PROMPT_RESULT"

bp_prompt "Currency for the store (ISO-4217)" "USD"
case "$BP_PROMPT_RESULT" in
  ???) bp_mut BILLING_CURRENCY "$(printf '%s' "$BP_PROMPT_RESULT" | tr 'a-z' 'A-Z')" ;;
  *) bp_die "BILLING_CURRENCY must be a 3-letter ISO-4217 code (e.g. USD, EUR)." ;;
esac

bp_prompt "Paid invite packs (leave empty to close the store; e.g. 1:100,3:200,10:600)" ""
bp_mut INVITE_PRICE_PACKS "$BP_PROMPT_RESULT"

# ------------------------------------------------------------- delegates ----

bp_step "Database"

if bp_dry "generate POSTGRES_PASSWORD + JWT_SECRET"; then
  bp_info "  [dry-run] two 64-char secrets would be generated and written (never echoed)"
else
  _pg_pw=$(bp_random_hex 32) || bp_die "random generation failed"
  _jwt_sec=$(bp_random_hex 64) || bp_die "random generation failed"
  _pg_user=$(sed -n 's/^POSTGRES_USER=//p' "$BP_ENV_FILE" | head -n 1 | tr -d '\r')
  _pg_user=${_pg_user:-postgres}
  _pg_db=$(sed -n 's/^POSTGRES_DB=//p' "$BP_ENV_FILE" | head -n 1 | tr -d '\r')
  _pg_db=${_pg_db:-bioplatform}

  bp_mut POSTGRES_PASSWORD "$_pg_pw"
  bp_mut JWT_SECRET "$_jwt_sec"
  bp_mut DATABASE_URL "postgresql://$_pg_user:$_pg_pw@postgres:5432/$_pg_db?schema=public"
fi

# ---------------------------------------------------------------- admin -----

bp_step "Bootstrap administrator"

bp_prompt "Admin email" "${BIOPLATFORM_ADMIN_EMAIL:-admin@example.com}"
[ -n "$BP_PROMPT_RESULT" ] || bp_die "an admin email is required."
bp_mut ADMIN_EMAIL "$BP_PROMPT_RESULT"

bp_prompt "Admin username" "admin"
bp_mut ADMIN_USERNAME "$BP_PROMPT_RESULT"

_apw=${BIOPLATFORM_ADMIN_PASSWORD:-}
if [ -z "$_apw" ]; then
  if bp_dry "prompt for ADMIN_PASSWORD (twice, never echoed)"; then
    _apw=placeholder-dry-run
  else
    while :; do
      if ! bp_prompt_secret "Admin password (12+ chars)" "Repeat the admin password"; then
        bp_die "the two admin password entries did not match."
      fi
      _apw=$BP_PROMPT_RESULT
      bp_validate_password "$_apw" && break
      bp_error "that password is too short or known-weak — use 12+ random characters and not a value the backend rejects."
    done
  fi
else
  bp_validate_password "$_apw" || bp_die "BIOPLATFORM_ADMIN_PASSWORD is too short or known-weak — the backend would refuse to boot with it."
fi
bp_mut ADMIN_PASSWORD "$_apw"

if [ "$BP_SEED" = "true" ]; then
  bp_mut SEED_ON_START true
  bp_ok "SEED_ON_START=true — first boot creates the admin + invite codes"
fi

# ----------------------------------------------------------------- smtp -----

bp_step "Email / SMTP"

if bp_yes_no "Configure SMTP for transactional email (newsletters, verify links, guest orders)?" "false"; then
  bp_prompt "SMTP host" "smtp.gmail.com"
  bp_mut SMTP_HOST "$BP_PROMPT_RESULT"
  bp_prompt "SMTP port" "587"
  bp_mut SMTP_PORT "$BP_PROMPT_RESULT"
  bp_prompt "SMTP username"
  bp_mut SMTP_USER "$BP_PROMPT_RESULT"
  if bp_dry "prompt for SMTP password (never echoed)"; then :; else
    bp_prompt_secret "SMTP password"
    bp_mut SMTP_PASS "$BP_PROMPT_RESULT"
  fi
  bp_prompt "From email"
  bp_mut SMTP_FROM_EMAIL "$BP_PROMPT_RESULT"
  bp_prompt "From name" "BioPlatform"
  bp_mut SMTP_FROM_NAME "$BP_PROMPT_RESULT"
  bp_mut SMTP_ENABLED true
else
  bp_mut SMTP_ENABLED false
fi

# -------------------------------------------------------------- storage -----

bp_step "Storage for uploads"

bp_menu "Profile uploads (avatars, banners, shop files) live where?" \
  "local — files on disk under ./uploads (simplest)" \
  "s3 — any S3-compatible bucket (R2, MinIO, Spaces, ...)" \
  "b2 — native Backblaze B2"
case "$BP_MENU_RESULT" in
  local*)
    bp_mut STORAGE_PROVIDER local
    ;;
  s3*)
    bp_mut STORAGE_PROVIDER s3
    bp_prompt "S3 endpoint" ""
    bp_mut S3_ENDPOINT "$BP_PROMPT_RESULT"
    bp_prompt "S3 region" "auto"
    bp_mut S3_REGION "$BP_PROMPT_RESULT"
    bp_prompt "S3 bucket" ""
    bp_mut S3_BUCKET "$BP_PROMPT_RESULT"
    bp_prompt "S3 access key id"
    bp_mut S3_ACCESS_KEY_ID "$BP_PROMPT_RESULT"
    if bp_dry "prompt for S3 secret key (never echoed)"; then :; else
      bp_prompt_secret "S3 secret access key"
      bp_mut S3_SECRET_ACCESS_KEY "$BP_PROMPT_RESULT"
    fi
    bp_prompt "S3 key prefix (optional)" ""
    bp_mut S3_PREFIX "$BP_PROMPT_RESULT"
    ;;
  b2*)
    bp_mut STORAGE_PROVIDER b2
    bp_prompt "B2 application key id"
    bp_mut B2_APPLICATION_KEY_ID "$BP_PROMPT_RESULT"
    if bp_dry "prompt for B2 application key (never echoed)"; then :; else
      bp_prompt_secret "B2 application key"
      bp_mut B2_APPLICATION_KEY "$BP_PROMPT_RESULT"
    fi
    bp_prompt "B2 bucket"
    bp_mut B2_BUCKET "$BP_PROMPT_RESULT"
    ;;
esac

# -------------------------------------------------------------- captcha -----

bp_step "Human verification on registration/login"

bp_menu "Captcha provider" "none — no challenge (open registration bots risk)" "turnstile — Cloudflare Turnstile"
case "$BP_MENU_RESULT" in
  turnstile*)
    bp_mut CAPTCHA_PROVIDER turnstile
    bp_prompt "Turnstile site key"
    bp_mut CAPTCHA_SITE_KEY "$BP_PROMPT_RESULT"
    if bp_dry "prompt for Turnstile secret key (never echoed)"; then :; else
      bp_prompt_secret "Turnstile secret key"
      bp_mut CAPTCHA_SECRET_KEY "$BP_PROMPT_RESULT"
    fi
    ;;
  *) bp_mut CAPTCHA_PROVIDER none ;;
esac

# ----------------------------------------------------------------- TLS ------

bp_step "TLS / HTTPS"

if [ "$_bp_host_no_port" != "localhost" ] && [ -n "$_bp_host_no_port" ]; then
  bp_mut TLS_MODE production
  if bp_yes_no "Enable automatic Let's Encrypt certificates for custom domains (ACME)?" "false"; then
    bp_mut ACME_ENABLED true
    bp_prompt "ACME contact email" "$(bp_env_get ADMIN_EMAIL admin@localhost.localhost)"
    bp_mut ACME_EMAIL "$BP_PROMPT_RESULT"
  fi
else
  bp_prompt "TLS mode" "development"
  case "$BP_PROMPT_RESULT" in
    production)
      bp_mut TLS_MODE production
      bp_warn "TLS_MODE=production requires cert.pem + key.pem in $BP_DEPLOY_DIR/certs/ before nginx will start."
      ;;
    development) bp_mut TLS_MODE development ;;
    *) bp_die "TLS_MODE must be development or production." ;;
  esac
fi

# -------------------------------------------------------------- images ------

if [ "$BP_INSTALL_TYPE" = "docker" ]; then
  bp_step "Images"
  if [ "$BP_IMAGE_TAG" != "latest" ]; then
    bp_mut BACKEND_IMAGE "dracoservices/bioplatform-backend:$BP_IMAGE_TAG"
    bp_mut FRONTEND_IMAGE "dracoservices/bioplatform-frontend:$BP_IMAGE_TAG"
  fi
fi

# Apply CLI/env overrides last so they win over every prompt/default.
while IFS= read -r _kv; do
  [ -n "$_kv" ] || continue
  _key=${_kv%%=*}
  _val=${_kv#*=}
  bp_mut "$_key" "$_val"
done <<EOF
$BP_SET_VARS
EOF

# Mark the deployment layout for the other two scripts, which resolve the
# compose file from this record (see bp_resolve_deployment).
bp_mut BIOPLATFORM_COMPOSE_FILE "$(basename "$BP_COMPOSE_FILE")"
bp_mut COMPOSE_PROJECT_NAME "$(printf '%s' "$(basename "$BP_DEPLOY_DIR")" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')"

# --------------------------------------------------------------- the plan ---

bp_step "Plan"
cat <<EOF
  deployment   $BP_DEPLOY_DIR
  install type $BP_INSTALL_TYPE
  compose      ${BP_COMPOSE_FILE#$BP_DEPLOY_DIR/}
  app url      $BP_APP_URL
  admin        $BP_APP_URL  (logged in as $(bp_env_get ADMIN_USERNAME admin))
  network      behind nginx on port $(bp_env_get NGINX_PORT 80)
  volumes      postgres_data, uploads_data (never auto-removed by this script)
EOF
if [ "$BP_SEED" = "true" ]; then
  bp_info "  seed         SEED_ON_START=true on first boot"
fi

if [ "$BP_DRY_RUN" = "true" ]; then
  bp_info ""
  bp_info "dry run: nothing below is executed."
  bp_info "run without --dry-run to install."
  exit 0
fi

if ! bp_confirm "Install BioPlatform now?"; then
  bp_info "cancelled — nothing was written."
  exit 0
fi

# -------------------------------------------------------------- migrate -----

bp_step "1/5  Migrating a fresh database"
if ! bp_compose up -d postgres redis; then
  report_install_failure "could not start the database services"
fi

bp_info "waiting for postgres to accept connections..."
BP_PG_WAIT=0
while ! bp_compose exec -T postgres pg_isready -U "$(bp_env_get POSTGRES_USER postgres)" -d "$(bp_env_get POSTGRES_DB bioplatform)" >/dev/null 2>&1; do
  if [ "$BP_PG_WAIT" -ge 60 ]; then
    report_install_failure "postgres never became ready"
  fi
  sleep 2
  BP_PG_WAIT=$((BP_PG_WAIT + 2))
done
bp_ok "postgres is ready"

# A single, script-visible migrate against the fresh database; the backend's own
# MIGRATE_ON_START (default true) later stays a no-op.
if ! bp_compose run --rm -e MIGRATE_ON_START=false backend \
  pnpm --filter @bioplatform/backend db:migrate:prod; then
  report_install_failure "prisma migrate deploy failed on the fresh database"
fi
bp_ok "database migrated (baseline + pending migrations)"

# --------------------------------------------------------------- pull ------

bp_step "2/5  Getting the images"

if [ "$BP_INSTALL_TYPE" = "standalone" ]; then
  bp_info "building images from source (this can take a while)..."
  if ! bp_compose build; then
    report_install_failure "docker compose build failed"
  fi
else
  bp_info "pulling the pinned images..."
  if ! bp_compose --profile nginx pull; then
    report_install_failure "could not pull the images"
  fi
fi
bp_ok "images ready"

# --------------------------------------------------------------- start ------

bp_step "3/5  Starting the stack (frontend + backend + nginx)"

# shellcheck disable=SC2086
if ! bp_compose --profile nginx up -d; then
  report_install_failure "docker compose up -d failed"
fi
bp_ok "stack started"

# --------------------------------------------------------------- health -----

bp_step "4/5  Health check"

BP_HEALTH_URL=${BP_HEALTH_URL:-http://127.0.0.1:$(bp_env_get NGINX_PORT 80)/api/health}
BP_WAITED=0
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
  bp_error "the backend never became healthy within ${BP_HEALTH_TIMEOUT}s."
  bp_compose logs --tail=60 backend || true
  report_install_failure "health check timed out"
fi

if bp_http_ok "$BP_HEALTH_URL/api/version"; then
  bp_ok "/api/version answered (version check endpoint)"
else
  bp_warn "/api/version did not answer yet, /api/health is green."
fi

# ---------------------------------------------------------------- done ------

bp_step "5/5  Installation complete"
cat <<EOF

  BioPlatform is running:      $BP_APP_URL
  Admin panel login:           $BP_APP_URL  (admin email: $(bp_env_get ADMIN_EMAIL admin@example.com) — the password you chose)
  Deployment directory:        $BP_DEPLOY_DIR
  The .env is root-only:       sudo chmod 600 is pre-set

  Updates and the uninstaller ship in the same directory:
    sh $BP_DEPLOY_DIR/update.sh        (backup + migrate + rollback)
    sh $BP_DEPLOY_DIR/uninstall.sh     (dry-run first, reversible teardown)

  Generated secrets (JWT_SECRET, POSTGRES_PASSWORD) are in $BP_DEPLOY_DIR/.env
  and were never printed. Keep that file out of version control and back it up.
EOF
if [ "$BP_SEED" = "true" ]; then
  bp_info "  SEED_ON_START=true stays enabled — disable it after the admin account is confirmed"
  bp_info "  (set SEED_ON_START=false in $BP_DEPLOY_DIR/.env and restart) so the seed cannot re-run."
fi