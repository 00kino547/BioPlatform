# Configuration

## Overview

BioPlatform is configured entirely through environment variables. Copy `.env.example` to `.env` and modify the values.

```bash
cp .env.example .env
```

## Application

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_NAME` | Application name shown in navbar, footer, emails | `BioPlatform` |
| `APP_TAGLINE` | Short tagline for the landing page | `Your digital identity, beautifully crafted.` |
| `APP_DESCRIPTION` | Full description for SEO and meta tags | `Create a stunning profile page...` |
| `APP_URL` | Public URL of your instance | `http://localhost:80` |
| `APP_GITHUB_URL` | GitHub repository URL | `https://github.com/00kino547/BioPlatform` |

## Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL (use `/api` for Nginx proxy) | `/api` |
| `VITE_APP_NAME` | Frontend app name | `BioPlatform` |
| `VITE_APP_TAGLINE` | Frontend tagline | `Your digital identity, beautifully crafted.` |
| `VITE_APP_DESCRIPTION` | Frontend description | `Create a stunning profile page...` |
| `VITE_APP_URL` | Frontend public URL | `http://localhost:80` |
| `VITE_APP_GITHUB_URL` | Frontend GitHub URL | `https://github.com/00kino547/BioPlatform` |
| `VITE_CONTACT_URL` | Contact/support URL (footer, legal pages) | `https://github.com/00kino547/BioPlatform/issues` |
| `VITE_STATUS_URL` | Status page URL (footer link) | _(empty)_ |
| `VITE_DOCS_URL` | Documentation URL (footer link) | `https://github.com/00kino547/BioPlatform/tree/main/docs` |

> **Important:** Frontend variables must be prefixed with `VITE_` to be accessible in React code via `import.meta.env.VITE_*`.

## Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `3000` |
| `API_PREFIX` | API route prefix | `/api` |
| `NODE_ENV` | Environment mode | `development` |

## Database

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | — (required) |
| `POSTGRES_USER` | PostgreSQL username | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `postgres` |
| `POSTGRES_DB` | PostgreSQL database name | `bioplatform` |

## Security

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for signing JWT tokens | — (required) |
| `JWT_EXPIRES_IN` | JWT token expiration | `7d` |

> Use a strong random string (32+ characters) for `JWT_SECRET` in production.

## CORS

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Allowed origins (comma-separated) | `http://localhost:5173` |

> When using Nginx, the frontend uses relative API URLs (`/api`), so CORS is not needed. This is a fallback for local development.

## Nginx

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_INTERNAL_NGINX` | Enable Nginx container | `true` |
| `NGINX_PORT` | Nginx HTTP port | `80` |
| `NGINX_HTTPS_PORT` | Nginx HTTPS port | `443` |

## Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `STORAGE_PROVIDER` | Storage backend (`local`, `r2`, `b2`, `s3`) | `local` |
| `LOCAL_STORAGE_PATH` | Local upload directory | `./uploads` |

## Branding

All branding variables (`APP_NAME`, `APP_TAGLINE`, etc.) propagate to:

- Navbar, Hero, Footer (React components)
- SEO meta tags, OpenGraph, Twitter cards
- Structured data (JSON-LD)
- Browser title
- FAQ content
- Public profile "Powered by" link
- Privacy Policy and Terms of Service pages

To rebrand the entire application, change these values in `.env` and rebuild.
