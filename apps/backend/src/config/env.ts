import { z } from "zod";

function boolFromEnv(v: string): boolean {
  return v === "true" || v === "1";
}

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
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
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
  ADMIN_PASSWORD: z.string().min(12).default("admin123456"),
  ADMIN_USERNAME: z.string().regex(/^[a-z0-9_-]+$/).default("admin"),
  WEBAUTHN_RP_ID: z.string().default("localhost"),
  WEBAUTHN_ORIGIN: z.string().default("https://localhost"),
  WEBAUTHN_RP_NAME: z.string().default("BioPlatform"),
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
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

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
