# Guía de Usuario

Todo lo que necesitas saber para usar tu cuenta de BioPlatform: tu página de perfil, enlaces, música, seguridad (2FA y passkeys), analíticas y qué hacer si te bloquean la cuenta.

## Tu Página de Perfil

Tu perfil vive en `/@usuario` (o `/usuario`) y se genera desde el panel → pestaña **Perfil**:

- **Nombre, bio, ubicación, sitio web** — se muestran en tu página pública.
- **Avatar y banner** — imágenes subidas (máximo 5 MB por subida).
- **Enlaces sociales** — elige una plataforma de la lista (GitHub, X, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email y más). Las URLs se validan; los enlaces de email se completan con `mailto:` automáticamente. Los usuarios de Discord deben usar el formato nuevo (sin discriminador) o pegar un enlace de invitación al servidor.
- **Interruptor público** — cuando está desactivado, solo tú (con sesión iniciada) puedes ver tu página.

## Enlaces y Música

- **Pestaña Enlaces** — añade los botones que se muestran en tu perfil.
- **Pestaña Música** — añade un archivo de audio local o un embed de Spotify/YouTube. Las cuentas gratuitas tienen un número limitado de pistas; los planes superiores aumentan el límite.

## Apariencia

La pestaña **Apariencia** te permite elegir uno de los temas integrados (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal). Tu elección se guarda en tu perfil y se muestra a los visitantes.

## Seguridad

Abre Panel → **Seguridad**. Aquí gestionas todo lo que protege tu cuenta.

### Autenticación de dos factores (aplicación autenticadora)

1. Haz clic en **Activar 2FA**.
2. Escanea el código QR (o introduce el secreto) en una aplicación autenticadora como Google Authenticator o Authy.
3. Introduce el código de 6 dígitos actual para confirmar.
4. A partir de ahora, iniciar sesión requiere tu contraseña **más** un código nuevo de la aplicación.

Para desactivar 2FA, introduce un código válido y haz clic en **Desactivar**.

### Passkeys (passcode / inicio de sesión sin contraseña)

Un passkey te permite iniciar sesión con la huella de tu dispositivo, Face ID, PIN o llave de seguridad — sin contraseña.

1. En la pestaña Seguridad, inicia **Añadir Passkey**.
2. Ponle un nombre (por ejemplo, "Teléfono").
3. Elige el tipo de credencial:
   - **Residente (descubrible)** — te permite iniciar sesión desde la página de login escribiendo solo tu usuario/email y confirmando con tu dispositivo.
   - **No residente** — requiere tu usuario/email más la confirmación del dispositivo.
4. Confirma con tu dispositivo cuando el navegador lo pida.

Tus passkeys se listan debajo; puedes eliminar uno en cualquier momento. Los passkeys también pueden usarse como segundo factor además de tu contraseña.

### Cambiar tu contraseña

Usa **Cambiar contraseña** en la pestaña Seguridad. Elige una contraseña fuerte y única — nunca reutilices la de otro sitio.

## Notificaciones por Email

La pestaña **Email** te permite activar o desactivar notificaciones cuando tu perfil recibe una nueva vista o se hace clic en un enlace. Solo funcionan cuando la instancia tiene SMTP configurado.

## Analíticas

La pestaña **Analíticas** muestra vistas y clics en enlaces a lo largo del tiempo, con recuentos totales y únicos. Tus propias visitas no se cuentan.

## Me han bloqueado — ¿qué hago?

Después de **3 intentos fallidos**, el sistema bloquea la IP, el navegador (cookie/user-agent) y tu cuenta para frenar ataques de fuerza bruta. Por defecto el bloqueo es permanente y se aplica a la combinación del atacante; el comportamiento exacto depende de `AUTH_LOCK_POLICY` de la instancia:

- **trusted_ip (por defecto)** — si te bloquean, intenta desde la IP con la que te registraste o desde tu IP habitual de último acceso: iniciar sesión desde allí funciona y restablece los contadores.
- **email** — la pantalla de login te dirá que revises tu correo. Abre el enlace de desbloqueo (válido por `AUTH_UNLOCK_TOKEN_TTL_MINUTES`, 30 minutos por defecto) e inicia sesión de nuevo.
- **block** — nadie puede iniciar sesión en una cuenta bloqueada hasta que un administrador la desbloquee.

Si nada de lo anterior ayuda, contacta al administrador de la instancia — puede desbloquear tu cuenta desde el panel de administración (ver la [Guía de Administración](./admin-guide.md)).

> El bloqueo se activa con intentos *incorrectos* repetidos. Revisa tu contraseña, evita reintentar rápido y usa el flujo de cambio de contraseña en lugar de adivinar.

---

← [Configuración](./configuration.md) · [Guía de Administración](./admin-guide.md) →
