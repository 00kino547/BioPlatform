import { getEnv } from "../config/env.js";
import { getCacheDriver } from "./cache.js";
import { prisma } from "./prisma.js";

/**
 * Sharp, truthful health checks.
 *
 * The previous endpoint returned `{ status: "ok" }` without ever touching the
 * database. When a schema migration was missed (for example the `hide_ads`
 * column on `profiles`) the container reported "healthy" while EVERY profile
 * route threw Prisma P2021 and the frontend rendered empty pages — a lie.
 *
 * The probes below exercise the actual read path through the real Prisma
 * client: a no-`select` `findFirst` pulls every scalar column of the model, so
 * a missing column or table throws exactly the error a production route would
 * hit. Any such drift is surfaced in the report instead of being swallowed.
 */

/** Injectable probes. Production uses the real defaults; tests override them. */
export interface HealthProbes {
  pingDb: () => Promise<{ ok: boolean; latencyMs: number | null }>;
  probeModel: (model: string) => Promise<{ model: string; issue: string | null }>;
  pingCache: () => Promise<{ ok: boolean; detail: string }>;
}

/** A single schema-drift finding, e.g. model `profile`, column `hide_ads`. */
export interface SchemaDrift {
  model: string;
  /** Only set when the error message carried the table name. */
  table?: string;
  /** Only set when the error message carried the column name. */
  column?: string;
  issue: string;
}

export interface HealthReport {
  /** `degraded` (HTTP 503) whenever the DB is unreachable or the schema drifted. */
  status: "ok" | "degraded";
  timestamp: string;
  checks: {
    database: { ok: boolean; latencyMs: number | null };
    schema: {
      ok: boolean;
      /** Every model the probe read. */
      probedModels: string[];
      /** Their backing tables. */
      tables: string[];
      /** Non-empty ONLY when something is actually broken. */
      drift: SchemaDrift[];
    };
    cache: {
      driver: string;
      ok: boolean;
      detail: string;
    };
    app: {
      name: string;
      node: string;
      uptimeSeconds: number;
    };
  };
  /** Human-readable copy of every failing check. Empty when healthy. */
  issues: string[];
}

/**
 * The core models a live request can touch. Each one is probed with a
 * full-scalar read, so the health endpoint knows about the same columns the
 * routes do — this exact list would have caught the missing `hide_ads` column.
 */
const CORE_MODELS: ReadonlyArray<{ model: string; table: string }> = [
  { model: "profile", table: "profiles" },
  { model: "user", table: "users" },
  { model: "seasonalTheme", table: "seasonal_themes" },
  { model: "inviteCode", table: "invite_codes" },
  { model: "newsletterSubscriber", table: "newsletter_subscribers" },
  { model: "order", table: "orders" },
  { model: "product", table: "products" },
  { model: "tip", table: "tips" },
];

function defaultProbes(): HealthProbes {
  return {
    // Connectivity probe through the real Prisma client, with latency so a
    // degraded-but-alive database shows up instead of a binary ok/fail.
    async pingDb() {
      const started = Date.now();
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 AS ok`);
        return { ok: true, latencyMs: Date.now() - started };
      } catch {
        return { ok: false, latencyMs: Date.now() - started };
      }
    },
    // Full-scalar read of one model. No `select` means Prisma fetches EVERY
    // scalar column the client knows about — a missing column/table throws
    // P2021 here exactly like the production route. This is the drift detector.
    async probeModel(modelName: string) {
      const client = prisma as unknown as Record<string, { findFirst(arg: { take: number }): Promise<unknown> }>;
      const model = client[modelName];
      if (!model || typeof model.findFirst !== "function") {
        return { model: modelName, issue: `Prisma client exposes no model "${modelName}"` };
      }
      try {
        await model.findFirst({ take: 1 });
        return { model: modelName, issue: null };
      } catch (error) {
        return { model: modelName, issue: error instanceof Error ? error.message : String(error) };
      }
    },
    // The cache is best-effort by design (reads miss and hit the upstream
    // source), so its state is reported but never makes the whole check fail.
    async pingCache() {
      try {
        return await getCacheDriver().ping();
      } catch {
        return { ok: false, detail: "cache driver ping threw" };
      }
    },
  };
}

/** Turn a raw Prisma P2021 message into a precise drift entry. */
function toDrift(model: string, issue: string): SchemaDrift {
  const columnMatch = /column `([^`]+)` does not exist/.exec(issue);
  if (columnMatch) {
    const columnReference = columnMatch[1];
    const [table, columnName] = columnReference.includes(".")
      ? [columnReference.split(".")[0], columnReference.split(".")[1]]
      : [undefined, columnReference];
    return { model, table, column: columnName, issue: `Missing column ${columnReference}` };
  }
  const tableMatch = /table `([^`]+)` does not exist/.exec(issue);
  if (tableMatch) {
    const table = tableMatch[1];
    return { model, table, issue: `Missing table ${table}` };
  }
  return { model, issue: issue.slice(0, 300) };
}

/** Pure report construction — unit-testable without a database. */
export function buildHealthReport(
  database: { ok: boolean; latencyMs: number | null },
  probes: Array<{ model: string; issue: string | null }>,
  cache: { ok: boolean; detail: string },
): HealthReport {
  const drift: SchemaDrift[] = probes
    .filter((probe) => probe.issue !== null)
    .map((probe) => toDrift(probe.model, probe.issue as string));

  const issues: string[] = [];
  if (!database.ok) issues.push("database unreachable");
  for (const entry of drift) issues.push(`${entry.model}: ${entry.issue}`);

  return {
    status: issues.length === 0 ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks: {
      database: { ok: database.ok, latencyMs: database.latencyMs },
      schema: {
        ok: drift.length === 0,
        probedModels: CORE_MODELS.map((m) => m.model),
        tables: CORE_MODELS.map((m) => m.table),
        drift,
      },
      cache: {
        driver: getEnv().CACHE_DRIVER,
        ok: cache.ok,
        detail: cache.detail,
      },
      app: {
        name: getEnv().APP_NAME,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
      },
    },
    issues,
  };
}

/** Run every check in parallel and return the assembled report. */
export async function runHealthChecks(probes: Partial<HealthProbes> = {}): Promise<HealthReport> {
  const defaults = defaultProbes();
  const active: HealthProbes = { ...defaults, ...probes };
  const [database, modelResults, cache] = await Promise.all([
    active.pingDb(),
    Promise.all(CORE_MODELS.map((m) => active.probeModel(m.model))),
    active.pingCache(),
  ]);
  return buildHealthReport(database, modelResults, cache);
}