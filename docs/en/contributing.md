# Contributing

Thank you for considering a contribution to BioPlatform. This guide defines the standards every contribution must meet. Read it in full before submitting work, and follow it on every change — no exceptions.

## Language Policy

**English is the mandatory language for this project.** Use English in all of the following, without exception:

- Source code: identifiers, string literals surfaced in the UI, comments (see [Comment rule](#code-standards))
- Commit messages, pull request titles, and pull request descriptions
- GitHub issues and discussions
- All documentation files in `docs/en/`

Spanish documentation lives in `docs/es/` and is a translation of the English version — never the other way around. `docs/es/` must keep the same set of files and the same structure as `docs/en/`.

## Getting Started

Prerequisites: Node.js 20+, `corepack enabled` for pnpm, and a PostgreSQL instance (local or via Docker Compose).

1. Fork the repository on GitHub.
2. Clone your fork, then add the upstream remote.
3. Create a feature branch from `main` with a short, descriptive name (e.g. `feat/theming`, `fix/terminal-ls`).

```bash
git clone https://github.com/YOUR_USERNAME/BioPlatform.git
cd BioPlatform
git remote add upstream https://github.com/BioPlatform/BioPlatform.git
git checkout -b feat/your-change
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm --filter @bioplatform/backend db:seed
pnpm dev
```

`pnpm dev` runs both workspaces; the backend serves the API and the frontend serves the React SPA.

## Project Structure

```
apps/frontend/    # React SPA (Vite + TailwindCSS 4)
apps/backend/     # Express API (Prisma + PostgreSQL)
packages/shared/  # Shared types and storage interfaces
docs/en/          # English documentation
docs/es/          # Spanish documentation (mirror of docs/en)
```

## Code Standards

- TypeScript in strict mode, in every workspace.
- Do not add comments unless explicitly asked. Code should be self-explanatory.
- Composition over large files. Split components, routes, and utilities into small, focused modules.
- Every module must be independent and not import from sibling feature code.
- The `@/` path alias maps to `src/`.
- Reuse existing components and patterns. Do not duplicate logic already present in the codebase.
- Read `AGENTS.md`, `PROJECT_MAP.md`, and `DECISIONS.md` before changing code.

### Security and Data Rules

- Sanitize all user input before storage (strip `<`, `>`, `{`, `}`).
- Validate URLs against an allowlist of protocols (`http`, `https`, `mailto`) — never allow `javascript:` or similar.
- Platform names must belong to a fixed allowlist; never accept arbitrary strings.
- Use bcrypt (12 rounds) for every password operation.
- Never commit secrets, tokens, or credentials. Keys must come from environment variables validated with Zod.
- When a request is ambiguous, ask the maintainers for clarification instead of guessing.

## Testing and Quality Gates

Every change must pass the following before it is considered complete:

1. `pnpm typecheck` — no TypeScript errors in any workspace.
2. `pnpm --filter @bioplatform/backend test` — the backend test suite must pass. Run tests relevant to the change; when you add behavior, add tests for it.
3. Linting — the workspace lint script must report no errors.
4. Docs parity — if you change or add a page in `docs/en/`, update the matching file in `docs/es/` in the same change; `docs/en/` and `docs/es/` must always contain the same set of files.

### Running a single test file

`pnpm test -- <file>` does **not** filter — the backend `test` script globs every
`tests/*.test.ts`, so passing a file name runs the whole suite. Run exactly one
file with:

```sh
pnpm --filter @bioplatform/backend test:one tests/<file>.test.ts
```

### Tooling reliability check

`pnpm tooling:check` runs a diagnostic oracle that reports, per probe, the real
exit code and separate stdout/stderr byte counts: git/node/pnpm presence,
the `rtk rewrite` contract, repo `.env` presence, test-DB reachability, sample
suite execution and targeted-run isolation. It exits non-zero when a repo gate
fails and writes a full JSON report under the system temp dir. Use it when
agent/tool output looks truncated, empty or misleading during remediation.

Optional but recommended before merging: `semgrep --config=p/typescript`, `gitleaks detect --source .`, and `trivy image` on the built images.

## Commit Messages

- Write messages in English, imperative mood, and describe the change, not the file.
- Reference the issue or task when applicable.
- Keep messages concise: a one-line summary plus, when needed, a short body.

Examples:

```
Fix avatar upload crash
Add theme preset selector
Refactor terminal command editor grid
```

Do not commit generated or machine-modified files unless the change requires them.

## Pull Requests

1. Create a feature branch from `main`.
2. Implement your change following the [Code Standards](#code-standards).
3. Run the [Testing and Quality Gates](#testing-and-quality-gates).
4. Rebase your branch on the latest `main` and verify the final squash diff.
5. Open a pull request with the change summary, the motivation, and how to verify it.

The maintainers may request changes; address them in follow-up commits, not by rewriting history after review has started.

## Reporting Issues

- File issues on GitHub with a precise title in English.
- Include clear steps to reproduce, expected vs. actual behavior, and the relevant environment details (OS, browser, Docker version).
- Report security issues privately to the maintainers instead of opening a public issue.

---

← [Deployment](./deployment.md) · [Back to Top](#contributing)