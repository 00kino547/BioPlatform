# Imágenes Docker

BioPlatform publica imágenes precompiladas en dos registros. También puedes construir las tuyas desde el código fuente.

## Imágenes Precompiladas

Las imágenes se publican automáticamente en cada release:

| Registro | Backend | Frontend |
|----------|---------|----------|
| **Docker Hub** | `dracoservices/bioplatform-backend` | `dracoservices/bioplatform-frontend` |
| **GHCR** | `ghcr.io/00kino547/bioplatform-backend` | `ghcr.io/00kino547/bioplatform-frontend` |

Tags: `latest`, semver (`1.3.0`), minor (`1.3`), SHA.

### Usar imágenes precompiladas

```bash
# Docker Hub (por defecto)
docker compose -f docker-compose.prebuilt.yml up -d

# GHCR — sobreescribe via .env o entorno
BACKEND_IMAGE=ghcr.io/00kino547/bioplatform-backend:latest \
FRONTEND_IMAGE=ghcr.io/00kino547/bioplatform-frontend:latest \
docker compose -f docker-compose.prebuilt.yml up -d

# O configura en .env y ejecuta:
docker compose -f docker-compose.prebuilt.yml up -d
```

El archivo prebuilt es un drop-in independiente para `docker-compose.yml` — mismos servicios, mismos puertos, mismas variables de entorno. Descarga imágenes en vez de construir desde el código fuente.

### Descargar una versión específica

```bash
BACKEND_IMAGE=dracoservices/bioplatform-backend:1.3.0 \
FRONTEND_IMAGE=dracoservices/bioplatform-frontend:1.3.0 \
docker compose -f docker-compose.prebuilt.yml up -d
```

## Construir desde el Código Fuente

### Usando docker compose (recomendado)

El `docker-compose.yml` por defecto construye ambas imágenes desde los Dockerfiles:

```bash
# Stack completo con Nginx
docker compose --profile nginx up -d --build

# Sin Nginx
docker compose up -d --build
```

Esto construye el backend (stage único, Node 22 Alpine) y el frontend (multi-stage: build Node 22 → Nginx Alpine) desde el código fuente local.

### Usando scripts de build

Scripts auxiliares que construyen y etiquetan imágenes localmente:

**Linux / macOS:**

```bash
# Ambas imágenes
./scripts/build.sh

# Solo backend
./scripts/build-backend.sh

# Solo frontend
./scripts/build-frontend.sh
```

**Windows (PowerShell):**

```powershell
# Ambas imágenes
./scripts/build.ps1

# Solo backend
./scripts/build-backend.ps1

# Solo frontend
./scripts/build-frontend.ps1
```

Vía pnpm:

```bash
pnpm docker:build
```

### Construir para un registro personalizado

Los scripts de build etiquetan imágenes para Docker Hub por defecto (`dracoservices/bioplatform-*`). Para subir a tu propio registro:

```bash
# Construir
./scripts/build-backend.sh

# Reetiquetar
docker tag dracoservices/bioplatform-backend:latest miregistro.com/miorg/bioplatform-backend:latest

# Subir
docker push miregistro.com/miorg/bioplatform-backend:latest
```

O modifica la variable `IMAGE_NAME` al inicio de los scripts de build.

### Arquitectura de build

| Imagen | Base | Build | Notas |
|--------|------|-------|-------|
| Backend | `node:22-alpine` | Stage único | Incluye Prisma, CLI (`bioplatform` en PATH), fuentes para OG cards |
| Frontend | `node:22-alpine` → `nginx:alpine` | Multi-stage | Stage de build compila React, stage de producción sirve archivos estáticos |

### Personalizar el build

**Frontend:** La imagen del frontend es configurable en tiempo de ejecución via variables `VITE_*` (inyectadas por el entrypoint). NO necesitas reconstruir para cambiar branding, URL del API u otros ajustes del frontend — solo configura las variables en `.env`.

**Backend:** Si modificas código del backend, reconstruye con `./scripts/build-backend.sh` o `docker compose up -d --build backend`.

### Dockerfiles

- `apps/backend/Dockerfile` — imagen del backend
- `apps/frontend/Dockerfile` — imagen del frontend (multi-stage)

### CI/CD

El workflow de GitHub Actions (`.github/workflows/docker-publish.yml`) construye y publica en Docker Hub y GHCR en cada push a `main` y cada tag de versión. Usa:
- Docker Buildx para builds reproducibles
- Caché de GitHub Actions para rebuilds más rápidos
- Soporte multi-plataforma (actualmente `linux/amd64`)

## ¿Qué opción debo usar?

| Escenario | Usa |
|-----------|-----|
| Deploy rápido, sin cambios de código | Imágenes precompiladas (`docker-compose.prebuilt.yml`) |
| Branding personalizado sin reconstruir | Imágenes precompiladas + variables de entorno |
| Fork con código modificado | Construir desde fuente (`docker-compose.yml` + `--build`) |
| Pipeline CI/CD | Scripts de build o docker compose `--build` |
| Probar un PR | Construir desde fuente |

---

← [Despliegue](./deployment.md) · [Guía de Administración](./admin-guide.md) →
