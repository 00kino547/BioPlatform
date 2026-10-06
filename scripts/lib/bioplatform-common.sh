#!/bin/sh
# BioPlatform operator scripts — shared helpers.
#
# Sourced by `update.sh` (repo root) and, by design, by `install.sh` /
# `uninstall.sh` when they land: the three flows must not drift, so everything
# they have in common lives here instead of being copy-pasted. Adding a helper
# here is the only change needed to make it available to every script.
#
# Everything is POSIX sh (`/bin/sh`) so the scripts work when piped straight
# from `curl ... | sh` on Alpine, Debian/Ubuntu and macOS without a bash
# dependency, and inside the project's own containers.

# --------------------------------------------------------------- logging ----

# Colour only when stdout is a terminal: the same scripts run in CI and in
# `curl | sh` pipelines where escape codes would end up in a log file.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BP_C_RESET='\033[0m'
  BP_C_RED='\033[31m'
  BP_C_GREEN='\033[32m'
  BP_C_YELLOW='\033[33m'
  BP_C_BLUE='\033[34m'
else
  BP_C_RESET=''
  BP_C_RED=''
  BP_C_GREEN=''
  BP_C_YELLOW=''
  BP_C_BLUE=''
fi

bp_info() { printf '%s\n' "$*"; }
bp_step() { printf '%s==>%s %s\n' "$BP_C_BLUE" "$BP_C_RESET" "$*"; }
bp_ok() { printf '%s  ok%s %s\n' "$BP_C_GREEN" "$BP_C_RESET" "$*"; }
bp_warn() { printf '%swarning:%s %s\n' "$BP_C_YELLOW" "$BP_C_RESET" "$*" >&2; }
bp_error() { printf '%serror:%s %s\n' "$BP_C_RED" "$BP_C_RESET" "$*" >&2; }
bp_die() { bp_error "$@"; exit 1; }

# ----------------------------------------------------------- tracing hook ---
#
# `BP_TRACE_FILE`, when set, receives one line per externally-visible operation
# in execution order. It exists so the regression tests can assert the thing that
# matters most about this script — that the verified backup happens BEFORE any
# migration and before the stack is recreated — from the recorded order of real
# operations rather than from the source text. Empty in normal use.

bp_trace() {
  [ -n "${BP_TRACE_FILE:-}" ] || return 0
  printf '%s\n' "$*" >>"$BP_TRACE_FILE"
}

# ------------------------------------------------------------- preflight ----

bp_have() { command -v "$1" >/dev/null 2>&1; }

# Docker Engine + Compose v2 are the only hard requirements; everything else is
# reported as a warning so an unusual-but-working host is never blocked.
bp_require_docker() {
  bp_have docker || bp_die "docker is not installed or not on PATH. Install Docker Engine (https://docs.docker.com/engine/install/)."

  if ! docker compose version >/dev/null 2>&1; then
    bp_die "'docker compose' (Compose v2) is not available. Update Docker or install the compose plugin."
  fi

  if ! docker info >/dev/null 2>&1; then
    bp_die "the Docker daemon is not reachable. Start Docker (or add your user to the docker group) and retry."
  fi

  bp_ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?'), compose $(docker compose version --short 2>/dev/null || echo '?')"
}

# --------------------------------------------------------- deployment ------

# bp_resolve_deployment <dir>
#
# Works out which compose file, env file and compose project a deployment uses,
# and exports the answers as BP_DEPLOY_DIR / BP_COMPOSE_FILE / BP_ENV_FILE /
# BP_COMPOSE_PROJECT. Detection order, most explicit first:
#
#   1. the flags the operator passed (--compose-file / --env-file)
#   2. $BIOPLATFORM_COMPOSE_FILE (for scripted/cron use)
#   3. docker-compose.prebuilt.yml when it exists (the published-image layout,
#      which is what `curl | sh` installs and what a deployment directory copied
#      from a release contains)
#   4. docker-compose.yml (the source-build layout)
#
# COMPOSE_PROJECT_NAME wins over the directory name, because that is what
# Compose itself does: an operator who set it is already running their stack
# under that name and every `up`/`down` must agree with it.
bp_resolve_deployment() {
  BP_DEPLOY_DIR=$1
  [ -d "$BP_DEPLOY_DIR" ] || bp_die "deployment directory not found: $BP_DEPLOY_DIR"

  BP_DEPLOY_DIR=$(cd "$BP_DEPLOY_DIR" && pwd)

  if [ -n "${BP_COMPOSE_FILE_OVERRIDE:-}" ]; then
    BP_COMPOSE_FILE=$BP_COMPOSE_FILE_OVERRIDE
    [ -f "$BP_COMPOSE_FILE" ] || bp_die "compose file not found: $BP_COMPOSE_FILE"
    BP_COMPOSE_FILE=$(cd "$(dirname "$BP_COMPOSE_FILE")" && pwd)/$(basename "$BP_COMPOSE_FILE")
  elif [ -n "${BIOPLATFORM_COMPOSE_FILE:-}" ]; then
    BP_COMPOSE_FILE=$BIOPLATFORM_COMPOSE_FILE
    [ -f "$BP_COMPOSE_FILE" ] || bp_die "BIOPLATFORM_COMPOSE_FILE does not exist: $BP_COMPOSE_FILE"
  elif [ -f "$BP_DEPLOY_DIR/docker-compose.prebuilt.yml" ]; then
    BP_COMPOSE_FILE=$BP_DEPLOY_DIR/docker-compose.prebuilt.yml
  elif [ -f "$BP_DEPLOY_DIR/docker-compose.yml" ]; then
    BP_COMPOSE_FILE=$BP_DEPLOY_DIR/docker-compose.yml
  else
    bp_die "no docker-compose.prebuilt.yml or docker-compose.yml in $BP_DEPLOY_DIR — is this the BioPlatform deployment directory?"
  fi

  if [ -n "${BP_ENV_FILE_OVERRIDE:-}" ]; then
    BP_ENV_FILE=$BP_ENV_FILE_OVERRIDE
  else
    BP_ENV_FILE=$BP_DEPLOY_DIR/.env
  fi

  BP_COMPOSE_PROJECT=$(bp_env_get COMPOSE_PROJECT_NAME)
  if [ -z "$BP_COMPOSE_PROJECT" ]; then
    # Same rule Compose applies to a directory name: lowercase, alphanumerics
    # and dashes only. Only used for display — Compose re-derives it itself.
    BP_COMPOSE_PROJECT=$(printf '%s' "$BP_DEPLOY_DIR" | sed -e 's,/*$,,' -e 's,.*/,,' | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')
  fi
}

# bp_env_get <KEY> [default]
#
# Minimal .env reader: KEY=VALUE lines, `#` comments, optional `export`, CRLF
# tolerant. Deliberately NOT a general dotenv parser — it exists to answer
# questions like "what is COMPOSE_PROJECT_NAME / POSTGRES_DB / BACKEND_HOST_PORT",
# never to interpret a value for a command.
bp_env_get() {
  _key=$1
  _default=${2:-}
  [ -f "${BP_ENV_FILE:-}" ] || { printf '%s' "$_default"; return 0; }

  _value=$(sed -n \
    -e 's/\r$//' \
    -e "s/^[[:space:]]*export[[:space:]]\+${_key}[[:space:]]*=//p" \
    -e "s/^[[:space:]]*${_key}[[:space:]]*=//p" \
    "$BP_ENV_FILE" 2>/dev/null | tail -n 1)

  # Strip one layer of matching surrounding quotes; drop trailing comments on
  # unquoted values.
  case "$_value" in
    \"*\") _value=${_value#\"}; _value=${_value%\"} ;;
    \'*\') _value=${_value#\'}; _value=${_value%\'} ;;
    *) _value=${_value%%[[:space:]]#*} ;;
  esac

  if [ -z "$_value" ]; then printf '%s' "$_default"; else printf '%s' "$_value"; fi
}

# bp_compose <args...>
#
# The ONLY way these scripts touch Docker Compose. It injects the deployment
# directory, the detected compose file and the env file so every call targets
# the same stack, and records the call in the trace. `bp_compose` streams
# output to the terminal; `bp_compose_capture` returns stdout instead (used for
# `ps`/`inspect` queries).
bp_compose() {
  _bp_c_args="--project-directory $BP_DEPLOY_DIR -f $BP_COMPOSE_FILE"
  [ -f "$BP_ENV_FILE" ] && _bp_c_args="$_bp_c_args --env-file $BP_ENV_FILE"

  bp_trace "compose $*"

  if [ "${BP_DRY_RUN:-false}" = "true" ]; then
    printf '  [dry-run] docker compose %s %s\n' "$_bp_c_args" "$*"
    return 0
  fi

  # shellcheck disable=SC2086
  docker compose $_bp_c_args "$@"
}

bp_compose_capture() {
  _bp_c_args="--project-directory $BP_DEPLOY_DIR -f $BP_COMPOSE_FILE"
  [ -f "$BP_ENV_FILE" ] && _bp_c_args="$_bp_c_args --env-file $BP_ENV_FILE"

  # shellcheck disable=SC2086
  docker compose $_bp_c_args "$@"
}

# Confirm with the operator. `--yes` sets BP_ASSUME_YES; a non-interactive stdin
# (CI, cron, `curl | sh` with no tty) also implies yes only when the caller has
# explicitly opted in with BP_ASSUME_YES, because silently assuming consent to a
# database migration is exactly the wrong default.
bp_confirm() {
  _question=$1

  if [ "${BP_ASSUME_YES:-false}" = "true" ]; then
    bp_info "  --yes given, proceeding without asking"
    return 0
  fi

  if [ ! -t 0 ]; then
    bp_die "refusing to continue without confirmation (stdin is not a terminal). Re-run with --yes, or run it interactively."
  fi

  printf '%s [y/N] ' "$_question"
  read -r _answer
  case "$_answer" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

# ------------------------------------------------------- small utilities ----

bp_human_size() {
  _bytes=${1:-0}
  if [ "$_bytes" -lt 1024 ] 2>/dev/null; then
    printf '%s B' "$_bytes"
  elif [ "$_bytes" -lt 1048576 ]; then
    printf '%s KiB' "$((_bytes / 1024))"
  else
    printf '%s MiB' "$((_bytes / 1048576))"
  fi
}

# Current time as a compact, sortable, timezone-independent stamp:
# YYYYmmdd-HHMMSS. Used for dump filenames so repeated backups never collide.
bp_timestamp() {
  date -u +%Y%m%d-%H%M%S 2>/dev/null || date +%Y%m%d-%H%M%S
}

# An HTTP GET that returns 0 only for a 2xx response. Prefers curl and falls
# back to wget so the script works on a minimal host. Honours BP_HEALTH_URL
# override so the tests can point it at a stub.
bp_http_ok() {
  _url=$1
  if bp_have curl; then
    curl -fsS --max-time 10 -o /dev/null "$_url" >/dev/null 2>&1
  elif bp_have wget; then
    wget -q -T 10 -O /dev/null "$_url" >/dev/null 2>&1
  else
    return 2
  fi
}

# Same as bp_http_ok but returns the body, for endpoints whose payload is worth
# reporting (e.g. /api/health).
bp_http_body() {
  _url=$1
  if bp_have curl; then
    curl -fsS --max-time 10 "$_url" 2>/dev/null
  else
    wget -q -T 10 -O - "$_url" 2>/dev/null
  fi
}