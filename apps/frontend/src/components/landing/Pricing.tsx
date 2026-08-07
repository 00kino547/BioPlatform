import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { branding } from "@/config/branding";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started with your first profile.",
    features: [
      "1 profile page",
      "Basic themes",
      "Up to 2 music tracks",
      "Community support",
    ],
    cta: "Get Started",
    ctaTo: "/register",
    highlighted: false,
  },
  {
    name: "Premium",
    price: "$5",
    period: "/month",
    description: "For creators who want the full experience.",
    badge: "Most Popular",
    inherits: "Everything in Free, plus:",
    features: [
      "3 profiles & 5 aliases",
      "Up to 5 music tracks",
      "Premium themes",
      "Analytics",
      "Discord presence",
      "Priority support",
    ],
    cta: "Upgrade to Premium",
    ctaTo: "/register",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$29",
    period: "/month",
    description: "For teams and organizations at scale.",
    inherits: "Everything in Premium, plus:",
    features: [
      "10 profiles & 25 aliases",
      "Up to 10 music tracks",
      "Badges",
      "Team management",
      "API access",
      "SSO",
      "Dedicated support",
      "Custom limits on request",
    ],
    cta: "Contact Sales",
    ctaTo: branding.contactUrl,
    highlighted: false,
  },
];

function PricingButton({ plan }: { plan: (typeof plans)[number] }) {
  const btnClasses = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 w-full h-11 ${
    plan.highlighted
      ? "bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-600/25 hover:shadow-violet-600/40 transition-shadow"
      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700"
  }`;
  const isExternal = !plan.ctaTo.startsWith("/");
  if (isExternal) {
    return (
      <a href={plan.ctaTo} target="_blank" rel="noopener noreferrer" className={btnClasses}>
        {plan.cta}
      </a>
    );
  }
  return (
    <Link to={plan.ctaTo} className={btnClasses}>
      {plan.cta}
    </Link>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32 relative">
      <Container>
        <ScrollReveal>
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              Simple, transparent pricing.
            </h2>
            <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto">
              No hidden fees. No surprises. Start free, upgrade when you&apos;re ready.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 max-w-5xl mx-auto items-start">
          {plans.map((plan, i) => (
            <ScrollReveal key={plan.name} delay={i * 100}>
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
                      {plan.price}
                    </span>
                    <span className="text-sm text-zinc-500 font-medium">{plan.period}</span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
                    {plan.description}
                  </p>
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
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
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
          Higher limits negotiable for Enterprise.{" "}
          <a href={branding.contactUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors">
            Contact us
          </a>{" "}
          for custom plans.
        </p>
      </Container>
    </section>
  );
}
