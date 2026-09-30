# Guía de Usuario

Todo lo que necesitas saber para usar tu cuenta de BioPlatform: tu página de perfil, enlaces, música, seguridad (2FA y passkeys), analíticas y qué hacer si te bloquean la cuenta.

## Tu Página de Perfil

Tu perfil vive en `/@usuario` (o `/usuario`) y se genera desde el panel → pestaña **Perfil**:

- **Nombre, bio, ubicación, sitio web** — se muestran en tu página pública.
- **Avatar y banner** — imágenes subidas (máximo 5 MB por subida).
- **Enlaces sociales** — elige una plataforma de la lista (GitHub, X, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email, GitLab, Reddit, Pinterest, Snapchat, Threads, Bluesky, Mastodon, WhatsApp, Telegram, Signal, Kick, Steam, SoundCloud y más). Las URLs se validan; los enlaces de correo se completan con `mailto:` automáticamente. Los usuarios de Discord deben usar el formato nuevo (sin discriminador) o pegar un enlace de invitación al servidor.
- **Estado** — un estado estático que puedes mostrar en tu página pública: **Online**, **Ausente** o **Desconectado** (elige "oculto" para apagarlo). Se muestra como un pequeño punto de color + una etiqueta (Online verde, Ausente amarillo, Desconectado gris).
- **Cuenta atrás** — un bloque de cuenta atrás opcional para tu página: una etiqueta breve (p. ej. "Lanzamiento en") y una fecha/hora objetivo. Los visitantes ven un contador en vivo (días/hrs/min/seg) que cambia a **Hecho** cuando el objetivo pasa. Deja la fecha vacía para eliminar la cuenta atrás.
- **Interruptor público** — cuando está desactivado, solo tú (con sesión iniciada) puedes ver tu página.
- **Tu @usuario** — Panel → **Perfil** → *Tu @usuario* te permite cambiar de nombre a tu identificador de cuenta. Introduce el nuevo nombre (3-32 caracteres: minúsculas, números, `_`, `-`) y verás un veredicto de disponibilidad en vivo mientras escribes. Al guardar, el identificador **y** la URL de tu perfil principal cambian al nuevo nombre de una sola vez; cualquier enlace a tu antigua dirección sigue funcionando gracias a una redirección automática, y solo puedes volver a cambiar de nombre **una vez cada 30 días**.

## Múltiples Perfiles y Aliases

La pestaña **Perfiles** gestiona todas las páginas de tu cuenta:

- **Crear un perfil** — introduce un slug en minúsculas (p. ej. `gaming`) y haz clic en **Crear Perfil**. Cada perfil tiene su propio slug, enlaces, música, tema e interruptor público/privado. Las cuentas gratuitas obtienen 1 perfil; los planes superiores aumentan el límite.
- **Establecer principal** — el perfil principal es el predeterminado de la cuenta. Su slug está fijado a tu nombre de usuario; usa aliases para darle URLs cortas adicionales.
- **Aliases** — cada perfil puede tener URLs cortas adicionales que resuelven a la misma página (p. ej. `/bio` apuntando a tu perfil principal). Se aplican los límites del plan. Los aliases facilitan compartir un enlace corto y memorable a un perfil específico.
- **Insignias** — muestra insignias en una página de perfil como iconos de color (cada insignia tiene su propio color e icono). Las insignias provienen del conjunto que los administradores asignan a tu cuenta; tú eliges cuáles aparecen por perfil. Las insignias que aún no posees aparecen atenuadas con un candado y no se pueden activar hasta que un administrador te las conceda. En la pestaña **Apariencia** puedes arrastrar las insignias para fijar su orden de visualización; las que obtengas después aparecen al final de la lista.
- **Eliminar un perfil** — cualquier perfil puede eliminarse. Si eliminas el perfil principal, su estado pasa al perfil más antiguo restante; el último perfil de la cuenta está protegido.

El selector de la cabecera determina qué perfil editan las demás pestañas (Perfil, Enlaces, Apariencia, Analíticas, Email, Música, Discord, Datos), y **Ver Perfil** abre el perfil seleccionado.

## Enlaces y Música

- **Pestaña Enlaces** — añade los botones que se muestran en tu perfil. Cada enlace puede tener una **Etiqueta** (texto mostrado) y — cuando el operador de la instancia active las funciones — un **encabezado de sección** (lo agrupa bajo un título en tu perfil), un **favicon personalizado** (un emoji o una imagen subida sustituye al logotipo de la plataforma) y un **código QR**: generar/descargar en un clic desde el panel y un QR escaneable opcional mostrado en tu perfil para ese enlace.
- **Pestaña Música** — vincula un archivo de audio local o un embed de Spotify/YouTube. Las cuentas gratuitas tienen un número limitado de pistas; los planes superiores aumentan el límite.

## Apariencia

La pestaña **Apariencia** te permite elegir uno de los temas integrados (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal). Tu elección se guarda en tu perfil y se muestra a los visitantes.

### Distribución (layout)

Una sección **Distribución** te permite elegir cómo se organiza tu perfil entre trece plantillas:

- **Predeterminada** — una columna única centrada con filas de enlaces estándar.
- **Cuadrícula** — los enlaces se muestran como una cuadrícula de dos columnas de teselas con iconos.
- **Compacta** — una columna única más estrecha con filas más finas para que quepan más enlaces en la parte visible de la pantalla.
- **Amplia** — una tarjeta más ancha (hasta el contenedor 5xl) que distribuye los enlaces en tres columnas.
- **Vidrio esmerilado (Glassmorphism)** — una tarjeta de cristal translúcida con efecto de desenfoque sobre tu fondo.
- **Minimal** — una tarjeta transparente sin bordes; sobre una imagen de fondo, un difuminado suave tonifica la tarjeta para que el texto siga siendo legible.
- **Barra lateral** — contenido y enlaces lado a lado en pantallas grandes (con una cuadrícula de enlaces de dos columnas) en lugar de apilarlos verticalmente.
- **Editorial** — una cabecera centrada y enfocada en el texto, con filas de enlaces separadas por líneas finas.
- **Hero** — un perfil centrado y llamativo con una banda de degradado de acento en la parte superior.
- **Bento** — una cuadrícula de cajas donde tu identidad, biografía y enlaces viven cada uno en su propia tesela.
- **Terminal** — una ventana de terminal de estilo desarrollador con tipografía monoespaciada y una **línea de comandos completamente interactiva**. Los visitantes escriben comandos reales como `help`, `whoami`, `ls`, `cat whoami.txt`, `cat bio.txt`, `open <plataforma>` (abre el enlace de esa red social en una pestaña nueva; si no existe, copia el identificador, como los nombres de Discord), `date`, `echo <texto>` y `clear`. Las flechas arriba y abajo recuperan comandos anteriores del historial, y una pista del tipo `Type "help"...` da la bienvenida a los visitantes nuevos. Hay varios huevos de pascua ocultos que no aparecen en `help` (p. ej. `neofetch`, `sl`, `cmatrix`) — ¡pruébalos! Los usuarios **PRO y Enterprise** pueden añadir hasta 12 **comandos personalizados** desde *Apariencia → Comandos de terminal* (solo aparece cuando la distribución de terminal está seleccionada). Cada comando incluye una línea de salida que se imprime al ejecutarlo, una descripción corta opcional que se muestra en `help`, y un destino de enlace opcional. Los comandos personalizados se listan tanto en `help` como en `ls`. Tanto `links/` como `cmds/` son subdirectorios reales: los visitantes pueden ejecutar `ls links` o `ls cmds` (con o sin la barra final) para listar solo ese grupo. Los comandos integrados siempre tienen prioridad sobre los personalizados.
- **Polaroid** — una tarjeta de papel ligeramente rotada con el avatar enmarcado al estilo de una fotografía.
- **Barra superior (Topbar)** — un encabezado horizontal tipo barra de navegación con filas divisorias debajo.

### Fondo

Una sección **Fondo** te permite definir el fondo de tu perfil público. Puedes elegir uno de los **presets de degradado** integrados (Midnight, Ocean, Sunset, Forest, Aurora, Royal, Mint, Candy, Ember, Ice, o ninguno), uno de los **presets de temporada** (Flores de primavera, Hojas de otoño, Nieve de invierno, Halloween, Navidad, Nochevieja, San Valentín, San Patricio), añadir una **URL de imagen personalizada** o **subir** tu propia imagen o GIF (JPEG, PNG, WebP o GIF; hasta 12 MB). Los GIF subidos se reproducen tal cual y se animan; las imágenes fijas se optimizan automáticamente. Un botón **Eliminar** borra tu fondo personalizado.

### Decoraciones de temporada

Una sección **Decoraciones de temporada** en Apariencia añade dos interruptores:

- **Decoraciones de temporada** (violeta) — al activarlas, la plataforma puede aplicar un tema de temporada o festivo activo (p. ej. Navidad, Halloween) a tu perfil. Mientras un tema esté activo, sustituye por completo tus colores, distribución y fondo personalizados. Si el operador ha desactivado la función completa, no podrás activarla.
- **Permitir siempre Navidad** (rojo) — opta por conservar el tema de Navidad incluso cuando el operador ha desactivado la tematización de temporada. Este interruptor anula la configuración global del operador únicamente para tu cuenta.

## Seguridad

Abre el Panel → **Seguridad**. Aquí gestionas todo lo que protege tu cuenta.

### Autenticación de dos factores (aplicación autenticadora)

1. Haz clic en **Activar 2FA**.
2. Escanea el código QR (o introduce el secreto) en una aplicación autenticadora como Google Authenticator o Authy.
3. Introduce el código de 6 dígitos actual para confirmar.
4. A partir de ahora, iniciar sesión requiere tu contraseña **más** un código nuevo de la aplicación.

Para desactivar 2FA, introduce un código válido y haz clic en **Desactivar**.

### Passkeys (passcode / inicio de sesión sin contraseña)

Un passkey te permite iniciar sesión con la huella dactilar de tu dispositivo, Face ID, PIN o llave de seguridad — sin necesidad de contraseña.

1. En la pestaña Seguridad, inicia **Añadir Passkey**.
2. Ponle un nombre (p. ej. "Teléfono").
3. Elige el tipo de credencial:
   - **Residente (descubrible)** — te permite iniciar sesión desde la página de acceso escribiendo solo tu usuario o correo electrónico y confirmando con tu dispositivo.
   - **No residente** — requiere tu usuario o correo electrónico más la confirmación del dispositivo.
4. Confirma con tu dispositivo cuando el navegador lo solicite.

Tus passkeys aparecen listadas más abajo; puedes eliminar cualquiera en cualquier momento. Los passkeys también pueden usarse como segundo factor además de tu contraseña.

### Inicio de sesión social (SSO)

Cuando la instancia tiene uno o más proveedores sociales configurados (Google, GitHub, Discord), la pestaña Seguridad muestra una tarjeta **Opciones de inicio de sesión** donde puedes:

- **Vincular un proveedor** — haz clic en **Vincular `provider`**, autoriza con el servicio y tu cuenta se conecta. Podrás iniciar sesión con ese proveedor en los próximos accesos.
- **Desvincular un proveedor** — elimina un proveedor vinculado. No puedes eliminar tu único método de acceso.
- **Omitir 2FA en el inicio de sesión social** — cuando la instancia lo permite, activa esta opción para acceder instantáneamente con un proveedor vinculado sin introducir un código de segundo factor.

Durante el registro o al iniciar sesión, también puedes hacer clic en **Continuar con `provider`** para acceder con tu cuenta social. Si tu correo electrónico coincide con una cuenta existente, el proveedor se vincula automáticamente.

### SSO empresarial (Enterprise)

El inicio de sesión social (Google, GitHub, Discord) está disponible en todos los planes. La tarjeta **SSO empresarial** de la pestaña Seguridad es una función **Enterprise**: permite al titular de una cuenta Enterprise conectar un proveedor corporativo de inicio de sesión único que hable **OIDC** (Microsoft Entra ID, Okta, Keycloak, Google Workspace, Auth0 y otros proveedores OpenID Connect 1.0).

- **Conectar un proveedor** — introduce un nombre de proveedor (**obligatorio**; se muestra en la página de inicio de sesión), la **URL del emisor (issuer)** o la URL del documento de descubrimiento OIDC (el servidor añade `/.well-known/openid-configuration` automáticamente cuando es necesario), el **client ID** de la aplicación, el **client secret** (obligatorio la primera vez, opcional después — se guarda cifrado y nunca se vuelve a mostrar), una URL de logo opcional y **dominios de correo permitidos** (separados por comas; déjalo vacío para permitir cualquier correo verificado que devuelva el IdP).
- **El botón de inicio de sesión** — una vez guardado y activado, «Continuar con `<proveedor>`» aparece en las páginas de inicio de sesión y registro para todos. Cuando hay más de un proveedor empresarial publicado, se agrupan en un único menú **SSO empresarial** que lista cada proveedor (logo, nombre y host). Un usuario conectado cuyo **correo verificado** del IdP coincida con una cuenta existente se vincula en el primer acceso: los visitantes sin cuenta coincidente reciben un error claro en lugar de una cuenta nueva, por lo que los miembros del equipo se añaden primero mediante invitaciones.
- **Forzar SSO** — actívalo para desactivar el inicio de sesión con contraseña y social **en tu propia cuenta**, de modo que esa cuenta solo pueda acceder a través del proveedor corporativo.
- **Probar y gestionar** — **Probar inicio de sesión (Test sign-in)** ejecuta el flujo completo, **Vincular esta cuenta (Link this account)** conecta tu propia cuenta, y la lista de identidades te permite ver y desvincular todas las cuentas que han accedido a través de tu proveedor. **Eliminar proveedor (Remove provider)** borra la configuración y todas sus identidades.

Los usuarios de otros planes nunca ven la gestión del SSO empresarial; los botones de proveedor que ven en la página de inicio de sesión provienen únicamente de los proveedores que ha publicado una cuenta Enterprise.

### Cambiar tu contraseña

Usa **Cambiar contraseña** en la pestaña Seguridad (o el flujo del backend `POST /auth/change-password`). Elige una contraseña fuerte y única — nunca reutilices la de otro sitio.

## Notificaciones por Correo

La pestaña **Email** te permite activar o desactivar notificaciones cuando tu perfil recibe una visita o se hace clic en un enlace. Solo funcionan cuando la instancia tiene SMTP configurado.

La pestaña **Email** también aloja el gestor de **Boletín (Newsletter)** (solo aparece cuando el operador de la instancia ha habilitado los correos del boletín). Ahí puedes:

- **Ajustes** — activar el boletín (permitir envíos), mostrar la caja de suscripción en tu perfil público y fijar un encabezado personalizado. Apagar el interruptor **pausa** el boletín: la caja de suscripción sigue visible y los nuevos suscriptores se siguen capturando, pero el envío queda bloqueado hasta que lo vuelvas a activar. En un perfil que nunca se ha activado, no se muestra ninguna caja de suscripción.
- **Suscriptores** — ver quién se suscribió (y cuándo, y con qué versiones de políticas aceptó) y borrar un registro de suscriptor, lo que cumple el derecho al olvido del GDPR.
- **Enviar boletín** — redacta el asunto y el cuerpo y envía a todos los suscriptores activos. El envío está limitado por plan (por ejemplo, las cuentas FREE no pueden enviar; PRO permite un envío cada 24 h por defecto; un administrador puede cambiar estos límites). Un aviso te recuerda que los suscriptores son personas a las que no debes hacer spam.
- **Historial** — cada envío queda registrado con los conteos de destinatarios y aciertos.

Cuando te suscribes al boletín de alguien desde su perfil público, escribes tu correo, marcas la casilla de aceptación de los Términos y la Política de Privacidad y ya estás dentro. Puedes darte de baja en cualquier momento con el enlace de un solo clic de cada correo del boletín (y también funciona visitando ese enlace directamente); tras darte de baja, el perfil deja de enviarte y no puede escribirte de nuevo salvo que te suscribas de cero.

La pestaña **Email** también te permite controlar los **anuncios de la plataforma**. Al crear una cuenta, el formulario de registro exige una única casilla de aceptación de los Términos de Servicio y la Política de Privacidad antes de crear la cuenta (tu aceptación queda guardada en la cuenta, junto con las versiones de políticas que aceptaste). Una segunda casilla, **opcional**, te suscribe a los anuncios de la plataforma: noticias puntuales y novedades de producto que el operador de la instancia envía de una vez a todos los usuarios que optaron. Puedes activar o desactivar esa preferencia en cualquier momento con el interruptor **Platform announcements** de esta pestaña, y cada correo de anuncio incluye su propio enlace de baja de un clic que se aplica a toda tu cuenta.

## Propinas

La pestaña **Tips** te permite aceptar propinas en criptomoneda (Bitcoin y Litecoin) en un perfil.

- **Ajustes** — activar las propinas, elegir un encabezado y añadir una o ambas direcciones de cartera (Bitcoin `1…` / `3…` / `bc1…`, Litecoin `L…` / `M…` / `ltc1…`). Mientras las propinas estén apagadas, no aparece ningún bloque de propinas en tu perfil público y tus direcciones permanecen ocultas; solo cuando las activas con al menos una dirección configurada se muestra el bloque público de propinas.
- **Resumen** — el registro de propinas: cuánto se ha recibido en cada moneda (la cantidad **registrada** es cada intención de propina; la cantidad **confirmada** son los pagos realmente liquidados a través de BTCPay cuando la instancia lo tiene configurado), más las 50 propinas más recientes. Puedes borrar un registro de propina en cualquier momento.

Para tus visitantes el bloque abre un pequeño diálogo: eligen una moneda, seleccionan un importe predefinido o escriben uno propio, añaden opcionalmente un nombre y un mensaje, y o bien pagan a través del checkout de BTCPay (cuando la instancia está configurada con BTCPay) o escanean el código QR de la cartera / copian la dirección y envían las monedas on-chain. Las propinas registradas pero no confirmadas son cómo concilias los pagos que llegan directamente a tu propia cartera.

## Tienda

La pestaña **Tienda** te permite vender productos digitales en un perfil. Cada perfil tiene su propia lista de productos (hasta **3 productos en FREE**, ilimitados en PRO/Enterprise) y en tu perfil público se muestra un bloque de tienda con los productos que tengas habilitados.

- **Añadir un producto** — subes el archivo entregable (limitado por `PRODUCT_FILE_MAX_MB`, 50 MB por defecto) y le pones un título (máx. 80 caracteres) y una descripción opcional (máx. 500). El precio es por producto y se fija en unidades de moneda: `0` convierte el producto en **gratis**. Un producto puede mostrar además una **imagen de previsualización** en su tarjeta (JPEG/PNG/GIF/WebP, hasta 5 MB) para que los visitantes se hagan una idea de lo que van a comprar antes de pagar.
- **Descuento de perfil** — un porcentaje (`0–100`) aplicado al precio de todos los productos del perfil. La tarjeta pública y el checkout muestran siempre el precio con descuento calculado en el servidor, con el precio original tachado.
- **Gestionar productos** — cada fila de producto tiene un interruptor para habilitarlo/deshabilitarlo (los productos deshabilitados desaparecen de la tienda pública), un botón para volver a subir la previsualización y una acción de borrado (se eliminan el archivo entregable y la previsualización de forma permanente). El tráfico de compradores se ve en la tabla de **Ventas recientes**: producto, correo del comprador enmascarado (p. ej. `a***@dominio`), método de pago, estado, importe y fecha (los reembolsos se gestionan a través de la pasarela de la instancia).
- **Lado del comprador** — los visitantes abren una tarjeta de producto y eligen método de pago (tarjeta, PayPal o cripto cuando la instancia los tenga habilitados), una moneda para cripto y escriben un correo electrónico. Las compras de pago redirigen al checkout de la pasarela, esperan la confirmación y envían el enlace de descarga a ese correo; los productos gratis se entregan al instante en el mismo diálogo. Los compradores con cuenta también ven la pestaña **Compras** en el panel donde pueden volver a descargar lo que hayan pagado.

El cálculo de precio y descuento ocurre siempre en el servidor: lo que ves en el panel y en la tienda es siempre el precio descontado autorizado.

## Discord

La pestaña **Discord** (solo está presente cuando la instancia tiene Discord configurado) te permite:

- **Conectar tu cuenta** — autorizas con Discord (scope `identify`, se requiere consentimiento). Conectar es opcional y siempre es bajo tu decisión.
- **Mostrar presencia en tu perfil** — al activarlo, los visitantes ven una tarjeta de estado en vivo (online/idle/dnd/offline, actividad actual, canción actual, estado personalizado) en tu página pública y en las previsualizaciones de enlaces compartidos (imagen OpenGraph). No se muestra nada hasta que lo actives. La presencia en vivo proviene de un bot de la instancia, así que debes estar en un servidor que comparta el bot y la instancia debe tener configurado `DISCORD_BOT_TOKEN`.
- **Mostrar detalles de actividad** — controla por separado si aparecen los detalles de actividad (juegos, Spotify, estado personalizado); el estado online en sí siempre se muestra una vez que compartir presencia está activo.
- **Unirse al hub de presencia** — si la instancia publica una invitación a un servidor (`DISCORD_GUILD_INVITE`), un botón "Join presence hub" la abre para que te unas al servidor donde reside el bot de presencia y empieces a compartir tu estado.
- **Invitar al bot a tu servidor** — como alternativa, un botón "Invite the bot to your server" abre el flujo de invitación de bot de Discord para el bot de la instancia (`DISCORD_CLIENT_ID`). Puedes añadir el bot a cualquier servidor que administres, de modo que la presencia funciona sin unirte a un hub compartido. El bot funciona en cualquier cantidad de servidores.
- **Publicar en Discord** — pega una URL de webhook (canal → Integraciones → Webhooks) para obtener un botón "Post to Discord" que comparte un embed enriquecido con el enlace a tu perfil, avatar, bio y estado actual.

**Privacidad:** no se recopila ni almacena ningún dato de presencia en el servidor más allá de los tokens OAuth cifrados; la presencia se lee en vivo mediante un único bot compartido y se almacena únicamente en caché en memoria. Un usuario que nunca conecta ni activa esta función no es rastreado en ningún momento.

## Analíticas

La pestaña **Analíticas** muestra visitas y clics en enlaces a lo largo del tiempo, con recuentos totales y únicos. Tus propias visitas no se contabilizan.

- **Línea de tiempo de 24 horas** — visitas y clics desglosados en bloques horarios de las últimas 24 horas.
- **Clics por enlace** — un desglose por enlace (número de clics, visitantes únicos, hora del último clic) de los últimos 30 días, emparejado por la etiqueta del enlace. Cada fila tiene un botón **Restablecer** que borra solo el historial de clics de ese enlace.
- **Restablecer todo** — un botón en la barra de herramientas borra todos los registros de clics del perfil. Las vistas de página nunca se eliminan.

El desglose por enlace y los botones de restablecer están limitados a cuentas premium (PRO/Enterprise); las cuentas gratuitas ven las estadísticas agregadas sin ellas.

## Invitaciones

La pestaña **Invitaciones** es donde gestionas los códigos de registro y cualquier crédito de invitación que tengas:

- **Allowance de evento** — si la instancia ejecuta un evento de invitación, recibes un allowance (un número de invitaciones) que vence en una fecha determinada. Cada invitación que generes a partir de él descuenta de tu allowance.
- **Cuota de rol** — si tu rol puede generar invitaciones, la pestaña muestra tu límite por lote y el tiempo de espera. La capacidad de generar de cada cuenta la controla la instancia; si está desactivada, la pestaña te lo indica.
- **Generar** — elige cuántos códigos y un plazo de vencimiento en días (dentro del rango mínimo y máximo de tu rol, y sin superar el vencimiento de tu allowance). Deja el plazo en blanco para usar el predeterminado. Tras el periodo de espera, puedes volver a generar.
- **Reembolsos** — un código de evento que vence *sin usarse antes* de que venza tu allowance se reembolsa: el crédito vuelve a tu allowance en tu siguiente visita a la pestaña, para que no se desperdicie nada.
- **Enlaces de invitación compartibles** — cada código se puede compartir como `/invite/<code>`, una página de aterrizaje pública que muestra quién te invitó y cualquier descuento para el invitado, con un botón que rellena el formulario de registro del visitante. Los códigos devuelven un 404 a menos que sean válidos, sin usar y no hayan expirado.

Los códigos que ya no necesites pueden **revocarse** (excepto una vez utilizados). Si un administrador te bloqueó las invitaciones, la pestaña muestra un aviso y ya no puedes generar ni recibir allowance.

## Facturación

La pestaña **Facturación** muestra tu plan actual, tu descuento efectivo, los planes disponibles y tu historial de pedidos:

- **Planes** — los precios de los planes Gratuito, Premium (PRO) y Enterprise los fija el propietario de la instancia (en la configuración del entorno) y aquí se muestran con tu descuento ya aplicado. Tu descuento se calcula automáticamente con el programa de afiliados: el mayor entre tu descuento de hito como referidor y el descuento plano de invitado (si te registraste mediante la invitación de alguien).
- **Mejorar** — elige un plan superior al actual y un método de pago. Si el propietario de la instancia habilitó los pagos en línea puedes pagar con **Tarjeta** (Stripe), **PayPal** o **Cripto** — se abre una sesión de pago en otra pestaña y, en cuanto el proveedor la confirma, tu cuenta se mejora automáticamente. En caso contrario (o eligiendo **Contactar al propietario**) creas un pedido manual **PENDIENTE** con una nota opcional ("prefiero pagar por transferencia", datos de contacto, etc.) y el propietario de la plataforma se encarga del resto. El método de contacto configurado por el propietario (por ejemplo, email, Telegram o Discord) se muestra para que puedas organizar el pago directamente. Si se cotiza un precio cripto, también ves la cantidad exacta de la moneda y la tasa USD usada.
- **Historial de pedidos** — cada pedido aparece con su estado (Pendiente / Pagado / Cancelado / Reembolsado), el precio cobrado y cualquier nota que haya dejado el propietario. Un pedido con un pago en línea pendiente muestra un botón **Pagar ahora** que vuelve a abrir su página de pago.

Cuando el propietario marca un pedido como **Pagado** en el panel de administración — o un webhook de pago en línea lo confirma — tu cuenta se mejora automáticamente al plan solicitado. Los reembolsos se registran en tu historial pero nunca eliminan un plan que ya tengas.

> La sección de precios pública en la página de inicio muestra los mismos precios configurados en el entorno, y su botón Premium lleva a los usuarios autenticados directamente a esta pestaña.

## Dominios Personalizados

La pestaña **Domain** (disponible en cuentas PRO/Enterprise cuyo rol tenga el permiso `profiles.customDomain`) te permite usar tu propio dominio para tu perfil:

1. **Solicitar** — introduce un hostname simple como `example.com` (sin `https://`, ruta, puerto ni `www.`). Un dominio personalizado por perfil.
2. **Verificar la propiedad** — añade un registro TXT a tu proveedor de DNS: nombre de registro `_bioplatform.example.com` con el valor exacto mostrado. El DNS puede tardar unos minutos en propagarse; haz clic en **Verify now** una vez añadido.
3. **Aprobación** — tras pasar la verificación TXT, un administrador revisa y activa tu dominio. Mientras tanto permanece en estado **Verified · awaiting approval**.
4. **Uso** — una vez en estado **Active**, tu dominio personalizado sirve tu perfil. Elige qué muestra la raíz (`https://example.com/`): la **página de inicio** (tu perfil sigue en `/tu-slug`) o directamente uno de tus **perfiles públicos**.

El OG de la raíz (embeds de Discord/X/Telegram) se renderiza en el servidor y apunta a tu dominio personalizado. Al desconectar, se elimina el dominio y se libera para reutilizarlo.

**DNS y TLS:** tras la activación, apunta los registros `A`/`AAAA` de tu dominio (o un `CNAME`) al túnel/ingress de la instancia. Si la instancia tiene el TLS automático activado, se emite un certificado para ti y la pestaña Domain muestra "HTTPS certificate active" con su fecha de renovación; en caso contrario, un administrador instala uno manualmente (ver la [Guía de Despliegue](./deployment.md)). El perfil redirige aquí solo cuando la instancia enruta el dominio hacia ti.

> Nota: un passkey está vinculado al dominio donde lo registraste — uno añadido en el dominio principal de la instancia funciona allí, y uno añadido en tu dominio personalizado funciona en ese dominio personalizado.

## Me han bloqueado, ¿qué hago?

Tras **3 intentos fallidos**, el sistema bloquea la IP, el navegador (cookie/user-agent) y tu cuenta para prevenir ataques de fuerza bruta. Por defecto el bloqueo es permanente y se aplica a la combinación del atacante; el comportamiento exacto depende de la política `AUTH_LOCK_POLICY` de la instancia:

- **trusted_ip (predeterminada)** — si te bloquean, intenta de nuevo desde la IP con la que te registraste o desde tu IP habitual de último acceso: iniciar sesión desde allí funciona y restablece los contadores.
- **email** — la pantalla de acceso te indicará que revises tu correo. Abre el enlace de desbloqueo (válido durante `AUTH_UNLOCK_TOKEN_TTL_MINUTES`, 30 minutos por defecto) y vuelve a iniciar sesión.
- **block** — nadie puede iniciar sesión en una cuenta bloqueada hasta que un administrador la desbloquee.

Si ninguna de estas opciones te ayuda, contacta al administrador de la instancia — puede desbloquear tu cuenta desde el panel de administración (ver la [Guía de administración](./admin-guide.md)).

> El bloqueo se activa con intentos *incorrectos* repetidos. Verifica tu contraseña, evita reintentar rápidamente y usa el flujo de recuperación o cambio de contraseña en lugar de seguir intentándolo.

---

← [Configuración](./configuration.md) · [Guía de administración](./admin-guide.md) →
