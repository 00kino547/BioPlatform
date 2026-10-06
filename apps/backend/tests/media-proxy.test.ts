import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp, hostnameSafe } from "../src/lib/mediaProxy.js";

describe("isPrivateIp — IPv4", () => {
  test("RFC1918 private ranges", () => {
    assert.equal(isPrivateIp("10.0.0.1"), true);
    assert.equal(isPrivateIp("172.16.0.1"), true);
    assert.equal(isPrivateIp("172.31.255.255"), true);
    assert.equal(isPrivateIp("192.168.1.1"), true);
  });

  test("loopback and zero network", () => {
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("0.0.0.0"), true);
    assert.equal(isPrivateIp("0.1.2.3"), true);
  });

  test("link-local, including cloud metadata endpoint", () => {
    assert.equal(isPrivateIp("169.254.169.254"), true);
    assert.equal(isPrivateIp("169.254.0.1"), true);
    assert.equal(isPrivateIp("169.254.255.255"), true);
  });

  test("CGNAT 100.64.0.0/10", () => {
    assert.equal(isPrivateIp("100.64.0.1"), true);
    assert.equal(isPrivateIp("100.127.255.255"), true);
  });

  test("documentation / reserved ranges", () => {
    assert.equal(isPrivateIp("192.0.0.8"), true);
    assert.equal(isPrivateIp("192.0.2.10"), true);
    assert.equal(isPrivateIp("198.51.100.10"), true);
    assert.equal(isPrivateIp("203.0.113.10"), true);
  });

  test("benchmark 198.18.0.0/15 and multicast/reserved", () => {
    assert.equal(isPrivateIp("198.18.0.1"), true);
    assert.equal(isPrivateIp("198.19.255.255"), true);
    assert.equal(isPrivateIp("224.0.0.1"), true);
    assert.equal(isPrivateIp("239.255.255.255"), true);
    assert.equal(isPrivateIp("240.0.0.1"), true);
  });

  test("public IPv4 addresses are allowed", () => {
    assert.equal(isPrivateIp("8.8.8.8"), false);
    assert.equal(isPrivateIp("1.1.1.1"), false);
    assert.equal(isPrivateIp("93.184.216.34"), false);
    assert.equal(isPrivateIp("172.15.0.1"), false);
    assert.equal(isPrivateIp("100.63.0.1"), false);
    assert.equal(isPrivateIp("100.128.0.1"), false);
    assert.equal(isPrivateIp("192.1.1.1"), false);
  });

  test("malformed addresses are rejected", () => {
    assert.equal(isPrivateIp("not-an-ip"), true);
    assert.equal(isPrivateIp("127.0.0.999"), true);
    assert.equal(isPrivateIp(""), true);
  });
});

describe("isPrivateIp — IPv6", () => {
  test("loopback and unspecified", () => {
    assert.equal(isPrivateIp("::"), true);
    assert.equal(isPrivateIp("::1"), true);
  });

  test("ULA fc00::/7", () => {
    assert.equal(isPrivateIp("fc00::1"), true);
    assert.equal(isPrivateIp("fd12:3456:789a::1"), true);
  });

  test("link-local fe80::/10 covers the whole fe80-febf range", () => {
    assert.equal(isPrivateIp("fe80::1"), true);
    assert.equal(isPrivateIp("fe90::1"), true);
    assert.equal(isPrivateIp("fea0::1"), true);
    assert.equal(isPrivateIp("feb0::1"), true);
    assert.equal(isPrivateIp("febf::ffff"), true);
  });

  test("multicast", () => {
    assert.equal(isPrivateIp("ff02::1"), true);
    assert.equal(isPrivateIp("ff00::"), true);
  });

  test("IPv4-mapped forms leak no private ranges", () => {
    assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
    assert.equal(isPrivateIp("::ffff:10.0.0.1"), true);
    assert.equal(isPrivateIp("::ffff:169.254.169.254"), true);
    assert.equal(isPrivateIp("::ffff:192.168.1.1"), true);
    assert.equal(isPrivateIp("0:0:0:0:0:ffff:169.254.169.254"), true);
    assert.equal(isPrivateIp("::ffff:8.8.8.8"), false);
    assert.equal(isPrivateIp("0:0:0:0:0:ffff:8.8.8.8"), false);
  });

  test("public IPv6 addresses are allowed", () => {
    assert.equal(isPrivateIp("2606:4700:4700::1111"), false);
    assert.equal(isPrivateIp("2001:4860:4860::8888"), false);
    assert.equal(isPrivateIp("2001:db8::1"), false); // doc range is informational, still routable here
  });
});

describe("hostnameSafe (offline paths)", () => {
  test("localhost is always blocked", async () => {
    assert.equal(await hostnameSafe("localhost"), false);
  });

  test("literal private IPs are blocked", async () => {
    assert.equal(await hostnameSafe("127.0.0.1"), false);
    assert.equal(await hostnameSafe("169.254.169.254"), false);
    assert.equal(await hostnameSafe("10.1.2.3"), false);
    assert.equal(await hostnameSafe("fe80::1"), false);
  });

  test("literal public IPs are allowed", async () => {
    assert.equal(await hostnameSafe("8.8.8.8"), true);
    assert.equal(await hostnameSafe("2606:4700:4700::1111"), true);
  });
});