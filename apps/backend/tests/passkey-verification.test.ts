import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { generateLoginOptions } from "../src/lib/webauthn.js";

// A3: a passkey used as a SECOND factor must demand biometric/PIN user
// verification — "required" at challenge time and never disabled at verify
// time — otherwise 2FA degrades to a device-press presence check.
describe("A3: passkey two-factor enforces user verification", () => {
  let userId: string;

  before(async () => {
    // Delete users first: rows referencing a role violate the FK and would
    // otherwise make role.deleteMany throw on a second run (this test leaks
    // its own user/role otherwise).
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    const role = await prisma.role.create({ data: { name: "User", slug: "user", permissions: [] } });
    const user = await prisma.user.create({
      data: {
        username: `passkey2fa_${Date.now()}`,
        email: `passkey2fa_${Date.now()}@test.local`,
        passwordHash: "not-a-real-hash",
        roleId: role.id,
      },
    });
    userId = user.id;
  });

  test("two-factor challenge demands user verification", async () => {
    const options = await generateLoginOptions({
      userId,
      allowCredentials: [],
      userVerification: "discouraged",
      purpose: "twofactor",
    });
    assert.equal(options.userVerification, "required");
  });

  test("primary login keeps the caller's preference", async () => {
    const options = await generateLoginOptions({
      userId,
      allowCredentials: [],
      userVerification: "preferred",
      purpose: "login",
    });
    assert.equal(options.userVerification, "preferred");
  });
});