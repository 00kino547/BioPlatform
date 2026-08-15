import { readFileSync } from "node:fs";

const envPath = new URL("../../../.env", import.meta.url);
const raw = readFileSync(envPath, "utf8");

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (key && !(key in process.env)) {
    process.env[key] = value;
  }
}

const password = process.env.POSTGRES_PASSWORD ?? "postgres";
const testDatabaseUrl = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:5432/bioplatform_test?schema=public`;

if (!testDatabaseUrl.includes("bioplatform_test")) {
  throw new Error("Test DATABASE_URL must point at the bioplatform_test database");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
