# Imágenes Docker

BioPlatform publica imágenes precompiladas en dos registros. También puedes compilar las tuyas propias desde el código fuente.

## Imágenes precompiladas

Las imágenes se publican automáticamente en cada release:

| Registro | Backend | Frontend |
|----------|---------|----------|
| **Docker Hub** | `dracoservices/bioplatform-backend` | `dracoservices/bioplatform-frontend` |
| **GHCR** | `ghcr.io/00kino547/bioplatform-backend` | `ghcr.io/00kino547/bioplatform-frontend` |

Tags: `latest` (solo estables), menor (`1.3`), semver (`1.3.0`), prerelease (`2.0.0-canary.1`).
Una prerelease **nunca** actualiza `latest` ni la etiqueta menor, y su release de GitHub
siempre se marca como **Pre-release**.

Canales móviles — una etiqueta rodante cada una, publicada **solo** después de que
`Tests & Quality Gates` pase:

| Rama | Etiqueta | Desplegar con |
|---|---|---|
| `public-canary` | `canary` | `BACKEND_IMAGE=dracoservices/bioplatform-backend:canary` |
| `public-alpha` | `alpha` | `BACKEND_IMAGE=dracoservices/bioplatform-backend:alpha` |
| `dev-*` | `dev` | `BACKEND_IMAGE=dracoservices/bioplatform-backend:dev` |

No hay deliberadamente ninguna etiqueta SHA por commit: cada canal sobrescribe una sola etiqueta
en lugar de acumular una por commit, así las etiquetas nunca se acumulan. El commit exacto queda
registrado en la etiqueta `org.opencontainers.image.revision` de la imagen.


### Puerta de vulnerabilidades en las imágenes

`Build & Publish Docker Images` escanea cada imagen que publica y **falla el job ante cualquier
CVE CRÍTICO**, de modo que un toolchain vulnerable aparece en la ejecución que lo produjo y no
solo en un panel del registro. El escaneo se ejecuta después del push, así que detecta en lugar
de prevenir.

Los hallazgos HIGH no fallan el build. Actualmente hay uno aceptado en la imagen del backend:

| Paquete | Aviso | Por qué se acepta |
|---|---|---|
| `node-forge` 1.4.0 | CVE-2026-85393 | No existe versión parcheada. Llega por `acme-client`, y ACME permanece desactivado salvo que se defina `ACME_ENABLED` |

La imagen del frontend se escanea en 0 CRITICAL y 0 HIGH. El pin de pnpm del backend
(`12.4.0`) es la versión más baja cuyo `tar` y `undici` incluidos ya superan sus versiones
corregidas — pnpm arrastra ambos dentro de su propia distribución, así que esto es una
decisión de pin y no algo que `overrides` pueda alcanzar.

Si actualizas pnpm en local, borra `node_modules` antes: pnpm 12 ya no crea directorios
`node_modules` por paquete con el linker hoisted, y los shims `.bin` heredados de pnpm 11
apuntan a paquetes que ya no existen localmente.
### Usar imágenes precompiladas

```bash
# Docker Hub (por defecto)
docker compose -f docker-compose.prebuilt.yml up -d

# GHCR — sobrescribe mediante .env o variable de entorno
BACKEND_IMAGE=ghcr.io/00kino547/bioplatform-backend:latest \
FRONTEND_IMAGE=ghcr.io/00kino547/bioplatform-frontend:latest \
docker compose -f docker-compose.prebuilt.yml up -d

# O define las variables en .env y ejecuta:
docker compose -f docker-compose.prebuilt.yml up -d
```

El archivo prebuilt es un sustituto directo de `docker-compose.yml`: mismos servicios, mismos puertos, mismas variables de entorno. Descarga las imágenes en lugar de compilarlas desde el código fuente.

### Descargar una versión específica

```bash
BACKEND_IMAGE=dracoservices/bioplatform-backend:1.3.0 \
FRONTEND_IMAGE=dracoservices/bioplatform-frontend:1.3.0 \
docker compose -f docker-compose.prebuilt.yml up -d
```

## Compilar desde el código fuente

### Usando docker compose

Las imágenes precompiladas son la opción recomendada por defecto (ver [Despliegue](./deployment.md)). Para ejecutar código local modificado en su lugar, el archivo `docker-compose.yml` por defecto compila ambas imágenes a partir de los Dockerfiles:

```bash
# Pila completa con Nginx
docker compose --profile nginx up -d --build

# Sin Nginx
docker compose up -d --build
```

Esto compila el backend (etapa única, Node 22 Alpine) y el frontend (varias etapas: compilación con Node 22 → Nginx Alpine) a partir del código fuente local.

### Usando scripts de compilación

Scripts auxiliares que compilan y etiquetan imágenes localmente:

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

Mediante pnpm:

```bash
pnpm docker:build
```

### Compilar para un registro personalizado

Los scripts de compilación etiquetan las imágenes para Docker Hub de forma predeterminada (`dracoservices/bioplatform-*`). Para subirlas a tu propio registro:

```bash
# Compilar
./scripts/build-backend.sh

# Reetiquetar
docker tag dracoservices/bioplatform-backend:latest myregistry.com/myorg/bioplatform-backend:latest

# Subir
docker push myregistry.com/myorg/bioplatform-backend:latest
```

También puedes modificar la variable `IMAGE_NAME` al inicio de los scripts de compilación.

### Arquitectura de compilación

| Imagen | Base | Compilación | Notas |
|--------|------|-------------|-------|
| Backend | `node:22-alpine` | Etapa única | Incluye Prisma, CLI (`bioplatform` en PATH), fuentes para OG cards |
| Frontend | `node:22-alpine` → `nginx:alpine` | Varias etapas | La etapa de compilación genera React; la etapa de producción sirve los archivos estáticos |

### Personalizar la compilación

**Frontend:** La imagen del frontend se configura en tiempo de ejecución mediante las variables `VITE_*` (inyectadas por el entrypoint). No es necesario recompilar para cambiar el branding, la URL de la API u otros ajustes del frontend: basta con definir las variables en `.env`.

**Backend:** Si modificas el código del backend, recompila con `./scripts/build-backend.sh` o `docker compose up -d --build backend`.

### Dockerfiles

- `apps/backend/Dockerfile` — imagen del backend
- `apps/frontend/Dockerfile` — imagen del frontend (varias etapas)

### CI/CD

El workflow de GitHub Actions (`.github/workflows/docker-publish.yml`) compila y publica en Docker Hub y GHCR en cada push a `main` y en cada tag de versión. Utiliza:
- Docker Buildx para compilaciones reproducibles
- Caché de GitHub Actions para recompilaciones más rápidas
- Soporte multiplataforma (actualmente `linux/amd64`)

## ¿Qué opción debo usar?

| Escenario | Recomendación |
|-----------|---------------|
| Despliegue rápido, sin cambios de código | Imágenes precompiladas (`docker-compose.prebuilt.yml`) — la opción recomendada por defecto |
| Branding personalizado sin recompilar | Imágenes precompiladas + variables de entorno |
| Fork con código modificado | Compilar desde el código fuente (`docker-compose.yml` + `--build`) |
| Pipeline CI/CD | Scripts de compilación o docker compose `--build` |
| Probar un PR | Compilar desde el código fuente |

Las imágenes precompiladas son la opción recomendada por defecto para la mayoría de despliegues (`docker compose -f docker-compose.prebuilt.yml --profile nginx up -d`). Compila desde el código fuente solo cuando necesites ejecutar código modificado.

---

← [Despliegue](./deployment.md) · [Guía de administración](./admin-guide.md) →
