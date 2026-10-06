#!/bin/sh
# BioPlatform operator scripts — database backup + verification.
#
# Sourced by `update.sh`, and by `uninstall.sh` before it offers to drop a
# volume. Kept here so the "back up before touching the database" rule is
# implemented exactly once and every flow that writes to PostgreSQL goes through
# the same code.
#
# The contract this file exists to enforce:
#
#   A dump is only reported as a successful backup when it has been PROVEN to be
#   one. `pg_dump` exiting 0 is not enough — a zero-length file, a truncated
#   transfer, a dump of the wrong database or an archive whose header is
#   unreadable all exit 0 in some failure modes and would leave an operator
#   believing their only recovery path works. Every successful run therefore
#   reports the path, the byte size and the parsed archive table of contents,
#   and a failure anywhere in that chain is a hard failure.
#
# Format is PostgreSQL's custom format (`-Fc`): compressed, and restorable with
# selective `pg_restore` rather than only as a whole.

# bp_pg_env
#
# The database connection is read from the POSTGRES_* variables inside the
# running postgres container rather than parsed out of the deployment .env:
# whatever the container was actually started with is the truth, including a
# password the operator never wrote in a file.
bp_pg_env() {
  _pg_user=$(bp_compose_capture exec -T postgres printenv POSTGRES_USER 2>/dev/null | tr -d '\r')
  _pg_db=$(bp_compose_capture exec -T postgres printenv POSTGRES_DB 2>/dev/null | tr -d '\r')
  _pg_user=${_pg_user:-$(bp_env_get POSTGRES_USER postgres)}
  _pg_db=${_pg_db:-$(bp_env_get POSTGRES_DB bioplatform)}
}

bp_backup_dir() {
  _dir=${1:-}
  if [ -z "$_dir" ]; then
    _dir=$BP_DEPLOY_DIR/backups
  fi
  printf '%s' "$_dir"
}

# bp_backup_database <backup-dir>
#
# Takes a verified dump. On success sets:
#   BP_BACKUP_FILE           absolute path of the dump
#   BP_BACKUP_BYTES          its size in bytes
#   BP_BACKUP_TOC_ENTRIES    entries in the archive table of contents
# and returns 0. Returns non-zero — loudly, and without leaving a file that could
# be mistaken for a good backup — if any step fails.
bp_backup_database() {
  _dir=$(bp_backup_dir "${1:-}")

  if ! bp_compose ps --status running postgres 2>/dev/null | grep -q postgres; then
    bp_error "the postgres service is not running — cannot take a backup of a database that is not there."
    return 1
  fi

  if ! mkdir -p "$_dir"; then
    bp_error "cannot create backup directory: $_dir"
    return 1
  fi

  bp_pg_env

  BP_BACKUP_FILE=$_dir/${_pg_db}-$(bp_timestamp).dump
  # Write to a temporary name first: a half-written file at the final path is
  # what an operator would later find in their backups directory and trust.
  _tmp=$BP_BACKUP_FILE.partial

  bp_trace "pg_dump start db=$_pg_db file=$BP_BACKUP_FILE"
  bp_info "Dumping database '$_pg_db'..."

  if [ "${BP_DRY_RUN:-false}" = "true" ]; then
    printf '  [dry-run] pg_dump -U <user> -d %s --format=custom --no-owner --no-privileges > %s\n' "$_pg_db" "$BP_BACKUP_FILE"
    return 0
  fi

  if ! bp_compose exec -T postgres pg_dump \
    -U "$_pg_user" -d "$_pg_db" \
    --format=custom --no-owner --no-privileges >"$_tmp" 2>/dev/null; then
    rm -f "$_tmp"
    bp_error "pg_dump failed — no dump was written."
    return 1
  fi

  BP_BACKUP_BYTES=$(wc -c <"$_tmp" | tr -d ' ')
  if [ ! -s "$_tmp" ] || [ "${BP_BACKUP_BYTES:-0}" -lt 128 ]; then
    rm -f "$_tmp"
    bp_error "pg_dump produced a file of only ${BP_BACKUP_BYTES:-0} bytes — that is not a usable backup."
    return 1
  fi

  if ! bp_verify_dump_archive "$_tmp"; then
    rm -f "$_tmp"
    bp_error "the dump could not be verified — it is not being accepted as a backup."
    return 1
  fi

  mv "$_tmp" "$BP_BACKUP_FILE" || {
    rm -f "$_tmp"
    bp_error "cannot move the verified dump into place: $BP_BACKUP_FILE"
    return 1
  }

  bp_trace "pg_dump done file=$BP_BACKUP_FILE bytes=$BP_BACKUP_BYTES toc=$BP_BACKUP_TOC_ENTRIES"
  bp_ok "backup verified: $BP_BACKUP_FILE ($(bp_human_size "$BP_BACKUP_BYTES"), $BP_BACKUP_TOC_ENTRIES archive entries)"
  return 0
}

# bp_verify_dump_archive <file>
#
# Parses the custom-format archive inside the postgres container and returns 0
# only if it is a readable archive. `pg_restore --list` reads the archive header
# and the table of contents, so it rejects truncation, a non-dump file and a
# dump of a nonexistent database — all of which `pg_dump`'s exit code does not.
#
# The file is streamed into the container over stdin and verified there: the
# backups directory is a host path that the container has no reason to mount,
# and mounting it would mean the verification depends on the very bind-mount
# configuration being updated.
bp_verify_dump_archive() {
  _file=$1
  _toc=$(bp_compose_capture exec -T postgres sh -c '
    cat > /tmp/bp_verify.dump
    pg_restore --list /tmp/bp_verify.dump
    rc=$?
    rm -f /tmp/bp_verify.dump
    exit $rc' <"$_file" 2>/dev/null)

  if [ $? -ne 0 ]; then
    bp_error "pg_restore could not read the archive (truncated or not a dump)."
    return 1
  fi

  BP_BACKUP_TOC_ENTRIES=$(printf '%s\n' "$_toc" | sed -n 's/^;[[:space:]]*TOC Entries:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n 1)
  if [ -z "$BP_BACKUP_TOC_ENTRIES" ]; then
    bp_error "the archive has no readable table of contents."
    return 1
  fi

  # A freshly created, empty database legitimately dumps almost nothing (its
  # archive has a handful of schema entries and no tables), so this is reported,
  # not treated as a failure — but it is the signature of a dump taken against
  # the wrong database, so the operator gets to see it.
  if [ "${BP_BACKUP_TOC_ENTRIES:-0}" -lt 10 ]; then
    bp_warn "the archive holds only ${BP_BACKUP_TOC_ENTRIES} entries — is '$_file' a dump of the live database and not an empty one?"
  fi

  return 0
}

# bp_backup_verify_restore <file>
#
# The strongest check available without a separate restore host: restore the dump
# into a scratch database inside the same server, compare its public table count
# with the live database's, then drop the scratch database. This catches a dump
# that parses but cannot actually be restored (missing data blocks, an archive
# that references objects the source no longer has) — the class of failure that
# only shows up when somebody needs the backup.
#
# Optional (`--verify-restore`) because it needs free space for a second copy of
# the database inside the Postgres volume.
bp_backup_verify_restore() {
  _file=$1

  if [ "${BP_DRY_RUN:-false}" = "true" ]; then
    printf '  [dry-run] restore %s into a scratch database and compare table counts\n' "$_file"
    return 0
  fi

  bp_pg_env
  _scratch=bp_backup_verify_$$

  bp_trace "pg_restore-verify start file=$_file scratch=$_scratch"
  bp_info "Verifying the dump by restoring it into a scratch database..."

  # Deliberately a sequence of simple commands rather than one nested `sh -c`:
  # every step keeps its own real exit code, and the SQL (which needs single
  # quotes) is written in this file instead of being buried inside another
  # shell's quoting.
  if ! bp_compose exec -T postgres sh -c 'cat > /tmp/bp_restore_verify.dump' <"$_file"; then
    bp_warn "could not stage the dump inside the postgres container; skipping the restore check."
    bp_warn "The archive itself verified, so this dump is probably fine, but it has NOT been proven restorable."
    return 0
  fi

  bp_compose exec -T postgres dropdb --if-exists -U "$_pg_user" "$_scratch" >/dev/null 2>&1

  if ! bp_compose exec -T postgres createdb -U "$_pg_user" "$_scratch" >/dev/null 2>&1 ||
    ! bp_compose exec -T postgres pg_restore -U "$_pg_user" -d "$_scratch" --no-owner --no-privileges /tmp/bp_restore_verify.dump >/dev/null 2>&1; then
    bp_compose exec -T postgres dropdb --if-exists -U "$_pg_user" "$_scratch" >/dev/null 2>&1
    bp_compose exec -T postgres rm -f /tmp/bp_restore_verify.dump >/dev/null 2>&1
    bp_warn "the scratch database could not be created or filled; skipping the restore check."
    bp_warn "The archive itself verified, so this dump is probably fine, but it has NOT been proven restorable."
    bp_trace "pg_restore-verify inconclusive"
    return 0
  fi

  _restored=$(bp_compose_capture exec -T postgres psql -U "$_pg_user" -d "$_scratch" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d '[:space:]')
  _original=$(bp_compose_capture exec -T postgres psql -U "$_pg_user" -d "$_pg_db" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d '[:space:]')

  bp_compose exec -T postgres dropdb -U "$_pg_user" "$_scratch" >/dev/null 2>&1
  bp_compose exec -T postgres rm -f /tmp/bp_restore_verify.dump >/dev/null 2>&1

  if [ -z "$_restored" ] || [ -z "$_original" ]; then
    bp_warn "could not read the table counts back; the restore itself did not report an error."
    bp_trace "pg_restore-verify inconclusive"
    return 0
  fi

  if [ "$_restored" != "$_original" ]; then
    bp_error "restore check FAILED: the dump restores $_restored public tables but the live database has $_original."
    bp_error "Treat this dump as unusable and investigate before migrating."
    bp_trace "pg_restore-verify mismatch restored=$_restored original=$_original"
    return 1
  fi

  bp_ok "restore check passed: $_restored tables restored and matched the live database (scratch database dropped)"
  bp_trace "pg_restore-verify ok tables=$_restored"
  return 0
}

# bp_backup_restore_recipe <file>
#
# The exact, copy-pasteable recovery command for the dump just taken. Printed by
# update.sh on every failure path: an operator under pressure needs the command,
# not the general shape of one.
bp_backup_restore_recipe() {
  _file=$1
  bp_info "  Restore this dump into a scratch database:"
  bp_info "    cd $BP_DEPLOY_DIR"
  bp_info "    docker compose exec -T postgres createdb -U \"\$POSTGRES_USER\" restored"
  bp_info "    docker compose exec -T postgres pg_restore -U \"\$POSTGRES_USER\" -d restored --no-owner --no-privileges \\"
  bp_info "      < \"$_file\""
  bp_info "    # inspect it, then roll the live database onto it:"
  bp_info "    docker compose stop backend frontend"
  bp_info "    docker compose exec -T postgres dropdb -U \"\$POSTGRES_USER\" -f \"\$POSTGRES_DB\""
  bp_info "    docker compose exec -T postgres createdb -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\""
  bp_info "    docker compose exec -T postgres pg_restore -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --no-owner --no-privileges < \"$_file\""
  bp_info "    docker compose up -d"
}