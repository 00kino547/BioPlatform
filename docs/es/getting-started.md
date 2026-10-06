# Inicio Rápido

## Prerrequisitos

- Node.js 22+
- PostgreSQL 16+
- pnpm 12 (vía corepack, fijado en 12.4.0)

## Guía rápida

```bash
git clone https://github.com/00kino547/BioPlatform.git
cd bio
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm dev
```

## Docker

```bash
docker compose -f docker-compose.prebuilt.yml --profile nginx up -d
```

App disponible en http://localhost:80. Se usan las imágenes precompiladas publicadas — sin paso de compilación. Para compilar desde el código local en su lugar, ejecute `docker compose --profile nginx up -d --build`.

## Variables de Entorno

Ver [Variables de Entorno](./environment-variables.md) para la referencia completa.

## Próximos Pasos

- [Variables de Entorno](./environment-variables.md) — referencia completa
- [Guía de Usuario](./user-guide.md) — perfiles, passkeys/2FA, analíticas, ayuda para recuperar el acceso
- [Guía de administración](./admin-guide.md) — códigos de invitación, gestión de usuarios, desbloqueo de cuentas
