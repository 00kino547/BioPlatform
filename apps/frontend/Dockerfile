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

# Branding build args (used by Vite for index.html + config substitution)
ARG VITE_API_URL
ARG VITE_APP_NAME
ARG VITE_APP_TAGLINE
ARG VITE_APP_DESCRIPTION
ARG VITE_APP_URL
ARG VITE_APP_GITHUB_URL
ARG VITE_APP_OG_IMAGE
ARG VITE_CONTACT_URL
ARG VITE_STATUS_URL
ARG VITE_DOCS_URL

ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_TAGLINE=$VITE_APP_TAGLINE \
    VITE_APP_DESCRIPTION=$VITE_APP_DESCRIPTION \
    VITE_APP_URL=$VITE_APP_URL \
    VITE_APP_GITHUB_URL=$VITE_APP_GITHUB_URL \
    VITE_APP_OG_IMAGE=$VITE_APP_OG_IMAGE \
    VITE_CONTACT_URL=$VITE_CONTACT_URL \
    VITE_STATUS_URL=$VITE_STATUS_URL \
    VITE_DOCS_URL=$VITE_DOCS_URL

# Install dependencies
RUN pnpm install

# Build shared types first, then frontend
RUN pnpm --filter @bioplatform/shared build
RUN pnpm --filter @bioplatform/frontend build

# Production stage
FROM nginx:alpine

# Copy built files to Nginx
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

# Copy Nginx configuration for SPA
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
