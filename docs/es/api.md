# Referencia de la API

BioPlatform expone una API REST bajo `/api`. La especificación OpenAPI 3.0 legible por máquina se sirve en `/api/openapi.json`, y una referencia renderizada vive en la app en `/api-docs`.

## Convenciones

- **URL base:** `/api` (relativa al origen de la instancia).
- **Autenticación:** la mayoría de los endpoints requieren `Authorization: Bearer <token>`. Los tokens se devuelven en `POST /api/auth/login` y `POST /api/auth/register`, y expiran después de `JWT_EXPIRES_IN`.
- **Errores:** todo error devuelve HTTP 4xx/5xx con `{ "success": false, "error": "mensaje legible" }`.
- **Éxito:** la mayoría de las respuestas devuelven `{ "success": true, "data": ... }`.
- **Content-Type:** JSON (`application/json`), excepto subidas de archivos (multipart) y descargas.

## Niveles de acceso

El acceso a la API está basado en el plan. Cada cuenta tiene un **nivel de API** efectivo — `basic`, `advanced` o `enterprise` — devuelto como `apiLevel` por `GET /api/auth/me`.

| Nivel | Plan por defecto | Endpoints |
| --- | --- | --- |
| `basic` | GRATIS | CRUD del perfil, enlaces sociales, tema, avatar/banner, música, ajustes de email, insignias, auth |
| `advanced` | PRO (Premium) | Analíticas, integración de Discord, exportación/importación de datos |
| `enterprise` | ENTERPRISE | Webhooks (entrega saliente a tu endpoint) |

Un **admin puede anular el plan por defecto** concediendo el permiso `api.basic`, `api.advanced` o `api.enterprise` a cualquier rol (Dashboard → Admin → Roles). Una cuenta GRATIS con un rol que tenga `api.advanced` obtiene acceso avanzado; los admins siempre tienen el nivel enterprise. Los endpoints a los que el llamador no tiene acceso devuelven `403` con `{ error: "This endpoint requires the <level> API tier", data: { required, apiLevel } }`.

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
| `GET` | `/api/profiles/:identifier` | Obtener un perfil público por su **slug o alias**. La respuesta incluye `requestedSlug` (lo que pediste) y el `slug` canónico, además de `badges`. Sin email ni PII. Incluye un objeto de presencia `discord` solo cuando el propietario conectó Discord y optó por compartir la presencia. Se sirve con un `ETag` basado en contenido y `Cache-Control: no-cache` — los clientes revalidan en cada petición y reciben un `304` cuando el perfil no ha cambiado (así las ediciones y la presencia en vivo nunca quedan obsoletas y las vistas públicas siguen contándose). |
| `GET` | `/api/profiles/:identifier/presence` | Instantánea de presencia en vivo y ligera (sin campos de perfil): `status`, `statusLabel`, `activities`, `line`, `customStatus`, `updatedAt`. Devuelve `data: null` cuando el propietario no tiene conexión de Discord o no optó por compartir la presencia. Mismas reglas de visibilidad que `:identifier`. |
| `GET` | `/api/profiles/:identifier/og.png` | Tarjeta PNG 1200×630 renderizada en servidor (fondo de banner, avatar, nombre visible + `@username`, bio, **todas** las insignias, mosaicos de redes sociales, contadores de enlaces/pistas) usada como imagen OpenGraph al compartir enlaces de perfil. Solo contiene datos de perfil estables — la presencia en vivo se excluye a propósito, ya que Discord cachea las imágenes de los embeds durante mucho tiempo. Se cachea en memoria (~5 min, por contenido de perfil) y se envía con un `ETag` + `Cache-Control: public, max-age=300`. La URL de `og:image` lleva una versión de contenido (`?v=…`) para que los rastreadores la vuelvan a descargar cuando el perfil cambie. |
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
| `POST` | `/api/webhooks` | Crear un webhook (`name`, `url`, `events`, `active`, `template`). Devuelve el `secret` de firma **exactamente una vez**. |
| `PATCH` | `/api/webhooks/:id` | Actualizar nombre, url, eventos, `active` (pausar/reanudar) o `template`. |
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
| `profile.created` | Creas un nuevo perfil. |
| `profile.deleted` | Eliminas un perfil. |
| `user.registered` | Se registra una nueva cuenta. |
| `user.updated` | Tu cuenta cambia (p. ej. contraseña) o un administrador la edita. |
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

### Webhooks de Discord

Una URL de webhook de Discord (canal → Integraciones → Webhooks) funciona como destino. Como la API de Discord solo acepta cuerpos con forma de mensaje, las entregas a `discord.com`/`discordapp.com` (incluidos los subdominios `ptb.`/`canary.`) se envían como un **embed** con formato en lugar de JSON crudo: un título `BioPlatform · <evento>`, la marca de tiempo del evento y un campo por cada entrada de nivel superior en `data`. Una plantilla personalizada que ya produzca un mensaje de Discord (`content`, `embeds`, `username`, `avatar_url`, `components`, `attachments` o `poll`) pasa sin cambios; cualquier otra carga útil de plantilla se renderiza como JSON con sangría en la descripción del embed. El texto del embed se trunca a los límites por campo de Discord; la firma siempre cubre el cuerpo realmente enviado.

### Plantillas de carga útil personalizadas

Al crear o actualizar un webhook puedes establecer `template` con un documento JSON personalizado que se envía en lugar de la carga útil por defecto. Déjalo vacío (o `null`) para recibir la carga útil por defecto anterior.

Los marcadores de posición se sustituyen en el momento de la entrega:

- `{{id}}` — UUID de la entrega
- `{{event}}` — nombre del evento
- `{{timestamp}}` — marca de tiempo ISO
- `{{data}}` — el objeto `data` completo por defecto
- `{{data.<campo>}}` — un campo dentro de `data` (ruta de puntos, p. ej. `{{data.slug}}`)

Ejemplo: enviar `{"event":"{{event}}","profile":"{{data.slug}}","at":"{{timestamp}}"}` para una entrega `profile.viewed` produce `{"event":"profile.viewed","profile":"miusuario","at":"2026-01-01T00:00:00.000Z"}`. Los campos desconocidos o ausentes se renderizan como `null`.

La plantilla debe ser JSON válido después de sustituir los marcadores (máximo 2000 caracteres). La firma sigue cubriendo el cuerpo renderizado, así que verifícala como siempre.

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

Vinculación OAuth2 de la cuenta más un bot compartido para la presencia en vivo (el bot debe compartir un servidor con el usuario). Todos los endpoints requieren autenticación de usuario. Toda la integración está **deshabilitada** (devuelve `configured: false`, `/connect` devuelve 400) cuando `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` no están configuradas — ver [Variables de Entorno](./environment-variables.md).

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/discord` | Estado de la integración: `configured`, `connected`, `botConfigured`, `botInviteUrl`, `presenceHubInvite`, `sessionActive`, la cuenta conectada (`username`, `globalName`, `avatar`), ajustes (`showDiscordPresence`, `showDiscordActivity`), `webhookConfigured` y una instantánea de presencia en caché. |
| `GET` | `/api/discord/connect` | Devuelve `{ url }` — la URL de autorización OAuth2 de Discord (scope `identify`, `prompt=consent`). Requiere que la integración esté configurada. |
| `GET` | `/api/discord/callback` | Callback de OAuth2 (se visita en el navegador). Intercambia el código, crea/actualiza la `DiscordConnection` y redirige a `/dashboard?tab=discord&discord=connected|error`. |
| `POST` | `/api/discord/disconnect` | Desconectar Discord: elimina la conexión y desactiva compartir presencia. |
| `PUT` | `/api/discord/settings` | Actualizar `showDiscordPresence` (compartir presencia en el perfil público), `showDiscordActivity` (incluir detalles de actividad) o `webhookUrl` (cadena vacía la elimina). Si el webhook cambia mientras existe un mensaje "Post to Discord", el mensaje antiguo se elimina del webhook anterior. |
| `POST` | `/api/discord/post` | Publicar (o actualizar) el embed de perfil en el webhook guardado (o un `url` pasado en el body). El embed muestra tu tarjeta de perfil renderizada (banner, avatar, nombre, bio, insignias) con un título corto — sin texto de presencia, para que no quede obsoleto en la caché de imágenes de Discord. Devuelve `{ messageId, mode }` donde `mode` es `"created"` (mensaje nuevo) o `"updated"` (editado en su lugar). Publicar de nuevo — o editar tu perfil mientras existe un mensaje publicado — edita el mismo mensaje en vez de enviar mensajes repetidos; cambiar de webhook elimina el mensaje antiguo y crea uno nuevo. |

La presencia mostrada en el perfil público siempre está condicionada por `showDiscordPresence`, y los detalles de actividad por `showDiscordActivity` — un usuario que nunca opta no es rastreado ni expuesto. La tarjeta OG y el embed "Post to Discord" nunca incluyen presencia (Discord cachea esas imágenes), por lo que se construyen solo con datos de perfil estables.

El embed "Post to Discord" mantiene un único mensaje sincronizado: el id del mensaje publicado y el webhook al que se envió se guardan (el webhook cifrado), de modo que las publicaciones posteriores y las ediciones de perfil hacen `PATCH` de ese mensaje en su lugar. Si el webhook guardado cambia, primero se elimina el mensaje antiguo. El id del mensaje y el webhook se limpian si el mensaje ya no puede editarse (p. ej. el webhook fue eliminado). Como Discord cachea las imágenes de los embeds de forma agresiva, la tarjeta y el embed muestran solo datos de perfil estables (sin estado/canción en vivo) y la URL de la imagen lleva versión de contenido, así se actualiza cuando el perfil cambia de verdad.

## Invitaciones y Administración

**Invitaciones de registro.** `POST /api/invites` crea códigos de invitación. Los administradores con `invites.manage` generan hasta 50 por llamada con un `expiresInDays` opcional. Los demás usuarios generan dentro de su **cuota de rol** (necesita el permiso `invites.generate` además del límite por lote del rol > 0) o de su **allowance de evento**, sujeto al interruptor global `userGenerationEnabled` (panel de administración), al **tiempo de espera** por rol y a los **límites de vencimiento**: los días mínimo/máximo del rol, con el máximo además limitado por la fecha de vencimiento del allowance al generar desde un allowance. Cuerpo: `count` (1–50, por defecto 1) y `expiresInDays` opcional. Devuelve los códigos creados más un objeto `meta` con el `allowance` del usuario, `allowanceExpiresAt`, `outstanding`, `cooldownRemainingSeconds` y la configuración de invitaciones de su rol.

**Allowance y reembolsos.** Los eventos de invitación conceden un allowance (ver abajo). Los códigos creados desde un allowance están etiquetados `fromAllowance: true`. Un código que vence **sin usarse antes** de que venza el propio allowance se reembolsa automáticamente (su crédito vuelve al allowance del usuario en su siguiente `GET /api/invites` o llamada de generación); los códigos que mueren exactamente en el vencimiento del allowance no se reembolsan.

`GET /api/invites` lista los códigos del llamante **y** el mismo objeto `meta` (allowance, configuración del rol, tiempo de espera restante, si la generación es posible actualmente). `DELETE /api/invites/:id` revoca un código sin usar que hayas creado; los administradores con `invites.manage` pueden revocar cualquier código sin usar.

**Endpoints de administración** bajo `/api/admin/*` gestionan usuarios, planes, restablecimientos de contraseña, perfiles, bloqueos de autenticación, desbloqueos manuales, registros de autenticación, **roles**, **insignias** e **invitaciones**:

- `GET /api/admin/invites` — todos los códigos de invitación de todos los creadores, con el creador y —si está usado— la cuenta que lo canjeó. Paginado: `limit` (por defecto 50, máx. 100), `offset` y `filter` (`all` | `available` = sin usar/sin expirar/no revocado | `mine` = creado por el llamante); devuelve `{ data, pagination: { total, limit, offset } }`.
- `GET /api/admin/invite-settings` / `PUT /api/admin/invite-settings` — leer o fijar `{ userGenerationEnabled }`, el interruptor maestro de la generación de invitaciones por parte de no administradores (solo panel de administración, sin variable de entorno).
- `GET /api/admin/invite-events` — lista de auditoría de eventos de invitación pasados.
- `POST /api/admin/invite-events` — ejecutar un evento de invitación: `{ count, expiryDays }` concede a cada usuario no baneado de invitaciones `count` créditos de allowance que expiran tras `expiryDays` días (devuelve `{ grantedUsers, event, allowanceExpiresAt }`).
- `PATCH /api/admin/users/:id` acepta `inviteBanned` — el baneo pone el allowance a cero, revoca los códigos pendientes del usuario y lo excluye de futuros eventos.
- `DELETE /api/admin/users/:id` — borrado completo GDPR (cuenta, perfiles, archivos subidos, webhooks, passkeys, códigos de invitación y las referencias del usuario en el registro de autenticación y en los baneos de cuenta).

El acceso de administración se basa en permisos (ver [Guía de Administración](./admin-guide.md) → Roles y Permisos).

## Dominios Personalizados

Los dominios personalizados son de autoservicio con aprobación de administrador, restringidos al tier PRO/Enterprise **y** al permiso `profiles.customDomain`.

**Público.** `GET /api/domain` devuelve el estado de dominio personalizado del host actual: `{ active, host, slug, canonical }`. `slug` es el destino de raíz (slug de perfil público servido en la raíz) o `null` para la página de inicio.

**Solo propietario** (el perfil debe pertenecer al llamante):

- `GET /api/profiles/me/:profileId/domain` — el `ProfileDomain` del perfil o `null`.
- `POST /api/profiles/me/:profileId/domain` — solicitar un dominio con `{ domain }` (un hostname simple: sin scheme, ruta, puerto ni `www.`; se rechazan el dominio de la app y los dominios ya usados, uno por perfil). Crea una entrada `PENDING_VERIFICATION` y la devuelve con el `verificationToken`.
- `POST /api/profiles/me/:profileId/domain/verify` — vuelve a resolver el registro TXT. En éxito, el estado pasa a `VERIFIED` (esperando administrador).
- `PUT /api/profiles/me/:profileId/domain` — define `{ rootTarget }` como un slug de perfil **público** (la raíz muestra ese perfil) o `null` (la raíz muestra la página de inicio).
- `DELETE /api/profiles/me/:profileId/domain` — desconecta el dominio y lo libera.

**Administración** (`profiles.manage`):

- `GET /api/admin/custom-domains` — todas las solicitudes, de la más reciente a la más antigua, con propietario (usuario/email/tier) y slug del perfil.
- `POST /api/admin/custom-domains/:id/approve` — activa una solicitud **VERIFIED** (→ `ACTIVE`).
- `POST /api/admin/custom-domains/:id/reject` — rechaza una solicitud (→ `REJECTED`; el usuario puede entonces enviar una nueva).

Flujo de estados: `PENDING_VERIFICATION` → `VERIFIED` (pasa la comprobación TXT del usuario) → `ACTIVE` (aprueba el administrador). Las entradas `REJECTED` son reutilizables.

## Límites de peticiones

- Vistas de perfiles públicos: 60 peticiones/minuto por IP.
- Entregas de prueba de webhooks: 5/minuto por usuario.
- Los endpoints de auth aplican bloqueo anti fuerza bruta (ver [Configuración](./configuration.md) `AUTH_LOCK_POLICY`).

---

← [Variables de Entorno](./environment-variables.md) · [Guía de Usuario](./user-guide.md) →
