# Build stage
FROM node:22-alpine AS builder

# Keep this pin identical to the backend image and to the CI gate. pnpm 11.9.0 is
# affected by CVE-2026-82392 (arbitrary code execution via path traversal),
# CVE-2026-82393 (arbitrary file write and code execution) and
# GHSA-vx52-2968-3vc6 (environment secrets exfiltrated via env-placeholder
# expansion). Those are build-time exposures — the runtime stage here is plain
# nginx and never sees pnpm — but the builder still runs `pnpm install` against
# the dependency tree, which is exactly where a malicious package would try to
# exploit them.
#
# 12.4.0 is the lowest release whose bundled toolchain is clean: pnpm ships
# node-tar and undici inside its own distribution, so 11.18.0 fixes
# CVE-2026-73566 (tar) but still carries CVE-2026-19534 (undici). 12.4.0 moves
# both past their fixed versions (tar 7.5.22 / undici 6.28.1).
RUN corepack enable && corepack prepare pnpm@12.4.0 --activate

WORKDIR /app

# Copy package files
COPY .npmrc pnpm-workspace.yaml package.json ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/

# Copy source code before install to avoid symlink conflicts
COPY apps/frontend/ apps/frontend/
COPY packages/shared/ packages/shared/

# Install dependencies
RUN pnpm install

# Build shared types first, then frontend
RUN pnpm --filter @bioplatform/shared build
RUN pnpm --filter @bioplatform/frontend build

# Production stage
FROM nginx:alpine

# Pick up fixes published to the Alpine repositories after the base image was
# built. Note that this is a point-in-time snapshot, not a live feed: Docker
# caches the result of this layer, so locally you need `docker build --pull` to
# actually see newly published packages — a cached build will happily hand you
# the same stale CVEs the registry is already reporting. That is exactly how the
# 12 HIGH nginx:alpine advisories (pcre2, libuuid, libexpat) persisted through a
# "rebuild". CI is not affected in the same way, because its cache key includes
# the base image digest, so a new base invalidates this layer.
RUN apk upgrade --no-cache

# Copy built files to Nginx
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Runtime configuration: regenerates env.js and patches index.html
# placeholders from VITE_* environment variables on every start
COPY apps/frontend/docker-entrypoint.sh /docker-entrypoint.d/50-runtime-env.sh
RUN chmod +x /docker-entrypoint.d/50-runtime-env.sh

# Copy Nginx configuration for SPA
RUN echo 'server { \
    listen 80; \
    listen [::]:80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location /assets/ { \
        try_files $uri =404; \
        add_header Cache-Control "public, max-age=31536000, immutable"; \
    } \
    location = /index.html { \
        add_header Cache-Control "no-cache"; \
    } \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
