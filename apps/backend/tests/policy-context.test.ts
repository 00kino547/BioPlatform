import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPolicyContext } from "../src/lib/policyContext.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

// The /privacy and /terms pages are driven entirely by the public policy
// context snapshot, so the guarantees that matter are:
//   1. the shape is stable and the invariants hold (local sign-in, custom
//      domains, versions matching the consent records),
//   2. it leaks no secrets — this is an unauthenticated endpoint,
//   3. the rendered pages stay escaped (no dangerouslySetInnerHTML).

const POLICY_FILES = ["Privacy.tsx", "Terms.tsx", "PolicyShell.tsx"].map((name) =>
  fileURLToPath(new URL(`../../frontend/src/${name === "PolicyShell.tsx" ? "components/legal/" : "pages/"}${name}`, import.meta.url))
);

describe("policy context", () => {
  test("exposes the expected top-level shape", () => {
    const ctx = buildPolicyContext();
    assert.deepEqual(Object.keys(ctx).sort(), [
      "analytics",
      "auth",
      "captcha",
      "commerce",
      "domains",
      "email",
      "integrations",
      "payments",
      "storage",
      "versions",
    ]);
  });

  test("mirrors the policy versions recorded on the consent record", () => {
    const ctx = buildPolicyContext();
    assert.equal(ctx.versions.tos, POLICY_VERSIONS.tos);
    assert.equal(ctx.versions.privacy, POLICY_VERSIONS.privacy);
    // Must stay a plain YYYY-MM-DD so the frontend formatter and the backend
    // deemed-acceptance cutoff agree.
    assert.match(ctx.versions.tos, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("invariants: local sign-in and custom domains are always available", () => {
    const ctx = buildPolicyContext();
    assert.equal(ctx.auth.localSignIn, true);
    assert.equal(ctx.domains.customDomains, true);
  });

  test("PocketBase is reported as a sign-in provider, never as analytics or storage", () => {
    const ctx = buildPolicyContext();
    // The analytics/storage payload must be entirely Matomo + the platform's
    // own storage; a PocketBase key appearing here would mean the removed
    // module crept back into the public contract.
    assert.deepEqual(Object.keys(ctx.analytics).sort(), ["enabled", "provider"]);
    assert.ok(["none", "matomo"].includes(ctx.analytics.provider));
    assert.ok(["local", "r2", "b2", "s3"].includes(ctx.storage.provider));
    assert.equal(typeof ctx.storage.thirdParty, "boolean");
    assert.deepEqual(Object.keys(ctx.auth).sort(), [
      "localSignIn",
      "pocketbaseConfigured",
      "pocketbaseSignIn",
      "sso",
    ]);
  });

  test("crypto gateway coins are only listed when a crypto gateway is configured", () => {
    const ctx = buildPolicyContext();
    // NOTE: `payments.crypto` is a crypto PAYMENT GATEWAY (BTCPay & similar),
    // which is not the same thing as crypto tipping. Tipping is per-profile and
    // always available — see the `commerce` assertions below.
    if (ctx.payments.crypto) {
      assert.ok(ctx.payments.cryptoCoins.length > 0, "crypto gateway must list at least one coin");
      for (const coin of ctx.payments.cryptoCoins) assert.match(coin, /^[A-Z0-9]+$/);
    } else {
      assert.deepEqual(ctx.payments.cryptoCoins, []);
    }
  });

  test("shop and tipping are never reported as instance-level switches", () => {
    const ctx = buildPolicyContext();
    // Neither feature has an instance toggle, so both must always be present.
    // The legal pages used to claim "tipping is not enabled on this instance"
    // purely because no crypto gateway was configured, which was wrong.
    assert.equal(ctx.commerce.shop, true);
    assert.equal(ctx.commerce.tips, true);
    assert.deepEqual(Object.keys(ctx.commerce).sort(), [
      "shop",
      "shopPaidCheckout",
      "tipCoins",
      "tipRail",
      "tips",
    ]);
    // Tip coins come from the app's own TIP_COINS constant, so they are present
    // regardless of CRYPTO_ENABLED.
    assert.ok(ctx.commerce.tipCoins.length > 0, "tip coins must never be empty");
    for (const coin of ctx.commerce.tipCoins) assert.match(coin, /^[A-Z]{3,5}$/);
    assert.ok(["btcpay", "address"].includes(ctx.commerce.tipRail));
    // Paid checkout needs a real gateway, and must never claim one when the
    // gateway list is empty.
    if (!ctx.payments.stripe && !ctx.payments.paypal && !ctx.payments.crypto) {
      assert.equal(ctx.commerce.shopPaidCheckout, false);
    }
    // Tipping still works with no gateway at all (straight to the wallet).
    if (!ctx.payments.crypto) assert.equal(ctx.commerce.tipRail, "address");
  });

  test("matomo cannot be reported as enabled unless the provider is matomo", () => {
    const ctx = buildPolicyContext();
    if (ctx.analytics.provider !== "matomo") assert.equal(ctx.analytics.enabled, false);
    // The URL and site id must never be echoed to the client.
    assert.equal("matomoUrl" in ctx.analytics, false);
    assert.equal("matomoSiteId" in ctx.analytics, false);
  });

  test("leaks no configured secrets", () => {
    const serialised = JSON.stringify(buildPolicyContext());
    // Any secret that is present in the environment must not appear anywhere in
    // the public payload. This is the regression guard for the endpoint being
    // unauthenticated.
    const secretVars = [
      "JWT_SECRET",
      "POCKETBASE_ADMIN_PASSWORD",
      "POCKETBASE_ADMIN_EMAIL",
      "POCKETBASE_URL",
      "SMTP_PASS",
      "SMTP_USER",
      "SMTP_HOST",
      "S3_SECRET_ACCESS_KEY",
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET",
      "DISCORD_BOT_TOKEN",
      "DISCORD_CLIENT_SECRET",
      "CAPTCHA_SECRET_KEY",
      "CAPTCHA_SITE_KEY",
      "ADMIN_PASSWORD",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "PAYPAL_CLIENT_SECRET",
      "PAYPAL_CLIENT_ID",
      "SSO_GOOGLE_CLIENT_SECRET",
      "SSO_GITHUB_CLIENT_SECRET",
      "DISCORD_REDIRECT_URI",
      "SSO_CALLBACK_URL",
    ];
    for (const key of secretVars) {
      const value = process.env[key];
      if (!value || value.length < 6) continue; // skip empty/default-short values
      assert.equal(serialised.includes(value), false, `policy context must not contain ${key}`);
    }
  });

  test("policy pages render as text, never as injected HTML", () => {
    for (const file of POLICY_FILES) {
      const source = readFileSync(file, "utf8");
      assert.equal(source.includes("dangerouslySetInnerHTML"), false, `${file} must not use dangerouslySetInnerHTML`);
    }
  });

  // The instance owner decided a disabled capability must disappear from the
  // legal text completely, rather than being announced as absent. So the pages
  // must never contain a "this is switched off / not configured" sentence.
  //
  // Comments are stripped first: the source legitimately *discusses* these
  // phrases when explaining why the wording avoids them, and a naive scan would
  // fail on its own documentation.
  test("policy pages never disclose a disabled capability", () => {
    const FORBIDDEN = [
      /switched off/,
      /not enabled/,
      /is not configured/,
      /no payment provider/i,
      /no payment processor/i,
      /no third-party or self-hosted sign-in provider/i,
      /optional(?:ly)? enable/i,
      /disabled on this instance/i,
    ];

    for (const file of POLICY_FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const pattern of FORBIDDEN) {
        const match = source.match(pattern);
        assert.equal(
          match,
          null,
          `${file} must not disclose a disabled capability, found: ${match?.[0]}`
        );
      }
    }
  });
});

/**
 * Removes block and line comments so a source scan only sees code. Not a
 * general-purpose parser: it is good enough for the two legal page files,
 * which contain no regex literals containing comment markers.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
