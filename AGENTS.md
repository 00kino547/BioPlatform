# AGENTS.md

## Overview

BioPlatform — link-in-bio platform (bio.link, guns.lol alternative).
Monorepo with pnpm workspaces. Full-stack app with auth, profiles, admin panel.

## Tech Stack

- **Frontend:** React 19, Vite 6, TypeScript 5, TailwindCSS 4, lucide-react
- **Backend:** Express 5, TypeScript 5, Prisma 6 (PostgreSQL)
- **Infra:** Docker Compose, Nginx (optional)
- **Package Manager:** pnpm 12 (via corepack, pinned to 12.4.0)

## Architecture

```
Client → Nginx (optional) → Frontend (React SPA)
                           → Backend (Express API) → PostgreSQL
```

## Coding Rules

- TypeScript strict mode
- `.js` extensions in ESM imports
- Add a bunch of comments into the code so other collaborators or repo owner can understand all the code
- Composition over large files
- **Never generate invite codes without asking first.** When testing or verifying invite-related functionality, always explain *why* a code is needed, *how many* are needed, and *how they will be cleaned up* before creating any. Codes accumulate and create clutter.
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
- `allowBuilds` and `nodeLinker: hoisted` go in `pnpm-workspace.yaml`
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
Always: reuse code/patterns, keep modules independent, update docs when files change and use tooling.

Never commit or push WIP changes unless explicitly requested.
When asked to commit a specific fix:
1. Inspect git status and diff.
2. Stage ONLY files/hunks belonging to that fix.
3. Verify the staged diff.
4. Create a signed commit.
5. Push ONLY after verifying the commit contains no unrelated changes.
6. Never force-push or rewrite main unless explicitly instructed.

**ASK, NEVER GUESS.** When the user's request is ambiguous or a design decision could go multiple ways, stop and ask a clarifying question (the `question` tool) instead of assuming. The user explicitly prefers being asked — asking many questions is better than guessing wrong. Do not start broad feature work without first confirming the intended behaviour.

## Memory

Standing landmark for this project (recurring / cross-session):
- Use `rtk` tooling for everything it wraps (rtk read/rg/grep/git/gh/pnpm/node/curl/docker/prisma,ALL), the Edit tool for file mutations, `rtk docker compose --profile nginx up -d --build` to rebuild + redeploy in one step, and `rtk docker compose ps`/`restart` for container management.

Never create standalone audit/report files (e.g. `docs/en/security-audit.md`). If a review finds issues, fix them directly.
Record every security fix in `CHANGELOG.md` under `[Unreleased] → Security` and mark it done in `TASKS.md` — never in a separate audit document. Accepted/deferred risks go in the same changelog entry as a note.

Docs parity: every file in `docs/en/` must have an exact Spanish twin in `docs/es/` (same set of files, same content translated). When you add, rename, or delete a doc in one language, mirror it in the other in the same change.

## Tooling

- **rtk** — Rust Token Killer and compatible with all t he commands, including ripgrep (`rg`) for fast file search and content grep across the repo + token saving.
- **Semgrep** — static analysis for security patterns (`semgrep --config=p/typescript`).
- **Gitleaks** — secret scanning (`gitleaks detect --source .`).
- **Trivy** — container image vulnerability scanning (`trivy image bio-backend:latest`).
- **ast-grep** — AST-based code search and refactoring (`sg scan -p '<pattern>'`).
- Run `pnpm typecheck` before committing to verify TypeScript correctness.
- Run `pnpm --filter @bioplatform/backend test` to execute backend tests.
- To run ONE backend test file, use `pnpm --filter @bioplatform/backend test:one tests/<file>.test.ts` — passing a file arg to `pnpm test` does NOT filter (the test script globs all `tests/*.test.ts`).
- If tool output looks truncated, empty, or misleading, run `pnpm tooling:check` (diagnostic oracle: real exit codes + stdout/stderr byte counts per probe; full JSON report under the system temp dir).
- **rtk** is compatible with the all the commands, including pnpm commands. Use internal tooling only if its needed, cross-contamination, etc...

## Tooling Reliability Notes

Everything below was diagnosed live (Sep 2026). Read it before trusting agent/tool
output during remediation — most "missing/corrupt/empty output" reports in this repo
trace back to one of these five points. These notes are platform-neutral (macOS and
Linux behave the same; on Windows adjust temp paths and shell syntax accordingly).

### Capturing real output (always do this)

- Split stdout and stderr into temp files, then inspect bytes and exit code:
  `cmd > "$TMPDIR/o.txt" 2> "$TMPDIR/e.txt"; echo $?; wc -c "$TMPDIR/o.txt" "$TMPDIR/e.txt"`.
- Some shells / command-capturing wrappers truncate long output (e.g. above tens of
  thousands of bytes) and point you at a file with the remainder. Do NOT `tail` a pipe
  to "see the end" — that hides the real exit code. Redirect to a file, inspect bytes
  with `wc -c`, then read the file.
- `tsc --noEmit` prints **nothing to stdout on success** (exit 0 is the signal, not
  output). Empty stdout + exit 0 is *correct* for tsc. Node's test runner prints its
  spec report on **stdout**; pnpm lifecycle lines go to stderr.

### Test runner (node:test + tsx)

- `pnpm --filter @bioplatform/backend test` runs the FULL suite (globs `tests/*.test.ts`).
  Appending a filename does NOT filter — you get all tests, which is misleading.
- Run exactly one file: `pnpm --filter @bioplatform/backend test:one tests/<file>.test.ts`.
- A failing file reports fail>0 on stdout and the process exits 1. A file that throws
  during import shows as a single failing entry (`✖ tests/<file>.test.ts`).
- `apps/backend/tests/setup-env.ts` no longer crashes when the repo `.env` is missing —
  it falls back to process env. Without `.env` the suite boots env validation and then
  fails with the *real* cause (e.g. DB credentials), never an opaque ENOENT. On machines
  without a local Postgres, run the DB with Docker or point `DATABASE_URL` (test schema
  uses `bioplatform_test`) at any reachable Postgres.
- Missing env vars (e.g. `ADMIN_PASSWORD` when no `.env`): the validator prints
  `Invalid environment variables: …` and `getEnv()` calls `process.exit(1)`. In prod
  the known-weak admin passwords AND the dev scaffold default are rejected.

### Env validator

- `apps/backend/src/config/env.ts` requires `DATABASE_URL` and `JWT_SECRET` (min 32).
  The dev/test `ADMIN_PASSWORD` scaffold default is `admin-scaffold-change-me` and
  satisfies the schema's own `min(12)` (the previous `"admin123456"` was 11 chars and
  crashed every zero-config boot). Production rejects the scaffold + known-weak values.

### rtk

- `rtk rewrite '<cmd>'` prints the rtk-wrapped command for known commands but exits
  **3** (its own help documents 0/1). Agent integrations wrap this in a non-throwing
  call; do NOT script `rtk rewrite "$CMD" || exit 0` yourself — treat the printed
  stdout as the outcome.
- rtk pass-through itself is faithful: real exit codes, stdout/stderr byte-accurate
  (verified with byte-compare tests against raw `sh`). `docker compose ps`, `git status`,
  `pnpm <script>`, node/tsx runs all work through `rtk`.

### CI

- `.github/workflows/tests.yml` is the correctness gate: backend suite (Postgres 16
  service, password `postgres`), `pnpm typecheck`, `pnpm lint`, `--frozen-lockfile`.
  `docker-publish.yml` only builds images — it never runs tests.

-# AGENTS.md written by 00kino547+bioplatform@dexlunmc.com for its own enviroment, adapt to your needs, but this its the most efficient at the time. General use for any kind of AI; Not recommended for production use.
