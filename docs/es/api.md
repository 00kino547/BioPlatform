# Referencia de la API

BioPlatform expone una API REST bajo `/api`. La especificación OpenAPI 3.0, legible por máquina, está disponible en `/api/openapi.json`, y una referencia renderizada se accede dentro de la aplicación en `/api-docs`.

## Convenciones

- **URL base:** `/api` (relativa al origen de la instancia).
- **Autenticación:** la mayoría de los puntos finales requieren `Authorization: Bearer <token>`. Los tokens se devuelven en `POST /api/auth/login` y `POST /api/auth/oauth/exchange`, y expiran según `JWT_EXPIRES_IN`. El registro ya no emite un token de sesión — la cuenta debe confirmar primero su correo (ver `POST /api/auth/verify-email`).
- **Errores:** todo error devuelve HTTP 4xx/5xx con `{ "success": false, "error": "mensaje descriptivo" }`.
- **Éxito:** la mayoría de las respuestas devuelven `{ "success": true, "data": ... }`.
- **Content-Type:** JSON (`application/json`), salvo subidas de archivos (multipart) y descargas.

## Niveles de acceso

El acceso a la API se rige por el plan. Cada cuenta tiene un **nivel de API** efectivo — `basic`, `advanced` o `enterprise` — devuelto como `apiLevel` por `GET /api/auth/me`.

| Nivel | Plan predeterminado | Endpoints |
| --- | --- | --- |
| `basic` | GRATIS | CRUD de perfil, enlaces sociales, tema, avatar/banner, música, ajustes de correo, insignias, auth |
| `advanced` | PRO (Premium) | Analíticas, integración de Discord, exportación/importación de datos |
| `enterprise` | ENTERPRISE | Webhooks (entrega saliente a tu endpoint) |

Un **administrador puede anular el plan predeterminado** concediendo el permiso `api.basic`, `api.advanced` o `api.enterprise` a cualquier rol (Dashboard → Admin → Roles). Una cuenta GRATIS con un rol que tenga `api.advanced` obtiene acceso avanzado; los administradores siempre tienen nivel enterprise. Los endpoints a los que el solicitante no tiene acceso devuelven `403` con `{ error: "This endpoint requires the <level> API tier", data: { required, apiLevel } }`.

## Estado del sistema

### `GET /api/health`

Público. Devuelve `{ "status": "ok", "timestamp": "..." }`.

## Versión

### `GET /api/version`

Público. Comprobación de versión del software y de actualizaciones. Devuelve la versión instalada y —cuando la comprobación de actualizaciones está habilitada en el servidor— la última versión publicada y una severidad derivada del CHANGELOG público del repositorio de GitHub (`APP_GITHUB_URL`).

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `enabled` | boolean | Si la comprobación de actualizaciones está habilitada en el servidor |
| `installed` | string | Versión instalada de la aplicación |
| `latest` | string \| null | Última versión publicada del CHANGELOG (omitiendo `[Unreleased]`) |
| `outdated` | boolean | `true` cuando la versión instalada está por detrás de la última |
| `severity` | `none` \| `update` \| `security` \| `critical` | `security` cuando alguna versión omitida incluye correcciones de seguridad; `critical` cuando la seguridad se combina con una instalación muy antigua o con muchas versiones omitidas, cuando la versión instalada es anterior a todas las versiones documentadas, o cuando el número de versiones omitidas alcanza `UPDATE_CRITICAL_STALE_THRESHOLD` |
| `skippedVersions` | array | Versiones más recientes que la instalada, con sus secciones de changelog, para renderizar en la interfaz |
| `skippedCount` | integer | Número de versiones omitidas |
| `releaseUrl` / `releasesUrl` / `changelogUrl` | string | Enlaces al release/changelog de GitHub |
| `checkedAt` | string | Marca de tiempo ISO de la comprobación |
| `source` | `github-raw` \| `github-api` \| `jsdelivr` \| `cache` \| `none` | Origen del CHANGELOG |
| `error` | string \| null | Presente cuando la comprobación falló |

El parámetro de consulta `?force=1` omite la caché del servidor (TTL predeterminado de 12 h) y vuelve a consultar GitHub. Requiere un **administrador** autenticado —los usuarios públicos siempre reciben el resultado en caché/de fondo (esto también evita que el endpoint se use para saturar GitHub). Por ello, el botón de comprobación solo aparece en el panel de administración, no en las páginas públicas.

**Estrategia fail-open:** si la comprobación no puede acceder a GitHub (repositorio privado, error de red, límite de tasa), el endpoint devuelve igualmente `200` con `outdated: false`, `severity: "none"` y un campo `error`. La aplicación nunca bloquea funcionalidades por una comprobación fallida.

**Bloqueo por actualización:** mientras haya una actualización `security` o `critical` pendiente, los endpoints sensibles en cuanto a seguridad devuelven `403` con `{ success: false, error, updateRequired: true, severity, latest }`:

- Auth: `POST /auth/passkeys/options`, `POST /auth/passkeys/register`, `DELETE /auth/passkeys/:id`, `POST /auth/totp/setup`, `POST /auth/totp/enable`, `POST /auth/totp/disable`, `POST /auth/change-password`
- Admin: `PATCH /admin/users/:id`, `DELETE /admin/users/:id`, `POST /admin/users/:id/reset-password`, `POST /admin/roles`, `PATCH /admin/roles/:id`, `DELETE /admin/roles/:id`, `POST /admin/badges`, `PATCH /admin/badges/:id`, `DELETE /admin/badges/:id`
- Webhooks: `POST /webhooks`, `PATCH /webhooks/:id`, `POST /webhooks/:id/rotate-secret`, `DELETE /webhooks/:id`

Los endpoints de solo lectura y los no sensibles en seguridad siguen funcionando normalmente durante el bloqueo.

## Auth

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Crear una cuenta. Cuerpo: `username` (3–32 caracteres en minúscula, números, `_` o `-`, **no** puede ser un slug reservado como `login`, `admin`, `oauth`, `api`, `api-docs`, `dashboard`, `invite`, `privacy`, `terms`, `register`, `unlock` o `health`), `email` (correo válido, máximo 254 caracteres), `password` (8–128 caracteres), `inviteCode` (1–128 caracteres) y `acceptedPolicies` (debe ser `true` — una aceptación conjunta de los Términos de Servicio y la Política de Privacidad vigentes; la cuenta guarda las versiones de políticas aceptadas y la fecha). `newsletterOptIn` opcional (booleano) suscribe la cuenta a los anuncios de la plataforma. `captchaToken` opcional es obligatorio cuando hay un proveedor de captcha configurado (ver [Captcha](#captcha)). Los errores de validación y de cuenta duplicada incluyen `fieldErrors` indexados por campo. La cuenta se crea con `emailVerified: false` — se envía un correo de verificación en el registro y la respuesta es **`201` con `{ status: "verification_required", emailSent, warning? }`** (sin token de sesión; la cuenta **no puede iniciar sesión hasta que se confirme el buzón** mediante `/api/auth/verify-email`). `warning` solo aparece cuando se omitió una referencia de invitación (política de abuso). |
| `POST` | `/api/auth/login/start` | Descubrir los métodos de inicio de sesión para un identificador. Siempre devuelve `{ found: true }` para evitar la enumeración de cuentas. |
| `POST` | `/api/auth/login` | Iniciar sesión con `identifier` (nombre de usuario o correo) + `password`. `captchaToken` opcional es obligatorio cuando hay un proveedor de captcha configurado (ver [Captcha](#captcha)). Devuelve `token` + `user`, o `requiresTwoFactor` cuando el 2FA está activado. Si el correo de la cuenta nunca fue verificado, devuelve **`403` `{ error, verifyEmailRequired: true }`** (no se cuenta como inicio de sesión fallido). |
| `POST` | `/api/auth/verify-email` | Confirmar el buzón con el token del enlace del correo de verificación. Cuerpo: `token`. Idempotente — una cuenta ya verificada obtiene `{ status: "verified", alreadyVerified: true }`. Los enlaces alterados, con propósito incorrecto o caducados devuelven `400`. |
| `POST` | `/api/auth/verify-email/send` | (Re)enviar el correo de verificación a una cuenta sin verificar. Cuerpo: `identifier` (nombre de usuario o correo). Anti-enumeración: los identificadores desconocidos o ya verificados también devuelven `{ sent: true }`. Límite de 5/h por IP y enfriamiento de 2 min por cuenta. Devuelve `503` cuando el correo no está configurado. |
| `POST` | `/api/auth/login/passkey/options` | Opciones de aserción WebAuthn para inicio de sesión sin contraseña (`identifier`). |
| `POST` | `/api/auth/login/passkey/verify` | Verificar la aserción e iniciar sesión. |
| `POST` | `/api/auth/2fa/totp` | Completar el inicio de sesión con un código TOTP (`token` + `code`). |
| `POST` | `/api/auth/2fa/passkey/options` | Opciones de aserción WebAuthn para el segundo factor. |
| `POST` | `/api/auth/2fa/passkey/verify` | Verificar la aserción del segundo factor. |
| `POST` | `/api/auth/passkeys/options` | Opciones de creación WebAuthn para registrar un passkey (`residentKey`). |
| `POST` | `/api/auth/passkeys/register` | Registrar un nuevo passkey. |
| `GET` | `/api/auth/passkeys` | Listar tus passkeys. |
| `DELETE` | `/api/auth/passkeys/:id` | Eliminar un passkey. |
| `POST` | `/api/auth/totp/setup` | Iniciar el registro TOTP. Devuelve `secret` + `otpauthUrl`. |
| `POST` | `/api/auth/totp/enable` | Activar TOTP con un `code` de verificación. |
| `POST` | `/api/auth/totp/disable` | Desactivar TOTP. |
| `GET` | `/api/auth/me` | Obtener el usuario actual. Devuelve `newsletterOptIn` (suscripción a los anuncios de la plataforma) además de `newsletterSenderWhitelisted`. |
| `POST` | `/api/auth/change-password` | Cambiar tu contraseña (`currentPassword`, `newPassword` mínimo 12 caracteres). |
| `POST` | `/api/auth/unlock` | Solicitar un correo de desbloqueo para un identificador. |
| `POST` | `/api/auth/unlock/verify` | Verificar un `token` de desbloqueo. |
| `GET` | `/api/auth/oauth/config` | Disponibilidad de SSO para los formularios de acceso y registro: `providers` activados (`google`/`github`/`discord`), `signupRequiresInvite` y `twoFactorBypassAllowed` (bandera de la instancia). |
| `POST` | `/api/auth/oauth/start` | Iniciar SSO (`provider`, `mode` = `login`/`signup`/`link`). Devuelve `redirectUrl` del proveedor; establece una cookie de estado firmada, httpOnly, que se valida en el callback (PKCE S256, el verifier viaja dentro del token). `mode=link` exige un token bearer y vincula el proveedor a la cuenta con sesión activa. |
| `GET` | `/api/auth/oauth/callback?code=&state=&error=` | Redirección OAuth2 del proveedor. El `provider` se recupera del JWT de estado firmado (los proveedores no lo devuelven en la query string). Si el proveedor devuelve un error (p.ej. `error=access_denied`), el usuario es redirigido con `?error=...`. De lo contrario, se verifica el estado, se intercambia el código por el perfil del proveedor y se responde 302 a `/oauth/callback` del frontend — `?code=<código de un solo uso>` para acceso/registro o `?result=linked&provider=` para un enlace completado. |
| `POST` | `/api/auth/oauth/exchange` | Intercambiar el `code` de un solo uso del callback. Devuelve `logged_in` (`token` + `user`), `needs_two_factor` (`twoFactorToken` + `methods` — reutiliza la pantalla de 2FA existente) o `needs_setup` (`signupToken` + datos del proveedor para el formulario de finalización). Un correo verificado del proveedor que coincide con una cuenta existente la vincula y le inicia sesión automáticamente. Un correo verificado del proveedor que coincide con una cuenta existente **sin verificar** la verifica e inicia sesión; un correo escrito manualmente durante el registro se guarda sin verificar y el registro se completa con `{ status: "verification_required", emailSent }` — sin sesión hasta que se verifique. |
| `POST` | `/api/auth/oauth/signup` | Completar el alta de una cuenta SSO: `signupToken`, `username` (único), `email` (cuando el proveedor no aportó ninguno), `inviteCode` (cuando `SSO_SIGNUP_REQUIRES_INVITE=true`). Devuelve `201` con `token` + `user`. |
| `GET` | `/api/auth/oauth/accounts` | Listar tus cuentas OAuth vinculadas, tu bandera `oauthBypass2fa`, si la instancia permite omitir el 2FA en SSO y `authMethods` (contraseña/oauth/passkeys). |
| `DELETE` | `/api/auth/oauth/accounts/:provider/:providerAccountId` | Desvincular un proveedor SSO. El último método de inicio de sesión nunca se puede eliminar. |
| `PUT` | `/api/auth/oauth/settings` | Establecer `oauthBypass2fa` (si el acceso SSO omite tu paso de 2FA). `403` cuando `SSO_2FA_BYPASS_ALLOWED` es false. |

OAuth de PocketBase (transferencia de token de primera parte, controlada por el operador de la instancia — activa cuando `POCKETBASE_OAUTH_ENABLED=true`):

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/auth/oauth/pocketbase/config` | Público: `{ enabled }` y, si está activado, `clientUrl` (el proxy del mismo origen, p.ej. `/api/pb-speed`), `authCollection` (por defecto `users`), `signupRequiresInvite` y `twoFactorBypassAllowed`. Sin secretos. |
| `POST` | `/api/auth/oauth/pocketbase/exchange` | Cuerpo `{ token, invite? }`. Intercambia un token de autenticación de PocketBase (obtenido por la SPA al enviar las credenciales del usuario a PocketBase a través del proxy `clientUrl` — la contraseña nunca llega a este backend) por una sesión de la plataforma. Devuelve las mismas formas que `/api/auth/oauth/exchange`: `logged_in` (`token` + `user`), `needs_two_factor` (`twoFactorToken` + `methods`), `needs_setup` (`signupToken` + `provider: "pocketbase"` + campos del formulario de finalización) o `400` por sesión PocketBase rechazada/no válida. Divergencia frente al OAuth social: un email **verificado en PocketBase** se auto-vincula a la cuenta existente coincidente (PocketBase lo controla el operador; el solicitante ya demostró el control del buzón allí) en lugar de devolver el `409` del OAuth social. Un email verificado en PB que coincide con una cuenta existente **sin verificar** la verifica e inicia sesión; el aprovisionamiento sin invitación respeta `signupRequiresInvite` (`needs_setup`). |
| `POST` | `/api/auth/oauth/pocketbase/link` | Requiere autenticación. Cuerpo `{ token }`. Adjunta una identidad verificada en PocketBase a la cuenta con sesión activa (`{ linked, alreadyLinked }`); `400` cuando el email de PB no está verificado, `409` cuando la identidad ya está vinculada a otra cuenta. La desvinculación usa el genérico `DELETE /api/auth/oauth/accounts/pocketbase/:providerAccountId`. |

SSO empresarial (OIDC, inicio de sesión único corporativo; los endpoints de configuración exigen el nivel de API **enterprise**):

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/auth/sso/config` | La configuración OIDC del titular de la cuenta Enterprise, o `null`. Nunca devuelve el client secret — solo un sufijo enmascarado (`id`, `issuerUrl`, `clientId`, `clientSecretMasked`, `scopes`, `displayName`, `logoUrl`, `allowedDomains`, `enforced`, `enabled`, `identityCount`). |
| `PUT` | `/api/auth/sso/config` | Crear o actualizar la configuración OIDC. `issuerUrl` puede ser la URL de descubrimiento OIDC o el emisor (issuer) desnudo (el servidor añade `/.well-known/openid-configuration` cuando es necesario). `clientSecret` es obligatorio al crear; se omite en la actualización para conservar el valor cifrado. Campos: `issuerUrl`, `clientId`, `clientSecret?`, `scopes?` (por defecto `openid email profile`), `displayName` (obligatorio), `logoUrl?`, `allowedDomains?` (separados por comas; vacío permite cualquier correo verificado), `enforced` (bloquea la contraseña y el login social del propietario), `enabled` (por defecto `true`). |
| `DELETE` | `/api/auth/sso/config` | Eliminar la configuración OIDC y todas sus identidades. |
| `GET` | `/api/auth/sso/configs` | Lista pública de proveedores activados (`id`, `displayName`, `logoUrl`, `issuerHost`) para los formularios de acceso y registro. |
| `POST` | `/api/auth/sso/start` | Iniciar un flujo de SSO empresarial (`configId`, `mode` = `login`/`link`). Ejecuta el descubrimiento OIDC y devuelve `redirectUrl` del proveedor (PKCE S256, cookie de estado firmada httpOnly). `mode=link` exige un token bearer y solo el propietario del proveedor puede vincular. |
| `GET` | `/api/auth/sso/callback?code=&state=&error=` | Redirección del proveedor OIDC. Verifica la cookie de estado, intercambia el código, valida el ID token contra el JWKS del proveedor (issuer + audiencia), usa el endpoint userinfo como respaldo cuando no llega ID token, aplica `allowedDomains` y redirige al `/sso/callback` del frontend — `?code=<código de un solo uso>` para acceso o `?status=linked` para un enlace completado. |
| `POST` | `/api/auth/sso/exchange` | Intercambiar el `code` de un solo uso. Devuelve `logged_in` (`token` + `user`) o `needs_two_factor` (`twoFactorToken` + `methods`, reutiliza la pantalla de 2FA existente). En el primer acceso el subject OIDC se vincula a la cuenta existente cuyo correo verificado coincide; `404` cuando aún no existe ninguna cuenta, `403` cuando el correo está fuera de `allowedDomains`. |
| `GET` | `/api/auth/sso/identities` | Listar las identidades SSO empresarial vinculadas a la cuenta (`displayName`, `logoUrl`, `enforced`, `email` del proveedor). |
| `DELETE` | `/api/auth/sso/identities/:id` | Desvincular una identidad SSO empresarial. El último método de inicio de sesión nunca se puede eliminar, y `409` cuando el SSO de la cuenta está forzado (`enforced`). |

## Perfiles

Cada cuenta tiene uno o más **perfiles**, cada uno con su propio slug, tema, enlaces y música. El perfil **principal** es el predeterminado de la cuenta. Los perfiles adicionales y los **aliases** (URLs cortas adicionales que apuntan a un perfil) están limitados por tu plan (`profileLimit` / `aliasLimit`) o por la configuración específica del administrador por usuario.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/profiles/me` | Listar tus perfiles con `limits`, `primaryId` y `aliasCount`. |
| `POST` | `/api/profiles/me` | Crear un perfil. Cuerpo: `slug` (en minúsculas) más los campos habituales del perfil. Devuelve el perfil creado. |
| `PUT` | `/api/profiles/me` | Actualizar tu perfil **principal** (retrocompatible). |
| `GET` | `/api/profiles/me/:profileId` | Obtener uno de tus perfiles. |
| `PATCH` | `/api/profiles/me/:profileId` | Actualizar un perfil (`slug`, `displayName`, `bio`, `location`, `website`, `socialLinks`, `theme`, `terminalCommands`, `presenceStatus`, `countdown`, `isPublic`). Cambiar el slug del perfil principal se rechaza. `terminalCommands` (un array de `{ command, output, description?, url? }`, máx. 12) está restringido a PRO/Enterprise — las cuentas FREE reciben un `403`. `presenceStatus` es `"online"` \| `"idle"` \| `"offline"` (o `null` para ocultarlo) y `countdown` es `{ label?, targetDate }` (o `null` para ocultarlo). |
| `GET` | `/api/profiles/me/username/availability?username=` | Comprueba si un `@username` está disponible para reclamarse. Requiere iniciar sesión; limitado a 20 comprobaciones/min por IP. Devuelve `{ available, reason }`, donde `reason` es `reserved`, `taken`, `current` o `available`. Los identificadores reclamados por perfiles **privados** se reportan como `available` (el oráculo no debe revelar que existe una cuenta no listada) — reclamar uno sigue fallando con `409` al guardar. |
| `PATCH` | `/api/profiles/me/username` | Cambiar tu `@username` (cuerpo: `username`). Mueve el identificador, la URL del perfil principal y el espacio de nombres de slugs atómicamente; el **slug antiguo se convierte en un alias automático** para que los enlaces existentes sigan funcionando. Limitado a 5/min por IP y con un máximo de un cambio cada **30 días** (`429` durante el período de espera). Devuelve `{ username, slug, lastUsernameChangeAt }`. |
| `DELETE` | `/api/profiles/me/:profileId` | Eliminar un perfil. Si eliminas el perfil principal, el estado de principal pasa a tu perfil más antiguo restante; el último perfil no puede eliminarse. |
| `POST` | `/api/profiles/me/:profileId/primary` | Establecer un perfil como principal. |
| `GET` | `/api/profiles/me/:profileId/aliases` | Listar los aliases del perfil. |
| `POST` | `/api/profiles/me/:profileId/aliases` | Añadir un alias (cuerpo: `slug`). |
| `DELETE` | `/api/profiles/me/:profileId/aliases/:aliasId` | Eliminar un alias. |
| `POST` | `/api/profiles/me/:profileId/badges` | Activar/desactivar una insignia en un perfil (cuerpo: `badge` — un id de insignia — + `enabled`). Las insignias provienen del conjunto asignado por los administradores al usuario. |
| `PUT` | `/api/profiles/me/:profileId/badges/order` | Establecer el orden de visualización de las insignias de un perfil (cuerpo: `order` — un array de ids de insignia de este perfil). Solo se aceptan ids de insignias que estén actualmente en el perfil; los ids desconocidos o duplicados se rechazan (400). Las insignias no incluidas en la lista mantienen su posición relativa anterior después de las ordenadas. El orden guardado se utiliza en el perfil público, en los endpoints del propio perfil y en la tarjeta OG. |
| `POST` | `/api/profiles/me/avatar` | Subir un avatar (multipart, máximo 5 MB, JPEG/PNG/GIF/WebP). El parámetro `?profileId=` opcional limita la operación a un perfil. |
| `DELETE` | `/api/profiles/me/avatar` | Eliminar tu avatar. `?profileId=` opcional. |
| `POST` | `/api/profiles/me/banner` | Subir un banner (multipart, mismos límites). `?profileId=` opcional. |
| `DELETE` | `/api/profiles/me/banner` | Eliminar tu banner. `?profileId=` opcional. |
| `POST` | `/api/profiles/me/background` | Subir una imagen de fondo (multipart, máx. 12 MB, JPEG/PNG/GIF/WebP; validada por bytes mágicos). Define `theme.backgroundImage` del perfil (solo se usa cuando no hay un tema de temporada activo). `?profileId=` opcional. |
| `DELETE` | `/api/profiles/me/background` | Eliminar tu imagen de fondo. `?profileId=` opcional. |
| `POST` | `/api/profiles/me/link-icon` | Subir la imagen de favicon de un enlace (multipart, máx. 5 MB, JPEG/PNG/GIF/WebP; validada por bytes mágicos). Devuelve `{ image }` — una ruta `/uploads/…` que puedes asignar al campo `image` de un elemento de `socialLinks`. Requiere autenticación. |
| `GET` | `/api/profiles/me/export?format=xlsx\|ods` | Descargar tu perfil como hoja de cálculo. `?profileId=` opcional. |
| `POST` | `/api/profiles/me/import` | Importar tu perfil desde una hoja de cálculo (multipart `file`). `?profileId=` opcional. |
| `GET` | `/api/profiles/:identifier` | Obtener un perfil público por su **slug o alias**. La respuesta incluye `requestedSlug` (el solicitado) y el `slug` canónico, además de `badges`, `socialLinks`, `theme`, `terminalCommands`, `presenceStatus`, `countdown` y `musicTracks`. No incluye correo ni información personal identificable. `presenceStatus` es el estado estático del propietario (`"online"` \| `"idle"` \| `"offline"` o `null`) y `countdown` es `{ label?, targetDate }` o `null`. Incluye un objeto de presencia de Discord solo cuando el propietario conectó Discord y aceptó compartir su presencia. También incluye un objeto `seasonal` (`theme` + `source`) cuando hay un tema de temporada/festivo activo aplicado al perfil. Se sirve con un `ETag` basado en contenido y `Cache-Control: no-cache` —los clientes revalidan en cada petición y reciben un `304` cuando el perfil no ha cambiado (así las ediciones y la presencia en vivo nunca quedan desactualizadas y las vistas públicas siguen contándose). |
| `GET` | `/api/theming/active` | Público. Devuelve el tema global activo de la plataforma (`{ success, data: { theme, source } }`), donde `theme` contiene la configuración resuelta (colores + un efecto de animación `effect` opcional: `none`, `snow`, `pumpkins`, `hearts`, `leaves`, `stars`, `confetti`, `sparkle`, más opcionalmente `layout` y `backgroundImage`) y `source` es `override`, `holiday`, `season` o `none`. `data.theme` es `null` cuando no hay ningún tema activo. Lo utilizan los perfiles y la página de inicio para mantenerse sincronizados con el tema global activo. |
| `GET` | `/api/profiles/:identifier/presence` | Instantánea ligera de presencia en vivo (sin campos de perfil): `status`, `statusLabel`, `activities`, `line`, `customStatus`, `updatedAt`. Devuelve `data: null` cuando el propietario no tiene conexión con Discord o no aceptó compartir su presencia. Mismas reglas de visibilidad que `:identifier`. |
| `GET` | `/api/profiles/:identifier/og.png` | Tarjeta PNG 1200×630 renderizada en el servidor (fondo de banner, avatar, nombre visible + `@username`, bio, **todas** las insignias, mosaicos de redes sociales, contadores de enlaces/pistas) utilizada como imagen OpenGraph al compartir enlaces de perfil. Contiene solo datos de perfil estables —la presencia en vivo se omite deliberadamente, ya que Discord almacena en caché las imágenes de embeds durante mucho tiempo. Se cachea en memoria (~5 min, indexada por contenido del perfil) y se envía con `ETag` + `Cache-Control: public, max-age=300`. La URL de `og:image` incluye una versión de contenido (`?v=…`) para que los rastreadores la vuelvan a obtener cuando el perfil cambie. |
| `POST` | `/api/profiles/click` | Registrar un clic en un enlace social (público; `profileId` + `platform`, `slug` opcional —un identificador por enlace, como la etiqueta del enlace, máx. 64, usado para el análisis de clics por enlace—). |

> Los endpoints que gestionan música, ajustes de correo, analíticas y ajustes de Discord aceptan un parámetro de consulta `?profileId=` opcional para operar sobre un perfil concreto. Si se omite, operan sobre el perfil principal de la cuenta.

#### Elementos de `socialLinks`

Cada elemento es `{ platform, url, label?, heading?, icon?, image?, showQr? }`:

- `platform` — nombre de plataforma de la lista permitida (GitHub, X/Twitter, YouTube, Discord, Email, …); cualquier otro es rechazado.
- `url` — una URL `http(s)`/`mailto` válida, o un nombre de usuario `/invite` de Discord; los esquemas `javascript:` y otros son rechazados.
- `label` — texto mostrado opcional (máx. 64).
- `heading` — encabezado de sección opcional (máx. 48, saneado/recortado). Los enlaces con encabezados iguales consecutivos se agrupan bajo un encabezado en el perfil público. Solo se usa cuando la instancia tiene `LINKS_SECTIONS_ENABLED=true`.
- `icon` — emoji opcional (máx. 24) mostrado en lugar del logotipo de la plataforma. Solo se renderiza cuando `LINKS_CUSTOM_ICONS_ENABLED=true`.
- `image` — ruta de subida local opcional (debe empezar por `/uploads/`, obtenida con `POST /api/profiles/me/link-icon`) mostrada en lugar del logotipo de la plataforma. Tiene prioridad sobre `icon`.
- `showQr` — booleano opcional; cuando `LINKS_QR_ENABLED=true`, el perfil público muestra un QR escaneable con la URL del enlace.

Se aceptan hasta 10 enlaces (sin cambios respecto a antes).

### Exportación / Importación

- **Exportación** genera una hoja de cálculo de una sola hoja con dos columnas: `Field` y `Value` (`.xlsx` por defecto, `.ods` con `?format=ods`). Las filas usan las claves `displayName`, `bio`, `location`, `website`, `isPublic`, `social.<platform>` y `theme.<field>`. El archivo no contiene macros.
- **Importación** acepta `.xlsx`, `.ods` y `.csv` (máximo 5 MB). Los formatos con macros habilitadas (`.xlsm`, `.xls`) se rechazan. Los valores que parezcan fórmulas (que empiecen por `=`, `+`, `@`, tabulador/retorno de carro) se omiten. Las filas desconocidas o duplicadas se notifican como `warnings` en lugar de rechazar toda la importación. La respuesta es `{ success, data: { applied: string[], warnings: string[] } }`. Importar reemplaza los campos actuales de tu perfil.

## Insignias

Las insignias son un catálogo gestionado por los administradores. Cada insignia tiene un `slug`, `label`, `color` e `icon`. Las insignias de perfil hacen referencia a las entradas del catálogo por id.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/badges` | Catálogo público de insignias. Devuelve todas las insignias (`id`, `slug`, `label`, `color`, `icon`). |

Los perfiles públicos devuelven `badges` como un array de ids de insignia; los clientes los resuelven contra este catálogo para renderizar los iconos de color.

## Analíticas

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/analytics/me` | Agregados de vistas y clics (total, 30d, 7d, 24h, por día, por hora, por plataforma, **por enlace**, principales referentes). Las series por hora (`viewsByHour`, `uniqueViewsByHour`, `clicksByHour`, `uniqueClicksByHour`) cubren las últimas 24 horas con bloques ISO-8601 en UTC (`YYYY-MM-DDTHH:00:00`). Las series por enlace (`clicksByLink` con `platform`/`slug`/`count`/`lastClickedAt`, `uniqueClicksByLink` con `uniqueCount`) cubren los últimos 30 días y usan el nombre de la plataforma como respaldo cuando un clic no tiene slug. Requiere el nivel de API **advanced**. |
| `DELETE` | `/api/analytics/me` | Restablecer el análisis de clics: con `?slug=` solo se elimina ese slug de enlace; sin él, **todos** los registros de clics del perfil se eliminan. Las vistas de página nunca se eliminan. Devuelve `{ deleted, slug }`. Requiere el nivel de API **advanced**. |
| `GET` | `/api/analytics/config` | Público. Configuración de analíticas externas/autoalojadas: `{ provider: "none" \| "matomo", enabled, matomoUrl, matomoSiteId }`. El rastreador solo debe cargarse en el cliente después de que el visitante acepte las cookies no esenciales y cuando no haya señal de Do Not Track / Global Privacy Control. |

## Correo

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/email/settings` | Tu configuración de notificaciones y si SMTP está configurado. |
| `PUT` | `/api/email/settings` | Actualizar `notifyOnView` / `notifyOnClick`. |
| `POST` | `/api/email/test` | Enviar un correo de prueba. |

## Boletín (Newsletter)

Newsletters por suscripción voluntaria por cada perfil público. Suscribirse es un opt-in único y explícito: `POST /api/newsletter/subscribe` requiere el id del perfil y el correo, y registra la aceptación de las versiones vigentes de los Términos y la Política de Privacidad. La dirección IP y el User-Agent se usan solo como evidencia transitoria de consentimiento (en memoria, TTL de 24 h) — nunca se almacenan en la base de datos. Cada correo del boletín incluye un enlace de baja con un solo clic que funciona, la identidad del remitente y una dirección postal (o la URL del sitio como sustituto obligatorio según CAN-SPAM/CASL).

Existen dos vías de envío. Un perfil puede configurar su **propio servidor SMTP** (`/api/newsletter/sender`); enviar por él requiere PRO/ENTERPRISE (o una autorización de la lista de administración), un dominio remitente verificado por DNS y un correo de prueba superado, y está limitado por `NEWSLETTER_SELF_RECIPIENT_CAP`. En caso contrario se usa el **remitente de la plataforma** (la propia pila de correo de la instancia): disponible sin condiciones para administradores con `newsletter.manage`, y para el resto de usuarios solo cuando el propietario de la instancia activa `NEWSLETTER_PLATFORM_SMTP_ENABLED=true` **y** la cuenta está en la lista de permitidos; esos usuarios quedan sujetos a la ventana por plan y limitados por `NEWSLETTER_PLATFORM_RECIPIENT_CAP`.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `POST` | `/api/newsletter/subscribe` | Público. Cuerpo `{ profileId, email }`. Crea la suscripción (o reactiva una dada de baja) y devuelve `{ status: "subscribed" \| "already_subscribed", email }` con HTTP 201. |
| `GET` | `/api/newsletter/unsubscribe?token=...` | Baja con un solo clic. El token firmado procede de la cabecera `List-Unsubscribe` / del enlace incluido en cada correo del boletín. Devuelve una pequeña página HTML de confirmación (o una página de error para tokens inválidos o caducados). |
| `POST` | `/api/newsletter/unsubscribe` | Baja con un solo clic RFC 8058 (lo que llama el botón "Darse de baja" de Gmail/Proton). Lee el token de la cadena de consulta (según anuncia la cabecera `List-Unsubscribe`) o de un cuerpo JSON `{ token }`. Devuelve `{ email, status: "unsubscribed" }`. |
| `POST` | `/api/newsletter/send` | Enviar un boletín a todos los suscriptores activos de uno de tus perfiles. Cuerpo `{ subject, body, profileId? }` (`profileId` requerido cuando tienes varios perfiles). El asunto y el cuerpo se sanitizan en el servidor. El perfil debe tener `newsletterEnabled`; el servidor propio debe estar verificado/probado, o el remitente de la plataforma debe estar disponible para la cuenta (ver arriba). Superado el límite devuelve `429`. Devuelve `{ recipientCount, successCount, failedCount }`. |
| `GET` | `/api/newsletter/subscribers?profileId=...` | Tu lista de suscriptores con metadatos de consentimiento (`agreedAt`, `tosVersion`, `privacyVersion`) y conteos `{ total, active, unsubscribed }`. |
| `DELETE` | `/api/newsletter/subscribers/:id?profileId=...` | Borrar un registro de suscriptor (derecho al olvido / GDPR). |
| `GET` | `/api/newsletter/sends?profileId=...` | Tu historial de envíos (últimas 50 entradas). |
| `GET` | `/api/newsletter/sender?profileId=...` | Tu configuración de servidor SMTP propio (sin secretos) o `null`, más `platformEnabled` (el `NEWSLETTER_PLATFORM_SMTP_ENABLED` de la instancia). |
| `PUT` | `/api/newsletter/sender?profileId=...` | Crear/actualizar tu servidor SMTP propio. Cuerpo `{ fromName, fromEmail, smtpHost, smtpPort?, smtpSecure?, smtpUser?, smtpPassword? }`. Omite `smtpPassword` para conservar la almacenada. Cambiar el dominio remitente o el host SMTP reinicia la verificación/prueba. |
| `DELETE` | `/api/newsletter/sender?profileId=...` | Eliminar tu servidor SMTP propio. |
| `POST` | `/api/newsletter/sender/verify?profileId=...` | Verificar la propiedad del dominio remitente por DNS mediante un registro TXT `_bioplatform-verify.<domain>`. Devuelve `{ verified: true }` o un 400 con el nombre/valor esperado. |
| `POST` | `/api/newsletter/sender/test?profileId=...` | Enviar un correo de prueba por tu servidor SMTP a la dirección de tu cuenta. Marca el remitente como probado si tiene éxito. |

`newsletterEnabled` (permitir envíos), `newsletterVisible` (mostrar el formulario de suscripción) y `newsletterHeading` son campos normales del perfil, gestionados a través de los endpoints de creación/actualización de perfil (ver [Perfiles](#perfiles)).

**Admin** (requiere el permiso `newsletter.manage`):

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/admin/newsletter/config` | Límites de envío efectivos por plan: `{ configSource: "env" \| "db", config: { FREE, PRO, ENTERPRISE } }`, cada plan `{ sendLimit, windowHours }`. |
| `PUT` | `/api/admin/newsletter/config` | Sobrescribir la configuración por plan (el cuerpo coincide con la forma de `config`). Se persiste en la base de datos y surte efecto de inmediato. |
| `DELETE` | `/api/admin/newsletter/config` | Eliminar la sobrescritura y volver a los valores predeterminados. |
| `GET` | `/api/admin/newsletter/consent-search?email=...` | Auditoría de consentimiento de un suscriptor. Devuelve `{ email, account, subscriptions, consentEvents }`. **`account`** = estado a nivel de cuenta de los anuncios de la plataforma para ese correo, si existe una cuenta coincidente: `{ exists, username, announcementsOptIn, announcementsOptInAt, announcementsUnsubscribedAt, acceptedPoliciesAt }` (ausente/`exists:false` si el correo no tiene cuenta). **`subscriptions`** = filas permanentes en la base de datos, una por perfil al que el correo se suscribió: `{ email, profileId, subscribedAt, agreedAt, unsubscribedAt, tosVersion, privacyVersion, status }` — `agreedAt` es el instante exacto en que se dio el consentimiento, `tosVersion`/`privacyVersion` son las versiones de políticas aceptadas en ese momento (fijadas por las constantes `POLICY_VERSIONS`), y `status` (`"subscribed"`/`"unsubscribed"`) junto con `unsubscribedAt` reflejan la baja del boletín. **`consentEvents`** = evidencia transitoria en memoria (IP + User-Agent) capturada al suscribirse, caducidad ≤ 24 h, nunca escrita en la base de datos. Se usa para demostrar que una aceptación provino de una IP/navegador real (responsabilidad GDPR/CASL). |
| `GET` | `/api/admin/policy/status` | Estado vigente de Términos/Privacidad: `{ versions, effectiveDate, deemedAcceptanceCutoff, pendingCount, emailableCount, totalCount, noticePending, lastNotified, note, autoNotifyEnabled, emailConfigured, operatorAutoAccept }`. `operatorAutoAccept` = `{ enabled, roles, windowOpen, cutoff }` — la regla de aceptación automática del operador en vigor (`POLICY_ADMIN_AUTO_ACCEPT` / `POLICY_ADMIN_AUTO_ACCEPT_ROLES`), donde `windowOpen` es `false` mientras el periodo de revisión de 30 días sigue en curso y esas cuentas deben aceptar manualmente. |
| `GET` | `/api/admin/newsletter/sender-whitelist?q=...` | Lista las cuentas con el indicador de remitente permitido (opcionalmente filtradas por usuario/correo). |
| `PUT` | `/api/admin/newsletter/sender-whitelist/:userId` | Cuerpo `{ whitelisted }`. Activa/desactiva el indicador de remitente permitido de una cuenta (exime de las comprobaciones de plan/DNS del servidor propio; concede el uso del remitente de la plataforma cuando el opt-in de la instancia está activo). |
| `POST` | `/api/newsletter/optin` | Autenticado. Cuerpo `{ enabled }`. Activa (`newsletterOptIn=true` + `newsletterOptInAt`, limpia `broadcastUnsubscribedAt`) o desactiva (`newsletterOptIn=false`, registra la baja en `broadcastUnsubscribedAt`) la suscripción de esta cuenta a los anuncios de la plataforma. |
| `GET` | `/api/newsletter/unsubscribe/broadcast?token=...` | Baja de un clic a nivel de cuenta de los anuncios de la plataforma. El token firmado procede del enlace de cada correo de anuncio. Pone `newsletterOptIn=false` y `broadcastUnsubscribedAt=now`; devuelve una pequeña página HTML de confirmación. |
| `POST` | `/api/newsletter/unsubscribe/broadcast` | Contraparte RFC 8058 de un clic que invocan los clientes de correo mediante la cabecera `List-Unsubscribe`. Lee el token de la cadena de consulta o de un cuerpo JSON `{ token }`. Mismo efecto que el GET, respuesta `200` JSON. |
| `GET` | `/api/admin/newsletter/broadcast-audience` | Conteo actual de la audiencia opt-in para los anuncios de la plataforma (`newsletterOptIn=true` y sin baja), limitado por `ADMIN_BROADCAST_RECIPIENT_CAP`. |
| `GET` | `/api/admin/newsletter/broadcasts` | Envíos recientes de anuncios de la plataforma (últimos 50) desde `admin_newsletter_sends`. |
| `POST` | `/api/admin/newsletter/broadcast` | Cuerpo `{ subject, body }` (asunto ≤ 120, cuerpo ≤ 5000, sanitizados). Enviar un anuncio de la plataforma a todas las cuentas con opt-in a través del remitente de la instancia. Devuelve `{ broadcast, recipientCount, successCount, failedCount }`. Requiere `newsletterEnabled`. |

## Propinas

Propinas en criptomoneda (Bitcoin y Litecoin) por perfil público. Crear una propina es público y está limitado por IP; leer el registro y borrar registros son operaciones autenticadas del propietario.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `POST` | `/api/tips` | Público. Cuerpo `{ profileId, coin, amount, name?, message? }`. `coin` es `"BTC"` o `"LTC"`; `amount` es una cadena decimal con hasta 8 decimales. Se sanea en el servidor. El perfil debe tener `tipsEnabled` y una dirección para la moneda solicitada. Devuelve HTTP 201 con el registro de la propina y un objeto `payment`: `{ mode: "address", address, uri }` (código QR de la cartera, registro de intención) cuando la instancia no tiene BTCPay configurado, o `{ mode: "btcpay", invoiceId, url }` (pago por BTCPay, confirmación por webhook) cuando BTCPay está configurado; si la creación de la factura falla, vuelve al modo dirección. |
| `GET` | `/api/tips/overview?profileId=...` | Tu registro de propinas: `mode` (`"btcpay"` \| `"address"`), `totals` por moneda (`confirmedAmount`, `recordedAmount`, `confirmedCount`, `recordedCount`; los importes se devuelven como cadena decimal en la moneda) y `recent` (las 50 propinas más recientes con estado `PENDING` \| `CONFIRMED` \| `CANCELLED`). |
| `DELETE` | `/api/tips/:id?profileId=...` | Borrar uno de tus registros de propina. |

`tipsEnabled` (mostrar el bloque de propinas), `tipsHeading`, `tipsBtcAddress` y `tipsLtcAddress` son campos de perfil normales (ver [Perfiles](#perfiles)). En el perfil **público**, las direcciones solo se exponen con su valor real cuando `tipsEnabled` es `true` (en caso contrario `null`), de modo que una cartera desactivada permanece privada.

**Confirmación de pago:** cuando la instancia tiene BTCPay configurado (`CRYPTO_ENABLED`, `BTCPAY_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`), las facturas de propina usan `orderId = "tip-<id>"` y el webhook cripto estándar (`POST /api/payments/webhooks/crypto/:provider`) marca la propina como `CONFIRMED` en `InvoiceSettled` y como `CANCELLED` al caducar/invalidarse. Sin BTCPay, las propinas quedan como intenciones registradas para que el propietario las concilie.

## Tienda

Tienda de productos digitales por perfil. Las operaciones de propietario están autenticadas y acotadas por `?profileId=` (por defecto el perfil principal); los puntos de pago y descarga sirven al público.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/shop/availability` | Config público de la instancia para la tienda: booleanos `stripe`, `paypal`, `crypto`, `cryptoProviders`, `coins`, `currency`, `fileMaxMb`. |
| `GET` | `/api/shop/overview?profileId=...` | Estadísticas del propietario: `profileId`, `slug`, `tier`, `limit` (`3` en FREE, `null` = ilimitado), `discountPercent`, `totalSold`, `revenueCents`, `currency`, `products` (cada uno con `id`, `title`, `description`, `type` (`DOWNLOAD`\|`REQUEST`), `priceCents`, `enabled`, `fileName`, `fileSize`, `previewImage`, `purchases`, marcas de tiempo). |
| `POST` | `/api/shop/products?profileId=...` | Crear un producto. Formulario multipart: `file` (el entregable, ≤ `PRODUCT_FILE_MAX_MB`), `title` (≤ 80, saneado), `description` opcional (≤ 500, saneada), `priceCents` (entero; `0` = gratis), `type` opcional (`DOWNLOAD` predeterminado \| `REQUEST`). Los productos de tipo solicitud no llevan **archivo** (se rechaza un `file` en `REQUEST`; `fileName`/`filePath`/`fileSize` se guardan vacíos). Bloqueado al superar el límite del plan. |
| `PATCH` | `/api/shop/products/:id` | Actualizar un producto (`title`, `description`, `priceCents`, `enabled`, `previewImage`, `type`). Reactivar no restaura archivos borrados. |
| `DELETE` | `/api/shop/products/:id` | Borrar un producto, su archivo entregable y su imagen de previsualización. |
| `POST` | `/api/shop/products/:id/preview` | Multipart `image` (JPEG/PNG/GIF/WebP, ≤ 5 MB, validada por magic bytes). Devuelve `{ previewImage }` (una ruta pública `/uploads/…`). |
| `GET` | `/api/shop/sales?profileId=...&productId=...` | Registro de ventas del propietario: cada compra con producto (incluye `type`), comprador (`buyerEmail` completo/sin enmascarar —es el registro del vendedor—, `buyerUserId`, `isGuest`), método, estado, precios, cotización cripto, `requestText` para productos de solicitud y marcas de tiempo. |
| `POST` | `/api/shop/sales/:purchaseId/refund` | Reembolsar una compra `PAID`. La marca como `REFUNDED` y revoca la descarga; **no** devuelve el dinero — reembólsalo antes en la pasarela. |
| `GET` | `/api/shop/purchases` | Compras del comprador autenticado para volver a descargar; cada entrada incluye `productType` (`DOWNLOAD`\|`REQUEST`) para que la interfaz oculte la descarga en las solicitudes. |
| `POST` | `/api/shop/buy` | Compra pública. Cuerpo `{ productId, method?, email?, provider?, coin?, requestText? }` (límite 30/h por IP). `method` `STRIPE` \| `PAYPAL` \| `CRYPTO`; `email` es obligatorio en compras de pago hechas por invitados. Para productos `REQUEST`, siempre se requieren `email` **y** `requestText` (≤ 2000, saneado) — las solicitudes gratis se marcan `PAID` (método `FREE`) con la petición registrada y el vendedor es notificado de inmediato. El precio y el descuento se calculan en el servidor. Respuesta: `{ data: purchase, status, checkout?, clientToken?, downloadUrl? }` — `checkout.url` para redirigir a la pasarela, `clientToken` (JWT, TTL 30 días) para consultar el estado como invitado, `downloadUrl` en compras gratis/inmediatas (nunca para `REQUEST`). |
| `GET` | `/api/shop/status/:purchaseId?token=...` | Consultar el estado de una compra (bearer autenticado o el `clientToken` del invitado; 120/h por IP). Devuelve el estado de la compra y un `downloadUrl` cuando está `PAID` — excepto para productos `REQUEST`, que nunca exponen uno. |
| `GET` | `/api/shop/download/:purchaseId?token=...` | Descarga firmada (JWT de descarga o bearer del comprador; 60/h por IP). Sirve el archivo como `application/octet-stream` con adjunto `filename*`, `Cache-Control: private, no-store`. `410` si está reembolsado, `402` si está confirmado pero el token de descarga caducó, `400` para productos de solicitud (no hay nada que descargar). |

**Precios y descuento:** `priceCents` de un producto es su precio base; `Profile.shopDiscountPercent` (0–100, nullable) aplica un porcentaje de descuento adicional. El servidor devuelve y cobra siempre el `finalPriceCents` descontado; el frontend deriva el original tachado solo para mostrar. Los productos gratis (`priceCents` 0) saltan la pasarela por completo: se marcan `PAID` con método `FREE` al crearse y las respuestas de compra/estado llevan el enlace de descarga inmediatamente.

**Ciclo de vida del pago:** las compras de pago crean una compra `PENDING` y una sesión de pasarela (`checkout.url`); los webhooks existentes (`POST /api/payments/webhooks/stripe`, `/paypal`, `/crypto/:provider`) se despachan vía `handleGatewayEvent` con el prefijo `orderId = "purchase-<id>"`: pagado → `PAID`, reembolso → `REFUNDED` (revoca la descarga), cancelado → `CANCELLED` (solo mientras está `PENDING`). La URL de retorno de la pasarela es `${APP_URL}/<username>?shop=purchase&id=<id>&status=success\|cancelled`.

**Almacenamiento:** los archivos entregables viven bajo el subárbol privado `products/` (excluido del endpoint público `/uploads`), de modo que solo se alcanzan mediante la ruta de descarga firmada. `PRODUCT_FILE_MAX_MB` (por defecto 50), `PRODUCT_DOWNLOAD_TTL_HOURS` (por defecto 168) y `PRODUCT_PURCHASE_TOKEN_TTL_DAYS` (por defecto 30) configuran el tamaño y la vida de los tokens; el límite de productos viene del plan del perfil (FREE = 3, PRO/Enterprise ilimitados).

## Invitaciones (créditos de pago)

Los créditos de invitación son un producto a nivel de instancia, no una tienda por perfil: el operador los activa una vez y todo el mundo compra los mismos paquetes. Como el registro es solo por invitación, todo el proceso de compra funciona sin cuenta: al invitado se le envían códigos reales con un enlace de reclamo privado, y canjear uno de esos códigos durante el registro entrega el resto a la cuenta nueva.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/invite-purchases/config` | Instantánea pública de la tienda: `open` (el interruptor está activo **y** hay al menos un paquete válido), `currency`, `packs` (`quantity`, `priceCents`, `unitCents`, `bestValue`), `maxQuantity` (50), `resale` (`mode` `off`\|`permitted`\|`legal`\|`enforced`, `sellingAllowed`, `enforcementActive`, `clause` `none`\|`permitted`\|`prohibited`), `manualPayment` (`method`, `value`, `configured`), `claimTokenTtlDays`, `codeTtlDays`. Los paquetes se listan incluso con `open: false` para que una página pueda describir la oferta sin insinuar que se puede comprar.
| `GET` | `/api/invite-purchases/me` | Historial propio del comprador autenticado (`purchases`, más recientes primero, 100 como máximo) más la misma instantánea `store`. |
| `POST` | `/api/invite-purchases` | Checkout público (con o sin bearer; 10/h por IP). Cuerpo `{ quantity, method, email?, provider?, coin? }`. `method` `STRIPE` \| `PAYPAL` \| `CRYPTO` \| `MANUAL`. `quantity` debe ser un paquete configurado exacto: no hay redondeo ni bonus. `email` solo es obligatorio si no hay sesión, y entonces es el único identificador de la compra. Devuelve `201` con `{ purchase, status, checkout?, clientToken? }`; `checkout.url` manda al comprador a la pasarela y `clientToken` (JWT) permite consultar una orden de invitado. `403` si la tienda está cerrada o la cuenta está baneada de invitaciones, `400` para un paquete desconocido. `MANUAL` también es `400` mientras `manualPayment.configured` sea `false`, porque un pedido sin dónde enviar el dinero es uno que el operador tendría que reembolsar a mano. |
| `GET` | `/api/invite-purchases/resellable` | Lista autenticada de los códigos **no comprados** del propio llamante: los ganados en un evento o por cuota de rol. Es lo que usa una instancia con `resaleMode: enforced` para decirle a un miembro que sus códigos no están a la venta. |
| `GET` | `/api/invite-purchases/status/:orderId?token=...` | Estado de la orden de invitado, autorizado **solo** por el token de reclamo (que está ligado a esa única orden). Devuelve la orden más `codes` (`code`, `used`, `revoked`) cuando está `PAID`, y una lista vacía en caso contrario. `403` para un token inválido o de otra orden, `404` para un token válido sobre una orden inexistente. |
| `POST` | `/api/invite-purchases/claim-link` | Reenvía por email el enlace de reclamo del invitado. Cuerpo `{ orderId, email }`. Siempre responde `200` (con `sent: true`/`false`) para que no sirva para descubrir qué ids de orden existen. |
| `POST` | `/api/invite-purchases/claim-link-auth` | El equivalente para quien ha iniciado sesión: cuerpo `{ orderId }`, devuelve `{ url }` de una de sus órdenes. |

`clause` es la postura legal publicada y se envía en lugar de deducirse, para que una tienda no pueda decirle a un comprador que la reventa está prohibida en una instancia que la permite. `manualPayment.configured` es false siempre que no haya instrucciones utilizables (ningún método elegido, o un método con valor vacío); un cliente no debe ofrecer la vía de pago manual en ese estado, porque dejaría al comprador sin sitio donde enviar el dinero. El mismo ajuste da soporte a `GET`/`PUT /api/admin/orders-config` y se comparte con la caja de planes.

**Ciclo de vida del pago:** las órdenes empiezan en `PENDING` y los mismos webhooks que usa la tienda (`POST /api/payments/webhooks/stripe`, `/paypal`, `/crypto/:provider`) se despachan con el prefijo `orderId = "invites-<id>"`: pagado → `PAID`, reembolsado → `REFUNDED`, cancelado → `CANCELLED` (solo mientras está `PENDING`). Una orden `MANUAL` pasa a `PAID` cuando un operador la confirma en el panel de administración.

**Qué otorga una orden `PAID`:** una compra de miembro se acreditar en la cuenta como saldo permanente (`InviteCreditGrant`, ligado a la orden). Una compra de invitado genera filas `InviteCode` con caducidad (limitadas por `INVITE_PURCHASE_CODE_TTL_DAYS`, 30 por defecto) y se envía una sola vez por email. El email de códigos solo se marca como enviado cuando el proveedor confirma la entrega, así que un envío fallido sigue siendo reintentable en lugar de dejar varado a alguien que ya pagó.

**Entrega al invitado sin correo (respaldo del operador).** Una compra de invitado no tiene cuenta a la que volver, así que los códigos deben llegarle de alguna forma. El correo es el canal normal, pero una instancia sin SMTP retendría una orden pagada que no puede entregar. `POST /api/admin/invite-purchases/:id/claim-link` (requiere `invites.manage`) genera una URL de reclamación firmada nueva para una orden y devuelve `{ url, expiresInDays }` — nunca los códigos en bruto. Entrega ese enlace al comprador por el medio que quieras (chat, mensaje directo, correo desde otra bandeja). La orden **no** se marca como enviada por correo y sus códigos siguen ocultos hasta que la orden está `PAID`, así que esto no sirve para repartir códigos no pagados. El endpoint de estado del invitado no cambia y sigue exigiendo el token de reclamación: `GET /api/invite-purchases/status/:orderId?token=...` responde `403` sin él, y por eso el enlace de administración (no solo el id de orden) es el respaldo. `GET /api/admin/invite-purchase-settings` devuelve `emailConfigured`, y el panel de administración muestra un aviso destacado mientras las compras están abiertas sin correo disponible.

**Los reembolsos son locales.** `POST /api/admin/invite-purchases/:id/refund` revoca exactamente lo que esa orden aún tiene: sus créditos sin usar se eliminan y sus códigos sin usar se revocan. **No** llama a la pasarela de pago, así que devuelve el dinero primero y luego lo registras. El crédito ya canjeado nunca se revoca.


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

Los webhooks envían eventos JSON a tu propio endpoint para que puedas reaccionar a la actividad de tu perfil. Máximo 10 webhooks por cuenta.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/webhooks` | Listar tus webhooks con su entrega más reciente. |
| `POST` | `/api/webhooks` | Crear un webhook (`name`, `url`, `events`, `active`, `template`). Devuelve el `secret` de firma **exactamente una vez**. |
| `PATCH` | `/api/webhooks/:id` | Actualizar nombre, url, eventos, `active` (pausar/reanudar) o `template`. |
| `POST` | `/api/webhooks/:id/rotate-secret` | Generar un nuevo secreto de firma (devuelto una vez). |
| `POST` | `/api/webhooks/:id/test` | Enviar una entrega `webhook.test`. Limitado a 5/minuto por usuario. |
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

Cada entrega es un `POST` con la siguiente estructura:

```json
{
  "id": "delivery-uuid",
  "event": "profile.viewed",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": { }
}
```

El objeto `data` es mínimo y **no** contiene información personal (ni correo, ni IP). Los webhooks y las entregas se limitan a eventos por usuario.

### Webhooks de Discord

Una URL de webhook de Discord (canal → Integraciones → Webhooks) funciona como destino. Dado que la API de Discord solo acepta cuerpos con formato de mensaje, las entregas a `discord.com`/`discordapp.com` (incluidos los subdominios `ptb.`/`canary.`) se envían como un **embed** formateado en lugar de JSON crudo: un título `BioPlatform · <evento>`, la marca de tiempo del evento y un campo por cada entrada de nivel superior en `data`. Una plantilla personalizada que ya produzca un mensaje de Discord (`content`, `embeds`, `username`, `avatar_url`, `components`, `attachments` o `poll`) se pasa sin modificaciones; cualquier otra carga útil de plantilla se renderiza como JSON formateado en la descripción del embed. El texto del embed se trunca a los límites por campo de Discord; la firma siempre cubre el cuerpo realmente enviado.

### Plantillas de carga útil personalizadas

Al crear o actualizar un webhook puedes definir `template` con un documento JSON personalizado que se envía en lugar de la carga útil predeterminada. Déjalo vacío (o `null`) para recibir la carga útil predeterminada.

Los marcadores de posición se sustituyen en el momento de la entrega:

- `{{id}}` — UUID de la entrega
- `{{event}}` — nombre del evento
- `{{timestamp}}` — marca de tiempo ISO
- `{{data}}` — el objeto `data` completo predeterminado
- `{{data.<campo>}}` — un campo dentro de `data` (ruta de puntos, p. ej. `{{data.slug}}`)

Ejemplo: enviar `{"event":"{{event}}","profile":"{{data.slug}}","at":"{{timestamp}}"}` para una entrega `profile.viewed` produce `{"event":"profile.viewed","profile":"miusuario","at":"2026-01-01T00:00:00.000Z"}`. Los campos desconocidos o ausentes se renderizan como `null`.

La plantilla debe ser JSON válido tras sustituir los marcadores (máximo 2000 caracteres). La firma cubre el cuerpo renderizado, así que verifícala como siempre.

### Verificación de la firma

Cada petición incluye estas cabeceras:

- `X-BioPlatform-Id` — UUID de la entrega
- `X-BioPlatform-Event` — nombre del evento
- `X-BioPlatform-Timestamp` — marca de tiempo ISO
- `X-BioPlatform-Signature` — `sha256=<hex>` HMAC-SHA256 del **cuerpo de la petición en bruto** calculado con tu secreto de firma

Verifica en tu endpoint así:

```js
const crypto = require("crypto");
const rawBody = await readRawBody(req); // no uses un cuerpo procesado
const sig = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(rawBody).digest("hex");
const expected = `sha256=${sig}`;
if (req.headers["x-bi-platform-signature"] !== expected) {
  return res.status(401).end();
}
```

También comprueba que `X-BioPlatform-Timestamp` sea reciente (p. ej. dentro de 5 minutos) para evitar ataques de repetición.

### Reintentos

Las entregas se intentan de forma síncrona y, en caso de fallo, se reintentan con retroceso de 0 s, 60 s, 5 min, 15 min y 60 min —hasta 5 intentos en total. Cada intento se registra en el historial de entregas (`GET /api/webhooks/:id/deliveries`) con su código de estado HTTP o error. Tras el último intento, la entrega se marca como `failed`.

### Buenas prácticas

- Responde **rápidamente** con un 2xx (antes de tu timeout de 10 s); ejecuta la tarea real en segundo plano.
- Devuelve un no-2xx para provocar un reintento.
- Rechaza las peticiones con firma inválida antes de procesarlas.
- Configura un endpoint HTTPS; solo se aceptan URLs `http(s)`.

## Discord

Vinculación OAuth2 de la cuenta y un bot compartido para presencia en vivo (el bot debe compartir un servidor con el usuario). Todos los endpoints requieren autenticación de usuario. Toda la integración está **deshabilitada** (devuelve `configured: false`, `/connect` devuelve 400) cuando `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `DISCORD_REDIRECT_URI` no están configuradas — ver [Variables de entorno](./environment-variables.md).

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/discord` | Estado de la integración: `configured`, `connected`, `botConfigured`, `botInviteUrl`, `presenceHubInvite`, `sessionActive`, la cuenta conectada (`username`, `globalName`, `avatar`), ajustes (`showDiscordPresence`, `showDiscordActivity`), `webhookConfigured` y una instantánea de presencia en caché. |
| `GET` | `/api/discord/connect` | Devuelve `{ url }` — la URL de autorización OAuth2 de Discord (scope `identify`, `prompt=consent`). Requiere que la integración esté configurada. |
| `GET` | `/api/discord/callback` | Callback de OAuth2 (se visita en el navegador). Intercambia el código, crea o actualiza la `DiscordConnection` y redirige a `/dashboard?tab=discord&discord=connected|error`. |
| `POST` | `/api/discord/disconnect` | Desconectar Discord: elimina la conexión y desactiva el intercambio de presencia. |
| `PUT` | `/api/discord/settings` | Actualizar `showDiscordPresence` (compartir presencia en el perfil público), `showDiscordActivity` (incluir detalles de actividad) o `webhookUrl` (una cadena vacía lo elimina). Si la URL del webhook cambia mientras existe un mensaje "Post to Discord", el mensaje anterior se elimina del webhook previo. |
| `POST` | `/api/discord/post` | Publicar (o actualizar) el embed del perfil en el webhook guardado (o en una `url` pasada en el cuerpo). El embed muestra tu tarjeta de perfil renderizada (banner, avatar, nombre, bio, insignias) con un título breve —sin texto de presencia, para que no quede desactualizado en la caché de imágenes de Discord—. Devuelve `{ messageId, mode }` donde `mode` es `"created"` (mensaje nuevo) o `"updated"` (editado en su lugar). Publicar de nuevo —o editar tu perfil mientras exista un mensaje publicado— edita el mismo mensaje en lugar de crear mensajes duplicados; cambiar de webhook elimina el mensaje anterior y crea uno nuevo. |

La presencia mostrada en el perfil público siempre está condicionada por `showDiscordPresence`, y los detalles de actividad por `showDiscordActivity` —un usuario que nunca acepta no es rastreado ni expuesto. La tarjeta OG y el embed "Post to Discord" nunca incluyen presencia (Discord almacena en caché esas imágenes), por lo que se construyen exclusivamente con datos de perfil estables.

El embed "Post to Discord" mantiene un único mensaje sincronizado: el id del mensaje publicado y el webhook al que se envió se almacenan (el webhook cifrado), de modo que las publicaciones posteriores y las ediciones de perfil realizan un `PATCH` sobre ese mismo mensaje. Si el webhook almacenado cambia, primero se elimina el mensaje anterior. El id del mensaje y el webhook se limpian si el mensaje ya no puede editarse (p. ej. el webhook fue eliminado). Dado que Discord almacena en caché las imágenes de embeds de forma agresiva, la tarjeta y el embed muestran solo datos de perfil estables (sin estado ni canción en vivo), y la URL de la imagen está versionada según el contenido, por lo que se actualiza cuando el perfil realmente cambia.

## Invitaciones y Administración

**Invitaciones de registro.** `POST /api/invites` crea códigos de invitación. Los administradores con `invites.manage` generan hasta 50 por llamada con un `expiresInDays` opcional. Los demás usuarios generan dentro de su **cuota de rol** (necesitan el permiso `invites.generate` y que el límite por lote del rol sea > 0) o de su **allowance de evento**, sujeto al interruptor global `userGenerationEnabled` (panel de administración), a un **periodo de espera** por rol, a los **límites de vencimiento**: los días mínimo y máximo del rol, estando el máximo además limitado por la fecha de vencimiento del allowance al generar desde un allowance, y — para cuentas ENTERPRISE **sin un pedido pagado** — a un **límite de asientos de equipo** por usuario (cuando un administrador establece `seatLimit`). Los usuarios con límite de asientos solo pueden generar códigos mientras `seatsUsed < seatLimit`, y el lote se limita al espacio restante; al alcanzar el límite, la generación se bloquea con un `403` y un mensaje claro. Las cuentas Enterprise que compraron mediante un pedido (`Order` con `status = PAID` y `plan = ENTERPRISE`) nunca tienen límite. Cuerpo: `count` (1–50, predeterminado 1) y `expiresInDays` opcional. Devuelve los códigos creados más un objeto `meta` con el `allowance` del usuario, `allowanceExpiresAt`, `outstanding`, `cooldownRemainingSeconds`, la configuración de invitaciones de su rol y, cuando hay un límite de asientos activo: `seat: { limited, limit, used, remaining }`.

**Allowance y reembolsos.** Los eventos de invitación conceden un allowance (véase abajo). Los códigos creados desde un allowance están etiquetados `fromAllowance: true`. Un código que vence **sin usarse antes** de que venza el propio allowance se reembolsa automáticamente (su crédito vuelve al allowance del usuario en su siguiente `GET /api/invites` o llamada de generación); los códigos que expiran exactamente en el vencimiento del allowance no se reembolsan.

`GET /api/invites` lista los códigos del solicitante **y** el mismo objeto `meta` (allowance, configuración del rol, periodo de espera restante, si la generación es posible en este momento y la información `seat` activa cuando hay un límite de asientos de equipo). `DELETE /api/invites/:id` revoca un código sin usar que hayas creado; los administradores con `invites.manage` pueden revocar cualquier código sin usar.

`PATCH /api/invites/:id/note` establece una nota corta en un código que hayas creado (los administradores con `invites.manage` pueden editar cualquier código). Cuerpo: `{ "note": string | null }` (máx. 500 caracteres, se eliminan los caracteres tipo HTML). Pasa `null` o una cadena vacía/solo espacios para borrar la nota. Devuelve el código actualizado.

**Páginas de aterrizaje de invitación (públicas).** `GET /api/invites/:code` (público, sin autenticación, limitado por IP) resuelve un código de invitación **válido, sin usar y no expirado** y devuelve `{ code, status: "valid", inviteeDiscountPercent, discountDurationDays, referrer }`. El objeto `referrer` expone únicamente una identidad pública — `username` siempre se devuelve, y `slug`, `displayName` y `avatar` provienen del perfil principal público del referidor cuando existe y `isPublic` es true; de lo contrario solo se devuelve `username` y un `slug` con el valor del usuario. Un código que falte, se haya usado, revocado o expirado devuelve el mismo `404 Invite code not found` (el motivo **nunca** se revela) para que los códigos no válidos no puedan ser enumerados a través de la API. El endpoint alimenta la página pública de aterrizaje de referidos `/invite/<code>` en el frontend.

**Endpoints de administración** bajo `/api/admin/*` gestionan usuarios, planes, restablecimientos de contraseña, perfiles, bloqueos de autenticación, desbloqueos manuales, registros de autenticación, **roles**, **insignias** e **invitaciones**:

- `GET /api/admin/invites` — todos los códigos de invitación de todos los creadores, con el creador y —si se usó— la cuenta que lo canjeó. Paginado: `limit` (predeterminado 50, máx. 100), `offset` y `filter` (`all` | `available` = sin usar/sin expirar/no revocado | `mine` = creado por el solicitante); devuelve `{ data, pagination: { total, limit, offset } }`.
- `GET /api/admin/invite-settings` / `PUT /api/admin/invite-settings` — leer o fijar `{ userGenerationEnabled }`, el interruptor principal de la generación de invitaciones por parte de usuarios no administradores (solo panel de administración, sin variable de entorno).
- `GET /api/admin/invite-events` — lista de auditoría de eventos de invitación anteriores.
- `POST /api/admin/invite-events` — ejecutar un evento de invitación: `{ count, expiryDays }` concede a cada usuario no bloqueado en invitaciones `count` créditos de allowance que expiran tras `expiryDays` días (devuelve `{ grantedUsers, event, allowanceExpiresAt }`).
- `PATCH /api/admin/users/:id` acepta `inviteBanned` — bloquear pone el allowance a cero, revoca los códigos pendientes del usuario y lo excluye de futuros eventos. También acepta `seatLimit` — un entero `>= 0` (o `null`) que limita el crecimiento del equipo por invitaciones en cuentas ENTERPRISE regaladas (ver Invitaciones de registro arriba); `null` significa sin límite.
- La respuesta de `GET /api/admin/users` incluye los metadatos de asientos por usuario — `seatLimit`, `seatsUsed` (códigos de invitación con `usedById` definido, creados por ese usuario) y `hasPaidOrder` (si el usuario tiene un pedido ENTERPRISE PAID y por tanto nunca está limitado).
- `DELETE /api/admin/users/:id` — borrado completo conforme al GDPR (cuenta, perfiles, archivos subidos, webhooks, passkeys, códigos de invitación y las referencias del usuario en los registros de autenticación y en los bloqueos de cuenta).
- `DELETE /api/admin/users/:id/passkeys/:passkeyId` — elimina una sola passkey de un usuario. Requiere `users.manage`. Devuelve el usuario serializado con los indicadores de seguridad de passkeys recalculados al instante (`passkeyCount`, `hasNoPasskeys`, `passkeysUnverified`, `securityFlag`).
- `GET /api/admin/landing-config` / `PUT /api/admin/landing-config` — leer o fijar `{ featuredProfileUsername }`, el nombre de usuario enlazado desde el hero de la página de inicio y el editor de previsualización del showcase (requiere `settings.manage`; pasa una cadena vacía para borrarlo).

El acceso de administración se basa en permisos (ver [Guía de administración](./admin-guide.md) → Roles y permisos).

## Afiliados

El sistema de referidos/afiliados recompensa a los usuarios que invitan nuevas cuentas. Un descuento de referido plano se aplica a cada usuario referido; el referente obtiene recompensas por hitos (descuentos para el referente, créditos de invitación extra, insignias) configuradas por la instancia mediante variables de entorno (`AFFILIATE_DISCOUNT_LEVELS`, `AFFILIATE_ALLOWANCE_LEVELS`, `AFFILIATE_BADGE_LEVELS`) o anuladas por un administrador a través de la API.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/affiliate/me` | Estadísticas de referidos del solicitante: `referralCount`, `discountPercent`, `discountExpiresAt`, `referredBy`, `nextMilestone`, `rewards` y la configuración efectiva de hitos (incluyendo `inviteeDiscountPercent`, `discountDurationDays`, `abuseAction`, `abuseScope`). |
| `GET` | `/api/affiliate/admin/overview` | Solo administradores (`affiliates.manage`). Los 50 mejores referentes (clasificación), totales y la configuración efectiva de hitos con un campo `configSource`: `"db"` cuando está activa una anulación gestionada por administrador, `"env"` cuando se usan las variables de entorno `AFFILIATE_*_LEVELS`. |
| `PUT` | `/api/affiliate/admin/config` | Almacenar una configuración de hitos administrativa (anula el entorno). Cuerpo: `{ discountLevels?, allowanceLevels?, badgeLevels? }`, cada uno un array de `{ level: integer≥1, value: string }`. Los valores de descuento deben ser porcentajes enteros 1–99, los valores de allowance conteos de invitaciones 1–9999, los valores de badge deben referenciar el slug de una insignia existente por `slug`, y los números de nivel deben ser únicos dentro de cada tipo de recompensa. Devuelve la configuración completa efectiva con `configSource: "db"`. |
| `DELETE` | `/api/affiliate/admin/config` | Eliminar la anulación almacenada para que la configuración efectiva vuelva a las variables de entorno `AFFILIATE_*_LEVELS`. Devuelve la configuración completa efectiva con `configSource: "env"`. |

## Pedidos y Facturación

Los pedidos llevan precios calculados en el servidor (con descuento de afiliado) y se crean desde la pestaña Facturación del panel. Métodos de pago: `MANUAL` (contactar al propietario) o, cuando la instancia los habilita, `STRIPE` (tarjeta), `PAYPAL` y `CRYPTO` — los pagos en línea se cumplen automáticamente mediante webhook.

### `GET /api/orders/config`

Configuración de facturación pública (sin autenticación) — `{ billingMode, currency, plans, gateways, contact }` donde `plans` es la lista de planes con precio con `{ plan, label, priceCents }`, obtenido del entorno, `gateways` es `{ stripe: boolean, paypal: boolean, crypto: { enabled, providers, coins } }`, y `contact` es el contacto de pago manual del propietario `{ method, value }`. La página de precios del frontend usa este endpoint; nunca envía sus propios precios.

### `GET /api/orders/me`

La cotización y el historial del usuario — `{ currentTier, discountPercent, billing: { billingMode, currency, plans }, orders }`. `discountPercent` es el descuento de afiliado efectivo (el mayor entre el descuento de hito del usuario y el descuento plano de invitado si llegó por una invitación), y cada pedido incluye su `basePriceCents`, `discountPercent`, `finalPriceCents`, `status` y — para pedidos de pasarela — `gatewayTransactionId`, `gatewayStatus`, `gatewayCheckoutUrl`, `cryptoCoin`, `cryptoAmount`, `cryptoRateUsd`.

### `POST /api/orders/me`

Crea un pedido: `{ plan: "PRO" | "ENTERPRISE", method: "MANUAL" | "STRIPE" | "PAYPAL" | "CRYPTO", note?, coin?, provider? }`. El precio se recalcula en el servidor (nunca se confía en el cliente). Para `MANUAL` devuelve un pedido pendiente; para métodos de pasarela también crea la sesión de pago y devuelve `checkout: { url, provider, coin?, coinAmount?, rateUsd? }` (el `url` es donde paga el usuario: Checkout de Stripe, aprobación de PayPal o la factura BTCPay/BitPay). Si la llamada a la pasarela falla, el pedido se revierte y se devuelve `502`. Pedir un plan que no sea superior a tu plan actual devuelve `400`; un pedido pendiente repetido del mismo plan devuelve `409`.

### `POST /api/orders/downgrade`

Degradación de autoservicio a un plan estrictamente inferior: `{ tier: "PRO" | "FREE" }` (ENTERPRISE→PRO/FREE, PRO→FREE). Los privilegios se **desactivan de forma reversible, nunca se eliminan**: los perfiles, alias, pistas y productos existentes se conservan (solo que no pueden crecer más allá de los límites del nuevo plan) y las funciones exclusivas de Enterprise (SSO corporativo, asientos de equipo, API de webhooks, dominios personalizados) quedan bloqueadas por las comprobaciones normales de plan. Cualquier pedido `PENDING` se cancela para que un webhook de pasarela tardío no vuelva a mejorar la cuenta en silencio, y la obligatoriedad del SSO empresarial se desactiva para que una cuenta antes forzada al SSO pueda seguir iniciando sesión. Un objetivo igual o superior se rechaza con `400` (para mejorar usa `POST /api/orders/me`). Devuelve `{ tier, previousTier, cancelledOrders }`.

### Webhooks de pago (públicos, sin auth)

- `POST /api/payments/webhooks/stripe` — verifica la cabecera `stripe-signature` contra `STRIPE_WEBHOOK_SECRET`; `checkout.session.completed` marca el pedido como pagado (y mejora al comprador), `checkout.session.expired` lo cancela.
- `POST /api/payments/webhooks/paypal` — verifica el evento con la API `verify-webhook-signature` de PayPal usando `PAYPAL_WEBHOOK_ID`; un pago capturado marca el pedido como pagado, los eventos de reembolso/denegación lo reembolsan o cancelan.
- `POST /api/payments/webhooks/crypto/:provider` (`btcpayserver` | `bitpay`) — verifica la cabecera de firma del proveedor; una factura liquidada marca el pedido como pagado, las expiradas/ inválidas lo cancelan, los reembolsos lo marcan como reembolsado.

El panel de cada proveedor debe apuntar a su URL correspondiente (p. ej. `https://<host>/api/payments/webhooks/crypto/btcpayserver`). El cumplimiento es automático e idempotente; los reembolsos nunca degradan un plan y las sesiones canceladas/expiradas solo cancelan pedidos `PENDING`.

### Endpoints de administración (`orders.manage`)

- `GET /api/admin/orders?status=&limit=&offset=` — todos los pedidos (los más recientes primero) con el usuario propietario y el desglose de precio/descuento del pedido (además de los detalles de transacción de la pasarela, si los hay); paginado `{ data, pagination: { total, limit, offset } }`.
- `PATCH /api/admin/orders/:id` — `{ status, adminNote? }`. `PENDING → PAID` (mejora al comprador al plan pedido si es superior), `PENDING → CANCELLED`, `PAID → REFUNDED` (sin degradación), `CANCELLED → PENDING` (reabrir). Las transiciones inválidas devuelven `400`.
- `GET /api/admin/orders-config` / `PUT /api/admin/orders-config` — leer o fijar la configuración de contacto para pagos manuales `{ method: "none"|"email"|"telegram"|"discord"|"whatsapp", value }` (requiere `settings.manage`; se guarda como ajuste del sistema).

## Página de inicio

Configuración pública de la página de inicio de marketing, servida sin autenticación:

### `GET /api/landing/config`

Devuelve `{ featuredProfileUsername }` — el nombre de usuario al que el hero de la página de inicio y el editor de previsualización del showcase enlazan (`/{username}`), o `null` cuando no está configurado. La respuesta se cachea durante 60 segundos.

## Funciones

### `GET /api/features`

Configuración pública de los indicadores de funciones (sin autenticación), cacheada durante 60 segundos. Devuelve `{ linksSections, linksCustomIcons, linksQr }` — valores booleanos que reflejan las variables de entorno `LINKS_*_ENABLED` del operador de la instancia. El frontend lo usa para mostrar u ocultar los controles de encabezados de sección, iconos personalizados, generación de QR y QR en el perfil. El backend siempre acepta y guarda los campos por enlace, así que activar un indicador más adelante nunca exige volver a introducir los datos.

## Dominios personalizados

Los dominios personalizados son de autoservicio con aprobación del administrador, restringidos al plan PRO/Enterprise **y** al permiso `profiles.customDomain`.

**Público.** `GET /api/domain` devuelve el estado de dominio personalizado del host actual: `{ active, host, slug, canonical }`. `slug` es el destino de la raíz (slug de perfil público servido en la raíz) o `null` para la página de inicio.

**Solo el propietario** (el perfil debe pertenecer al solicitante):

- `GET /api/profiles/me/:profileId/domain` — el `ProfileDomain` del perfil o `null`.
- `POST /api/profiles/me/:profileId/domain` — solicitar un dominio con `{ domain }` (un nombre de host simple: sin esquema, ruta, puerto ni `www.`; se rechazan el dominio de la aplicación y los dominios ya utilizados, uno por perfil). Crea una entrada `PENDING_VERIFICATION` y la devuelve con el `verificationToken`.
- `POST /api/profiles/me/:profileId/domain/verify` — vuelve a resolver el registro TXT. Si tiene éxito, el estado pasa a `VERIFIED` (a la espera del administrador).
- `PUT /api/profiles/me/:profileId/domain` — define `{ rootTarget }` como un slug de perfil **público** (la raíz muestra ese perfil) o `null` (la raíz muestra la página de inicio).
- `DELETE /api/profiles/me/:profileId/domain` — desconecta el dominio y lo libera.

**Administración** (`profiles.manage`):

- `GET /api/admin/custom-domains` — todas las solicitudes, de la más reciente a la más antigua, con el propietario (usuario/correo/plan) y el slug del perfil.
- `POST /api/admin/custom-domains/:id/approve` — activa una solicitud con estado **VERIFIED** (→ `ACTIVE`).
- `POST /api/admin/custom-domains/:id/reject` — rechaza una solicitud (→ `REJECTED`; el usuario puede entonces enviar una nueva).

Flujo de estados: `PENDING_VERIFICATION` → `VERIFIED` (superada la comprobación TXT del usuario) → `ACTIVE` (aprobado por el administrador). Las entradas con estado `REJECTED` son reutilizables.

## Captcha

Verificación humana en el registro y el inicio de sesión, activada por el operador de la instancia (`CAPTCHA_PROVIDER` = `turnstile` \| `recaptcha` \| `hcaptcha`). Cuando hay un proveedor configurado, `POST /api/auth/register` y `POST /api/auth/login` **exigen** un `captchaToken` válido en el cuerpo (un token de desafío nuevo validado contra la API de siteverify del proveedor) y devuelven `400` sin él.

### `GET /api/captcha/config`

Público. Devuelve `{ provider, siteKey, enabled }`. `enabled` es `true` solo cuando hay un proveedor configurado; `siteKey` es la clave pública del cliente (segura de exponer — la clave secreta nunca se devuelve). Cuando `enabled` es `false`, los clientes no deben mostrar un widget de captcha.

## Privacidad y consentimiento

Registros de consentimiento y señales de privacidad para el banner de cookies del frontend.

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `GET` | `/api/privacy/consent` | Devuelve `{ consent, dnt, effective }`. `consent` es la decisión guardada (`accept` \| `essential` \| `unknown`); `dnt` es `true` cuando el visitante envió Do Not Track (`DNT: 1`) o Global Privacy Control (`Sec-GPC: 1`); `effective` es el modo aplicado (`dnt ? "essential" : consent`). |
| `POST` | `/api/privacy/consent` | Cuerpo `{ decision: "accept" \| "essential" }`. Establece la cookie `bp_consent` (1 año) y, para `essential`, borra la cookie de analíticas `bp_vid`. Do Not Track / Global Privacy Control **siempre ganan**: cuando se envía `DNT: 1` o `Sec-GPC: 1`, la decisión se fuerza a `essential` y las analíticas nunca se activan. |
| `POST` | `/api/privacy/consent/revoke` | Borra `bp_consent` y `bp_vid`, devolviendo el consentimiento a `unknown`. |

Las analíticas no esenciales (vistas de página, clics en enlaces y cualquier rastreador de Matomo externo configurado) solo se registran cuando el consentimiento efectivo es `accept`; los visitantes que envían DNT/GPC nunca son rastreados.

## Límites de peticiones

- Vistas de perfiles públicos: 60 peticiones/minuto por IP.
- Entregas de prueba de webhooks: 5/minuto por usuario.
- Los endpoints de auth aplican bloqueo contra fuerza bruta (ver [Configuración](./configuration.md) `AUTH_LOCK_POLICY`).

---

← [Variables de entorno](./environment-variables.md) · [Guía de usuario](./user-guide.md) →
