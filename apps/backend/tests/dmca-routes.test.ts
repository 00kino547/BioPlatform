import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcrypt";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";
import { resetAuthGuardSubthresholds } from "../src/lib/authGuard.js";
import { loadInstanceConfig, resetInstanceConfigForTests } from "../src/lib/instanceConfig.js";

// Covers the three public/authenticated DMCA endpoints. The properties that
// matter most here are the ones the appeal flow lives or dies by:
//
//   1. The attestation is REQUIRED, not decorative — § 512(c)(3) statements
//      collected after the fact are worth nothing.
//   2. /status and /appeal must answer for an account that is BOTH disabled and
//      consent-outdated, because both gates apply to every real claimant (the
//      policy bump shipped with this feature). If either gate leaked through
//      here the appeal screen would show a raw 403 instead of the form.
//   3. Everything is scoped to the caller: there is no report-by-id lookup.
describe("DMCA routes", () => {
  let server: Server;
  let baseUrl: string;
  let roleId = "";
  let claimantId = "";
  let disabledId = "";
  let tempConfigDir = "";

  const PASSWORD = "dmca-routes-passw0rd";

  /** The disabled/appeal state `/status` reports for the SPA. */
  interface DisabledState {
    disabled: boolean;
    disabledAt?: string | null;
    disabledReason?: string | null;
    appealSubmittedAt?: string | null;
    appealText?: string | null;
  }

  /** One row of the claimant's own report list — never anyone else's. */
  interface ReportedRow {
    id: string;
    status: string;
    workUrl?: string;
    createdAt?: string;
    handledAt?: string | null;
  }

  /** Envelope of the DMCA responses these assertions read. */
  interface DmcaBody {
    code?: string;
    error?: string;
    data?: {
      id?: string;
      status?: string;
      createdAt?: string;
      disabled?: DisabledState;
      reports?: ReportedRow[];
      [key: string]: unknown;
    };
  }

  async function request(path: string, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) ?? {};
    return { status: res.status, body: body as DmcaBody, headers: res.headers };
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  function signFor(userId: string): Promise<string> {
    return import("jsonwebtoken").then(({ default: jwt }) =>
      import("../src/config/env.js").then(({ getEnv }) =>
        jwt.sign({ userId, purpose: "auth", av: 0 }, getEnv().JWT_SECRET, { expiresIn: "1h" })
      )
    );
  }

  /** A complete, statute-shaped notice. Individual tests override one field. */
  function notice(overrides: Record<string, unknown> = {}) {
    return {
      claimantName: "Ada Lovelace",
      claimantEmail: "ada@claimant.test",
      workUrl: "https://claimant.test/works/analytical-engine",
      description: "The uploaded file is a verbatim copy of my copyrighted work.",
      infringingUrls: ["https://bio.test/ada"],
      goodFaith: true,
      accurate: true,
      signature: "Ada Lovelace",
      ...overrides,
    };
  }

  async function createUser(opts: {
    username: string;
    disabledAt?: Date | null;
    acceptedTos?: string | null;
    acceptedPrivacy?: string | null;
  }) {
    const user = await prisma.user.create({
      data: {
        username: opts.username,
        email: `${opts.username}@dmca-routes.test`,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: await bcrypt.hash(PASSWORD, 12),
        roleId,
        disabledAt: opts.disabledAt ?? null,
        disabledReason: opts.disabledAt ? "dmca" : null,
        acceptedTosVersion: opts.acceptedTos ?? POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: opts.acceptedPrivacy ?? POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
      },
    });
    return user;
  }

  before(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-routes.test" } } });
    await prisma.role.deleteMany({ where: { slug: "dmca_routes_user" } });
    await prisma.authBan.deleteMany();
    await prisma.authLog.deleteMany();
    resetAuthGuardSubthresholds();

    const role = await prisma.role.create({
      data: { name: "DMCA Routes User", slug: "dmca_routes_user", permissions: [] },
    });
    roleId = role.id;
    claimantId = (await createUser({ username: "dmca_route_claimant" })).id;
    disabledId = (await createUser({ username: "dmca_route_disabled", disabledAt: new Date() })).id;

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server.close();
    await once(server, "close");
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-routes.test" } } });
    await prisma.role.deleteMany({ where: { slug: "dmca_routes_user" } });
    resetInstanceConfigForTests();
    if (tempConfigDir) rmSync(tempConfigDir, { recursive: true, force: true });
  });

  test("accepts a fully attested notice and stores the attestation with it", async () => {
    const res = await request("/api/dmca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        notice({
          // Sanitization: HTML-like characters must never survive to storage.
          description: "Copy of <script>alert(1)</script> my book, chapter 3.",
          // A javascript: URL is not a location on this platform and must be dropped.
          infringingUrls: ["https://bio.test/ada", "javascript:alert(1)", "https://bio.test/ada/2"],
        })
      ),
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data?.status, "NEW");
    const reportId = res.body.data?.id;
    assert.ok(reportId, "the response must include the new report id");

    const stored = await prisma.dmcaReport.findUnique({ where: { id: reportId } });
    assert.ok(stored, "the report must be persisted");
    // The § 512(c)(3) statements and the signature travel WITH the notice.
    assert.match(stored!.description, /512\(c\)\(3\)/);
    assert.match(stored!.description, /penalty\s+of\s+perjury/);
    assert.match(stored!.description, /Signature: Ada Lovelace/);
    // ...and the claimant's own text is sanitized on the way in.
    assert.ok(!stored!.description.includes("<script>"));
    assert.ok(!stored!.description.includes("<"), "no HTML-like characters may be stored");

    const urls = stored!.infringingUrls as string[];
    assert.deepEqual(urls, ["https://bio.test/ada", "https://bio.test/ada/2"]);
    assert.ok(!urls.some((u) => u.startsWith("javascript:")));
    // Anonymous filing: no account attached, readable note for the operator.
    assert.equal(stored!.filedByUserId, null);
    assert.equal(stored!.contactNote, "Filed anonymously");
  });

  test("rejects a notice missing the good-faith attestation", async () => {
    const res = await request("/api/dmca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notice({ goodFaith: false })),
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    // Only the first actionable issue is surfaced; it must name the statement
    // the claimant has to tick rather than a generic validation error.
    assert.match(String(res.body.error), /good-faith/i);
  });

  test("rejects a notice with no signature", async () => {
    const res = await request("/api/dmca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notice({ signature: "" })),
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(String(res.body.error), /signature/i);
  });

  test("attributes a signed-in filing to the caller", async () => {
    const token = await signFor(claimantId);
    const res = await request("/api/dmca", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify(notice({ description: "Filed from my own account." })),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const signedInReportId = res.body.data?.id;
    assert.ok(signedInReportId, "the response must include the new report id");
    const stored = await prisma.dmcaReport.findUnique({ where: { id: signedInReportId } });
    assert.equal(stored!.filedByUserId, claimantId);
    assert.match(String(stored!.contactNote), /signed in as dmca_route_claimant/);
  });

  test("/status requires a token", async () => {
    const res = await request("/api/dmca/status");
    assert.equal(res.status, 401);
  });

  test("/status returns only the caller's own state and reports", async () => {
    const token = await signFor(claimantId);
    const res = await request("/api/dmca/status", { headers: auth(token) });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    assert.equal(res.body.data?.disabled?.disabled, false);
    const reports = res.body.data?.reports ?? [];
    assert.ok(reports.length >= 1, "the filing above must be visible to its filer");
    // Scoped to the caller: every row must be one they filed.
    const mine = await prisma.dmcaReport.findMany({ where: { filedByUserId: claimantId }, select: { id: true } });
    assert.deepEqual(reports.map((r) => r.id).sort(), mine.map((r) => r.id).sort());
    // Operator-only text must not leak to the claimant.
    const serialised = JSON.stringify(res.body.data?.reports);
    assert.ok(!serialised.includes("decisionNote"));
    assert.ok(!serialised.includes("counterNotice"));
  });

  test("/status works for an account that is BOTH disabled and consent-outdated", async () => {
    // This is the real-world state of every claimant: the policy re-consent bump
    // and the takedown shipped together. If either gate leaked through, the
    // appeal screen would render a raw 403 instead of the form.
    const stale = await createUser({
      username: "dmca_route_stale",
      disabledAt: new Date(),
      acceptedTos: "2020-01-01",
      acceptedPrivacy: "2020-01-01",
    });
    try {
      const token = await signFor(stale.id);
      const res = await request("/api/dmca/status", { headers: auth(token) });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data?.disabled?.disabled, true);

      // The appeal itself must be reachable from the very same state.
      const appeal = await request("/api/dmca/appeal", {
        method: "POST",
        headers: auth(token),
        body: JSON.stringify({ text: "I own the copyright, this is a mistake." }),
      });
      assert.equal(appeal.status, 200, JSON.stringify(appeal.body));

      const after = await request("/api/dmca/status", { headers: auth(token) });
      assert.ok(after.body.data?.disabled?.appealSubmittedAt, "the appeal must be recorded");
      assert.match(String(after.body.data?.disabled?.appealText), /this is a mistake/);
    } finally {
      await prisma.user.delete({ where: { id: stale.id } }).catch(() => undefined);
    }
  });

  test("a disabled account can appeal through the exempt route", async () => {
    const token = await signFor(disabledId);
    const res = await request("/api/dmca/appeal", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ text: "I am the rights holder." }),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const status = await request("/api/dmca/status", { headers: auth(token) });
    assert.equal(status.body.data?.disabled?.disabled, true);
    assert.ok(status.body.data?.disabled?.appealSubmittedAt);
  });

  test("appeal is refused for an account that is not disabled", async () => {
    const token = await signFor(claimantId);
    const res = await request("/api/dmca/appeal", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ text: "let me in" }),
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(String(res.body.error), /not disabled/i);
  });

  test("appeal requires a token", async () => {
    const res = await request("/api/dmca/appeal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "anonymous appeal" }),
    });
    assert.equal(res.status, 401);
  });

  test("intake can be switched off by the operator", async () => {
    tempConfigDir = mkdtempSync(join(tmpdir(), "dmca-intake-"));
    const configPath = join(tempConfigDir, "config.yml");
    writeFileSync(
      configPath,
      ["public:", "  policy:", "    dmca:", "      intakeEnabled: false", "      disabledAccountGraceDays: 30"].join("\n"),
      "utf8"
    );
    try {
      loadInstanceConfig(configPath);
      const res = await request("/api/dmca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notice()),
      });
      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.equal(res.body.code, "dmca_intake_disabled");
    } finally {
      // Restore defaults for the rate-limit test below.
      resetInstanceConfigForTests();
      rmSync(tempConfigDir, { recursive: true, force: true });
      tempConfigDir = "";
    }
  });

  test("public intake is limited to 5 per hour per IP", async () => {
    // The limiter is in-process and shared by every POST / in this file (they
    // all arrive from 127.0.0.1), so the exact attempt on which the 429 lands
    // depends on how many filed above. Six is the hard bound: at most five
    // submissions can ever be allowed in the window, so the sixth attempt —
    // whatever its position — must be refused.
    let sawRateLimit = false;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await request("/api/dmca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notice({ description: `Burst attempt ${attempt}` })),
      });
      lastStatus = res.status;
      if (res.status === 429) {
        sawRateLimit = true;
        assert.equal(res.body.code, "dmca_rate_limited");
        assert.ok(res.headers.get("Retry-After"), "429 must carry Retry-After");
        assert.ok(Number(res.headers.get("Retry-After")) > 0);
        break;
      }
      assert.equal(res.status, 201, `attempt ${attempt}: ${JSON.stringify(res.body)}`);
    }
    assert.ok(sawRateLimit, `the sixth attempt must be rate limited (last status ${lastStatus})`);
  });
});
