import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";
import {
  disableAccount,
  reactivateAccount,
  submitAppeal,
  purgeDisabledAccounts,
} from "../src/lib/dmca.js";

// A2 regression — `purgeDisabledAccounts` must never destroy an account that has
// an OPEN (unreviewed) appeal. The bug: `disableAccount` did not clear the appeal
// record from an earlier disable/re-activate cycle, so `appealReviewedAt` stayed
// non-null and the purge's OR-clause treated a freshly re-disabled account (with
// a new, unreviewed appeal) as "no open appeal" and deleted it.

const FAR_PAST = new Date("2000-01-01T00:00:00Z");

describe("A2: purge pauses for an open appeal even after a disable cycle", () => {
  let roleId: string;

  async function makeUser(prefix: string) {
    const stamp = Date.now() + Math.random().toString(36).slice(2, 7);
    return prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: `${prefix}_${stamp}`,
        email: `${prefix}_${stamp}@dmca-purge.test`,
        passwordHash: "not-a-real-hash",
        roleId,
      },
    });
  }

  before(async () => {
    await prisma.dmcaReport.deleteMany({ where: { claimantEmail: { endsWith: "@dmca-purge.test" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-purge.test" } } });
    await prisma.role.deleteMany({ where: { slug: "dmca_purge_user" } });
    const role = await prisma.role.create({ data: { name: "Purge User", slug: "dmca_purge_user", permissions: [] } });
    roleId = role.id;
  });

  after(async () => {
    await prisma.dmcaReport.deleteMany({ where: { claimantEmail: { endsWith: "@dmca-purge.test" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@dmca-purge.test" } } });
    await prisma.role.deleteMany({ where: { slug: "dmca_purge_user" } });
  });

  test("reactivateAccount does NOT stamp the user's own filed reports", async () => {
    // A3 regression. The account is disabled (as a takedown target) AND it had
    // filed an unrelated NEW report as a claimant. Reactivating it must record
    // the decision on the user only — never write an "Account re-activated" note
    // onto that user's own unreviewed filing (filedByUserId is the claimant, not
    // the account the takedown acted against).
    const user = await makeUser("reporter");
    const report = await prisma.dmcaReport.create({
      data: {
        claimantName: "Reporter",
        claimantEmail: `${user.username}@dmca-purge.test`,
        workUrl: "https://claimant.example/work",
        description: "an unrelated report filed by the same account",
        infringingUrls: [],
        filedByUserId: user.id,
        status: "NEW",
      },
    });

    await disableAccount(user.id, "dmca");
    await reactivateAccount(user.id, "reviewed — restored");

    const after = await prisma.dmcaReport.findUnique({ where: { id: report.id } });
    assert.equal(after!.decisionNote, null, "the user's filed report must not be annotated");
    assert.equal(after!.status, "NEW", "the report's status is untouched");

    // The decision itself lives on the user.
    const reviewed = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(reviewed!.appealDecision, "reviewed — restored");
    assert.ok(reviewed!.appealReviewedAt);
  });

  test("disableAccount clears the previous cycle's appeal review", async () => {
    const user = await makeUser("cycle");
    await disableAccount(user.id, "dmca");
    await reactivateAccount(user.id, "first review done");

    const reviewed = await prisma.user.findUnique({ where: { id: user.id } });
    assert.ok(reviewed!.appealReviewedAt, "reactivation records the review");

    await disableAccount(user.id, "dmca");
    const reDisabled = await prisma.user.findUnique({ where: { id: user.id } });
    assert.ok(reDisabled!.disabledAt, "account is disabled again");
    assert.equal(reDisabled!.appealReviewedAt, null, "stale review marker must be cleared on re-disable");
    assert.equal(reDisabled!.appealSubmittedAt, null);
  });

  test("a re-disabled account with a new unreviewed appeal survives the purge", async () => {
    const user = await makeUser("appeal");
    // Full cycle: disable -> reactivate (sets appealReviewedAt) -> disable again.
    await disableAccount(user.id, "dmca");
    await reactivateAccount(user.id, "first review done");
    await disableAccount(user.id, "dmca");

    // Age the disable past the grace window, then file a fresh appeal.
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: FAR_PAST } });
    await submitAppeal(user.id, "Please review — this is my own work.");

    const deleted = await purgeDisabledAccounts(new Date());
    assert.ok(deleted >= 0, "purge runs");
    const survivor = await prisma.user.findUnique({ where: { id: user.id } });
    assert.ok(survivor, "the account must still exist while its appeal is unreviewed");
  });

  test("a disabled account with no appeal is still purged after the grace window", async () => {
    const user = await makeUser("noappeal");
    await disableAccount(user.id, "dmca");
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: FAR_PAST } });

    const deleted = await purgeDisabledAccounts(new Date());
    assert.ok(deleted >= 1, "no open appeal -> the account is purged");
    const gone = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(gone, null);
  });
});
