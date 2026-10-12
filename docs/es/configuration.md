# Configuración

## Resumen

BioPlatform se configura enteramente mediante variables de entorno. Copia `.env.example` a `.env` y modifica los valores.

```bash
cp .env.example .env
```

## Aplicación

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `APP_NAME` | Nombre de la aplicación que se muestra en la barra de navegación, el pie de página y los correos | `BioPlatform` |
| `APP_TAGLINE` | Lema breve para la página de aterrizaje | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Descripción completa para SEO y etiquetas meta | `Create a stunning profile page...` |
| `APP_URL` | URL pública de tu instancia | `http://localhost:80` |
| `APP_GITHUB_URL` | URL del repositorio en GitHub | `https://github.com/00kino547/BioPlatform` |

## Frontend

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `VITE_API_URL` | URL de la API del backend (usa `/api` si usas proxy inverso con Nginx) | `/api` |
| `VITE_APP_NAME` | Nombre de la aplicación frontend | `BioPlatform` |
| `VITE_APP_TAGLINE` | Lema del frontend | `Your digital identity, beautifully crafted.` |
| `VITE_APP_DESCRIPTION` | Descripción del frontend | `Create a stunning profile page...` |
| `VITE_APP_URL` | URL pública del frontend | `http://localhost:80` |
| `VITE_APP_GITHUB_URL` | URL de GitHub del frontend | `https://github.com/00kino547/BioPlatform` |
| `VITE_CONTACT_URL` | URL de contacto o soporte (pie de página, páginas legales) | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | URL de la página de estado (enlace en el pie de página) | _(vacío)_ |
| `VITE_DOCS_URL` | URL de la documentación (enlace en el pie de página) | `https://github.com/00kino547/BioPlatform/tree/main/docs` |

> **Importante:** Las variables del frontend deben llevar el prefijo `VITE_` para que estén accesibles en el código React mediante `import.meta.env.VITE_*`.

## Backend

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `PORT` | Puerto del servidor backend | `3000` |
| `API_PREFIX` | Prefijo de rutas de la API | `/api` |
| `NODE_ENV` | Modo del entorno | `development` |
| `CONFIG_FILE` | Ruta al archivo de configuración de la instancia (config.yml) | `config.yml` |
| `CONFIG_AUTO_RELOAD` | Política de recarga en caliente: `true` = automática al guardar, `false` = solo `config reload` explícito | `true` |
| `ADS_FREE_OPT_OUT_ALLOWED` | Concede a los perfiles del plan FREE el derecho a ocultar los anuncios de la instancia (`hideAds: true`). PRO/Enterprise siempre pueden. | `false` |

### Configuración de instancia (config.yml)

Las partes públicas e impulsadas por datos de una instancia (textos de la
página de inicio, identidad legal del operador, barra de anuncio, visibilidad
de precios) viven en **un único archivo YAML editable** en lugar de variables
de compilación. Si el archivo no existe no pasa nada: la instancia se ejecuta
con los valores predeterminados del esquema. Añade el tuyo con:

```bash
cp config.yml.example config.yml
```

Móntalo **en lectura-escritura** dentro del contenedor backend (el montaje debe
ser escribible para que las señales de recarga puedan tocar su mtime):

```yaml
backend:
  volumes:
    - ./config.yml:/app/config.yml   # NO con :ro
```

Estructura (consulta `config.yml.example` para el archivo completo comentado):

```yaml
public:
  landing:      # tagline, titular/subtítulo del hero, footerAbout
  policy:       # operatorName, operatorContact, jurisdiction (Términos/Privacidad)
  operational:  # announcement { message, href }, hidePricing
  ads:          # enabled, verificationMeta, slots (ver «Anuncios de instancia» abajo)
private:
  operatorContactEmail:   # solo en el servidor, nunca se sirve al navegador
  ads:                    # secretos de las redes de anuncios, solo en el servidor
```

- **`public`** se sirve tal cual por `GET /api/config` y la SPA lo renderiza.
- **`private`** se valida en memoria pero **nunca** se serializa a ningún
  endpoint ni página (defensa contra spam).
- Todas las cadenas se sanean al cargar (se eliminan caracteres tipo HTML
  `< > { }`); el `href` del anuncio solo acepta `http(s)`.

**Recarga en caliente:** el servidor vuelve a leer el archivo cada ~5 segundos.
`CONFIG_AUTO_RELOAD=true` (predeterminado) aplica cualquier guardado de forma
automática; `=false` ignora las ediciones manuales. Un cambio inválido NUNCA
sustituye a la configuración en ejecución: la última configuración válida sigue
sirviéndose, el error se registra y la corrección se aplica en el siguiente
sondeo. Un archivo roto al **arrancar** se niega a iniciar el servidor a
propósito.

**CLI (dentro del contenedor backend):**

```bash
pnpm --filter @bioplatform/backend cli config validate   # comprobación sin conexión, salida 0/1
pnpm --filter @bioplatform/backend cli config reload     # aplica al servidor EN EJECUCIÓN
```

`reload` valida primero (nunca señala un archivo roto), luego toca el mtime del
archivo y crea `config.yml.reload`; el servidor en ejecución lo detecta en su
siguiente sondeo, incluso con `CONFIG_AUTO_RELOAD=false`.

### Anuncios de instancia

Los operadores de instancia pueden servir anuncios de terceros en la parte
inferior de cada página pública de perfil (debajo de los enlaces, encima del
pie) sin tocar código: todo es config.yml más una variable de entorno.
Activarlo expone las redes Google AdSense, Adsterra, AADS (solo BTC), PopAds,
PropellerAds, HilltopAds, Media.net e Infolinks desde el registro de
`apps/backend/src/lib/ads.ts`.

```yaml
public:
  ads:
    enabled: true
    verificationMeta:            # etiquetas meta para comprobaciones de propiedad
      - name: "google-site-verification"
        content: "AbCdEfGhIjKl..."
    slots:
      - network: "adsense"       # unidad <ins> + cargador
        placement: "below-links"
        params:
          adsense: { client: "ca-pub-…", slot: "…", autoEnabled: false }
      - network: "adsterra"      # o aads/popads/propellerads/hilltopads/medianet/infolinks
        placement: "below-links"
        params:
          script: { src: "https://a.magsrv.com/ad.js", token: "1234567" }
      - network: "raw"           # fragmento oficial pegado por el operador
        placement: "below-links"
        params:
          raw: "<div class='ad'>…</div>"
private:
  ads:                           # secretos de redes — validados, NUNCA serializados
    adsenseOauthToken: "..."
```

Comportamiento y garantías:

- **Dos estrategias de inserción.** Las redes `adsense`/basadas en script usan
  los montajes canónicos de `apps/frontend/src/components/ads/adEmbeds.ts`: el
  frontend construye el cargador/unidad él mismo. `network: raw` es un pegado
  literal del fragmento oficial de la red, renderizado dentro del hueco del
  anuncio **solamente**.
- **Lista de permitidos en el momento de la carga.** Todo `script.src` que un
  hueco pueda producir se verifica contra los hosts del registro de esa red
  (`resolveAdScriptSrc`); una URL `javascript:` o un host fuera de la lista
  invalida todo el archivo al arrancar/recargar.
- **El campo raw es el único canal sin sanear.** `public.ads.slots[].params.raw`
  se salta el saneamiento de cadenas `< > { }` a propósito (HTML escrito por el
  operador; por diseño llega al navegador) — nunca debe contener secretos y solo
  debe proceder del panel de la propia red de anuncios.
- **Pop-unders** (PopAds, PropellerAds) se disparan como mucho una vez por
  visita con un bloqueo de sessionStorage en el cliente, conservando el script
  original de la red.
- **Privacidad.** Los clics de anuncios reutilizan el pipeline de clics
  existente (`POST /api/profiles/click` con `platform: ad:<red>`) — la misma
  deduplicación por hash de visitante, el mismo respeto a DNT/GPC, visibles en
  las analíticas del Dashboard.
- **Renuncia (opt-out).** `Profile.hideAds` se muestra en el Dashboard siempre
  que los anuncios estén activos. PRO/Enterprise siempre pueden ocultarlos; los
  planes FREE solo si lo concedes vía la variable `ADS_FREE_OPT_OUT_ALLOWED=true`
  (predeterminado `false`).
- **Aviso de bloqueador de anuncios.** Cuando un perfil muestra anuncios, los
  visitantes cuyo navegador bloquea anuncios ven un aviso pequeño y descartable
  (tras 10 segundos, una vez por sesión). Está controlado por perfil vía
  `Profile.adblockDetectorEnabled` en el Dashboard: los perfiles FREE **siempre**
  lo muestran (la API rechaza desactivarlo para FREE), mientras que PRO/Enterprise
  pueden desactivarlo conservando los anuncios.
- **CSP.** `nginx/site.conf` lleva el súper-conjunto estático de los hosts de
  script/imagen/frame/connect de todas las redes del registro. Si el cargador
  real de una red carga desde un host no listado, añádelo **tanto** al registro
  como a la cabecera.
- **Los secretos se quedan en el servidor.** `private.ads` se valida al cargar
  pero nunca se serializa; `GET /api/config` solo lleva `public.ads`.

Un hueco se valida al cargar: AdSense necesita `client` (+ `slot`, salvo
`autoEnabled`), las redes de script necesitan su `src` en un host permitido de
la lista de la red, y `raw` necesita un fragmento real.

## Base de datos

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `DATABASE_URL` | cadena de conexión de PostgreSQL | — (obligatorio) |
| `POSTGRES_USER` | Usuario de PostgreSQL | `postgres` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `postgres` |
| `POSTGRES_DB` | Nombre de la base de datos PostgreSQL | `bioplatform` |

## Seguridad

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | — (obligatorio) |
| `JWT_EXPIRES_IN` | Caducidad del token JWT | `7d` |
| `TRUST_PROXY` | Número de saltos de proxy en los que se confía (obtención de la IP real del cliente para el limitador de intentos de autenticación) | `1` |
| `AUTH_LOCK_POLICY` | Política de bloqueo de cuenta: `block` (rechaza todos los intentos), `trusted_ip` (las IPs registradas y de último inicio de sesión pueden acceder sin desbloqueo), `email` (desbloqueo mediante enlace por correo electrónico) | `trusted_ip` |
| `AUTH_LOCK_DURATION_MINUTES` | Duración del bloqueo en minutos; `-1` = bloqueo permanente | `-1` |
| `AUTH_UNLOCK_TOKEN_TTL_MINUTES` | Caducidad en minutos del enlace de desbloqueo por correo (política `email`) | `30` |
| `AUTH_LOG_RETENTION_DAYS` | Días de retención de los registros de autenticación antes de que el proceso de limpieza los elimine | `30` |
| `AUTH_LOG_CLEANUP_INTERVAL_MINUTES` | Frecuencia (en minutos) de ejecución del proceso de limpieza de registros de autenticación | `60` |

> Utiliza una cadena aleatoria robusta de al menos 32 caracteres para `JWT_SECRET` en producción.

### Bloqueo y desbloqueo de cuentas

- Tras `MAX_FREE_ATTEMPTS` intentos fallidos (3), se aplica un bloqueo por huella digital (IP, cookie, user-agent) y por cuenta; por defecto es permanente (`AUTH_LOCK_DURATION_MINUTES=-1`).
- Con `trusted_ip`, el inicio de sesión desde la IP registrada o de último acceso funciona sin necesidad de desbloqueo y restablece los contadores.
- Con `email`, el usuario debe abrir el enlace de desbloqueo que recibe por correo (`AUTH_UNLOCK_TOKEN_TTL_MINUTES`); requiere que SMTP esté configurado.
- Los administradores pueden desbloquear cuentas desde el panel de administración (pestañas **Bans** y **Logs**). El desbloqueo elimina el bloqueo de la cuenta y los bloqueos de IP/cookie registrados contra ella.

## CORS

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `CORS_ORIGIN` | Orígenes permitidos (separados por comas) | `http://localhost:5173` |

> Cuando se usa Nginx, el frontend emplea URLs relativas para la API (`/api`), por lo que CORS no es necesario. Esta variable es únicamente un respaldo para desarrollo local.

## Nginx

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `ENABLE_INTERNAL_NGINX` | Activar el contenedor de Nginx | `true` |
| `NGINX_PORT` | Puerto HTTP de Nginx | `80` |
| `NGINX_HTTPS_PORT` | Puerto HTTPS de Nginx | `443` |
| `APP_URL_HOST` | Nombre de host (sin esquema) del dominio propio de la aplicación (por ejemplo, `example.com`). Nginx genera un mapa del dominio de la aplicación al arrancar para que los rastreadores sociales que solicitan la **raíz** de un dominio **personalizado** reciban el OpenGraph renderizado en el servidor desde el backend, mientras que el dominio de la aplicación conserva su OpenGraph estático del SPA. | _(vacío)_ |
| `ACME_ENABLED` | Activar el TLS automático (Let's Encrypt) para dominios personalizados ACTIVOS. | `false` |
| `ACME_DIRECTORY_URL` | URL del directorio ACME (staging para pruebas). | `https://acme-v02.api.letsencrypt.org/directory` |
| `ACME_EMAIL` | Correo electrónico de contacto de la cuenta ACME. | _(vacío)_ |
| `ACME_RENEW_BEFORE_DAYS` | Renovar certificados que venzan dentro de este número de días. | `30` |
| `ACME_INTERVAL_MINUTES` | Frecuencia (en minutos) con la que el backend revisa los certificados y regenera la configuración de Nginx. | `60` |
| `ACME_MAX_DOMAINS_PER_RUN` | Número máximo de dominios procesados por cada comprobación. | `20` |
| `ACME_CERTS_PATH` | Directorio de certificados y configuración de Nginx (misma carpeta del host que Nginx monta en `/etc/nginx/certs` en Docker). | `certs` |

### Dominios personalizados y TLS

Los usuarios pueden solicitar un dominio personalizado (plan PRO o Enterprise con el permiso `profiles.customDomain`), demostrar su propiedad mediante un registro TXT (`_bioplatform.<domain>`), y un administrador lo activa una vez superada la comprobación del TXT. Los dominios personalizados activos obtienen:

- **TLS automático (ACME)**: con `ACME_ENABLED=true`, el backend emite y renueva automáticamente certificados de Let's Encrypt (HTTP-01) para cada dominio activo, los almacena en `./certs/<domain>/`, regenera la configuración de Nginx y provoca una recarga. Los bloques de servidor HTTP de los dominios personalizados exponen `/.well-known/acme-challenge/` (proxiado al backend) y redirigen el resto a HTTPS. El administrador puede forzar la emisión para un dominio concreto (Admin → Custom Domains → "Issue cert"). Es necesario que el dominio apunte a este servidor con el puerto 80 abierto.
- **TLS manual**: coloca un certificado y una clave por dominio en `./certs/<domain>/cert.pem` + `key.pem` (excluidos de git). El backend los detecta en su siguiente comprobación (por defecto cada hora) y regenera la configuración de Nginx; Nginx se recarga automáticamente.
- **Enrutado sensible al host**: la raíz del dominio personalizado sirve el destino configurado (un perfil público) o la página de aterrizaje; el SPA resuelve la misma redirección en el lado del cliente.
- **OpenGraph sensible al host**: los rastreadores sociales que acceden a la raíz o a la URL de un perfil en un dominio personalizado reciben metaetiquetas renderizadas en el servidor con URLs canónicas y de OpenGraph que apuntan al dominio personalizado.

Los túneles rápidos (`cloudflared tunnel --url …`) no pueden enrutar dominios personalizados arbitrarios; utiliza un **túnel con nombre** con reglas de entrada por dominio para que el tráfico de cada dominio personalizado llegue a Nginx con la cabecera `Host` correcta (y enruta `/.well-known/acme-challenge/*` al backend).

## Almacenamiento

| Variable | Descripción | Predeterminado |
|----------|-------------|----------------|
| `STORAGE_PROVIDER` | Proveedor de almacenamiento (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Directorio local de subidas | `./uploads` |

Las subidas (avatares, banners, fondos de perfil, fondos de temporada, música) se almacenan bajo `LOCAL_STORAGE_PATH` (local) o se envían a un contenedor en la nube (`s3`/`r2`/`b2`) con nombres de archivo UUID y quedan registradas en la base de datos. Consulta [Proveedores de almacenamiento](storage.md) para la comparación completa; [Limpieza de subidas huérfanas](#limpieza-de-subidas-hu%C3%A9rfanas) describe cómo el proceso de limpieza depende del proveedor de almacenamiento.

### Limpieza de subidas huérfanas

Un proceso programado elimina las **subidas huérfanas**, es decir, archivos que ya no están referenciados por ningún perfil, tema de temporada ni pista musical. Surgen huérfanas cuando se sobrescribe un avatar o banner, se elimina un perfil, un tema o un usuario, o cuando una subida falla a mitad de proceso después de haber escrito el archivo en disco.

Funcionamiento:

- Al arrancar y después cada `ORPHAN_CLEANUP_INTERVAL_MINUTES` (por defecto 360), el backend construye el conjunto de nombres de archivo en uso consultando `Profile.avatar`, `Profile.banner`, `Profile.theme.backgroundImage`, `SeasonalTheme.config.backgroundImage` y `MusicTrack.filePath`, enumera los objetos del proveedor de almacenamiento y elimina todo archivo no referenciado.
- Los archivos con una antigüedad inferior a `ORPHAN_CLEANUP_GRACE_HOURS` (por defecto 24) **nunca** se eliminan, de modo que una subida cuya escritura en la base de datos aún no se ha confirmado queda protegida.
- Las miniaturas de `.media-cache` (imágenes derivadas y regenerables) se eliminan una vez superan `MEDIA_CACHE_MAX_AGE_HOURS` (por defecto 168 = 7 días).
- El proceso adquiere un bloqueo consultivo de PostgreSQL, por lo que es seguro ejecutarlo en varias réplicas del backend; un mecanismo interno evita ejecuciones solapadas en la misma instancia.
- La eliminación se limita estrictamente a la raíz del almacenamiento: los nombres se comparan por nombre base y cualquier intento de recorrido de rutas se rechaza. Define `ORPHAN_CLEANUP_ENABLED=false` para desactivar el proceso.

## Imagen de marca

Todas las variables de imagen de marca (`APP_NAME`, `APP_TAGLINE`, etc.) se propagan a:

- Barra de navegación, hero y pie de página (componentes React)
- Metaetiquetas SEO, OpenGraph y Twitter Cards
- Datos estructurados (JSON-LD)
- Título del navegador
- Contenido de preguntas frecuentes
- Enlace «Powered by» en perfiles públicos
- Páginas de Política de Privacidad y Términos de Servicio

Para reformular toda la aplicación, modifica estos valores en `.env` y vuelve a desplegar.

---

← [Variables de Entorno](./environment-variables.md) · [Guía de Usuario](./user-guide.md) →
