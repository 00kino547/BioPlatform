# Variables de Entorno

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `APP_NAME` | Nombre de la aplicación | `BioPlatform` |
| `APP_TAGLINE` | Lema corto | `Tu identidad digital, bellamente diseñada.` |
| `APP_DESCRIPTION` | Descripción completa | `Crea una página de perfil impresionante...` |
| `APP_URL` | URL pública | `http://localhost:80` |
| `APP_GITHUB_URL` | URL del repositorio GitHub | `https://github.com/kinotes/bio` |
| `VITE_API_URL` | URL del API backend | `http://localhost:3000/api` |
| `PORT` | Puerto del backend | `3000` |
| `DATABASE_URL` | Cadena de conexión PostgreSQL | — |
| `JWT_SECRET` | Secreto JWT | — |
| `JWT_EXPIRES_IN` | Expiración JWT | `7d` |
| `STORAGE_PROVIDER` | Backend de almacenamiento | `local` |
| `LOCAL_STORAGE_PATH` | Ruta de subidas local | `./uploads` |
| `CORS_ORIGIN` | Origen CORS permitido | `http://localhost:5173` |
| `NGINX_PORT` | Puerto HTTP Nginx | `80` |
| `NGINX_HTTPS_PORT` | Puerto HTTPS Nginx | `443` |

## Variables de Marca

Cambia `APP_NAME`, `APP_TAGLINE`, `APP_DESCRIPTION` y `APP_URL` para reformar toda la aplicación. Se usan en:

- Navbar, Hero, Footer (componentes React)
- Meta tags SEO, OpenGraph, Twitter cards
- Datos estructurados (JSON-LD)
- Título del navegador
- Contenido del FAQ

## Variables del Frontend

Las variables del frontend deben tener el prefijo `VITE_` para ser accesibles en código React vía `import.meta.env.VITE_*`.
