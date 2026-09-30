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

### Aplica las migraciones de esquema primero

El backend **no** migra la base de datos automáticamente: una versión que cambie el esquema fallará hasta que la base de datos esté al día. El historial de esquema se gestiona con **Prisma Migrate** (la migración base `prisma/migrations/0_init` representa el esquema completo actual); ejecuta `prisma migrate deploy` antes de arrancar los contenedores nuevos:

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

3. **Registra la base** (marca la base de datos convergida como ya en `0_init` sin aplicarla):

   ```bash
   pnpm --filter @bioplatform/backend db:baseline
   ```

4. A partir de entonces, cada versión se aplica con `pnpm --filter @bioplatform/backend db:migrate:prod` (solo migraciones de prisma).

Los cambios de esquema nuevos se añaden como migraciones de Prisma normales (`prisma migrate dev --create-only` y luego revisión, o regeneradas con `prisma migrate diff --from-migrations --to-schema-datamodel`). Los archivos `docs/migrations/*.sql` heredados quedan archivados como referencia histórica.

### Comprueba las nuevas variables de entorno

Las versiones nuevas pueden añadir ajustes a `.env.example`. Compara tu `.env` con él y copia cualquier variable nueva — y confirma que la variable también está reenviada en `docker-compose.yml` antes de recrear el stack. Ejemplo de esta versión: `NEWSLETTER_SELF_RECIPIENT_CAP` (límite de destinatarios por newsletter que puede enviar el SMTP propio de un usuario).

## Respaldo

- **Base de datos:** `pg_dump` o respaldo del volumen de Docker
- **Subidas:** Copia de seguridad periódica de `./uploads`
- **Entorno:** Mantén `.env` en una ubicación segura

---

← [Guía de administración](./admin-guide.md) · [Contribuir](./contributing.md) →
