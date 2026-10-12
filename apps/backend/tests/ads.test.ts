import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AD_NETWORKS,
  AD_NETWORKS_REGISTRY,
  AD_NETWORK_BY_ID,
  isPopUnderNetwork,
  adNetworkCspHosts,
  resolveAdScriptSrc,
  type AdNetworkId,
} from "../src/lib/ads.js";

// Pure module — no database, no HTTP. Guards the single registry that both the
// config schema (instance-config ads slots) and the nginx CSP fan-out rely on.

describe("ad network registry", () => {
  test("AD_NETWORKS matches the registry exactly, no duplicates", () => {
    const ids = AD_NETWORKS_REGISTRY.map((n) => n.id);
    assert.deepEqual(ids, [...AD_NETWORKS]);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every id resolves in the by-id map and has a label + kind", () => {
    for (const network of AD_NETWORKS) {
      const def = AD_NETWORK_BY_ID.get(network);
      assert.ok(def, `missing definition for ${network}`);
      assert.ok(def.label.length > 0, `empty label for ${network}`);
      assert.ok(def.kind === "banner" || def.kind === "popunder");
    }
  });

  test("pop-under classification is exactly popads + propellerads", () => {
    for (const network of AD_NETWORKS) {
      const isPop = network === "popads" || network === "propellerads";
      assert.equal(isPopUnderNetwork(network), isPop, `${network} misclassified`);
    }
  });

  test("script-based networks carry script hosts and an src template; adsense does not", () => {
    for (const network of AD_NETWORKS) {
      const def = AD_NETWORK_BY_ID.get(network)!;
      if (network === "adsense") {
        assert.equal(def.scriptsrcTemplate, null);
      } else {
        assert.ok(def.scriptHosts.length > 0, `${network} has no script hosts`);
        assert.match(def.scriptsrcTemplate ?? "", /^https:\/\/\{host\}/);
      }
    }
  });

  test("adNetworkCspHosts dedupes and only returns known hosts", () => {
    const hosts = adNetworkCspHosts("adsense");
    assert.ok(hosts.includes("pagead2.googlesyndication.com"));
    assert.equal(new Set(hosts).size, hosts.length);
    assert.equal(adNetworkCspHosts("totally-fake" as AdNetworkId).length, 0);
  });
});

describe("resolveAdScriptSrc", () => {
  test("valid adsterra loader resolves with token substitution", () => {
    const url = resolveAdScriptSrc("adsterra", "https://a.magsrv.com/ad.js", "1234567");
    assert.equal(url, "https://a.magsrv.com/ad.js?cb=1234567");
  });

  test("https and http schemes are accepted, others rejected", () => {
    assert.ok(resolveAdScriptSrc("popads", "https://www.popads.net/pop.js", "ABC"));
    assert.ok(resolveAdScriptSrc("popads", "http://www.popads.net/pop.js", "ABC"));
    assert.equal(resolveAdScriptSrc("popads", "javascript:alert(1)", "ABC"), null);
    assert.equal(resolveAdScriptSrc("popads", "data:text/html,x", "ABC"), null);
  });

  test("a src outside the network's script hosts is rejected", () => {
    assert.equal(resolveAdScriptSrc("popads", "https://evil.example/track.js", "ABC"), null);
    // Cross-network: adsterra's host is off-list for a popads slot.
    assert.equal(resolveAdScriptSrc("popads", "https://a.magsrv.com/ad.js", "ABC"), null);
    // Subdomain of an allowlisted host is fine (e.g. regional loaders).
    assert.ok(resolveAdScriptSrc("adsterra", "https://x.a.magsrv.com/ad.js", "t"));
  });

  test("adsense has no canonical template so it always resolves to null", () => {
    assert.equal(resolveAdScriptSrc("adsense", "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", ""), null);
  });

  test("empty src or unknown network resolve to null", () => {
    assert.equal(resolveAdScriptSrc("popads", "", "x"), null);
    assert.equal(resolveAdScriptSrc("popads", "   ", "x"), null);
    assert.equal(resolveAdScriptSrc("nope" as AdNetworkId, "https://www.popads.net/pop.js", ""), null);
  });
});