import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import app from "../src/app.js";
import {
  loadInstanceConfig,
  getPublicInstanceConfig,
  resetInstanceConfigForTests,
  parseInstanceConfig,
  tryAutoReloadOnce,
  startInstanceConfigWatcher,
  reloadSentinelPath,
} from "../src/lib/instanceConfig.js";
import { buildPolicyContext } from "../src/lib/policyContext.js";

// The instance-config loader is pure filesystem + zod, so this suite needs no
// database at all. The HTTP subtest boots the real app on an ephemeral port and
// hits GET /api/config the way the frontend does.

const dir = mkdtempSync(join(tmpdir(), "bioplatform-instance-config-"));
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(content: string): string {
  const file = join(dir, `config-${Math.random().toString(36).slice(2)}.yml`);
  writeFileSync(file, content, "utf8");
  return file;
}

const FULL_CONFIG = `
public:
  landing:
    tagline: "BioPlatform — your digital identity."
    hero:
      heading: "Your digital identity, beautifully crafted."
      subheading: "Links, themes and analytics in one page."
    footerAbout: "Self-hostable and open source."
  policy:
    operatorName: "ACME Cloud"
    operatorContact: "https://acme.example/contact"
    jurisdiction: "Spain"
  operational:
    announcement:
      message: "Scheduled maintenance Saturday 22:00 CET."
      href: "https://status.acme.example"
    hidePricing: true
  ads:
    enabled: true
    verificationMeta:
      - name: "google-site-verification"
        content: "ABCdef-verification-token"
    slots:
      - network: "adsense"
        placement: "below-links"
        params:
          adsense:
            client: "ca-pub-1111111111111111"
            slot: "1234567890"
            autoEnabled: false
      - network: "raw"
        placement: "below-links"
        params:
          raw: "<div class='ad'>track({x:1})<script src='https://cdn.example.invalid/ad.js'></script></div>"
private:
  operatorContactEmail: "legal@acme.example"
  ads:
    adsenseOauthToken: "SECRET_TOKEN-never-serialized"
`;

describe("instance config loading", () => {
  test("all fields populate from a valid file and private is held server-side", () => {
    const config = loadInstanceConfig(writeConfig(FULL_CONFIG));
    assert.equal(config.public.landing.tagline, "BioPlatform — your digital identity.");
    assert.equal(config.public.landing.hero.heading, "Your digital identity, beautifully crafted.");
    assert.equal(config.public.landing.hero.subheading, "Links, themes and analytics in one page.");
    assert.equal(config.public.landing.footerAbout, "Self-hostable and open source.");
    assert.equal(config.public.policy.operatorName, "ACME Cloud");
    assert.equal(config.public.policy.operatorContact, "https://acme.example/contact");
    assert.equal(config.public.policy.jurisdiction, "Spain");
    assert.equal(config.public.operational.announcement.message, "Scheduled maintenance Saturday 22:00 CET.");
    assert.equal(config.public.operational.announcement.href, "https://status.acme.example");
    assert.equal(config.public.operational.hidePricing, true);
    assert.equal(config.private.operatorContactEmail, "legal@acme.example");

    // Public ads: fully populated, raw snippet kept VERBATIM (the one
    // intentionally-unsanitized field), private.ads validated but held away.
    assert.equal(config.public.ads.enabled, true);
    assert.equal(config.public.ads.verificationMeta[0].content, "ABCdef-verification-token");
    assert.equal(config.public.ads.slots[0].network, "adsense");
    assert.equal(config.public.ads.slots[0].params?.adsense?.client, "ca-pub-1111111111111111");
    assert.equal(config.public.ads.slots[1].network, "raw");
    assert.ok(config.public.ads.slots[1].params?.raw?.includes("<div class='ad'>"));
    // Braces + angle brackets survive: the raw field bypasses the sanitizer.
    assert.ok(config.public.ads.slots[1].params?.raw?.includes("track({x:1})"));
    assert.equal(config.private.ads.adsenseOauthToken, "SECRET_TOKEN-never-serialized");

    // The public projection must never contain the private section.
    const pub = getPublicInstanceConfig();
    assert.equal((pub as Record<string, unknown>).private, undefined);
    assert.ok(!JSON.stringify(pub).includes("legal@acme.example"));
    assert.ok(!JSON.stringify(pub).includes("operatorContactEmail"));
    assert.ok(!JSON.stringify(pub).includes("SECRET_TOKEN-never-serialized"));
    assert.ok(!JSON.stringify(pub).includes("adsenseOauthToken"));
  });

  test("a missing file is the all-defaults state, not an error", () => {
    resetInstanceConfigForTests();
    const config = loadInstanceConfig(join(dir, "does-not-exist.yml"));
    assert.equal(config.public.landing.tagline, "");
    assert.equal(config.public.landing.hero.heading, "");
    assert.equal(config.public.policy.operatorName, "");
    assert.equal(config.public.operational.hidePricing, false);
    assert.equal(config.public.operational.announcement.message, "");
    assert.equal(config.private.operatorContactEmail, "");
  });

  test("an empty file also resolves to defaults", () => {
    resetInstanceConfigForTests();
    const config = loadInstanceConfig(writeConfig(""));
    assert.equal(config.public.landing.tagline, "");
    assert.equal(config.public.operational.hidePricing, false);
  });

  test("a directory at the config path is treated as absent, never a crash", () => {
    resetInstanceConfigForTests();
    const dirPath = join(dir, "is-a-dir");
    mkdirSync(dirPath, { recursive: true });
    const config = loadInstanceConfig(dirPath);
    assert.equal(config.public.landing.tagline, "");
  });

  test("HTML-like characters are stripped from authored strings", () => {
    const config = loadInstanceConfig(
      writeConfig(
        "public:\n  landing:\n    tagline: \"<b>Hi</b> {x} > y\"\n  operational:\n    hidePricing: false\n"
      )
    );
    assert.equal(config.public.landing.tagline, "bHi/b x  y");
  });

  test("a non-http href is rejected loudly at boot", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  operational:\n    announcement:\n      message: \"hi\"\n      href: \"javascript:alert(1)\"\n"
        )
      )
    );
  });

  test("an invalid private operator email is rejected loudly at boot", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "private:\n  operatorContactEmail: \"not-an-email\"\n"
        )
      )
    );
  });
});

describe("GET /api/config route", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    resetInstanceConfigForTests();
    loadInstanceConfig(writeConfig(FULL_CONFIG));
    const r = app.listen(0);
    server = r;
    return new Promise<void>((resolve) => r.on("listening", resolve)).then(() => {
      const addr = r.address();
      baseUrl = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
    });
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("serves exactly the public section, never private", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.landing.hero.heading, "Your digital identity, beautifully crafted.");
    assert.equal(body.data.operational.hidePricing, true);
    assert.equal(body.data.private, undefined);
    assert.ok(!JSON.stringify(body).includes("legal@acme.example"));
    assert.ok(!JSON.stringify(body).includes("operatorContactEmail"));
    assert.ok(!JSON.stringify(body).includes("SECRET_TOKEN-never-serialized"));
    // Ads are enabled in FULL_CONFIG: the payload carries the public ad config
    // (never the private secrets) plus the env-derived free-tier opt-out grant,
    // which defaults to false.
    assert.equal(body.data.ads.enabled, true);
    assert.equal(body.data.ads.freeOptOutAllowed, false);
    assert.equal(body.data.ads.slots[0].network, "adsense");
    assert.ok(body.data.ads.slots[1].params.raw.includes("<div class='ad'>"));
    // Route is deliberately public and cacheable (static, no reader identity).
    assert.match(String(res.headers.get("cache-control")), /max-age=60/);
  });
});

describe("policy snapshot operator identity", () => {
  test("buildPolicyContext re-exports public.policy as the legal operator", () => {
    resetInstanceConfigForTests();
    loadInstanceConfig(writeConfig(FULL_CONFIG));
    const ctx = buildPolicyContext();
    assert.equal(ctx.operator.name, "ACME Cloud");
    assert.equal(ctx.operator.contact, "https://acme.example/contact");
    assert.equal(ctx.operator.jurisdiction, "Spain");
    // The private mailbox must never leak through the policy snapshot.
    assert.ok(!JSON.stringify(ctx).includes("legal@acme.example"));
  });
});

describe("instance ads (public.ads + private.ads)", () => {
  test("valid script slot passes with its host from the registry allowlist", () => {
    const config = loadInstanceConfig(
      writeConfig(
        "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"adsterra\"\n        placement: \"below-links\"\n        params:\n          script:\n            src: \"https://a.magsrv.com/ad.js\"\n            token: \"1234567\"\n"
      )
    );
    assert.equal(config.public.ads.enabled, true);
    assert.equal(config.public.ads.slots[0].params?.script?.src, "https://a.magsrv.com/ad.js");
  });

  test("adsense slot without a client is rejected", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"adsense\"\n        params:\n          adsense:\n            slot: \"1234567890\"\n"
        )
      )
    );
  });

  test("adsense slot without slot or autoEnabled is rejected", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"adsense\"\n        params:\n          adsense:\n            client: \"ca-pub-1111111111111111\"\n"
        )
      )
    );
  });

  test("script-based network without a script.src is rejected", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"popads\"\n        params:\n          script:\n            token: \"ABC123\"\n"
        )
      )
    );
  });

  test("a script.src off the network's allowlist is rejected loudly", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"popads\"\n        params:\n          script:\n            src: \"https://evil.example/track.js\"\n"
        )
      )
    );
    // Cross-network src (adsterra host on a popads slot) is also off-list.
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"popads\"\n        params:\n          script:\n            src: \"https://a.magsrv.com/ad.js\"\n"
        )
      )
    );
  });

  test("raw network without an actual snippet is rejected", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"raw\"\n        params:\n          raw: \"\"\n"
        )
      )
    );
  });

  test("unknown network id is rejected", () => {
    assert.throws(() =>
      loadInstanceConfig(
        writeConfig(
          "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"totally-real-ad-network\"\n"
        )
      )
    );
  });

  test("raw snippet trumps canonical requirements (hybrid allowed)", () => {
    // An adsense network slot WITH raw content skips the client/slot checks.
    const config = loadInstanceConfig(
      writeConfig(
        "public:\n  ads:\n    enabled: true\n    slots:\n      - network: \"adsense\"\n        params:\n          raw: \"<ins data-ad-client='ca-pub-1' data-ad-slot='2'></ins>\"\n"
      )
    );
    assert.equal(config.public.ads.enabled, true);
    assert.ok(config.public.ads.slots[0].params?.raw?.includes("<ins"));
  });
});

describe("parseInstanceConfig (shared core)", () => {
  test("valid file and missing file both report ok with the right source", () => {
    const parsed = parseInstanceConfig(writeConfig(FULL_CONFIG));
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.source, "file");
      assert.equal(parsed.config.public.policy.operatorName, "ACME Cloud");
    }

    const absent = parseInstanceConfig(join(dir, "nope.yml"));
    assert.equal(absent.ok, true);
    if (absent.ok) {
      assert.equal(absent.source, "absent");
      assert.equal(absent.config.public.landing.tagline, "");
    }
  });

  test("invalid file reports ok:false with a readable error", () => {
    const bad = parseInstanceConfig(writeConfig("public:\n  operational:\n    hidePricing: not-a-bool\n"));
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.match(bad.error, /hidePricing/);
  });

  test("a top-level list or scalar is rejected, never silently defaulted", () => {
    // A5 regression: before this, `- one\n- two` and `just-a-scalar` parsed to
    // an array/string that `.public` indexed past, yielding an all-defaults
    // config with ok:true. A file that is not a mapping must fail loudly.
    const list = parseInstanceConfig(writeConfig("- one\n- two\n"));
    assert.equal(list.ok, false);
    if (!list.ok) assert.match(list.error, /mapping of keys/i);

    const scalar = parseInstanceConfig(writeConfig("just-a-scalar\n"));
    assert.equal(scalar.ok, false);
    if (!scalar.ok) assert.match(scalar.error, /mapping of keys/i);
  });
});

describe("hot reload of config.yml", () => {
  test("auto-reload applies an on-disk edit within a few polls", async () => {
    resetInstanceConfigForTests();
    const file = join(dir, "live.yml");
    writeFileSync(file, "public:\n  landing:\n    tagline: v1\n", "utf8");
    const stop = startInstanceConfigWatcher({ path: file, intervalMs: 40, autoReload: true });

    writeFileSync(file, "public:\n  landing:\n    tagline: v2 lazily edited\n", "utf8");
    await waitFor(() => getPublicInstanceConfig().landing.tagline === "v2 lazily edited");

    stop();
    // The snapshot keeps the reloaded value after the watcher is gone.
    assert.equal(getPublicInstanceConfig().landing.tagline, "v2 lazily edited");
  });

  test("a content-identical save is acked without touching the snapshot", async () => {
    resetInstanceConfigForTests();
    const file = join(dir, "same.yml");
    writeFileSync(file, "public:\n  landing:\n    tagline: same\n", "utf8");
    loadInstanceConfig(file);

    // Simulate an editor/spurious write that preserves content but bumps mtime.
    // Wait past the 1ms mtime granularity first: on a fast filesystem an
    // immediate utimes can share the floor(mtimeMs) of the boot read and be
    // skipped as a no-op (reloaded:false) — the race documented below.
    await sleep(5);
    const now = new Date();
    utimesSync(file, now, now);
    const before = JSON.stringify(getPublicInstanceConfig());
    const out = tryAutoReloadOnce(file);
    assert.equal(out.reloaded, true);
    assert.equal(out.changed, false);
    assert.equal(JSON.stringify(getPublicInstanceConfig()), before);
  });

  test("CONFIG_AUTO_RELOAD=false ignores manual edits but obeys an explicit reload", async () => {
    resetInstanceConfigForTests();
    const file = join(dir, "manual.yml");
    const sentinel = reloadSentinelPath(file);
    writeFileSync(file, "public:\n  landing:\n    tagline: static\n", "utf8");
    loadInstanceConfig(file);
    const stop = startInstanceConfigWatcher({ path: file, intervalMs: 40, autoReload: false });

    // A plain edit is ignored while auto-reload is off.
    writeFileSync(file, "public:\n  landing:\n    tagline: edited-ignored\n", "utf8");
    await sleep(150); // several poll cycles
    assert.equal(getPublicInstanceConfig().landing.tagline, "static");

    // The CLI path: validate then touch the sentinel -> applied regardless.
    writeFileSync(sentinel, "", { flag: "a" });
    try {
      await waitFor(() => getPublicInstanceConfig().landing.tagline === "edited-ignored");
    } finally {
      stop();
    }
  });

  test("an invalid reload keeps the last-good snapshot; fixing it self-heals", async () => {
    resetInstanceConfigForTests();
    const file = join(dir, "broken.yml");
    writeFileSync(file, "public:\n  landing:\n    tagline: good\n", "utf8");
    loadInstanceConfig(file);

    // Pin the mtime to the past so the very next write is unambiguously
    // "changed": on fast filesystems the load and the invalid write can land in
    // the same millisecond, and an identical floor(mtimeMs) reads as a no-op
    // (reloaded:false WITHOUT an error) — the race this suite used to flake on.
    const past = new Date(Date.now() - 1000);
    utimesSync(file, past, past);

    writeFileSync(file, "public:\n  operational:\n    announcement:\n      href: javascript:alert(1)\n", "utf8");
    const failed = tryAutoReloadOnce(file);
    assert.equal(failed.reloaded, false);
    assert.ok(failed.error);
    assert.equal(getPublicInstanceConfig().landing.tagline, "good");

    // Wait past the 1ms mtime granularity so the healed write is observable.
    await sleep(5);
    writeFileSync(file, "public:\n  landing:\n    tagline: healed\n", "utf8");
    const healed = tryAutoReloadOnce(file);
    assert.equal(healed.reloaded, true);
    assert.equal(healed.changed, true);
    assert.equal(getPublicInstanceConfig().landing.tagline, "healed");
  });
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(50);
  }
  assert.fail("condition not met within timeout");
}