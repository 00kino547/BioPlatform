#!/bin/sh
# BioPlatform operator scripts — interactive installer/uninstaller helpers.
#
# The second half of the composable installer contract. `bioplatform-common.sh`
# holds the shared preflight / deployment resolution / logging used by every
# script; this file holds the stuff only install.sh and uninstall.sh need — the
# TUI building blocks (menus, prompts, secrets, typed confirmation), the
# port/disk/root preflight checks, the .env editor and the checksum
# verification. update.sh does not source this file: it stays on common + backup
# so its pinned piped form keeps fetching exactly two helpers.
#
# Everything is POSIX sh (`/bin/sh`), matching the scripts that source it.
#
# Two behaviours every function here shares:
#
#   - BP_ASSUME_YES (set by `-y`/`--yes`) means "do not ask, take the default".
#     Prompts fall back to their default; confirmations never block.
#   - a non-terminal stdin is treated as automation: secrets refuse to be read,
#     text prompts fall back to their default when one exists and die with an
#     actionable message otherwise, and confirmations are refused unless
#     BP_ASSUME_YES is set (mirroring bp_confirm in bioplatform-common.sh).

# ------------------------------------------------------------- TUI core ----

# bp_prompt <question> [default]
#
# Text prompt. A default (if any) is printed in square brackets and returned on
# an empty answer. Returns 0 with the value in BP_PROMPT_RESULT, or 1 when the
# read failed (EOF). In automation (no tty, or --yes) the default is taken
# without asking; a question with no default yields an empty value with a note
# on stderr (some prompts are legitimately optional — e.g. an empty invite-pack
# list closes the store — so the caller may pass --set KEY=VALUE to pin one).
bp_prompt() {
  BP_PROMPT_RESULT=
  _q=$1
  _d=${2:-}

  if [ "${BP_ASSUME_YES:-false}" = "true" ] || [ ! -t 0 ]; then
    if [ -n "$_d" ]; then
      BP_PROMPT_RESULT=$_d
      return 0
    fi
    printf 'note: no default for "%s" and no terminal — using an empty value; override with --set <KEY>=<VALUE> if needed.\n' "$_q" >&2
    BP_PROMPT_RESULT=
    return 0
  fi

  while :; do
    printf '%s' "$_q"
    [ -n "$_d" ] && printf ' [%s]' "$_d"
    printf ' '
    read -r _answer || return 1
    if [ -z "$_answer" ] && [ -n "$_d" ]; then
      BP_PROMPT_RESULT=$_d
      return 0
    fi
    if [ -n "$_answer" ]; then
      BP_PROMPT_RESULT=$_answer
      return 0
    fi
    bp_error "a value is required."
  done
}

# bp_prompt_secret <question> [confirm-question]
#
# Password prompt with echo turned off; when a confirm question is given the
# value is read a second time and must match. Never echoes the value, never
# writes it to the trace file. Always restores the terminal echo, including on
# SIGINT / ERR / EXIT. Returns the value in BP_PROMPT_RESULT.
bp_prompt_secret() {
  BP_PROMPT_RESULT=
  _q=$1
  _c=${2:-}

  if [ "${BP_ASSUME_YES:-false}" = "true" ] || [ ! -t 0 ]; then
    bp_die "cannot read a secret without a terminal. Supply it as an environment variable and re-run on a TTY."
  fi
  command -v stty >/dev/null 2>&1 || bp_die "stty is required for secret prompts but is not installed."

  _restore_echo() {
    stty echo 2>/dev/null || true
    trap - INT TERM HUP QUIT EXIT
  }
  trap _restore_echo INT TERM HUP QUIT EXIT

  stty -echo
  printf '%s' "$_q"
  read -r BP_PROMPT_RESULT || { printf '\n'; _restore_echo; return 1; }
  printf '\n'
  _restore_echo

  [ -n "$BP_PROMPT_RESULT" ] || { bp_error "a value is required."; return 1; }

  if [ -n "$_c" ]; then
    trap _restore_echo INT TERM HUP QUIT EXIT
    stty -echo
    printf '%s' "$_c"
    read -r _again || { printf '\n'; _restore_echo; return 1; }
    printf '\n'
    _restore_echo
    [ "$BP_PROMPT_RESULT" = "$_again" ] || { bp_error "the two entries do not match — start over."; return 1; }
  fi

  return 0
}

# bp_validate_password <value>
#
# Returns 0 only for a password this installer is willing to write: at least 12
# characters and not one of the values the backend itself rejects in production
# (mirrors KNOWN_WEAK_ADMIN_PASSWORDS + the scaffold in
# apps/backend/src/config/env.ts — the guard must never bless something the
# platform then refuses to boot with).
bp_validate_password() {
  _pw=$1
  [ "${#_pw}" -ge 12 ] || return 1
  case "$_pw" in
    admin123456 | admin1234567 | admin12345678 | admin123456789 | admin1234567890 | admin1234567890123456 | 'Admin123456!' | password | password123456 | admin-scaffold-change-me)
      return 1
      ;;
  esac
  return 0
}

# bp_menu <title> <entry>...
#
# Numbered choice menu (the Pterodactyl-installer style), one entry per argument
# in `label — description` form. Loops until a valid number is chosen. Returns
# the chosen label in BP_MENU_RESULT and its 1-based index in BP_MENU_INDEX.
# `--yes` / non-tty selects entry 1 (the recommended default is always first).
bp_menu() {
  BP_MENU_RESULT=
  BP_MENU_INDEX=
  _title=$1
  shift
  _n=0
  for _e in "$@"; do
    _n=$((_n + 1))
  done
  [ "$_n" -ge 1 ] || return 2

  if [ "${BP_ASSUME_YES:-false}" = "true" ] || [ ! -t 0 ]; then
    BP_MENU_RESULT=$1
    BP_MENU_INDEX=1
    return 0
  fi

  bp_info ""
  bp_info "$_title"
  _i=0
  for _e in "$@"; do
    _i=$((_i + 1))
    bp_info "  ${BP_C_GREEN}[ $_i ]${BP_C_RESET} ${_e}"
  done
  bp_info ""

  while :; do
    printf 'Choose an option [1-%s]: ' "$_n"
    read -r _answer || return 1
    case "$_answer" in
      '' | *[!0-9]*)
        bp_error "enter a number between 1 and $_n."
        continue
        ;;
    esac
    if [ "$_answer" -ge 1 ] 2>/dev/null && [ "$_answer" -le "$_n" ] 2>/dev/null; then
      _i=0
      BP_MENU_INDEX=$_answer
      for _e in "$@"; do
        _i=$((_i + 1))
        [ "$_i" = "$_answer" ] && BP_MENU_RESULT=$_e
      done
      return 0
    fi
    bp_error "enter a number between 1 and $_n."
  done
}

# bp_confirm_type <expected> <question>
#
# A confirmation that cannot be rubber-stamped with `--yes` or by pressing
# enter: the operator must TYPE the exact value (the deployment path) to
# proceed. Used before anything irreversible, as required by the uninstaller
# contract. Returns 0 only on an exact match.
bp_confirm_type() {
  _expected=$1
  _q=$2

  if [ ! -t 0 ]; then
    bp_die "refusing an irreversible action without a terminal: $_q"
  fi

  bp_warn "this action cannot be undone by this script."
  bp_info "To continue you must type exactly:"
  bp_info "  $_expected"
  printf '%s> ' "$_q"
  read -r _answer || return 1
  [ "$_answer" = "$_expected" ]
}

# bp_yes_no <question> <default: true|false>
#
# Yes/no prompt where <default> is what `--yes` and non-tty sessions produce.
# Returns 0 (yes) or 1 (no).
bp_yes_no() {
  _q=$1
  _d=${2:-false}

  if [ "${BP_ASSUME_YES:-false}" = "true" ] || [ ! -t 0 ]; then
    [ "$_d" = "true" ]
    return $?
  fi

  if [ "$_d" = "true" ]; then
    _hint="[Y/n]"
    _match='[nN]*'
  else
    _hint="[y/N]"
    _match='[yY]*'
  fi

  while :; do
    printf '%s %s: ' "$_q" "$_hint"
    read -r _answer || return 1
    case "$_answer" in
      '') [ "$_d" = "true" ]; return $? ;;
      $_match) return 0 ;;
      *) return 1 ;;
    esac
  done
}

# ----------------------------------------------------------- preflight ------

# bp_is_root
#
# True when the effective uid is 0. Docker installs normally do not need root
# (the docker group is enough) but writing under e.g. /srv may, so the scripts
# call this to tailor the deploy-dir check rather than to gate the whole run.
bp_is_root() {
  [ "$(id -u 2>/dev/null || true)" = "0" ]
}

# bp_check_ports <port>...
#
# Appends every port that is already listening to BP_BUSY_PORTS (space
# separated). Uses lsof, then ss, then netstat; when none of them exists it
# warns and returns 0, because the stack itself will then fail loudly on a busy
# bind and the installer's rollback path handles that.
bp_check_ports() {
  BP_BUSY_PORTS=""

  if command -v lsof >/dev/null 2>&1; then
    for _p in "$@"; do
      [ -n "$_p" ] || continue
      case "$_p" in *[!0-9]*) continue ;; esac
      if lsof -nP -iTCP:"$_p" -sTCP:LISTEN >/dev/null 2>&1; then
        BP_BUSY_PORTS="$BP_BUSY_PORTS $_p"
      fi
    done
  elif command -v ss >/dev/null 2>&1; then
    _listening=$(ss -H -ltn 2>/dev/null || true)
    for _p in "$@"; do
      [ -n "$_p" ] || continue
      case "$_p" in *[!0-9]*) continue ;; esac
      if printf '%s\n' "$_listening" | grep -qE ":${_p}([[:space:]]|\$)"; then
        BP_BUSY_PORTS="$BP_BUSY_PORTS $_p"
      fi
    done
  elif command -v netstat >/dev/null 2>&1; then
    _listening=$( (netstat -ltn 2>/dev/null || netstat -an 2>/dev/null) | tail -n +2 || true)
    for _p in "$@"; do
      [ -n "$_p" ] || continue
      case "$_p" in *[!0-9]*) continue ;; esac
      if printf '%s\n' "$_listening" | grep -qE ":${_p}([[:space:]]|\$)"; then
        BP_BUSY_PORTS="$BP_BUSY_PORTS $_p"
      fi
    done
  else
    bp_warn "no ss / netstat / lsof found — cannot verify free ports; the stack will fail loudly on a conflict."
  fi

  BP_BUSY_PORTS=${BP_BUSY_PORTS# }
}

# bp_check_disk_free <dir> <min-mb>
#
# Sets BP_DISK_FREE_MB and returns 0 when at least <min-mb> MiB are free on the
# filesystem holding <dir>. Returns 0 (but warns) when df is unavailable, so a
# minimal host is never hard-blocked on an estimate it cannot make.
bp_check_disk_free() {
  _dir=$1
  _min=${2:-2048}
  BP_DISK_FREE_MB=0

  command -v df >/dev/null 2>&1 || {
    bp_warn "df unavailable — cannot verify free disk space before installing."
    return 0
  }
  [ -d "$_dir" ] || _dir=$(dirname "$_dir" 2>/dev/null || printf '%s' .)

  _kb=$(df -Pk "$_dir" 2>/dev/null | awk 'NR==2{print $4}')
  case "$_kb" in '' | *[!0-9]*) return 0 ;; esac
  BP_DISK_FREE_MB=$((_kb / 1024))
  [ "$BP_DISK_FREE_MB" -ge "$_min" ]
}

# ------------------------------------------------------------- .env edit ----

# bp_env_escape <value>
#
# Prints the value escaped for use as a sed replacement string ($0-safe: backslash
# and & are the only sed-special characters on the right-hand side).
bp_env_escape() {
  printf '%s' "$1" | sed 's/[\\&]/\\&/g'
}

# bp_env_set <file> <key> <value>
#
# Sets KEY=VALUE in an env file, in place. Updates the existing KEY= line (also
# when it was written as `export KEY=`) or appends a new line when the key is
# absent, so a generated .env can overlay the shipped .env.example without
# losing any other variable or comment. Values with whitespace or a `#` are
# written double-quoted; anything else stays bare.
bp_env_set() {
  _file=$1
  _key=$2
  _value=$3
  [ -f "$_file" ] || return 1
  [ -n "$_key" ] || return 1
  case "$_value" in
    *'"'*) bp_error "refusing to write a value containing a double quote: $_key."; return 1 ;;
  esac

  case "$_value" in
    *[[:space:]]* | *'#'*) _line="$_key=\"$_value\"" ;;
    *) _line="$_key=$_value" ;;
  esac

  if grep -qE "^[[:space:]]*(export[[:space:]]+)?${_key}[[:space:]]*=" "$_file"; then
    _escaped=$(bp_env_escape "$_line")
    sed -i "s~^[[:space:]]*\(export[[:space:]]\+\)\?${_key}[[:space:]]*=.*~$_escaped~" "$_file"
  else
    printf '\n%s\n' "$_line" >>"$_file"
  fi
  return 0
}

# bp_env_unset <file> <key>
#
# Removes a KEY= / `export KEY=` line entirely.
bp_env_unset() {
  _file=$1
  _key=$2
  [ -f "$_file" ] || return 0
  sed -i "/^[[:space:]]*\(export[[:space:]]\+\)\?${_key}[[:space:]]*=/d" "$_file"
}

# --------------------------------------------------------------- secrets ----

# bp_random_hex <bytes>
#
# Cryptographically random hex string of <bytes> bytes (2x characters). Used for
# JWT_SECRET and the PostgreSQL password — values that are written to .env but
# never printed.
bp_random_hex() {
  _n=${1:-32}
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$_n" 2>/dev/null && return 0
  fi
  od -An -tx1 -N "$_n" /dev/urandom 2>/dev/null | tr -d ' \n' && return 0
  bp_die "no source of randomness available (needs openssl or od)."
}

# bp_random_token <chars>
#
# Alphanumeric random string (no lookalikes, newline-free) for operator-chosen
# secrets that will be printed back (the bootstrap admin password in
# non-interactive installs). Openssl preferred, /dev/urandom fallback.
bp_random_token() {
  _n=${1:-24}
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$_n" 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c "$_n" && return 0
  fi
  tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c "$_n"
}

# -------------------------------------------------------------- checksum ----

# bp_sha256 <file>
#
# Hex SHA-256 of a file, from whichever tool the host has.
bp_sha256() {
  _file=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$_file" 2>/dev/null | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$_file" 2>/dev/null | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$_file" 2>/dev/null | sed 's/^.*= //'
  else
    return 1
  fi
}

# bp_verify_self_checksum <script-file> [sha256-file]
#
# Verifies that <script-file> matches a published SHA-256. The expected value is
# taken, in order, from BIOPLATFORM_SHA256, the `--checksum` value already stored
# in BP_EXPECTED_SHA256, or the optional <sha256-file> (which must contain a
# bare `SHA256 path` line). Behaviour:
#   - expected present and matching  -> 0 ("verified")
#   - expected present, mismatch     -> 1 (the caller MUST abort)
#   - no expected value available    -> 2 ("nothing to verify against"), so
#                                       callers can warn honestly instead of
#                                       pretending the script was verified
bp_verify_self_checksum() {
  _file=$1
  _sha_file=${2:-}
  [ -f "$_file" ] || return 1

  _expected=${BIOPLATFORM_SHA256:-${BP_EXPECTED_SHA256:-}}
  if [ -z "$_expected" ] && [ -n "$_sha_file" ] && [ -f "$_sha_file" ]; then
    _expected=$(awk '{print $1}' "$_sha_file" | head -n 1)
  fi
  [ -n "$_expected" ] || return 2

  _actual=$(bp_sha256 "$_file") || { bp_error "cannot compute the script's own SHA-256."; return 1; }
  [ "$_actual" = "$_expected" ]
}

# ----------------------------------------------------------------- fetch ----

# bp_fetch <url> <destination>
#
# Downloads a file with curl or wget (the same pair the updater already relies
# on). Every file an installer acts on — compose files, nginx config, .env
# example, helper libraries, the checksum — goes through this one function, so
# "never execute anything it did not fetch itself" has exactly one code path.
bp_fetch() {
  _url=$1
  _dest=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --create-dirs "$_url" -o "$_dest"
  elif command -v wget >/dev/null 2>&1; then
    mkdir -p "$(dirname "$_dest")"
    wget -qO "$_dest" "$_url"
  else
    bp_error "neither curl nor wget is available."
    return 1
  fi
}

# bp_fetch_string <url>
#
# Downloads a small file to stdout (used for the checksum and single-line
# queries where a temp file would be noise).
bp_fetch_string() {
  _url=$1
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --max-time 15 "$_url" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -qT 15 -O - "$_url" 2>/dev/null
  fi
}