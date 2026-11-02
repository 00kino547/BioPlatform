// i18next-parser config for the frontend workspace.
//
// Usage:
//   pnpm --filter @bioplatform/frontend i18n:extract
//   pnpm --filter @bioplatform/frontend i18n:check   (separate guard script)
//
// What it does: scans every TypeScript/TSX source file for react-i18next usage
// (`useTranslation("ns")` + `t("key")`, `<Trans i18nKey="ns.key">`) and
// regenerates the English locale source files under src/locales/en/<ns>.json.
//
// It is deliberately NON-DESTRUCTIVE against the committed en tree:
//   - `keepRemoved: true` keeps keys that are not (yet) referenced in code, so
//     running the extractor never silently drops a translation. Most namespaces
//     (dashboard, admin, legal, …) are still only partially wired into the UI.
//   - `sort: true`, `indentation: 2`, `lineEnding: '\n'` reproduce the exact
//     pretty-printed, key-sorted layout the locale files are committed with.
//   - `createOldCatalogs: false` stops i18next-parser writing the `_old.json`
//     backup catalogs that would otherwise clutter the locales directory.
//
// Namespace resolution: keys are assigned to the namespace named by the file's
// `useTranslation("ns")` hook; `defaultNamespace` is the fallback for files that
// call `t()` without a hook, and an explicit `t("ns:key")` prefix always wins.
export default {
  // Only the source tree is parsed; tests and generated output are ignored.
  input: ["src/**/*.{ts,tsx}"],

  // English is the source of truth. Spanish is a placeholder mirror managed by
  // hand (and validated by scripts/check-locales.mjs), not regenerated here.
  locales: ["en"],

  // Files land at src/locales/en/<namespace>.json from the workspace root.
  output: "src/locales/$LOCALE/$NAMESPACE.json",

  // Fallback namespace for `t()` calls made without a `useTranslation` hook.
  defaultNamespace: "common",

  // react-i18next uses "." for nesting and ":" to scope a key to a namespace.
  keySeparator: ".",
  namespaceSeparator: ":",

  // Preserve existing English values and keys; only add genuinely new keys.
  keepRemoved: true,
  defaultValue: "",

  // Match the committed JSON formatting exactly.
  sort: true,
  indentation: 2,
  lineEnding: "\n",

  // No `_old.json` backup catalogs.
  createOldCatalogs: false,
};
