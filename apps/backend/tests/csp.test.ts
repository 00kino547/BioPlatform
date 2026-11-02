// CSP generation tests — ads.ts registry hosts only appear for CONFIGURED
// networks; disabled ads carry ZERO ad hosts; raw snippets are hash-pinned
// per inline script body; and the nginx include file is written atomically.

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  buildCspHeader,
  rawSnippetInlineHashes,
  renderNginxCspConf,
  writeNginxCspConf,
} from "../src/lib/csp.js";
import { resetEnvForTests } from "../src/config/env.js";

const NO_ADS = { enabled: false, slots: [] };

describe("buildCspHeader — ads disabled", () => {
  const csp = buildCspHeader(NO_ADS);

  test("carries zero network hosts anywhere", () => {
    for (const marker of [
      "magsrv", "adsterra", "aads", "popads", "propellerads",
      "hilltopads", "media.net", "infolinks", "googlesyndication",
      "doubleclick",
    ]) {
      assert.equal(csp.includes(marker), false, `ad host fragment "${marker}" must be absent when ads are disabled`);
    }
  });

  test("keeps the non-ad feature hosts", () => {
    const parsed = Object.fromEntries(csp.split("; ").map((d) => [d.slice(0, d.indexOf(" ")), d]));
    assert.ok(parsed["script-src"]!.includes("https://www.youtube.com"));
    assert.ok(parsed["img-src"]!.includes("https://cdn.discordapp.com"));
    assert.ok(parsed["frame-src"]!.includes("https://open.spotify.com"));
    assert.ok(parsed["connect-src"]!.includes("'self'"));
  });

  test("keeps the hardening directives", () => {
    assert.ok(csp.startsWith("default-src 'self';"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'self'"));
    assert.ok(csp.includes("base-uri 'self'"));
    assert.ok(csp.includes("form-action 'self'"));
  });
});

describe("buildCspHeader — enabled with one Adsterra canonical slot", () => {
  const csp = buildCspHeader({
    enabled: true,
    slots: [{ network: "adsterra", params: {} }],
  });

  test("contains ONLY the configured network's hosts", () => {
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    assert.ok(scriptSrc!.includes("https://a.magsrv.com"));
    assert.ok(scriptSrc!.includes("https://www.highperformanceformat.com"));
    assert.ok(scriptSrc!.includes("https://www.adsterra.com"));
    // Sibling networks that are NOT configured must be absent everywhere.
    for (const absent of ["popads", "ad", "hilltopads", "media.net"]) {
      assert.ok(!csp.includes(`https://${absent}.com`), `unconfigured host ${absent} leaked`);
    }
  });

  test("never enables inline execution", () => {
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    assert.ok(!scriptSrc!.includes("unsafe-inline"));
  });
});

describe("rawSnippetInlineHashes — the actual CSP rejection case", () => {
  // Classic Adsterra-style snippet: an inline bootstrap followed by an
  // external `invoke` script. The inline body is what CSP blocked in
  // production (owner report, 2026-10-31).
  const RAW = `<div id="container-blah"></div>
<script type="text/javascript">
	atOptions = { 'key' : 'xyz', 'format' : 'iframe' };
</script>
<script src="//www.highperformanceformat.com/xyz/invoke.js"></script>
<script type="text/javascript">
	document.getElementById("container-blah").appendChild(document.createElement("iframe"));
</script>`;

  test("hashes every inline body and skips external scripts", () => {
    const hashes = rawSnippetInlineHashes(RAW);
    assert.equal(hashes.length, 2);
    for (const hash of hashes) {
      assert.match(hash, /^'sha256-[A-Za-z0-9+/=]{44}'$/);
    }
  });

  test("hash is over the EXACT body bytes (matches browser CSP hashing)", () => {
    const body = "\n\tatOptions = { 'key' : 'xyz', 'format' : 'iframe' };\n";
    const expected = `'sha256-${createHash("sha256").update(Buffer.from(body, "utf8")).digest("base64")}'`;
    assert.ok(rawSnippetInlineHashes(RAW).includes(expected));
  });

  test("empty inline bodies are skipped", () => {
    const hashes = rawSnippetInlineHashes("<script> </script><script src='//a.b/x.js'></script>");
    assert.equal(hashes.length, 0);
  });

  test("enabled raw slot injects the hash tokens into script-src", () => {
    const csp = buildCspHeader({
      enabled: true,
      slots: [{ network: "raw", params: { raw: RAW } }],
    });
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    const hashes = rawSnippetInlineHashes(RAW);
    for (const hash of hashes) {
      assert.ok(scriptSrc!.includes(hash), `script-src must pin ${hash}`);
    }
    assert.ok(scriptSrc!.includes("https://www.highperformanceformat.com"));
  });

  test("hashes are dropped when ads are disabled again", () => {
    const csp = buildCspHeader({
      enabled: false,
      slots: [{ network: "raw", params: { raw: RAW } }],
    });
    assert.equal(csp.includes("sha256-"), false);
  });
});

describe("nginx include file", () => {
  let root = "";

  afterEach(() => {
    resetEnvForTests();
  });

  test("renderNginxCspConf escapes quotes and ends with the always directive", () => {
    const conf = renderNginxCspConf("script-src <bad\"quote>");
    // Double quotes must be escaped so the nginx line parses:
    assert.ok(conf.includes('<bad\\"quote>'));
    assert.ok(conf.endsWith("always;\n"));
    // Header line is exactly one add_header:
    assert.equal(conf.split("\n").filter((l) => l.startsWith("add_header")).length, 1);
  });

  test("writeNginxCspConf writes atomically under ACME_CERTS_PATH", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "bio-csp-"));
    process.env.ACME_CERTS_PATH = root;
    resetEnvForTests();
    const { path: written } = writeNginxCspConf(buildCspHeader(NO_ADS));
    assert.ok(fs.statSync(written).isFile());
    assert.ok(written.startsWith(root));
    // No leftover temp files from the atomic write.
    assert.equal(fs.readdirSync(root).filter((f) => f.endsWith(".tmp")).length, 0);
  });
});
