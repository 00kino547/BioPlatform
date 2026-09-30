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
// config. Must satisfy the schema's own `min(12)` — the previous default
// ("admin123456") was 11 characters, so any boot without an explicit
// ADMIN_PASSWORD crashed with "Invalid environment variables" at getEnv().
// Reachable only when a config file is missing and NODE_ENV is not production;
// production rejects both this scaffold and every KNOWN_WEAK value.
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
  CACHE_DRIVER: z.enum(["memory", "redis", "file", "db"]).default("redis"),
  CACHE_REDIS_URL: z.string().default("redis://localhost:6379"),
  CACHE_FILE_DIR: z.string().default(""),
  CAPTCHA_PROVIDER: z.enum(["none", "turnstile", "recaptcha", "hcaptcha"]).default("none"),
  CAPTCHA_SITE_KEY: z.string().default(""),
  CAPTCHA_SECRET_KEY: z.string().default(""),
  ANALYTICS_PROVIDER: z.enum(["none", "matomo"]).default("none"),
  ANALYTICS_MATOMO_URL: z.string().url().or(z.literal("")).default(""),
  ANALYTICS_MATOMO_SITE_ID: z.coerce.number().int().min(0).default(1),
  POCKETBASE_URL: z.union([z.literal(""), z.string().url()]).default(""),
  POCKETBASE_CLIENT_URL: z.string().default("/api/pb-speed"),
  POCKETBASE_ADMIN_EMAIL: z.string().default(""),
  POCKETBASE_ADMIN_PASSWORD: z.string().default(""),
  POCKETBASE_AUTH_COLLECTION: z.string().default("users"),
  POCKETBASE_ANALYTICS_ENABLED: z.string().default("false").transform(boolFromEnv),
  POCKETBASE_OAUTH_ENABLED: z.string().default("false").transform(boolFromEnv),
  POCKETBASE_STORAGE_ENABLED: z.string().default("false").transform(boolFromEnv),
  POCKETBASE_CONTENT_ENABLED: z.string().default("false").transform(boolFromEnv),
  POCKETBASE_BOOTSTRAP: z.string().default("true").transform(boolFromEnv),
  POCKETBASE_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(500).default(50),
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
  EMAIL_VERIFY_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),
  AUTH_LOG_RETENTION_DAYS: z.coerce.number().int().default(30),
  AUTH_LOG_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().default(60),
  SSO_GOOGLE_CLIENT_ID: z.string().default(""),
  SSO_GOOGLE_CLIENT_SECRET: z.string().default(""),
  SSO_GITHUB_CLIENT_ID: z.string().default(""),
  SSO_GITHUB_CLIENT_SECRET: z.string().default(""),
  SSO_DISCORD_CLIENT_ID: z.string().default(""),
  SSO_DISCORD_CLIENT_SECRET: z.string().default(""),
  SSO_CALLBACK_URL: z.string().url().or(z.literal("")).default(""),
  SSO_SIGNUP_REQUIRES_INVITE: z.string().default("true").transform(boolFromEnv),
  SSO_2FA_BYPASS_ALLOWED: z.string().default("false").transform(boolFromEnv),
  STORAGE_PROVIDER: z.enum(["local", "r2", "b2", "s3"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./uploads"),
  ORPHAN_CLEANUP_ENABLED: z.string().default("true").transform(boolFromEnv),
  ORPHAN_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(360),
  ORPHAN_CLEANUP_GRACE_HOURS: z.coerce.number().int().min(0).default(24),
  MEDIA_CACHE_MAX_AGE_HOURS: z.coerce.number().int().min(1).default(168),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  S3_BUCKET: z.string().default(""),
  S3_PREFIX: z.string().default(""),
  S3_FORCE_PATH_STYLE: z.string().default("false").transform(boolFromEnv),
  B2_APPLICATION_KEY_ID: z.string().default(""),
  B2_APPLICATION_KEY: z.string().default(""),
  B2_BUCKET: z.string().default(""),
  B2_PREFIX: z.string().default(""),
  B2_API_URL: z.string().url().default("https://api.backblazeb2.com"),
  STORAGE_COMPRESS_ENABLED: z.string().default("true").transform(boolFromEnv),
  MEDIA_CACHE_MAX_ENTRIES: z.coerce.number().int().min(1).default(2000),
  MEDIA_CACHE_MAX_SIZE_MB: z.coerce.number().int().min(1).default(512),
  MEDIA_PROXY_ENABLED: z.string().default("true").transform(boolFromEnv),
  MEDIA_PROXY_MAX_BYTES: z.coerce.number().int().min(1024).default(20 * 1024 * 1024),
  MEDIA_PROXY_TTL_HOURS: z.coerce.number().int().min(0).default(24),
  SMTP_ENABLED: z.string().default("false").transform(boolFromEnv),
  SMTP_PROVIDER: z.enum(["gmail", "custom"]).default("gmail"),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM_NAME: z.string().default("BioPlatform"),
  SMTP_FROM_EMAIL: z.string().default(""),
  ADMIN_EMAIL: z.string().default("admin@localhost.localhost"),
  ADMIN_PASSWORD: z.string().min(12).default(SCAFFOLD_ADMIN_PASSWORD),
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
  AFFILIATE_INVITEE_DISCOUNT_PERCENT: z.coerce.number().int().min(0).max(100).default(10),
  AFFILIATE_DISCOUNT_DURATION_DAYS: z.coerce.number().int().min(-1).default(365),
  AFFILIATE_DISCOUNT_LEVELS: z.string().default(""),
  AFFILIATE_ALLOWANCE_LEVELS: z.string().default(""),
  AFFILIATE_BADGE_LEVELS: z.string().default(""),
  AFFILIATE_ABUSE_ACTION: z.enum(["reject", "skip", "warn"]).default("reject"),
  AFFILIATE_ABUSE_SCOPE: z.enum(["referrals", "invites", "both"]).default("both"),
  BILLING_MODE: z.enum(["one-time", "subscription", "fixed-term"]).default("one-time"),
  BILLING_PRICE_PRO_CENTS: z.coerce.number().int().min(0).default(500),
  BILLING_PRICE_ENTERPRISE_CENTS: z.coerce.number().int().min(0).default(2900),
  BILLING_CURRENCY: z.string().min(3).max(3).default("USD"),
  STRIPE_ENABLED: z.string().default("false").transform(boolFromEnv),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  PAYPAL_ENABLED: z.string().default("false").transform(boolFromEnv),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_CLIENT_ID: z.string().default(""),
  PAYPAL_CLIENT_SECRET: z.string().default(""),
  PAYPAL_WEBHOOK_ID: z.string().default(""),
  CRYPTO_ENABLED: z.string().default("false").transform(boolFromEnv),
  CRYPTO_PROVIDERS: z.string().default("btcpayserver"),
  BTCPAY_URL: z.union([z.literal(""), z.string().url()]).default(""),
  BTCPAY_API_KEY: z.string().default(""),
  BTCPAY_STORE_ID: z.string().default(""),
  BTCPAY_WEBHOOK_SECRET: z.string().default(""),
  BITPAY_API_KEY: z.string().default(""),
  BITPAY_WEBHOOK_SECRET: z.string().default(""),
  CRYPTO_COINS: z.string().default("BTC,LTC,XMR"),
  CRYPTO_RATE_SOURCE: z.enum(["coingecko"]).default("coingecko"),
  CRYPTO_RATE_FALLBACK: z.string().default(""),
  CRYPTO_RATE_CACHE_SECONDS: z.coerce.number().int().min(0).default(300),
  LINKS_SECTIONS_ENABLED: z.string().default("false").transform(boolFromEnv),
  LINKS_CUSTOM_ICONS_ENABLED: z.string().default("false").transform(boolFromEnv),
  LINKS_QR_ENABLED: z.string().default("false").transform(boolFromEnv),
  NEWSLETTER_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM: z.string().default(""),
  NEWSLETTER_UNSUBSCRIBE_TTL_DAYS: z.coerce.number().int().min(1).default(365),
  NEWSLETTER_MAILING_ADDRESS: z.string().default(""),
  NEWSLETTER_SELF_RECIPIENT_CAP: z.coerce.number().int().min(1).max(5000).default(1000),
  NEWSLETTER_PLATFORM_SMTP_ENABLED: z.string().default("false").transform(boolFromEnv),
  NEWSLETTER_PLATFORM_RECIPIENT_CAP: z.coerce.number().int().min(1).max(5000).default(100),
  PRODUCT_FILE_MAX_MB: z.coerce.number().int().min(1).max(500).default(50),
  PRODUCT_DOWNLOAD_TTL_HOURS: z.coerce.number().int().min(1).default(168),
  PRODUCT_PURCHASE_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
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

/**
 * Parse and validate a raw environment object WITHOUT consulting the cached
 * config or exiting the process. Exists so the test suite can assert the S1
 * weak-admin-password guard in production without standing up a server.
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
