import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import app from "../src/app.js";
import { CONSENT_COOKIE } from "../src/lib/privacy.js";

// Do Not Track used to make the cookie preferences control unusable, in two ways
// that compounded:
//
//   1. The banner returned null whenever DNT was set, *before* checking whether
//      the visitor had explicitly opened it, so the footer link set state that
//      rendered nothing. With DNT on by default in several browsers, the button
//      was simply dead for those visitors.
//   2. Even with the banner visible, the endpoint stored `essential` no matter
//      what the visitor chose. Combined with the client trusting its own request
//      instead of the response, the UI claimed analytics were allowed while the
//      cookie said otherwise: "Accept all" could be pressed forever and nothing
//      would change.
//
// DNT is now a default, not a veto: it applies until the visitor decides, and an
// explicit decision is recorded as given.

let server: Server;
let baseUrl: string;

/** DNT is per-request, so it has to be set on every call that cares about it. */
function headers(dnt: boolean, extra: Record<string, string> = {}) {
  return { ...extra, ...(dnt ? { DNT: "1" } : {}) };
}

function post(body: unknown, dnt: boolean) {
  return fetch(`${baseUrl}/api/privacy/consent`, {
    method: "POST",
    headers: headers(dnt, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

function get(dnt: boolean) {
  return fetch(`${baseUrl}/api/privacy/consent`, { headers: headers(dnt) });
}

/** The consent cookie is what analytics actually depends on, not the JSON body. */
function consentCookie(res: Response): string | undefined {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.split(";")[0];
}

describe("privacy cookie consent", () => {
  before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    const addr = server.address();
    baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("Do Not Track defaults a visitor who has chosen nothing to essential-only", async () => {
    const res = await get(true);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.dnt, true);
    assert.equal(body.data.effective, "essential");
  });

  test("a visitor without DNT is undecided until they choose", async () => {
    const res = await get(false);
    const body = await res.json();
    assert.equal(body.data.dnt, false);
    assert.equal(body.data.effective, "unknown");
  });

  test("an explicit accept is recorded even under Do Not Track", async () => {
    const res = await post({ decision: "accept" }, true);
    const body = await res.json();
    assert.equal(res.status, 200);
    // The response, not the request, is the decision that was stored.
    assert.equal(body.data.consent, "accept");
    assert.equal(body.data.effective, "accept");
    assert.equal(consentCookie(res), `${CONSENT_COOKIE}=accept`);
  });

  test("an explicit essential-only choice is recorded under Do Not Track", async () => {
    const res = await post({ decision: "essential" }, true);
    const body = await res.json();
    assert.equal(body.data.consent, "essential");
    assert.equal(consentCookie(res), `${CONSENT_COOKIE}=essential`);
  });

  test("accept without Do Not Track still works", async () => {
    const res = await post({ decision: "accept" }, false);
    assert.equal((await res.json()).data.consent, "accept");
  });

  test("the decision and the stored cookie can never disagree", async () => {
    for (const dnt of [true, false]) {
      for (const decision of ["accept", "essential"]) {
        const res = await post({ decision }, dnt);
        const body = await res.json();
        assert.equal(body.data.consent, decision);
        assert.equal(consentCookie(res), `${CONSENT_COOKIE}=${decision}`);
      }
    }
  });

  test("an invalid decision is rejected instead of silently defaulted", async () => {
    const res = await post({ decision: "maybe" }, false);
    assert.equal(res.status, 400);
  });

  test("revoking clears the choice so the banner asks again", async () => {
    await post({ decision: "accept" }, false);
    const res = await fetch(`${baseUrl}/api/privacy/consent/revoke`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.consent, "unknown");
    assert.equal(
      res.headers.getSetCookie().some((c) => c.startsWith(`${CONSENT_COOKIE}=;`)),
      true,
    );
  });
});