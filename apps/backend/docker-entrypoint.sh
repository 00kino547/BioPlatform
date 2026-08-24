#!/bin/sh
set -eu

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START is enabled — running database seed..."
  pnpm --filter @bioplatform/backend db:seed || echo "Warning: seed failed (database may already be initialized)"
fi

exec "$@"
