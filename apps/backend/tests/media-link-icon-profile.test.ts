import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { POLICY_VERSIONS } from "../src/lib/newsletter.js";
import { removeMediaFile } from "../src/lib/dmca.js";

// A4 regression — the link-icon upload route hardcoded `profileId: null`, so the
// media row carried no profile and a later takedown could not strip the stale
// `socialLinks[].image` reference. The route must resolve the owned profile.

// A real 1x1 PNG (valid magic bytes AND decodable by sharp for the pHash).
const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC";

describe("A4: link-icon uploads are bound to the owning profile", () => {
  let server: Server;
  let baseUrl: string;
  let roleId: string;
  let userId: string;
  let profileId: string;
  let token: string;

  before(async () => {
    await prisma.mediaFile.deleteMany({ where: { user: { email: { endsWith: "@linkicon.test" } } } });
    await prisma.profile.deleteMany({ where: { user: { email: { endsWith: "@linkicon.test" } } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@linkicon.test" } } });
    await prisma.role.deleteMany({ where: { slug: "linkicon_user" } });

    const role = await prisma.role.create({ data: { name: "Link Icon", slug: "linkicon_user", permissions: [] } });
    roleId = role.id;

    const stamp = Date.now();
    const user = await prisma.user.create({
      data: {
        acceptedTosVersion: POLICY_VERSIONS.tos,
        acceptedPrivacyVersion: POLICY_VERSIONS.privacy,
        acceptedPoliciesAt: new Date(),
        username: `linkicon_${stamp}`,
        email: `linkicon_${stamp}@linkicon.test`,
        passwordHash: "not-a-real-hash",
        roleId,
      },
    });
    userId = user.id;

    const profile = await prisma.profile.create({
      data: { userId, slug: `linkicon_${stamp}`, isPrimary: true },
    });
    profileId = profile.id;

    token = jwt.sign({ userId, purpose: "auth" }, getEnv().JWT_SECRET, { expiresIn: "7d" });

    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    server?.close();
    await prisma.mediaFile.deleteMany({ where: { userId } });
    await prisma.profile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { slug: "linkicon_user" } });
  });

  test("upload records profileId and a later takedown clears the socialLinks image", async () => {
    const png = Buffer.from(PNG_1X1_B64, "base64");
    const form = new FormData();
    form.append("linkIcon", new Blob([png], { type: "image/png" }), "icon.png");

    const res = await fetch(`${baseUrl}/api/profiles/me/link-icon?profileId=${profileId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; data?: { image?: string } } | null;
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.ok(body?.data?.image, "upload returns the /uploads path");

    const filePath = body!.data!.image!;
    const rec = await prisma.mediaFile.findFirst({ where: { filePath, userId } });
    assert.ok(rec, "the media row was recorded");
    assert.equal(rec!.kind, "LINK_ICON");
    assert.equal(rec!.profileId, profileId, "the route must bind the upload to the owned profile");

    // Attach the icon to a social link, then run the takedown cleanup.
    await prisma.profile.update({
      where: { id: profileId },
      data: { socialLinks: [{ platform: "github", url: "https://github.com/example", image: filePath }] },
    });
    await removeMediaFile({
      id: rec!.id,
      kind: rec!.kind,
      filePath: rec!.filePath,
      profileId: rec!.profileId,
    } as Parameters<typeof removeMediaFile>[0]);

    const after = await prisma.profile.findUnique({ where: { id: profileId } });
    const links = (after!.socialLinks ?? []) as Array<Record<string, unknown>>;
    assert.ok(!links.some((l) => "image" in l), "the stale socialLinks image must be removed");
  });
});
