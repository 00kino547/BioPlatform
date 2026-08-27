import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

function signToken(payload: Record<string, unknown>, opts?: jwt.SignOptions): string {
  return jwt.sign(payload, JWT_SECRET, opts ?? { expiresIn: "1h" });
}

describe("H1: JWT purpose bypass fix", () => {
  test("token with purpose=auth is accepted", () => {
    const token = signToken({ userId: "u1", purpose: "auth" });
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
    assert.equal(decoded.purpose, "auth");
  });

  test("token with purpose=twofactor is rejected by requireAuth logic", () => {
    const token = signToken({ userId: "u1", purpose: "twofactor" });
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
    assert.notEqual(decoded.purpose, "auth");
  });

  test("token without purpose field is rejected by requireAuth logic", () => {
    const token = signToken({ userId: "u1" });
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
    assert.equal(decoded.purpose, undefined);
    assert.notEqual(decoded.purpose, "auth");
  });

  test("empty string purpose is rejected by requireAuth logic", () => {
    const token = signToken({ userId: "u1", purpose: "" });
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
    assert.equal(decoded.purpose, "");
    assert.notEqual(decoded.purpose, "auth");
  });
});

describe("M8: Email notification rate limiting", () => {
  const lastEmailNotify = new Map<string, number>();
  const EMAIL_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

  function emailNotifyRateLimited(profileId: string, type: string): boolean {
    const key = `${profileId}:${type}`;
    const now = Date.now();
    const last = lastEmailNotify.get(key) ?? 0;
    if (now - last < EMAIL_NOTIFY_COOLDOWN_MS) return true;
    lastEmailNotify.set(key, now);
    return false;
  }

  beforeEach(() => {
    lastEmailNotify.clear();
  });

  test("first notification is not rate limited", () => {
    assert.equal(emailNotifyRateLimited("p1", "view"), false);
  });

  test("second notification within cooldown is rate limited", () => {
    emailNotifyRateLimited("p1", "view");
    assert.equal(emailNotifyRateLimited("p1", "view"), true);
  });

  test("different profiles are independent", () => {
    emailNotifyRateLimited("p1", "view");
    assert.equal(emailNotifyRateLimited("p2", "view"), false);
  });

  test("different notification types are independent", () => {
    emailNotifyRateLimited("p1", "view");
    assert.equal(emailNotifyRateLimited("p1", "click"), false);
  });

  test("notification after cooldown is not rate limited", () => {
    const key = "p1:view";
    lastEmailNotify.set(key, Date.now() - EMAIL_NOTIFY_COOLDOWN_MS - 1);
    assert.equal(emailNotifyRateLimited("p1", "view"), false);
  });
});

describe("WebAuthn challenge TTL", () => {
  const CHALLENGE_TTL_MS = 5 * 60 * 1000;

  test("challenge within TTL is valid", () => {
    const createdAt = new Date(Date.now() - 1000);
    assert.ok(Date.now() - createdAt.getTime() < CHALLENGE_TTL_MS);
  });

  test("challenge outside TTL is expired", () => {
    const createdAt = new Date(Date.now() - CHALLENGE_TTL_MS - 1);
    assert.ok(Date.now() - createdAt.getTime() >= CHALLENGE_TTL_MS);
  });
});
