import { usePageMeta } from "@/lib/seo";
import { Trans, useTranslation } from "react-i18next";
import { branding } from "@/config/branding";
import { usePolicyContext } from "@/lib/usePolicyContext";
import type { PolicyContext } from "@/lib/api";
import { PolicyShell } from "@/components/legal/PolicyShell";
import {
  captchaLabel,
  compact,
  formatPolicyDate,
  lt,
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

function captchaPolicy(ctx: PolicyContext | null, captcha: string | null): Maybe<string> {
  if (captcha) {
    return lt("terms.sections.registration.captcha", { captcha });
  }
  // No captcha configured: the sentence is simply absent. The policy never says
  // verification is missing, because the feature does not exist here.
  if (ctx) return null;
  return lt("terms.sections.registration.captchaFallback");
}

function signInParagraphs(ctx: PolicyContext | null, sso: string): string[] {
  if (!ctx) {
    return [lt("terms.sections.signIn.fallback")];
  }
  const out: string[] = [];

  if (ctx.auth.pocketbaseSignIn) {
    const lead = sso ? lt("terms.sections.signIn.pocketbaseLeadWithSso", { sso }) : lt("terms.sections.signIn.pocketbaseLeadWithoutSso");
    out.push(lt("terms.sections.signIn.pocketbase", { lead }));
    if (sso) {
      out.push(lt("terms.sections.signIn.pocketbaseSso", { sso, app: branding.name }));
    }
    out.push(lt("terms.sections.signIn.pocketbaseOnly"));
    return out;
  }

  // PocketBase absent (never configured) or present but switched off are the
  // SAME thing from the user's point of view: there is no PocketBase sign-in
  // button. Both are described by simply listing what IS available. Naming the
  // absent deployment ("configured but switched off") would tell a reader about
  // an infrastructure detail they can never interact with.
  {
    const lead = sso ? lt("terms.sections.signIn.passwordLeadWithSso", { sso }) : "";
    const tail = sso ? lt("terms.sections.signIn.passwordTail") : "";
    out.push(lt("terms.sections.signIn.password", { lead, app: branding.name, tail }));
    return out;
  }

  if (sso) {
    out.push(lt("terms.sections.signIn.sso", { sso }));
  }
  return out;
}

function storageSentence(ctx: PolicyContext | null): string {
  if (!ctx) return "";
  if (ctx.storage.thirdParty) {
    return lt("terms.sections.music.storageThirdParty", { provider: storageLabel(ctx.storage.provider) });
  }
  return lt("terms.sections.music.storageLocal", { provider: storageLabel(ctx.storage.provider) });
}

function buildDomainsSection(ctx: PolicyContext | null): PolicySection {
  if (ctx && ctx.domains.automaticTls) {
    return {
      id: "domains",
      title: lt("terms.sections.domains.title"),
      paragraphs: [],
      // Rendered as a node because the Let's Encrypt link has to sit *inside* the
      // sentence that refers to it.
      node: (
        <>
          <p className="text-zinc-400">
            <Trans
              ns="legal"
              i18nKey="terms.sections.domains.dnsTls"
              values={{ link: lt("terms.letsEncryptTerms") }}
              components={[
                <a
                  key="letsencrypt"
                  href="https://letsencrypt.org/terms-of-service/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300 transition-colors"
                />,
              ]}
            />
          </p>
          <p className="text-zinc-400 mt-2">
            {lt("terms.sections.domains.operatorRemoval")}
          </p>
        </>
      ),
    };
  }

  if (ctx) {
    return {
      id: "domains",
      title: lt("terms.sections.domains.title"),
      paragraphs: [
        lt("terms.sections.domains.noTls", { app: branding.name }),
        lt("terms.sections.domains.operatorRemoval"),
      ],
    };
  }

  return {
    id: "domains",
    title: lt("terms.sections.domains.title"),
    paragraphs: [
      lt("terms.sections.domains.fallback", { app: branding.name }),
      lt("terms.sections.domains.operatorRemoval"),
    ],
  };
}

/**
 * Discord wording, or `null` when the integration is not configured. An absent
 * integration leaves no trace in the policy at all.
 */
function discordPolicy(ctx: PolicyContext | null): Maybe<string> {
  if (ctx?.integrations.discord) {
    return lt("terms.sections.webhooks.discord");
  }
  if (ctx) return null;
  return lt("terms.sections.webhooks.discordFallback");
}

function buildEmailSection(ctx: PolicyContext | null): Maybe<PolicySection> {
  // No mail transport on this instance: the whole section is dropped rather
  // than describing email as unavailable.
  if (ctx && !ctx.email.mailConfigured) return null;
  return {
    id: "email",
    title: lt("terms.sections.email.title"),
    paragraphs: [
      lt("terms.sections.email.optIn", { app: branding.name }),
      lt("terms.sections.email.security"),
    ],
  };
}

function buildNewsletterSection(ctx: PolicyContext | null): Maybe<PolicySection> {
  // Newsletter sending off: the section disappears instead of saying so.
  if (ctx && !ctx.email.newsletter) return null;

  const paragraphs = [
    lt("terms.sections.newsletter.p1"),
    lt("terms.sections.newsletter.p2"),
    lt("terms.sections.newsletter.p3"),
    lt("terms.sections.newsletter.p4"),
  ];

  // The own-SMTP obligation only applies where the instance actually allows a
  // profile owner to bring their own relay.
  if (ctx?.email.selfSmtp) {
    paragraphs.push(
      lt("terms.sections.newsletter.selfSmtp", { app: branding.name }),
    );
  }

  return { id: "newsletter", title: lt("terms.sections.newsletter.title"), paragraphs };
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
    lt("terms.sections.invitePurchases.p1", { app: branding.name }),
    lt("terms.sections.invitePurchases.p2"),
  ];

  if (ctx.invites.resaleRestricted) {
    paragraphs.push(
      lt("terms.sections.invitePurchases.resaleRestricted"),
    );
  } else if (ctx.invites.resalePermitted) {
    // The operator permits resale, so the permission is written down: a buyer who
    // sells their codes is acting on this clause rather than on an assumption.
    // Membership, subscription and billing on this instance are unaffected, and
    // transferring an account itself stays subject to the section above.
    paragraphs.push(
      lt("terms.sections.invitePurchases.resalePermitted", { app: branding.name }),
      lt("terms.sections.invitePurchases.resalePermittedRefund"),
    );
  }

  return { id: "invite-purchases", title: lt("terms.sections.invitePurchases.title"), paragraphs };
}

function buildShopSection(ctx: PolicyContext | null): PolicySection {
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
      title: lt("terms.sections.shop.title"),
      paragraphs: [
        lt("terms.sections.shop.sellerInstance"),
        processors.length
          ? lt("terms.sections.shop.paidProviders", { providers: proseList(processors) })
          : lt("terms.sections.shop.freeProduct"),
        lt("terms.sections.shop.final"),
      ],
    };
  }

  return {
    id: "shop",
    title: lt("terms.sections.shop.title"),
    paragraphs: [
      lt("terms.sections.shop.seller"),
      lt("terms.sections.shop.fallback"),
    ],
  };
}

function buildTipsSection(ctx: PolicyContext | null): PolicySection {
  // Tipping is also per-profile and always available: `tipsEnabled` plus a
  // published BTC/LTC wallet address. It is NOT gated by the crypto payment
  // gateway, so it must never be described as disabled on this instance.
  const coins = ctx ? ctx.commerce.tipCoins.join(", ") : lt("terms.sections.tips.coinFallback");
  const rail = ctx
    ? ctx.commerce.tipRail === "btcpay"
      ? lt("terms.sections.tips.railBtcpay")
      : lt("terms.sections.tips.railWallet")
    : lt("terms.sections.tips.railFallback");

  return {
    id: "tips",
    title: lt("terms.sections.tips.title"),
    paragraphs: [
      ctx
        ? lt("terms.sections.tips.instance", { coins, rail })
        : lt("terms.sections.tips.fallback"),
      lt("terms.sections.tips.owner"),
    ],
  };
}

/**
 * Operator identity as a contracting party, from config.yml `public.policy`.
 * Positive-only: dropped entirely when no operator detail is published, so the
 * Terms never announce the absence of a named operator.
 */
function buildOperatorSection(ctx: PolicyContext | null): Maybe<PolicySection> {
  const name = (ctx?.operator.name ?? "").trim();
  const jurisdiction = (ctx?.operator.jurisdiction ?? "").trim();
  if (!ctx || (!name && !jurisdiction)) return null;
  const who = name
    ? lt("terms.sections.operator.whoNamed", { app: branding.name, name })
    : lt("terms.sections.operator.whoAdmin", { app: branding.name });
  const place = jurisdiction ? lt("terms.sections.operator.place", { jurisdiction }) : "";
  return {
    id: "operator",
    title: lt("terms.sections.operator.title"),
    paragraphs: [
      lt("terms.sections.operator.body", { who, place, app: branding.name }),
    ],
  };
}

/**
 * Advertising only when this instance actually serves ads, so the Terms never
 * claim ad revenue on an instance without them.
 */
function buildAdvertisingSection(ctx: PolicyContext | null): Maybe<PolicySection> {
  if (!ctx || !ctx.ads.enabled) return null;
  const networks = proseList(ctx.ads.networks);
  const via = networks ? lt("terms.sections.advertising.via", { networks }) : "";
  return {
    id: "advertising",
    title: lt("terms.sections.advertising.title"),
    paragraphs: [
      lt("terms.sections.advertising.p1", { via, app: branding.name }),
      lt("terms.sections.advertising.p2"),
    ],
  };
}

export function Terms() {
  const { t } = useTranslation("legal");
  usePageMeta({
    title: t("terms.metaTitle"),
    description: t("terms.metaDescription", { app: branding.name }),
    url: "/terms",
  });

  const ctx = usePolicyContext();

  const versionDate = ctx ? formatPolicyDate(ctx.versions.tos) : t("terms.fallbackVersion");
  const sso = ctx ? ssoProviderList(ctx) : "";
  const captcha = ctx ? captchaLabel(ctx) : null;

  // Legal operator identity from config.yml public.policy. A named operator makes
  // the Contact section concrete; contact is only used as a link when it is a
  // real http(s)/mailto href (the config allows display handles too).
  const legalName = (ctx?.operator.name ?? "").trim();
  const operatorContact = (ctx?.operator.contact ?? "").trim();
  const contactHref = /^(https?:\/\/|mailto:)/i.test(operatorContact) ? operatorContact : "";

  const sections: Maybe<PolicySection>[] = [
    {
      id: "acceptance",
      title: t("terms.sections.acceptance.title"),
      paragraphs: [
        t("terms.sections.acceptance.body", { app: branding.name }),
      ],
    },
    {
      id: "registration",
      title: t("terms.sections.registration.title"),
      paragraphs: [
        t("terms.sections.registration.inviteOnly", { app: branding.name }),
        t("terms.sections.registration.lockout"),
        t("terms.sections.registration.credentials"),
        captchaPolicy(ctx, captcha),
      ].filter((p): p is string => p !== null),
    },
    {
      id: "signin",
      title: t("terms.sections.signIn.title"),
      paragraphs: signInParagraphs(ctx, sso),
    },
    {
      id: "acceptable-use",
      title: t("terms.sections.acceptableUse.title"),
      paragraphs: [
        t("terms.sections.acceptableUse.body", { app: branding.name }),
      ],
    },
    {
      id: "moderation",
      title: t("terms.sections.moderation.title"),
      paragraphs: [
        t("terms.sections.moderation.p1", { app: branding.name }),
        t("terms.sections.moderation.p2"),
      ],
    },
    {
      id: "ownership",
      title: t("terms.sections.ownership.title"),
      paragraphs: [
        t("terms.sections.ownership.body", { app: branding.name }),
      ],
    },
    {
      id: "music",
      title: t("terms.sections.music.title"),
      paragraphs: [
        t("terms.sections.music.intro", { app: branding.name, storage: storageSentence(ctx) }),
        t("terms.sections.music.spotify"),
        t("terms.sections.music.disclaimer", { app: branding.name }),
      ],
    },
    buildDomainsSection(ctx),
    {
      id: "webhooks",
      title: t("terms.sections.webhooks.title"),
      paragraphs: [
        t("terms.sections.webhooks.intro", { app: branding.name }),
        t("terms.sections.webhooks.revoke"),
        discordPolicy(ctx),
      ].filter((p): p is string => p !== null),
    },
    buildEmailSection(ctx),
    buildNewsletterSection(ctx),
    buildInvitePurchaseSection(ctx),
    buildShopSection(ctx),
    buildTipsSection(ctx),
    buildAdvertisingSection(ctx),
    {
      id: "api",
      title: t("terms.sections.api.title"),
      paragraphs: [
        t("terms.sections.api.intro", { app: branding.name }),
        t("terms.sections.api.limits"),
      ],
    },
    {
      id: "availability",
      title: t("terms.sections.availability.title"),
      paragraphs: [
        t("terms.sections.availability.downtime", { app: branding.name }),
        t("terms.sections.availability.security"),
      ],
    },
    {
      id: "termination",
      title: t("terms.sections.termination.title"),
      paragraphs: [
        t("terms.sections.termination.body"),
      ],
    },
    {
      id: "liability",
      title: t("terms.sections.liability.title"),
      paragraphs: [
        t("terms.sections.liability.body", { app: branding.name }),
      ],
    },
    {
      id: "changes",
      title: t("terms.sections.changes.title"),
      paragraphs: [
        t("terms.sections.changes.p1", { app: branding.name }),
        t("terms.sections.changes.p2", { app: branding.name, date: versionDate }),
        t("terms.sections.changes.operator"),
      ],
    },
    buildOperatorSection(ctx),
    {
      id: "contact",
      title: t("terms.sections.contact.title"),
      paragraphs: [],
      node: (
        <p className="text-zinc-400">
          <Trans ns="legal" i18nKey="terms.contactPrefix" />
          {contactHref ? (
            <a
              href={contactHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300 transition-colors"
            >
              {legalName ? t("terms.contactNamed", { name: legalName }) : t("terms.contactUs")}
            </a>
          ) : legalName ? (
            <>{t("terms.contactNamed", { name: legalName })}</>
          ) : (
            <a
              href={branding.contactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300 transition-colors"
            >
              {t("terms.contactUs")}
            </a>
          )}
          .
        </p>
      ),
    },
  ];

  return (
    <PolicyShell
      title={t("terms.shellTitle")}
      versionDate={versionDate}
      sections={compact(sections)}
      subsections={[]}
    />
  );
}
