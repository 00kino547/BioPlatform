import { readFileSync } from "node:fs";

// The test runner works the same on a fresh clone or in CI as it does on a
// developer machine with a populated `.env`. A missing `.env` must never turn
// into an opaque crash — the process env / defaults below are enough for the
// deterministic test configuration (affiliate/billing/cache/SSO/captcha/gateway
// values are pinned further down regardless of the local `.env`).
// Tooling note: previously `readFileSync` threw here, so `pnpm test` failed
// with an empty/cryptic ENOENT before a single test ran when `.env` was absent.
const envPath = new URL("../../../.env", import.meta.url);
let raw = "";
try {
  raw = readFileSync(envPath, "utf8");
} catch {
  raw = "";
}

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

// `JWT_SECRET` is the one schema field with no default that a test run cannot
// invent on its own, and it is deliberately defaultless: production must supply
// a real 32+ char secret and must never silently get a weak one. The previous
// code relied on the developer's repo `.env` to provide it, so a CI runner (no
// `.env` at all) hit `Invalid environment variables: { JWT_SECRET: ['Required'] }`
// and `getEnv()` called `process.exit(1)`. Because that happens at import time,
// the node:test runner did not report one broken assertion — it reported 30 whole
// test FILES as `not ok` with a bare `test failed`, hiding one trivial env gap
// behind what looked like a catastrophic, 30-file breakage. Pin an obviously
// fake, deterministic, test-only secret here instead: it is only ever used to
// sign/verify tokens inside the test process, never to authenticate anything
// real, and CI (which has no `.env`) now boots exactly like a local run.
// `!(key in process.env)`-style precedence is preserved above, so an explicit
// JWT_SECRET from the shell or `.env` still wins; this is only the last resort.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-only-jwt-secret-never-used-in-production-0000";
}

// Email-send tests are OPT-IN, never opt-out. A developer's repo `.env`
// legitimately enables SMTP for the dev server — but loading it here must not
// make a plain `pnpm test` run fire real emails through the live SMTP account
// to fabricated (.test/.local/everywhere.test) destinations. Unless the
// operator explicitly opts in with RUN_LIVE_EMAIL_TESTS=1, every delivery path
// is forced off so no real mail can leave during a default run. When opted in,
// the tests that send must use TEST_EMAIL_TO (real recipient(s) the operator
// chooses), never made-up addresses.
const liveEmailTests = process.env.RUN_LIVE_EMAIL_TESTS === "1";
if (!liveEmailTests) {
  process.env.SMTP_ENABLED = "false";
  process.env.RESEND_API_KEY = "";
  process.env.NEWSLETTER_PLATFORM_SMTP_ENABLED = "false";
}
// Keep the gate readable for test files: "1" only when fully opted in.
process.env.RUN_LIVE_EMAIL_TESTS = liveEmailTests ? "1" : "0";

// Deterministic affiliate env for tests regardless of the live .env values.
process.env.AFFILIATE_DISCOUNT_LEVELS = "";
process.env.AFFILIATE_ALLOWANCE_LEVELS = "";
process.env.AFFILIATE_BADGE_LEVELS = "";
process.env.AFFILIATE_ABUSE_ACTION = "reject";
process.env.AFFILIATE_ABUSE_SCOPE = "both";

// Deterministic billing env for tests.
process.env.BILLING_MODE = "one-time";
process.env.BILLING_PRICE_PRO_CENTS = "500";
process.env.BILLING_PRICE_ENTERPRISE_CENTS = "2900";
process.env.BILLING_CURRENCY = "USD";

// Deterministic cache env for tests (in-process memory driver — tests never
// depend on a live Redis; the version-check and other drivers fall back to
// best-effort with memory).
process.env.CACHE_DRIVER = "memory";
process.env.CACHE_REDIS_URL = "";
process.env.CACHE_FILE_DIR = "";

// Deterministic SSO env for tests (google + discord configured; signup
// invite-gated on; 2FA bypass allowed at instance level — per-user
// oauthBypass2fa still gates it).
process.env.SSO_GOOGLE_CLIENT_ID = "google-test-client";
process.env.SSO_GOOGLE_CLIENT_SECRET = "google-test-secret";
process.env.SSO_GITHUB_CLIENT_ID = "github-test-client";
process.env.SSO_GITHUB_CLIENT_SECRET = "github-test-secret";
process.env.SSO_DISCORD_CLIENT_ID = "discord-test-client";
process.env.SSO_DISCORD_CLIENT_SECRET = "discord-test-secret";
process.env.SSO_SIGNUP_REQUIRES_INVITE = "true";
process.env.SSO_2FA_BYPASS_ALLOWED = "true";

// Deterministic PocketBase env for tests: a mock host with the OAuth module on.
// PocketBase is an OPTIONAL sign-in provider, so the rest of the suite must be
// completely unaffected by it. The /auth/oauth/pocketbase/* handlers only reach
// the host when a request actually exchanges a token, so the other suites never
// notice. The pure config/unit tests build their OWN env objects and are
// unaffected by this.
process.env.POCKETBASE_URL = "http://mock-pb";
process.env.POCKETBASE_CLIENT_URL = "/api/pb-speed";
process.env.POCKETBASE_ADMIN_EMAIL = "admin@x.test";
process.env.POCKETBASE_ADMIN_PASSWORD = "secret";
process.env.POCKETBASE_AUTH_COLLECTION = "users";
process.env.POCKETBASE_OAUTH_ENABLED = "true";

// Deterministic captcha env for tests (disabled — password login is exercised
// without external Turnstile round-trips).
process.env.CAPTCHA_PROVIDER = "none";
process.env.CAPTCHA_SITE_KEY = "";
process.env.CAPTCHA_SECRET_KEY = "";

// Deterministic paid-invite store env for tests. `INVITE_PRICE_PACKS` defaults
// to the empty string, which is the storefront's hard off switch
// (`purchaseStore()` reports `open: false` when the pack list is empty), so a CI
// runner with no repo `.env` saw a closed store and 7 invite-purchase tests
// failed there while passing locally — the developer's `.env` was silently
// supplying the packs. Pin the pack list the assertions are written against
// instead of inheriting whatever the local `.env` happens to contain.
process.env.INVITE_PRICE_PACKS = "1:100,3:200,10:600";

// Deterministic gateway env for tests (crypto is the synthetic-tested path).
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.PAYPAL_MODE = "sandbox";
process.env.CRYPTO_ENABLED = "true";
process.env.CRYPTO_PROVIDERS = "btcpayserver,bitpay";
process.env.BTCPAY_URL = "https://btcpay.test";
process.env.BTCPAY_API_KEY = "btcpay-test-key";
process.env.BTCPAY_STORE_ID = "store_test";
process.env.BTCPAY_WEBHOOK_SECRET = "btcpay-webhook-secret";
process.env.BITPAY_API_KEY = "bitpay-test-key";
process.env.BITPAY_WEBHOOK_SECRET = "bitpay-webhook-secret";
process.env.CRYPTO_COINS = "BTC,LTC,XMR";
process.env.CRYPTO_RATE_SOURCE = "coingecko";
process.env.CRYPTO_RATE_FALLBACK = "BTC=90000,LTC=80,XMR=150";
process.env.CRYPTO_RATE_CACHE_SECONDS = "0";
