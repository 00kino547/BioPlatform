# Guía de administración

Guía de operaciones para administradores: códigos de invitación, gestión de usuarios, roles y permisos, insignias, baneos y bloqueos, desbloqueo de cuentas de usuario y el registro de autenticación.

## Resumen

Inicia sesión como administrador y abre el **Panel de administración**. Dispone de hasta seis pestañas:

- **Códigos de invitación** — crea y revoca códigos de registro.
- **Usuarios** — lista cuentas, edita perfiles, asigna roles, cambia planes y límites de pistas, restablece contraseñas.
- **Roles** — define roles con interruptores de permiso individuales.
- **Insignias** — gestiona el catálogo de insignias (etiqueta, color, icono).
- **Baneos** — cada baneo de huella / cuenta activo con su estado y la **Lista blanca de IP**.
- **Registros** — el registro de autenticación (intentos fallidos, motivos, penalizaciones).

Las pestañas que ves dependen de los permisos de tu propio rol: un rol con solo `invites.manage` verá únicamente **Códigos de invitación**, mientras que el rol Admin integrado lo ve todo.

Cada pestaña carga sus datos de forma **diferida** la primera vez que la abres, y las listas largas (códigos de invitación, usuarios, eventos de invitación, baneos, lista blanca de IP, registro de autenticación, dominios personalizados, pedidos y la lista de remitentes permitidos de boletines) están **paginadas a 10 filas por página** — usa **Anterior** / **Siguiente** debajo de la tabla. Los contadores **Total** / **Usados** / **Disponibles** de los códigos son globales, no solo de la página actual. Las listas de referencia usadas por selectores (roles, insignias) y los rankings acotados de temas/afiliados se cargan completos.

## Códigos de invitación

El registro es solo con invitación. En la pestaña **Códigos de invitación**:

1. Define la **Cantidad** (1–50) y, opcionalmente, **Expira en días**.
2. Haz clic en **Generar** — los códigos aparecen en la tabla.
3. Comparte los códigos con quien quieras invitar. Un código usado muestra **Usado**; puedes **Revocar** uno sin usar en cualquier momento.

El generador de esta pestaña de administración es la **vía del operador** (`POST /api/admin/invites`): crea códigos **sin** consumir tu allowance de evento ni la cuota de rol. El generador de autoservicio al que los usuarios acceden desde la pestaña **Invites** de su propio panel (`POST /api/invites`) siempre consume allowance/cuota —también para los administradores—, así que usa esta pestaña cuando quieras códigos ilimitados.

La tabla lista **todos** los códigos de invitación de todos los administradores, con el creador en la columna **Creado por**. Usa los chips de filtro encima de la tabla para acotar los resultados:

- **Todos** — todos los códigos de invitación.
- **Disponibles** — códigos que no están usados, ni revocados, ni vencidos.
- **Creados por mí** — solo los códigos que generaste.

Los administradores con `invites.manage` pueden revocar cualquier código sin usar, no solo los suyos. Los códigos generados por usuarios a partir de un allowance de evento están etiquetados **EVENT**.

### Permitir que los usuarios generen invitaciones

Los usuarios generan sus propios códigos desde la pestaña **Invites** de su panel si se cumplen **todas** estas condiciones:

1. El interruptor **Generación de invitaciones de usuarios** en la parte superior de la pestaña está **activado** (solo desde el panel de administración; no existe variable de entorno, este interruptor es el maestro).
2. El rol del usuario tiene el permiso **Generar sus propios códigos de invitación** (`invites.generate`) **y** un **Máximo por lote** mayor que 0, **o** el usuario dispone de un allowance de evento.
3. El usuario no está **baneado de invitaciones** (ver más abajo).

Estas reglas se aplican a todas las cuentas, **incluidos los administradores**: un administrador que genera desde su propia pestaña **Invites** consume su allowance/cuota igual que cualquier otro. El generador sin límites del operador es la pestaña de administración **Códigos de invitación** de arriba.

### Eventos de invitación (conceder un allowance a todos)

Usa la tarjeta **Evento de invitación** para conceder un allowance de invitación a **todos** los usuarios no baneados a la vez:

- **Invitaciones por usuario** — cuántos códigos puede generar cada usuario a partir de este allowance.
- **El allowance expira en** — un número más **días** o **semanas**. El allowance y cada código generado a partir de él expiran en esa fecha.

Cuando los usuarios generan un código a partir de un allowance, pueden elegir el vencimiento hasta el vencimiento del allowance (valor predeterminado). Si un código vence **sin usarse antes** de que expire el allowance, el crédito se reembolsa automáticamente al allowance del usuario (en su siguiente carga de invitaciones), de modo que no se desperdicia nada. Cuando el allowance vence, los créditos sobrantes se pierden.

Los eventos recientes se listan debajo del formulario para que puedas auditar quién concedió qué y cuándo.

### Baneos de invitación

Usa **Editar perfil → Banear invitaciones** en un usuario para excluirlo del sistema de invitaciones por completo:

- Ya no puede generar códigos (cuota de rol o allowance).
- Se le omite en futuros eventos de invitación.
- Sus códigos sin usar actuales se revocan inmediatamente y su allowance restante se pone a cero.

**Desbanear invitaciones** (en el mismo sitio) restaura el acceso (su allowance anterior no se restaura). Esta es la forma recomendada de tratar el abuso de invitaciones sin eliminar la cuenta.

## Gestión de usuarios

La pestaña **Usuarios** lista todas las cuentas. Haz clic en **Editar perfil** para:

- Cambiar el nombre visible, la bio, la ubicación, el sitio web y la visibilidad pública/privada.
- Asignar el **rol** del usuario (de los definidos en la pestaña **Roles**).
- Definir el **plan** del usuario (Free / Pro / Enterprise) y un **límite de pistas** personalizado (sobreescribe el predeterminado del plan para el reproductor de música).
- Definir un **límite de perfiles** y un **límite de aliases** personalizado (sobreescribe los valores predeterminados del plan para las páginas multiperfil y los aliases).
- Activar o desactivar **insignias** del catálogo — son las insignias que el usuario puede mostrar en sus perfiles.
- Restablecer la contraseña de un usuario (backend `POST /api/admin/users/:id/reset-password`).
- Eliminar una passkey de un usuario (backend `DELETE /api/admin/users/:id/passkeys/:passkeyId`): útil cuando un usuario ha perdido un dispositivo o pide eliminar un autenticador comprometido. Los indicadores de seguridad de passkeys se recalculan al instante, por lo que la lista de **Usuarios** refleja el cambio de inmediato.

### Eliminar un usuario (borrado GDPR)

Usa **Eliminar** junto a la fila de un usuario para **borrar permanentemente** la cuenta (derecho al olvido del GDPR). Esto es irreversible y elimina:

- la cuenta de usuario, las passkeys, los desafíos WebAuthn y los webhooks (y sus entregas);
- cada perfil (aliases, vistas de página, clics en enlaces, pistas de música, conexión de Discord, archivos de avatar/banner/música subidos);
- insignias, códigos de invitación creados por el usuario y las referencias del usuario en el registro de autenticación y en los baneos de cuenta.

No puedes eliminar tu propia cuenta desde el panel de administración. Para una alternativa reversible, usa **Editar perfil → isPublic desactivado** en su perfil.

## Roles y permisos

La pestaña **Roles** gestiona el acceso. Cada usuario tiene exactamente un rol; cada rol conlleva un conjunto de permisos:

- `users.view` — ver la pestaña Usuarios.
- `users.manage` — editar usuarios (rol, plan, límites, insignias, perfil).
- `profiles.manage` — gestionar perfiles.
- `invites.manage` — crear y revocar códigos de invitación.
- `bans.manage` — gestionar baneos y bloqueos.
- `roles.manage` — crear/editar/eliminar roles.
- `badges.manage` — crear/editar/eliminar insignias.
- `themes.manage` — gestionar la pestaña Temas de temporada / Theming.
- `settings.manage` — gestionar la pestaña Landing (enlace al perfil destacado).
- `newsletter.manage` — gestionar la pestaña Newsletter (límites por plan + búsqueda de consentimiento) y permite a los usuarios enviar boletines a sus propios suscriptores.
- `logs.view` — ver el registro de autenticación.
- `invites.generate` — permite al rol generar sus **propios** códigos de invitación (sujeto al interruptor global, a la configuración de invitaciones del rol que se indica más abajo y a los baneos de invitación).

### Configuración de invitaciones por rol

Junto a los permisos, cada rol tiene un bloque de configuración **Generación de invitaciones**:

- **Máximo por lote** — cuántos códigos puede crear una sola acción de generación. `0` desactiva la generación basada en el rol.
- **Máximo sin usar a la vez** — límite del total de códigos pendientes (sin usar) del usuario. `0` significa ilimitado.
- **Tiempo de espera (minutos)** — espera mínima entre dos acciones de generación. `0` significa sin tiempo de espera.
- **Vencimiento predeterminado / Vencimiento mínimo / Vencimiento máximo (días)** — el usuario elige un vencimiento entre el mínimo y el máximo; cuando no elige, se usa el predeterminado. El mínimo es el límite inferior para que los códigos no puedan crearse con vencimiento inmediato; el máximo es el tope para que no puedan crear invitaciones permanentes.

Un rol necesita **tanto** el permiso `invites.generate` como un límite de lote mayor que 0 para que sus miembros generen invitaciones por su cuenta. Los allowances de evento permiten generar independientemente de la configuración del rol (pero se aplican el mismo tiempo de espera y los mismos límites de vencimiento, limitados por la fecha de caducidad del allowance).

Siempre existen dos roles de sistema:

- **Admin** — acceso completo. Sus permisos están bloqueados (siempre son todos); puedes renombrarlo pero no quitarle permisos.
- **User** — el rol predeterminado para los nuevos registros. Su nombre, descripción y permisos son editables.

Para crear un rol, introduce un nombre y una descripción, marca los permisos y haz clic en **Crear rol**. Después puedes **editarlo** (el slug se deriva del nombre) o **eliminarlo** — un rol personalizado solo puede eliminarse cuando ningún usuario lo tiene asignado. Los nombres reservados (`admin` / `user`) no pueden reutilizarse en roles personalizados. Los roles nuevos solo son tan potentes como los permisos que les concedas.

## Insignias

La pestaña **Insignias** gestiona el catálogo de insignias. Cada insignia tiene:

- **Etiqueta** — lo que se muestra en el perfil (p. ej. «Gold Member»).
- **Slug** — una clave única (opcional; por defecto se toma la etiqueta).
- **Color** — un color hex (`#22c55e`) usado para la etiqueta y el icono.
- **Icono** — un nombre de icono lucide (p. ej. `Crown`, `Award`, `Code`).

Haz clic en **Crear insignia** para añadir una; una vista previa en vivo muestra cómo se renderiza. Las insignias de sistema (developer, owner, staff, moderator, verified, premium, enterprise) no pueden eliminarse ni cambiar su slug; las personalizadas pueden editarse o eliminarse libremente (eliminarlas las quita de todos los perfiles y usuarios).

Las insignias se asignan a los usuarios en **Usuarios → Editar perfil**. Una vez que un usuario tiene una insignia, puede activarla o desactivarla en cada perfil desde su panel, y se muestra como un icono de color en la página pública. El catálogo es público en `GET /api/badges`.

## Dominios personalizados

La pestaña **Custom Domains** lista cada solicitud de dominio personalizado de autoservicio, de la más reciente a la más antigua, con el propietario (usuario, plan, email), el perfil al que pertenece, su destino raíz, estado, fecha de solicitud y estado TLS. Los dominios personalizados siguen un flujo de dos pasos:

1. **Verificación del usuario** — el usuario añade un registro TXT (`_bioplatform.<domain>` con el valor mostrado) y pulsa **Verify now** en su panel. La instancia resuelve el registro DNS directamente; la solicitud pasa de *Pending TXT* a **Verified**.
2. **Aprobación del administrador** — solo una solicitud en estado **Verified** puede **activarse**. Pulsa **Activate** para pasarla a *Active* (su dominio canónico queda activo para el perfil). Usa **Reject** para rechazar una solicitud (en estado *Pending TXT* o *Verified*); una solicitud rechazada permite al usuario enviar una nueva.

Una vez que un dominio está en estado **Active**, la columna **TLS** sigue su certificado automático:
- *valid to \<fecha\>* — ACME emitió el certificado; se renueva automáticamente cerca de la expiración.
- *issuing…* — el backend está obteniendo el certificado.
- *failed* (pasa el cursor para ver el error) — falló la emisión; corrige el DNS / puerto 80 y pulsa **Issue cert** para reintentar.
- *none* — aún sin certificado. Pulsa **Issue cert** para solicitar uno de inmediato (el backend también reintenta automáticamente).

Ten en cuenta:
- La activación requiere que la instancia enrute realmente el dominio (ingress del túnel con el `Host` correcto, además de un certificado TLS — ver la [Guía de despliegue](./deployment.md)).
- Solo el **propietario** del perfil puede gestionar su dominio. Se requiere el permiso `profiles.manage` para ver/aprobar/rechazar/emitir aquí.
- **El DNS y el TLS deben estar instalados** antes de que la activación sea útil; el perfil redirige al dominio personalizado solo cuando la instancia lo sirve. El TLS automático necesita `ACME_ENABLED=true` y que el dominio sea accesible en el puerto 80.

## Temas de temporada

La pestaña **Temas de temporada** (requiere el permiso `themes.manage`) te permite programar temas recurrentes que se aplican a todos los perfiles de usuario mientras están activos. El sistema incluye nueve temas predefinidos: Primavera, Verano, Otoño, Invierno (estaciones) y Halloween, Navidad, Año Nuevo, San Valentín, San Patricio (festivos), cada uno con una ventana de mes/día predeterminada (p. ej. Navidad del 1 dic al 8 ene).

### Ajustes globales

Tres interruptores controlan toda la funcionalidad:

- **Temas de temporada** — el interruptor principal. Cuando está desactivado, nunca se aplica ningún tema (salvo que un usuario tenga activado «permitir siempre Navidad»).
- **Programación automática** — al activarla, los temas dentro de sus ventanas de fecha se aplican automáticamente. Al desactivarla, solo se aplica una anulación manual.
- **Respetar la preferencia del usuario** — al activarla, los usuarios pueden desactivar las decoraciones de temporada en su pestaña Apariencia; al desactivarla, los usuarios no pueden optar por no recibir decoraciones.

### Gestionar temas

Abre cualquier tema con **Editar** para cambiar su etiqueta, emoji, colores (fondo, tarjeta, texto, acento), activarlo o desactivarlo, marcarlo como **permitir siempre** o establecer una **anulación** manual:

- **Programar** — aplicar solo dentro de la ventana de fechas (más cualquier anulación).
- **Forzado activo** — aplicar independientemente de la ventana.
- **Forzado inactivo** — nunca aplicarlo.

Cada tema también admite un **efecto animado**, una **distribución (layout)** (de las mismas trece plantillas que pueden elegir los usuarios) y una **imagen de fondo** (elige un preset de degradado o de temporada, una URL personalizada o **sube** una imagen/GIF — la validez se comprueba mediante los bytes mágicos y las subidas están limitadas a 12 MB). Los GIF subidos se animan; los JPEG/PNG/WebP se optimizan automáticamente.

Cada vista de edición incluye una **vista previa en vivo** que reutiliza el mismo perfil de muestra editable localmente que se muestra en la página de inicio: las ediciones de la vista previa se ejecutan enteramente en el navegador y nunca tocan datos reales de usuarios.

### Orden de resolución

Cuando más de un tema podría aplicarse, el tema efectivo se elige así: la anulación manual **activada** gana sobre todo; en caso contrario un festivo gana sobre una estación; en caso de empate, gana el tema con el `sortOrder` más alto. El **permitir siempre Navidad** de un usuario gana incluso sobre una anulación **desactivada** del operador, pero solo para ese usuario y solo para el tema de Navidad. Mientras un tema está activo, sustituye por completo los colores, la distribución y el fondo personalizados del usuario.

> **Configuración**: esta función guarda sus temas en la base de datos. Antes de usarla, aplica la migración `docs/migrations/2026-09-03_seasonal-themes.sql` (ver la [Guía de despliegue](./deployment.md)).

## Ajustes de Landing

La pestaña **Landing** (requiere el permiso `settings.manage`) enlaza un perfil real desde la página de aterrizaje de marketing. Establece un **nombre de usuario del perfil destacado** — cuando se configura, el hero de la página de aterrizaje muestra un tercer botón **View live profile** y el editor de previsualización del showcase muestra un enlace **View /username**, ambos apuntando a `/{username}` en el mismo host.

- El valor es solo un nombre de usuario (letras minúsculas, números, guiones y guiones bajos); se acepta y elimina un `@` inicial.
- Guardar un valor **vacío** borra el ajuste y oculta los botones en todas partes. Los botones solo aparecen cuando hay un nombre de usuario configurado.
- El valor se sirve públicamente mediante `GET /api/landing/config` (caché de 60 segundos) para que la página de aterrizaje no necesite credenciales de administrador para renderizarse. Se almacena en la base de datos (`SystemSetting`) — no existe variable de entorno.
- El rol **Admin** integrado ya incluye `settings.manage`; concédelo a roles personalizados que deban configurar la página de aterrizaje.

## Boletín (Newsletter)

La pestaña **Newsletter** (requiere el permiso `newsletter.manage`) cubre las responsabilidades de administración alrededor de los boletines por perfil: **límites por plan**, **auditoría de consentimiento**, **lista de remitentes permitidos** y **anuncios de la plataforma**.

- **Límites por plan** — muestra la ventana de envíos efectiva por plan: cuántos envíos puede hacer cada plan en `windowHours` (predeterminados: FREE 0 / PRO 1 / ENTERPRISE 5 cada 24 h). Puedes sobrescribir el `sendLimit` / `windowHours` de cada plan y persistir la sobrescritura en la base de datos (surte efecto de inmediato y solo sobre envíos futuros — nunca cuenta retroactivamente); **Reset to defaults** elimina la sobrescritura. El marcador de origen te indica si la configuración efectiva procede de los valores predeterminados del entorno o de tu sobrescritura en base de datos. Por debajo es el ajuste de sistema `newsletter.tierConfig` (`GET/PUT/DELETE /api/admin/newsletter/config`).
- **Sender allowlist** — busca cuentas y activa **Whitelist**. Es la aprobación manual del administrador para el envío de boletines: exime al usuario de los requisitos de plan y de verificación DNS de su **propio servidor SMTP** (útil para cuentas de Proton Mail / Gmail SMTP) y, cuando el propietario de la instancia ha activado `NEWSLETTER_PLATFORM_SMTP_ENABLED=true`, también es la autorización por usuario necesaria para enviar por el **remitente de la plataforma**. Los usuarios en la lista siguen sujetos a la ventana de envío por plan, deben superar un correo de prueba SMTP y están limitados por `NEWSLETTER_PLATFORM_RECIPIENT_CAP` en el remitente de la plataforma. Endpoints: `GET /api/admin/newsletter/sender-whitelist`, `PUT /api/admin/newsletter/sender-whitelist/:userId`.
- **Búsqueda de consentimiento** — escribe el correo de un suscriptor para auditar sus registros de consentimiento (responsabilidad GDPR / CASL):
  - **Filas permanentes** — cada suscripción de ese correo en todos los perfiles, con cuándo aceptó, las versiones de políticas (Términos/Privacidad) que aceptó y su estado de baja. Son la prueba duradera de consentimiento almacenada en la base de datos.
  - **Evidencia transitoria** — dirección IP y User-Agent capturados en el momento de la suscripción. Viven **solo en memoria durante 24 horas** y nunca se escriben en la base de datos; tras 24 h desaparecen y solo quedan las filas permanentes.
- **Anuncios de la plataforma** — redacta un **anuncio** puntual que se entrega por el remitente SMTP/Resend de la instancia a todos los usuarios que **optaron por noticias de la plataforma** en el registro (`newsletterOptIn` en el registro del usuario; `acceptedPoliciesAt` y las versiones de políticas registran su consentimiento de Términos + Privacidad). El editor muestra la audiencia actual sin abreviar y envía con un tope de seguridad de 5000 destinatarios, registrando cada envío en `admin_newsletter_sends`. Cada destinatario recibe un enlace de baja de **un clic a nivel de cuenta** firmado (`GET /api/newsletter/unsubscribe/broadcast?token=`), que desactiva su opt-in y guarda `broadcastUnsubscribedAt`; volver a activarlo lo gestiona el usuario desde **Ajustes de cuenta**. Endpoints: `GET /api/admin/newsletter/broadcast-audience`, `GET /api/admin/newsletter/broadcasts`, `POST /api/admin/newsletter/broadcast`.

Los límites de envío solo restringen el boletín del **creador**. El perfil sigue capturando suscriptores mientras un límite está agotado o el perfil está en pausa; simplemente no se enviará correo. Los administradores (`newsletter.manage`) conservan siempre el límite fijo de 5000 destinatarios del remitente de la plataforma y omiten la ventana por plan — el anuncio de plataforma es una audiencia aparte, solo de usuarios que optaron, y no cuenta contra las ventanas por plan.

## Propinas

Las propinas las gestiona por completo el **propietario** (sin permiso de administrador): el propietario de un perfil fija las direcciones de cartera (Bitcoin y/o Litecoin) y un encabezado en su pestaña **Tips** del panel, y los visitantes dejan propinas desde el perfil público.

Lo que configuras como operador es la **confirmación de pago**:

- **Sin BTCPay** — las propinas son intenciones registradas: el diálogo público muestra el código QR / la dirección (`GET /api/tips` devuelve `mode: "address"`), y el propietario concilia el registro (`GET /api/tips/overview`, `DELETE /api/tips/:id`) con lo que realmente llegue a su cartera. No hace falta nada más.
- **Con BTCPay** (`CRYPTO_ENABLED`, `BTCPAY_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID` configurados y el webhook de la tienda apuntando a `POST /api/payments/webhooks/crypto/btcpayserver`) — crear una propina abre un pago por BTCPay (`mode: "btcpay"`); `InvoiceSettled` marca la propina como `CONFIRMED` a través del mismo webhook que cumple los pedidos de planes, y `InvoiceExpired` / `InvoiceInvalid` la marcan como `CANCELLED`. Si la creación de la factura falla (BTCPay inaccesible o mal configurado), la propina vuelve automáticamente al modo dirección, de modo que los visitantes nunca quedan bloqueados por una caída del proveedor de pagos.

Las facturas de propina reutilizan el canal de metadatos `orderId` de BTCPay con el prefijo `tip-<id>`, por lo que dejar que extraños las creen es seguro — el webhook solo puede cambiar el estado de un registro de propina, nunca un pedido o una cuenta.

## Pedidos y pagos

La pestaña **Pedidos** (requiere el permiso `orders.manage`) es el lado de cumplimiento de la facturación. Los usuarios crean pedidos desde su pestaña Facturación — manualmente (`MANUAL`, pago fuera del sistema) o a través de una pasarela en línea habilitada (Tarjeta/Stripe, PayPal, Cripto). Tú configuras los datos de contacto y procesas sus pedidos:

1. **Configura tu método de contacto** — arriba de la pestaña, elige un método (email, Telegram, Discord o WhatsApp — o **none** para ocultarlo) y el valor que verán los usuarios en su pestaña Facturación y en la página pública de precios. El valor debe tener una forma válida para el método elegido (una dirección de email, un usuario de Telegram/Discord, un número de teléfono) y se almacena en la base de datos (`system_setting`).
2. **Procesa los pedidos** — la lista muestra todos los pedidos (los más recientes primero) con el comprador (usuario, email, plan), el plan solicitado, el método de pago (Contactar propietario / Tarjeta / PayPal / Cripto), la moneda + precio base, el % de descuento del comprador y el precio final pedido, los datos de la pasarela (id de transacción, estado del proveedor, moneda cripto + cantidad cotizada) cuando aplica, la nota del usuario, su estado y cualquier nota de administrador. Filtra por estado y pagina según necesites.
   - **Marcar pagado** — aprueba un pedido **Pendiente** cuando hayas recibido el pago. La cuenta se mejora automáticamente al plan solicitado si es superior a su plan actual (Gratuito → PRO → Enterprise).
   - **Cancelar** — rechaza un pedido **Pendiente** (el usuario puede pedir de nuevo).
   - **Reembolsar** — revierte un pedido **Pagado** (por ejemplo, un error); la cuenta **no** se degrada.
   - **Pendiente de nuevo** — reabre un pedido cancelado.
   - Cada cambio de estado puede incluir una **nota de administrador** (máx. 500 caracteres) que se muestra en el historial de pedidos de la pestaña Facturación del comprador.

> **Los pagos en línea** se configuran mediante el entorno: `STRIPE_*`, `PAYPAL_*`, `CRYPTO_*` (ver [Variables de entorno](./environment-variables.md#facturación--pedidos)). Cuando una pasarela está habilitada, crear un pedido genera la sesión de pago automáticamente y el webhook del proveedor (`POST /api/payments/webhooks/stripe`, `/paypal`, `/crypto/{provider}`) lo marca como **pagado** y mejora al comprador por sí solo — no necesitas hacer nada con los pedidos de pasarela salvo gestionar un reembolso. El panel de cada proveedor necesita la URL del webhook configurada (`https://<host>/api/payments/webhooks/...`) con el secreto correspondiente.

> **Los precios** provienen del entorno (`BILLING_PRICE_PRO_CENTS`, `BILLING_PRICE_ENTERPRISE_CENTS`, `BILLING_CURRENCY`); el frontend nunca envía sus propios precios — el descuento se recalcula en el servidor a partir de los datos de afiliado del comprador.

## Cómo funcionan los baneos y bloqueos

El sistema de autenticación se bloquea tras intentos de inicio de sesión fallidos repetidos. Existen dos tipos de baneos:

- **Baneos de huella** — sobre la IP, la cookie del navegador y el user-agent del atacante. Una petición se bloquea solo cuando **2 de 3** partes de la huella están bloqueadas.
- **Baneos de cuenta** — aplicados a la cuenta objetivo tras fallos repetidos.

En la pestaña **Baneos**, cada fila muestra su tipo, valor, número de fallos y estado (Permanente / Bloqueada hasta / Limpia). Puedes eliminar un registro individual con **Desbanear**.

## Lista blanca de IP

La **Lista blanca de IP** se encuentra al principio de la pestaña **Baneos**. Es una lista persistida en la base de datos de direcciones IP o redes CIDR que quedan **exentas del guardián de huella contra el abuso**:

- Los usuarios que se registran desde una red incluida en la lista pueden **crear varias cuentas** en el mismo dispositivo/red: la comprobación antiahuso de invitaciones/referidos (`AFFILIATE_ABUSE_ACTION`) no los rechaza y el límite de intentos de registro no les aplica.
- Los **bloqueos de huella de inicio de sesión** (baneos de IP/cookie/user-agent y la regla de 2 de 3) se ignoran para las IP incluidas, y no se registran nuevas penalizaciones de huella mientras exista la entrada de la lista blanca.

Está pensada para redes de confianza — por ejemplo, IPs compartidas de oficinas o desarrollo, o tus propios **probadores beta**, que necesitan legítimamente más de una cuenta desde la misma máquina. A diferencia de los registros de baneo, la lista blanca vive en la base de datos, por lo que **sobrevive a redespliegues y reinicios**.

Para añadir una entrada: introduce una dirección IP (p. ej. `203.0.113.7`) o una red CIDR (p. ej. `203.0.113.0/24`), opcionalmente una nota, y haz clic en **Añadir**. Se admiten IPv4 e IPv6 (incluidas las direcciones de mapeo IPv4 `::ffff:`). Elimina una entrada en cualquier momento con **Quitar**.

La misma lista blanca se sirve por la API de administración (`GET /api/admin/whitelist`, `POST /api/admin/whitelist`, `DELETE /api/admin/whitelist/:id`, controlada por el permiso `bans.manage`) y se aplica en el servidor en la comprobación antiahuso de referidos, en el límite de registros y en el guardián de huella del inicio de sesión.

## Desbloquear una cuenta de usuario

Una cuenta bloqueada tiene una fila de tipo **ACCOUNT** (valor = el nombre de usuario). Para restaurar el acceso:

1. Abre **Panel de administración → Baneos**.
2. Busca la fila **ACCOUNT** del usuario y haz clic en **Desbloquear**.

El desbloqueo elimina el baneo de la cuenta **y** los baneos de IP/cookie registrados contra esa cuenta durante los intentos fallidos, y borra sus entradas fallidas del registro de autenticación. Esto es importante porque eliminar solo la fila de la cuenta puede dejar una huella bloqueada (regla de 2 de 3).

También puedes desbloquear directamente desde la pestaña **Registros**: cualquier entrada que muestre un bloqueo (Permanente o +N min) tiene un botón **Desbloquear**.

Para eliminar un registro de huella individual sin desbloquear toda la cuenta, usa **Desbanear** a nivel de fila.

## Registro de autenticación

La pestaña **Registros** es el rastro de auditoría de la autenticación. Cada entrada registra la hora, el usuario, el motivo, la IP, la penalización (permanente o `+N min`) y qué la provocó. Las entradas se purgan automáticamente cuando su bloqueo expira o tras el período de retención (`AUTH_LOG_RETENTION_DAYS`).

## Políticas de bloqueo

El comportamiento global de bloqueo se define con `AUTH_LOCK_POLICY` (ver [Configuración](./configuration.md#security)):

- `block` — las cuentas bloqueadas rechazan todos los inicios de sesión hasta que un administrador las desbloquee.
- `trusted_ip` (predeterminado) — la IP registrada / último acceso de la cuenta puede iniciar sesión sin desbloquear.
- `email` — los usuarios bloqueados deben hacer clic en el enlace de desbloqueo enviado por correo (requiere SMTP); los administradores también pueden desbloquear manualmente.

## Administración por línea de comandos

La imagen del backend incluye un CLI `bioplatform` que se comunica directamente con la base de datos. Está pensado para autoalojadores que necesitan administrar **su propia** cuenta: el panel de administración web bloquea deliberadamente la autoedición (plan, límites, contraseña y eliminación de la propia cuenta), y el CLI no tiene esa restricción — se ejecuta como el propietario de la instancia.

Ejecútalo dentro del stack en marcha:

```sh
./scripts/bioplatform.sh <command> …        # Linux/macOS
./scripts/bioplatform.ps1 <command> …       # Windows
pnpm cli -- <command> …                     # atajo equivalente
```

En desarrollo (sin Docker), `pnpm --filter @bioplatform/backend cli -- <command> …` funciona contra la base de datos local usando el `.env` del repositorio.

### Comandos

Los identificadores aceptan `@usuario`, `usuario@ejemplo.com`, un slug o alias de perfil, o un UUID — usa el que recuerdes.

| Comando | Qué hace |
| --- | --- |
| `users list [--tier T] [--json]` | Lista cuentas con plan, límites, rol y número de insignias. |
| `users show &lt;id&gt;` | Detalles completos de la cuenta + slugs de perfiles (JSON). |
| `users set-tier &lt;id&gt; FREE\|PRO\|ENTERPRISE` | Cambia el plan (sin límite — anulación del propietario). |
| `users set-limits &lt;id&gt; [--tracks N\|none] [--profiles N\|none] [--aliases N\|none]` | Fija límites por cuenta; `none` restaura el valor predeterminado del plan (`null`). |
| `users set-username &lt;id&gt; &lt;newUsername&gt;` | Renombra una cuenta; sincroniza el slug del perfil primario en una transacción. |
| `users set-email &lt;id&gt; &lt;newEmail&gt;` | Cambia el email de inicio de sesión (se valida unicidad). |
| `users reset-password &lt;id&gt; [--password pw]` | Sobrescribe una contraseña (bcrypt, 12 rondas). Solicita escribir **YES**; sin `--password` pregunta dos veces con entrada oculta. |
| `users unlock &lt;id&gt;` | Limpia los baneos ACCOUNT/IP/COOKIE derivados del registro de autenticación de la cuenta y borra los intentos fallidos. |
| `users ban-invites &lt;id&gt;` / `unban-invites &lt;id&gt;` | Alterna la elegibilidad para invitaciones (banear también revoca códigos sin usar). |
| `users delete &lt;id&gt; [--yes]` | Elimina cuenta + perfiles + subidas (almacenamiento local) y dispara webhooks `user.deleted`. Requiere escribir **YES** salvo con `--yes`. |
| `profiles list &lt;id&gt;` | Lista los perfiles de la cuenta. |
| `profiles show &lt;id&gt; [--profile-id uuid]` | Vuelca un perfil completo incluyendo enlaces sociales y alias. |
| `profiles edit &lt;id&gt; […]` | Edita nombre visible, bio, ubicación, sitio web y visibilidad. Usa `none` como valor para vaciar un campo; misma validación que la API del dashboard. |

Ejemplos:

```sh
./scripts/bioplatform.sh users set-tier @admin ENTERPRISE
./scripts/bioplatform.sh users reset-password admin@example.com
./scripts/bioplatform.sh profiles edit @admin --display-name "Kino" --website https://example.com --bio none
```

El CLI no realiza comprobaciones de permisos a propósito — cualquiera que pueda ejecutarlo tiene control total sobre la base de datos de la instancia. Restringe el acceso al socket de Docker / al host en consecuencia. Los cambios de contraseña siempre se confirman interactivamente antes de escribirse.

---

← [Guía de usuario](./user-guide.md) · [Despliegue](./deployment.md) →
