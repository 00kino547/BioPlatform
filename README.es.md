# BioPlatform

> Tu identidad digital, bellamente diseñada.

Una plataforma moderna de enlaces para creadores, desarrolladores y cualquier persona que quiera una presencia digital pulida.

## Características

- Perfiles personalizados con avatares, banners y biografías
- Integración de enlaces sociales
- Reproductor de música
- Personalización de temas
- Analíticas integradas
- Acceso exclusivo por invitación
- Auto-hospedable con Docker
- Subida de archivos segura (compatible con S3)
- Rendimiento ultrarrápido
- Diseño moderno y responsivo

## Capturas de pantalla

> Próximamente.

## Stack Tecnológico

- **Frontend:** React 19, Vite 6, TypeScript 5, TailwindCSS 4
- **Backend:** Express 5, TypeScript 5, Prisma 6 (PostgreSQL)
- **Infra:** Docker Compose, Nginx (proxy inverso opcional)
- **Gestor de Paquetes:** pnpm 11

## Requisitos

- Node.js 22+
- PostgreSQL 16+
- Docker y Docker Compose (para despliegue en contenedor)
- pnpm 11 (vía corepack)

## Instalación

```bash
git clone https://github.com/kinotes/bio.git
cd bio
cp .env.example .env
```

## Inicio Rápido

```bash
# Instalar dependencias
corepack enable
pnpm install

# Generar cliente Prisma
pnpm db:generate

# Iniciar servidores de desarrollo
pnpm dev
```

Abre http://localhost:5173 (frontend) y http://localhost:3000/api/health (backend).

## Despliegue con Docker

```bash
# Stack completo con Nginx
docker compose --profile nginx up -d

# Sin Nginx (acceso directo)
docker compose up -d
```

La aplicación estará disponible en http://localhost:80.

## Docker Compose

Servicios:
- `postgres` — Base de datos PostgreSQL 16
- `backend` — Servidor API Express (puerto 3000)
- `frontend` — SPA React servida por Nginx (puerto 80)
- `nginx` — Proxy inverso (opcional, requiere `--profile nginx`)

## Ejemplos de Proxy Inverso

### Nginx

```nginx
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://localhost:80;
    }
}
```

### Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:80
```

## Variables de Entorno

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `APP_NAME` | Nombre de la aplicación | `BioPlatform` |
| `APP_TAGLINE` | Lema corto | `Tu identidad digital, bellamente diseñada.` |
| `APP_DESCRIPTION` | Descripción completa | `Crea una página de perfil impresionante...` |
| `APP_URL` | URL pública | `http://localhost:80` |
| `APP_GITHUB_URL` | URL del repositorio GitHub | `https://github.com/kinotes/bio` |
| `VITE_API_URL` | URL del API backend | `http://localhost:3000/api` |
| `PORT` | Puerto del backend | `3000` |
| `DATABASE_URL` | Cadena de conexión PostgreSQL | — |
| `JWT_SECRET` | Secreto JWT | — |
| `STORAGE_PROVIDER` | Backend de almacenamiento (`local`, `r2`, `b2`, `s3`) | `local` |

Ver `.env.example` para la lista completa.

## Marca

Toda la marca es configurable mediante variables de entorno. Cambia `APP_NAME`, `APP_TAGLINE` y `APP_DESCRIPTION` en `.env` para reformar toda la aplicación. Las variables se usan en:

- Navbar, Hero, Footer
- Meta tags SEO, OpenGraph, Twitter cards
- Datos estructurados (JSON-LD)
- Título del navegador
- Contenido del FAQ

## Actualización

```bash
git pull
pnpm install
pnpm db:generate
docker compose --profile nginx up -d --build
```

## Recomendaciones de Respaldo

- Base de datos: `pg_dump` o respaldo de volumen
- Subidas: respaldo regular de `./uploads`
- Entorno: mantén `.env` en un lugar seguro (no en control de versiones)

## Recomendaciones de Producción

- Usa un `JWT_SECRET` fuerte (32+ caracteres aleatorios)
- Habilita HTTPS vía proxy inverso o Cloudflare
- Usa almacenamiento compatible con S3 para subidas
- Establece `NODE_ENV=production`
- Usa una instancia dedicada de PostgreSQL

## Estructura de Carpetas

```
bio/
├── apps/
│   ├── frontend/          # SPA React
│   └── backend/           # API Express
├── packages/
│   └── shared/            # Tipos compartidos + almacenamiento
├── docs/                  # Documentación
├── nginx/                 # Configuración Nginx
├── docker-compose.yml
├── .env.example
├── AGENTS.md              # Instrucciones para agentes AI
├── PROJECT_MAP.md         # Ubicación de archivos
├── DECISIONS.md           # Decisiones de arquitectura
├── TASKS.md               # Seguimiento de tareas
└── PROMPTS.md             # Prompts reutilizables para AI
```

## Documentación

- [English](../en/)
- [Español](../es/)

## Contribuir

1. Haz fork del repositorio
2. Crea una rama de características
3. Haz tus cambios
4. Ejecuta `pnpm typecheck` y `pnpm lint`
5. Envía un pull request

## Seguridad

Reporta vulnerabilidades de seguridad a los mantenedores. No abras issues públicos para preocupaciones de seguridad.

## Licencia

Licencia MIT. Ver [LICENSE](../LICENSE) para detalles.

## Créditos

Creado con cuidado para creadores en todas partes.

## Preguntas Frecuentes

**¿Puedo auto-hospedarme BioPlatform?**
Sí. Es totalmente de código abierto y compatible con Docker.

**¿Es gratis?**
La plataforma central es gratuita. Las funciones premium están disponibles por suscripción.

**¿Cómo obtengo una invitación?**
BioPlatform es exclusivo por invitación. Contacta a miembros existentes o comunícate con nuestro equipo.
