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

### Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:80
```

## Lista de Verificación en Producción

- [ ] `JWT_SECRET` fuerte (32+ caracteres aleatorios)
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
