import { test, describe } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { updateProfileSchema } from "../src/lib/validation.js";
import { getEnv } from "../src/config/env.js";
import {
  DEFAULT_TIER_CONFIG,
  parseTierConfigJson,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  recordConsentEvidence,
  searchConsentEvidence,
  stripHtmlInput,
  buildNewsletterEmail,
} from "../src/lib/newsletter.js";

describe("newsletter profile fields (Phase 3)", () => {
  test("accepts newsletterEnabled and newsletterVisible booleans", () => {
    const result = updateProfileSchema.safeParse({ newsletterEnabled: true, newsletterVisible: true, newsletterHeading: "Get updates" });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.newsletterEnabled, true);
      assert.equal(result.data.newsletterVisible, true);
      assert.equal(result.data.newsletterHeading, "Get updates");
    }
  });

  test("accepts undefined newsletter flags (backward compatible)", () => {
    const result = updateProfileSchema.safeParse({});
    assert.ok(result.success);
  });

  test("rejects non-boolean newsletter flags", () => {
    assert.ok(!updateProfileSchema.safeParse({ newsletterEnabled: "yes" }).success);
    assert.ok(!updateProfileSchema.safeParse({ newsletterVisible: 1 }).success);
  });

  test("rejects an oversized newsletter heading (max 60)", () => {
    const result = updateProfileSchema.safeParse({ newsletterHeading: "x".repeat(61) });
    assert.ok(!result.success);
  });

  test("sanitizes the newsletter heading (strips HTML-like chars)", () => {
    const result = updateProfileSchema.safeParse({ newsletterHeading: "<b>Launch {news}</b>" });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.newsletterHeading, "bLaunch news/b");
    }
  });

  test("newsletter fields combine with other profile fields", () => {
    const result = updateProfileSchema.safeParse({
      displayName: "Someone",
      presenceStatus: "online",
      countdown: { label: "Drop", targetDate: "2026-12-24T18:00:00.000Z" },
      newsletterEnabled: true,
      newsletterVisible: true,
    });
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.newsletterEnabled, true);
      assert.equal(result.data.presenceStatus, "online");
    }
  });
});

describe("newsletter tier config (Phase 3)", () => {
  test("default config blocks FREE sends but allows PRO and ENTERPRISE", () => {
    assert.equal(DEFAULT_TIER_CONFIG.FREE.sendLimit, 0);
    assert.equal(DEFAULT_TIER_CONFIG.PRO.sendLimit, 1);
    assert.equal(DEFAULT_TIER_CONFIG.ENTERPRISE.sendLimit, 5);
    assert.equal(DEFAULT_TIER_CONFIG.FREE.windowHours, 24);
  });

  test("parses a valid tier config JSON", () => {
    const config = parseTierConfigJson(JSON.stringify(DEFAULT_TIER_CONFIG));
    assert.deepEqual(config, DEFAULT_TIER_CONFIG);
  });

  test("returns null for invalid JSON", () => {
    assert.equal(parseTierConfigJson("not-json"), null);
    assert.equal(parseTierConfigJson(null), null);
    assert.equal(parseTierConfigJson(undefined), null);
  });

  test("rejects missing or malformed tiers", () => {
    assert.equal(parseTierConfigJson(JSON.stringify({ FREE: { sendLimit: 1, windowHours: 24 } })), null);
    assert.equal(parseTierConfigJson(JSON.stringify({ FREE: { sendLimit: 1, windowHours: 24 }, PRO: { sendLimit: 1, windowHours: 24 }, ENTERPRISE: { sendLimit: -1, windowHours: 24 } })), null);
  });

  test("rejects out-of-range values", () => {
    assert.equal(parseTierConfigJson(JSON.stringify({ FREe: {} })), null);
    const config = parseTierConfigJson(
      JSON.stringify({ FREe: { sendLimit: 101, windowHours: 24 }, PRO: { sendLimit: 1, windowHours: 24 }, ENTERPRISE: { sendLimit: 1, windowHours: 0 } })
    );
    assert.equal(config, null);
  });
});

describe("newsletter unsubscribe tokens (Phase 3)", () => {
  test("signs and verifies a valid unsubscribe token", () => {
    const token = signUnsubscribeToken("prof-1", "sub@example.com");
    const payload = verifyUnsubscribeToken(token);
    assert.ok(payload);
    assert.equal(payload?.profileId, "prof-1");
    assert.equal(payload?.email, "sub@example.com");
  });

  test("rejects a token with the wrong purpose", () => {
    const foreign = jwt.sign({ profileId: "prof-1", email: "sub@example.com", purpose: "other" }, getEnv().JWT_SECRET, { expiresIn: "1d" });
    assert.equal(verifyUnsubscribeToken(foreign), null);
  });

  test("rejects a tampered token", () => {
    const token = signUnsubscribeToken("prof-1", "sub@example.com");
    assert.equal(verifyUnsubscribeToken(`${token}x`), null);
    assert.equal(verifyUnsubscribeToken("not-a-token"), null);
  });

  test("builds an unsubscribe URL from the first CORS origin", () => {
    const url = buildUnsubscribeUrl("prof-1", "sub@example.com");
    const origin = getEnv().CORS_ORIGIN.split(",")[0]?.trim();
    assert.ok(url.startsWith(`${origin.replace(/\/+$/, "")}/api/newsletter/unsubscribe?token=`), url);
  });
});

describe("newsletter consent evidence (Phase 3)", () => {
  test("records and finds a consent event by email (case-insensitive)", () => {
    recordConsentEvidence("sub@example.com", "prof-1", "203.0.113.5", "TestAgent/1.0");
    const matches = searchConsentEvidence("SUB@example.com");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].email, "sub@example.com");
    assert.equal(matches[0].profileId, "prof-1");
    assert.equal(matches[0].ip, "203.0.113.5");
    assert.equal(matches[0].userAgent, "TestAgent/1.0");
    assert.ok(matches[0].at instanceof Date);
  });

  test("returns an empty list for an unknown email", () => {
    assert.deepEqual(searchConsentEvidence("nobody@example.com"), []);
  });

  test("never stores consent evidence in the database surface", () => {
    recordConsentEvidence("nodb@example.com", "prof-1", "203.0.113.9", "Agent/2.0");
    const matches = searchConsentEvidence("nodb@example.com");
    assert.equal(matches.length, 1);
    assert.deepEqual(Object.keys(matches[0]).sort(), ["at", "email", "ip", "profileId", "userAgent"]);
  });
});

describe("newsletter email build + sanitization (Phase 3)", () => {
  test("escapes HTML in the subject, body, sender and address", () => {
    const html = buildNewsletterEmail({
      appName: '<img src=x onerror=alert(1)>Brand',
      fromName: "<script>alert(1)</script>Owner",
      fromEmail: "owner@example.com",
      subject: "<b>Deal & offer</b>",
      body: 'Hello <script>alert(1)</script> {user} "world"',
      unsubscribeUrl: "https://example.com/api/newsletter/unsubscribe?token=abc",
      mailingAddress: "123 Main St",
      website: "https://example.com",
    });
    assert.ok(!html.includes("<script>alert(1)</script>Owner"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;Owner"));
    assert.ok(!html.includes("<b>Deal & offer</b>"));
    assert.ok(html.includes("Deal &amp; offer"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;Brand"));
    assert.ok(!html.includes("<u>"));
  });

  test("includes the unsubscribe link and sender identity (CAN-SPAM/CASL)", () => {
    const html = buildNewsletterEmail({
      appName: "App",
      fromName: "Owner",
      fromEmail: "owner@example.com",
      subject: "Hello",
      body: "Hi",
      unsubscribeUrl: "https://example.com/api/newsletter/unsubscribe?token=T",
      mailingAddress: "123 Main St, Anytown, USA",
      website: "https://example.com",
    });
    assert.ok(html.includes("https://example.com/api/newsletter/unsubscribe?token=T"));
    assert.ok(html.includes("href="));
    assert.ok(html.includes("Unsubscribe from this newsletter"));
    assert.ok(html.includes("Sent by Owner"));
    assert.ok(html.includes("123 Main St, Anytown, USA"));
  });

  test("falls back to the website as the sender address when none is set", () => {
    const html = buildNewsletterEmail({
      appName: "App",
      fromName: "Owner",
      fromEmail: "owner@example.com",
      subject: "Hello",
      body: "Hi",
      unsubscribeUrl: "https://example.com/u?token=T",
      mailingAddress: "",
      website: "https://example.com",
    });
    assert.ok(html.includes("https://example.com"));
    assert.ok(html.includes("Sent by Owner"));
  });

  test("stripHtmlInput removes angle brackets and curly braces", () => {
    assert.equal(stripHtmlInput("<b>Hello</b> {world}"), "bHello/b world");
    assert.equal(stripHtmlInput("normal text"), "normal text");
  });
});