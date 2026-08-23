# Despliegue

## Docker (Recomendado)

### Stack Completo con Nginx

```bash
docker compose --profile nginx up -d --build
```

Aplicación disponible en `http://localhost:80`.

### Sin Nginx

```bash
docker compose up -d --build
```

Frontend en `http://localhost:5173`, backend en `http://localhost:3000`.


### Servicios

| Servicio | Descripción | Puerto |
|----------|-------------|--------|
| `postgres` | Base de datos PostgreSQL 16 | 5432 |
| `backend` | Servidor API Express | 3000 |
| `frontend` | SPA React (Nginx) | 80 |
| `nginx` | Proxy inverso (opcional) | 80 |

### Entorno

1. Copia `.env.example` a `.env`
2. Configura `DATABASE_URL` para PostgreSQL
3. Establece un `JWT_SECRET` fuerte
4. Configura `APP_URL` con tu dominio
5. Ejecuta con `--profile nginx` para producción

## Despliegue Manual

### Prerrequisitos

- Node.js 22+
- PostgreSQL 16+
- pnpm 11 (vía corepack)

### Pasos

```bash
git clone https://github.com/00kino547/BioPlatform.git
cd BioPlatform
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm db:seed
pnpm --filter frontend build
pnpm --filter backend start
```

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

Cuando el túnel termina en el nginx de este repositorio (el `docker-compose.yml`
incluido), define `CF_TRUSTED_IPS` en `.env` con las IPs/CIDRs de origen desde las que
se conecta el proxy inverso (por defecto `172.16.0.0/12,127.0.0.1,::1` — el rango del
puente de Docker más loopback). Nginx restaura la IP real del cliente desde la cadena
estándar `X-Forwarded-For` solo para esos orígenes (cualquier proxy inverso que añada la
IP del cliente — Cloudflare Tunnel, Nginx, Caddy, Traefik, HAProxy, …), por lo que los
logs del backend, la analítica y el límite de intentos de autenticación ven IPs públicas
en vez de la IP del túnel/local. Nginx sobrescribe `X-Forwarded-For`/`X-Real-IP` con la
IP del cliente calculada, así que una cadena falsificada enviada por el cliente nunca
llega al backend.

Los puertos publicados de nginx (`NGINX_PORT`/`NGINX_HTTPS_PORT`) están enlazados a
loopback (`127.0.0.1`) en `docker-compose.yml` (igual que postgres y el backend), de modo
que solo los procesos locales del host pueden alcanzar nginx — ningún cliente remoto puede
conectarse directamente para falsificar las cabeceras del proxy; cada petición debe llegar
a través del proxy inverso de confianza. El tráfico local que llega por docker-proxy (que
enmascara su origen como el gateway del puente de Docker) se registra como `127.0.0.1` en
vez de la dirección del gateway. Mantén `TRUST_PROXY=1`; **no** lo subas, o se confiará en
valores `X-Forwarded-For` falsificados. Enlazar los puertos a `0.0.0.0` (exposición pública
directa) anula la garantía anti-falsificación.

## Dominios Personalizados

Los usuarios pueden solicitar un dominio personalizado de autoservicio (tier PRO/Enterprise +
permiso `profiles.customDomain`): solicitan un hostname, añaden un registro TXT
(`_bioplatform.<domain>`) que el backend verifica en vivo, y un administrador lo activa desde
el panel de administración. Para servir realmente un dominio personalizado también debes:

1. **Enrutarlo** — los túneles rápidos (`cloudflared tunnel --url …`) solo transportan
   tráfico para el hostname propio del túnel. Usa un **túnel con nombre** con una regla de
   ingress por dominio personalizado para que las peticiones lleguen a nginx con la cabecera
   `Host` correcta (y apunta los registros `A`/`AAAA`/`CNAME` del dominio al túnel).
2. **Instalar un certificado** — dos opciones:

   **Automática (ACME).** Pon `ACME_ENABLED=true` (más `ACME_EMAIL`) y apunta el registro
   `A`/`AAAA` de cada dominio personalizado a este servidor con el puerto 80 accesible desde
   internet. El backend emite y renueva automáticamente certificados de Let's Encrypt (challenge
   HTTP-01) para cada dominio ACTIVE, los escribe en `./certs/<domain>/`, regenera la
   configuración de nginx y recarga nginx automáticamente. Los bloques HTTP de los dominios
   personalizados exponen siempre `/.well-known/acme-challenge/` (con proxy al backend) y
   redirigen todo lo demás a HTTPS. Un administrador también puede forzar la emisión por dominio
   (Admin → Custom Domains → "Issue cert"). Usa
   `ACME_DIRECTORY_URL=https://acme-staging-v02.api.letsencrypt.org/directory` para pruebas.
   Detrás de un túnel con nombre, añade una regla de ingress que enrute
   `/.well-known/acme-challenge/*` al backend.

   **Manual.** Coloca el certificado y la clave en un directorio por dominio:

   ```
   certs/
     example.com/
       cert.pem      # tu certificado (o fullchain)
       key.pem       # tu clave privada
   ```

   El backend detecta los certificados manuales en su siguiente comprobación ACME (por defecto
   cada 60 minutos) y regenera la configuración de nginx; nginx se recarga automáticamente.
   Hasta que exista el certificado, el dominio cae a los servidores principales.

   Cada bloque escucha tanto `example.com` como `www.example.com`, reutiliza los parámetros
   SSL de producción, envía HSTS y hace proxy del API/uploads/SPA igual que el sitio
   principal. Define `APP_URL_HOST` (hostname simple, p. ej.
   `preview.example.com`) para que nginx sepa qué host es el dominio propio de la app: los
   crawlers sociales que piden la **raíz** de un dominio **personalizado** reciben entonces
   el OG renderizado en servidor desde el backend, mientras que el dominio de la app conserva
   su OG estático del SPA.

El comportamiento de la raíz del dominio personalizado (página de inicio vs. un perfil
público concreto) lo configura el usuario en **Dashboard → Domain**; tanto los crawlers
sociales como el SPA lo respetan. Las passkeys funcionan en el dominio principal de
`WEBAUTHN_ORIGIN` y también en los dominios personalizados activos: para los dominios
personalizados, el relying-party ID y el origen esperado se derivan de la cabecera `Host`
de la petición (el hostname del dominio personalizado), por lo que las passkeys están
limitadas por dominio — una registrada en el dominio principal funciona allí, y una
registrada en un dominio personalizado funciona en ese dominio personalizado.

## Lista de Verificación en Producción

- [ ] `JWT_SECRET` fuerte (32+ caracteres aleatorios)
- [ ] `TLS_MODE=production` con certificados reales en `./certs/` (sin certificados autofirmados)
- [ ] Dominios personalizados: `ACME_ENABLED=true` + `ACME_EMAIL`, o certificados manuales por dominio
- [ ] `NODE_ENV=production`
- [ ] HTTPS habilitado (proxy inverso o Cloudflare)
- [ ] `APP_URL` configurado con tu dominio
- [ ] `CORS_ORIGIN` configurado con tu dominio
- [ ] PostgreSQL en instancia dedicada
- [ ] Respaldos regulares de la base de datos (`pg_dump`)
- [ ] Respaldos regulales de uploads (`./uploads`)
- [ ] Archivo `.env` asegurado (no en control de versiones)

## Actualización

```bash
git pull
pnpm install
pnpm db:generate
docker compose --profile nginx up -d --build
```

## Respaldo

- **Base de datos:** `pg_dump` o respaldo de volumen Docker
- **Subidas:** Respaldo regular de `./uploads`
- **Entorno:** Mantén `.env` en una ubicación segura

---

← [Guía de Administración](./admin-guide.md) · [Contribuir](./contributing.md) →
