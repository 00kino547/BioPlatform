// Human-editable instance configuration (config.yml).
//
// Why this exists: lots of settings are per-instance *content* rather than
// secrets or infra wiring — the landing tagline, the hero copy, the operator
// name on the legal pages, an announcement bar, whether to show pricing at all.
// Those had no home: the landing copy came from VITE_* build-time variables and
// the legal pages had to say "contact us" with no way to name the operator. The
// brand values are still there in the env (so a static asset stays static), but
// a single config.yml lets an operator who only edits YAML control the public,
// data-driven parts of the instance.
//
// File format: ONE file, two top-level sections.
//
//   public:   served verbatim by GET /api/config — the frontend renders the
//             landing hero/footer, the announcement bar and hidePricing from it.
//             Also feeds the Terms/Privacy operator identity via the policy
//             snapshot. Nothing here is or can be a secret.
//   private:  parsed, validated and held in memory server-side, but NEVER
//             serialized to any endpoint. Anything that must reach the browser
//             belongs in `public`.
//
// SECURITY: every string field is sanitized on load (HTML-like chars stripped)
// so a mis-escaped value can never smuggle markup into the API or the legal
// pages (defense-in-depth: React/jinja escaping is the primary barrier). The
// announcement `href` is restricted to http/https, matching the platform's URL
// policy. An invalid file fails a boot loudly rather than silently serving a
// half-applied instance.
//
// HOT RELOAD: the server polls the config file (and a small "reload requested"
// sentinel, `<config>.reload`) a few times a second and applies changes in
// place — no restart needed. A re-read that is invalid NEVER replaces the
// running snapshot: the last-good config keeps serving and the failure is
// logged (self-healing: keep editing and the next poll applies the fix).
//
//   CONFIG_AUTO_RELOAD=true  (default) — any save of config.yml is picked up.
//   CONFIG_AUTO_RELOAD=false — a manual edit is ignored; apply changes with
//       `pnpm cli config reload` (which validates first, then bumps the file's
//       mtime AND touches the sentinel, so reload works even without watching).
//
// The reload pipe is file-based (mtime + a zero-byte sentinel) on purpose: the
// CLI is `node --env-file` inside the same container, and mtimes on the bind
// mount are the only inotify-free, container-friendly signal that works on
// macOS/Windows hosts too. The config mount must therefore be READ-WRITE
// (`:ro` would prevent the CLI/server from bumping mtimes).

import { readFileSync, statSync, existsSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { AD_NETWORKS, type AdNetworkId, resolveAdScriptSrc } from "./ads.js";

/** Sentinel suffix next to the config file that a CLI reload writes to. */
export const RELOAD_SENTINEL_SUFFIX = ".reload";

/** How often the running server re-stats the config file and sentinel. */
export const CONFIG_POLL_INTERVAL_MS = 5_000;

const announcementSchema = z
  .object({
    /** Rendered as the banner text. Empty message = no banner. */
    message: z.string().max(500).default(""),
    /** Optional destination; must be http(s) when non-empty. */
    href: z.string().max(500).default(""),
  })
  .default({})
  .refine(
    (v) => v.href === "" || /^https?:\/\/[^ ]+$/i.test(v.href),
    "announcement.href must be empty or an http(s) URL"
  );

/**
 * Per-slot ad parameters. `adsense` and `script` are the canonical embeds; `raw`
 * is the operator-pasted snippet mode. Deliberately NOT covered by the string
 * sanitizer — see the exemption in `sanitizeStrings` below.
 */
const adSlotParamsSchema = z.object({
  adsense: z
    .object({
      client: z.string().max(64).default(""),
      slot: z.string().max(64).default(""),
      /** True uses the global auto-ads script with no explicit <ins> block. */
      autoEnabled: z.boolean().default(false),
    })
    .optional(),
  script: z
    .object({
      /** https/script src on one of the network's allowlisted hosts. */
      src: z.string().max(1500).default(""),
      /** Optional token appended to the canonical loader URL. */
      token: z.string().max(256).default(""),
    })
    .optional(),
  /** Operation-pasted snippet — `network: raw`. Not sanitized, seldom empty. */
  raw: z.string().max(8000).default("").optional(),
});

const adSlotSchema = z
  .object({
    network: z.enum([...AD_NETWORKS, "raw"]),
    placement: z.string().max(60).default("below-links"),
    params: adSlotParamsSchema.default({}),
  })
  .superRefine((slot, ctx) => {
    // Raw overrides every canonical requirement — operator owns the markup.
    if (slot.params.raw?.trim()) return;
    if (slot.network === "raw") {
      ctx.addIssue({
        code: "custom",
        path: ["params", "raw"],
        message: "raw HTML is required when network is \"raw\" (or remove the slot)",
      });
      return;
    }
    if (slot.network === "adsense") {
      if (!slot.params.adsense?.client) {
        ctx.addIssue({ code: "custom", path: ["params", "adsense", "client"], message: "adsense.client is required" });
      }
      if (!slot.params.adsense?.slot && !slot.params.adsense?.autoEnabled) {
        ctx.addIssue({ code: "custom", path: ["params", "adsense", "slot"], message: "adsense.slot is required unless autoEnabled: true" });
      }
      return;
    }
    // script-based network: src must exist and be on the network's allowlist.
    const src = slot.params.script?.src?.trim() || "";
    if (!src) {
      ctx.addIssue({ code: "custom", path: ["params", "script", "src"], message: `script.src is required for network "${slot.network}"` });
      return;
    }
    if (!resolveAdScriptSrc(slot.network as AdNetworkId, src, slot.params.script?.token || "")) {
      ctx.addIssue({
        code: "custom",
        path: ["params", "script", "src"],
        message: `script.src must be an https/http script on one of the "${slot.network}" allowlisted hosts`,
      });
    }
  });

const instanceConfigSchema = z.object({
  public: z
    .object({
      // Multi-language UI (i18n) switch. Everything here is the PUBLIC
      // expectation-setting part: files actually ship with the frontend bundle
      // (apps/frontend/src/locales/), this block only toggles the feature and
      // tells the UI which locales it may offer the visitor. `defaultLocale`
      // wins when no stored preference or Accept-Language match exists.
      i18n: z
        .object({
          /** Master switch — the whole multi-language UI is inert while false. */
          enabled: z.boolean().default(false),
          /** Locale served to visitors with no stored preference. */
          defaultLocale: z.string().max(16).default("en"),
          /** Locale shown when a requested translation is missing a key. */
          fallbackLocale: z.string().max(16).default("en"),
          /** Installed locales (files shipped in the frontend bundle). */
          locales: z.array(z.string().max(16)).default(["en", "es"]),
        })
        .default({}),
      landing: z
        .object({
          tagline: z.string().max(120).default(""),
          hero: z
            .object({
              heading: z.string().max(160).default(""),
              subheading: z.string().max(400).default(""),
            })
            .default({}),
          footerAbout: z.string().max(600).default(""),
        })
        .default({}),
      policy: z
        .object({
          operatorName: z.string().max(120).default(""),
          operatorContact: z.string().max(300).default(""),
          jurisdiction: z.string().max(120).default(""),
          /**
           * DMCA / takedown behaviour.
           *
           * intakeEnabled drives whether the public report form and the
           * POST /api/dmca endpoint accept new filings. It does NOT switch the
           * fingerprint registry off — banned hashes are permanent by design.
           */
          dmca: z
            .object({
              /** Master switch for the public intake form + endpoint. Default on. */
              intakeEnabled: z.boolean().default(true),
              /**
               * Days a DMCA-disabled account may stay disabled before the purge
               * deletes it completely (when no appeal is pending). Default 30.
               */
              disabledAccountGraceDays: z.number().int().min(1).max(365).default(30),
            })
            .default({}),
        })
        .default({}),
      operational: z
        .object({
          announcement: announcementSchema,
          /** True hides the whole pricing section from the landing page. */
          hidePricing: z.boolean().default(false),
        })
        .default({}),
      ads: z
        .object({
          /** Master switch — everything else below is inert while false. */
          enabled: z.boolean().default(false),
          /**
           * `<meta>` tags rendered on public profile pages for ad-network site
           * verification (AdSense Search Console, Adsterra/AADS owner checks…).
           */
          verificationMeta: z
            .array(
              z.object({
                name: z.string().max(120).default(""),
                content: z.string().max(500).default(""),
              })
            )
            .default([]),
          /** One entry per ad slot; multiple are supported, 1 is the tested path. */
          slots: z.array(adSlotSchema).default([]),
        })
        .default({}),
    })
    .default({}),
  private: z
    .object({
      /**
       * The operator's direct legal mailbox. Held server-side ONLY — never
       * present in GET /api/config or the policy snapshot, because the Terms and
       * Privacy pages are public and an email address in the HTML is one more
       * address for spambots to harvest. Public-facing correspondence uses
       * `public.policy.operatorContact` (a URL or display handle).
       */
      operatorContactEmail: z
        .string()
        .max(300)
        .refine(
          (v) => v.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
          "must be a valid email address or empty"
        )
        .default(""),
      /**
       * Ad-network secrets (API keys, affiliate tokens for manual payout calls
       * made server-side). Parsed and validated here, but NEVER serialized to
       * any endpoint — `public.ads` only ever carries what the browser needs to
       * render the slot.
       */
      ads: z.record(z.string(), z.string()).default({}),
    })
    .default({}),
});

export type InstanceConfig = z.infer<typeof instanceConfigSchema>;
export type PublicInstanceConfig = InstanceConfig["public"];

/**
 * Strip HTML-like chars from user-authored config values, defense-in-depth.
 * `skip` marks exact paths to leave untouched — used for the raw ad-snippet
 * mode (`public.ads.slots[*].params.raw`), which is operator-authored HTML that
 * must reach the browser verbatim (the sole intentional exception to the
 * sanitizer; see adSlotParamsSchema).
 */
function sanitizeStrings(
  value: unknown,
  path: string[] = [],
  skip?: (path: string[]) => boolean
): unknown {
  if (skip?.(path)) return value;
  if (typeof value === "string") {
    return value.trim().replace(/[<>{}]/g, "");
  }
  if (Array.isArray(value)) {
    return value.map((child, index) => sanitizeStrings(child, [...path, String(index)], skip));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeStrings(child, [...path, key], skip);
    }
    return out;
  }
  return value;
}

/** True for the exact path `public.ads.slots[<i>].params.raw` — unsanitized. */
function isRawAdSnippetPath(path: string[]): boolean {
  if (path.length !== 6) return false;
  const inSlot = path[0] === "public" && path[1] === "ads" && path[2] === "slots";
  return inSlot && path[4] === "params" && path[5] === "raw";
}

/** The on-disk path: explicit override (tests) or the env CONFIG_FILE. */
export function resolveConfigPath(overridePath?: string): string {
  return overridePath ?? getEnv().CONFIG_FILE;
}

/** `config.yml` -> `config.yml.reload`, the CLI's "please reload" signal. */
export function reloadSentinelPath(configPath: string): string {
  return `${configPath}${RELOAD_SENTINEL_SUFFIX}`;
}

/**
 * mtime of a file in ms, or null when the path is not a regular file
 * (missing, a directory, unreadable). For the sentinel we never create files
 * ourselves on the read side, so any existing entry is used as-is.
 */
function fileMtimeMs(filePath: string): number | null {
  try {
    const st = statSync(filePath);
    return st.isFile() ? Math.floor(st.mtimeMs) : null;
  } catch {
    return null;
  }
}

export type ParseResult =
  | { ok: true; config: InstanceConfig; source: "file" | "absent" }
  | { ok: false; error: string };

/**
 * Read, sanitize and validate the config without touching module state — the
 * shared core used by the boot loader, the reload watcher and `config validate`.
 * A missing file (or a directory at the path, e.g. an accidental docker bind
 * mount of an empty host dir) is the documented "all defaults" state, never an
 * error; a file that exists but cannot be parsed or fails the schema is an
 * explicit `ok:false`.
 */
export function parseInstanceConfig(overridePath?: string): ParseResult {
  const filePath = resolveConfigPath(overridePath);
  let raw: unknown = {};
  let source: "file" | "absent" = "file";

  try {
    const text = readFileSync(filePath, "utf8");
    const parsed = YAML.parse(text);
    if (parsed === null || parsed === undefined) {
      // An empty file (or one holding only comments) is the documented
      // all-defaults state, identical to a missing file.
      raw = {};
    } else if (typeof parsed !== "object" || Array.isArray(parsed)) {
      // A top-level scalar or list is not a config document. Reject it here
      // instead of letting the schema read `undefined.public` and silently
      // fall back to `{}` — that would serve a malformed file as an
      // all-default config with no warning (see AGENTS "ASK, NEVER GUESS").
      return {
        ok: false,
        error: `Invalid instance config (${filePath}): top-level YAML must be a mapping of keys (got ${
          Array.isArray(parsed) ? "a list" : typeof parsed
        })`,
      };
    } else {
      raw = parsed as Record<string, unknown>;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      source = "absent";
    } else if (code === "EISDIR") {
      source = "absent";
    } else {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Cannot read instance config (${filePath}): ${detail}` };
    }
  }

  const sanitized = sanitizeStrings(raw, [], isRawAdSnippetPath) as Record<string, unknown>;
  const result = instanceConfigSchema.safeParse({
    public: (sanitized as { public?: unknown })?.public ?? {},
    private: (sanitized as { private?: unknown })?.private ?? {},
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: `Invalid instance config (${filePath}): ${issues}` };
  }

  return { ok: true, config: result.data, source };
}

let loaded: InstanceConfig | null = null;

/**
 * mtimes we last applied. `config` is null while the file is absent; a change
 * to either value (vs the current stat) is what marks the file as dirty.
 */
let appliedMtimes: { config: number | null; sentinel: number | null } = {
  config: null,
  sentinel: null,
};

/** Stop handle for the active watcher, so reset can tear it down in tests. */
let activeWatcherStop: (() => void) | null = null;

/**
 * Boot-time load: refuses to start on an invalid file. Missing file = defaults.
 * Records the current mtimes so a watcher started immediately afterwards does
 * not re-fire on the same file contents.
 */
export function loadInstanceConfig(overridePath?: string): InstanceConfig {
  const filePath = resolveConfigPath(overridePath);
  const result = parseInstanceConfig(filePath);

  if (!result.ok) {
    throw new Error(result.error);
  }

  loaded = result.config;
  appliedMtimes = {
    config: fileMtimeMs(filePath),
    sentinel: fileMtimeMs(reloadSentinelPath(filePath)),
  };
  console.log(
    `Instance config: ${result.source === "file" ? `loaded ${filePath}` : `${filePath} not found — using defaults`}`
  );
  return loaded;
}

/** Full parsed config (public + private). Server-side code only. */
export function getInstanceConfig(): InstanceConfig {
  return loaded ?? loadInstanceConfig();
}

/**
 * The public part of the config — exactly what GET /api/config serializes.
 * `private` never reaches this function.
 */
export function getPublicInstanceConfig(): PublicInstanceConfig {
  return getInstanceConfig().public;
}

interface ReloadOutcome {
  /** True when the running snapshot was (re)applied from disk this tick. */
  reloaded: boolean;
  /** True when the snapshot content actually changed (else it was a no-op). */
  changed: boolean;
  /** On failure the snapshot was kept and this holds the parse error. */
  error?: string;
}

/**
 * One poll of the reload pipe. Triggered when the config file's mtime changed
 * (only if `autoReload` is on) or when the CLI's sentinel changed (always — an
 * explicit `config reload` must work even with auto-reload disabled).
 *
 * On parse failure the last-good snapshot is KEPT and the error is returned; the
 * applied mtimes are NOT advanced, so a fixed file self-heals on the next poll.
 * An identical re-read (e.g. an editor save with no real change, or a CLI
 * double-bump) is acked without touching the snapshot.
 */
export function tryAutoReloadOnce(
  overridePath?: string,
  opts: { autoReload?: boolean } = {}
): ReloadOutcome {
  const configPath = resolveConfigPath(overridePath);
  const sentinelPath = reloadSentinelPath(configPath);
  const autoReload = opts.autoReload ?? getEnv().CONFIG_AUTO_RELOAD;

  // Ensure the module has at least the boot snapshot before diffing.
  const current = loaded ?? loadInstanceConfig(configPath);

  const configMtime = fileMtimeMs(configPath);
  const sentinelMtime = fileMtimeMs(sentinelPath);
  const configChanged = autoReload && configMtime !== appliedMtimes.config;
  const sentinelChanged = sentinelMtime !== appliedMtimes.sentinel;

  if (!configChanged && !sentinelChanged) {
    return { reloaded: false, changed: false };
  }

  const result = parseInstanceConfig(configPath);
  if (!result.ok) {
    return { reloaded: false, changed: false, error: result.error };
  }

  const changed = result.source === "file" && JSON.stringify(current) !== JSON.stringify(result.config);
  loaded = result.config;
  appliedMtimes = { config: configMtime, sentinel: sentinelMtime };
  return { reloaded: true, changed };
}

/**
 * Start the in-process reload watcher. Polls CONFIG_POLL_INTERVAL_MS for file
 * and sentinel mtime changes and applies them atomically. Returns a stop()
 * handle. The interval is unref()'d so it can never hold a process open.
 */
export function startInstanceConfigWatcher(
  opts: { path?: string; intervalMs?: number; autoReload?: boolean } = {}
): () => void {
  if (activeWatcherStop) {
    activeWatcherStop();
  }

  const configPath = resolveConfigPath(opts.path);
  const intervalMs =
    typeof opts.intervalMs === "number" && Number.isFinite(opts.intervalMs) && opts.intervalMs > 0
      ? opts.intervalMs
      : CONFIG_POLL_INTERVAL_MS;
  const autoReload = opts.autoReload ?? getEnv().CONFIG_AUTO_RELOAD;

  // Guarantee a snapshot exists before the first tick compares mtimes.
  getInstanceConfig();
  console.log(
    `Instance config watcher started (poll ${intervalMs}ms, auto-reload ${autoReload ? "on" : "off"}, file ${configPath})`
  );

  const timer = setInterval(() => {
    const outcome = tryAutoReloadOnce(configPath, { autoReload });
    if (outcome.error) {
      console.error(`Instance config reload FAILED — keeping last-good snapshot: ${outcome.error}`);
    } else if (outcome.reloaded && outcome.changed) {
      console.log("Instance config: reloaded and applied");
    } else if (outcome.reloaded && !outcome.changed) {
      console.log("Instance config: reload requested but no content change — nothing to apply");
    }
  }, intervalMs);
  timer.unref();

  const stop = () => {
    clearInterval(timer);
    if (activeWatcherStop === stop) {
      activeWatcherStop = null;
    }
  };
  activeWatcherStop = stop;
  return stop;
}

/**
 * Test-only: drop the cached parse and any active watcher so the next call
 * re-reads the file from a clean slate.
 */
export function resetInstanceConfigForTests(): void {
  activeWatcherStop?.();
  activeWatcherStop = null;
  loaded = null;
  appliedMtimes = { config: null, sentinel: null };
}

/** Convenience for the CLI: is the config file present on disk at all? */
export function configFileExists(overridePath?: string): boolean {
  return existsSync(resolveConfigPath(overridePath));
}