# Build stage
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

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

# Copy built files to Nginx
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Runtime configuration: regenerates env.js and patches index.html
# placeholders from VITE_* environment variables on every start
COPY apps/frontend/docker-entrypoint.sh /docker-entrypoint.d/50-runtime-env.sh
RUN chmod +x /docker-entrypoint.d/50-runtime-env.sh

# Copy Nginx configuration for SPA
RUN echo 'server { \
    listen 80; \
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

CMD ["nginx", "-g", "daemon off;"]
