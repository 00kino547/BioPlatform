#!/usr/bin/env node
// Locale guard for the frontend workspace.
//
// Usage:
//   pnpm --filter @bioplatform/frontend i18n:check
//   node apps/frontend/scripts/check-locales.mjs   (from the workspace root)
//
// Dependency-light (node builtins only) and cross-platform. It fails (exit 1)
// on any of the following:
//
//   1. JSON.parse failure in any locale file under src/locales/<lng>/<ns>.json.
//   2. KEY PARITY — for every non-English locale, each key path present in the
//      English source must exist (missing keys are reported), and keys that do
//      not exist in English are flagged as extras.
//   3. PLACEHOLDER PARITY — for every key present in both locales, the set of
//      {{interpolation}} names and the set of <n> tags must match exactly. The
//      offending key and the two-way diff are printed.
//   4. ORPHAN SCAN — English keys that no `t(...)` / `<Trans i18nKey>` in
//      src/ ever references (best-effort static scan). Keys that are
//      legitimately not wired into the UI yet (or referenced dynamically in a
//      way the scan cannot see) belong in scripts/locale-allowlist.json, which
//      supports `*` globs (e.g. "dashboard:*").
//
// Categories 1-3 are unconditional hard failures. Category 4 is a hard failure
// only for keys that are neither referenced nor allow-listed. A summary with
// counts is printed at the end; the process exits non-zero when anything from
// 1-4 is unresolved.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// apps/frontend/ — this script lives in apps/frontend/scripts/.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES_DIR = path.join(ROOT, "src", "locales");
const SRC_DIR = path.join(ROOT, "src");
const ALLOWLIST_PATH = path.join(ROOT, "scripts", "locale-allowlist.json");

/** English is the source of truth. */
const SOURCE_LOCALE = "en";

/** defaultNS used by the runtime (see src/i18n/index.ts). */
const DEFAULT_NAMESPACE = "common";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Lists the immediate sub-directories of a directory (locale codes). */
function listDirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Lists the *.json files of a directory (namespace files). */
function listJson(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

/**
 * Flattens a nested locale object into dotted key paths. Arrays and non-object
 * values are leaves; i18next's keySeparator is ".".
 */
function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, full)) out.set(k, v);
    } else {
      out.set(full, value);
    }
  }
  return out;
}

/** Recursively collects source files with the given extensions. */
function walk(dir, exts, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, exts, acc);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      acc.push(full);
    }
  }
  return acc;
}

/** Turns a glob (only `*` is special) into an anchored RegExp. */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

// ---------------------------------------------------------------------------
// Placeholder extraction
// ---------------------------------------------------------------------------

/**
 * Returns the set of {{interpolation}} names in a string.
 * Matches `{{name}}`, `{{ name }}` and `{{name, format}}`.
 */
function interpolationNames(value) {
  const names = new Set();
  const re = /\{\{\s*(-?[A-Za-z0-9_.]+)/g;
  let m;
  while ((m = re.exec(value)) !== null) names.add(m[1]);
  return names;
}

/** Returns the set of <n> / </n> tag numbers in a string. */
function tagNames(value) {
  const names = new Set();
  const re = /<\s*\/?\s*(\d+)\s*>/g;
  let m;
  while ((m = re.exec(value)) !== null) names.add(m[1]);
  return names;
}

/** Compares two sets and returns { missing, extra } as sorted arrays. */
function setDiff(a, b) {
  const missing = [...a].filter((x) => !b.has(x)).sort();
  const extra = [...b].filter((x) => !a.has(x)).sort();
  return { missing, extra };
}

// ---------------------------------------------------------------------------
// Orphan scan
// ---------------------------------------------------------------------------

/**
 * Scans src/ for translation references and returns a Map of
 * namespace -> array of key patterns. `*` is a wildcard so dynamic keys such as
 * `t(\`nav.${link.id}\`)` still register as a reference (`nav.*`).
 */
function collectReferences() {
  const files = walk(SRC_DIR, [".ts", ".tsx"]);
  /** @type {Map<string, string[]>} */
  const refs = new Map();
  const add = (ns, key) => {
    if (!refs.has(ns)) refs.set(ns, []);
    refs.get(ns).push(key);
  };

  const useTranslationRe =
    /useTranslation\s*\(\s*(?:\[\s*)?["'`]([^"'`]+)["'`]/;
  const tRe = /\bt\s*\(\s*["'`]([^"'`]+)["'`]/g;
  const i18nKeyRe = /i18nKey\s*=\s*(?:\{\s*)?["'`]([^"'`]+)["'`]/g;
  const nsPropRe = /ns\s*=\s*(?:\{\s*)?["'`]([^"'`]+)["'`]/;

  for (const file of files) {
    const content = readFileSync(file, "utf8");

    // Namespace declared by the file's hook (first one wins), if any.
    const nsMatch = useTranslationRe.exec(content);
    const fileNs = nsMatch ? nsMatch[1] : null;

    // A key is either "ns:key" (explicit) or a bare key in the file namespace.
    const record = (rawKey, explicitNs) => {
      let ns = explicitNs || fileNs || DEFAULT_NAMESPACE;
      let key = rawKey;
      if (key.includes(":")) {
        const idx = key.indexOf(":");
        ns = key.slice(0, idx);
        key = key.slice(idx + 1);
      }
      // Dynamic template key -> wildcard pattern.
      key = key.replace(/\$\{[^}]*\}/g, "*");
      add(ns, key);
    };

    for (const m of content.matchAll(tRe)) record(m[1], null);

    for (const m of content.matchAll(i18nKeyRe)) {
      // The Trans `ns` prop, if any, sits right after the i18nKey prop.
      const window = content.slice(m.index, m.index + 400);
      const nsProp = nsPropRe.exec(window);
      record(m[1], nsProp ? nsProp[1] : null);
    }
  }

  return refs;
}

/** True when `keyPath` under `ns` is covered by any referenced pattern. */
function isReferenced(refs, ns, keyPath) {
  const patterns = refs.get(ns);
  if (!patterns) return false;
  const full = `${ns}:${keyPath}`;
  return patterns.some((p) => {
    // Match either an explicit "ns:pattern" or a "pattern" in the same ns.
    if (p.includes(":")) return globToRegExp(p).test(full);
    return globToRegExp(`${ns}:${p}`).test(full);
  });
}

/** Loads the allowlist, tolerating a missing file. */
function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return { comment: "", keys: [] };
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  if (Array.isArray(parsed)) return { comment: "", keys: parsed };
  return { comment: parsed.comment ?? "", keys: parsed.keys ?? [] };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const problems = [];
  const hardFailMessages = [];

  // 1 + load English source of truth.
  const locales = listDirs(LOCALES_DIR);
  if (!locales.includes(SOURCE_LOCALE)) {
    hardFailMessages.push(`Missing source locale directory: ${LOCALES_DIR}/${SOURCE_LOCALE}`);
    report(hardFailMessages, problems);
    return;
  }

  const namespaces = listJson(path.join(LOCALES_DIR, SOURCE_LOCALE)).map((f) =>
    f.replace(/\.json$/, "")
  );

  /** @type {Map<string, Map<string, Map<string, unknown>>>} */
  const catalogs = new Map();
  for (const lng of locales) {
    for (const ns of namespaces) {
      const file = path.join(LOCALES_DIR, lng, `${ns}.json`);
      if (!existsSync(file)) {
        if (lng !== SOURCE_LOCALE) problems.push(`[parity] missing file: ${lng}/${ns}.json`);
        continue;
      }
      try {
        const data = JSON.parse(readFileSync(file, "utf8"));
        if (!catalogs.has(lng)) catalogs.set(lng, new Map());
        catalogs.get(lng).set(ns, flatten(data));
      } catch (err) {
        problems.push(`[parse] ${lng}/${ns}.json: ${err.message}`);
      }
    }
  }

  const en = catalogs.get(SOURCE_LOCALE) ?? new Map();

  // 2 + 3: parity against English.
  for (const lng of locales) {
    if (lng === SOURCE_LOCALE) continue;
    const other = catalogs.get(lng) ?? new Map();
    for (const ns of namespaces) {
      const enKeys = en.get(ns);
      if (!enKeys) continue;
      const otherKeys = other.get(ns);
      if (!otherKeys) {
        problems.push(`[parity] ${lng}/${ns}.json: file missing or unparseable`);
        continue;
      }

      // Key parity.
      for (const key of enKeys.keys()) {
        if (!otherKeys.has(key)) problems.push(`[parity] ${lng}:${ns}.${key} missing`);
      }
      for (const key of otherKeys.keys()) {
        if (!enKeys.has(key)) problems.push(`[parity] ${lng}:${ns}.${key} extra (not in en)`);
      }

      // Placeholder parity (only where both sides have the key).
      for (const [key, enValue] of enKeys) {
        if (!otherKeys.has(key)) continue;
        const otherValue = otherKeys.get(key);
        if (typeof enValue !== "string" || typeof otherValue !== "string") continue;

        const { missing, extra } = setDiff(
          interpolationNames(enValue),
          interpolationNames(otherValue)
        );
        if (missing.length || extra.length) {
          problems.push(
            `[placeholders] ${lng}:${ns}.${key} interpolation mismatch` +
              (missing.length ? ` missing {${missing.join(", ")}}` : "") +
              (extra.length ? ` extra {${extra.join(", ")}}` : "")
          );
        }

        const tagDiff = setDiff(tagNames(enValue), tagNames(otherValue));
        if (tagDiff.missing.length || tagDiff.extra.length) {
          problems.push(
            `[placeholders] ${lng}:${ns}.${key} tag mismatch` +
              (tagDiff.missing.length ? ` missing <${tagDiff.missing.join(">, <")}>` : "") +
              (tagDiff.extra.length ? ` extra <${tagDiff.extra.join(">, <")}>` : "")
          );
        }
      }
    }
  }

  // 4: orphan scan.
  const refs = collectReferences();
  const allow = loadAllowlist();
  const allowMatchers = allow.keys.map((p) => ({ raw: p, re: globToRegExp(p) }));
  let allowlistedCount = 0;
  const orphans = [];
  for (const [ns, keys] of en) {
    for (const key of keys.keys()) {
      if (isReferenced(refs, ns, key)) continue;
      const full = `${ns}:${key}`;
      if (allowMatchers.some((m) => m.re.test(full))) {
        allowlistedCount++;
        continue;
      }
      orphans.push(full);
    }
  }
  for (const o of orphans) problems.push(`[orphan] ${o} (not referenced by t()/<Trans>)`);

  const totalEnKeys = [...en.values()].reduce((n, m) => n + m.size, 0);
  return report(hardFailMessages, problems, {
    locales: locales.length,
    namespaces: namespaces.length,
    totalEnKeys,
    orphanCount: orphans.length,
    allowlistedCount,
    allowEntries: allow.keys.length,
  });
}

/** Prints the summary and sets the exit code. */
function report(fatal, problems, stats) {
  for (const msg of fatal) console.error(msg);
  if (problems.length) {
    for (const msg of problems) console.error(msg);
  }
  if (stats) {
    console.log("");
    console.log("Locale guard summary");
    console.log("--------------------");
    console.log(`  locales:            ${stats.locales}`);
    console.log(`  namespaces:         ${stats.namespaces}`);
    console.log(`  en keys:            ${stats.totalEnKeys}`);
    console.log(`  orphan keys:        ${stats.orphanCount}`);
    console.log(`  allowlisted orphans:${String(stats.allowlistedCount).padStart(4)} (${stats.allowEntries} allowlist entries)`);
  }

  if (fatal.length || problems.length) {
    console.error(`\nFAIL: ${fatal.length + problems.length} locale problem(s).`);
    process.exit(1);
  }
  console.log("\nOK: locales parsed, key/placeholder parity intact, no unexpected orphans.");
  process.exit(0);
}

main();
