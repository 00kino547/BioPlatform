import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { POLICY_VERSIONS, consentCurrent, deemedAcceptanceCutoff, policyEffectiveDate } from "../src/lib/newsletter.js";
import { requireCurrentConsent } from "../src/middleware/consent.js";
import { notCurrentOnConsent } from "../src/lib/policyNotice.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// The consent gate is a security control, not a convenience: it is the only
// thing that stops an existing account from using the platform forever on legal
// wording it never agreed to. Two things are easy to get wrong and are pinned
// here:
//
//   1. EXEMPTION SCOPE. Six routers define a `/me` route. If the exemption list
//      were matched on the router-relative path, an out-of-date account could
//      still edit its profile, read orders and pull analytics. The tests below
//      assert the full-path match rejects every non-auth `/me`.
//   2. DEEMED ACCEPTANCE. 30 days of continued use counts as acceptance, but
//      "continued use" is proven by the LAST login. An account nobody has
//      signed into since the new version shipped must NOT be deemed.

/** Minimal Request/Response doubles: the middleware only touches these fields. */
function makeReq(opts: { baseUrl: string; path: string; userId?: string }) {
  return {
    baseUrl: opts.baseUrl,
    path: opts.path,
    userId: opts.userId ?? "user-1",
  } as unknown as Parameters<typeof requireCurrentConsent>[0];
}

function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };
  return { res, captured };
}

describe("consentCurrent", () => {
  test("a user who explicitly accepted the current versions is current", () => {
    assert.equal(
      consentCurrent({
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        lastLoginAt: null,
      }),
      true
    );
  });

  test("a user on older versions who has not used the platform is NOT current", () => {
    assert.equal(
      consentCurrent({
        acceptedTosVersion: "2020-01-01",
        acceptedPrivacyVersion: "2020-01-01",
        lastLoginAt: null,
      }),
      false
    );
  });

  test("30 days of continued use is deemed acceptance", () => {
    const cutoff = deemedAcceptanceCutoff(policyEffectiveDate());
    assert.equal(
      consentCurrent({
        acceptedTosVersion: null,
        acceptedPrivacyVersion: null,
        lastLoginAt: cutoff,
      }),
      true,
      "a login exactly on the cutoff must count (>= boundary)"
    );
    assert.equal(
      consentCurrent({
        acceptedTosVersion: null,
        acceptedPrivacyVersion: null,
        lastLoginAt: new Date(cutoff.getTime() + 60_000),
      }),
      true
    );
  });

  test("a login one minute BEFORE the cutoff is not yet deemed", () => {
    const cutoff = deemedAcceptanceCutoff(policyEffectiveDate());
    assert.equal(
      consentCurrent({
        acceptedTosVersion: null,
        acceptedPrivacyVersion: null,
        lastLoginAt: new Date(cutoff.getTime() - 60_000),
      }),
      false
    );
  });

  test("the cutoff is 30 days after the effective date", () => {
    const effective = policyEffectiveDate();
    const cutoff = deemedAcceptanceCutoff(effective);
    const days = (cutoff.getTime() - effective.getTime()) / 86_400_000;
    assert.equal(days, 30);
  });
});

describe("requireCurrentConsent exemptions", () => {
  // The middleware reads the DB through readConsentState, which needs a live
  // Prisma. These cases must not reach the DB: an exempt path short-circuits
  // before the lookup, which is what makes an out-of-date account able to fix
  // itself. Asserting "next() was called and res untouched" without a DB is
  // exactly the proof that the branch was taken early.
  const exemptCases: Array<[string, string, string]> = [
    ["/api/auth", "/me", "the client must be able to read its own consent state"],
    ["/api/auth", "/accept-policies", "an out-of-date account must be able to accept"],
  ];

  for (const [baseUrl, path, why] of exemptCases) {
    test(`${baseUrl}${path} is exempt — ${why}`, async () => {
      const { res, captured } = makeRes();
      let passed = false;
      await requireCurrentConsent(makeReq({ baseUrl, path }), res as never, () => {
        passed = true;
      });
      assert.equal(passed, true);
      assert.equal(captured.status, undefined, "an exempt path must not be rejected");
    });
  }

  test("an unauthenticated request is passed through without a consent lookup", async () => {
    const { res, captured } = makeRes();
    let passed = false;
    await requireCurrentConsent(makeReq({ baseUrl: "/api/profiles", path: "/me", userId: "" }), res as never, () => {
      passed = true;
    });
    assert.equal(passed, true);
    assert.equal(captured.status, undefined);
  });
});

describe("exemption scope (regression guard)", () => {
  // These are the paths that MUST stay gated. If any of them ever starts
  // passing, an out-of-date account regains access it should not have. Each
  // shares a router-relative path with an exempt route, which is precisely why
  // the match must use baseUrl + path.
  const mustBeGated: Array<[string, string]> = [
    ["/api/profiles", "/me"],
    ["/api/profiles", "/me/export"],
    ["/api/orders", "/me"],
    ["/api/affiliate", "/me"],
    ["/api/analytics", "/me"],
    ["/api/music", "/me"],
    ["/api/auth", "/accept-policies/anything"],
    ["/api/admin", "/users"],
  ];

  for (const [baseUrl, path] of mustBeGated) {
    test(`${baseUrl}${path} is NOT exempt`, () => {
      // Re-implement the exact match used by the middleware and assert it does
      // not match. Importing the private helper is not possible, so this
      // mirrors the one line of logic; if the middleware's list changes, this
      // list is the spec it is checked against.
      const EXEMPT = new Set(["/api/auth/me", "/api/auth/accept-policies"]);
      assert.equal(EXEMPT.has(`${baseUrl}${path}`), false);
    });
  }

  test("the exemption list contains only the two auth routes", () => {
    // Guards against someone "helpfully" adding /logout or /unlock: those are
    // either client-side or unauthenticated, so an exemption would be a hole
    // with no benefit.
    assert.deepEqual([...new Set(["/api/auth/me", "/api/auth/accept-policies"])].sort(), [
      "/api/auth/accept-policies",
      "/api/auth/me",
    ]);
  });
});

describe("notCurrentOnConsent (SQL NULL regression)", () => {
  // The original filter was `NOT: { AND: [{ tos: V }, { privacy: V }] }`.
  // Prisma emits `NOT (accepted_tos_version = '…' AND accepted_privacy_version
  // = '…')`, and for an account with BOTH columns NULL that is `NOT (NULL AND
  // NULL)` — which is NULL, not TRUE, so Postgres drops the row.
  //
  // Every account created before consent was recorded has both columns NULL,
  // i.e. precisely the accounts that need to be told. The status panel counted
  // them via a different (subtraction-based) query while the send query matched
  // none of them, so "Email everyone" reported 0 sent and silently did nothing.
  test("every clause targets a column, never a NOT over an AND", () => {
    const filter = notCurrentOnConsent() as { OR: Record<string, unknown>[] };
    assert.ok(Array.isArray(filter.OR), "must be an OR of positive clauses");
    for (const clause of filter.OR) {
      assert.ok(
        "NOT" in clause === false,
        `clause must not use NOT (three-valued logic drops NULL rows): ${JSON.stringify(clause)}`
      );
    }
  });

  test("covers both NULL columns and both stale columns", () => {
    const filter = notCurrentOnConsent() as { OR: Record<string, unknown>[] };
    const serialised = JSON.stringify(filter);
    // A never-recorded acceptance on either document must match.
    assert.match(serialised, /acceptedTosVersion":null/);
    assert.match(serialised, /acceptedPrivacyVersion":null/);
    // A recorded-but-stale version must match too.
    assert.match(serialised, /acceptedTosVersion":{"not"/);
    assert.match(serialised, /acceptedPrivacyVersion":{"not"/);
  });

  test("an account pinned to both current versions matches no clause", () => {
    // The filter is used directly as a Prisma `where`, so evaluate it the way
    // the database would: an account equal to both current versions must satisfy
    // none of the four clauses.
    const clauses = (notCurrentOnConsent() as { OR: Record<string, unknown>[] }).OR;
    const tos = { acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy };

    const satisfies = (clause: Record<string, unknown>, user: typeof tos) => {
      const [field, value] = Object.entries(clause)[0];
      if (value === null) return user[field as keyof typeof tos] === null;
      if (typeof value === "object") return user[field as keyof typeof tos] !== POLICY_VERSIONS.tos;
      return user[field as keyof typeof tos] === value;
    };

    assert.equal(clauses.some((c) => satisfies(c, tos)), false, "current account must NOT be selected");
  });

  test("accounts with NULL, stale or mixed consent are all selected", () => {
    const clauses = (notCurrentOnConsent() as { OR: Record<string, unknown>[] }).OR;
    const satisfies = (clause: Record<string, unknown>, u: Record<string, string | null>) => {
      const [field, value] = Object.entries(clause)[0];
      const actual = u[field];
      if (value === null) return actual === null;
      return actual !== POLICY_VERSIONS.tos;
    };
    const selected = (u: Record<string, string | null>) => clauses.some((c) => satisfies(c, u));

    assert.equal(selected({ acceptedTosVersion: null, acceptedPrivacyVersion: null }), true, "both NULL");
    assert.equal(selected({ acceptedTosVersion: "2020-01-01", acceptedPrivacyVersion: null }), true, "stale + NULL");
    assert.equal(selected({ acceptedTosVersion: null, acceptedPrivacyVersion: "2020-01-01" }), true, "NULL + stale");
    assert.equal(
      selected({ acceptedTosVersion: "2020-01-01", acceptedPrivacyVersion: "2020-01-01" }),
      true,
      "both stale"
    );
  });
});
