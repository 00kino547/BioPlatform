import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { updateProfileSchema } from "../src/lib/validation.js";

function parseLinks(input: unknown) {
  return updateProfileSchema.safeParse({ socialLinks: input });
}

describe("socialLinks extended fields (sections, icons, QR)", () => {
  test("accepts heading, icon, image and showQr on a valid link", () => {
    const result = parseLinks([
      {
        platform: "github",
        url: "https://github.com/me",
        heading: "Code",
        icon: "🛠️",
        showQr: true,
      },
      {
        platform: "youtube",
        url: "https://youtube.com/@me",
        image: "/uploads/abc-123.png",
        showQr: false,
      },
    ]);
    assert.ok(result.success, result.error?.issues[0]?.message ?? "expected success");
    if (result.success) {
      const links = result.data.socialLinks;
      assert.deepEqual(links![0], {
        platform: "github",
        url: "https://github.com/me",
        heading: "Code",
        icon: "🛠️",
        showQr: true,
      });
      assert.deepEqual(links![1], {
        platform: "youtube",
        url: "https://youtube.com/@me",
        image: "/uploads/abc-123.png",
        showQr: false,
      });
    }
  });

  test("sanitizes and trims heading and icon", () => {
    const result = parseLinks([
      {
        platform: "twitter",
        url: "https://x.com/me",
        heading: "  My <Section> {Widget}  ",
        icon: " 🚀 ",
      },
    ]);
    assert.ok(result.success, result.error?.issues[0]?.message ?? "");
    if (result.success) {
      assert.equal(result.data.socialLinks![0].heading, "My Section Widget");
      assert.equal(result.data.socialLinks![0].icon, "🚀");
    }
  });

  test("empty heading and icon become undefined", () => {
    const result = parseLinks([
      { platform: "github", url: "https://github.com/me", heading: "  ", icon: "" },
    ]);
    assert.ok(result.success);
    if (result.success) {
      const link = result.data.socialLinks![0];
      assert.equal(link.heading, undefined);
      assert.equal(link.icon, undefined);
    }
  });

  test("rejects an image path outside /uploads/", () => {
    const result = parseLinks([
      { platform: "github", url: "https://github.com/me", image: "https://evil.example/x.png" },
    ]);
    assert.ok(!result.success);
  });

  test("rejects a javascript: image path", () => {
    const result = parseLinks([
      { platform: "github", url: "https://github.com/me", image: "/uploads/x.png/../../x" },
    ]);
    assert.ok(!result.success);
  });

  test("rejects a malformed upload path", () => {
    const result = parseLinks([
      { platform: "github", url: "https://github.com/me", image: "/uploads/..%2f..%2fetc/passwd" },
    ]);
    assert.ok(!result.success);
  });

  test("rejects an oversized heading (max 48)", () => {
    const result = parseLinks([
      { platform: "github", url: "https://github.com/me", heading: "h".repeat(49) },
    ]);
    assert.ok(!result.success);
  });

  test("rejects an oversized icon (max 24)", () => {
    const result = parseLinks([
      { platform: "github", url: "https://github.com/me", icon: "x".repeat(25) },
    ]);
    assert.ok(!result.success);
  });

  test("keeps existing platform/url validation strict", () => {
    assert.ok(!parseLinks([{ platform: "myspace", url: "https://example.com" }]).success);
    assert.ok(!parseLinks([{ platform: "github", url: "javascript:alert(1)" }]).success);
    assert.ok(parseLinks([{ platform: "email", url: "hello@example.com" }]).success);
  });

  test("still limits to 10 links", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      platform: "github",
      url: `https://github.com/user${i}`,
    }));
    assert.ok(!parseLinks(many).success);
  });

  test("non-boolean showQr is rejected", () => {
    const result = parseLinks([
      { platform: "github", url: "https://github.com/me", showQr: "yes" },
    ]);
    assert.ok(!result.success);
  });
});