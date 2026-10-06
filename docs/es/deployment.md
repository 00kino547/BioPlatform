# Despliegue

## Docker (Recomendado)

### Stack Completo con Nginx

La forma más rápida de ejecutar el stack usa las imágenes precompiladas publicadas — sin paso de compilación local:

```bash
docker compose -f docker-compose.prebuilt.yml --profile nginx up -d
```

Aplicación disponible en `http://localhost:80` — frontend, API (`/api`) y uploads servidos en un solo puerto a través del proxy inverso interno de Nginx. Es la configuración recomendada para producción y despliegues sencillos.

### Compilar desde el Código Local (Opcional)

Si haces un fork del repositorio o modificas el código del backend/frontend, compila las imágenes desde tu copia local:

```bash
docker compose --profile nginx up -d --build
```

Se usan los mismos servicios y puertos; solo cambia el origen de las imágenes. Consulta [Building](./building.md) para las opciones de registro y el anclaje de versiones.

### Sin Nginx

```bash
docker compose -f docker-compose.prebuilt.yml up -d
```

Backend en `http://localhost:3000`. Sin Nginx el frontend no expone ningún puerto — usa el perfil Nginx para acceder desde el navegador.

(Para usar imágenes compiladas localmente sin Nginx, ejecuta `docker compose up -d --build`.)

### Servicios

| Servicio | Descripción | Puerto |
|----------|-------------|--------|
| `postgres` | Base de datos PostgreSQL 16 | 5432 |
| `redis` | Caché Valkey (compatible con Redis, usada por `CACHE_DRIVER=redis`) | 6379 |
| `backend` | Servidor de API Express | 3000 |
| `frontend` | SPA de React (Nginx) | 80 |
| `nginx` | Proxy inverso (opcional) | 80 |

### Entorno

1. Copia `.env.example` a `.env`
2. Establece un `POSTGRES_PASSWORD` único y usa el mismo valor en `DATABASE_URL` al ejecutar fuera de Docker Compose
3. Establece un `JWT_SECRET` robusto
4. Configura `ADMIN_EMAIL` y una `ADMIN_PASSWORD` única para el administrador de arranque
5. Configura `APP_URL`, `APP_URL_HOST`, las URL `VITE_APP_*` y los valores de WebAuthn para tu dominio
6. Ejecuta con `--profile nginx` para producción

Por defecto el backend usa `CACHE_DRIVER=redis` contra el servicio Valkey incluido (una caché compatible
con Redis en el puerto `6379`, vinculada solo a localhost). Si ejecutas el backend fuera de Docker Compose,
apunta `CACHE_REDIS_URL` a cualquier servidor compatible por cable (Redis, Valkey, KeyDB, Dragonfly) o
cambia a los drivers `memory`/`file`/`db` — ver [Variables de Entorno](./environment-variables.md#caché).

En el primer arranque, establece `SEED_ON_START=true` en `.env` para crear el administrador de arranque y los códigos de invitación iniciales. La semilla es idempotente — solo crea el administrador cuando ese correo aún no existe y nunca sobrescribe una contraseña existente. Elimina `SEED_ON_START=true` después del primer arranque correcto.

> **Nota:** `.env` está excluido del contexto de compilación (`.dockerignore`), así que nunca existe
> dentro del contenedor. Por eso `db:seed` lo carga con `node --env-file-if-exists=…`, que no hace nada
> en Docker y sí carga el archivo en un checkout de código; la semilla toma su configuración del
> entorno del contenedor que define compose. Las imágenes antiguas usaban `--env-file=` (sin
> `-if-exists`), que devuelve distinto de cero si el archivo no existe y producía
> `ELIFECYCLE … exit code 9` con un aviso de "seed failed"; vuelve a compilar la imagen si lo ves.

## Despliegue Manual

### Requisitos Previos

- Node.js 22+
- PostgreSQL 16+
- pnpm 11 (mediante corepack)

### Pasos

```bash
git clone https://github.com/00kino547/BioPlatform.git
cd BioPlatform
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm --filter @bioplatform/backend db:seed
pnpm --filter @bioplatform/frontend build
pnpm --filter @bioplatform/backend start
```

## TLS / HTTPS

El Nginx incluido escucha tanto en HTTP (80) como en HTTPS (443). La gestión de certificados la
controla `TLS_MODE`:

- **`development` (predeterminado)** — si no existe un certificado válido, Nginx genera
  automáticamente un certificado autofirmado (válido por 10 años, SAN para `localhost` /
  `127.0.0.1`) al arrancar el contenedor. Se guarda como `self-signed.pem` / `self-signed.key`
  en `./certs/` y se enlaza simbólicamente como `cert.pem` / `key.pem`. El navegador mostrará
  una advertencia.
- **`production`** — Nginx elimina cualquier archivo `self-signed.*` y los enlaces simbólicos
  de desarrollo al arrancar, y exige un par certificado/clave válido, negándose a arrancar sin
  él. Coloca tu certificado y tu clave privada en `./certs/`:

  ```
  certs/
    cert.pem      # tu certificado (o fullchain)
    key.pem       # tu clave privada
  ```

  Ambos archivos están en gitignore (`certs/*.pem`). Genéralos con Let's Encrypt (Certbot),
  una CA de tu elección o Cloudflare Origin Certificates.

### HSTS

HSTS (`Strict-Transport-Security`, 1 año) se envía automáticamente en el puerto 443 en modo
**producción**. **No** se envía en modo desarrollo (los navegadores lo ignoran de todos modos
con certificados autofirmados); establece `SEND_HSTS_ON_DEV=true` para forzarlo también en
desarrollo. Si terminas TLS en otro lugar (Cloudflare, Load Balancer), deja `TLS_MODE=development`
o elimina el mapeo del puerto 443.

## Proxy Inverso

### Nginx

```nginx
server {
    listen 80;
    server_name tudominio.com;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads/ {
        alias /ruta/a/BioPlatform/uploads/;
    }

    location / {
        root /ruta/a/BioPlatform/apps/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

### Proxy Inverso (Cloudflare Tunnel)

```bash
cloudflared tunnel --url http://localhost:80
```

Cuando el túnel termina en el nginx de este repositorio (el `docker-compose.yml` incluido),
define `CF_TRUSTED_IPS` en `.env` con las IPs/CIDRs de origen desde las que se conecta el proxy
inverso (predeterminado `172.16.0.0/12,127.0.0.1,::1` — el rango del puente de Docker más
loopback). Nginx restaura la IP real del cliente a partir de la cadena estándar
`X-Forwarded-For` solo para esos orígenes (cualquier proxy inverso que añada la IP del cliente —
Cloudflare Tunnel, Nginx, Caddy, Traefik, HAProxy, …), de modo que los registros del backend,
la analítica y el límite de intentos de autenticación ven las IP públicas en lugar de la dirección
del túnel o local. Nginx sobrescribe `X-Forwarded-For`/`X-Real-IP` con la IP de cliente calculada,
así que una cadena falsificada suministrada por el cliente nunca llega al backend.

Los puertos publicados de nginx (`NGINX_PORT`/`NGINX_HTTPS_PORT`) están enlazados a loopback
(`127.0.0.1`) en ambos archivos compose (igual que postgres y el backend), por lo que solo los
procesos locales del host pueden alcanzar nginx — ningún cliente remoto puede conectarse
directamente para falsificar las cabeceras del proxy; toda petición debe llegar a través del proxy
inverso de confianza. El tráfico local que entra por docker-proxy (que enmascara su origen como el
gateway del puente de Docker) aparece como `127.0.0.1` en lugar de la dirección del gateway.
Mantén `TRUST_PROXY=1`; **no** lo aumentes, o se empezarán a confiar valores `X-Forwarded-For`
falsificados. Enlazar los puertos a `0.0.0.0` (exposición pública directa) anula la garantía
anti-falsificación.

## Dominios Personalizados

Los usuarios pueden autogestionar un dominio personalizado (tier PRO/Enterprise + permiso
`profiles.customDomain`): solicitan un hostname, añaden un registro TXT (`_bioplatform.<domain>`)
que el backend verifica en vivo, y un administrador lo activa desde el panel de administración.
Para servir de verdad un dominio personalizado también debes:

1. **Enrutarlo** — los túneles rápidos (`cloudflared tunnel --url …`) solo transportan tráfico
   para el hostname propio del túnel. Usa un **túnel con nombre** con una regla de ingress por
   dominio personalizado para que las peticiones lleguen a nginx con la cabecera `Host` correcta
   (y apunta los registros `A`/`AAAA`/`CNAME` del dominio al túnel).
2. **Instalar un certificado** — dos opciones:

   **Automática (ACME).** Establece `ACME_ENABLED=true` (además de `ACME_EMAIL`) y apunta el
   registro `A`/`AAAA` de cada dominio personalizado a este servidor con el puerto 80 accesible
   desde internet. El backend emite y renueva automáticamente los certificados de Let's Encrypt
   (challenge HTTP-01) para cada dominio ACTIVE, los escribe en `./certs/<domain>/`, regenera la
   configuración de nginx y la recarga automáticamente. Los bloques de servidor HTTP de los
   dominios personalizados exponen siempre `/.well-known/acme-challenge/` (con proxy al backend)
   y redirigen todo lo demás a HTTPS. Un administrador también puede forzar la emisión por dominio
   (Admin → Custom Domains → "Issue cert"). Usa
   `ACME_DIRECTORY_URL=https://acme-staging-v02.api.letsencrypt.org/directory` para probar.
   Detrás de un túnel con nombre, añade una regla de ingress que enrute
   `/.well-known/acme-challenge/*` al backend.

   **Manual.** Coloca el certificado y la clave en un directorio por dominio:

   ```
   certs/
     example.com/
       cert.pem      # tu certificado (o fullchain)
       key.pem       # tu clave privada
   ```

   El backend detecta los certificados manuales en su siguiente comprobación ACME (predeterminado
   cada 60 minutos) y regenera la configuración de nginx; nginx se recarga automáticamente. Hasta
   que no exista el certificado, el dominio cae en los servidores principales.

   Cada bloque escucha tanto `example.com` como `www.example.com`, reutiliza los parámetros SSL
   de producción, envía HSTS y hace de proxy del API/uploads/SPA igual que el sitio principal.
   Configura `APP_URL_HOST` (hostname simple, p. ej. `preview.example.com`) para que nginx sepa qué
   host es el dominio propio de la app: así, los rastreadores sociales que accedan a la **raíz**
   de un dominio **personalizado** reciben el OG renderizado en el servidor desde el backend,
   mientras que el host de la app conserva el OG estático del SPA.

El comportamiento de la raíz del dominio personalizado (página de inicio vs. un perfil público
concreto) lo configura el usuario en su **Dashboard → Domain**; tanto los rastreadores sociales
como el SPA lo respetan. Las passkeys funcionan en el dominio principal de `WEBAUTHN_ORIGIN` y
también en los dominios personalizados activos: para los dominios personalizados, el relying-party
ID y el origen esperado se derivan de la cabecera `Host` de la petición (el hostname del dominio
personalizado), por lo que las passkeys quedan limitadas por dominio — una registrada en el dominio
principal funciona allí, y una registrada en un dominio personalizado funciona en ese dominio
personalizado.

## Lista de Verificación en Producción

- [ ] `JWT_SECRET` robusto (32+ caracteres aleatorios)
- [ ] `TLS_MODE=production` con certificados reales en `./certs/` (sin certificados autofirmados)
- [ ] Dominios personalizados: `ACME_ENABLED=true` + `ACME_EMAIL`, o certificados manuales por dominio
- [ ] `NODE_ENV=production`
- [ ] HTTPS habilitado (proxy inverso o Cloudflare)
- [ ] `APP_URL` configurado con tu dominio
- [ ] `CORS_ORIGIN` configurado con tu dominio
- [ ] PostgreSQL en instancia dedicada
- [ ] Copias de seguridad periódicas de la base de datos (`pg_dump`)
- [ ] Copias de seguridad periódicas de los uploads (`./uploads`)
- [ ] Archivo `.env` protegido (fuera del control de versiones)

## Actualización

### Actualización con un solo comando (recomendada)

`update.sh` en la raíz del repositorio hace toda la secuencia y hace cumplir la
única regla que protege tus datos: **la copia de seguridad se toma y se verifica
antes de arrastrar, migrar o recrear nada.**

```bash
# desde un checkout
sh update.sh --deployment-dir /srv/bioplatform

# o directamente desde la red, sin necesidad de checkout
curl -fsSL https://raw.githubusercontent.com/00kino547/BioPlatform/main/update.sh | bash -s -- -y
```

Qué hace, en orden:

1. Comprueba Docker/Compose, resuelve el directorio de despliegue, `.env`, el
   archivo compose y el nombre de proyecto, e imprime las imágenes en ejecución.
2. Informa el estado del esquema registrado por Prisma (`_prisma_migrations`),
   para que veas qué está pendiente *antes* de que cambie algo.
3. Toma un `pg_dump` en formato propio en `backups/`, comprueba que es un
   archivo legible (≥ 128 bytes y una tabla de contenidos de `pg_restore --list`
   analizable) e imprime la ruta y el tamaño. **Una copia de seguridad fallida
   aborta la actualización** salvo que pases explícitamente `--no-backup --force`,
   que imprime el riesgo con claridad.
4. Descarga las imágenes nuevas y aplica las migraciones en un contenedor de una
   sola vez con la migración automática del entrypoint desactivada
   (`MIGRATE_ON_START=false`), de modo que existe exactamente un paso de migración
   y su orden es visible en el script.
5. Recrea el stack y espera a `/api/health` (y a `/api/version` cuando
   `ADMIN_TOKEN` está definido), revirtiendo a las huellas de imagen anteriores si
   el backend no vuelve a estar operativo.

Flags útiles: `--dry-run` (imprime todos los comandos, no cambia nada),
`--verify-restore` (además restaura la copia en una base de datos temporal y
compara el número de tablas), `--skip-pull`, `--skip-migration`, `--no-rollback`,
`--backup-dir DIR`, `--image-tag TAG`, `-y`.

Ante cualquier fallo, el script imprime la ruta de la copia y el comando exacto
de restauración, así que nunca tienes que reconstruir la ruta de recuperación de
memoria.

Cuando el script se envía por tubería (`curl … | bash`) descarga sus dos
bibliotecas auxiliares (`scripts/lib/bioplatform-common.sh`,
`scripts/lib/bioplatform-backup.sh`) desde la misma URL versionada que el propio
script — desde una etiqueta y no desde una rama, para que un actualizador fijado
nunca ejecute auxiliares de otra revisión.

### Actualización manual

Descarga las imágenes precompiladas más recientes y recrea el stack:

```bash
git pull
docker compose -f docker-compose.prebuilt.yml --profile nginx pull
docker compose -f docker-compose.prebuilt.yml --profile nginx up -d
```

O, cuando se usan imágenes compiladas localmente, compila en su lugar:

```bash
git pull
pnpm install
pnpm db:generate
docker compose --profile nginx up -d --build
```

### Migraciones de esquema

El backend **aplica las migraciones pendientes al arrancar** (`MIGRATE_ON_START`,
por defecto `true`): el entrypoint ejecuta `prisma migrate deploy` antes que el
servidor, espera a que la base de datos esté accesible (`DB_WAIT_ATTEMPTS` ×
`DB_WAIT_INTERVAL`) y se niega a arrancar el servidor si la migración falla —
así un volumen nuevo alcanza un estado sano sin ningún comando manual de Prisma
en el flujo documentado.

Dos garantías hacen esto seguro:

- **Una imagen sin el directorio `prisma/migrations/` se rechaza** con un mensaje
  `FATAL` en lugar de dejar que `migrate deploy` "tenga éxito" sin aplicar nada
  (lo que dejaría una base de datos nueva vacía y el servidor fingiendo estar
  bien). Define `MIGRATE_ON_START=false` solo si gestionas el esquema tú mismo.
- El historial de esquema se gestiona con **Prisma Migrate** (la migración base
  `prisma/migrations/0_init` representa el esquema completo actual). `migrate deploy`
  aplica solo las migraciones *pendientes* y no hace nada si la base de datos ya
  está al día, por lo que reiniciar una instancia actualizada no la modifica.

Para un paso explícito y visible en el script (lo que usa `update.sh`):

```bash
pnpm --filter @bioplatform/backend db:generate
pnpm --filter @bioplatform/backend db:migrate:prod
```

#### Primera adopción de Prisma Migrate en una base de datos existente

Las bases de datos creadas antes de la migración base (provisionadas con `prisma db push` / los archivos `docs/migrations/*.sql` heredados) **no tienen historial `_prisma_migrations`**. No ejecutes `migrate deploy` a ciegas sobre ellas. La secuencia segura de adopción:

1. **Detecta el desvío** frente al esquema actual (sin mutar):

   ```bash
   pnpm --filter @bioplatform/backend exec prisma migrate diff \
     --from-url "$DATABASE_URL" \
     --to-schema-datamodel prisma/schema.prisma
   ```

2. **Converge el esquema si el diff no está vacío.** El historial heredado está en `docs/migrations/` (fechados, aplícalos en orden de fecha) y cualquier desvío restante debe reconciliarse con una migración **aditiva** — no uses `prisma db push --accept-data-loss` salvo que hayas verificado que solo añade tablas/columnas. Confirma que el diff ya está vacío antes de continuar.

3. **Registra cada migración que la base de datos ya cumple** (las marca como aplicadas sin ejecutarlas: no se toca ninguno de tus datos):

   ```bash
   pnpm --filter @bioplatform/backend db:baseline
   # y luego, para cada migración posterior cuyos objetos ya aplicaste a mano:
   pnpm --filter @bioplatform/backend exec prisma migrate resolve \
     --applied 20261001120000_invite_credit_ledger
   ```

   Omite este paso para cualquier migración cuyas tablas/columnas **no** estén ya presentes, o `migrate deploy` intentará crearlas otra vez en la próxima versión.

4. A partir de entonces, cada versión se aplica con `pnpm --filter @bioplatform/backend db:migrate:prod` (solo migraciones de prisma).

Los cambios de esquema nuevos se añaden como migraciones de Prisma normales (`prisma migrate dev --create-only` y luego revisión, o regeneradas con `prisma migrate diff --from-migrations --to-schema-datamodel`). Los archivos `docs/migrations/*.sql` heredados quedan archivados como referencia histórica.

#### Mantén honesta la base

`prisma/migrations/0_init` es una **base compactada**, no un registro histórico: nadie la ha ejecutado nunca, solo tiene que lograr que una instalación nueva quede completa. Dos reglas lo garantizan:

- Cada cambio de esquema posterior necesita su propio directorio de migración en `prisma/migrations/` — incluido cualquier cambio que también apliques a una base de datos en vivo con SQL escrito a mano.
- Antes de publicar, reproduce las migraciones y comprueba que equivalen a `schema.prisma`:

  ```bash
  export SHADOW_DATABASE_URL="postgresql://user:pw@host:5432/alguna_base_scratch_vacía"
  pnpm --filter @bioplatform/backend db:verify-drift   # exit 0 = las migraciones coinciden con el esquema
  ```

  `SHADOW_DATABASE_URL` debe apuntar a una base de datos **vacía**: Prisma reproduce allí cada migración ahí para calcular el esquema final. CI ejecuta este paso en cada push, así que un cambio de esquema al que nunca se le añadió migración rompe la build en lugar de faltar en silencio en las instalaciones nuevas.

### Comprueba las nuevas variables de entorno

Las versiones nuevas pueden añadir ajustes a `.env.example`. Compara tu `.env` con él y copia cualquier variable nueva — y confirma que la variable también está reenviada en `docker-compose.yml` antes de recrear el stack. Ejemplo de esta versión: `NEWSLETTER_SELF_RECIPIENT_CAP` (límite de destinatarios por newsletter que puede enviar el SMTP propio de un usuario).

## Dos instancias en un mismo host

Ambos archivos compose están parametrizados para que un segundo despliegue no
choque con el primero. Cada instancia necesita su propio `.env` (directorio de
despliegue) con sus propios puertos, nombre de proyecto, red y rutas de host:

```bash
# instancia A — los valores por defecto no cambian: 5432 / 6379 / 3000 / 80 / 443
# instancia B — un segundo stack completamente independiente
COMPOSE_PROJECT_NAME=bioplatform-b
POSTGRES_HOST_PORT=15432
REDIS_HOST_PORT=16379
BACKEND_HOST_PORT=13001
NGINX_PORT=18081
NGINX_HTTPS_PORT=18444
NETWORK_NAME=bioplatform_b_net
CERTS_DIR=./certs-b
NGINX_CONFIG_DIR=./nginx-b
SEED_ON_START=false
```

| Variable | Valor por defecto | Propósito |
| --- | --- | --- |
| `POSTGRES_HOST_PORT` | `5432` | Puerto de host para PostgreSQL |
| `REDIS_HOST_PORT` | `6379` | Puerto de host para Redis/Valkey |
| `BACKEND_HOST_PORT` | `3000` | Puerto de host para la API del backend |
| `NGINX_PORT` / `NGINX_HTTPS_PORT` | `80` / `443` | Puertos de host para nginx |
| `NETWORK_NAME` | `bioplatform_net` | Red de Docker — **debe diferir**, o los dos stacks comparten los nombres DNS `postgres`/`redis` y se resuelven entre sí |
| `CERTS_DIR` | `./certs` | Material TLS (debe diferir) |
| `NGINX_CONFIG_DIR` | `./nginx` | Configuración de nginx a montar (debe diferir) |

Reglas para que esto funcione de verdad:

- **Ejecuta cada instancia desde su propio directorio** (o define
  `COMPOSE_PROJECT_NAME`), para que contenedores, volúmenes y estado de compose
  nunca se mezclen. Los volúmenes ya están ligados al proyecto
  (`<proyecto>_postgres_data`, …).
- **Todos los puertos publicados deben diferir** — los valores de arriba son
  ejemplos; sirve cualquier conjunto libre. Dentro de la red los puertos del
  contenedor siguen siendo `5432`/`6379`/`3000`, así que `DATABASE_URL` y
  `CACHE_REDIS_URL` no cambian.
- **`NETWORK_NAME` debe diferir**, si no la segunda instancia se une a la red de
  la primera y su `postgres` resuelve a la base de datos de la *otra* instancia.
- Dale a cada instancia su propio `.env` con su propio `JWT_SECRET`,
  `POSTGRES_PASSWORD` y `ADMIN_PASSWORD`. Nunca los compartas.

Verificado: dos instancias y un stack existente funcionaron a la vez, cada uno
con sus volúmenes, red y puertos propios, todos sanos al mismo tiempo.

## Respaldo

- **Base de datos:** `pg_dump` o respaldo del volumen de Docker — `update.sh` hace
  esto por ti antes de cada actualización e imprime el comando de restauración
  para la copia que escribió (`backups/bioplatform-YYYYMMDD-HHMMSS.dump`)
- **Subidas:** Copia de seguridad periódica de `./uploads`
- **Entorno:** Mantén `.env` en una ubicación segura

---

← [Guía de administración](./admin-guide.md) · [Contribuir](./contributing.md) →
