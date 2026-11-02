import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/useAuth";
import { api, type OrderConfig } from "@/lib/api";
import { useInstanceConfig } from "@/lib/useInstanceConfig";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { branding } from "@/config/branding";

function money(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

// Structural plan metadata. All copy (name, price label, description, feature
// bullets, CTA) comes from landing.pricing.plans.<id>.* so it can be translated
// (the plan *name* is the shared tier label in common.tiers.<id>); only the tier
// key, destination and visual accent stay in code.
const PLAN_META = [
  {
    key: "FREE" as const,
    id: "free",
    ctaTo: "/register",
    highlighted: false,
    fallbackPriceCents: 0,
    featureCount: 5,
  },
  {
    key: "PRO" as const,
    id: "premium",
    ctaTo: "/dashboard?tab=billing",
    highlighted: true,
    fallbackPriceCents: 500,
    featureCount: 6,
  },
  {
    key: "ENTERPRISE" as const,
    id: "enterprise",
    ctaTo: branding.contactUrl,
    highlighted: false,
    fallbackPriceCents: 2900,
    featureCount: 8,
  },
];

function PricingButton({
  plan,
}: {
  plan: {
    key: string;
    highlighted: boolean;
    ctaTo: string;
    cta: string;
  };
}) {
  const { t } = useTranslation("landing");
  const { user } = useAuth();
  const btnClasses = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 w-full h-11 ${
    plan.highlighted
      ? "bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 transition-shadow"
      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700"
  }`;
  const ctaTo = user && plan.key !== "FREE" ? "/dashboard?tab=billing" : plan.ctaTo;
  const ctaLabel = user && plan.key !== "FREE" ? (user?.tier === plan.key ? t("pricing.currentPlan") : plan.cta) : plan.cta;
  const isExternal = !ctaTo.startsWith("/");
  if (isExternal) {
    return (
      <a href={ctaTo} target="_blank" rel="noopener noreferrer" className={btnClasses}>
        {ctaLabel}
      </a>
    );
  }
  return (
    <Link to={ctaTo} className={btnClasses}>
      {ctaLabel}
    </Link>
  );
}

export function Pricing() {
  const { t, i18n } = useTranslation("landing");
  const [config, setConfig] = useState<OrderConfig | null>(null);
  const instance = useInstanceConfig();

  const loadConfig = useCallback(async () => {
    try {
      const res = await api.getOrderConfig();
      if (res.success && res.data) setConfig(res.data);
    } catch {
      // fall back to static prices
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // An instance operator can hide the whole pricing section via config.yml
  // (public.operational.hidePricing) — e.g. when the store isn't ready or plans
  // are deliberately unpublished. Zero fields (absent file) keep it visible.
  // Kept after every hook so the Rules of Hooks stay satisfied.
  if (instance?.operational.hidePricing) return null;

  const priced = PLAN_META.map((meta) => {
    const envPlan = config?.plans.find((p) => p.plan === meta.key);
    const priceCents = envPlan?.priceCents ?? meta.fallbackPriceCents;
    const currency = config?.currency ?? "USD";
    const mode = config?.billingMode ?? "one-time";
    const periodLabel =
      mode === "one-time"
        ? t("pricing.periodOneTime")
        : mode === "fixed-term"
          ? t("pricing.periodPerTerm")
          : t("pricing.periodMonth");
    const modeLabel =
      mode === "one-time"
        ? t("pricing.modePayOnce")
        : mode === "subscription"
          ? t("pricing.modeBilledMonthly")
          : t("pricing.modeBilledPerTerm");
    const features = Array.from({ length: meta.featureCount }, (_, i) =>
      t(`pricing.plans.${meta.id}.features.item${i + 1}`)
    );
    return {
      ...meta,
      priceCents,
      currency,
      periodLabel,
      modeLabel,
      features,
      name: t(`common:tiers.${meta.id}`),
      price: t(`pricing.plans.${meta.id}.price`),
      period: t(`pricing.plans.${meta.id}.period`),
      description: t(`pricing.plans.${meta.id}.description`),
      badge: meta.id === "premium" ? t("pricing.plans.premium.badge") : undefined,
      inherits: meta.id !== "free" ? t(`pricing.plans.${meta.id}.inherits`) : undefined,
      cta: t(`pricing.plans.${meta.id}.cta`),
    };
  });

  return (
    <section id="pricing" className="py-24 sm:py-32 relative">
      <Container>
        <ScrollReveal>
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">
              {t("pricing.eyebrow")}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              {t("pricing.heading")}
            </h2>
            <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto">
              {t("pricing.subtitle")}
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 max-w-5xl mx-auto items-start">
          {priced.map((plan, i) => (
            <ScrollReveal key={plan.key} delay={i * 100}>
              <div
                className={`relative rounded-2xl transition-all duration-300 ${
                  plan.highlighted
                    ? "pricing-highlighted px-7 pt-8 pb-7 sm:px-8 sm:pt-10 sm:pb-8"
                    : "border border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700/80 hover:bg-zinc-900/50 p-7 sm:p-8"
                }`}
              >
                <div className="mb-7">
                  <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
                      {plan.priceCents > 0 ? money(plan.priceCents, plan.currency, i18n.resolvedLanguage ?? "en") : plan.price}
                    </span>
                    {plan.priceCents > 0 ? <span className="text-sm text-zinc-500 font-medium">{plan.periodLabel}</span> : <span className="text-sm text-zinc-500 font-medium">{plan.period}</span>}
                  </div>
                  <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                    {plan.description}
                  </p>
                  {plan.priceCents > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">{plan.modeLabel}</p>
                  )}
                </div>

                {plan.badge && (
                  <div className="mb-6 -mt-3">
                    <span className="inline-flex items-center rounded-full border border-violet-600/30 bg-violet-600/15 px-3.5 py-1 text-xs font-semibold text-violet-400 whitespace-nowrap">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="h-px bg-zinc-800/60 mb-7" />

                {plan.inherits && (
                  <p className="text-xs font-semibold text-violet-400 mb-4 uppercase tracking-wide">
                    {plan.inherits}
                  </p>
                )}

                <ul className="space-y-3.5 mb-8">
                  {plan.features.map((feature, fi) => (
                    <li key={fi} className="flex items-center gap-3 text-sm text-zinc-300">
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          plan.highlighted ? "bg-violet-500/20" : "bg-zinc-800"
                        }`}
                      >
                        <Check
                          className={`h-3 w-3 ${
                            plan.highlighted ? "text-violet-400" : "text-zinc-500"
                          }`}
                        />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>

                <PricingButton plan={plan} />
              </div>
            </ScrollReveal>
          ))}
        </div>

        <p className="text-center text-sm text-zinc-500 mt-8">
          {t("pricing.enterpriseNote")}{" "}
          <a href={branding.contactUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors">
            {t("pricing.contactUs")}
          </a>{" "}
          {t("pricing.forCustomPlans")}
        </p>
      </Container>
    </section>
  );
}
