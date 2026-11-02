import { usePageMeta } from "@/lib/seo";
import { Trans, useTranslation } from "react-i18next";
import { branding } from "@/config/branding";
import { usePolicyContext } from "@/lib/usePolicyContext";
import type { PolicyContext } from "@/lib/api";
import { PolicyShell } from "@/components/legal/PolicyShell";
import {
  captchaLabel,
  formatPolicyDate,
  lt,
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

function storageParagraph(ctx: PolicyContext | null): string {
  if (!ctx) {
    return lt("privacy.sections.storage.fallback");
  }
  const where = storageLabel(ctx.storage.provider);
  // Both branches state only where files go. The operator's decision not to use
  // a third-party object store is an implementation detail, not data a reader
  // needs disclosed as an absence.
  const thirdParty = lt("privacy.sections.storage.thirdParty", { provider: where });
  return lt("privacy.sections.storage.loaded", { thirdParty });
}

function uploadParagraph(ctx: PolicyContext | null): string {
  if (!ctx) {
    return lt("privacy.sections.uploads.fallback");
  }
  const where = storageLabel(ctx.storage.provider);
  if (ctx.storage.thirdParty) {
    return lt("privacy.sections.uploads.thirdParty", { provider: where, app: branding.name });
  }
  return lt("privacy.sections.uploads.loaded", { provider: where });
}

function matomoParagraph(ctx: PolicyContext | null): Maybe<string> {
  if (!ctx) {
    // Context unavailable: describe only what is certainly true of this product
    // and never name a vendor that may not be deployed. Naming a speculative
    // analytics service here would be a phantom capability.
    return lt("privacy.subsections.analytics.matomoFallback");
  }
  if (ctx.analytics.enabled) {
    return lt("privacy.subsections.analytics.matomoEnabled", { app: branding.name });
  }
  // No external analytics configured: say nothing at all rather than telling
  // visitors which trackers are absent.
  return null;
}

/**
 * Advertising disclosure. Ads produce their own third-party cookies, so this
 * paragraph REPLACES the old blanket "we do not use third-party advertising
 * cookies" line: that claim would be false on an instance that serves ads.
 *
 * Positive-only rule: when ads are off (or the snapshot is loaded and reports
 * them off) nothing is said — the page never announces an absent capability.
 * The neutral branch is only for a missing snapshot.
 */
function adCookiesParagraph(ctx: PolicyContext | null): Maybe<string> {
  if (ctx && !ctx.ads.enabled) return null;
  if (!ctx) {
    return lt("privacy.sections.cookies.advertisingFallback");
  }
  const networks = proseList(ctx.ads.networks);
  const via = networks ? lt("privacy.sections.cookies.advertisingVia", { networks }) : "";
  return lt("privacy.sections.cookies.advertisingInstance", { via });
}

/**
 * Operator identity as data controller, from config.yml `public.policy`.
 * Positive-only: when no operator detail is published the section is dropped
 * rather than announcing that the instance has no named operator.
 */
function operatorSections(ctx: PolicyContext | null): PolicySection[] {
  const name = (ctx?.operator.name ?? "").trim();
  const jurisdiction = (ctx?.operator.jurisdiction ?? "").trim();
  if (!ctx || (!name && !jurisdiction)) return [];
  const who = name
    ? lt("privacy.sections.operator.whoNamed", { app: branding.name, name })
    : lt("privacy.sections.operator.whoAdmin", { app: branding.name });
  const place = jurisdiction ? lt("privacy.sections.operator.place", { jurisdiction }) : "";
  return [
    {
      id: "operator",
      title: lt("privacy.sections.operator.title"),
      paragraphs: [
        lt("privacy.sections.operator.body", { who, place }),
      ],
    },
  ];
}

function signInParagraphs(ctx: PolicyContext | null, sso: string): string[] {
  if (!ctx) {
    return [lt("privacy.subsections.signIn.fallback")];
  }

  const out: string[] = [];
  if (ctx.auth.pocketbaseSignIn) {
    const lead = sso ? lt("privacy.subsections.signIn.pocketbaseLeadWithSso", { sso }) : lt("privacy.subsections.signIn.pocketbaseLeadWithoutSso");
    out.push(lt("privacy.subsections.signIn.pocketbase", { lead }));
    if (sso) {
      out.push(lt("privacy.subsections.signIn.pocketbaseSso", { sso }));
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
    const lead = sso ? lt("privacy.subsections.signIn.passwordLeadWithSso", { sso }) : "";
    const ssoTail = sso ? lt("privacy.subsections.signIn.passwordTail", { sso }) : "";
    out.push(
      lt("privacy.subsections.signIn.password", { lead, app: branding.name, tail: ssoTail })
    );
  }

  if (ctx.auth.pocketbaseConfigured && sso) {
    out.push(lt("privacy.subsections.signIn.available", { sso }));
  }
  return out;
}

function captchaSections(ctx: PolicyContext | null): PolicySection[] {
  const captcha = ctx ? captchaLabel(ctx) : null;
  if (!captcha) return [];
  return [
    {
      id: "abuse",
      title: lt("privacy.subsections.abuse.title"),
      paragraphs: [
        lt("privacy.subsections.abuse.body", { captcha }),
      ],
    },
  ];
}

function discordSections(ctx: PolicyContext | null): PolicySection[] {
  if (!ctx?.integrations.discord) return [];
  return [
    {
      id: "discord",
      title: lt("privacy.subsections.discord.title"),
      paragraphs: [
        lt("privacy.subsections.discord.p1", { app: branding.name }),
        lt("privacy.subsections.discord.p2"),
        lt("privacy.subsections.discord.p3"),
      ],
    },
  ];
}

function domainSections(ctx: PolicyContext | null): PolicySection[] {
  if (ctx && !ctx.domains.automaticTls) {
    return [
      {
        id: "domains",
        title: lt("privacy.subsections.domains.title"),
        paragraphs: [
          lt("privacy.subsections.domains.noTls"),
        ],
      },
    ];
  }
  const tlsPhrase = ctx ? lt("privacy.subsections.domains.tlsAuto") : lt("privacy.subsections.domains.tlsWhen");
  return [
    {
      id: "domains",
      title: lt("privacy.subsections.domains.tlsTitle"),
      paragraphs: [
        lt("privacy.subsections.domains.tls", { base: lt("privacy.subsections.domains.base"), tlsPhrase }),
      ],
    },
  ];
}

function versionSections(ctx: PolicyContext | null): PolicySection[] {
  if (ctx && !ctx.integrations.updateCheck) return [];
  return [
    {
      id: "version",
      title: lt("privacy.subsections.version.title"),
      paragraphs: [
        lt("privacy.subsections.version.body", { app: branding.name }),
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
      title: lt("privacy.subsections.email.title"),
      paragraphs: [
        lt("privacy.subsections.email.body"),
      ],
    },
  ];
}

function newsletterSections(ctx: PolicyContext | null): PolicySection[] {
  // Newsletter sending off: the section is dropped rather than announcing it.
  if (ctx && !ctx.email.newsletter) return [];

  const paragraphs = [
    lt("privacy.subsections.newsletter.p1"),
    lt("privacy.subsections.newsletter.p2"),
    lt("privacy.subsections.newsletter.p3", { app: branding.name }),
    lt("privacy.subsections.newsletter.p4"),
  ];

  if (ctx?.email.selfSmtp) {
    paragraphs.push(
      lt("privacy.subsections.newsletter.selfSmtp", { app: branding.name }),
    );
  }

  return [{ id: "newsletter", title: lt("privacy.subsections.newsletter.title"), paragraphs }];
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
    ? lt("privacy.subsections.invites.paidProviders", { providers: proseList(processors) })
    : lt("privacy.subsections.invites.paidFallback");

  const paragraphs = [
    lt("privacy.subsections.invites.p1", { app: branding.name, paid }),
    lt("privacy.subsections.invites.p2"),
    lt("privacy.subsections.invites.p3"),
  ];

  if (ctx.invites.resaleRestricted) {
    paragraphs.push(
      lt("privacy.subsections.invites.resaleRestricted"),
    );
  } else if (ctx.invites.resalePermitted) {
    // Stated because it changes who the data belongs to: a permitted code may end
    // up being registered by a third party, and that person becomes the account
    // holder rather than a party to the order.
    paragraphs.push(
      lt("privacy.subsections.invites.resalePermitted"),
    );
  }

  return [{ id: "invite-purchases", title: lt("privacy.subsections.invites.title"), paragraphs }];
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
      ? lt("privacy.subsections.shop.paidProviders", { providers: proseList(processors) })
      : lt("privacy.subsections.shop.freeProduct");
    return [
      {
        id: "shop",
        title: lt("privacy.subsections.shop.title"),
        paragraphs: [
          lt("privacy.subsections.shop.p1", { paid }),
          lt("privacy.subsections.shop.p2"),
        ],
      },
    ];
  }

  return [
    {
      id: "shop",
      title: lt("privacy.subsections.shop.title"),
      paragraphs: [
        lt("privacy.subsections.shop.fallbackP1"),
        lt("privacy.subsections.shop.fallbackP2"),
      ],
    },
  ];
}

function tipSections(ctx: PolicyContext | null): PolicySection[] {
  // Tipping is per-profile and always available; it is NOT switched on or off
  // at instance level, so the wording must not claim it is disabled.
  const coins = ctx ? ctx.commerce.tipCoins.join(", ") : "";
  const coinText = coins ? lt("privacy.subsections.tips.coinText", { coins }) : "";
  const gateway = ctx?.commerce.tipRail === "btcpay"
    ? lt("privacy.subsections.tips.gatewayBtcpay")
    : lt("privacy.subsections.tips.gatewayWallet");

  return [
    {
      id: "tips",
      title: lt("privacy.subsections.tips.title"),
      paragraphs: [
        lt("privacy.subsections.tips.instance", { coinText, gateway }),
        lt("privacy.subsections.tips.owner"),
      ],
    },
  ];
}

export function Privacy() {
  const { t } = useTranslation("legal");
  usePageMeta({
    title: t("privacy.metaTitle"),
    description: t("privacy.metaDescription", { app: branding.name }),
    url: "/privacy",
  });

  const ctx = usePolicyContext();
  const versionDate = ctx ? formatPolicyDate(ctx.versions.privacy) : t("privacy.fallbackVersion");
  const sso = ctx ? ssoProviderList(ctx) : "";

  // Legal operator identity from config.yml public.policy (same contact rules as
  // the Terms page: name always wins; contact links only when it is http(s)/mailto).
  const legalName = (ctx?.operator.name ?? "").trim();
  const operatorContact = (ctx?.operator.contact ?? "").trim();
  const contactHref = /^(https?:\/\/|mailto:)/i.test(operatorContact) ? operatorContact : "";

  const sections: PolicySection[] = [
    {
      id: "collect",
      title: t("privacy.sections.collect.title"),
      paragraphs: [
        t("privacy.sections.collect.p1", { app: branding.name }),
        t("privacy.sections.collect.p2"),
        t("privacy.sections.collect.p3"),
        t("privacy.sections.collect.p4"),
      ],
    },
    {
      id: "use",
      title: t("privacy.sections.use.title"),
      paragraphs: [
        t("privacy.sections.use.p1", { app: branding.name }),
        t("privacy.sections.use.p2"),
      ],
    },
    {
      id: "storage",
      title: t("privacy.sections.storage.title"),
      paragraphs: [storageParagraph(ctx)],
    },
    {
      id: "uploads",
      title: t("privacy.sections.uploads.title"),
      paragraphs: [uploadParagraph(ctx)],
    },
    {
      id: "cookies",
      title: t("privacy.sections.cookies.title"),
      paragraphs: [
        t("privacy.sections.cookies.categories", { app: branding.name }),
        t("privacy.sections.cookies.banner"),
        t("privacy.sections.cookies.signals"),
        adCookiesParagraph(ctx),
      ].filter((p): p is string => p !== null),
      extra: (
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-zinc-400">
          <li>
            <span className="font-medium text-zinc-300">{t("privacy.sections.cookies.essentialLabel")}</span>
            {t("privacy.sections.cookies.essentialBody")}
          </li>
          <li>
            <span className="font-medium text-zinc-300">{t("privacy.sections.cookies.analyticsLabel")}</span>
            {t("privacy.sections.cookies.analyticsBefore")}
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">{t("privacy.sections.cookies.vidCookie")}</code>
            {t("privacy.sections.cookies.analyticsAfter")}
          </li>
          {ctx?.ads.enabled && (
            <li>
              <span className="font-medium text-zinc-300">{t("privacy.sections.cookies.advertisingBullet")}</span>
              {t("privacy.sections.cookies.advertisingBulletBody", { app: branding.name })}
            </li>
          )}
        </ul>
      ),
    },
    {
      id: "retention",
      title: t("privacy.sections.retention.title"),
      paragraphs: [
        t("privacy.sections.retention.body"),
      ],
    },
    {
      id: "rights",
      title: t("privacy.sections.rights.title"),
      paragraphs: [
        t("privacy.sections.rights.body"),
      ],
    },
    {
      id: "changes",
      title: t("privacy.sections.changes.title"),
      paragraphs: [
        t("privacy.sections.changes.p1"),
        t("privacy.sections.changes.p2", { date: versionDate, app: branding.name }),
        t("privacy.sections.changes.operator"),
      ],
    },
    ...operatorSections(ctx),
    {
      id: "contact",
      title: t("privacy.sections.contact.title"),
      paragraphs: [],
      node: (
        <p className="text-zinc-400">
          <Trans ns="legal" i18nKey="privacy.contactPrefix" />
          {contactHref ? (
            <a
              href={contactHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300 transition-colors"
            >
              {legalName ? t("privacy.contactNamed", { name: legalName }) : t("privacy.contactUs")}
            </a>
          ) : legalName ? (
            <>{t("privacy.contactNamed", { name: legalName })}</>
          ) : (
            <a
              href={branding.contactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300 transition-colors"
            >
              {t("privacy.contactUs")}
            </a>
          )}
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
      title: t("privacy.subsections.analytics.title"),
      paragraphs: [
        t("privacy.subsections.analytics.body"),
        matomoParagraph(ctx),
      ].filter((p): p is string => p !== null),
    },
    {
      id: "signin",
      title: t("privacy.subsections.signIn.title"),
      paragraphs: signInParagraphs(ctx, sso),
    },
    ...captchaSections(ctx),
    {
      id: "embeds",
      title: t("privacy.subsections.embeds.title"),
      paragraphs: [
        t("privacy.subsections.embeds.body"),
      ],
    },
    ...discordSections(ctx),
    {
      id: "webhooks",
      title: t("privacy.subsections.webhooks.title"),
      paragraphs: [
        t("privacy.subsections.webhooks.body"),
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
    <PolicyShell title={t("privacy.shellTitle")} versionDate={versionDate} sections={sections} subsections={subsections} />
  );
}
