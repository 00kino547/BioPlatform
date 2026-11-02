# Traducir BioPlatform

Esta página explica cómo funcionan las traducciones y cómo ejecutar la instancia opcional y autoalojada de Weblate que las gestiona. Está escrita para el operador de la instancia (que arranca Weblate) y para los colaboradores (que traducen).

El inglés es la **fuente de verdad**. Cada cadena visible para el usuario se escribe primero en inglés y luego se traduce. Consulta la [Política de Idioma](contributing.md#política-de-idioma) y su [Excepción de localización](contributing.md#excepción-de-localización) en la guía de contribución.

## Qué es Weblate aquí

[Weblate](https://weblate.org/) es una plataforma de localización continua de código abierto. En BioPlatform cumple un único papel: un **editor de traducciones** para las cadenas visibles de la interfaz. Lee las cadenas fuente en inglés de este repositorio, permite traducirlas en el navegador y convierte las traducciones terminadas en un **Pull Request contra `main`**.

Weblate es **opcional y de adhesión voluntaria**. Vive detrás del perfil `weblate` de Docker Compose, así que un despliegue normal (`docker compose up -d`) nunca lo arranca. Cuando se habilita, se ejecuta como un stack totalmente aislado:

- un servicio de aplicación Weblate,
- su propio PostgreSQL dedicado,
- su propio Redis dedicado (caché + broker de Celery).

Estos contenedores no comparten nada con el `postgres`/`redis` de la aplicación. Weblate publica un puerto de host **solo en loopback** (`WEBLATE_HOST_PORT`, por defecto `8080`), de modo que el perfil `weblate` funciona por sí solo. Para el acceso público lo pones detrás de un proxy inverso que termina TLS: ya sea el nginx incluido (ejecuta el perfil `nginx`, recomendado) o el tuyo propio. Los archivos de traducción no se sirven en tiempo de ejecución; van **empaquetados en la compilación del frontend** (consulta [Cómo llegan las traducciones a la aplicación](#cómo-llegan-las-traducciones-a-la-aplicación)).

## Requisitos previos

- Docker y el plugin de Docker Compose.
- Un nombre de host para Weblate (por ejemplo `translate.example.com`). Termina TLS por delante: ya sea con el nginx incluido (`--profile nginx`; genera el vhost automáticamente mientras el contenedor de Weblate esté en marcha) o con tu propio proxy inverso que reenvíe al contenedor de Weblate en el **puerto 8080** (nombre interno del servicio `weblate`, o `127.0.0.1:<WEBLATE_HOST_PORT>` desde el host).
- Una app OAuth de GitHub (para el inicio de sesión de los colaboradores): consulta [Configurar la app OAuth de GitHub](#configurar-la-app-oauth-de-github).
- Credenciales SMTP de salida: consulta [Configurar SMTP](#configurar-smtp).
- Acceso al repositorio para que Weblate pueda clonarlo y abrir Pull Requests (un token de acceso personal de GitHub o una GitHub App instalada en el repositorio). Es distinto de la app OAuth usada para iniciar sesión.
- Al menos el hardware mínimo de Weblate (unos 3 GB de RAM, 2 núcleos de CPU y 1 GB de almacenamiento para empezar).

## Configurar la app OAuth de GitHub

Los colaboradores inician sesión con GitHub, la misma cuenta que usan para abrir los Pull Requests de traducción.

1. En GitHub, ve a **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Pon **Homepage URL** a `https://<WEBLATE_SITE_DOMAIN>`.
3. Pon **Authorization callback URL** a `https://<WEBLATE_SITE_DOMAIN>/accounts/complete/github/`.
4. Registra la app y copia el **Client ID** en `WEBLATE_SOCIAL_AUTH_GITHUB_KEY`; genera un **Client secret** y ponlo en `WEBLATE_SOCIAL_AUTH_GITHUB_SECRET` en tu `.env`.

La app OAuth solo autentica usuarios. Para hacer push al repositorio y abrir Pull Requests hace falta otra credencial: crea un **token de acceso personal** de GitHub con acceso de lectura/escritura a **Contents** y **Pull requests** (o instala una GitHub App) e introdúcelo al configurar el componente dentro de Weblate.

> **Reutilizar la app OAuth de la aplicación.** Una app OAuth de GitHub acepta hasta **10 URI de redirección** (desde agosto de 2026), así que no necesitas una app aparte: reutiliza el `SSO_GITHUB_CLIENT_ID` / `SSO_GITHUB_CLIENT_SECRET` existente y añade `https://<WEBLATE_SITE_DOMAIN>/accounts/complete/github/` como una URI de redirección adicional en esa app.

## Configurar SMTP

Weblate envía confirmaciones de registro, notificaciones y correo de commits, así que necesita un servidor SMTP funcional. Define esto en `.env`:

| Variable | Significado |
| --- | --- |
| `WEBLATE_EMAIL_HOST` | Nombre del servidor SMTP. |
| `WEBLATE_EMAIL_PORT` | Puerto SMTP (587 para STARTTLS, 465 para TLS implícito). |
| `WEBLATE_EMAIL_HOST_USER` | Usuario SMTP. |
| `WEBLATE_EMAIL_HOST_PASSWORD` | Contraseña SMTP o contraseña de aplicación. |
| `WEBLATE_EMAIL_USE_TLS` | `1` para activar STARTTLS (puerto 587); `0` para SSL implícito (puerto 465). |
| `WEBLATE_SERVER_EMAIL` | Remitente de correo de errores (por ejemplo `weblate@example.com`). |
| `WEBLATE_DEFAULT_FROM_EMAIL` | Dirección From del correo saliente. |

La configuración de Weblate es independiente de las variables `SMTP_*` de la aplicación; puedes apuntar ambas al mismo servidor, pero se configuran por separado porque Weblate corre en su propio contenedor. Pon `WEBLATE_EMAIL_HOST` / `WEBLATE_EMAIL_HOST_USER` / `WEBLATE_EMAIL_HOST_PASSWORD` con los mismos valores que `SMTP_*` para reutilizar la cuenta de correo de la aplicación.

## Arrancar Weblate

1. Copia el archivo de entorno de ejemplo y rellena los valores `WEBLATE_*`:

   ```sh
   cp .env.example .env
   ```

2. Arranca Weblate. Por sí solo se sirve en `http://127.0.0.1:${WEBLATE_HOST_PORT:-8080}`:

   ```sh
   docker compose --profile weblate up -d
   ```

   O arráncalo detrás del nginx incluido (recomendado para acceso público):

   ```sh
   docker compose --profile nginx --profile weblate up -d
   ```

   Esto no compila nada: descarga las imágenes fijadas (`weblate/weblate:5`, `postgres:16-alpine`, `redis:7-alpine`) y arranca los tres servicios aislados.

3. Sírvelo en `https://<WEBLATE_SITE_DOMAIN>`. Con el perfil `nginx` basta con definir `WEBLATE_SITE_DOMAIN`: nginx genera un host virtual para ese nombre que reenvía a `weblate:8080` y fuerza `X-Forwarded-Proto: https`, pero solo cuando el contenedor `weblate` es alcanzable. Si nginx ya estaba en marcha cuando arrancas Weblate, reinicia nginx (`docker compose --profile nginx restart nginx`) para generar el vhost. En un stack solo con nginx, el nombre de host de traducción no tiene vhost y cae en el sitio de la aplicación por defecto en lugar de devolver 502. Si usas tu propio proxy, apúntalo a `weblate:8080` en la red de Compose, o al puerto de loopback publicado `127.0.0.1:8080`.

4. Detén el stack sin tocar los servicios de la aplicación:

   ```sh
   docker compose --profile weblate down
   ```

   Los volúmenes con nombre `weblate_data` y `weblate_postgres_data` persisten, así que las traducciones y la configuración sobreviven a un reinicio.

> Las etiquetas de imagen están fijadas a propósito. `weblate/weblate:5` sigue la línea estable 5.x; actualízala solo después de leer las notas de actualización de Weblate, ya que una versión nueva puede ejecutar migraciones de base de datos al arrancar.

## Proxy inverso, TLS y Cloudflare Tunnel

Cuando el tráfico público llega a Weblate a través de un proxy que termina TLS (el nginx incluido, Cloudflare Tunnel, Caddy, Traefik, ...) hay que decírselo a Weblate, o entrará en un bucle de redirección y rechazará el envío de formularios. El archivo Compose define valores por defecto seguros; mantén esto en `.env`:

| Variable | Propósito |
| --- | --- |
| `WEBLATE_SECURE_PROXY_SSL_HEADER` | `HTTP_X_FORWARDED_PROTO,https`. **Obligatorio en Weblate 5.13+ (granian)** para que Weblate sepa que el esquema del cliente es HTTPS. El valor va separado por comas y distingue mayúsculas. |
| `WEBLATE_CSRF_TRUSTED_ORIGINS` | El origen https público, por ejemplo `https://translate.example.com`. Sin él, Django rechaza los POST con "Origin checking failed". |
| `WEBLATE_IP_PROXY_HEADER` / `WEBLATE_TRUSTED_PROXY_ADDRESSES` | Qué cabecera lleva la IP del cliente y qué pares pueden fijarla. Por defecto `HTTP_X_FORWARDED_FOR` y el rango del bridge de Docker (donde vive el nginx incluido). |

`WEBLATE_CSP_SCRIPT_SRC` añade la única excepción limitada que Weblate necesita: su bootstrap inline de la página de repositorio. Cloudflare Insights no está permitido intencionadamente. No lo sustituyas por una lista amplia de scripts.

Con el nginx incluido, lo único que defines es `WEBLATE_SITE_DOMAIN`; nginx hace el resto mientras el contenedor de Weblate esté en marcha. Después añade una **regla de entrada de Cloudflare Tunnel** (o del proxy inverso) que asocie `translate.example.com` al puerto de nginx — para un `cloudflared` en el host, `http://localhost:80`. El túnel termina TLS en el borde; el puerto propio de Weblate está enlazado solo a loopback, así que no es alcanzable desde la LAN.

## Primer inicio de sesión y creación del admin

En el primer arranque, Weblate crea una cuenta **admin** a partir del entorno:

- `WEBLATE_ADMIN_NAME`, `WEBLATE_ADMIN_EMAIL` y `WEBLATE_ADMIN_PASSWORD` definen la cuenta.
- Si `WEBLATE_ADMIN_PASSWORD` está definida, la cuenta se crea en el primer arranque y su nombre, correo y contraseña se reaplican en cada arranque posterior; mantén el valor en `.env` y cámbialo ahí para recuperar el acceso.
- Si se deja vacía, Weblate genera una contraseña aleatoria y la imprime en el log del contenedor.

Inicia sesión en `https://<WEBLATE_SITE_DOMAIN>` con esa cuenta.

## Cómo Weblate lee las cadenas fuente y abre Pull Requests

Weblate trabaja sobre los mismos archivos que incluye la aplicación, así que no hay paso de exportar/importar:

- **Fuente de verdad:** los archivos de idioma en inglés bajo `apps/frontend/src/locales/en/*.json`.
- **Formato del componente:** archivos JSON de i18next (un archivo por namespace: `common`, `auth`, `landing`, `profile`, `invite`, `dashboard`, `admin`, `legal`, `shared`).
- **Archivo base monolingüe:** `apps/frontend/src/locales/en/*.json`.
- **Ruta de traducción:** `apps/frontend/src/locales/<idioma>/*.json`.

Crea dos proyectos de Weblate. En los componentes de cada proyecto, usa `WEBLATE_GIT_REPO` como URL del repositorio, elige **GitHub** como sistema de control de versiones y configura estas parejas exactas:

- `bioplatform-canary`: rama del repositorio `public-canary`; ramas Push por componente `weblate_canary_<componente>`.
- `bioplatform-main`: rama del repositorio `main`; ramas Push por componente `weblate_main_<componente>`.

Weblate clona el repositorio, extrae las cadenas en inglés y guarda las traducciones en su propia base de datos hasta que se confirman.

Cuando se confirman las traducciones, Weblate hace push de cada componente a su propia rama fuente, por ejemplo `weblate_canary_profile` o `weblate_main_profile`, y abre un **Pull Request** contra su rama objetivo correspondiente. Las ramas separadas son necesarias porque Weblate procesa los componentes de forma independiente; compartir una rama permite que los componentes se sobrescriban y cierren PRs. Estas ramas fuente deben ser distintas de `public-canary` y `main`. No uses el modo de push directo de Git ni pongas ninguna rama objetivo como Push branch. Los mantenedores revisan y combinan cada PR; nada llega a ninguna rama objetivo sin ese merge. Configura la credencial del repositorio (token personal o GitHub App) para cada proyecto para que Weblate pueda abrir PRs.

Después de fusionar un PR de Weblate, el flujo del repositorio restablece su rama fuente a la rama objetivo. Esto evita que los commits de Weblate ya fusionados se conviertan en commits salientes obsoletos o conflictos de rebase. El flujo solo gestiona ramas fusionadas del mismo repositorio llamadas `weblate_canary_<componente>` o `weblate_main_<componente>`.

## Revisión antes del commit

La revisión está **impuesta**, no es opcional:

- `WEBLATE_DEFAULT_TRANSLATION_REVIEW=1` hace que las traducciones nuevas requieran revisión/aprobación antes de poder confirmarse.
- `WEBLATE_DEFAULT_SOURCE_REVIEW=1` hace que los cambios en las cadenas **fuente** en inglés también requieran revisión.
- Los revisores necesitan el permiso **Review strings** para el idioma que revisan. Añade a los colaboradores que deban aprobar traducciones a un equipo con ese rol.

Solo las cadenas aprobadas son elegibles para un commit, así que el trabajo sin revisar nunca aparece en un Pull Request. Esta es la garantía de revisión antes del commit: ninguna traducción se confirma sin moderación.

## Traducción automática solo como sugerencias

La traducción automática (MT) está disponible como **fuente de sugerencias** en el editor, nunca como commit automático:

- Añade motores de MT en **Configuration → Machine translation**; su salida aparece como sugerencias que el traductor puede aceptar o editar.
- **No** actives el add-on "Automatic translation" ni ningún add-on que autorellene cadenas, porque confirmarían MT sin revisión humana.
- Weblate nunca confirma MT por sí solo cuando solo hay proveedores de sugerencias configurados.

El resultado: la MT acelera a los traductores, pero una persona sigue revisando y aprobando cada cadena antes de que pueda confirmarse.

## Glosario y contexto de cadenas

Weblate admite tanto un glosario compartido como contexto por cadena, lo que mantiene la terminología consistente en cada idioma:

- **Glosario:** crea un componente de glosario en el proyecto (**Manage → Add component → Glossary**). Los términos que añadas ahí aparecen en el panel de glosario del editor para todos los traductores, así los nombres y las frases clave se traducen igual en todas partes.
- **Contexto de cadena:** las claves JSON en inglés y los comentarios de los desarrolladores se muestran junto a cada cadena fuente, para que los traductores vean dónde se usa una cadena.
- **Capturas de pantalla:** sube una captura a un componente y marca las cadenas que contiene. Los traductores ven así la cadena en su contexto real de interfaz, lo que elimina casi toda ambigüedad.

Esto se configura en la interfaz de Weblate, no mediante variables de entorno: el archivo Compose habilita las revisiones y el registro, y el resto es configuración por proyecto.

## Añadir un idioma nuevo

1. Dentro de Weblate, abre el proyecto y añade el idioma. Weblate crea el archivo de idioma (`apps/frontend/src/locales/<idioma>/*.json`) mediante el commit de traducción y el Pull Request.
2. En el repositorio, un mantenedor hace el pequeño cambio de código que registra el idioma en el bundle del frontend:
   - añade los archivos del idioma al bundle de recursos y a `SUPPORTED_LOCALES` en `apps/frontend/src/i18n/index.ts`, y
   - añade el código del idioma a `public.i18n.locales` en `config.yml`.
3. Combina el Pull Request y recompila el frontend (ver abajo).

Cualquier idioma es bienvenido. Hasta que se combine el cambio de código del paso 2, el idioma existe en Weblate pero no se ofrece a los usuarios.

## Cómo llegan las traducciones a la aplicación

Los archivos de traducción van **empaquetados en el frontend en tiempo de compilación**: el backend nunca los sirve. Por tanto, una traducción combinada solo está activa tras recompilar el frontend:

1. Un Pull Request de Weblate se revisa y se combina en `main`.
2. Se habilita el multilingüe para la instancia: pon `public.i18n.enabled: true` en `config.yml` (consulta `config.yml.example` → `i18n`).
3. Se reconstruye y redespliega la imagen del frontend, por ejemplo:

   ```sh
   docker compose --profile nginx up -d --build
   ```

Las cadenas nuevas o actualizadas llegan con esa compilación. Editar traducciones solo en Weblate no cambia la aplicación en ejecución hasta que ocurren el merge y la recompilación.

## TODO del operador y notas de seguridad

- Proporciona el proxy inverso y un certificado TLS válido para `<WEBLATE_SITE_DOMAIN>`; Weblate espera correr detrás de HTTPS (`WEBLATE_ENABLE_HTTPS=1`). Mantén definidas las variables de cabeceras de proxy de arriba, o Weblate entrará en bucle de redirección / rechazará los inicios de sesión.
- Crea la credencial de la API de GitHub y configúrala en cada componente para que Weblate pueda abrir Pull Requests. Como estos proyectos usan ramas de origen ascendentes con nombre, configura `git@github.com:00kino547/BioPlatform.git` como URL SSH de push del repositorio. Añade la clave SSH pública de Weblate a la cuenta de GitHub con acceso de escritura al repositorio. No pongas un token en una URL del repositorio.
- Weblate firma los commits de traducción con la identidad GPG RSA 4096 generada `Weblate BioPlatform <weblate@dexlunmc.com>` (`99D23FCF97EC4F2F3254450211F08400D52F367F`). Añade la clave pública exportada a las claves de firma de GitHub para que los commits aparezcan como verificados. Los componentes actualmente hacen commit y push automáticamente después de 24 horas pendientes.
- Mantén `WEBLATE_ADMIN_PASSWORD`, `WEBLATE_POSTGRES_PASSWORD` y la contraseña SMTP solo en `.env`. Nunca subas `.env` al repositorio y rota estos valores si se filtran.
- No se publica ningún puerto para Weblate ni sus almacenes de datos; no añadas ninguno. Expón Weblate solo a través del proxy.
- Cuenta con unos 3 GB de RAM y 2 núcleos de CPU, y más a medida que crece la cantidad de texto alojado.
