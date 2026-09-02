import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getEnv } from "../src/config/env.js";
import {
  isPasskeyResidencyFresh,
  passkeyResidencyCutoff,
  passkeyResidencyTtlMs,
} from "../src/lib/webauthn.js";

describe("Passkey residency verification (PASSKEY_RESIDENCY_TTL_DAYS)", () => {
  test("TTL matches the configured PASSKEY_RESIDENCY_TTL_DAYS", () => {
    assert.equal(passkeyResidencyTtlMs(), getEnv().PASSKEY_RESIDENCY_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  test("never-verified passkey (NULL) is stale", () => {
    assert.equal(isPasskeyResidencyFresh(null), false);
  });

  test("verification inside the TTL window is fresh", () => {
    assert.equal(
      isPasskeyResidencyFresh(new Date(Date.now() - passkeyResidencyTtlMs() + 60_000)),
      true,
    );
  });

  test("verification outside the TTL window is stale", () => {
    assert.equal(
      isPasskeyResidencyFresh(new Date(Date.now() - passkeyResidencyTtlMs() - 60_000)),
      false,
    );
  });

  test("future-dated verification is fresh", () => {
    assert.equal(isPasskeyResidencyFresh(new Date(Date.now() + 60_000)), true);
  });

  test("cutoff is exactly now minus the TTL", () => {
    const now = Date.now();
    const cutoff = passkeyResidencyCutoff().getTime();
    const expected = now - passkeyResidencyTtlMs();
    assert.ok(Math.abs(cutoff - expected) < 5_000);
  });
});