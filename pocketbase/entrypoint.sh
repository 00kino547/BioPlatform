#!/bin/sh
# PocketBase container entrypoint. Mirrors the muchobien community image's
# convenience: if PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD are provided, ensure the
# superuser exists (idempotent upsert) before serving. Without them the server
# still starts — collection management just needs to happen another way.
set -e

BIN=/usr/local/bin/pocketbase

if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  "$BIN" superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir=/pb_data >/dev/null 2>&1 || true
fi

exec "$BIN" "$@"