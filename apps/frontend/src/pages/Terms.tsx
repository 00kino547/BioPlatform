import { usePageMeta } from "@/lib/seo";
import { branding } from "@/config/branding";
import { usePolicyContext } from "@/lib/usePolicyContext";
import type { PolicyContext } from "@/lib/api";
import { PolicyShell } from "@/components/legal/PolicyShell";
import {
  captchaLabel,
  compact,
  formatPolicyDate,
  paymentProviderList,
  proseList,
  ssoProviderList,
  storageLabel,
  type Maybe,
  type PolicySection,
} from "@/components/legal/policyText";

// Terms of Service, driven by the public `GET /api/policy/context` snapshot so
// the terms state what this deployment actually does. When the snapshot is
// unavailable (still loading, or the endpoint failed) `ctx` is null and every
// helper falls back to the neutral wording — we never claim a service is
// running when we could not find out. See apps/backend/src/lib/policyContext.ts.
//
// The per-section builders below are plain functions with early returns rather
// than one long nested ternary. That is deliberate: a conditional whose
// consequent is itself a conditional starting with an array literal is fragile
// to parse, and if/else reads better here anyway.
//
// This rewrite also fixes a pre-existing numbering bug: the old page rendered
// "9. Newsletter", then "9b. Product Shop", then "9a. Tips". The shared shell
// numbers strictly sequentially, so that ordering can no longer occur.

/** FALLBACK_VERSION matches POLICY_VERSIONS.tos in the backend. */
const FALLBACK_VERSION = "September 30, 2026";

function captchaPolicy(ctx: PolicyContext | null, captcha: string | null): Maybe<string> {
  if (captcha) {
    return `Registration and login on this instance are protected with a ${captcha} human-verification challenge. The challenge token is validated by the provider’s service; the provider operates under its own privacy policy, and by completing a challenge you accept that provider’s terms for the verification itself. We receive the verification result and nothing else from the challenge.`;
  }
  // No captcha configured: the sentence is simply absent. The policy never says
  // verification is missing, because the feature does not exist here.
  if (ctx) return null;
  return "Registration and login may include a human-verification challenge (captcha) provided by a third party such as Cloudflare Turnstile, Google reCAPTCHA, or hCaptcha. The challenge token is validated by the provider’s service; each provider operates under its own privacy policy. The instance operator does not receive any personal data from the challenge beyond the verification result.";
}

function signInParagraphs(ctx: PolicyContext | null, sso: string): string[] {
  if (!ctx) {
    return [
      "If you sign in with a third-party or self-hosted identity provider, only the information that provider returns to us is received (typically an identifier, an email address, a display name and an avatar image), and your credentials are submitted to that provider rather than to this backend. Each provider operates under its own terms and privacy policies, which we do not control.",
    ];
  }
  const out: string[] = [];

  if (ctx.auth.pocketbaseSignIn) {
    const lead = sso ? `, with ${sso}, or` : " or";
    out.push(
      `You can sign in with the email address and password on your account${lead} through a PocketBase instance operated by the instance operator. When you use the PocketBase sign-in button, your credentials are submitted to that operator-controlled PocketBase deployment through this site’s same-origin proxy, so your password never reaches this backend; PocketBase stores the credentials it needs to authenticate you.`,
    );
    if (sso) {
      out.push(`When you sign in with ${sso}, those providers operate under their own terms and privacy policies, which we do not control, and ${branding.name} is not responsible for their practices.`);
    }
    out.push("PocketBase is used for authentication and nothing else. It is not used to store your profile content, your uploaded files, or any visitor analytics.");
    return out;
  }

  // PocketBase absent (never configured) or present but switched off are the
  // SAME thing from the user's point of view: there is no PocketBase sign-in
  // button. Both are described by simply listing what IS available. Naming the
  // absent deployment ("configured but switched off") would tell a reader about
  // an infrastructure detail they can never interact with.
  {
    const lead = sso ? `, or with ${sso}` : "";
    const tail = sso
      ? ` Those providers operate under their own terms and privacy policies, which we do not control.`
      : "";
    out.push(
      `You can sign in with the email address and password on your account${lead}. Your credentials are sent only to ${branding.name}.${tail}`
    );
    return out;
  }

  if (sso) {
    out.push(`When you sign in with ${sso}, those providers operate under their own terms and privacy policies, which we do not control.`);
  }
  return out;
}

function storageSentence(ctx: PolicyContext | null): string {
  if (!ctx) return "";
  if (ctx.storage.thirdParty) {
    return ` Files you upload are stored in ${storageLabel(ctx.storage.provider)}, a third-party object store that processes them at our instruction under its own terms.`;
  }
  return ` Files you upload are stored in ${storageLabel(ctx.storage.provider)}.`;
}

function buildDomainsSection(ctx: PolicyContext | null): PolicySection {
  if (ctx && ctx.domains.automaticTls) {
    return {
      id: "domains",
      title: "Custom Domains",
      paragraphs: [],
      // Rendered as a node because the Let's Encrypt link has to sit *inside* the
      // sentence that refers to it.
      node: (
        <>
          <p className="text-zinc-400">
            You may associate a custom domain with your profile. You are responsible for configuring your domain&rsquo;s
            DNS settings correctly. Domain ownership must be verified before the domain becomes active. This instance
            issues and manages TLS certificates for you through Let&rsquo;s Encrypt — you acknowledge this and agree to
            the{" "}
            <a
              href="https://letsencrypt.org/terms-of-service/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300 transition-colors"
            >
              Let&rsquo;s Encrypt Terms of Service
            </a>
            .
          </p>
          <p className="text-zinc-400 mt-2">
            The instance operator may remove or disable custom domains at any time, for example if DNS verification
            fails, the domain expires, or the associated account is terminated.
          </p>
        </>
      ),
    };
  }

  if (ctx) {
    return {
      id: "domains",
      title: "Custom Domains",
      paragraphs: [
        `You may associate a custom domain with your profile. You are responsible for configuring your domain’s DNS settings correctly, and domain ownership must be verified before the domain becomes active. You provide and maintain a valid HTTPS certificate for your domain yourself; ${branding.name} does not obtain certificates on your behalf.`,
        "The instance operator may remove or disable custom domains at any time, for example if DNS verification fails, the domain expires, or the associated account is terminated.",
      ],
    };
  }

  return {
    id: "domains",
    title: "Custom Domains",
    paragraphs: [
      `You may associate a custom domain with your profile. You are responsible for configuring your domain’s DNS settings correctly. Domain ownership must be verified before the domain becomes active. When automatic TLS is enabled by the instance operator, ${branding.name} will obtain and manage Let’s Encrypt certificates on your behalf.`,
      "The instance operator may remove or disable custom domains at any time, for example if DNS verification fails, the domain expires, or the associated account is terminated.",
    ],
  };
}

/**
 * Discord wording, or `null` when the integration is not configured. An absent
 * integration leaves no trace in the policy at all.
 */
function discordPolicy(ctx: PolicyContext | null): Maybe<string> {
  if (ctx?.integrations.discord) {
    return "You may optionally connect a Discord account and share your live presence (online status and activity) on your public profile, and use the “Post to Discord” feature to push a profile embed to a webhook URL you provide. Presence is shared only with your explicit opt-in; you can disconnect your Discord account or disable presence sharing at any time, which stops the display of that data. You are responsible for how you present and share your own presence data. Discord operates under its own terms, which we do not control.";
  }
  if (ctx) return null;
  return "You may optionally connect a Discord account and share your live presence (online status and activity) on your public profile, and use the “Post to Discord” feature to push a profile embed to a webhook URL you provide. Presence is shared only with your explicit opt-in; you can disconnect your Discord account or disable presence sharing at any time.";
}

function buildEmailSection(ctx: PolicyContext | null): Maybe<PolicySection> {
  // No mail transport on this instance: the whole section is dropped rather
  // than describing email as unavailable.
  if (ctx && !ctx.email.mailConfigured) return null;
  return {
    id: "email",
    title: "Email Notifications",
    paragraphs: [
      `With your opt-in, ${branding.name} may send email notifications to the address on your account when your profile receives views or link clicks. Notifications are sent only if you have enabled them for the relevant profile, and only while they remain enabled. You can disable these notifications at any time from your settings. To reduce noise, notifications are rate-limited so multiple events within a short window trigger a single email.`,
      "We may also email you about important account or security matters, such as account recovery or security incidents; these notices are not optional and are sent regardless of your notification preferences.",
    ],
  };
}

function buildNewsletterSection(ctx: PolicyContext | null): Maybe<PolicySection> {
  // Newsletter sending off: the section disappears instead of saying so.
  if (ctx && !ctx.email.newsletter) return null;

  const paragraphs = [
    "Public profiles on this instance may offer a newsletter to visitors. Subscribing is an explicit, single opt-in: a subscriber enters their email address and checks a box agreeing to these Terms and the Privacy Policy. A subscription is never created without that agreement, and each profile runs its own independent newsletter list.",
    "If you run a newsletter on your profile, you are a sender and agree to comply with all applicable marketing and anti-spam law, including the US CAN-SPAM Act and Canada’s Anti-Spam Legislation (CASL). In particular, you agree to: only send to subscribers who genuinely opted in, keep accurate records of that consent, include identifying sender information and a mailing address (or a link to our website) in every email, and honor unsubscribe requests immediately and in all cases within 10 business days. Every newsletter we deliver on your behalf automatically includes a one-click unsubscribe link; you must not remove it or otherwise prevent subscribers from opting out.",
    "You must not add email addresses to your list without consent, buy or rent lists, harvest addresses, or misrepresent the identity of a sender. Distributing unsolicited commercial email is a violation of these Terms and may result in suspension or termination of your account. Sending is subject to per-tier volume limits and may be paused or disabled by the instance operator; a disabled or paused profile never sends mail.",
    "Subscriber data belongs to your subscribers. You may use it only to run your newsletter and must honor erasure requests (right to be forgotten) and any applicable data-protection rights. If you erase a subscriber, we remove the subscription so no further mail is sent.",
  ];

  // The own-SMTP obligation only applies where the instance actually allows a
  // profile owner to bring their own relay.
  if (ctx?.email.selfSmtp) {
    paragraphs.push(
      `You may optionally send through your own SMTP relay instead of ${branding.name}’s mail stack. If you do, you are responsible for the relay and credentials you configure and for all mail sent through it: you must only use a relay you are authorized to use, keep your credentials secure, and comply with that provider’s terms. Your SMTP password is encrypted at rest and used solely to deliver your newsletter. The instance operator may require manual approval before your own relay may send.`,
    );
  }

  return { id: "newsletter", title: "Newsletter", paragraphs };
}

/**
 * Invites bought for money, and the resale posture for them.
 *
 * Positive-only like the newsletter section: if this instance does not sell
 * invite credits, the section is omitted rather than announcing that the feature
 * is off. The resale paragraph matches the operator's published stance exactly —
 * a prohibition, a permission, or silence when the instance states none — so the
 * document can never contradict what the platform actually does.
 */
function buildInvitePurchaseSection(ctx: PolicyContext | null): Maybe<PolicySection> {
  // We could not read the snapshot, or this instance has no store running.
  if (!ctx?.invites?.purchaseEnabled) return null;

  const paragraphs = [
    `Invites may be purchased on ${branding.name} in fixed bundles of invite credits. Credits bought by an existing member are added to that account as a permanent balance; they do not expire and can be exchanged for invite codes at any time. Credits bought without an account are issued as time-limited invite codes by email, and redeeming one of those codes to register transfers any remaining codes from the same purchase to the new account.`,
    "Prices are shown in the configured currency and are charged at checkout through the payment providers the instance operator has enabled; we do not store card details. A purchase becomes final when the payment provider confirms it. If a purchase is refunded, any invite credits or codes from that purchase that have not been used are revoked. Credits you already redeemed and the access they granted are not affected, because revoking them cannot un-create an account.",
  ];

  if (ctx.invites.resaleRestricted) {
    paragraphs.push(
      "Invite codes purchased on this instance may not be resold, re-listed, shared for payment, or otherwise transferred for money. A code bought here is for your own registration or for the accounts you invite. Codes obtained by other means carry the same restriction where the instance operator has published it, and resale is grounds for suspension and for revoking the remaining codes of the offending purchase.",
    );
  } else if (ctx.invites.resalePermitted) {
    // The operator permits resale, so the permission is written down: a buyer who
    // sells their codes is acting on this clause rather than on an assumption.
    // Membership, subscription and billing on this instance are unaffected, and
    // transferring an account itself stays subject to the section above.
    paragraphs.push(
      `You may resell, re-list or otherwise transfer invite codes you hold on ${branding.name}, including codes you bought, for money or for free. A buyer of a code becomes responsible for registering with it, and the instance operator may still suspend an account that uses a code to abuse the service, and any such suspension can include revoking the codes of the offending purchase. Reselling a code does not transfer membership, subscription, billing history or any right to the account it was issued against.`,
      "Credits you bought are refunded on request under the refunds paragraph above, so reselling a code does not remove your right to a refund for a purchase you have not redeemed.",
    );
  }

  return { id: "invite-purchases", title: "Purchased Invites", paragraphs };
}

function buildShopSection(ctx: PolicyContext | null): PolicySection {
  const sellers = [
    "Public profiles may offer digital products for sale. If you list products, you are the seller: you are responsible for the product, its description, its price, the rights to distribute any file or preview image you upload, and for complying with all applicable consumer-protection, tax and intellectual-property law. Prices are shown in the configured currency and any profile-wide discount is applied by the platform at checkout.",
  ];

  // The shop has NO instance-level switch: it appears on a profile as soon as
  // that profile's owner adds and enables a product. So this section never
  // claims the shop is switched off. Only *paid* checkout depends on a gateway.
  if (ctx) {
    const processors = paymentProviderList(ctx);
    // Only name a payment processor when one exists. Saying "no provider is
    // configured" would describe an absent capability, which the pages never do;
    // the free-product path is stated positively instead and stands on its own
    // when no processor is available.
    return {
      id: "shop",
      title: "Product Shop",
      paragraphs: [
        sellers[0].replace("Public profiles may", "Public profiles on this instance may"),
        processors.length
          ? `Paid products on this instance are purchased through ${proseList(processors)}; we do not store card details.`
          : "A product listed with no price is claimed by the buyer without a payment step, and you deliver it directly.",
        "Purchases are final except where a refund is granted, in which case the buyer’s download access is revoked. You must not use the shop to sell unlawful content or to circumvent the platform’s acceptable-use rules.",
      ],
    };
  }

  return {
    id: "shop",
    title: "Product Shop",
    paragraphs: [
      sellers[0],
      "Payments are processed by the payment providers the instance operator has enabled; we do not store card details. Purchases are final except where a refund is granted, in which case the buyer’s download access is revoked. You must not use the shop to sell unlawful content or to circumvent the platform’s acceptable-use rules.",
    ],
  };
}

function buildTipsSection(ctx: PolicyContext | null): PolicySection {
  // Tipping is also per-profile and always available: `tipsEnabled` plus a
  // published BTC/LTC wallet address. It is NOT gated by the crypto payment
  // gateway, so it must never be described as disabled on this instance.
  const coins = ctx ? ctx.commerce.tipCoins.join(", ") : "cryptocurrency";
  const rail = ctx
    ? ctx.commerce.tipRail === "btcpay"
      ? " through the cryptocurrency payment gateway the instance operator has configured"
      : " straight to the profile owner’s published wallet address, without any payment provider acting as intermediary"
    : " directly to the profile owner’s wallet";

  return {
    id: "tips",
    title: "Tips",
    paragraphs: [
      ctx
        ? `Public profiles on this instance may let visitors send cryptocurrency tips (${coins}). Tips are voluntary: the visitor chooses the amount and may include an optional name and message, which are shown to the profile owner. Payments are made${rail}; we do not act as an intermediary or escrow for tips.`
        : "Public profiles may offer the ability for visitors to send cryptocurrency tips. Tips are voluntary: the visitor chooses the amount and may include an optional name and message, which are shown to the profile owner. Payments are made directly to the profile owner’s wallet; we do not act as an intermediary or escrow for tips.",
      "A profile shows a tipping block only when its owner enables tips and publishes a wallet address, and the owner may switch it off at any time, which also hides those addresses. If you enable tips you are responsible for the wallet addresses you publish and for complying with any applicable tax, financial-services or anti-money-laundering law in your jurisdiction. You may delete any tip record from your dashboard at any time.",
    ],
  };
}

export function Terms() {
  usePageMeta({
    title: "Terms of Service",
    description: `Read the terms of service governing use of ${branding.name}.`,
    url: "/terms",
  });

  const ctx = usePolicyContext();

  const versionDate = ctx ? formatPolicyDate(ctx.versions.tos) : FALLBACK_VERSION;
  const sso = ctx ? ssoProviderList(ctx) : "";
  const captcha = ctx ? captchaLabel(ctx) : null;

  const sections: Maybe<PolicySection>[] = [
    {
      id: "acceptance",
      title: "Acceptance of Terms",
      paragraphs: [
        `By accessing or using ${branding.name}, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service.`,
      ],
    },
    {
      id: "registration",
      title: "Account Registration",
      paragraphs: [
        `${branding.name} is an invite-only platform. Accounts may only be created using a valid invite code. The instance operator reserves the right to revoke invite codes, restrict new account creation, or temporarily disable registration at any time.`,
        "Repeated failed login attempts may result in a temporary IP-based lockout to prevent brute-force attacks. Users who attempt to bypass account security protections may have their access permanently restricted.",
        "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Enabling two-factor authentication and registering passkeys are recommended to protect your account.",
        captchaPolicy(ctx, captcha),
      ].filter((p): p is string => p !== null),
    },
    {
      id: "signin",
      title: "Sign-In Methods",
      paragraphs: signInParagraphs(ctx, sso),
    },
    {
      id: "acceptable-use",
      title: "Acceptable Use",
      paragraphs: [
        `You agree not to use ${branding.name} to: post content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable; impersonate any person or entity; distribute malware or spam; attempt to gain unauthorized access to other accounts or systems; or violate any applicable laws or regulations.`,
      ],
    },
    {
      id: "ownership",
      title: "Content Ownership",
      paragraphs: [
        `You retain ownership of any content you post on ${branding.name}. By posting content, you grant us a non-exclusive license to display, store, and serve your content as part of the service. We will never claim ownership of your content.`,
      ],
    },
    {
      id: "music",
      title: "Music, Embeds and Third-Party Sources",
      paragraphs: [
        `${branding.name} allows you to link or embed music from third-party services such as Spotify and YouTube, upload your own audio files, and optionally provide an additional “full version” streaming source for your tracks.${storageSentence(ctx)} You are solely responsible for any content you link, upload, or stream, including ensuring you have the right to share it.`,
        "Some services (for example Spotify) restrict playback of full tracks unless the listener has an account with them. Any “full version” source you provide — including streams that may rely on your own account, credentials, or session — is done at your own risk. You acknowledge that such use may violate the terms of service of the third-party platform, and you agree to comply with those terms yourself and to assume full responsibility for them.",
        `${branding.name} does not host, authorize, or endorse the “full version” sources you provide, and we are not liable for any claims, losses, or actions arising from your use of third-party services, including any violation of their terms.`,
      ],
    },
    buildDomainsSection(ctx),
    {
      id: "webhooks",
      title: "Webhooks, Integrations and Discord",
      paragraphs: [
        `You may configure outgoing webhooks to receive notifications about activity on your profile (views, link clicks, etc.) on endpoints you control. You are solely responsible for the availability, security, and privacy practices of the webhook endpoints you configure. ${branding.name} will send data to the URLs you provide and does not control how that data is handled after delivery.`,
        "You may revoke or rotate webhook secrets at any time through your dashboard. The instance operator may remove webhook configurations that are being abused or that violate these terms.",
        discordPolicy(ctx),
      ].filter((p): p is string => p !== null),
    },
    buildEmailSection(ctx),
    buildNewsletterSection(ctx),
    buildInvitePurchaseSection(ctx),
    buildShopSection(ctx),
    buildTipsSection(ctx),
    {
      id: "api",
      title: "Access to the API",
      paragraphs: [
        `${branding.name} exposes a documented HTTP API (see the API documentation and OpenAPI specification) that supports integration with your account and profile. Use of the API is subject to these Terms, including the Acceptable Use provisions. You are responsible for requests you make and for any application or service you build on top of the API.`,
        "We may impose rate limits or restrict access to protect the service from abuse or degradation. Repeatedly exceeding these limits, placing an unreasonable load on the service, or using the API to circumvent any security measure may result in temporary or permanent suspension of API access or your account.",
      ],
    },
    {
      id: "availability",
      title: "Service Availability and Security Updates",
      paragraphs: [
        `We strive to keep ${branding.name} available at all times, but we do not guarantee uninterrupted access. We may perform maintenance, updates, or experience downtime without prior notice.`,
        "When a critical security update is available, certain account security operations (such as changing your password, managing passkeys, or configuring two-factor authentication) may be temporarily restricted until the instance is updated. This is a safety measure to protect all users of the platform. Similarly, administrative operations that could affect system security may be restricted during this window. The instance operator is responsible for applying updates promptly.",
      ],
    },
    {
      id: "termination",
      title: "Termination",
      paragraphs: [
        "We reserve the right to suspend or terminate your account at our discretion, with or without cause, including for violations of these Terms. Upon termination, your right to use the service ceases immediately.",
      ],
    },
    {
      id: "liability",
      title: "Limitation of Liability",
      paragraphs: [
        `${branding.name} is provided “as is” without warranties of any kind. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.`,
      ],
    },
    {
      id: "changes",
      title: "Changes to Terms (Deemed Acceptance)",
      paragraphs: [
        `We may update these Terms from time to time. Each update is published on this page with a new version number and an effective date, and we will notify you of material changes through the service or by email. The version of these Terms you accepted (including the original version you agreed to when you first used ${branding.name}) is retained in your consent history and remains visible to you whenever you review your account’s consent records.`,
        `The current version takes effect on ${versionDate}. If you do not review the update, you will be deemed to have accepted it if you continue to use ${branding.name} for more than thirty (30) days after that version’s effective date. Continued use of the platform for more than 30 days after an update is published constitutes your acceptance of the updated version, even if you did not open or check the update. If you do not wish to accept an updated version, you must stop using the platform before the end of that 30-day period.`,
        `Operator accounts. The instance operator may designate certain staff roles as operator accounts so that a policy update does not lock the operator out of the panel they administer. When a new version becomes effective, those accounts are recorded as having accepted it automatically — but only after the same thirty (30) day review period described above, never on the day the update is published, and only once the account is actually used again after that period. The automatic acceptance is written to your account with a timestamp and a record that the platform recorded it rather than an individual accepting it, so it is never presented as a personal click-through. Until that period has elapsed, operator accounts must accept the new version themselves, exactly like any other account. The roles covered are configurable by the instance operator and, by default, consist only of the built-in administrator role; if you are an operator account and do not wish to be covered, accept the terms yourself.`,
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: [],
      node: (
        <p className="text-zinc-400">
          For questions about these Terms, please{" "}
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

  return (
    <PolicyShell
      title="Terms of Service"
      versionDate={versionDate}
      sections={compact(sections)}
      subsections={[]}
    />
  );
}
