import {
  User,
  Link2,
  Music,
  Palette,
  BarChart3,
  Lock,
  Server,
  Upload,
  Gauge,
  Paintbrush,
  Layers,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

// Only the icon and presentation live in code; the copy is resolved from the
// `landing.features.items.<id>` keys so it can be translated. Keeping the visuals
// keyed by `id` (not the translated title) means an i18n switch never reorders or
// re-keys the list.
const features = [
  {
    icon: User,
    id: "customProfiles",
    color: "from-violet-500/20 to-violet-600/5",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Layers,
    id: "multipleProfiles",
    color: "from-sky-500/20 to-sky-600/5",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Link2,
    id: "socialLinks",
    color: "from-cyan-500/20 to-cyan-600/5",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Music,
    id: "musicPlayer",
    color: "from-rose-500/20 to-rose-600/5",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Palette,
    id: "themes",
    color: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
    span: "sm:col-span-2 row-span-1",
  },
  {
    icon: BarChart3,
    id: "analytics",
    color: "from-emerald-500/20 to-emerald-600/5",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Lock,
    id: "inviteOnly",
    color: "from-violet-500/20 to-violet-600/5",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Upload,
    id: "secureUploads",
    color: "from-cyan-500/20 to-cyan-600/5",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Server,
    id: "selfHostable",
    color: "from-emerald-500/20 to-emerald-600/5",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    span: "sm:col-span-2 row-span-1",
  },
  {
    icon: Gauge,
    id: "fastPerformance",
    color: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Paintbrush,
    id: "modernDesign",
    color: "from-rose-500/20 to-rose-600/5",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
    span: "col-span-1 row-span-1",
  },
];

export function Features() {
  const { t } = useTranslation("landing");
  return (
    <section id="features" className="py-24 sm:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-violet-950/[0.02] to-background" />

      <Container className="relative z-10">
        <ScrollReveal>
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">
              {t("features.eyebrow")}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              {t("features.headingLine1")}
              <br />
              {t("features.headingLine2")}
            </h2>
            <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto">
              {t("features.subtitle")}
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((feature, i) => (
            <ScrollReveal key={feature.id} delay={i * 60}>
              <div
                className={`group relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-7 transition-all duration-300 hover:border-zinc-700/80 hover:bg-zinc-900/60 card-glow h-full ${feature.span}`}
              >
                <div className={`inline-flex items-center justify-center rounded-xl ${feature.iconBg} p-2.5 mb-5`}>
                  <feature.icon className={`h-5 w-5 ${feature.iconColor}`} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {t(`features.items.${feature.id}.title`)}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {t(`features.items.${feature.id}.description`)}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
