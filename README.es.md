# BioPlatform
### Aún no listo para producción. Espera errores.

> Tu identidad digital, bellamente diseñada.

Una plataforma moderna de enlaces para creadores, desarrolladores y cualquier persona que quiera una presencia digital pulida.

## Características

- Perfiles personalizados con avatares, banners y biografías
- Enlaces sociales con iconos de plataforma (Twitter/X, GitHub, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email, etc...)
- Soporte para nombres de usuario de Discord y enlaces de invitación
- Presencia de Discord en vivo (estado, actividad, canción actual) con un widget de perfil opt-in y previsualizaciones de enlaces enriquecidas (meta OpenGraph + tarjeta renderizada en servidor)
- 8 temas predefinidos (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal)
- Personalización de temas con colores de acento
- Acceso exclusivo por invitación
- Auto-hospedable con Docker
- Panel de administración (gestión de usuarios, códigos de invitación, edición de perfiles...)
- Subida de archivos segura (almacenamiento local, compatible con S3)
- Sanitización de entrada y validación de plataformas
- Páginas de Política de Privacidad y Términos de Servicio
- Diseño moderno y responsivo

## Capturas de pantalla

> Próximamente.

## 📊 Project Stats

[![Stars](https://img.shields.io/github/stars/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/stargazers)
[![Forks](https://img.shields.io/github/forks/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/network/members)
[![Issues](https://img.shields.io/github/issues/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/00kino547/BioPlatform?style=flat-square)](https://github.com/00kino547/BioPlatform/pulls)
[![Latest Release](https://img.shields.io/github/v/release/00kino547/BioPlatform?include_prereleases&style=flat-square
)](https://github.com/00kino547/BioPlatform/releases)
[![License](https://img.shields.io/github/license/00kino547/BioPlatform?style=flat-square)](LICENSE)

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
# Habilitar corepack e instalar dependencias
corepack enable
pnpm install

# Generar cliente Prisma
pnpm db:generate

# Sembrar usuario admin y códigos de invitación
pnpm --filter @bioplatform/backend db:seed

# Iniciar servidores de desarrollo
pnpm dev
```

Abre http://localhost:5173 (frontend) y http://localhost:3000/api/health (backend).

# Despliegue con Docker (recomendado)

```bash
# Stack completo con Nginx (construye desde el código fuente)
docker compose --profile nginx up -d --build

# Sin Nginx (acceso directo a la API backend)
docker compose up -d --build

# Usando imágenes precompiladas (sin build)
docker compose -f docker-compose.prebuilt.yml up -d
```

Con Nginx, la aplicación está disponible en http://localhost:80 — frontend, API (`/api`) y uploads servidos en un solo puerto a través del proxy inverso Nginx interno.

En el primer arranque, configura `SEED_ON_START=true` en `.env` para crear el administrador inicial y los códigos de invitación. La semilla es idempotente — solo crea el administrador cuando ese correo no existe y nunca sobrescribe una contraseña existente. Elimina `SEED_ON_START=true` después del primer arranque exitoso.

## Servicios Docker Compose

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

Ver `docs/es/environment-variables.md` para la lista completa.

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
| GitLab | URL | Enlace clickeable |
| YouTube | URL | Enlace clickeable |
| Twitch | URL | Enlace clickeable |
| Discord | Nombre de usuario o enlace de invitación | Usuario: solo visualización. Invitación: clickeable |
| TikTok | URL | Enlace clickeable |
| Instagram | URL | Enlace clickeable |
| Facebook | URL | Enlace clickeable |
| LinkedIn | URL | Enlace clickeable |
| Spotify | URL | Enlace clickeable |
| Reddit | URL | Enlace clickeable |
| Pinterest | URL | Enlace clickeable |
| Snapchat | URL | Enlace clickeable |
| Threads | URL | Enlace clickeable |
| Bluesky | URL | Enlace clickeable |
| Mastodon | URL | Enlace clickeable |
| WhatsApp | Número de teléfono o URL | Enlace clickeable |
| Telegram | URL o nombre de usuario | Enlace clickeable |
| Signal | URL | Enlace clickeable |
| Kick | URL | Enlace clickeable |
| Steam | URL | Enlace clickeable |
| SoundCloud | URL | Enlace clickeable |
| Email | Dirección de correo | Abre cliente de correo |

## Actualización

```bash
git pull
pnpm install
pnpm db:generate
docker compose --profile nginx up -d --build
```

Después de actualizar, aplica las nuevas migraciones de base de datos (archivos SQL en `docs/migrations/`):

```bash
docker compose exec postgres psql -U postgres -d bioplatform -f /ruta/a/migracion.sql
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
├── docker-compose.prebuilt.yml
├── .env.example
├── AGENTS.md              # Instrucciones para agentes AI
├── PROJECT_MAP.md         # Ubicación de archivos
├── DECISIONS.md           # Decisiones de arquitectura
├── TASKS.md               # Seguimiento de tareas
├── PROMPTS.md             # Prompts reutilizables para AI
└── CHANGELOG.md           # Historial de versiones
```

## Documentación

- [English](docs/en/)
- [Español](docs/es/)

## 🤝 Contribuir

Las contribuciones son bienvenidas.

Antes de abrir un pull request, lee [CONTRIBUTING.md](docs/es/contributing.md).

## Preguntas Frecuentes

**¿Puedo auto-hospedarme BioPlatform?**
Sí. Es totalmente de código abierto y compatible con Docker.

**¿Es gratis?**
La plataforma central es gratuita. Las funciones premium están disponibles por suscripción.

**¿Cómo obtengo una invitación?**
BioPlatform es exclusivo por invitación. Contacta a miembros existentes o comunícate a través de [GitHub Issues](https://github.com/00kino547/BioPlatform/issues).

**¿Puedo usar nombres de usuario de Discord en vez de enlaces?**
Sí. Ingresa tu nuevo nombre de usuario de Discord (sin discriminador) o un enlace de invitación discord.gg.

**¿Cómo funcionan los temas?**
Elige un tema predefinido en Dashboard > Appearance. Tu perfil público usará los colores seleccionados.

## 🧑‍💻 Core Team

- **@00kino547** · Fundador y Desarrollador Principal
- **@gtaqwsgt** · Contribuidor, Cazador de Bugs y Beta Tester

## 🧪 Beta Testers & Security Researchers

Gracias a todos los que ayudaron a encontrar bugs, probar features y romper cosas antes de que los usuarios tuvieran la oportunidad de hacerlo.

## ❤️ Agradecimientos Especiales

Gracias a todos los que contribuyeron ideas, reportaron bugs, probaron features experimentales o ayudaron a dar forma a BioPlatform.

Este proyecto estaría significativamente más roto sin ti.

## 👥 Contribuidores

Gracias a todos los que contribuyeron código, ideas, testing, documentación, reportes de bugs o sufrimiento general a BioPlatform.

<a href="https://github.com/00kino547/BioPlatform/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=00kino547/BioPlatform" />
</a>
