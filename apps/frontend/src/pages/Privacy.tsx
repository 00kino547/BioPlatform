import { usePageMeta } from "@/lib/seo";
import { branding } from "@/config/branding";
import { usePolicyContext } from "@/lib/usePolicyContext";
import type { PolicyContext } from "@/lib/api";
import { PolicyShell } from "@/components/legal/PolicyShell";
import {
  captchaLabel,
  formatPolicyDate,
  paymentProviderList,
  proseList,
  ssoProviderList,
  storageLabel,
  type Maybe,
  type PolicySection,
} from "@/components/legal/policyText";

// Privacy Policy, driven by the public `GET /api/policy/context` snapshot so
// the legal text states what this deployment actually does instead of hedging
// with "the instance operator may optionally enable ...". When the snapshot is
// unavailable `ctx` is null and every helper falls back to the neutral wording.
// See apps/backend/src/lib/policyContext.ts.
//
// The per-section builders are plain functions with early returns rather than
// long nested ternaries: a conditional whose consequent is itself a conditional
// beginning with an array literal is fragile to parse, and if/else reads better.
//
// Rendering note: the paragraphs below are interpolated strings, and React does
// NOT decode HTML entities inside them, so they use real Unicode punctuation
// (’ “ ”) rather than &rsquo; / &quot;.

/** FALLBACK_VERSION matches POLICY_VERSIONS.privacy in the backend. */
const FALLBACK_VERSION = "September 30, 2026";

function storageParagraph(ctx: PolicyContext | null): string {
  if (!ctx) {
    return "Your data is stored on servers operated by us or our hosting providers. We implement industry-standard security measures including bcrypt password hashing, JWT authentication, encrypted storage of sensitive credentials (TOTP secrets, passkey data, webhook URLs, Discord tokens), and HTTPS encryption. However, no method of electronic transmission or storage is 100% secure.";
  }
  const where = storageLabel(ctx.storage.provider);
  // Both branches state only where files go. The operator's decision not to use
  // a third-party object store is an implementation detail, not data a reader
  // needs disclosed as an absence.
  const thirdParty = `, and files you upload are kept in ${where}`;
  return `Your data is stored on servers operated by us or our hosting providers${thirdParty}. We implement industry-standard security measures including bcrypt password hashing, JWT authentication, encrypted storage of sensitive credentials (TOTP secrets, passkey data, webhook URLs, Discord tokens), and HTTPS encryption. However, no method of electronic transmission or storage is 100% secure.`;
}

function uploadParagraph(ctx: PolicyContext | null): string {
  if (!ctx) {
    return "Avatar and banner images you upload are stored on our servers. If you upload audio for music tracks on your profile, those files are also stored on our servers and streamed to visitors when played. You may delete your uploads at any time through your dashboard. We validate file types and enforce size limits to maintain platform security.";
  }
  const where = storageLabel(ctx.storage.provider);
  if (ctx.storage.thirdParty) {
    return `Avatar and banner images you upload are stored in ${where}, and if you upload audio for music tracks on your profile those files are streamed from the same store. ${branding.name} acts as the intermediary between you and that provider, which processes the files solely at our instruction and under its own privacy policy. You may delete your uploads at any time through your dashboard. We validate file types and enforce size limits to maintain platform security.`;
  }
  return `Avatar and banner images you upload are stored in ${where}. If you upload audio for music tracks on your profile, those files are also stored there and streamed to visitors when played. You may delete your uploads at any time through your dashboard. We validate file types and enforce size limits to maintain platform security.`;
}

function matomoParagraph(ctx: PolicyContext | null): Maybe<string> {
  if (!ctx) {
    // Context unavailable: describe only what is certainly true of this product
    // and never name a vendor that may not be deployed. Naming a speculative
    // analytics service here would be a phantom capability.
    return "Aggregate traffic measurement is stored on infrastructure we operate; your data is not shared with external analytics providers. Analytics scripts and cookies are only loaded after you accept non-essential cookies and are never loaded for visitors whose browser sends Do Not Track or Global Privacy Control.";
  }
  if (ctx.analytics.enabled) {
    return `This instance runs ${branding.name}’s self-hosted web analytics service (Matomo) on its own infrastructure to measure site traffic; your data is not shared with an external analytics provider. Matomo’s scripts and cookies are loaded only after you accept non-essential cookies, and are never loaded for visitors whose browser sends Do Not Track or Global Privacy Control. The same consent choice governs both the aggregate analytics described above and the Matomo measurements.`;
  }
  // No external analytics configured: say nothing at all rather than telling
  // visitors which trackers are absent.
  return null;
}

function signInParagraphs(ctx: PolicyContext | null, sso: string): string[] {
  if (!ctx) {
    return [
      "If you sign in with a third-party or self-hosted identity provider, only the information that provider returns to us is received (typically an identifier, an email address, a display name and an avatar image), and your credentials are submitted to that provider rather than to this backend. Each provider operates under its own privacy policy, which we do not control.",
    ];
  }

  const out: string[] = [];
  if (ctx.auth.pocketbaseSignIn) {
    const lead = sso ? `, and optionally with ${sso}, or` : " or";
    out.push(
      `This instance offers sign-in with email and password${lead} through a PocketBase instance operated by the instance operator. When you use the PocketBase sign-in button, your credentials are submitted directly to that operator-controlled PocketBase deployment through this site’s same-origin proxy, so your password never reaches this backend; PocketBase stores the credentials it needs to authenticate you. PocketBase is used for sign-in and nothing else — it is not used to collect or process visitor analytics, to store your files, or to hold any other content.`,
    );
    if (sso) {
      out.push(`Sign-in with ${sso} shares only the profile information those providers return to us (typically an identifier, an email address, a display name and an avatar image). Each provider operates under its own privacy policy, which we do not control.`);
    }
    return out;
  }

  // PocketBase absent (never configured) or present but switched off are the
  // SAME thing from the reader's point of view: no PocketBase sign-in button
  // exists. Both are described by stating only what IS collected, which is the
  // email address and the password check performed by this backend. Naming the
  // absent deployment would disclose an infrastructure detail that is not
  // collectible data and that nobody can interact with.
  {
    const lead = sso ? `, and with ${sso}` : "";
    const ssoTail = sso
      ? ` Sign-in with ${sso} shares only the profile information those providers return to us (typically an identifier, an email address, a display name and an avatar image). Each provider operates under its own privacy policy, which we do not control.`
      : "";
    out.push(
      `This instance offers sign-in with email and password${lead}. Sign-in sends your email address and the password you type to ${branding.name} for verification, over the same site connection that serves this page.${ssoTail}`
    );
  }

  if (ctx.auth.pocketbaseConfigured && sso) {
    out.push(`Sign-in with ${sso} is available, sharing only the profile information those providers return to us.`);
  }
  return out;
}

function captchaSections(ctx: PolicyContext | null): PolicySection[] {
  const captcha = ctx ? captchaLabel(ctx) : null;
  if (!captcha) return [];
  return [
    {
      id: "abuse",
      title: "Abuse Protection",
      paragraphs: [
        `Sign-up and other abuse-prone forms on this instance are protected with ${captcha}. The CAPTCHA provider receives the request it needs to score the submission (and, where the provider’s API requires it, the submitting IP address) and acts as a third party under its own privacy policy. The resulting token is verified server-side and the token itself is never stored.`,
      ],
    },
  ];
}

function discordSections(ctx: PolicyContext | null): PolicySection[] {
  if (!ctx?.integrations.discord) return [];
  return [
    {
      id: "discord",
      title: "Discord Integration",
      paragraphs: [
        `When you connect a Discord account, ${branding.name} receives from Discord only the data granted by the OAuth identify scope: your Discord user ID, username, global name, and avatar. The access and refresh tokens are stored encrypted and are used solely to keep your account link valid. Connecting is optional and always opt-in.`,
        "Live presence (online status, current activity, custom status) is shown only when you have explicitly turned on presence sharing for a profile. The bot observes presence only for users who are in a server shared with it; if you never enable presence sharing, your status is never read or displayed. Presence data is held in memory and is not retained.",
        "The optional “Post to Discord” feature sends a profile embed (display name, profile link, avatar, bio, and — when enabled — your current status) to a webhook URL you provide. Webhook URLs are stored encrypted. Discord is a third party and operates under its own privacy policy, which we do not control.",
      ],
    },
  ];
}

function domainSections(ctx: PolicyContext | null): PolicySection[] {
  if (ctx && !ctx.domains.automaticTls) {
    return [
      {
        id: "domains",
        title: "Custom Domains",
        paragraphs: [
          "If you configure a custom domain for your profile, the domain name and a verification token are stored to confirm ownership. You provide and maintain a valid HTTPS certificate for your domain yourself.",
        ],
      },
    ];
  }
  return [
    {
      id: "domains",
      title: "Custom Domains and TLS",
      paragraphs: [
        `If you configure a custom domain for your profile, the domain name and a verification token are stored to confirm ownership. ${ctx ? "This instance issues TLS certificates automatically through" : "When automatic TLS (HTTPS) is enabled,"} Let’s Encrypt TLS certificates and the associated account key are obtained and stored on the server to enable encrypted connections for your domain. Certificate data is used solely to serve your profile over HTTPS and is renewed automatically before expiry.`,
      ],
    },
  ];
}

function versionSections(ctx: PolicyContext | null): PolicySection[] {
  if (ctx && !ctx.integrations.updateCheck) return [];
  return [
    {
      id: "version",
      title: "Version Checking",
      paragraphs: [
        `${branding.name} periodically checks for available software updates by fetching the project’s public CHANGELOG from GitHub (via raw.githubusercontent.com, the GitHub API, and cdn.jsdelivr.net). No personal information is transmitted in these requests — only the public repository URL is used. The check runs in the background on the server at startup and every 12 hours; the result is cached and served to all visitors to display the current version badge.`,
      ],
    },
  ];
}

function emailSections(ctx: PolicyContext | null): PolicySection[] {
  // No mail transport on this instance: the section is dropped entirely.
  if (ctx && !ctx.email.mailConfigured) return [];
  return [
    {
      id: "email",
      title: "Email Notifications",
      paragraphs: [
        `If you opt in to email notifications for profile activity, we use the email address on your account to send you a digest when your profile receives views or link clicks. Notifications are only sent while the relevant setting is enabled and are rate-limited to avoid excessive email volume; you can disable them at any time from your settings. Important account or security notices (for example, account recovery) are sent to the email address on your account.`,
      ],
    },
  ];
}

function newsletterSections(ctx: PolicyContext | null): PolicySection[] {
  // Newsletter sending off: the section is dropped rather than announcing it.
  if (ctx && !ctx.email.newsletter) return [];

  const paragraphs = [
    "Public profiles on this instance may offer a newsletter. Subscribing is always an explicit, single opt-in: you voluntarily enter your email address and tick a checkbox agreeing to these Terms and the Privacy Policy. Subscribing never happens silently.",
    "When you subscribe we store your email address, the time you subscribed, the time you agreed, the versions of these Terms and the Privacy Policy you agreed to, and whether you have unsubscribed. The IP address and browser user-agent captured to evidence consent are kept only in memory for 24 hours and are never written to the database. Your email address is used solely for the newsletters of the profile you subscribed to and is never shared with third parties.",
    `Every newsletter we send identifies ${branding.name} or the sender, includes a physical postal address (or a link to our website when none is set), and provides a clear, one-click unsubscribe link. Unsubscribe requests are honored immediately and in all cases within 10 business days, as required by the US CAN-SPAM Act and Canada’s Anti-Spam Legislation (CASL). After unsubscribing you will receive no further newsletters and can resubscribe at any time.`,
    "Newsletter sending is subject to per-profile and per-tier volume limits; a paused or disabled newsletter profile never sends mail, even to existing subscribers.",
  ];

  if (ctx?.email.selfSmtp) {
    paragraphs.push(
      `A profile owner on this instance may send through their own SMTP relay instead of ${branding.name}’s mail stack. In that case the owner provides the relay host and credentials; the SMTP password is encrypted at rest (AES-256-GCM) and used only to deliver that profile’s newsletter. It is never returned in API responses and is never shared with third parties. Subscriber email addresses are transmitted to that relay solely to deliver the newsletter the subscriber opted into.`,
    );
  }

  return [{ id: "newsletter", title: "Newsletter", paragraphs }];
}

/**
 * What we hold for a paid invite purchase.
 *
 * Omitted entirely when the instance has no invite store, matching the
 * positive-only rule used elsewhere on this page: the policy describes what this
 * deployment actually does, not what it might be configured to do.
 */
function invitePurchaseSections(ctx: PolicyContext | null): PolicySection[] {
  if (!ctx?.invites?.purchaseEnabled) return [];

  const processors = paymentProviderList(ctx);
  const paid = processors.length
    ? `Payment is taken through ${proseList(processors)}, whose own privacy policy governs the payment details; we store the purchase amount, currency, status and the payment-gateway transaction reference, but never card or wallet credentials.`
    : "Payment is taken through the payment provider the instance operator has enabled, whose own privacy policy governs the payment details; we store the purchase amount, currency, status and the payment-gateway transaction reference, but never card or wallet credentials.";

  const paragraphs = [
    `Invite credits may be purchased on ${branding.name}. ${paid}`,
    "If you buy without an account, you are identified only by the email address you give us so we can deliver your invite codes. That address is stored on the purchase record, is used to fulfil and support the order, and is removed or made irrelevant once the codes are claimed.",
    `Each purchase records which invite credits and codes came from it, so the operator can tell purchased credits apart from credits earned through events and roles, revoke what an order still holds if it is refunded, and answer a question about where a given code came from. Codes you have already redeemed, and the accounts created with them, are not revoked.`,
  ];

  if (ctx.invites.resaleRestricted) {
    paragraphs.push(
      "Because resale is prohibited on this instance, a purchased code is linked to the order it was paid for. That link exists to enforce the resale rule and to handle refunds and disputes; it is not used for advertising, profiling, or automated decisions.",
    );
  } else if (ctx.invites.resalePermitted) {
    // Stated because it changes who the data belongs to: a permitted code may end
    // up being registered by a third party, and that person becomes the account
    // holder rather than a party to the order.
    paragraphs.push(
      "Reselling invite codes is permitted on this instance, so a code you transfer may be registered by someone else. The account created with that code is that person's account, and the email address on the purchase record remains attached to your order for refunds and support rather than moving to them. We do not require the name or contact details of whoever buys a code, and we do not use code transfers for advertising, profiling, or automated decisions.",
    );
  }

  return [{ id: "invite-purchases", title: "Purchased Invites", paragraphs }];
}

function shopSections(ctx: PolicyContext | null): PolicySection[] {
  // The shop has no instance-level switch (see the `commerce` block in the
  // policy context), so it is never described as inactive here. Only the paid
  // path depends on a configured payment provider.
  if (ctx) {
    const processors = paymentProviderList(ctx);
    // With no gateway configured there is no payment processing to disclose, so
    // only the free-product path is described.
    const paid = processors.length
      ? `For a paid product we store the product’s title, description and price, the buyer’s email address, the purchase status and a payment-gateway transaction reference, and we send the buyer to ${proseList(processors)}, whose own privacy policy governs the payment.`
      : "A product listed as free (no price) is delivered immediately on request, and no buyer or payment data is collected for it.";
    return [
      {
        id: "shop",
        title: "Product Shop",
        paragraphs: [
          `Public profiles on this instance may offer digital products for sale. ${paid} We do not store card or wallet credentials. Download links are signed and time-limited.`,
          "If you buy without signing in, you are identified only by the email address you provide so the download link can be delivered to you; that address is used solely to fulfil and support the purchase.",
        ],
      },
    ];
  }

  return [
    {
      id: "shop",
      title: "Product Shop",
      paragraphs: [
        "Public profiles may offer digital products for sale. To fulfil a purchase we store the product’s title, description and price, the buyer’s email address, the purchase status and a payment-gateway transaction reference, and we send the buyer to the configured payment provider (for example Stripe, PayPal, or a cryptocurrency gateway) whose own privacy policy governs the payment. We do not store card or wallet credentials. Download links are signed and time-limited.",
        "If you buy without signing in, you are identified only by the email address you provide so the download link can be delivered to you; that address is used solely to fulfil and support the purchase.",
      ],
    },
  ];
}

function tipSections(ctx: PolicyContext | null): PolicySection[] {
  // Tipping is per-profile and always available; it is NOT switched on or off
  // at instance level, so the wording must not claim it is disabled.
  const coins = ctx ? ctx.commerce.tipCoins.join(", ") : "";
  const coinText = coins ? ` (${coins})` : "";
  const viaGateway = ctx?.commerce.tipRail === "btcpay";

  return [
    {
      id: "tips",
      title: "Tips",
      paragraphs: [
        `Public profiles on this instance may offer cryptocurrency tips${coinText}. Tipping is always voluntary: you choose the amount and may include an optional name and message that are shown to the profile owner. Wallet addresses are provided by the profile owner and payments are sent ${viaGateway ? "through the cryptocurrency payment gateway configured by the instance operator" : "directly to the profile owner’s wallet, without a payment provider acting as intermediary"}. We do not process or store the coins themselves; the payment provider (where one is involved) and the profile owner receive the applicable payment data.`,
        "A profile shows a tipping block only when its owner enables tips and publishes a wallet address. The owner may disable tips at any time (which also hides their wallet addresses), and may delete any tip record from their dashboard.",
      ],
    },
  ];
}

export function Privacy() {
  usePageMeta({
    title: "Privacy Policy",
    description: `Read how ${branding.name} collects, uses, and protects your data.`,
    url: "/privacy",
  });

  const ctx = usePolicyContext();
  const versionDate = ctx ? formatPolicyDate(ctx.versions.privacy) : FALLBACK_VERSION;
  const sso = ctx ? ssoProviderList(ctx) : "";

  const sections: PolicySection[] = [
    {
      id: "collect",
      title: "Information We Collect",
      paragraphs: [
        `When you create an account on ${branding.name}, we collect your email address, username, and password (stored as a bcrypt hash). We also store any profile information you choose to provide, including display name, bio, avatar, banner, location, website, social links, theme preferences, and profile badges.`,
        "For security and abuse prevention, we record your IP address at registration and your most recent login IP address. Failed authentication attempts are logged with your IP address, a hash of your browser user-agent string, and an anonymous browser fingerprint cookie. These logs are retained for up to 30 days and then automatically deleted.",
        "If you enable passkey (WebAuthn) login, we store the public key and credential identifier for each registered passkey. If you enable two-factor authentication using an authenticator app, we store your TOTP secret encrypted at rest. Neither passkey private keys nor TOTP secrets are ever stored.",
        "To verify that a registered passkey is genuinely discoverable (resident), we store the timestamp of its most recent successful discoverable sign-in. This verification mark is refreshed only by an actual passkey sign-in and expires after a fixed number of days (14 by default) without one; it is used exclusively by account administrators to review account security and is never shown on your public profile.",
      ],
    },
    {
      id: "use",
      title: "How We Use Your Information",
      paragraphs: [
        `We use your information to provide and maintain the ${branding.name} service, to personalize your experience, and to communicate with you about your account. We do not sell, trade, or otherwise transfer your personal information to third parties.`,
        "IP addresses and authentication logs are used solely for security purposes: to detect and prevent brute-force attacks, to evaluate login trust, and to enforce temporary account lockouts when repeated failures are detected.",
      ],
    },
    {
      id: "storage",
      title: "Data Storage and Security",
      paragraphs: [storageParagraph(ctx)],
    },
    {
      id: "uploads",
      title: "File Uploads",
      paragraphs: [uploadParagraph(ctx)],
    },
    {
      id: "cookies",
      title: "Cookies and Tracking",
      paragraphs: [
        `${branding.name} uses two categories of cookies:`,
        "When you first visit, a consent banner lets you choose “Accept all” (enables the analytics cookie) or “Essential only”. When the banner first appears, the “Essential only” option becomes selectable after a short countdown, so accepting non-essential cookies cannot happen accidentally. You can change your choice at any time through the “Cookie settings” link on the site or by clearing cookies.",
        "We honor browser-level privacy signals: if your browser sends the Do Not Track header (DNT: 1) or Global Privacy Control (Sec-GPC: 1), no analytics cookies are set and no non-essential analytics run at all — even if you previously accepted. This preference always takes precedence over any stored choice.",
        "We do not use third-party advertising cookies or analytics services that track you across websites.",
      ],
      extra: (
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-zinc-400">
          <li>
            <span className="font-medium text-zinc-300">Essential cookies</span> (always active, no consent needed): the
            authentication session cookie and a browser fingerprint cookie used to protect against brute-force attacks and
            rate-limit abuse. These are required for the service to function securely and are set automatically.
          </li>
          <li>
            <span className="font-medium text-zinc-300">Non-essential analytics cookie</span> (
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">bp_vid</code>): a single anonymous
            cookie used to distinguish unique visitors and count unique profile views and link clicks. It contains no
            personal information. This cookie is set only after you explicitly accept non-essential cookies via the
            consent banner.
          </li>
        </ul>
      ),
    },
    {
      id: "retention",
      title: "Data Retention",
      paragraphs: [
        "We retain your account data for as long as your account is active. Analytics data (page views and link clicks) is automatically deleted after 90 days. Authentication failure logs (IP addresses, hashed user-agent strings, browser fingerprints) are retained for up to 30 days and then automatically deleted. Newsletter subscription records are retained only while the profile runs a newsletter and you remain subscribed; they are deleted when you unsubscribe, when the profile owner erases them, or when the account is deleted. Product purchase records are retained to honour refunds, download access and accounting obligations. Custom domain TLS certificates are retained until renewed or the domain is removed. You may request account deletion by contacting us. Upon deletion, your personal data will be removed from our active systems, though some data may be retained in backups for a limited period.",
      ],
    },
    {
      id: "rights",
      title: "Your Rights",
      paragraphs: [
        "You have the right to access, update, or delete your personal information at any time through your dashboard. You may also export your data or request complete account deletion by contacting us. Through your dashboard you can manage your registered passkeys, two-factor authentication settings, linked Discord account, webhook configurations, and custom domains. If you subscribed to a newsletter, the profile owner may remove your subscription and you may unsubscribe at any time with one click from any newsletter email; you may also request that your consent records be erased.",
      ],
    },
    {
      id: "changes",
      title: "Changes to This Policy",
      paragraphs: [
        "We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the “Last updated” date.",
        `Taking effect on ${versionDate}, if we publish a revised version of this Privacy Policy (or the Terms of Service) and you continue to use ${branding.name} without checking or reading the updated version for more than thirty (30) days after that version’s effective date, you will be deemed to have accepted the updated version. Your original, pinned acceptance remains on record and is never overwritten; continued use for more than 30 days after the new version’s effective date is treated as acceptance of the updated policy for consent-status purposes, based on your last login being at least 30 days after that effective date.`,
        `Automatic acceptance for operator accounts. The instance operator may designate certain staff roles as operator accounts so that a policy update does not lock the operator out of the panel they administer. For those accounts we may record the accepted Terms and Privacy Policy versions automatically, but only after the same thirty (30) day period described above and only once the account is used again afterwards — never on the day the update is published. The recorded acceptance stores which versions were accepted, when, and a flag marking that the platform recorded it rather than an individual doing so, so an automatic acceptance is never recorded as, or reported as, a personal click-through. Accepting the terms yourself clears that flag. The roles covered are chosen by the instance operator and by default consist only of the built-in administrator role.`,
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: [],
      node: (
        <p className="text-zinc-400">
          If you have questions about this Privacy Policy, please{" "}
          <a
            href={branding.contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 transition-colors"
          >
            contact us
          </a>
          .
        </p>
      ),
    },
  ];

  // Subsections hang off section 5 (Cookies and Tracking) and are numbered from
  // 5.1 in render order, so removing a section for a disabled capability
  // renumbers the rest instead of leaving a gap.
  const subsections: PolicySection[] = [
    {
      id: "analytics",
      title: "Analytics Data",
      paragraphs: [
        "Profile owners can view aggregated analytics for their public profiles, including total and unique views, link clicks, referrer URLs, and browser types. This data is derived from IP addresses, user-agent strings, and the bp_vid cookie, which is only set for visitors who accepted non-essential cookies. Individual visitor identities are never exposed — analytics are shown only as aggregate counts and trends. All analytics data is retained for 90 days and then automatically deleted.",
        matomoParagraph(ctx),
      ].filter((p): p is string => p !== null),
    },
    {
      id: "signin",
      title: "Sign-In Providers",
      paragraphs: signInParagraphs(ctx, sso),
    },
    ...captchaSections(ctx),
    {
      id: "embeds",
      title: "Third-Party Embedded Content",
      paragraphs: [
        "Profiles may embed music from third-party providers such as Spotify and YouTube. YouTube embeds use the privacy-enhanced youtube-nocookie.com domain, which does not set tracking cookies on your visit. Spotify and other providers set their own cookies in the embedded player; those providers operate under their own privacy policies, which we do not control. We are not responsible for the privacy practices of third-party platforms.",
      ],
    },
    ...discordSections(ctx),
    {
      id: "webhooks",
      title: "Webhooks and Integrations",
      paragraphs: [
        "You may configure outgoing webhooks to receive notifications about profile events (views, link clicks, etc.) on endpoints you provide. Webhook URLs and secrets are stored encrypted and are used only to deliver the events you request. You are responsible for the privacy practices of the endpoints you configure — we do not control how third-party webhook receivers handle the data they receive.",
      ],
    },
    ...domainSections(ctx),
    ...versionSections(ctx),
    ...emailSections(ctx),
    ...newsletterSections(ctx),
    ...invitePurchaseSections(ctx),
    ...shopSections(ctx),
    ...tipSections(ctx),
  ];

  return (
    <PolicyShell title="Privacy Policy" versionDate={versionDate} sections={sections} subsections={subsections} />
  );
}
