#!/bin/sh
set -e

echo "==> Pruning old Docker images..."
docker image prune -f >/dev/null 2>&1 || true

echo "==> Pruning Docker build cache..."
docker builder prune -f >/dev/null 2>&1 || true

echo "==> Building and starting containers..."
docker compose --profile nginx up -d --build

echo "==> Done."
