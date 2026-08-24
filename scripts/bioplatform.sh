#!/bin/sh
set -e
docker compose exec -T backend bioplatform "$@"
