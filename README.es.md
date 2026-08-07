# BioPlatform

> Tu identidad digital, bellamente diseñada.

Una plataforma moderna de enlaces para creadores, desarrolladores y cualquier persona que quiera una presencia digital pulida.

## Características

- Perfiles personalizados con avatares, banners y biografías
- Enlaces sociales con iconos de plataforma (Twitter/X, GitHub, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email)
- Soporte para nombres de usuario de Discord y enlaces de invitación
- Presencia de Discord en vivo (estado, actividad, canción actual) con un widget de perfil opt-in y previsualizaciones de enlaces enriquecidas (meta OpenGraph + tarjeta renderizada en servidor)
- Enlaces de correo electrónico `mailto:`
- 8 temas predefinidos (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal)
- Personalización de temas con colores de acento
- Acceso exclusivo por invitación
- Auto-hospedable con Docker
- Panel de administración (gestión de usuarios, códigos de invitación, edición de perfiles)
- Subida de archivos segura (almacenamiento local, compatible con S3)
- Sanitización de entrada y validación de plataformas
- Páginas de Política de Privacidad y Términos de Servicio
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
git clone https://github.com/00kino547/BioPlatform.git
cd BioPlatform
cp .env.example .env
```

## Inicio Rápido

```bash
# Instalar dependencias
corepack enable
pnpm install

# Generar cliente Prisma
pnpm db:generate

# Sembrar usuario admin y códigos de invitación
pnpm db:seed

# Iniciar servidores de desarrollo
pnpm dev
```

Abre http://localhost:5173 (frontend) y http://localhost:3000/api/health (backend).

## Despliegue con Docker

```bash
# Stack completo con Nginx
docker compose --profile nginx up -d --build

# Sin Nginx (acceso directo)
docker compose up -d --build
```

La aplicación estará disponible en http://localhost:80.

## Docker Compose

Servicios:
- `postgres` — Base de datos PostgreSQL 16
- `backend` — Servidor API Express (puerto 3000)
- `frontend` — SPA React servida por Nginx (puerto 80)
- `nginx` — Proxy inverso (opcional, requiere `--profile nginx`)

## Variables de Entorno

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `APP_NAME` | Nombre de la aplicación | `BioPlatform` |
| `APP_TAGLINE` | Lema corto | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Descripción completa | `Create a stunning profile page...` |
| `APP_URL` | URL pública | `http://localhost:80` |
| `APP_GITHUB_URL` | URL del repositorio GitHub | `https://github.com/00kino547/BioPlatform` |
| `VITE_API_URL` | URL del API backend (relativa para proxy Nginx) | `/api` |
| `VITE_CONTACT_URL` | URL de contacto/soporte | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | URL de página de estado | _(vacío)_ |
| `VITE_DOCS_URL` | URL de documentación | `https://github.com/00kino547/BioPlatform/tree/main/docs` |
| `PORT` | Puerto del backend | `3000` |
| `DATABASE_URL` | Cadena de conexión PostgreSQL | — |
| `JWT_SECRET` | Secreto JWT | — |
| `JWT_EXPIRES_IN` | Expiración JWT | `7d` |
| `CORS_ORIGIN` | Orígenes permitidos (separados por comas) | `http://localhost:5173` |
| `STORAGE_PROVIDER` | Backend de almacenamiento (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Directorio de subidas local | `./uploads` |

Ver `.env.example` para la lista completa.

## Marca

Toda la marca es configurable mediante variables de entorno. Cambia `APP_NAME`, `APP_TAGLINE` y `APP_DESCRIPTION` en `.env` para reformar toda la aplicación. Las variables se usan en:

- Navbar, Hero, Footer
- Meta tags SEO, OpenGraph, Twitter cards
- Datos estructurados (JSON-LD)
- Título del navegador
- Contenido del FAQ
- Pie de página del perfil público
- Páginas de Política de Privacidad y Términos de Servicio

## Plataformas Soportadas

Los enlaces sociales soportan las siguientes plataformas con iconos SVG personalizados:

| Plataforma | Formato de Entrada | Visualización |
|-----------|-------------------|---------------|
| Twitter / X | URL | Enlace clickeable |
| GitHub | URL | Enlace clickeable |
| YouTube | URL | Enlace clickeable |
| Twitch | URL | Enlace clickeable |
| Discord | Nombre de usuario o enlace de invitación | Usuario: solo visualización. Invitación: clickeable |
| TikTok | URL | Enlace clickeable |
| Instagram | URL | Enlace clickeable |
| Facebook | URL | Enlace clickeable |
| LinkedIn | URL | Enlace clickeable |
| Spotify | URL | Enlace clickeable |
| Email | Dirección de correo | Abre cliente de correo |

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

## Seguridad

- Toda la entrada del usuario se sanitiza antes de almacenar (caracteres tipo HTML eliminados)
- Nombres de plataforma validados contra una lista permitida
- URLs validadas para protocolo correcto (sin `javascript:` etc.)
- Subidas de archivos limitadas a extensiones de imagen (JPEG, PNG, GIF, WebP)
- Hashing de contraseñas con bcrypt a 12 rondas
- Autenticación JWT con expiración configurable
- Sin `dangerouslySetInnerHTML` en el frontend (React escapa todo el contenido por defecto)

## Estructura de Carpetas

```
BioPlatform/
├── apps/
│   ├── frontend/          # SPA React
│   └── backend/           # API Express
├── packages/
│   └── shared/            # Tipos compartidos + almacenamiento
├── docs/                  # Documentación (Inglés + Español)
├── nginx/                 # Configuración Nginx
├── docker-compose.yml
├── .env.example
├── AGENTS.md              # Instrucciones para agentes AI
├── PROJECT_MAP.md         # Ubicación de archivos
├── DECISIONS.md           # Decisiones de arquitectura
├── TASKS.md               # Seguimiento de tareas
├── PROMPTS.md             # Prompts reutilizables para AI
└── CHANGELOG.md           # Historial de versiones
```

## Documentación

- [English](../en/)
- [Español](../es/)

## Contribuir

1. Haz fork del repositorio
2. Crea una rama de características
3. Haz tus cambios
4. Verifica TypeScript: `pnpm --filter frontend exec tsc --noEmit`
5. Verifica Docker: `docker compose --profile nginx up -d --build`
6. Envía un pull request

Ver [Guía de Contribución](../es/contributing.md) para detalles.

## Seguridad

Reporta vulnerabilidades de seguridad a los mantenedores. No abras issues públicos para preocupaciones de seguridad.

## Licencia

Licencia MIT. Ver [LICENSE](../LICENSE) para detalles.

## Preguntas Frecuentes

**¿Puedo auto-hospedarme BioPlatform?**
Sí. Es totalmente de código abierto y compatible con Docker.

**¿Es gratis?**
La plataforma central es gratuita. Las funciones premium están disponibles por suscripción.

**¿Cómo obtengo una invitación?**
BioPlatform es exclusivo por invitación. Contacta a miembros existentes o comunícate a través de [GitHub Issues](https://github.com/00kino547/BioPlatform/issues).
