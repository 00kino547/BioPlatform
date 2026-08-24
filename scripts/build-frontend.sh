#!/bin/sh
set -e

echo "==> Building Frontend Image"
docker build -t dracoservices/bioplatform-frontend -f apps/frontend/Dockerfile .

echo "==> Image complete!!!"