/**
 * Regression tests for the PORT "empty string" finding.
 *
 * The failure this locks down: `.env` commonly carries `PORT=` (or a shell
 * exports an empty `PORT`), and Compose interpolated that as an *empty string*
 * rather than omitting the key. The backend then received `PORT=""`, which
 * `z.coerce.number()` happily turned into `0` — a server listening on a
 * privileged/nonexistent port instead of 3000. Both layers are covered here:
 *
 *  - the Zod schema must treat empty/whitespace as "not provided";
 *  - both Compose files must resolve an empty `PORT` to 3000 as well, because
 *    an operator who only uses the published `docker compose` path never loads
 *    the schema at all.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { validateEnv, type Env } from "../src/config/env.js";

/**
 * Run the real Compose interpolation for one compose file with a controlled
 * `.env`, and return the resolved backend port. `--env-file` is pointed at a
 * throwaway file so the developer's own `.env` can never leak into the result.
 */
function resolvedComposePort(composeFile: string, envValue: string | undefined): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), "bioplatform-port-"));
  const envFile = join(dir, ".env");
  // Compose reads `.env` from the project directory; writing "PORT=" (or
  // nothing at all) reproduces both shapes of the bug.
  writeFileSync(envFile, envValue === undefined ? "" : `PORT=${envValue}\n`);

  // The shell environment wins over `--env-file` in Compose, and the test
  // bootstrap loads the repository `.env` into `process.env` (which sets
  // `PORT=3000`). Strip it so each case really exercises the `.env` under test.
  const childEnv: Record<string, string | undefined> = { ...process.env };
  delete childEnv.PORT;

  const out = execFileSync(
    "docker",
    [
      "compose",
      "--project-directory",
      dir,
      "-f",
      join(process.cwd(), "..", "..", composeFile),
      "--env-file",
      envFile,
      "config",
      "--format",
      "json",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: childEnv },
  );

  const parsed = JSON.parse(out) as { services: Record<string, { environment?: Record<string, string> }> };
  return parsed.services.backend?.environment?.PORT;
}

for (const composeFile of ["docker-compose.prebuilt.yml", "docker-compose.yml"]) {
  test(`${composeFile}: an unset PORT resolves to 3000`, () => {
    assert.equal(resolvedComposePort(composeFile, undefined), "3000");
  });

  test(`${composeFile}: an empty PORT resolves to 3000 instead of ""`, () => {
    // The exact regression: this used to resolve to the empty string and the
    // backend coerced it to port 0.
    assert.equal(resolvedComposePort(composeFile, ""), "3000");
  });

  test(`${composeFile}: an explicit PORT is honoured`, () => {
    assert.equal(resolvedComposePort(composeFile, "3001"), "3001");
  });
}

test("the env schema treats an empty PORT as unset", () => {
  const parsed = parseWith({ PORT: "" });
  assert.equal(parsed.PORT, 3000);
});

test("the env schema treats a whitespace-only PORT as unset", () => {
  const parsed = parseWith({ PORT: "   " });
  assert.equal(parsed.PORT, 3000);
});

test("the env schema still honours a numeric PORT", () => {
  const parsed = parseWith({ PORT: "3001" });
  assert.equal(parsed.PORT, 3001);
});

test("the env schema rejects a PORT that is not a usable port number", () => {
  // 0 is the value an empty string used to become — never a valid listen port.
  for (const bad of ["0", "70000", "not-a-port", "-1"]) {
    assert.equal(validateEnv({ ...validBase(), PORT: bad }).success, false, `PORT=${bad} should be rejected`);
  }
});

/**
 * Validate a candidate environment and fail loudly if it was rejected, so the
 * assertions above can read `parsed.PORT` directly.
 */
function parseWith(overrides: Record<string, string>): Env {
  const result = validateEnv({ ...validBase(), ...overrides });
  assert.equal(result.success, true, result.success ? "" : result.issues.join("; "));
  return result.data;
}

/**
 * Minimal valid input for the schema: the two required secrets plus whatever
 * the schema demands for the rest. Keeping this explicit (rather than loading
 * the developer's real environment) means these assertions describe the schema
 * itself, not the machine the tests happen to run on.
 */
function validBase(): Record<string, string> {
  return {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/bioplatform",
    JWT_SECRET: "x".repeat(48),
  };
}