# Variables de Entorno

## Aplicación

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `APP_NAME` | Nombre de la aplicación | `BioPlatform` |
| `APP_TAGLINE` | Lema corto | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Descripción completa | `Create a stunning profile page...` |
| `APP_URL` | URL pública | `http://localhost:80` |
| `APP_URL_HOST` | Hostname (sin scheme) del propio dominio de la app (p. ej. `example.com`). Nginx lo usa para detectar peticiones al dominio de la app y solo enrutar a los crawlers sociales que piden la **raíz** de dominios **personalizados** al backend para servir el OG renderizado en servidor. | _(vacío → no se detecta el dominio de la app)_ |
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
| `VITE_APP_OG_IMAGE` | Imagen Open Graph/embed de Discord por defecto | `<VITE_APP_URL>/og.png` |
| `VITE_CONTACT_URL` | URL de contacto/soporte | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | URL de página de estado | _(vacío)_ |
| `VITE_DOCS_URL` | URL de documentación | `https://github.com/00kino547/BioPlatform/tree/main/docs` |

> Las variables del frontend se inyectan en tiempo de ejecución por el entrypoint del contenedor via `window.__APP_CONFIG__`. También funcionan en tiempo de build via `import.meta.env.VITE_*`.

## Backend

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT` | Puerto del servidor backend | `3000` |
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
| `CF_TRUSTED_IPS` | IPs/CIDRs de origen separadas por comas de proxies de confianza cuya `X-Forwarded-For` nginx confía para restaurar la IP real del cliente (desde dónde se conecta el proxy inverso; ver `docs/es/deployment.md` → Proxy Inverso). Solo se confía en la cabecera de estos orígenes. | `172.16.0.0/12,127.0.0.1,::1` |
| `AUTH_LOCK_POLICY` | Política de bloqueo de cuenta: `block` (rechazar todo), `trusted_ip` (las IP registradas + de último acceso pueden iniciar sesión sin desbloquear), `email` (desbloqueo mediante enlace por correo) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Duración del bloqueo en minutos tras agotarse los intentos gratuitos; `-1` = bloqueo permanente | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | TTL en minutos del enlace de desbloqueo por correo (política `email`) | `30` |
| `AUTH_LOG_RETENTION_DAYS` | Retención del registro de autenticación en días antes de que la tarea de limpieza lo elimine | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | Cada cuántos minutos se ejecuta la tarea de limpieza del registro de autenticación | `60` |

## Admin / Seed

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `ADMIN_EMAIL` | Email del administrador inicial (la semilla crea esta cuenta) | `admin@bioplatform.com` |
| `ADMIN_USERNAME` | Nombre de usuario del administrador inicial | `admin` |
| `ADMIN_PASSWORD` | Contraseña del administrador inicial (configura un valor fuerte y único) | — (requerido para el primer inicio) |
| `SEED_ON_START` | Cuando es `true`, el entrypoint ejecuta la semilla de base de datos al iniciar (crea admin + códigos de invitación si no existen). Configura en `true` en el primer arranque, luego elimina. | `false` |

## Email (SMTP)

SMTP se usa para enlaces de desbloqueo de cuenta y notificaciones. Deja `SMTP_ENABLED=false` para deshabilitar.

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `SMTP_ENABLED` | Habilitar envío de correos | `false` |
| `SMTP_PROVIDER` | Preajuste de proveedor de correo (`gmail`, `outlook`, `custom`) | `gmail` |
| `SMTP_HOST` | Hostname del servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Puerto del servidor SMTP | `587` |
| `SMTP_USER` | Nombre de usuario / email SMTP | _(vacío)_ |
| `SMTP_PASS` | Contraseña / contraseña de aplicación SMTP | _(vacío)_ |
| `SMTP_FROM_NAME` | Nombre remitente | `BioPlatform` |
| `SMTP_FROM_EMAIL` | Email del remitente | _(vacío)_ |

## Comprobación de actualizaciones

El backend consulta periódicamente el CHANGELOG público de `APP_GITHUB_URL` para decidir si hay una actualización disponible y cuán grave es. Cuando el resultado es `security` o `critical`, los endpoints sensibles de seguridad (passkeys, TOTP, cambio de contraseña, mutaciones de usuarios/roles/badges de admin, creación/edición/rotación/borrado de webhooks) devuelven `403` hasta que la aplicación se actualice. Un fallo nunca bloquea la aplicación (`GET /api/version` falla de forma segura).

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `UPDATE_CHECK_ENABLED` | Cuando es `false`, la comprobación de actualizaciones está desactivada y `/api/version` siempre informa la versión instalada con severidad `none` | `true` |
| `UPDATE_CHECK_INTERVAL_MINUTES` | Cada cuántos minutos se realiza una comprobación nueva (tanto el planificador de fondo como la caché de peticiones). También se ejecuta una comprobación automáticamente en cada reinicio del contenedor/stack. Usa `?force=1` para omitir la caché | `720` |
| `UPDATE_CHECK_STALE_MAX_MINUTES` | Edad máxima de un resultado en caché que aún se sirve cuando una consulta nueva falla (stale-while-error) | `1440` |
| `UPDATE_CRITICAL_STALE_THRESHOLD` | Número de versiones omitidas que por sí solo eleva la severidad a `critical` | `3` |
| `UPDATE_CHECK_INCLUDE_PRERELEASES` | Cuando es `false` (por defecto), las versiones preliminares (`1.3.0-rc.1`, `1.0.0-beta.2`, …) quedan excluidas de la comprobación de actualizaciones: no aparecen como actualizaciones, no cuentan para los umbrales de versiones omitidas/antiguas y nunca elevan la severidad ni bloquean el panel de administración — solo se muestran como una notificación mínima "Pre-release vX.Y.Z available" a los administradores en el panel de administración. Cuando es `true`, las preliminares cuentan como actualizaciones normales y pueden elevar la severidad a `security` (que bloquea los ajustes sensibles), pero nunca a `critical` | `false` |

## WebAuthn (passkeys)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `WEBAUTHN_RP_ID` | Relying-party ID — el dominio registrable **sin puerto** (p. ej. `localhost`, `example.com`) | `localhost` |
| `WEBAUTHN_ORIGIN` | El **origen exacto** que el navegador usa para llegar a la aplicación (esquema + host + puerto; los puertos por defecto se omiten). Separa varios orígenes con comas (p. ej. `http://localhost:80,https://localhost`). Debe coincidir precisamente con la barra de direcciones o el registro/autenticación de passkeys fallará con "Passkey registration failed". | `http://localhost:80` |
| `WEBAUTHN_RP_NAME` | Nombre mostrado en la solicitud de passkey | `BioPlatform` |

> El origen se compara byte a byte contra el origen reportado por el navegador. Si tu despliegue se sirve por HTTPS en el puerto por defecto (como el setup de Docker), usa `https://<host>` — no `http://<host>:80`. Si lo accedes por HTTP plano en el puerto 80, usa `http://<host>:80`. En producción es tu dominio público (p. ej. `https://bio.example.com`). Si quieres permitir ambos (p. ej. un despliegue local HTTP más un dominio HTTPS), lista ambos orígenes separados por comas.

## CORS

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `CORS_ORIGIN` | Orígenes permitidos (separados por comas) | `http://localhost:5173` |

## Nginx

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `ENABLE_INTERNAL_NGINX` | Habilitar el contenedor de proxy inverso Nginx (requiere `--profile nginx` en docker compose) | `true` |
| `NGINX_PORT` | Puerto HTTP de Nginx | `80` |
| `NGINX_HTTPS_PORT` | Puerto HTTPS de Nginx | `443` |
| `TLS_MODE` | Modo de certificados TLS: `development` genera automáticamente certificados autofirmados (`self-signed.pem`/`self-signed.key` en `./certs`, enlazados como `cert.pem`/`key.pem`); `production` elimina los autofirmados y requiere `cert.pem` + `key.pem` válidos (nginx no arranca sin ellos) | `development` |
| `SEND_HSTS_ON_DEV` | Enviar la cabecera `Strict-Transport-Security` en modo development también (`true`/`false`). En modo `production` HSTS se envía siempre. | `false` |

## Almacenamiento

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `STORAGE_PROVIDER` | Backend de almacenamiento (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Directorio de subidas local | `./uploads` |

## Discord

La integración de Discord (vinculación de cuenta, widget de presencia, previsualizaciones de enlaces, "Post to Discord") solo se activa cuando las tres variables OAuth están configuradas. Déjalas vacías para deshabilitar la función por completo — el Dashboard muestra una tarjeta "no disponible". La presencia en vivo requiere además `DISCORD_BOT_TOKEN`; sin él, conectar sigue funcionando pero no se muestra ninguna presencia.

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `DISCORD_CLIENT_ID` | ID de cliente de la aplicación de Discord | _(vacío)_ |
| `DISCORD_CLIENT_SECRET` | Secreto de cliente de la aplicación de Discord | _(vacío)_ |
| `DISCORD_REDIRECT_URI` | URI de redirección de OAuth2 (debe coincidir con el Discord Developer Portal) | `http://localhost:80/api/discord/callback` |
| `DISCORD_BOT_TOKEN` | Token del bot que rastrea la presencia en vivo (habilita el **Presence Intent** privilegiado e invita al bot a un servidor que compartan tus usuarios) | _(vacío)_ |
| `DISCORD_GUILD_INVITE` | Invitación opcional a un servidor de Discord que se muestra como botón "Join presence hub" en la pestaña Discord del Dashboard | _(vacío)_ |

## ACME (TLS automático para dominios personalizados)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `ACME_ENABLED` | Cuando es `true`, el backend emite y renueva automáticamente certificados de Let's Encrypt (HTTP-01) para cada dominio personalizado ACTIVE y gestiona la configuración nginx de dominios personalizados. Requiere que el DNS de cada dominio apunte a este servidor y que el puerto 80 sea accesible. | `false` |
| `ACME_DIRECTORY_URL` | URL del directorio ACME. Usa la URL de staging de Let's Encrypt para pruebas y evitar límites de tasa. | `https://acme-v02.api.letsencrypt.org/directory` |
| `ACME_EMAIL` | Email de contacto registrado en la cuenta ACME. | _(vacío)_ |
| `ACME_RENEW_BEFORE_DAYS` | Renueva los certificados que expiren en menos de este número de días. | `30` |
| `ACME_INTERVAL_MINUTES` | Cada cuánto revisa el backend los certificados que necesitan emisión o renovación (también regenera la configuración nginx de dominios personalizados). | `60` |
| `ACME_MAX_DOMAINS_PER_RUN` | Máximo de dominios procesados por comprobación (protección frente a los límites de tasa de ACME). | `20` |
| `ACME_CERTS_PATH` | Directorio donde viven los certificados, la clave de cuenta ACME y la configuración nginx generada. En Docker es la misma carpeta del host montada en nginx en `/etc/nginx/certs` (`./certs`). | `certs` |

> Crea la aplicación en el [Discord Developer Portal](https://discord.com/developers/applications) (Applications → New Application). Registra la URI de redirección en **OAuth2 → Redirects** y copia el Client ID y el Client Secret. Los usuarios autorizados otorgan solo `identify` con `prompt=consent` (vinculación de cuenta + embeds de webhook). Para la presencia en vivo, crea un usuario **Bot** en la misma aplicación (Bot → Add Bot), activa el "Presence Intent" privilegiado (Settings → Bot → Privileged Gateway Intents), copia el token del bot e invita al bot a un servidor. El estado de un usuario solo es visible mientras esté en un servidor compartido con el bot.

## Marca

Todas las variables de marca (`APP_NAME`, `APP_TAGLINE`, etc.) se usan en:

- Navbar, Hero, Footer (componentes React)
- Meta tags SEO, OpenGraph, Twitter cards
- Datos estructurados (JSON-LD)
- Título del navegador
- Contenido del FAQ
- Enlace "Powered by" en perfiles públicos
- Páginas de Política de Privacidad y Términos de Servicio

Ver [Configuración](./configuration.md) para descripciones detalladas de cada variable.

---

← [Inicio Rápido](./getting-started.md) · [Configuración](./configuration.md) →
