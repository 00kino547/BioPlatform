FROM node:22-alpine

RUN apk upgrade --no-cache \
  && corepack enable && corepack prepare pnpm@11.9.0 --activate \
  && apk add --no-cache font-liberation ttf-dejavu

WORKDIR /app

# Copy package files
COPY .npmrc pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

# Copy source code before install to avoid symlink conflicts
COPY apps/backend/ apps/backend/
COPY packages/shared/ packages/shared/

# Install dependencies
RUN pnpm install

# Generate Prisma Client
RUN pnpm --filter @bioplatform/backend db:generate

# Build shared types first, then backend
RUN pnpm --filter @bioplatform/shared build
RUN pnpm --filter @bioplatform/backend build

# Expose the administration CLI on PATH
RUN printf '#!/bin/sh\nexec node /app/apps/backend/dist/cli/index.js "$@"\n' > /usr/local/bin/bioplatform \
  && chmod +x /usr/local/bin/bioplatform

# Create uploads directory
RUN mkdir -p /app/uploads /app/certs

COPY apps/backend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "apps/backend/dist/index.js"]
