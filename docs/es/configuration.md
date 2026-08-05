# Configuración

## Resumen

BioPlatform se configura completamente a través de variables de entorno. Copia `.env.example` a `.env` y modifica los valores.

```bash
cp .env.example .env
```

## Aplicación

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `APP_NAME` | Nombre de la aplicación en navbar, footer, emails | `BioPlatform` |
| `APP_TAGLINE` | Lema corto para la landing page | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Descripción completa para SEO y meta tags | `Create a stunning profile page...` |
| `APP_URL` | URL pública de tu instancia | `http://localhost:80` |
| `APP_GITHUB_URL` | URL del repositorio GitHub | `https://github.com/00kino547/BioPlatform` |

## Frontend

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `VITE_API_URL` | URL del API backend (usa `/api` para proxy Nginx) | `/api` |
| `VITE_APP_NAME` | Nombre de la app frontend | `BioPlatform` |
| `VITE_APP_TAGLINE` | Lema del frontend | `Your digital identity, beautifully crafted.` |
| `VITE_APP_DESCRIPTION` | Descripción del frontend | `Create a stunning profile page...` |
| `VITE_APP_URL` | URL pública del frontend | `http://localhost:80` |
| `VITE_APP_GITHUB_URL` | URL de GitHub del frontend | `https://github.com/00kino547/BioPlatform` |
| `VITE_CONTACT_URL` | URL de contacto/soporte (footer, páginas legales) | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | URL de página de estado (enlace en footer) | _(vacío)_ |
| `VITE_DOCS_URL` | URL de documentación (enlace en footer) | `https://github.com/00kino547/BioPlatform/tree/main/docs` |

> **Importante:** Las variables del frontend deben tener el prefijo `VITE_` para ser accesibles en código React vía `import.meta.env.VITE_*`.

## Backend

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT` | Puerto del servidor backend | `3000` |
| `API_PREFIX` | Prefijo de rutas API | `/api` |
| `NODE_ENV` | Modo de entorno | `development` |

## Base de Datos

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL | — (requerido) |
| `POSTGRES_USER` | Usuario de PostgreSQL | `postgres` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `postgres` |
| `POSTGRES_DB` | Nombre de base de datos PostgreSQL | `bioplatform` |

## Seguridad

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `JWT_SECRET` | Secreto para firmar tokens JWT | — (requerido) |
| `JWT_EXPIRES_IN` | Expiración del token JWT | `7d` |
| `TRUST_PROXY` | Número de saltos de proxy de confianza (IP real del cliente para el rate limiting de autenticación) | `1` |
| `AUTH_LOCK_POLICY` | Política de bloqueo de cuenta: `block` (rechazar todo), `trusted_ip` (las IP registradas + de último acceso pueden iniciar sesión sin desbloquear), `email` (desbloqueo mediante enlace por correo) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Duración del bloqueo en minutos; `-1` = bloqueo permanente | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | TTL en minutos del enlace de desbloqueo por correo (política `email`) | `30` |
| `AUTH_LOG_RETENTION_DAYS` | Retención del registro de autenticación en días | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | Cada cuántos minutos se ejecuta la limpieza del registro de autenticación | `60` |

> Usa una cadena aleatoria fuerte (32+ caracteres) para `JWT_SECRET` en producción.

### Bloqueo y desbloqueo de cuentas

- Tras `MAX_FREE_ATTEMPTS` intentos fallidos (3), se aplica un bloqueo por huella (IP, cookie, user-agent) y por cuenta; por defecto es permanente (`AUTH_LOCK_DURATION_MINUTES=-1`).
- Con `trusted_ip`, iniciar sesión desde la IP registrada o de último acceso funciona sin desbloquear y restablece los contadores.
- Con `email`, el usuario debe abrir el enlace de desbloqueo enviado por correo (`AUTH_UNLOCK_TOKEN_TTL_MINUTES`); requiere SMTP configurado.
- Los administradores pueden desbloquear cuentas desde el panel de administración (pestañas **Bans** y **Logs**). El desbloqueo elimina el bloqueo de cuenta y los bloqueos de IP/cookie registrados contra esa cuenta.

## CORS

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `CORS_ORIGIN` | Orígenes permitidos (separados por comas) | `http://localhost:5173` |

> Al usar Nginx, el frontend usa URLs relativas del API (`/api`), así que CORS no es necesario. Esto es solo un respaldo para desarrollo local.

## Nginx

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `ENABLE_INTERNAL_NGINX` | Habilitar contenedor Nginx | `true` |
| `NGINX_PORT` | Puerto HTTP de Nginx | `80` |
| `NGINX_HTTPS_PORT` | Puerto HTTPS de Nginx | `443` |

## Almacenamiento

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `STORAGE_PROVIDER` | Backend de almacenamiento (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Directorio de subidas local | `./uploads` |

## Marca

Todas las variables de marca (`APP_NAME`, `APP_TAGLINE`, etc.) se propagan a:

- Navbar, Hero, Footer (componentes React)
- Meta tags SEO, OpenGraph, Twitter cards
- Datos estructurados (JSON-LD)
- Título del navegador
- Contenido del FAQ
- Enlace "Powered by" en perfiles públicos
- Páginas de Política de Privacidad y Términos de Servicio

Para reformar toda la aplicación, cambia estos valores en `.env` y reconstruye.

---

← [Variables de Entorno](./environment-variables.md) · [Guía de Usuario](./user-guide.md) →
