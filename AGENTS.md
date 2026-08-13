# AGENTS.md

## Overview

BioPlatform — link-in-bio platform (bio.link, guns.lol alternative).
Monorepo with pnpm workspaces. Full-stack app with auth, profiles, admin panel.

## Tech Stack

- **Frontend:** React 19, Vite 6, TypeScript 5, TailwindCSS 4, lucide-react
- **Backend:** Express 5, TypeScript 5, Prisma 6 (PostgreSQL)
- **Infra:** Docker Compose, Nginx (optional)
- **Package Manager:** pnpm 11 (via corepack)

## Architecture

```
Client → Nginx (optional) → Frontend (React SPA)
                           → Backend (Express API) → PostgreSQL
```

## Coding Rules

- TypeScript strict mode
- `.js` extensions in ESM imports
- No comments unless asked
- Composition over large files
- Every module independent
- All env vars validated via Zod (`apps/backend/src/config/env.ts`)
- No hardcoded ports, domains, secrets
- `@/` path alias maps to `src/`

## Security Rules

- All user input sanitized before storage (strip HTML-like chars: `<`, `>`, `{`, `}`)
- Platform names validated against allowlist (no arbitrary strings in socialLinks.platform)
- URLs validated for correct protocol (http/https/mailto) — no `javascript:` etc.
- bcrypt at 12 rounds for all password operations
- JWT tokens expire per `JWT_EXPIRES_IN` (default `7d`)
- No `dangerouslySetInnerHTML` anywhere in the frontend
- React escapes all JSX content by default — defense-in-depth via backend sanitization

## Protected Operations

The agent MUST NEVER modify authentication credentials, password hashes, 2FA/passkeys, API keys, tokens, or user secrets without explicit user approval.

If authentication blocks testing, stop and ask the user.

Never rewrite credentials to continue automatically. If an E2E test requires changing user state, create temporary test accounts instead of modifying existing ones.

## Visual Quality Rules

Every public page must include: visual hierarchy, proper spacing, interactive elements, hover states, responsive behavior, smooth animations, modern UI patterns, consistent design language.

## Docker Rules

- **Critical:** Copy source code BEFORE `pnpm install` in Dockerfiles. pnpm's hoisted `node_modules` creates symlinks that Docker COPY cannot follow.
- `allowBuilds` and `node-linker: hoisted` go in `pnpm-workspace.yaml`
- Backend: single-stage Dockerfile
- Frontend: multi-stage (build → Nginx)

## Development Workflow

1. `cp .env.example .env` and configure
2. `docker compose --profile nginx up -d` for full stack
3. `pnpm dev` for local development
4. `pnpm db:generate` after schema changes

## Branding

All branding via `VITE_*` env vars in `apps/frontend/src/config/branding.ts`.
Never hardcode project name — always use `branding.name`, `branding.tagline`, etc.

## Release & Versioning

### GitHub Release Prerelease Policy

- Every GitHub release must be marked as **Pre-release** unless it is a final stable release.
- Any version containing a prerelease identifier such as `-dev`, `-alpha`, `-beta`, or `-rc` MUST be published with GitHub's **Pre-release** flag enabled.
- Final stable versions without a prerelease identifier (for example `1.3.0`) MUST NOT be marked as Pre-release.
- Never mark a `dev`, `alpha`, `beta`, or `rc` release as the latest/stable release.
- This applies to all release channels and versions unless explicitly overridden by the project owner.

## AI Instructions

Before changing code:
1. Read this file
2. Read `PROJECT_MAP.md` for file locations
3. Read `DECISIONS.md` for architectural context

Never: assume architecture, duplicate logic, rewrite unrelated code, rename files, add unnecessary deps.
Always: reuse code/patterns, keep modules independent, update docs when files change.

Never create standalone audit/report files (e.g. `docs/en/security-audit.md`). If a review finds issues, fix them directly.
Record every security fix in `CHANGELOG.md` under `[Unreleased] → Security` and mark it done in `TASKS.md` — never in a separate audit document. Accepted/deferred risks go in the same changelog entry as a note.

Docs parity: every file in `docs/en/` must have an exact Spanish twin in `docs/es/` (same set of files, same content translated). When you add, rename, or delete a doc in one language, mirror it in the other in the same change.
