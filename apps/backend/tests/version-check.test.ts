import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  compareVersions,
  computeSeverity,
  isPrereleaseVersion,
  parseChangelog,
  getInstalledVersion,
} from "../src/lib/versionCheck.js";

describe("compareVersions", () => {
  test("equal versions return 0", () => {
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  });

  test("higher major version", () => {
    assert.ok(compareVersions("2.0.0", "1.0.0") > 0);
  });

  test("lower major version", () => {
    assert.ok(compareVersions("1.0.0", "2.0.0") < 0);
  });

  test("higher minor version", () => {
    assert.ok(compareVersions("1.1.0", "1.0.0") > 0);
  });

  test("higher patch version", () => {
    assert.ok(compareVersions("1.0.1", "1.0.0") > 0);
  });

  test("prerelease is less than release", () => {
    assert.ok(compareVersions("1.0.0-rc.1", "1.0.0") < 0);
  });

  test("release is greater than prerelease", () => {
    assert.ok(compareVersions("1.0.0", "1.0.0-rc.1") > 0);
  });

  test("prerelease ordering: rc.2 > rc.1", () => {
    assert.ok(compareVersions("1.0.0-rc.2", "1.0.0-rc.1") > 0);
  });

  test("prerelease ordering: beta < rc", () => {
    assert.ok(compareVersions("1.0.0-beta.1", "1.0.0-rc.1") < 0);
  });

  test("handles v prefix", () => {
    assert.equal(compareVersions("v1.0.0", "1.0.0"), 0);
    assert.ok(compareVersions("v2.0.0", "v1.0.0") > 0);
  });

  test("uneven segment counts", () => {
    assert.ok(compareVersions("1.0", "1.0.0") === 0);
    assert.ok(compareVersions("1.0.1", "1.0") > 0);
  });
});

describe("parseChangelog", () => {
  const sample = `
## [1.3.0] - 2026-08-15

### Added
- Badge ordering feature.

### Fixed
- Pause/resume bug.

## [1.2.0] - 2026-08-10

### Security
- XSS fix in profiles.

## [Unreleased]

### Added
- Work in progress.
`;

  test("parses version headers", () => {
    const versions = parseChangelog(sample);
    assert.equal(versions.length, 2);
    assert.equal(versions[0].version, "1.3.0");
    assert.equal(versions[1].version, "1.2.0");
  });

  test("skips [Unreleased] section", () => {
    const versions = parseChangelog(sample);
    const hasUnreleased = versions.some((v) => v.version === "Unreleased");
    assert.equal(hasUnreleased, false);
  });

  test("parses sections and items", () => {
    const versions = parseChangelog(sample);
    const v130 = versions[0];
    assert.equal(v130.sections.length, 2);
    assert.equal(v130.sections[0].heading, "Added");
    assert.equal(v130.sections[0].items.length, 1);
    assert.equal(v130.sections[0].items[0], "Badge ordering feature.");
  });

  test("parses dates", () => {
    const versions = parseChangelog(sample);
    assert.equal(versions[0].date, "2026-08-15");
    assert.equal(versions[1].date, "2026-08-10");
  });

  test("handles code fences", () => {
    const md = `
## [1.0.0]

### Added
- Real item.

\`\`\`
## [0.9.0] - fake
- Not a version.
\`\`\`

- Also not a version.
`;
    const versions = parseChangelog(md);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].version, "1.0.0");
  });

  test("empty changelog returns empty array", () => {
    assert.deepEqual(parseChangelog(""), []);
    assert.deepEqual(parseChangelog("just some text\nno versions here"), []);
  });
});

describe("getInstalledVersion", () => {
  test("returns a string", () => {
    const version = getInstalledVersion();
    assert.equal(typeof version, "string");
    assert.ok(version.length > 0);
  });

  test("returns a semver-like string or 'unknown'", () => {
    const version = getInstalledVersion();
    const isSemver = /^\d+\.\d+\.\d+/.test(version);
    const isUnknown = version === "unknown";
    assert.ok(isSemver || isUnknown, `Expected semver or 'unknown', got: ${version}`);
  });
});

describe("computeSeverity (UPDATE_CHECK_INCLUDE_PRERELEASES)", () => {
  const v = (version: string, sections: { heading: string; items: string[] }[] = []) => ({
    version,
    sections,
  });

  test("isPrereleaseVersion detects pre-release tags", () => {
    assert.equal(isPrereleaseVersion("1.0.0"), false);
    assert.equal(isPrereleaseVersion("1.3.0-rc.4"), true);
    assert.equal(isPrereleaseVersion("1.0.0-beta.1"), true);
    assert.equal(isPrereleaseVersion("v1.2.3"), false);
  });

  test("stable-only mode is blind to pre-releases but reports them", () => {
    const versions = [
      v("1.4.0-rc.1", [{ heading: "Security", items: ["Critical fix in prerelease"] }]),
      v("1.4.0", [{ heading: "Added", items: ["Stable feature"] }]),
      v("1.3.0", [{ heading: "Security", items: ["Old stable security fix"] }]),
    ];
    const r = computeSeverity("1.3.0", versions, 3, false);
    assert.equal(r.latest, "1.4.0");
    assert.equal(r.outdated, true);
    assert.equal(r.severity, "update");
    assert.equal(r.skipped.length, 1);
    assert.equal(r.skipped[0].version, "1.4.0");
    assert.equal(r.prereleaseAvailable, true);
    assert.equal(r.prereleaseLatest, "1.4.0-rc.1");
    assert.equal(r.prereleaseCount, 1);
  });

  test("stable-only mode never escalates from pre-release security", () => {
    const versions = [
      v("1.4.0-rc.1", [{ heading: "Security", items: ["Massive prerelease CVE"] }]),
      v("1.3.0"),
      v("1.2.0"),
    ];
    const r = computeSeverity("1.2.0", versions, 3, false);
    assert.equal(r.severity, "update");
    assert.equal(r.outdated, true);
    assert.equal(r.latest, "1.3.0");
  });

  test("stable-only mode reports prerelease-only changelogs as no update, but available", () => {
    const versions = [
      v("1.5.0-rc.3", [{ heading: "Security", items: ["Prerelease security"] }]),
      v("1.5.0-rc.2"),
      v("1.4.0-rc.1"),
    ];
    const r = computeSeverity("1.4.0-rc.1", versions, 3, false);
    assert.equal(r.outdated, false);
    assert.equal(r.latest, null);
    assert.equal(r.severity, "none");
    assert.equal(r.prereleaseAvailable, true);
    assert.equal(r.prereleaseCount, 2);
    assert.equal(r.prereleaseLatest, "1.5.0-rc.3");
  });

  test("included mode counts prereleases and escalates to security", () => {
    const versions = [
      v("1.4.0-rc.1", [{ heading: "Security", items: ["Immediate prerelease CVE"] }]),
      v("1.3.0"),
    ];
    const r = computeSeverity("1.2.0", versions, 3, true);
    assert.equal(r.latest, "1.4.0-rc.1");
    assert.equal(r.outdated, true);
    assert.equal(r.severity, "security");
    assert.equal(r.skipped.length, 2);
    assert.equal(r.prereleaseAvailable, false);
  });

  test("included mode caps prerelease-driven severity at security, never critical", () => {
    const versions = [
      v("1.4.0-rc.1", [{ heading: "Security", items: ["Prerelease CVE"] }]),
      v("1.3.0"),
      v("1.2.0"),
      v("1.1.0"),
      v("1.0.0"),
    ];
    const r = computeSeverity("1.0.0", versions, 3, true);
    assert.equal(r.latest, "1.4.0-rc.1");
    assert.equal(r.skipped.length, 4);
    assert.equal(r.severity, "security");
    assert.notEqual(r.severity, "critical");
  });

  test("included mode without security stays a plain update even when stale", () => {
    const versions = [
      v("1.4.0-rc.1", [{ heading: "Added", items: ["New stuff"] }]),
      v("1.3.0"),
      v("1.2.0"),
      v("1.1.0"),
      v("1.0.0"),
    ];
    const r = computeSeverity("1.0.0", versions, 3, true);
    assert.equal(r.latest, "1.4.0-rc.1");
    assert.equal(r.skipped.length, 4);
    assert.equal(r.severity, "update");
    assert.notEqual(r.severity, "critical");
  });

  test("stable latest keeps full critical behavior in included mode", () => {
    const versions = [
      v("1.4.0", [{ heading: "Security", items: ["Stable security"] }]),
      v("1.4.0-rc.1", [{ heading: "Security", items: ["Prerelease CVE"] }]),
      v("1.3.0"),
      v("1.2.0"),
      v("1.1.0"),
      v("1.0.0"),
    ];
    const r = computeSeverity("1.0.0", versions, 3, true);
    assert.equal(r.latest, "1.4.0");
    assert.equal(r.severity, "critical");
  });
});
