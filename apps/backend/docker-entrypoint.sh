#!/bin/sh
set -eu

pnpm --filter @bioplatform/backend exec prisma db push --skip-generate
pnpm --filter @bioplatform/backend db:seed

exec "$@"
