# Contributing

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch

```bash
git clone https://github.com/YOUR_USERNAME/BioPlatform.git
cd BioPlatform
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm db:seed
pnpm dev
```

## Development

### Project Structure

```
apps/frontend/    # React SPA (Vite + TailwindCSS)
apps/backend/     # Express API (Prisma + PostgreSQL)
packages/shared/  # Shared types and storage interfaces
```

### Code Style

- TypeScript strict mode
- No comments unless asked
- Composition over large files
- Every module independent
- `@/` path alias maps to `src/`
- Reuse existing components and patterns

### Before Submitting

1. Run `pnpm --filter frontend exec tsc --noEmit` (TypeScript check)
2. Verify Docker build works: `docker compose --profile nginx up -d --build`
3. Test your changes locally

### Commit Messages

- Use clear, descriptive messages
- Reference issues when applicable
- Examples: `Fix avatar upload crash`, `Add theme preset selector`

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Ensure TypeScript compiles cleanly
4. Ensure Docker builds successfully
5. Submit a pull request with a clear description

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include environment details (OS, browser, Docker version)
- For security issues, contact maintainers privately

## Architecture

Before changing code, read:

1. `AGENTS.md` — coding rules and security
2. `PROJECT_MAP.md` — file locations
3. `DECISIONS.md` — architectural context

---

← [Deployment](./deployment.md) · [Back to Top](#contributing)
