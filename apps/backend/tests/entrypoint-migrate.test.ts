/**
 * Regression tests for the backend entrypoint's migration preflight.
 *
 * What this locks down: `prisma migrate deploy` applied against an image that
 * ships no `prisma/migrations/` directory exits 0 and does NOTHING, so a fresh
 * database was left empty while the entrypoint printed "Database schema is up to
 * date" and started a server that could not serve a single query. An image like
 * that is what reached users (the directory was never committed, so CI built
 * images without it), so this now has to fail loudly instead of "succeed".
 *
 * The checks are file-system driven and use a stubbed `pnpm`, so they need no
 * Docker and no database: `MIGRATIONS_DIR` is overridable precisely so this can
 * be tested outside a container.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, describe } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ENTRYPOINT = join(REPO_ROOT, "apps", "backend", "docker-entrypoint.sh");

/** Environment shared by every run: everything the entrypoint reads must be set. */
function baseEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: "postgresql://user:pass@localhost:5432/bioplatform",
    MIGRATE_ON_START: "true",
    SEED_ON_START: "false",
    ...extra,
  };
}

/** Run the entrypoint with a stubbed `pnpm` and the given migrations layout. */
function runEntrypoint(opts: {
  migrationsDir: string;
  extraEnv?: Record<string, string>;
  pnpmExit?: number;
}): { status: number | null; stdout: string; stderr: string; pnpmCalls: string[] } {
  const root = mkdtempSync(join(tmpdir(), "bioplatform-entrypoint-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });

  // A `pnpm` that records what it was asked to do instead of running Prisma.
  const pnpmLog = join(root, "pnpm.log");
  writeFileSync(
    join(bin, "pnpm"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "${pnpmLog}"
exit ${opts.pnpmExit ?? 0}
`,
    { mode: 0o755 },
  );

  const res = spawnSync("sh", [ENTRYPOINT, "echo", "server-started"], {
    encoding: "utf8",
    env: baseEnv({
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      MIGRATIONS_DIR: opts.migrationsDir,
      ...opts.extraEnv,
    }),
    timeout: 30_000,
  });

  const pnpmCalls: string[] = [];
  try {
    pnpmCalls.push(...readFileSync(pnpmLog, "utf8").split("\n").filter(Boolean));
  } catch {
    /* the stub was never called — a valid outcome for the failing paths */
  }

  rmSync(root, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "", pnpmCalls };
}

describe("entrypoint — migrations preflight", () => {
  test("an image with no migrations directory fails loudly and starts nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "bioplatform-nomig-"));
    try {
      const r = runEntrypoint({ migrationsDir: join(root, "does-not-exist") });

      assert.equal(r.status, 1, `expected a hard failure, got status ${r.status}\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /contains no Prisma migrations/);
      assert.match(r.stderr, /schema would be left EMPTY/);
      assert.match(r.stderr, /MIGRATE_ON_START=false/, "the escape hatch must be documented in the error");
      assert.doesNotMatch(r.stdout, /server-started/, "the server must never start on this path");
      assert.equal(r.pnpmCalls.length, 0, "prisma must not be invoked at all");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an image whose migrations directory is empty is treated as broken", () => {
    const root = mkdtempSync(join(tmpdir(), "bioplatform-emptymig-"));
    try {
      const empty = join(root, "migrations");
      mkdirSync(empty, { recursive: true });

      const r = runEntrypoint({ migrationsDir: empty });
      assert.equal(r.status, 1, `expected failure for an empty migrations dir, got ${r.status}`);
      assert.match(r.stderr, /contains no Prisma migrations/);
      assert.doesNotMatch(r.stdout, /server-started/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a stray FILE in the migrations folder does not satisfy the preflight", () => {
    const root = mkdtempSync(join(tmpdir(), "bioplatform-fileonly-"));
    try {
      const dir = join(root, "migrations");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "README.md"), "not a migration\n");

      const r = runEntrypoint({ migrationsDir: dir });
      assert.equal(r.status, 1, "only directories (0_init/) count as migrations");
      assert.match(r.stderr, /contains no Prisma migrations/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a proper migrations directory passes the preflight and migrates", () => {
    const root = mkdtempSync(join(tmpdir(), "bioplatform-goodmig-"));
    try {
      const dir = join(root, "migrations");
      mkdirSync(join(dir, "0_init"), { recursive: true });
      writeFileSync(join(dir, "0_init", "migration.sql"), "CREATE TABLE example(id int);\n");

      const r = runEntrypoint({ migrationsDir: dir });
      assert.equal(r.status, 0, `expected success, got ${r.status}\n${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /Database schema is up to date/);
      assert.match(r.stdout, /server-started/, "the server must be started after a good preflight");
      assert.ok(
        r.pnpmCalls.some((c) => c.includes("db:migrate:prod")),
        `prisma migrate should have been invoked; got: ${JSON.stringify(r.pnpmCalls)}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("MIGRATE_ON_START=false skips the whole thing (operator-managed schema)", () => {
    const root = mkdtempSync(join(tmpdir(), "bioplatform-skipmig-"));
    try {
      const r = runEntrypoint({
        migrationsDir: join(root, "nowhere"),
        extraEnv: { MIGRATE_ON_START: "false" },
      });

      assert.equal(r.status, 0, `expected success with migrations disabled, got ${r.status}`);
      assert.match(r.stdout, /server-started/);
      assert.equal(r.pnpmCalls.length, 0, "no migration must run when the flag is off");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an empty DATABASE_URL with migrations enabled fails before touching anything", () => {
    const root = mkdtempSync(join(tmpdir(), "bioplatform-nourl-"));
    try {
      const dir = join(root, "migrations");
      mkdirSync(join(dir, "0_init"), { recursive: true });

      const r = runEntrypoint({ migrationsDir: dir, extraEnv: { DATABASE_URL: "" } });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /DATABASE_URL is empty/);
      assert.equal(r.pnpmCalls.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
