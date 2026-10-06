// Public, secret-free snapshot of which data-processing features THIS instance
// actually has switched on.
//
// Why this exists: the Terms of Service and the Privacy Policy are rendered by
// the frontend, but the facts they describe (is Matomo on? is PocketBase
// offering sign-in? which captcha? which storage bucket? which payment
// processors?) live in the backend environment. Until now the legal pages had to
// hedge with "the instance operator MAY optionally enable ...", which is both
// vague and legally weaker than stating what the deployment actually does.
//
// The policy pages now fetch this endpoint and render present/absent wording
// per capability, so an operator who enables Matomo or PocketBase automatically
// gets policy text that describes it, and one who leaves them off never sees a
// paragraph about a service that is not running.
//
// SECURITY: every field below is either a boolean or a non-secret provider
// label. No URLs, keys, bucket names, hostnames, addresses or credentials are
// exposed. This endpoint is unauthenticated on purpose: the policy pages are
// public and must render for logged-out visitors, and the payload describes
// capabilities, not data.

import { getEnv } from "../config/env.js";
import { captchaEnabled, type CaptchaProvider } from "./captcha.js";
import { isDiscordConfigured } from "./discord.js";
import { buildExternalAnalyticsConfig, type ExternalAnalyticsProvider } from "./externalAnalytics.js";
import { POLICY_VERSIONS, isNewsletterSendEnabled } from "./newsletter.js";
import { ssoProvidersEnabled, type OAuthProvider } from "./oauth.js";
import { cryptoEnabled } from "./payments/crypto.js";
import { paypalEnabled } from "./payments/paypal.js";
import { stripeEnabled } from "./payments/stripe.js";
import { getPocketbaseConfig } from "./pocketbase/config.js";
import { TIP_COINS, tipsPaymentMode } from "./tips.js";

/** Storage backends that hand files to a third-party service. */
const THIRD_PARTY_STORAGE: ReadonlySet<string> = new Set(["r2", "b2", "s3"]);

export interface PolicyContext {
  /** Policy version identifiers, shared with the consent records. */
  versions: {
    tos: string;
    privacy: string;
  };
  analytics: {
    provider: ExternalAnalyticsProvider;
    enabled: boolean;
  };
  auth: {
    /** Email/password sign-in is core and cannot be disabled. */
    localSignIn: true;
    /** Which hosted identity providers this instance has configured. */
    sso: OAuthProvider[];
    /** Optional PocketBase sign-in provider (the only PocketBase capability). */
    pocketbaseSignIn: boolean;
    /** True when a PocketBase deployment exists but OAuth is switched off. */
    pocketbaseConfigured: boolean;
  };
  captcha: {
    provider: CaptchaProvider;
    enabled: boolean;
  };
  storage: {
    provider: string;
    /** True when uploads go to a third-party bucket rather than local disk. */
    thirdParty: boolean;
  };
  payments: {
    stripe: boolean;
    paypal: boolean;
    paypalMode: "sandbox" | "live";
    /** A cryptocurrency PAYMENT GATEWAY (BTCPay and similar) is configured. */
    crypto: boolean;
    cryptoCoins: string[];
  };
  /**
   * Per-profile commerce features.
   *
   * IMPORTANT: neither of these has an instance-level switch, so the legal
   * pages must NOT describe them as switched on or off. The product shop
   * appears on a profile when that profile's owner has added and enabled
   * products, and tipping appears when that owner enables `tipsEnabled` and
   * publishes a wallet address. What the instance does control is only the
   * payment rail:
   *
   *  - free shop products are delivered with no payment provider involved at
   *    all, so the shop is usable even with no gateway configured;
   *  - paid products need one of the gateways in `payments`;
   *  - tips go straight to the owner's wallet address unless a crypto gateway
   *    is configured, which is what `tipRail` reports.
   */
  commerce: {
    shop: true;
    /** A paid product can actually be purchased (a gateway is configured). */
    shopPaidCheckout: boolean;
    tips: true;
    /** Coins a profile owner can accept. Fixed by the app, not env-derived. */
    tipCoins: string[];
    /** Where a tip is routed: a crypto gateway, or straight to the wallet. */
    tipRail: "btcpay" | "address";
  };
  email: {
    /** True when this instance can send transactional/profile email at all. */
    mailConfigured: boolean;
    newsletter: boolean;
    /** True when the operator runs their own SMTP relay for newsletters. */
    selfSmtp: boolean;
    /** True when the platform's shared sender is available to this instance. */
    platformSmtp: boolean;
  };
  domains: {
    customDomains: true;
    automaticTls: boolean;
  };
  integrations: {
    discord: boolean;
    /** Background "is there a newer release" check against the public repo. */
    updateCheck: boolean;
  };
}

/**
 * Build the policy snapshot from the current environment. Pure: safe to call in
 * tests without a live server, and it re-reads the validated env on every call
 * so a config reload is reflected immediately.
 */
export function buildPolicyContext(): PolicyContext {
  const env = getEnv();
  const analytics = buildExternalAnalyticsConfig(env);
  const pocketbase = getPocketbaseConfig();

  return {
    versions: { tos: POLICY_VERSIONS.tos, privacy: POLICY_VERSIONS.privacy },
    analytics: {
      provider: analytics.provider,
      // "enabled" already folds in provider === matomo && url && siteId > 0.
      enabled: analytics.enabled,
    },
    auth: {
      localSignIn: true,
      sso: ssoProvidersEnabled(env),
      pocketbaseSignIn: pocketbase.enabled && pocketbase.oauthEnabled,
      pocketbaseConfigured: pocketbase.enabled,
    },
    captcha: {
      provider: env.CAPTCHA_PROVIDER,
      enabled: captchaEnabled(),
    },
    storage: {
      provider: env.STORAGE_PROVIDER,
      thirdParty: THIRD_PARTY_STORAGE.has(env.STORAGE_PROVIDER),
    },
    payments: {
      stripe: stripeEnabled(),
      paypal: paypalEnabled(),
      paypalMode: env.PAYPAL_MODE,
      crypto: cryptoEnabled(),
      cryptoCoins: env.CRYPTO_ENABLED
        ? env.CRYPTO_COINS.split(",")
            .map((coin) => coin.trim().toUpperCase())
            .filter(Boolean)
        : [],
    },
    commerce: {
      // Both features are always present; see the `commerce` doc comment.
      shop: true,
      // A paid product needs a real gateway. Free products never do, so this
      // flag describes paid checkout only and must not be read as "shop off".
      shopPaidCheckout: stripeEnabled() || paypalEnabled() || cryptoEnabled(),
      tips: true,
      tipCoins: [...TIP_COINS],
      tipRail: tipsPaymentMode(),
    },
    email: {
      // Any mail transport at all: the operator's own relay or the platform
      // sender. Without one the instance cannot send activity digests or
      // security notices, which the policy pages must then not promise.
      mailConfigured: env.SMTP_ENABLED || env.NEWSLETTER_PLATFORM_SMTP_ENABLED,
      newsletter: isNewsletterSendEnabled(),
      // A "custom" SMTP provider with a host configured means the operator
      // brought their own relay; the platform sender stays separate.
      selfSmtp: env.SMTP_ENABLED && env.SMTP_PROVIDER === "custom" && Boolean(env.SMTP_HOST.trim()),
      platformSmtp: env.NEWSLETTER_PLATFORM_SMTP_ENABLED,
    },
    domains: {
      customDomains: true,
      automaticTls: env.ACME_ENABLED,
    },
    integrations: {
      discord: isDiscordConfigured(),
      updateCheck: env.UPDATE_CHECK_ENABLED,
    },
  };
}
