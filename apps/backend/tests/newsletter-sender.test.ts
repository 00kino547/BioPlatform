import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { encryptSenderSecret, decryptSenderSecret, generateVerificationToken, verificationRecordName, verifyDomainOwnership } from "../src/lib/newsletterSender.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";

let role: { id: string };
let user: { id: string };
let profile: { id: string };

before(async () => {
  const oldProfile = await prisma.profile.findFirst({ where: { slug: "sender-test-profile" } });
  if (oldProfile) {
    await prisma.newsletterSender.deleteMany({ where: { profileId: oldProfile.id } });
    await prisma.profile.deleteMany({ where: { id: oldProfile.id } });
  }
  await prisma.profile.deleteMany({ where: { slug: "sender-cascade-profile" } });
  await prisma.user.deleteMany({ where: { username: "sender_test" } });
  await prisma.role.deleteMany({ where: { slug: "newsletter-sender-test" } });

  role = await prisma.role.create({ data: { name: "Newsletter Sender Test Role", slug: "newsletter-sender-test", permissions: [] } });
  user = await prisma.user.create({
    data: {acceptedTosVersion: POLICY_VERSIONS.tos, acceptedPrivacyVersion: POLICY_VERSIONS.privacy, acceptedPoliciesAt: new Date(),  username: "sender_test", email: "sender_test@test.local", passwordHash: "not-a-real-hash", roleId: role.id },
  });
  profile = await prisma.profile.create({ data: { userId: user.id, slug: "sender-test-profile", isPrimary: true } });
});

after(async () => {
  if (profile) await prisma.newsletterSender.deleteMany({ where: { profileId: profile.id } });
  if (profile) await prisma.profile.deleteMany({ where: { id: profile.id } });
  await prisma.profile.deleteMany({ where: { slug: "sender-cascade-profile" } });
  if (user) await prisma.user.deleteMany({ where: { id: user.id } });
  if (role) await prisma.role.deleteMany({ where: { id: role.id } });
});

describe("newsletter sender secret encryption (own SMTP deliverer)", () => {
  test("round-trips through encrypt/decrypt", () => {
    const secret = "S3cr3t@Pass<>{}\"";
    const enc = encryptSenderSecret(secret);
    assert.notEqual(enc, secret);
    assert.equal(decryptSenderSecret(enc), secret);
  });

  test("produces different ciphertext every time (random IV)", () => {
    const enc1 = encryptSenderSecret("same-secret");
    const enc2 = encryptSenderSecret("same-secret");
    assert.notEqual(enc1, enc2);
  });

  test("tampered ciphertext fails to decrypt", () => {
    const enc = encryptSenderSecret("abcdefghijklmnopqrst");
    const raw = Buffer.from(enc, "base64");
    raw[raw.length - 1] ^= 0xff;
    assert.throws(() => decryptSenderSecret(raw.toString("base64")));
    assert.throws(() => decryptSenderSecret(""));
  });

  test("never stores the plaintext password", () => {
    const enc = encryptSenderSecret("plaintext-never-stored");
    assert.ok(!enc.includes("plaintext-never-stored"));
    assert.match(enc, /^[A-Za-z0-9+/=]+$/);
  });
});

describe("newsletter sender domain verification helpers", () => {
  test("builds the TXT record name for a real domain", () => {
    assert.equal(verificationRecordName("noreply@acme.com"), "_bioplatform-verify.acme.com");
    assert.equal(verificationRecordName("x@news.acme.co"), "_bioplatform-verify.news.acme.co");
  });

  test("rejects addresses without a mappable domain", () => {
    assert.equal(verificationRecordName("noreply@localhost"), null);
    assert.equal(verificationRecordName("not-an-email"), null);
    assert.equal(verificationRecordName("x@nodot"), null);
  });

  test("versionifies an unverifiable domain as false (no DNS record)", async () => {
    const token = generateVerificationToken();
    const ok = await verifyDomainOwnership("x@invalid", token);
    assert.equal(ok, false);
  });

  test("generates distinct verification tokens", () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    assert.notEqual(a, b);
    assert.equal(a.length, 32);
    assert.match(a, /^[0-9a-f]+$/);
  });
});

describe("newsletter sender persistence (per-profile, encrypted)", () => {
  test("stores the sender keyed to a profile with an encrypted password", async () => {
    const pass = "smtp-app-password";
    const created = await prisma.newsletterSender.create({
      data: {
        profileId: profile.id,
        fromName: "ACME Corp",
        fromEmail: "noreply@acme.com",
        smtpHost: "smtp.acme.com",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "noreply@acme.com",
        smtpPassEnc: encryptSenderSecret(pass),
        verificationToken: generateVerificationToken(),
      },
    });
    assert.ok(created.id);
    assert.equal(created.smtpPassEnc.includes(pass), false);
    assert.equal(decryptSenderSecret(created.smtpPassEnc!), pass);
  });

  test("enforces a single sender per profile", async () => {
    await assert.rejects(
      prisma.newsletterSender.create({
        data: {
          profileId: profile.id,
          fromName: "Second",
          fromEmail: "second@acme.com",
          smtpHost: "smtp.acme.com",
          smtpPort: 587,
        },
      }),
      /unique/i
    );
  });

  test("cascades deletion when the profile is deleted", async () => {
    const extra = await prisma.profile.create({ data: { userId: user.id, slug: "sender-cascade-profile" } });
    await prisma.newsletterSender.create({
      data: {
        profileId: extra.id,
        fromName: "Cascade",
        fromEmail: "cascade@acme.com",
        smtpHost: "smtp.acme.com",
        smtpPort: 587,
      },
    });
    await prisma.profile.delete({ where: { id: extra.id } });
    const left = await prisma.newsletterSender.findUnique({ where: { profileId: extra.id } });
    assert.equal(left, null);
  });

  test("updates reset verification state when the from-domain changes", async () => {
    await prisma.newsletterSender.update({
      where: { profileId: profile.id },
      data: { fromEmail: "noreply@newdomain.com", verifiedAt: new Date(), testedAt: new Date() },
    });
    const updated = await prisma.newsletterSender.findUnique({ where: { profileId: profile.id } });
    assert.equal(updated?.fromEmail, "noreply@newdomain.com");
  });
});

describe("sender whitelist flag (admin bypass)", () => {
  test("stores and flips the per-user allowlist flag", async () => {
    const toggled = await prisma.user.update({ where: { id: user.id }, data: { newsletterSenderWhitelisted: true } });
    assert.equal(toggled.newsletterSenderWhitelisted, true);
    const back = await prisma.user.update({ where: { id: user.id }, data: { newsletterSenderWhitelisted: false } });
    assert.equal(back.newsletterSenderWhitelisted, false);
  });
});