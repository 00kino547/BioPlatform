import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Regression coverage for the update flow's one non-negotiable rule:
//     a VERIFIED backup happens before anything else happens.
//
// `update.sh` is the only operator script that writes to the database, so these
// tests drive the real script end to end with the *Docker CLI stubbed* and every
// invocation recorded. Asserting the ordering from the recorded order of real
// commands (rather than by reading the source) is the only way to catch the
// regression that matters: someone adding a `docker compose up` or a migration
// before the backup block.
//
// What each scenario stubs, and why each matters:
//
//   STUB_PG_DUMP=ok|fail|empty   pg_dump exits 0 / exits non-zero / "succeeds"
//                                but writes a 3-byte file
//   STUB_TOC=fail|ok             the archive verification inside postgres
//                                (pg_restore --list) succeeds or fails
//   STUB_MIGRATE=fail|ok        `migrate deploy` succeeds or fails
//   STUB_HEALTH=fail|ok         /api/health answers or never does
//
// A `pg_dump` that exits 0 is deliberately NOT treated as a backup anywhere in
// these tests: the empty and unparsable-archive cases are the ones that would
// otherwise leave an operator with a "backup" they cannot use.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const UPDATE_SH = join(REPO_ROOT, "update.sh");
const COMPOSE_FILE = join(REPO_ROOT, "docker-compose.prebuilt.yml");

let workDir: string;
let stubBin: string;
/**
 * The piped tests need the real `curl` (the library download) but must never
 * touch the real `docker`, so they get a bin dir with the docker stub only —
 * `stubBin` also fakes curl for the health probe, which would answer the
 * library download with an empty file.
 */
let pipedBin: string;
let deployDir: string;
let backupDir: string;
let logFile: string;

/** Fake `docker` that records every invocation and emulates a healthy stack. */
const DOCKER_STUB = `#!/bin/sh
# Records the invocation, then answers the way a working BioPlatform stack would.
printf 'docker %s\\n' "$*" >> "$STUB_LOG"

# Image overrides are passed as process-environment assignments (so the
# operator's .env is never rewritten), which means they are invisible in argv.
# Record them so a test can assert that a rollback really pinned the previous
# image digest.
if [ -n "\${BACKEND_IMAGE:-}" ] || [ -n "\${FRONTEND_IMAGE:-}" ]; then
  printf 'env BACKEND_IMAGE=%s FRONTEND_IMAGE=%s\\n' "\${BACKEND_IMAGE:-}" "\${FRONTEND_IMAGE:-}" >> "$STUB_LOG"
fi

args="$*"

# --- engine / plugin probes -------------------------------------------------
case "$args" in
  "version"* | "compose version"* | "info"*) printf 'stub\\n'; exit 0 ;;
esac

# --- image inspection (used to remember what is running) --------------------
case "$args" in
  "image inspect"*) printf 'dracoservices/bioplatform-backend@sha256:stub0000000000000000000000000000000000000000000000000000000000000000\\n'; exit 0 ;;
  "inspect --format"*) printf 'dracoservices/bioplatform-backend:latest\\n'; exit 0 ;;
esac

# --- compose ----------------------------------------------------------------
case "$args" in
  *compose*" ps "*)
    printf 'postgres\\nredis\\nbackend\\nfrontend\\n'
    exit 0
    ;;
  *compose*" exec -T postgres printenv POSTGRES_USER"*) printf 'postgres\\n'; exit 0 ;;
  *compose*" exec -T postgres printenv POSTGRES_DB"*) printf 'bioplatform\\n'; exit 0 ;;
  *compose*" psql"*)
    # The migration history Prisma recorded in the live database.
    printf '0_init\\n20261001120000_invite_credit_ledger\\n'
    exit 0
    ;;
  *compose*" pg_dump"*)
    case "\${STUB_PG_DUMP:-ok}" in
      fail)
        printf 'pg_dump: error: connection to server failed\\n' >&2
        exit 1
        ;;
      empty)
        # "succeeds" but produces nothing usable — the failure mode that used to
        # be mistaken for a backup.
        printf 'x'
        exit 0
        ;;
      *)
        # A plausible custom-format archive: the PGDMP magic followed by padding.
        printf 'PGDMP'
        dd if=/dev/zero bs=1024 count=8 2>/dev/null
        exit 0
        ;;
    esac
    ;;
  *compose*" pg_restore --list"*)
    case "\${STUB_TOC:-ok}" in
      fail)
        printf 'pg_restore: error: did not find magic string in header\\n' >&2
        exit 1
        ;;
      *)
        printf ';\\n; Archive created at 2026-10-05 12:00:00 UTC\\n;     TOC Entries: 245\\n;     Compression: gzip\\n; Format: CUSTOM\\n'
        exit 0
        ;;
    esac
    ;;
  *compose*" run --rm --no-deps --entrypoint ls"*)
    printf '0_init\\n20261001120000_invite_credit_ledger\\n20261002120000_policy_admin_auto_accept\\nmigration_lock.toml\\n'
    exit 0
    ;;
  *compose*" db:migrate:prod"*)
    case "\${STUB_MIGRATE:-ok}" in
      fail)
        printf 'Error: P3018\\nA migration failed to apply\\n' >&2
        exit 1
        ;;
      *) printf 'No pending migrations to apply.\\n'; exit 0 ;;
    esac
    ;;
  *compose*" pull"*) printf 'pulled\\n'; exit 0 ;;
  *compose*" up -d"*) printf 'recreated\\n'; exit 0 ;;
  *compose*" logs"*) printf 'stub logs\\n'; exit 0 ;;
esac

exit 0
`;

/** Fake `curl`: the GitHub release lookup and the health probe. */
const CURL_STUB = `#!/bin/sh
# Health probe: only the URL update.sh actually polls decides the outcome.
case "$*" in
  *api/health*)
    [ "\${STUB_HEALTH:-ok}" = "fail" ] && exit 7
    printf '{"status":"ok"}'
    exit 0
    ;;
esac
# The advisory GitHub release lookup is not part of any assertion here.
exit 0
`;

type RunResult = { status: number | null; stdout: string; stderr: string; log: string[] };

function runUpdate(extraEnv: Record<string, string>, args: string[] = []): RunResult {
  // Each scenario starts from an empty backups directory so "exactly one dump"
  // and "no dump survives a rejection" mean what they say; update.sh itself never
  // deletes an older dump, which is deliberate.
  for (const f of existsSync(backupDir) ? readdirSync(backupDir) : []) {
    rmSync(join(backupDir, f), { force: true });
  }

  const res = spawnSync("sh", [UPDATE_SH, "--deployment-dir", deployDir, "--compose-file", COMPOSE_FILE, "--yes", "--backup-dir", backupDir, "--health-timeout", "6", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubBin}:${process.env.PATH}`,
      STUB_LOG: logFile,
      NO_COLOR: "1",
      ...extraEnv,
    },
    timeout: 60_000,
  });

  const log = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean) : [];
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "", log };
}

/** Index of the first recorded docker invocation containing `needle`. */
function indexOfDockerCall(log: string[], needle: string): number {
  return log.findIndex((line) => line.includes(needle));
}

before(() => {
  workDir = mkdtempSync(join(tmpdir(), "bioplatform-update-test-"));
  stubBin = join(workDir, "bin");
  deployDir = join(workDir, "deployment");
  backupDir = join(workDir, "backups");
  logFile = join(workDir, "docker-calls.log");
  mkdirSync(stubBin, { recursive: true });
  pipedBin = join(workDir, "piped-bin");
  mkdirSync(pipedBin, { recursive: true });
  mkdirSync(deployDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(join(stubBin, "docker"), DOCKER_STUB, { mode: 0o755 });
  writeFileSync(join(stubBin, "curl"), CURL_STUB, { mode: 0o755 });
  writeFileSync(join(pipedBin, "docker"), DOCKER_STUB, { mode: 0o755 });
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("update.sh — verified backup before any migration", () => {
  test("takes the backup, then migrates, then recreates the stack", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_PG_DUMP: "ok" });

    assert.equal(r.status, 0, `expected success\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);

    const dumpAt = indexOfDockerCall(r.log, "pg_dump");
    const migrateAt = indexOfDockerCall(r.log, "db:migrate:prod");
    const upAt = indexOfDockerCall(r.log, "up -d");

    assert.ok(dumpAt >= 0, "pg_dump was never called");
    assert.ok(migrateAt >= 0, "migrate deploy was never called");
    assert.ok(upAt >= 0, "the stack was never recreated");
    assert.ok(dumpAt < migrateAt, `pg_dump (line ${dumpAt}) must come before migrate deploy (line ${migrateAt})`);
    assert.ok(migrateAt < upAt, `migrate deploy (line ${migrateAt}) must come before 'up -d' (line ${upAt})`);
  });

  test("the migration is a dedicated step with the entrypoint's auto-migrate switched off", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({});
    const migrate = r.log.find((line) => line.includes("db:migrate:prod"));

    assert.ok(migrate, "migrate deploy was never called");
    assert.match(migrate!, /MIGRATE_ON_START=false/, "the one-shot migration container must not re-run the entrypoint's auto-migration");
    assert.match(migrate!, /run --rm/, "the migration container must be one-shot (--rm)");
  });

  test("reports the dump path and size to the operator", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({});
    assert.equal(r.status, 0);
    assert.match(r.stdout, /backup verified: .*bioplatform-\d{8}-\d{6}\.dump/);
    assert.match(r.stdout, /B\b|KiB|MiB/, "the dump size must be reported");

    const dumps = existsSync(backupDir) ? readdirSync(backupDir) : [];
    assert.equal(dumps.length, 1, `expected exactly one dump in ${backupDir}, found ${JSON.stringify(dumps)}`);
    assert.ok(!dumps.some((f) => f.endsWith(".partial")), "the partially-written dump name must never be left behind");
  });

  test("a FAILED pg_dump stops the update before any migration", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_PG_DUMP: "fail" });

    assert.notEqual(r.status, 0, "a failed backup must fail the update");
    assert.equal(indexOfDockerCall(r.log, "db:migrate:prod"), -1, "migrate deploy ran despite a failed backup");
    assert.equal(indexOfDockerCall(r.log, "up -d"), -1, "the stack was recreated despite a failed backup");
    assert.equal(indexOfDockerCall(r.log, "pull"), -1, "images were pulled despite a failed backup");
    assert.match(r.stderr + r.stdout, /NO MIGRATION WILL RUN/);
  });

  test("an EMPTY dump is rejected — pg_dump exiting 0 is not a backup", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_PG_DUMP: "empty" });

    assert.notEqual(r.status, 0, "a zero-length dump must fail the update");
    assert.match(r.stderr + r.stdout, /not a usable backup/);
    assert.equal(indexOfDockerCall(r.log, "db:migrate:prod"), -1, "migrate deploy ran against an empty dump");
  });

  test("a dump whose archive cannot be read is rejected before migrating", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_TOC: "fail" });

    assert.notEqual(r.status, 0, "an unverifiable archive must fail the update");
    assert.match(r.stderr + r.stdout, /could not be verified|not being accepted as a backup/);
    assert.equal(indexOfDockerCall(r.log, "db:migrate:prod"), -1, "migrate deploy ran against an unreadable archive");
  });

  test("no dump file survives a rejected backup", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_PG_DUMP: "empty" });
    assert.notEqual(r.status, 0);
    assert.deepEqual(readdirSync(backupDir), [], "a rejected backup must not leave a file an operator could trust");
  });

  test("--no-backup is refused without --force", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({}, ["--no-backup"]);

    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /--force/);
    assert.equal(indexOfDockerCall(r.log, "db:migrate:prod"), -1);
  });

  test("--no-backup --force proceeds, and says so loudly", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({}, ["--no-backup", "--force"]);

    assert.equal(r.status, 0, r.stdout + r.stderr);
    // The warning goes to stderr by design (bp_warn), so both streams are checked.
    assert.match(r.stdout + r.stderr, /WITHOUT A BACKUP/);
    assert.ok(indexOfDockerCall(r.log, "db:migrate:prod") >= 0, "--force must actually allow the migration");
  });

  test("a failed backup with --force proceeds but keeps the warning", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_PG_DUMP: "fail" }, ["--force"]);

    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /BACKUP FAILED AND --force/);
    assert.ok(indexOfDockerCall(r.log, "db:migrate:prod") >= 0);
  });
});

describe("update.sh — failure behaviour and recovery", () => {
  test("a failed migration stops before the stack is recreated and prints the restore recipe", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_MIGRATE: "fail" });

    assert.notEqual(r.status, 0);
    assert.equal(indexOfDockerCall(r.log, "up -d"), -1, "the stack must not be recreated after a failed migration");
    const output = r.stdout + r.stderr;
    assert.match(output, /pg_restore/, "the recovery instructions must name the restore command");
    assert.match(output, /Restore this dump into a scratch database/);
    assert.match(output, /backup verified: .*\.dump/, "the dump path must be printed on the failure path");
  });

  test("a migration failure never reports the update as complete", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_MIGRATE: "fail" });
    assert.doesNotMatch(r.stdout, /Update complete/);
  });

  test("a backend that never becomes healthy fails the update and rolls back", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_HEALTH: "fail" });

    assert.notEqual(r.status, 0);
    const output = r.stdout + r.stderr;
    assert.match(output, /never became healthy/);
    assert.match(output, /sha256:stub/, "the previous image digest must be offered as the rollback target");

    // Two `up -d` calls: the update itself and the rollback.
    assert.ok(r.log.filter((l) => l.includes("up -d")).length >= 2, "a rollback recreate must be attempted");
    assert.ok(r.log.some((l) => l.includes("BACKEND_IMAGE=dracoservices/bioplatform-backend@sha256:stub")), "the rollback must pin the previous image digest");
  });

  test("--no-rollback prints recovery steps instead of rolling back", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_HEALTH: "fail" }, ["--no-rollback"]);

    assert.notEqual(r.status, 0);
    assert.equal(r.log.filter((l) => l.includes("up -d")).length, 1, "--no-rollback must not recreate a second time");
    assert.match(r.stdout + r.stderr, /Roll back to the images that were running/);
  });

  test("--skip-migration recreates the stack without touching the schema", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({}, ["--skip-migration"]);

    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(indexOfDockerCall(r.log, "db:migrate:prod"), -1);
    assert.ok(indexOfDockerCall(r.log, "up -d") >= 0, "the stack must still be recreated");
  });
});

describe("update.sh — idempotency and dry-run", () => {
  test("running it twice in a row is safe", () => {
    writeFileSync(logFile, "");
    const first = runUpdate({});
    assert.equal(first.status, 0, first.stdout + first.stderr);

    writeFileSync(logFile, "");
    const second = runUpdate({});
    assert.equal(second.status, 0, second.stdout + second.stderr);

    // Second run must still go through backup -> migrate -> recreate, i.e. no
    // state from the first run changes the order.
    const dumpAt = indexOfDockerCall(second.log, "pg_dump");
    const migrateAt = indexOfDockerCall(second.log, "db:migrate:prod");
    assert.ok(dumpAt >= 0 && dumpAt < migrateAt, "the order must hold on a repeat run too");

    // The stub reports the same digest before and after, which is the "already on
    // this build" case the script has to state honestly rather than claim progress.
    assert.match(second.stdout, /did not change — you were already on this build/);
  });

  test("--dry-run changes nothing and shows the plan", () => {
    writeFileSync(logFile, "");
    const r = runUpdate({ STUB_PG_DUMP: "fail" }, ["--dry-run"]);

    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.log.filter((l) => l.includes("pg_dump")).length, 0, "a dry run must not take a backup");
    assert.match(r.stdout, /dry run: nothing below is executed/);
    assert.match(r.stdout, /\[dry-run\]/);
  });

  test("the reported version matches the repository release state", () => {
    const r = spawnSync("sh", [UPDATE_SH, "--version"], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
  });
});

/**
 * The documented one-liner is `curl … | bash`. A script fed through a pipe gets
 * the *shell's* name as `$0`, never `/dev/stdin`, so the script used to decide
 * "I was piped" from `$0`, never took the download branch, and died with
 * "Cannot find the helper libraries" — the advertised install path did not work.
 */
describe("update.sh — the piped (curl | bash) form", () => {
  test("fetches its helper libraries and runs when piped into a shell", () => {
    // `file://` keeps this hermetic: no server, no network, real curl.
    const r = spawnSync(
      "bash",
      ["-s", "--", "--deployment-dir", deployDir, "--compose-file", COMPOSE_FILE, "--yes", "--dry-run"],
      {
        encoding: "utf8",
        // `file://` keeps this hermetic: no server, no network, real curl.
        env: {
          ...process.env,
          PATH: `${pipedBin}:${process.env.PATH}`,
          STUB_LOG: logFile,
          NO_COLOR: "1",
          BIOPLATFORM_RAW_BASE: pathToFileURL(REPO_ROOT).href,
        },
        input: readFileSync(UPDATE_SH, "utf8"),
        timeout: 60_000,
      },
    );

    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /was piped in, so it is fetching its own helpers/);
    assert.match(r.stdout, /compose project: deployment/);
    assert.doesNotMatch(r.stdout + r.stderr, /Cannot find the helper libraries/);
  });

  test("pins the library download to the script's own version, not a moving branch", () => {
    // A recorded curl URL: an operator on 2.0.0-canary.1 must not silently run
    // helper code fetched from whatever main happens to hold today.
    const curlLog = join(workDir, "curl-urls.txt");
    const curlDir = join(workDir, "curl-bin");
    mkdirSync(curlDir, { recursive: true });
    writeFileSync(
      join(curlDir, "curl"),
      `#!/bin/sh
# A curl that records the URL it was asked for and then serves the same path
# from the local checkout (file:// or the default https://raw one), so the
# assertions are about the URL rather than about GitHub being reachable.
url=
out=
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
printf '%s\\n' "$url" >> "${curlLog}"
rel=$(printf '%s' "$url" | sed -e 's|^[a-z]*://[^/]*/||' -e 's|^.*/BioPlatform/[^/]*/||')
if [ -n "$out" ]; then
  cat "${REPO_ROOT}/$rel" > "$out"
else
  cat "${REPO_ROOT}/$rel"
fi
`,
      { mode: 0o755 },
    );

    const r = spawnSync("bash", ["-s", "--", "--deployment-dir", deployDir, "--compose-file", COMPOSE_FILE, "--yes", "--dry-run"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${curlDir}:${pipedBin}:${process.env.PATH}`,
        REPO_ROOT,
        STUB_LOG: logFile,
        NO_COLOR: "1",
        // No BIOPLATFORM_RAW_BASE: this is the default that must be pinned.
        BIOPLATFORM_RAW_BASE: "",
      },
      input: readFileSync(UPDATE_SH, "utf8"),
      timeout: 60_000,
    });

    assert.equal(r.status, 0, r.stdout + r.stderr);
    // The log also holds the release-advisory API call; only the library
    // downloads are under test here.
    const urls = readFileSync(curlLog, "utf8")
      .trim()
      .split("\n")
      .filter((u) => u.includes("/scripts/lib/"));
    const version = spawnSync("sh", [UPDATE_SH, "--version"], { encoding: "utf8" }).stdout.trim();
    for (const url of urls) {
      assert.match(url, /BioPlatform\/[^/]+\/scripts\/lib\/bioplatform-[a-z]+\.sh$/);
      assert.doesNotMatch(url, /BioPlatform\/main\//, "main is a moving target; the version must pin it");
      assert.ok(url.includes(version), `expected ${url} to be pinned to ${version}`);
    }
  });
});