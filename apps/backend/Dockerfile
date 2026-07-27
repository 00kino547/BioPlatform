FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

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

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "apps/backend/dist/index.js"]
