# Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Application name | `BioPlatform` |
| `APP_TAGLINE` | Short tagline | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Full description | `Create a stunning profile page...` |
| `APP_URL` | Public URL | `http://localhost:80` |
| `APP_GITHUB_URL` | GitHub repository URL | `https://github.com/kinotes/bio` |
| `VITE_API_URL` | Backend API URL | `http://localhost:3000/api` |
| `PORT` | Backend port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | JWT signing secret | — |
| `JWT_EXPIRES_IN` | JWT expiration | `7d` |
| `STORAGE_PROVIDER` | Storage backend | `local` |
| `LOCAL_STORAGE_PATH` | Local upload path | `./uploads` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `NGINX_PORT` | Nginx HTTP port | `80` |
| `NGINX_HTTPS_PORT` | Nginx HTTPS port | `443` |

## Branding Variables

Change `APP_NAME`, `APP_TAGLINE`, `APP_DESCRIPTION`, and `APP_URL` to rebrand the entire application. These are used in:

- Navbar, Hero, Footer (React components)
- SEO meta tags, OpenGraph, Twitter cards
- Structured data (JSON-LD)
- Browser title
- FAQ content

## Frontend Variables

Frontend variables must be prefixed with `VITE_` to be accessible in React code via `import.meta.env.VITE_*`.
