#!/bin/sh
set -e

## Frontend Image
./scripts/build-frontend.sh
## Backend Image
./scripts/build-backend.sh