import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { infringingUrlsHtml } from "../src/lib/dmca.js";

// A6 regression — the operator e-mail joined the report URLs with "<br/>" and
// THEN HTML-escaped the whole string, so the separator rendered as a literal
// "&lt;br/&gt;" in the message. Each URL must be escaped individually.

describe("A6: DMCA operator e-mail URL rendering", () => {
  test("escapes each URL and keeps real <br/> separators", () => {
    const html = infringingUrlsHtml(["https://a.test/1", "https://b.test/<x>?a=1&b=2"]);
    assert.equal(html, "https://a.test/1<br/>https://b.test/&lt;x&gt;?a=1&amp;b=2");
    assert.ok(html.includes("<br/>"), "separator is a real break tag");
    assert.ok(!html.includes("&lt;br/&gt;"), "separator is not double-escaped");
  });

  test("returns an empty string for a missing/non-array value", () => {
    assert.equal(infringingUrlsHtml(null), "");
    assert.equal(infringingUrlsHtml(undefined), "");
    assert.equal(infringingUrlsHtml("not-an-array"), "");
  });
});
