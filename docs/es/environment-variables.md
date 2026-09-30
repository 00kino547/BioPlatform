# Variables de Entorno

## Aplicación

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `APP_NAME` | Nombre de la aplicación | `BioPlatform` |
| `APP_TAGLINE` | Lema corto | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Descripción completa | `Create a stunning profile page...` |
| `APP_URL` | URL pública | `http://localhost:80` |
| `APP_URL_HOST` | Hostname sin el esquema del propio dominio de la app (p. ej. `example.com`). Nginx lo usa para detectar las peticiones dirigidas al dominio de la app y solo enrutar al backend las peticiones a la **raíz** de los dominios **personalizados** procedentes de crawlers sociales, con el fin de servir el Open Graph renderizado en el servidor. | _(vacío → no se detecta el dominio de la app)_ |
| `APP_GITHUB_URL` | URL del repositorio de GitHub | `https://github.com/00kino547/BioPlatform` |

## Frontend

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `VITE_API_URL` | URL del API del backend (usa `/api` para el proxy Nginx) | `/api` |
| `VITE_APP_NAME` | Nombre de la app en el frontend | `BioPlatform` |
| `VITE_APP_TAGLINE` | Lema del frontend | `Your digital identity, beautifully crafted.` |
| `VITE_APP_DESCRIPTION` | Descripción del frontend | `Create a stunning profile page...` |
| `VITE_APP_URL` | URL pública del frontend | `http://localhost:80` |
| `VITE_APP_GITHUB_URL` | URL de GitHub en el frontend | `https://github.com/00kino547/BioPlatform` |
| `VITE_APP_OG_IMAGE` | Imagen predeterminada de Open Graph/embed de Discord | `<VITE_APP_URL>/og.png` |
| `VITE_CONTACT_URL` | URL de contacto/soporte | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | URL de la página de estado | _(vacío)_ |
| `VITE_DOCS_URL` | URL de la documentación | `https://github.com/00kino547/BioPlatform/tree/main/docs` |

> Las variables del frontend se inyectan en tiempo de ejecución mediante el entrypoint del contenedor a través de `window.__APP_CONFIG__`. También funcionan en tiempo de compilación mediante `import.meta.env.VITE_*`.

## Backend

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `PORT` | Puerto del servidor backend | `3000` |
| `NODE_ENV` | Modo de entorno | `development` |

## Base de Datos

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL | — (requerido) |
| `POSTGRES_USER` | Usuario de PostgreSQL | `postgres` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `postgres` |
| `POSTGRES_DB` | Nombre de la base de datos PostgreSQL | `bioplatform` |

## Seguridad

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `JWT_SECRET` | Secreto para firmar los tokens JWT | — (requerido) |
| `JWT_EXPIRES_IN` | Duración de expiración del token JWT | `7d` |
| `TRUST_PROXY` | Número de saltos de proxy de confianza (se usa para resolver la IP real del cliente en el rate limiting de autenticación) | `1` |
| `CF_TRUSTED_IPS` | IPs/CIDRs de origen de los proxies de confianza, separadas por comas. Nginx confía en el encabezado `X-Forwarded-For` de estos orígenes para restaurar la IP real del cliente (es decir, desde dónde se conecta el proxy inverso; consulta `docs/es/deployment.md` → Proxy Inverso). Solo se confía en el encabezado de estos orígenes. | `172.16.0.0/12,127.0.0.1,::1` |
| `AUTH_LOCK_POLICY` | Política de bloqueo de cuenta: `block` (rechazar todo), `trusted_ip` (las IP registradas y las de los últimos accesos pueden iniciar sesión sin desbloqueo), `email` (el desbloqueo exige un enlace por correo) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Duración del bloqueo en minutos tras agotarse los intentos gratuitos; `-1` = bloqueo permanente | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | TTL en minutos del enlace de desbloqueo por correo (política `email`) | `30` |
| `EMAIL_VERIFY_TOKEN_TTL_HOURS` | TTL en horas del enlace de verificación de correo enviado tras el registro (las cuentas cuyo correo no esté verificado no pueden iniciar sesión hasta confirmarlo) | `72` |
| `AUTH_LOG_RETENTION_DAYS` | Retención del registro de autenticación en días antes de que la tarea de limpieza elimine las entradas | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | Cada cuántos minutos se ejecuta la tarea de limpieza del registro de autenticación | `60` |

## Admin / Seed

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `ADMIN_EMAIL` | Email del administrador inicial (el seed crea esta cuenta) | `admin@localhost.localhost` |
| `ADMIN_USERNAME` | Nombre de usuario del administrador inicial | `admin` |
| `ADMIN_PASSWORD` | Contraseña del administrador inicial (configura un valor fuerte y único) | — (requerida para el primer arranque) |
| `SEED_ON_START` | Cuando es `true`, el entrypoint ejecuta el seed de la base de datos al iniciar (crea el admin y los códigos de invitación si no existen). Configúralo en `true` en el primer arranque y elimínalo después. | `false` |

## Email (SMTP)

SMTP se usa para los enlaces de desbloqueo de cuentas y las notificaciones. Deja `SMTP_ENABLED=false` para desactivarlo.

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `SMTP_ENABLED` | Habilita el envío de correos | `false` |
| `SMTP_PROVIDER` | Preajuste del proveedor de correo (`gmail`, `outlook`, `custom`) | `gmail` |
| `SMTP_HOST` | Hostname del servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Puerto del servidor SMTP | `587` |
| `SMTP_USER` | Nombre de usuario / email SMTP | _(vacío)_ |
| `SMTP_PASS` | Contraseña / contraseña de aplicación SMTP | _(vacío)_ |
| `SMTP_FROM_NAME` | Nombre del remitente | `BioPlatform` |
| `SMTP_FROM_EMAIL` | Email del remitente | _(vacío)_ |

## Boletín (Newsletter)

Los boletines se entregan a través de la misma pila de correo; `NEWSLETTER_PROVIDER` selecciona el transporte. Existen dos vías de envío: un perfil puede enviar con su **propio servidor SMTP** (`/api/newsletter/sender`, con dominio verificado por DNS y prueba superada; PRO/ENTERPRISE o en la lista de permitidos), o — para administradores y, opcionalmente, usuarios aprobados por el propietario de la instancia — a través del **remitente de la plataforma** (la pila `SMTP_*`/Resend de la instancia). El envío respeta los límites de volumen por plan (predeterminados: FREE 0 / PRO 1 / ENTERPRISE 5 envíos cada 24 h), que el panel de administración puede sobrescribir por plan.

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `NEWSLETTER_PROVIDER` | Transporte del boletín: `smtp` (configura `SMTP_*` arriba) o `resend` (configura `RESEND_API_KEY`) | `smtp` |
| `RESEND_API_KEY` | Clave de API para el proveedor `resend` | _(vacío)_ |
| `RESEND_FROM` | Dirección del remitente para el proveedor `resend` | _(vacío)_ |
| `NEWSLETTER_UNSUBSCRIBE_TTL_DAYS` | Validez de los enlaces de baja con un solo clic (días) | `365` |
| `NEWSLETTER_MAILING_ADDRESS` | Dirección postal física exigida por CAN-SPAM/CASL, incluida en el pie de cada boletín. Cuando está vacía, se usa la URL del sitio (`VITE_APP_URL`) como sustituto obligatorio de la dirección postal | _(vacío)_ |
| `NEWSLETTER_SELF_RECIPIENT_CAP` | Límite de destinatarios por envío para perfiles que usan su propio servidor SMTP | `1000` |
| `NEWSLETTER_PLATFORM_SMTP_ENABLED` | Opt-in del propietario de la instancia que permite a usuarios **no administradores** enviar por el remitente de la plataforma. Desactivado por defecto. Cuando se activa, la cuenta **también** debe estar en la lista de permitidos por usuario en **Admin → Newsletter → Sender allowlist** (el mismo indicador que exime del plan/DNS del servidor propio) | `false` |
| `NEWSLETTER_PLATFORM_RECIPIENT_CAP` | Límite de destinatarios por envío para usuarios aprobados por el propietario en el remitente de la plataforma (los administradores mantienen el límite fijo de 5000) | `100` |

Todo correo de boletín incluye un enlace de baja con un solo clic en funcionamiento, la identidad del remitente y la dirección postal (o el sustituto del sitio web) independientemente de la configuración anterior.

## Tienda de productos

La tienda de productos por perfil (bienes digitales vendidos por producto y pagados con las pasarelas configuradas) se configura con estas variables. Los archivos entregables se guardan en el subárbol privado `products/` y solo se sirven mediante la ruta de descarga firmada; el límite de productos por perfil viene del plan (FREE = 3, PRO/Enterprise ilimitados).

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `PRODUCT_FILE_MAX_MB` | Tamaño máximo del archivo entregable de un producto (en megabytes) | `50` |
| `PRODUCT_DOWNLOAD_TTL_HOURS` | Validez de los enlaces de descarga firmados que reciben los compradores (horas) | `168` |
| `PRODUCT_PURCHASE_TOKEN_TTL_DAYS` | Validez del token de cliente para consultar el estado de una compra como invitado durante el checkout (días) | `30` |

## Comprobación de actualizaciones

El backend consulta periódicamente el CHANGELOG público de `APP_GITHUB_URL` para decidir si hay una actualización disponible y cuál es su gravedad. Cuando el resultado es `security` o `critical`, los endpoints sensibles desde el punto de vista de la seguridad (passkeys, TOTP, cambio de contraseña, mutaciones de usuarios/roles/insignias de admin y creación/edición/rotación/eliminación de webhooks) devuelven `403` hasta que la app esté actualizada. Un fallo nunca bloquea la app (`GET /api/version` falla de forma abierta).

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `UPDATE_CHECK_ENABLED` | Cuando es `false`, la comprobación de versiones queda completamente desactivada y `/api/version` siempre informa de la versión instalada con severidad `none` | `true` |
| `UPDATE_CHECK_INTERVAL_MINUTES` | Cada cuántos minutos se realiza una comprobación nueva (tanto el programador en segundo plano como la caché de peticiones). También se ejecuta una comprobación automáticamente en cada reinicio del contenedor/stack. Usa `?force=1` para omitir la caché | `720` |
| `UPDATE_CHECK_STALE_MAX_MINUTES` | Edad máxima de un resultado en caché que aún se sirve cuando una consulta nueva falla (stale-while-error) | `1440` |
| `UPDATE_CRITICAL_STALE_THRESHOLD` | Número de versiones omitidas que, por sí solo, eleva la severidad a `critical` | `3` |
| `UPDATE_CHECK_INCLUDE_PRERELEASES` | Cuando es `false` (predeterminado), las versiones preliminares (`1.3.0-rc.1`, `1.0.0-beta.2`, …) quedan excluidas de la comprobación de actualizaciones: no aparecen como actualizaciones, no se cuentan para los umbrales de versiones omitidas/antiguas y nunca elevan la severidad ni bloquean el panel de administración — solo se muestran como una notificación mínima de "Pre-release vX.Y.Z available" a los administradores en el panel. Cuando es `true`, las preliminares se incluyen como actualizaciones normales y pueden elevar la severidad a `security` (lo que bloquea los ajustes sensibles a la seguridad), pero nunca a `critical` | `false` |

## Caché

La plataforma guarda en caché datos de alta demanda a través de un controlador (driver) conectable: resultados del comprobador de actualizaciones, la tarjeta Open Graph de la página de inicio, las tarjetas Open Graph de los perfiles, el ajuste de perfil destacado y el tema de temporada activo. Todos los drivers son de mejor esfuerzo: si el backend de caché no está disponible, la app recurre a la fuente en vivo (base de datos / consulta externa) y sigue funcionando.

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `CACHE_DRIVER` | Backend de caché: `memory` (Map en proceso, solo instancia única), `redis` (compartido, recomendado), `file` (archivos JSON en disco), `db` (tabla `cache_entries` en PostgreSQL) | `redis` |
| `CACHE_REDIS_URL` | URL de conexión de Redis. Dentro de la red de Docker es `redis://redis:6379`. Compatible por cable con Redis, Valkey, KeyDB, Dragonfly, etc. | `redis://localhost:6379` |
| `CACHE_FILE_DIR` | Directorio del driver `file` | `./data/cache` (Docker: `/app/data/cache`) |

El stack de Docker incluye su propia caché compatible con Redis (Valkey) en el servicio `redis` en el puerto `6379`, vinculado solo a localhost. Las cachés en memoria memoizadas (mapa del OG de perfil, comprobador de versiones) se mantienen por encima del driver, que actúa como capa compartida.

## Captcha

Verificación humana en el registro y en el inicio de sesión. Cuando hay un proveedor configurado (`CAPTCHA_PROVIDER` no es `none`), el frontend muestra un widget en los formularios de registro e inicio de sesión y `POST /api/auth/register` + `POST /api/auth/login` exigen un `captchaToken` de desafío válido (verificado en el servidor contra la API de siteverify del proveedor).

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `CAPTCHA_PROVIDER` | Proveedor de desafío: `none` \| `turnstile` (Cloudflare) \| `recaptcha` (Google) \| `hcaptcha` | `none` |
| `CAPTCHA_SITE_KEY` | Clave pública del cliente — segura de exponer en el navegador | `""` |
| `CAPTCHA_SECRET_KEY` | Clave secreta del servidor — nunca se expone al cliente | `""` |

## Analíticas

Analíticas externas/autoalojadas opcionales. El rastreador está **limitado por consentimiento en el cliente**: los scripts solo se cargan después de que un visitante acepte las cookies no esenciales, y nunca para visitantes que envíen Do Not Track (`DNT: 1`) o Global Privacy Control (`Sec-GPC: 1`). El backend también se niega a registrar sus propias analíticas agregadas (vistas de página, clics en enlaces) para los visitantes que envían esas señales.

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `ANALYTICS_PROVIDER` | Proveedor: `none` \| `matomo` (autoalojado) | `none` |
| `ANALYTICS_MATOMO_URL` | URL base de la instancia de Matomo autoalojada (p. ej. `https://analytics.example.com`) — ambos valores son seguros de exponer | `""` |
| `ANALYTICS_MATOMO_SITE_ID` | ID de sitio (web) de Matomo sobre el que se rastrea | `0` |

## PocketBase (integración opcional)

Una instancia opcional de PocketBase puede respaldar **analíticas del lado del cliente** (Fase A), **inicio de sesión OAuth** (Fase B) y, en el futuro, almacenamiento/contenido. Los cuatro interruptores de módulo están **todos DESACTIVADOS por defecto**; nada se ejecuta hasta que el operador configure `POCKETBASE_URL` (dirección de cara al servidor) más la bandera correspondiente. El navegador nunca habla con PocketBase directamente — publica a través de la ruta de proxy del mismo origen `POCKETBASE_CLIENT_URL` (nginx `/api/pb-speed → pocketbase:8090`), lo que además mantiene URLs seguras para la marca en la SPA.

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `POCKETBASE_URL` | URL base de PocketBase de cara al servidor (`""` vacío = integración desactivada) | `""` |
| `POCKETBASE_CLIENT_URL` | Ruta/URL pública a la que publica el navegador (el proxy nginx de `pb-speed`) | `/api/pb-speed` |
| `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` | Superusuario de PocketBase usado para el bootstrap y lecturas internas — nunca se expone | `""` |
| `POCKETBASE_AUTH_COLLECTION` | Colección de autenticación que guarda los registros de identidad (se usa para el acceso con PB) | `users` |
| `POCKETBASE_OAUTH_ENABLED` | Activa el botón de inicio de sesión con PocketBase en Acceso/Registro y los endpoints `/api/auth/oauth/pocketbase/*` | `false` |
| `POCKETBASE_ANALYTICS_ENABLED` | Activa el rastreador de analíticas del lado del cliente limitado por consentimiento que escribe en PocketBase | `false` |
| `POCKETBASE_STORAGE_ENABLED` / `POCKETBASE_CONTENT_ENABLED` | Reservados para futuros módulos de almacenamiento/contenido | `false` |
| `POCKETBASE_BOOTSTRAP` | Auto-crea las colecciones necesarias al arrancar (fail-soft) | `true` |
| `POCKETBASE_MAX_UPLOAD_MB` | Tamaño máximo de subida aceptado para subidas respaldadas por PB | `50` |

## Secciones de enlaces, iconos y códigos QR

Indicadores de funciones opcionales por decisión del operador de la instancia para el editor de enlaces sociales y el perfil público. Cuando un indicador está **desactivado**, los controles correspondientes del editor se ocultan **y** el perfil público ignora los datos guardados (el backend sigue guardándolos, así que activar un indicador más adelante no exige volver a introducir nada). Los lee `GET /api/features`.

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `LINKS_SECTIONS_ENABLED` | Agrupa los enlaces bajo encabezados de sección de texto libre (`heading` por enlace, máx. 48 caracteres) | `false` |
| `LINKS_CUSTOM_ICONS_ENABLED` | Permite un favicon personalizado por enlace — un emoji (`icon`, máx. 24 caracteres) o una imagen subida (`image`, desde `POST /api/profiles/me/link-icon`) — mostrado en lugar del logotipo de la plataforma | `false` |
| `LINKS_QR_ENABLED` | Activa los códigos QR por enlace: genera/descarga en el panel y muestra un QR escaneable en el perfil público para los enlaces con `showQr` | `false` |

## WebAuthn (passkeys)

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `WEBAUTHN_RP_ID` | ID del relying party — el dominio registrable **sin puerto** (p. ej. `localhost`, `example.com`) | `localhost` |
| `WEBAUTHN_ORIGIN` | El **origen exacto** que el navegador usa para llegar a la app (esquema + host + puerto; los puertos predeterminados se omiten). Separa varios orígenes con comas (p. ej. `http://localhost:80,https://localhost`). Debe coincidir con precisión con la barra de direcciones o el registro/autenticación de passkeys fallará con el error "Passkey registration failed". | `http://localhost:80` |
| `WEBAUTHN_RP_NAME` | Nombre que se muestra en el aviso de passkey | `BioPlatform` |

> El origen se compara byte a byte con el origen comunica el navegador. Si tu despliegue se sirve por HTTPS en el puerto predeterminado (como hace la configuración de Docker), usa `https://<host>` y no `http://<host>:80`. Si accedes por HTTP normal en el puerto 80, usa `http://<host>:80`. En producción, este es tu dominio público (p. ej. `https://bio.example.com`). Si quieres permitir ambos (p. ej. un despliegue local HTTP más un dominio HTTPS), indica ambos orígenes separados por comas.

## CORS

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `CORS_ORIGIN` | Orígenes permitidos (separados por comas) | `http://localhost:5173` |

## Nginx

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `ENABLE_INTERNAL_NGINX` | Activa el contenedor de proxy inverso Nginx (requiere `--profile nginx` en docker compose) | `true` |
| `NGINX_PORT` | Puerto HTTP de Nginx | `80` |
| `NGINX_HTTPS_PORT` | Puerto HTTPS de Nginx | `443` |
| `TLS_MODE` | Modo de certificados TLS: `development` genera automáticamente certificados autofirmados que se guardan como `self-signed.pem`/`self-signed.key` en `./certs` (enlazados simbólicamente como `cert.pem`/`key.pem`); `production` elimina cualquier archivo autofirmado y exige `cert.pem` + `key.pem` válidos proporcionados por el usuario (nginx no arranca si no existen) | `development` |
| `SEND_HSTS_ON_DEV` | También envía la cabecera `Strict-Transport-Security` en modo development (`true`/`false`). En modo `production` el HSTS se envía siempre. | `false` |

## Almacenamiento

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `STORAGE_PROVIDER` | Backend de almacenamiento (`local`, `s3`, `r2`, `b2`) | `local` |
| `LOCAL_STORAGE_PATH` | Directorio local de subidas | `./uploads` |
| `S3_ENDPOINT` | URL del punto final (endpoint) compatible con S3. Déjalo vacío para AWS S3; establece la URL de tu R2 (`https://<cuenta>.r2.cloudflarestorage.com`), MinIO, Wasabi o DigitalOcean Spaces para otros proveedores | _(vacío)_ |
| `S3_REGION` | Región de AWS (o `auto` para proveedores que la ignoran) | `auto` |
| `S3_ACCESS_KEY_ID` | Clave de acceso compatible con S3 | _(vacío)_ |
| `S3_SECRET_ACCESS_KEY` | Clave secreta de acceso compatible con S3 | _(vacío)_ |
| `S3_BUCKET` | Nombre del contenedor (bucket). Se crea automáticamente en la primera subida si no existe | _(vacío → obligatorio para `s3`/`r2`)_ |
| `S3_PREFIX` | Prefijo de clave opcional dentro del contenedor (p. ej. `bio/uploads`) | _(vacío)_ |
| `S3_FORCE_PATH_STYLE` | Usa direccionamiento por ruta de acceso (`true` para MinIO) | `false` |
| `B2_APPLICATION_KEY_ID` | ID de clave de aplicación de Backblaze B2 | _(vacío)_ |
| `B2_APPLICATION_KEY` | Clave secreta de aplicación de Backblaze B2 | _(vacío)_ |
| `B2_BUCKET` | Nombre del contenedor B2. Se crea automáticamente en la primera subida si no existe | _(vacío → obligatorio para `b2`)_ |
| `B2_PREFIX` | Prefijo de clave opcional dentro del contenedor (p. ej. `bio/uploads`) | _(vacío)_ |
| `B2_API_URL` | URL base de la API de Backblaze B2 (solo sobrescribe puntos finales personalizados/regionales) | `https://api.backblazeb2.com` |
| `STORAGE_COMPRESS_ENABLED` | Comprime con gzip (nivel 9) las subidas en la nube en reposo (archivos ≥ 1 KB); el disco local permanece sin comprimir. El lado de lectura detecta gzip por bytes mágicos, por lo que cambiar el valor no es destructivo | `true` |
| `ORPHAN_CLEANUP_ENABLED` | Activa la tarea programada de limpieza de subidas huérfanas (`true`/`false`) | `true` |
| `ORPHAN_CLEANUP_INTERVAL_MINUTES` | Cada cuántos minutos escanea el almacenamiento la tarea de limpieza de huérfanos | `360` |
| `ORPHAN_CLEANUP_GRACE_HOURS` | Edad mínima (en horas) antes de considerar huérfano un archivo sin referenciar; protege las subidas en curso | `24` |
| `MEDIA_CACHE_MAX_AGE_HOURS` | Edad máxima de las miniaturas de `.media-cache` y de los originales materializados antes de que la tarea de limpieza los elimine (se regeneran bajo demanda) | `168` |
| `MEDIA_CACHE_MAX_ENTRIES` | Número máximo de archivos en `.media-cache`; cuando se supera se eliminan los más antiguos | `2000` |
| `MEDIA_CACHE_MAX_SIZE_MB` | Tamaño total máximo de `.media-cache` en MB; cuando se supera se eliminan los más antiguos | `512` |

> Tanto los proveedores compatibles con S3 (`s3`/`r2` mediante el SDK de AWS) como el nativo de Backblaze B2 (`b2` mediante la API HTTP de B2) están soportados. Consulta `docs/es/storage.md` para la configuración de proveedores y `docs/es/storage-migration.md` para la CLI de migración.

## Discord

La integración de Discord (vinculación de cuenta, widget de presencia, previsualizaciones de enlaces, "Post to Discord") solo se activa cuando están configuradas las tres variables de OAuth. Déjalas vacías para desactivar la función por completo — el Dashboard muestra una tarjeta de "no disponible". La presencia en vivo además requiere `DISCORD_BOT_TOKEN`; sin él, la conexión sigue funcionando pero no se muestra ninguna presencia.

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | ID de cliente de la aplicación de Discord | _(vacío)_ |
| `DISCORD_CLIENT_SECRET` | Secreto de cliente de la aplicación de Discord | _(vacío)_ |
| `DISCORD_REDIRECT_URI` | URI de redirección de OAuth2 (debe coincidir con el Discord Developer Portal) | `http://localhost:80/api/discord/callback` |
| `DISCORD_BOT_TOKEN` | Token del bot que controla la presencia en vivo (activa el **Presence Intent** privilegiado e invita al bot a un servidor compartido por tus usuarios) | _(vacío)_ |
| `DISCORD_GUILD_INVITE` | Invitación opcional a un servidor de Discord que se muestra como botón "Join presence hub" en la pestaña Discord del Dashboard | _(vacío)_ |

## ACME (TLS automático para dominios personalizados)

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `ACME_ENABLED` | Cuando es `true`, el backend emite y renueva automáticamente los certificados de Let's Encrypt (HTTP-01) para cada dominio personalizado ACTIVE y gestiona la configuración nginx de los dominios personalizados. Requiere que el DNS de cada dominio apunte a este servidor y que el puerto 80 sea accesible. | `false` |
| `ACME_DIRECTORY_URL` | URL del directorio ACME. Usa la URL de staging de Let's Encrypt para las pruebas y evitar los límites de tasa. | `https://acme-v02.api.letsencrypt.org/directory` |
| `ACME_EMAIL` | Email de contacto registrado en la cuenta ACME. | _(vacío)_ |
| `ACME_RENEW_BEFORE_DAYS` | Renueva los certificados que expiran en menos de este número de días. | `30` |
| `ACME_INTERVAL_MINUTES` | Cada cuánto revisa el backend los certificados que requieren emisión o renovación (también regenera la configuración nginx de los dominios personalizados). | `60` |
| `ACME_MAX_DOMAINS_PER_RUN` | Máximo de dominios procesados por comprobación (protección frente a los límites de tasa de ACME). | `20` |
| `ACME_CERTS_PATH` | Directorio donde residen los certificados, la clave de la cuenta ACME y la configuración nginx generada. En Docker es la misma carpeta del host montada en nginx en `/etc/nginx/certs` (`./certs`). | `certs` |

> Crea la aplicación en el [Discord Developer Portal](https://discord.com/developers/applications) (Applications → New Application). Registra la URI de redirección en **OAuth2 → Redirects**, y copia el Client ID y el Client Secret. Los usuarios autorizados otorgan solo `identify` con `prompt=consent` (vinculación de cuenta + embeds de webhook). Para la presencia en vivo, crea un usuario **Bot** en la misma aplicación (Bot → Add Bot), activa el "Presence Intent" privilegiado (Settings → Bot → Privileged Gateway Intents), copia el token del bot e invita al bot a un servidor. El estado de un usuario solo es visible mientras esté en un servidor compartido con el bot.

## Facturación / Pedidos

| Variable | Descripción | Predeterminado |
|----------|-------------|---------|
| `BILLING_MODE` | Modo de facturación para la compra de planes. `one-time` está activo ahora; `subscription` y `fixed-term` son marcadores planificados para la futura capa de pago. | `one-time` |
| `BILLING_PRICE_PRO_CENTS` | Precio base del plan Premium (PRO) en unidades menores (céntimos). | `500` |
| `BILLING_PRICE_ENTERPRISE_CENTS` | Precio base del plan Enterprise en unidades menores (céntimos). | `2900` |
| `BILLING_CURRENCY` | Código de moneda ISO-4217 aplicado a los precios de los planes (se muestra a los usuarios). | `USD` |
| `STRIPE_ENABLED` | Activa los pagos con tarjeta (Stripe Checkout). En `false`, el método Stripe se oculta y se rechaza. | `false` |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_...`). Se usa para crear sesiones de Checkout y para reembolsar pagos en el servidor. | — |
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma del webhook de Stripe (`whsec_...`) usado para verificar los eventos `checkout.session.completed` / `checkout.session.expired` en `POST /api/payments/webhooks/stripe`. | — |
| `PAYPAL_ENABLED` | Activa los pagos con PayPal (pedidos de PayPal Checkout). | `false` |
| `PAYPAL_MODE` | Entorno de PayPal: `sandbox` o `live`. | `sandbox` |
| `PAYPAL_CLIENT_ID` | Client id de la API de PayPal usado para obtener tokens de acceso OAuth. | — |
| `PAYPAL_CLIENT_SECRET` | Client secret de la API de PayPal (solo se guarda en el servidor). | — |
| `PAYPAL_WEBHOOK_ID` | Id del webhook de PayPal usado para verificar los eventos IPN entrantes mediante la API `verify-webhook-signature`. | — |
| `CRYPTO_ENABLED` | Activa los pagos con cripto (facturas BTCPay Server + BitPay). | `false` |
| `CRYPTO_PROVIDERS` | Proveedores habilitados separados por comas. El orden importa: define el predeterminado y el orden mostrado a los usuarios. `btcpayserver`, `bitpay`. | `btcpayserver` |
| `BTCPAY_URL` | URL base del BTCPay Server (p. ej. `https://pay.example.com`). Opcional salvo que `btcpayserver` esté habilitado. | — |
| `BTCPAY_API_KEY` | Clave de API del BTCPay Server (token `...`) con permisos de lectura de tienda y creación de facturas. | — |
| `BTCPAY_STORE_ID` | Id de la tienda del BTCPay Server. | — |
| `BTCPAY_WEBHOOK_SECRET` | Secreto del webhook del BTCPay Server, verificado como `sha256=HMAC-SHA256(payload, secret)` desde la cabecera `BTCPay-Sig`. | — |
| `BITPAY_API_KEY` | Token de vinculación de BitPay usado como cabecera `X-Identity` y como clave HMAC-SHA512 de la cabecera `X-Signature` en las peticiones. | — |
| `BITPAY_WEBHOOK_SECRET` | Secreto del webhook de BitPay, verificado como HMAC-SHA512 del cuerpo crudo (cabecera `x-bitpay-signature`). | — |
| `CRYPTO_COINS` | Criptomonedas ofrecidas a los compradores cripto separadas por comas: `BTC`, `LTC`, `XMR`, `USDT`, `ETH`. | `BTC,LTC,XMR` |
| `CRYPTO_RATE_SOURCE` | Fuente de los precios en USD de las criptomonedas. `coingecko` usa la API `simple/price` de CoinGecko. | `coingecko` |
| `CRYPTO_RATE_FALLBACK` | Precios de respaldo por entorno `COIN=USD` separados por comas (p. ej. `BTC=90000,LTC=80`), usados cuando la fuente en vivo no está disponible. | — |
| `CRYPTO_RATE_CACHE_SECONDS` | Tiempo que se cachea una tasa `COIN → USD` obtenida. `0` desactiva la caché y siempre vuelve a consultar. | `300` |

Cuando no hay ninguna pasarela en línea habilitada, el pago es manual: los usuarios crean un pedido `PENDING` de tipo "MANUAL" desde la pestaña Facturación del panel (con el precio calculado en el servidor y el descuento de afiliado aplicado) y el propietario de la plataforma lo marca como pagado/cancelado/reembolsado desde la pestaña **Pedidos** del panel de administración al recibir el pago. El administrador también configura el método de contacto para pagos manuales (email/Telegram/Discord/WhatsApp), guardado como ajuste del sistema y mostrado a los usuarios y en la página pública de precios.

Con una pasarela habilitada, `POST /api/orders/me` sigue creando el pedido `PENDING` **y** la sesión de pago en Stripe / PayPal / el proveedor cripto, devolviendo un `checkout.url` que el usuario abre para pagar. El cumplimiento es automático: el webhook del proveedor (`/api/payments/webhooks/*`) marca el pedido como PAID y mejora al comprador de plan inmediatamente. Los reembolsos se registran pero nunca degradan un plan; las sesiones canceladas/expiradas solo cancelan pedidos `PENDING`.

## Marca

Todas las variables de marca (`APP_NAME`, `APP_TAGLINE`, etc.) se usan en:

- Navbar, Hero, Footer (componentes React)
- Meta tags de SEO, OpenGraph, Twitter cards
- Datos estructurados (JSON-LD)
- Título del navegador
- Contenido del FAQ
- Enlace "Powered by" en los perfiles públicos
- Páginas de Política de Privacidad y Términos de Servicio

Consulta [Configuración](./configuration.md) para ver las descripciones detalladas de cada variable.

---

← [Inicio Rápido](./getting-started.md) · [Configuración](./configuration.md) →
