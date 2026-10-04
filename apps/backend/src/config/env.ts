import { z } from "zod";

function boolFromEnv(v: string): boolean {
  return v === "true" || v === "1";
}

const KNOWN_WEAK_ADMIN_PASSWORDS = Object.freeze([
  "admin123456",
  "admin1234567",
  "admin12345678",
  "admin123456789",
  "admin1234567890",
  "admin1234567890123456",
  "Admin123456!",
  "password",
  "password123456",
]);
// Dev/test-only scaffold value so `pnpm dev` and the test suite boot with zero
// config. Must satisfy the schema's own min(12) — the previous default
// ("admin123456") was 11 characters, so any boot without an explicit
// ADMIN_PASSWORD crashed with "Invalid environment variables" at getEnv().
// Reachable only when the variable is absent and NODE_ENV is not production;
// production rejects it below.
const SCAFFOLD_ADMIN_PASSWORD = "admin-scaffold-change-me";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  APP_URL: z.string().url().default("http://localhost:80"),
  APP_NAME: z.string().default("BioPlatform"),
  APP_TAGLINE: z.string().default("Your digital identity, beautifully crafted."),
  APP_GITHUB_URL: z.string().url().default("https://github.com/00kino547/BioPlatform"),
  UPDATE_CHECK_ENABLED: z.string().default("true").transform(boolFromEnv),
  UPDATE_CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(720),
  UPDATE_CHECK_STALE_MAX_MINUTES: z.coerce.number().int().min(60).default(1440),
  UPDATE_CRITICAL_STALE_THRESHOLD: z.coerce.number().int().min(2).default(3),
  UPDATE_CHECK_INCLUDE_PRERELEASES: z.string().default("false").transform(boolFromEnv),
  JWT_SECRET: z.string().min(32),
  // `.default("7d")` only covers an *absent* var: an empty value (`JWT_EXPIRES_IN=`)
  // would otherwise reach jsonwebtoken and throw "invalid expiresIn option" at the
  // first sign. Coerce a blank/whitespace value back to the 7d default so a
  // misconfigured .env can never crash token issuance.
  JWT_EXPIRES_IN: z
    .string()
    .default("7d")
    .transform((value) => value.trim() || "7d"),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  AUTH_LOCK_POLICY: z.enum(["block", "trusted_ip", "email"]).default("trusted_ip"),
  AUTH_LOCK_DURATION_MINUTES: z.coerce.number().int().default(-1),
  AUTH_UNLOCK_TOKEN_TTL_MINUTES: z.coerce.number().int().default(30),
  AUTH_LOG_RETENTION_DAYS: z.coerce.number().int().default(30),
  AUTH_LOG_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().default(60),
  STORAGE_PROVIDER: z.enum(["local", "r2", "b2", "s3"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./uploads"),
  SMTP_ENABLED: z.string().default("false").transform(boolFromEnv),
  SMTP_PROVIDER: z.enum(["gmail", "custom"]).default("gmail"),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM_NAME: z.string().default("BioPlatform"),
  SMTP_FROM_EMAIL: z.string().default(""),
  ADMIN_EMAIL: z.string().default("admin@bioplatform.com"),
  // The scaffold default MUST satisfy the schema's own min(12): the previous
  // value ("admin123456") was 11 characters, so every boot without an explicit
  // ADMIN_PASSWORD failed validation with "Invalid environment variables" and
  // getEnv() called process.exit(1) — which surfaced as 30 whole test FILES
  // reported as `not ok`, hiding one trivial env gap behind an apparent
  // catastrophe.
  ADMIN_PASSWORD: z.string().min(12).default("admin-scaffold-change-me"),
  ADMIN_USERNAME: z.string().regex(/^[a-z0-9_-]+$/).default("admin"),
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_ORIGIN: z.string().default("https://localhost"),
  WEBAUTHN_RP_NAME: z.string().default("BioPlatform"),
  PASSKEY_RESIDENCY_TTL_DAYS: z.coerce.number().int().min(1).default(14),
  ADMIN_FLAG_USERS_WITHOUT_PASSKEYS: z.string().default("true").transform(boolFromEnv),
  DISCORD_CLIENT_ID: z.string().default(""),
  DISCORD_CLIENT_SECRET: z.string().default(""),
  DISCORD_REDIRECT_URI: z.string().default(""),
  DISCORD_BOT_TOKEN: z.string().default(""),
  DISCORD_GUILD_INVITE: z.string().default(""),
  ACME_ENABLED: z.string().default("false").transform(boolFromEnv),
  ACME_DIRECTORY_URL: z.string().url().default("https://acme-v02.api.letsencrypt.org/directory"),
  ACME_EMAIL: z.string().default(""),
  ACME_RENEW_BEFORE_DAYS: z.coerce.number().int().min(1).default(30),
  ACME_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(60),
  ACME_MAX_DOMAINS_PER_RUN: z.coerce.number().int().min(1).default(20),
  ACME_CERTS_PATH: z.string().default("certs"),
  CUSTOM_DOMAINS_ALL_TIERS: z.string().default("false").transform(boolFromEnv),
}).superRefine((data, ctx) => {
  // S1 — never run with a known/weak admin credential in production.
  // The dev/test scaffold default exists only so `pnpm dev` and the test
  // suite boot with zero config. In production that scaffold (and any of
  // the other known-predictable variants) must fail fast with a clear
  // message instead of booting a guessable admin account — even if an
  // operator explicitly echoed the value into the environment.
  if (
    data.NODE_ENV === "production" &&
    (SCAFFOLD_ADMIN_PASSWORD === data.ADMIN_PASSWORD || KNOWN_WEAK_ADMIN_PASSWORDS.includes(data.ADMIN_PASSWORD))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ADMIN_PASSWORD"],
      message:
        "ADMIN_PASSWORD must be explicitly configured with a unique, strong " +
        "value in production. The known default (or a predictable variant) is " +
        "rejected here; generate a fresh one, e.g.: " +
        "openssl rand -base64 32",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate a raw environment object WITHOUT consulting the cached
 * config or exiting the process. Exists so the test suite can assert env
 * validation (blank-value coercion, the defaultless JWT_SECRET) without
 * standing up a server.
 */
export function validateEnv(
  raw: Record<string, unknown>
): { success: true; data: Env } | { success: false; issues: string[] } {
  const result = envSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  _env = result.data;
  return _env;
}
