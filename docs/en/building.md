# Docker Images

BioPlatform publishes prebuilt images to two registries. You can also build your own from source.

## Prebuilt Images

Images are published automatically on every release:

| Registry | Backend | Frontend |
|----------|---------|----------|
| **Docker Hub** | `dracoservices/bioplatform-backend` | `dracoservices/bioplatform-frontend` |
| **GHCR** | `ghcr.io/00kino547/bioplatform-backend` | `ghcr.io/00kino547/bioplatform-frontend` |

Tags: `latest`, semver (`1.3.0`), minor (`1.3`), SHA.

### Using prebuilt images

```bash
# Docker Hub (default)
docker compose -f docker-compose.prebuilt.yml up -d

# GHCR — override via .env or environment
BACKEND_IMAGE=ghcr.io/00kino547/bioplatform-backend:latest \
FRONTEND_IMAGE=ghcr.io/00kino547/bioplatform-frontend:latest \
docker compose -f docker-compose.prebuilt.yml up -d

# Or set in .env and just run:
docker compose -f docker-compose.prebuilt.yml up -d
```

The prebuilt file is a standalone drop-in for `docker-compose.yml` — same services, same ports, same env vars. It pulls images instead of building from source.

### Pulling a specific version

```bash
BACKEND_IMAGE=dracoservices/bioplatform-backend:1.3.0 \
FRONTEND_IMAGE=dracoservices/bioplatform-frontend:1.3.0 \
docker compose -f docker-compose.prebuilt.yml up -d
```

## Building from Source

### Using docker compose (recommended)

The default `docker-compose.yml` builds both images from the Dockerfiles:

```bash
# Full stack with Nginx
docker compose --profile nginx up -d --build

# Without Nginx
docker compose up -d --build
```

This builds the backend (single-stage, Node 22 Alpine) and frontend (multi-stage: Node 22 build → Nginx Alpine) from the local source.

### Using build scripts

Helper scripts build and tag images locally:

**Linux / macOS:**

```bash
# Both images
./scripts/build.sh

# Backend only
./scripts/build-backend.sh

# Frontend only
./scripts/build-frontend.sh
```

**Windows (PowerShell):**

```powershell
# Both images
./scripts/build.ps1

# Backend only
./scripts/build-backend.ps1

# Frontend only
./scripts/build-frontend.ps1
```

Via pnpm:

```bash
pnpm docker:build
```

### Building for a custom registry

The build scripts tag images for Docker Hub by default (`dracoservices/bioplatform-*`). To push to your own registry:

```bash
# Build
./scripts/build-backend.sh

# Retag
docker tag dracoservices/bioplatform-backend:latest myregistry.com/myorg/bioplatform-backend:latest

# Push
docker push myregistry.com/myorg/bioplatform-backend:latest
```

Or modify the `IMAGE_NAME` variable at the top of the build scripts.

### Build architecture

| Image | Base | Build | Notes |
|-------|------|-------|-------|
| Backend | `node:22-alpine` | Single-stage | Includes Prisma, CLI (`bioplatform` on PATH), fonts for OG cards |
| Frontend | `node:22-alpine` → `nginx:alpine` | Multi-stage | Build stage compiles React, production stage serves static files |

### Customizing the build

**Frontend:** The frontend image is runtime-configurable via `VITE_*` env vars (injected by the entrypoint). You do NOT need to rebuild to change branding, API URL, or other frontend settings — just set the env vars in `.env`.

**Backend:** If you modify backend source code, rebuild with `./scripts/build-backend.sh` or `docker compose up -d --build backend`.

### Dockerfiles

- `apps/backend/Dockerfile` — backend image
- `apps/frontend/Dockerfile` — frontend image (multi-stage)

### CI/CD

The GitHub Actions workflow (`.github/workflows/docker-publish.yml`) builds and publishes to both Docker Hub and GHCR on every push to `main` and every version tag. It uses:
- Docker Buildx for reproducible builds
- GitHub Actions cache for faster rebuilds
- Multi-platform support (currently `linux/amd64`)

## Which option should I use?

| Scenario | Use |
|----------|-----|
| Quick deploy, no code changes | Prebuilt images (`docker-compose.prebuilt.yml`) |
| Custom branding without rebuilding | Prebuilt images + env vars |
| Fork with modified source | Build from source (`docker-compose.yml` + `--build`) |
| CI/CD pipeline | Build scripts or docker compose `--build` |
| Testing a PR | Build from source |

---

← [Deployment](./deployment.md) · [Admin Guide](./admin-guide.md) →
