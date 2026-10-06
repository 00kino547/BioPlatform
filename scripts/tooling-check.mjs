#!/usr/bin/env node
// Tooling reliability / corruption diagnostic harness.
//
// Purpose: give future agents (and the owner) one reliable oracle that answers:
//   1. did the command actually run?
//   2. did it succeed (REAL exit code, not a swallowed/assumed one)?
//   3. what stdout did it produce (byte count + summary)?
//   4. what stderr did it produce (byte count + summary)?
//   5. did the test runner genuinely execute only what was requested?
//
// The opencode bash tool truncates very long output (>2000 lines / >51200
// bytes); this harness therefore prints a SHORT summary per probe and writes a
// full machine-readable JSON report to a temp file whose path is printed.
//
// Exit code is 0 only when every probe passes, so `pnpm tooling:check` can be
// scripted/CI'd without parsing output.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = join(repo, "apps", "backend");

const results = [];
const reportPath = join(mkdtempSync(join(tmpdir(), "bioplatform-tooling-")), "report.json");

// Run a command capturing stdout and stderr SEPARATELY, recording byte counts
// and the real exit code so a caller can always tell which stream held what.
function run(label, cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? repo,
    encoding: "utf8",
    timeout: opts.timeout ?? 120_000,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  const pass = opts.expectFail ? res.status !== 0 : res.status === 0;
  results.push({
    label,
    cmd: [cmd, ...args].join(" "),
    exit: res.status,
    signal: res.signal ?? null,
    stdoutBytes: Buffer.byteLength(res.stdout ?? "", "utf8"),
    stderrBytes: Buffer.byteLength(res.stderr ?? "", "utf8"),
    stdoutHead: (res.stdout ?? "").split("\n").slice(0, 6).join("\n"),
    stderrHead: (res.stderr ?? "").split("\n").slice(0, 6).join("\n"),
    pass,
  });
  return res;
}

// Probe: core binaries are present and report versions (real exit codes).
function probeVersion(label, cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  results.push({
    label,
    cmd: [cmd, ...args].join(" "),
    exit: res.status,
    stdoutBytes: Buffer.byteLength(res.stdout ?? "", "utf8"),
    stderrBytes: Buffer.byteLength(res.stderr ?? "", "utf8"),
    stdoutHead: (res.stdout ?? "").trim().slice(0, 60),
    pass: res.status === 0,
  });
}

// Pin the ACTUAL `rtk rewrite` contract. Its own help documents exit 0 for
// rewritable commands and exit 1 otherwise, but the installed rtk 0.44.2
// returns exit 3 (with the replacement on stdout) for rewritable commands.
// The opencode plugin uses `.nothrow()`, so it tolerates this; direct hooks
// following the documented `rtk rewrite "$CMD" || exit 0` contract would treat
// every rewrite as a failure. This probe reports the observed behavior so the
// quirk stays visible instead of silently breaking downstream scripts.
function probeRtkRewrite() {
  const res = spawnSync("rtk", ["rewrite", "git status"], { encoding: "utf8" });
  const rewritten = (res.stdout ?? "").trim();
  results.push({
    label: "rtk rewrite contract (git status)",
    cmd: "rtk rewrite git status",
    exit: res.status,
    stdoutBytes: Buffer.byteLength(rewritten, "utf8"),
    stderrBytes: Buffer.byteLength(res.stderr ?? "", "utf8"),
    stdoutHead: rewritten,
    // Informational probe: the observed exit code (0/1 vs 3) cannot be fixed
    // from this repo (rtk is an external binary). Always "passes" the repo
    // gate but pins the real behavior in the printed note.
    pass: true,
    note:
      res.status === 0 || res.status === 1
        ? "exit matches documented contract (0=rewritten, 1=none)"
        : `observed exit=${res.status} (docs say 0/1) — external to this repo; opencode plugin tolerates via .nothrow()`,
  });
}

// Probe: is a repo-root .env present? setup-env.ts now tolerates absence, but
// local dev/docker still need one.
function probeDotEnv() {
  const envPath = join(repo, ".env");
  const ok = existsSync(envPath);
  results.push({
    label: "repo .env present",
    cmd: `test -f ${envPath}`,
    exit: ok ? 0 : 1,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutHead: ok ? "" : "missing — tests still run via setup-env.ts fallback",
    pass: true,
  });
}

// Probe: can the test database be reached at 127.0.0.1:5432?
function probeDb(host = "127.0.0.1", port = 5432) {
  return new Promise((resolveOk) => {
    const sock = net.connect({ host, port });
    const t = setTimeout(() => {
      sock.destroy();
      resolveOk(false);
    }, 4000);
    sock.once("connect", () => {
      clearTimeout(t);
      sock.destroy();
      resolveOk(true);
    });
    sock.once("error", () => {
      clearTimeout(t);
      sock.destroy();
      resolveOk(false);
    });
  });
}

// Probe: does `test:one` execute ONLY the requested file? Writes a throwaway
// probe test with a unique name, runs `test:one` on a DIFFERENT file, asserts
// the probe's unique marker never appears in the output, then cleans up.
function probeTargetedRun() {
  const marker = `TOOLING_ISOLATION_MARKER_${Date.now()}`;
  const probeFile = join(backend, "tests", `__tooling_probe_${Date.now()}.test.ts`);
  writeFileSync(
    probeFile,
    `import { test } from "node:test";\nimport assert from "node:assert/strict";\n\ntest(${JSON.stringify(marker)}, () => { assert.equal(1, 1); });\n`,
  );
  let res;
  try {
    res = spawnSync(
      "pnpm",
      ["--filter", "@bioplatform/backend", "test:one", "tests/oauth.test.ts"],
      { cwd: repo, encoding: "utf8", timeout: 180_000 },
    );
  } finally {
    rmSync(probeFile, { force: true });
  }
  const stdout = res.stdout ?? "";
  const countMatch = stdout.match(/ℹ tests (\d+)/);
  const ranCount = countMatch ? Number(countMatch[1]) : 0;
  const leaked = stdout.includes(marker);
  const pass = res.status === 0 && !leaked && ranCount > 0;
  results.push({
    label: "targeted runner isolation (test:one)",
    cmd: "pnpm --filter @bioplatform/backend test:one tests/oauth.test.ts",
    exit: res.status,
    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
    stderrBytes: Buffer.byteLength(res.stderr ?? "", "utf8"),
    stdoutHead: `reported ${ranCount} tests; probe marker leaked: ${leaked}`,
    pass,
    note: pass ? "isolated: only the requested file executed" : "isolation BROKEN — check the test:one script",
  });
  return ranCount;
}

function probeSampleSuite() {
  const res = spawnSync(
    "pnpm",
    ["--filter", "@bioplatform/backend", "test:one", "tests/oauth.test.ts"],
    { cwd: repo, encoding: "utf8", timeout: 180_000 },
  );
  const stdout = res.stdout ?? "";
  const countMatch = stdout.match(/ℹ tests (\d+)/);
  const failMatch = stdout.match(/ℹ fail (\d+)/);
  const ranCount = countMatch ? Number(countMatch[1]) : 0;
  const failed = failMatch ? Number(failMatch[1]) : -1;
  const pass = res.status === 0 && ranCount > 0 && failed === 0;
  results.push({
    label: "sample suite genuinely executed (test:one, oauth.test.ts)",
    cmd: "pnpm --filter @bioplatform/backend test:one tests/oauth.test.ts",
    exit: res.status,
    stdoutBytes: Buffer.byteLength(stdout, "utf8"),
    stderrBytes: Buffer.byteLength(res.stderr ?? "", "utf8"),
    stdoutHead: `reported ${ranCount} tests, ${failed} failed`,
    pass,
    note: pass ? "runner produced real results on stdout" : "runner did NOT genuinely execute — investigate",
  });
}

await (async () => {
  probeVersion("git --version", "git", ["--version"]);
  probeVersion("node --version", "node", ["--version"]);
  probeVersion("pnpm --version", "pnpm", ["--version"]);
  probeRtkRewrite();
  probeDotEnv();

  const dbUp = await probeDb();
  results.push({
    label: "test DB reachable (127.0.0.1:5432)",
    cmd: "net connect 127.0.0.1:5432",
    exit: dbUp ? 0 : 1,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutHead: dbUp ? "reachable" : "unreachable — run `docker compose up -d postgres` first",
    pass: dbUp,
  });

  probeSampleSuite();
  probeTargetedRun();
})();

const failures = results.filter((r) => r.pass === false);
// The DB-reachability probe is informational (uses docker-compose, not the
// repo); it must not fail the gate. Everything else must genuinely pass.
const informational = new Set(["test DB reachable (127.0.0.1:5432)"]);
const gateFailures = failures.filter((r) => !informational.has(r.label));
writeFileSync(reportPath, JSON.stringify(results, null, 2));

console.log("=== tooling-check ===");
for (const r of results) {
  const tag = r.pass === false ? (informational.has(r.label) ? "info" : "FAIL") : " ok ";
  console.log(`[${tag}] ${r.label} exit=${r.exit} out=${r.stdoutBytes}B err=${r.stderrBytes}B`);
  if (r.stdoutHead) console.log(`        stdout: ${r.stdoutHead.replace(/\n/g, " | ").slice(0, 140)}`);
  if (r.stderrHead) console.log(`        stderr: ${r.stderrHead.replace(/\n/g, " | ").slice(0, 140)}`);
  if (r.note) console.log(`        note: ${r.note}`);
}
console.log(`\n${results.length} probes, ${gateFailures.length} gate failures. Full JSON: ${reportPath}`);
process.exit(gateFailures.length > 0 ? 1 : 0);