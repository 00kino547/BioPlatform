#!/bin/sh
set -e

echo "==> Building Backend Image"
docker build -t dracoservices/bioplatform-backend -f apps/backend/Dockerfile .

echo "==> Image complete!!!"