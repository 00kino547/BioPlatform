import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, parseChangelog, getInstalledVersion } from "../src/lib/versionCheck.js";

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
