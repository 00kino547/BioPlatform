# Guía de Administración

Guía de operaciones para administradores: códigos de invitación, gestión de usuarios, roles y permisos, insignias, baneos y bloqueos, desbloqueo de cuentas de usuario y el registro de autenticación.

## Resumen

Inicia sesión como administrador y abre **Panel de Administración**. Tiene hasta seis pestañas:

- **Códigos de Invitación** — crea y revoca códigos de registro.
- **Usuarios** — lista cuentas, edita perfiles, asigna roles, cambia planes y límites de pistas, restablece contraseñas.
- **Roles** — define roles con conmutadores de permisos individuales.
- **Insignias** — gestiona el catálogo de insignias (etiqueta, color, icono).
- **Baneos** — cada baneo de huella/cuenta activo con su estado.
- **Registros** — el registro de autenticación (intentos fallidos, razones, penalizaciones).

Las pestañas que ves dependen de los permisos de tu propio rol: un rol con solo `invites.manage` verá únicamente **Códigos de Invitación**, mientras que el rol Admin integrado lo ve todo.

## Códigos de Invitación

El registro es solo con invitación. En la pestaña **Códigos de Invitación**:

1. Define la **Cantidad** (1–50) y opcionalmente **Expira en días**.
2. Haz clic en **Generar** — los códigos aparecen en la tabla.
3. Comparte los códigos con quien quieras invitar. Un código usado muestra **Usado**; puedes **Revocar** uno sin usar en cualquier momento.

La tabla lista **todos** los códigos de invitación de todos los administradores, con el creador en la columna **Creado por**. Usa los chips de filtro sobre la tabla para acotar:

- **Todos** — todos los códigos de invitación.
- **Disponibles** — códigos que no están usados, ni revocados, ni vencidos.
- **Creados por mí** — solo los códigos que generaste.

Los administradores con `invites.manage` pueden revocar cualquier código sin usar, no solo los suyos. Los códigos generados por usuarios desde un allowance de evento están etiquetados **EVENT**.

### Permitir que los usuarios generen invitaciones

Los usuarios no administradores pueden generar sus propios códigos si se cumplen **todas** estas condiciones:

1. El interruptor **Generación de invitaciones de usuarios** al inicio de la pestaña está **activado** (solo panel de administración — no hay variable de entorno; este interruptor es el interruptor maestro).
2. El rol del usuario tiene el permiso **Generar sus propios códigos de invitación** (`invites.generate`) **y** un **Máximo por lote** mayor que 0, **o** el usuario tiene un allowance de evento.
3. El usuario no está **baneado de invitaciones** (ver abajo).

### Eventos de invitación (conceder un allowance a todos)

Usa la tarjeta **Evento de invitación** para conceder un allowance de invitación a **todos** los usuarios no baneados a la vez:

- **Invitaciones por usuario** — cuántos códigos puede generar cada usuario de este allowance.
- **El allowance expira en** — un número más **días** o **semanas**. El allowance y cada código generado a partir de él expiran en esa fecha.

Cuando los usuarios generan un código de un allowance, pueden elegir el vencimiento hasta el vencimiento del allowance (el predeterminado). Si un código vence **sin usarse antes** del vencimiento del allowance, el crédito se reembolsa automáticamente al allowance del usuario (en su siguiente carga de invitaciones), así no se desperdicia nada. Cuando el propio allowance vence, los créditos sobrantes desaparecen.

Los eventos recientes se listan debajo del formulario para que puedas auditar quién concedió qué y cuándo.

### Baneos de invitación

Usa **Editar Perfil → Banear invitaciones** en un usuario para excluirlo del sistema de invitaciones por completo:

- Ya no puede generar códigos (cuota de rol o allowance).
- Se le omite en futuros eventos de invitación.
- Sus códigos sin usar actuales se revocan inmediatamente y su allowance restante se pone a cero.

**Desbanear invitaciones** (en el mismo lugar) restaura el acceso (su allowance anterior no se restaura). Esta es la forma recomendada de tratar el abuso de invitaciones sin eliminar la cuenta.

## Gestión de Usuarios

La pestaña **Usuarios** lista todas las cuentas. Haz clic en **Editar Perfil** para:

- Cambiar nombre, bio, ubicación, sitio web y visibilidad pública/privada.
- Asignar el **rol** del usuario (de los definidos en la pestaña **Roles**).
- Definir el **plan** del usuario (Free / Pro / Enterprise) y un **límite de pistas** personalizado (anula el predeterminado del plan para el reproductor de música).
- Definir un **límite de perfiles** y **límite de aliases** personalizado (anula los predeterminados del plan para las páginas multiperfil y los aliases).
- Alternar **insignias** del catálogo — estas son las insignias que el usuario puede mostrar en sus perfiles.
- Restablecer la contraseña de un usuario (backend `POST /api/admin/users/:id/reset-password`).

### Eliminar un usuario (borrado GDPR)

Usa **Eliminar** junto a la fila de un usuario para **borrar permanentemente** la cuenta (derecho al olvido del GDPR). Esto es irreversible y elimina:

- la cuenta de usuario, las passkeys, los desafíos WebAuthn y los webhooks (y sus entregas);
- cada perfil (aliases, vistas de página, clics en enlaces, pistas de música, conexión de Discord, archivos de avatar/banner/música subidos);
- insignias, códigos de invitación creados por el usuario y las referencias del usuario en el registro de autenticación y en los baneos de cuenta.

No puedes eliminar tu propia cuenta desde el panel de administración. Para una alternativa reversible, usa **Editar Perfil → isPublic desactivado** en su perfil.

## Roles y Permisos

La pestaña **Roles** gestiona el acceso. Cada usuario tiene exactamente un rol; cada rol lleva un conjunto de permisos:

- `users.view` — ver la pestaña Usuarios.
- `users.manage` — editar usuarios (rol, plan, límites, insignias, perfil).
- `profiles.manage` — gestionar perfiles.
- `invites.manage` — crear y revocar códigos de invitación.
- `bans.manage` — gestionar baneos y bloqueos.
- `roles.manage` — crear/editar/eliminar roles.
- `badges.manage` — crear/editar/eliminar insignias.
- `logs.view` — ver el registro de autenticación.
- `invites.generate` — permite al rol generar sus **propios** códigos de invitación (sujeto al interruptor global, a la configuración de invitaciones del rol a continuación y a los baneos de invitación).

### Configuración de invitaciones por rol

Junto a los permisos, cada rol tiene un bloque **Generación de invitaciones**:

- **Máximo por lote** — cuántos códigos puede crear una acción de generación. `0` desactiva la generación basada en el rol.
- **Máximo sin usar a la vez** — límite del total de códigos pendientes (sin usar) del usuario. `0` significa ilimitado.
- **Tiempo de espera (minutos)** — espera mínima entre dos acciones de generar. `0` significa sin tiempo de espera.
- **Vencimiento por defecto / Vencimiento mínimo / Vencimiento máximo (días)** — el usuario elige un vencimiento entre el mínimo y el máximo; cuando no elige, se usa el predeterminado. El mínimo es el suelo para que los códigos no puedan crearse con vencimiento inmediato; el máximo es el tope para que no puedan crear invitaciones permanentes.

Un rol necesita **tanto** el permiso `invites.generate` como un límite por lote mayor que 0 para que sus miembros generen invitaciones por su cuenta. Los allowances de evento permiten generar independientemente de la configuración del rol (pero se aplican el mismo tiempo de espera y los mismos límites de vencimiento, limitados por la fecha de vencimiento del allowance).

Siempre existen dos roles de sistema:

- **Admin** — acceso completo. Sus permisos están bloqueados (siempre todos); puedes renombrarlo pero no quitarle permisos.
- **User** — el rol por defecto para los nuevos registros. Su nombre, descripción y permisos son editables.

Para crear un rol, introduce un nombre/descripción, marca los permisos y haz clic en **Crear Rol**. Puedes **Editarlo** después (el slug se deriva del nombre) o **Eliminarlo** — un rol personalizado solo puede eliminarse cuando ningún usuario lo tiene. Los nombres reservados (`admin` / `user`) no pueden reutilizarse en roles personalizados. Los roles nuevos solo son tan poderosos como los permisos que les concedas.

## Insignias

La pestaña **Insignias** gestiona el catálogo de insignias. Cada insignia tiene:

- **Etiqueta** — lo que se muestra en el perfil (p. ej. «Gold Member»).
- **Slug** — una clave única (opcional; por defecto la etiqueta).
- **Color** — un color hex (`#22c55e`) usado para la píldora y el icono.
- **Icono** — un nombre de icono lucide (p. ej. `Crown`, `Award`, `Code`).

Haz clic en **Crear Insignia** para añadir una; una vista previa en vivo muestra cómo se renderiza. Las insignias de sistema (developer, owner, staff, moderator, verified, premium, enterprise) no pueden eliminarse ni cambiar su slug; las personalizadas pueden editarse o eliminarse libremente (eliminar las quita de todos los perfiles y usuarios).

Las insignias se asignan a los usuarios en **Usuarios → Editar Perfil**. Una vez que un usuario tiene una insignia, puede activarla en cada perfil desde su panel, y se muestra como un icono de color en la página pública. El catálogo es público en `GET /api/badges`.

## Dominios Personalizados

La pestaña **Custom Domains** lista cada solicitud de dominio personalizado de autoservicio, de la más reciente a la más antigua, con el propietario (usuario, tier, email), el perfil al que pertenece, su destino de raíz, estado, fecha de solicitud y estado TLS. Los dominios personalizados pasan por un flujo de dos pasos:

1. **Verificación del usuario** — el usuario añade un registro TXT (`_bioplatform.<domain>` con el valor mostrado) y pulsa **Verify now** en su panel. La instancia resuelve el registro DNS directamente; la solicitud pasa de *Pending TXT* a **Verified**.
2. **Aprobación del administrador** — solo una solicitud **Verified** puede **activarse**. Pulsa **Activate** para pasarla a *Active* (su dominio canónico queda en vivo para el perfil). Usa **Reject** para rechazar una solicitud (en estado *Pending TXT* o *Verified*); una solicitud rechazada permite al usuario enviar una nueva.

Una vez que un dominio está **Active**, la columna **TLS** sigue su certificado automático:
- *valid to \<fecha\>* — ACME emitió el certificado; se renueva solo cerca de la expiración.
- *issuing…* — el backend está obteniendo el certificado.
- *failed* (pasa el cursor para ver el error) — falló la emisión; arregla el DNS/puerto 80 y pulsa **Issue cert** para reintentar.
- *none* — todavía sin certificado. Pulsa **Issue cert** para solicitar uno de inmediato (el backend también reintenta automáticamente).

Ten en cuenta:
- La activación requiere que la instancia enrute realmente el dominio (ingress del túnel con el `Host` correcto, más un certificado TLS — ver la [Guía de Despliegue](./deployment.md)).
- Solo el **propietario** del perfil puede gestionar su dominio. El permiso `profiles.manage` es necesario para ver/aprobar/rechazar/emitir aquí.
- **El DNS y el TLS deben estar instalados** antes de que la activación sea útil; el perfil redirige al dominio personalizado solo cuando la instancia lo sirve. El TLS automático necesita `ACME_ENABLED=true` y el dominio accesible en el puerto 80.

## Cómo Funcionan los Baneos y Bloqueos

El sistema de autenticación bloquea tras intentos de inicio de sesión fallidos repetidos. Existen dos tipos de baneos:

- **Baneos de huella** — sobre la IP, la cookie del navegador y el user-agent del atacante. Una petición se bloquea solo cuando **2 de 3** partes de la huella están bloqueadas.
- **Baneos de cuenta** — aplicados a la cuenta atacada tras fallos repetidos.

En la pestaña **Baneos**, cada fila muestra su tipo, valor, número de fallos y estado (Permanente / Bloqueada hasta / Limpia). Puedes eliminar un registro individual con **Desbanear**.

## Desbloquear una Cuenta de Usuario

Una cuenta bloqueada tiene una fila de **ACCOUNT** (valor = el nombre de usuario). Para restaurar el acceso:

1. Abre **Panel de Administración → Baneos**.
2. Encuentra la fila **ACCOUNT** del usuario y haz clic en **Desbloquear**.

El desbloqueo elimina el baneo de la cuenta **y** los baneos de IP/cookie registrados contra esa cuenta durante los intentos fallidos, y borra sus entradas de registro fallidas. Esto importa porque eliminar solo la fila de la cuenta puede dejar una huella bloqueada (regla 2-de-3).

También puedes desbloquear directamente desde la pestaña **Registros**: cualquier entrada que muestre un bloqueo (Permanente o +N min) tiene un botón **Desbloquear**.

Para eliminar un registro de huella individual sin desbloquear toda la cuenta, usa **Desbanear** a nivel de fila.

## Registro de Autenticación

La pestaña **Registros** es el rastro de auditoría de la autenticación. Cada entrada registra la hora, el usuario, la razón, la IP, la penalización (permanente o `+N min`) y qué la provocó. Las entradas se purgan automáticamente cuando su bloqueo expira o tras el período de retención (`AUTH_LOG_RETENTION_DAYS`).

## Políticas de Bloqueo

El comportamiento global de bloqueo se define con `AUTH_LOCK_POLICY` (ver [Configuración](./configuration.md#seguridad)):

- `block` — las cuentas bloqueadas rechazan todos los inicios de sesión hasta que un administrador las desbloquee.
- `trusted_ip` (por defecto) — la IP registrada/último acceso de la cuenta puede iniciar sesión sin desbloquear.
- `email` — los usuarios bloqueados deben hacer clic en el enlace de desbloqueo enviado por correo (requiere SMTP); los administradores pueden desbloquear manualmente igualmente.

## Administración por Línea de Comandos

La imagen del backend incluye un CLI `bioplatform` que habla directamente con la base de datos. Está pensado para autoalojadores que necesitan administrar **su propia** cuenta: el panel de administración web bloquea deliberadamente la autoedición (plan, límites, contraseña y eliminación de la propia cuenta), y el CLI no tiene esa restricción — se ejecuta como el dueño de la instancia.

Ejecútalo dentro del stack en marcha:

```sh
./scripts/bioplatform.sh <comando> …        # Linux/macOS
./scripts/bioplatform.ps1 <comando> …       # Windows
pnpm cli -- <comando> …                     # atajo equivalente
```

En desarrollo (sin Docker), `pnpm --filter @bioplatform/backend cli -- <comando> …` funciona contra la base de datos local usando el `.env` del repositorio.

### Comandos

Los identificadores aceptan `@usuario`, `usuario@ejemplo.com`, un slug o alias de perfil, o un UUID — usa el que recuerdes.

| Comando | Qué hace |
| --- | --- |
| `users list [--tier T] [--json]` | Lista cuentas con plan, límites, rol y número de insignias. |
| `users show &lt;id&gt;` | Detalles completos de la cuenta + slugs de perfiles (JSON). |
| `users set-tier &lt;id&gt; FREE\|PRO\|ENTERPRISE` | Cambia el plan (sin techo — anulación del dueño). |
| `users set-limits &lt;id&gt; [--tracks N\|none] [--profiles N\|none] [--aliases N\|none]` | Fija límites por cuenta; `none` vuelve al valor por defecto del plan (`null`). |
| `users set-username &lt;id&gt; &lt;nuevoUsuario&gt;` | Renombra una cuenta; sincroniza el slug del perfil primario en una transacción. |
| `users set-email &lt;id&gt; &lt;nuevoEmail&gt;` | Cambia el email de inicio de sesión (se valida unicidad). |
| `users reset-password &lt;id&gt; [--password pw]` | Sobrescribe una contraseña (bcrypt, 12 rondas). Pide escribir **YES**; sin `--password` pregunta dos veces con entrada oculta. |
| `users unlock &lt;id&gt;` | Limpia baneos ACCOUNT/IP/COOKIE derivados del registro de autenticación de la cuenta y borra los intentos fallidos. |
| `users ban-invites &lt;id&gt;` / `unban-invites &lt;id&gt;` | Alterna la elegibilidad para invitaciones (banear también revoca códigos sin usar). |
| `users delete &lt;id&gt; [--yes]` | Elimina cuenta + perfiles + subidas (almacenamiento local) y dispara webhooks `user.deleted`. Requiere escribir **YES** salvo con `--yes`. |
| `profiles list &lt;id&gt;` | Lista los perfiles de la cuenta. |
| `profiles show &lt;id&gt; [--profile-id uuid]` | Vuelca un perfil completo incluidos enlaces sociales y alias. |
| `profiles edit &lt;id&gt; […]` | Edita nombre visible, bio, ubicación, sitio web y visibilidad. Usa `none` como valor para limpiar un campo; misma validación que la API del dashboard. |

Ejemplos:

```sh
./scripts/bioplatform.sh users set-tier @admin ENTERPRISE
./scripts/bioplatform.sh users reset-password admin@example.com
./scripts/bioplatform.sh profiles edit @admin --display-name "Kino" --website https://example.com --bio none
```

El CLI no hace comprobaciones de permisos a propósito — cualquiera que pueda ejecutarlo tiene control total de la base de datos de la instancia. Restringe el acceso al socket de Docker / host en consecuencia. Los cambios de contraseña siempre se confirman interactivamente antes de escribirse.

---

← [Guía de Usuario](./user-guide.md) · [Despliegue](./deployment.md) →
