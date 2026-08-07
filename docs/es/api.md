# Referencia de la API

BioPlatform expone una API REST bajo `/api`. La especificación OpenAPI 3.0 legible por máquina se sirve en `/api/openapi.json`, y una referencia renderizada vive en la app en `/api-docs`.

## Convenciones

- **URL base:** `/api` (relativa al origen de la instancia).
- **Autenticación:** la mayoría de los endpoints requieren `Authorization: Bearer <token>`. Los tokens se devuelven en `POST /api/auth/login` y `POST /api/auth/register`, y expiran después de `JWT_EXPIRES_IN`.
- **Errores:** todo error devuelve HTTP 4xx/5xx con `{ "success": false, "error": "mensaje legible" }`.
- **Éxito:** la mayoría de las respuestas devuelven `{ "success": true, "data": ... }`.
- **Content-Type:** JSON (`application/json`), excepto subidas de archivos (multipart) y descargas.

## Salud

### `GET /api/health`

Público. Devuelve `{ "status": "ok", "timestamp": "..." }`.

## Auth

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Crear una cuenta. Cuerpo: `username`, `email`, `password` (mínimo 12 caracteres), `inviteCode` opcional. Devuelve `token` + `user`. |
| `POST` | `/api/auth/login/start` | Descubrir los métodos de inicio de sesión de un identificador. Siempre devuelve `{ found: true }` para evitar la enumeración de cuentas. |
| `POST` | `/api/auth/login` | Iniciar sesión con `identifier` (usuario o email) + `password`. Devuelve `token` + `user`, o `requiresTwoFactor` cuando el 2FA está activado. |
| `POST` | `/api/auth/login/passkey/options` | Opciones de aserción WebAuthn para iniciar sesión sin contraseña (`identifier`). |
| `POST` | `/api/auth/login/passkey/verify` | Verificar la aserción e iniciar sesión. |
| `POST` | `/api/auth/2fa/totp` | Completar el inicio de sesión con un código TOTP (`token` + `code`). |
| `POST` | `/api/auth/2fa/passkey/options` | Opciones de aserción WebAuthn para el segundo factor. |
| `POST` | `/api/auth/2fa/passkey/verify` | Verificar la aserción del segundo factor. |
| `POST` | `/api/auth/passkeys/options` | Opciones de creación WebAuthn para registrar un passkey (`residentKey`). |
| `POST` | `/api/auth/passkeys/register` | Registrar un nuevo passkey. |
| `GET` | `/api/auth/passkeys` | Listar tus passkeys. |
| `DELETE` | `/api/auth/passkeys/:id` | Eliminar un passkey. |
| `POST` | `/api/auth/totp/setup` | Iniciar la inscripción TOTP. Devuelve `secret` + `otpauthUrl`. |
| `POST` | `/api/auth/totp/enable` | Activar TOTP con un `code` de verificación. |
| `POST` | `/api/auth/totp/disable` | Desactivar TOTP. |
| `GET` | `/api/auth/me` | Obtener el usuario actual. |
| `POST` | `/api/auth/change-password` | Cambiar tu contraseña (`currentPassword`, `newPassword` mínimo 12 caracteres). |
| `POST` | `/api/auth/unlock` | Solicitar un email de desbloqueo para un identificador. |
| `POST` | `/api/auth/unlock/verify` | Verificar un `token` de desbloqueo. |

## Perfiles

Cada cuenta tiene uno o más **perfiles**, cada uno con su propio slug, tema, enlaces y música. El perfil **principal** es el predeterminado de la cuenta. Los perfiles adicionales y los **aliases** (URLs cortas adicionales que apuntan a un perfil) están limitados por tu plan (`profileLimit` / `aliasLimit`) o por la anulación por usuario del administrador.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/profiles/me` | Listar tus perfiles con `limits`, `primaryId` y `aliasCount`. |
| `POST` | `/api/profiles/me` | Crear un perfil. Cuerpo: `slug` (en minúsculas) más los campos habituales del perfil. Devuelve el perfil creado. |
| `PUT` | `/api/profiles/me` | Actualizar tu perfil **principal** (retrocompatible). |
| `GET` | `/api/profiles/me/:profileId` | Obtener uno de tus perfiles. |
| `PATCH` | `/api/profiles/me/:profileId` | Actualizar un perfil (`slug`, `displayName`, `bio`, `location`, `website`, `socialLinks`, `theme`, `isPublic`). Cambiar el slug del perfil principal se rechaza. |
| `DELETE` | `/api/profiles/me/:profileId` | Eliminar un perfil. Si eliminas el perfil principal, el estado de principal pasa a tu perfil más antiguo restante; el último perfil no puede eliminarse. |
| `POST` | `/api/profiles/me/:profileId/primary` | Establecer un perfil como principal. |
| `GET` | `/api/profiles/me/:profileId/aliases` | Listar los aliases del perfil. |
| `POST` | `/api/profiles/me/:profileId/aliases` | Añadir un alias (cuerpo: `slug`). |
| `DELETE` | `/api/profiles/me/:profileId/aliases/:aliasId` | Eliminar un alias. |
| `POST` | `/api/profiles/me/:profileId/badges` | Activar/desactivar una insignia en un perfil (cuerpo: `badge` — un id de insignia — + `enabled`). Las insignias provienen del conjunto asignado por los administradores al usuario. |
| `POST` | `/api/profiles/me/avatar` | Subir un avatar (multipart, máximo 5 MB, JPEG/PNG/GIF/WebP). El `?profileId=` opcional lo limita a un perfil. |
| `DELETE` | `/api/profiles/me/avatar` | Eliminar tu avatar. `?profileId=` opcional. |
| `POST` | `/api/profiles/me/banner` | Subir un banner (multipart, mismos límites). `?profileId=` opcional. |
| `DELETE` | `/api/profiles/me/banner` | Eliminar tu banner. `?profileId=` opcional. |
| `GET` | `/api/profiles/me/export?format=xlsx\|ods` | Descargar tu perfil como hoja de cálculo. `?profileId=` opcional. |
| `POST` | `/api/profiles/me/import` | Importar tu perfil desde una hoja de cálculo (multipart `file`). `?profileId=` opcional. |
| `GET` | `/api/profiles/:identifier` | Obtener un perfil público por su **slug o alias**. La respuesta incluye `requestedSlug` (lo que pediste) y el `slug` canónico, además de `badges`. Sin email ni PII. Incluye un objeto de presencia `discord` solo cuando el propietario conectó Discord y optó por compartir la presencia. |
| `GET` | `/api/profiles/:identifier/og.png` | Tarjeta PNG 1200×630 renderizada en servidor (nombre, avatar, bio, línea de presencia, contadores de enlaces/clics) usada como imagen OpenGraph al compartir enlaces de perfil. |
| `POST` | `/api/profiles/click` | Registrar un clic en un enlace social (público; `profileId` + `platform`). |

> Los endpoints que gestionan música, ajustes de email, analíticas y ajustes de Discord aceptan un parámetro de consulta `?profileId=` opcional para limitarlos a un perfil específico. Si se omite, operan sobre el perfil principal de la cuenta.

### Exportación / Importación

- **Exportación** genera una hoja de cálculo de una sola pestaña con dos columnas: `Field` y `Value` (`.xlsx` por defecto, `.ods` con `?format=ods`). Las filas usan claves `displayName`, `bio`, `location`, `website`, `isPublic`, `social.<platform>` y `theme.<field>`. El archivo no contiene macros.
- **Importación** acepta `.xlsx`, `.ods` y `.csv` (máximo 5 MB). Los formatos con macros (`.xlsm`, `.xls`) se rechazan. Los valores que parecen fórmulas (que empiezan por `=`, `+`, `@`, tab/CR) se omiten. Las filas desconocidas o duplicadas se notifican como `warnings` en lugar de fallar toda la importación. La respuesta es `{ success, data: { applied: string[], warnings: string[] } }`. Importar reemplaza los campos actuales de tu perfil.

## Insignias

Las insignias son un catálogo gestionado por los administradores. Cada insignia tiene un `slug`, `label`, `color` e `icon`. Las insignias de perfil referencian las entradas del catálogo por id.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/badges` | Catálogo público de insignias. Devuelve todas las insignias (`id`, `slug`, `label`, `color`, `icon`). |

Los perfiles públicos devuelven `badges` como un array de ids de insignia; los clientes los resuelven contra este catálogo para renderizar los iconos de color.

## Analíticas

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/analytics/me` | Agregados de vistas y clics (total, 30d, 7d, 24h, por día, por plataforma, principales referentes). |

## Email

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/email/settings` | Tu configuración de notificaciones y si SMTP está configurado. |
| `PUT` | `/api/email/settings` | Actualizar `notifyOnView` / `notifyOnClick`. |
| `POST` | `/api/email/test` | Enviar un email de prueba. |

## Música

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/music/me` | Listar tus pistas y tu límite según el plan. |
| `POST` | `/api/music/me` | Añadir una pista (`provider` local/spotify/youtube, title/artist/url opcionales). |
| `POST` | `/api/music/me/upload` | Subir un archivo de audio (multipart). |
| `PATCH` | `/api/music/:id` | Actualizar una pista (`title`, `artist`, `position`, `fullUrl`). |
| `POST` | `/api/music/reorder` | Reordenar pistas (`ids`). |
| `DELETE` | `/api/music/:id` | Eliminar una pista. |

## Webhooks

Los webhooks entregan eventos JSON a tu propio endpoint para que puedas reaccionar a la actividad de tu perfil. Máximo 10 webhooks por cuenta.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/webhooks` | Listar tus webhooks con su entrega más reciente. |
| `POST` | `/api/webhooks` | Crear un webhook (`name`, `url`, `events`, `active`). Devuelve el `secret` de firma **exactamente una vez**. |
| `PATCH` | `/api/webhooks/:id` | Actualizar nombre, url, eventos o `active` (pausar/reanudar). |
| `POST` | `/api/webhooks/:id/rotate-secret` | Generar un nuevo secreto de firma (devuelto una vez). |
| `POST` | `/api/webhooks/:id/test` | Enviar una entrega `webhook.test`. Límite de 5/minuto/usuario. |
| `GET` | `/api/webhooks/:id/deliveries?limit=` | Entregas recientes (20 por defecto, máximo 50). |
| `DELETE` | `/api/webhooks/:id` | Eliminar el webhook y su historial de entregas. |

### Eventos

| Evento | Se dispara cuando |
| --- | --- |
| `profile.viewed` | Alguien visita tu perfil público. |
| `link.clicked` | Alguien hace clic en uno de tus enlaces sociales. |
| `profile.updated` | Actualizas tu perfil. |
| `webhook.test` | Disparas una entrega de prueba. |

### Carga útil de la entrega

Cada entrega es un `POST` con la forma:

```json
{
  "id": "delivery-uuid",
  "event": "profile.viewed",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": { }
}
```

El objeto `data` es mínimo y **no** contiene información personal (sin email, sin IP). Los webhooks y las entregas se limitan a eventos por usuario.

### Verificación de la firma

Cada petición incluye estas cabeceras:

- `X-BioPlatform-Id` — UUID de la entrega
- `X-BioPlatform-Event` — nombre del evento
- `X-BioPlatform-Timestamp` — marca de tiempo ISO
- `X-BioPlatform-Signature` — `sha256=<hex>` HMAC-SHA256 del **cuerpo de la petición en bruto** usando tu secreto de firma

Verifica en tu endpoint así:

```js
const crypto = require("crypto");
const rawBody = await readRawBody(req); // no uses un cuerpo parseado
const sig = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(rawBody).digest("hex");
const expected = `sha256=${sig}`;
if (req.headers["x-bi-platform-signature"] !== expected) {
  return res.status(401).end();
}
```

También confirma que `X-BioPlatform-Timestamp` sea reciente (p. ej. dentro de 5 minutos) para evitar ataques de repetición.

### Reintentos

Las entregas se intentan de forma síncrona y, si fallan, se reintentan con retroceso de 0s, 60s, 5m, 15m, 60m — hasta 5 intentos en total. Cada intento se registra en el historial de entregas (`GET /api/webhooks/:id/deliveries`) con su código de estado HTTP o error. Tras el último intento la entrega se marca como `failed`.

### Buenas prácticas

- Responde **rápidamente** con un 2xx (antes de tu timeout de 10s); haz el trabajo real en una tarea en segundo plano.
- Devuelve un no-2xx para disparar un reintento.
- Rechaza las peticiones con firma inválida antes de hacer nada.
- Configura un endpoint HTTPS; solo se aceptan URLs `http(s)`.

## Discord

Integración OAuth2 por usuario (sin bot, sin servidor compartido). Todos los endpoints requieren autenticación de usuario. Toda la integración está **deshabilitada** (devuelve `configured: false`, `/connect` devuelve 400) cuando `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` no están configuradas — ver [Variables de Entorno](./environment-variables.md).

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/discord` | Estado de la integración: `configured`, `connected`, `sessionActive`, la cuenta conectada (`username`, `globalName`, `avatar`), ajustes (`showDiscordPresence`, `showDiscordActivity`), `webhookConfigured` y una instantánea de presencia en caché. |
| `GET` | `/api/discord/connect` | Devuelve `{ url }` — la URL de autorización OAuth2 de Discord (scopes `identify gateway.connect`, `prompt=consent`). Requiere que la integración esté configurada. |
| `GET` | `/api/discord/callback` | Callback de OAuth2 (se visita en el navegador). Intercambia el código, crea/actualiza la `DiscordConnection` y redirige a `/dashboard?tab=discord&discord=connected|error`. |
| `POST` | `/api/discord/disconnect` | Desconectar Discord: detiene la sesión del gateway, elimina la conexión y desactiva compartir presencia. |
| `PUT` | `/api/discord/settings` | Actualizar `showDiscordPresence` (compartir presencia en el perfil público), `showDiscordActivity` (incluir detalles de actividad) o `webhookUrl` (cadena vacía la elimina). Inicia/detiene la sesión del gateway según corresponda. |
| `POST` | `/api/discord/post` | Enviar un embed "Post to Discord" al webhook guardado (o a un `url` pasado en el body): nombre visible, enlace al perfil, miniatura del avatar, bio y estado/actividad actual cuando compartir presencia está activo. |

La presencia mostrada en el perfil público y en la tarjeta OG siempre está condicionada por `showDiscordPresence`, y los detalles de actividad por `showDiscordActivity` — un usuario que nunca opta no es rastreado ni expuesto.

## Invitaciones y Administración

Los endpoints de invitaciones están restringidos a administradores (`POST /api/invites`, `DELETE /api/invites/:id`, `GET /api/invites`). Los endpoints de administración bajo `/api/admin/*` gestionan usuarios, planes, restablecimientos de contraseña, perfiles, bloqueos de autenticación, desbloqueos manuales, registros de autenticación, **roles** e **insignias**. El acceso de administración se basa en permisos (ver [Guía de Administración](./admin-guide.md) → Roles y Permisos).

## Límites de peticiones

- Vistas de perfiles públicos: 60 peticiones/minuto por IP.
- Entregas de prueba de webhooks: 5/minuto por usuario.
- Los endpoints de auth aplican bloqueo anti fuerza bruta (ver [Configuración](./configuration.md) `AUTH_LOCK_POLICY`).

---

← [Variables de Entorno](./environment-variables.md) · [Guía de Usuario](./user-guide.md) →
