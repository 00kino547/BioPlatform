#!/usr/bin/env node
/**
 * Compose environment parity guard.
 *
 * Why this exists: `docker-compose.yml` builds the backend from source and
 * `docker-compose.prebuilt.yml` runs a published image. They are two files that
 * must stay interchangeable, and they had already drifted — the prebuilt file was
 * missing 63 backend variables, so the documented "just add a profile" deploy path
 * silently ran with schema defaults for things like billing prices and invite
 * packs. Nothing failed loudly: the app booted and looked fine.
 *
 * That class of bug cannot be caught by a review, because the review only ever
 * looks at the file someone opened. So this compares the two resolved
 * `environment:` blocks and fails the build on any difference.
 *
 * Deliberate design choices:
 *   - Compares the RESOLVED config (`docker compose config`), so `${VAR:-}`
 *     interpolation and YAML anchoring are already flattened. Comparing raw YAML
 *     would flag formatting and ordering noise instead of real differences.
 *   - Compares the backend service only. The other services (postgres, valkey,
 *     nginx, frontend) are intentionally configured differently between the files.
 *   - Compares KEY NAMES, not values. Both files resolve against the same local
 *     `.env`, so a key present in one and absent in the other is the actual bug;
 *     differing literal values would be the operator's deliberate choice.
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, so the script works from any cwd and picks up the repo `.env`. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = ["docker-compose.yml", "docker-compose.prebuilt.yml"];

/** Backend service names differ between the two files; find it by its env shape. */
function resolveBackendEnv(composeFile) {
  const raw = execFileSync(
    "docker",
    ["compose", "-f", composeFile, "config", "--format", "json"],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const config = JSON.parse(raw);
  const services = Object.entries(config.services ?? {});
  for (const [name, service] of services) {
    const env = service?.environment;
    if (env && typeof env === "object" && "JWT_SECRET" in env) return { name, env };
  }
  throw new Error(
    `Could not find the backend service in ${composeFile} (no service forwards JWT_SECRET).`,
  );
}

let failed = false;
{
  const resolved = FILES.map((file) => resolveBackendEnv(file));

  const [a, b] = resolved;
  const keysA = new Set(Object.keys(a.env));
  const keysB = new Set(Object.keys(b.env));

  // Sorted so the report is stable regardless of YAML ordering.
  const onlyA = [...keysA].filter((k) => !keysB.has(k)).sort();
  const onlyB = [...keysB].filter((k) => !keysA.has(k)).sort();

  if (onlyA.length === 0 && onlyB.length === 0) {
    console.log(
      `compose env parity OK — both files forward ${keysA.size} backend variables (${a.name} / ${b.name}).`,
    );
  } else {
    failed = true;
    console.error("compose env parity FAILED — the prebuilt and source deploy paths disagree.\n");
    if (onlyA.length) {
      console.error(`Forwarded by ${a.name} (${FILES[0]}) but MISSING in ${FILES[1]}:\n  ${onlyA.join("\n  ")}`);
    }
    if (onlyB.length) {
      console.error(`Forwarded by ${b.name} (${FILES[1]}) but MISSING in ${FILES[0]}:\n  ${onlyB.join("\n  ")}`);
    }
    console.error(
      "\nBoth files must forward the same backend variables, or an operator using the\n" +
        "prebuilt path gets schema defaults for settings they configured.",
    );
  }
}

if (failed) process.exit(1);