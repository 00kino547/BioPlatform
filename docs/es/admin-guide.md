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
2. Haz clic en **Generar** — los códigos aparecen al principio de la tabla.
3. Comparte los códigos con quien quieras invitar. Un código usado muestra **Usado**; puedes **Revocar** uno sin usar en cualquier momento.

## Gestión de Usuarios

La pestaña **Usuarios** lista todas las cuentas. Haz clic en **Editar Perfil** para:

- Cambiar nombre, bio, ubicación, sitio web y visibilidad pública/privada.
- Asignar el **rol** del usuario (de los definidos en la pestaña **Roles**).
- Definir el **plan** del usuario (Free / Pro / Enterprise) y un **límite de pistas** personalizado (anula el predeterminado del plan para el reproductor de música).
- Definir un **límite de perfiles** y **límite de aliases** personalizado (anula los predeterminados del plan para las páginas multiperfil y los aliases).
- Alternar **insignias** del catálogo — estas son las insignias que el usuario puede mostrar en sus perfiles.
- Restablecer la contraseña de un usuario (backend `POST /api/admin/users/:id/reset-password`).

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

---

← [Guía de Usuario](./user-guide.md) · [Despliegue](./deployment.md) →
