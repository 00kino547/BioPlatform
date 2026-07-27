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
} from "lucide-react";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

const features = [
  {
    icon: User,
    title: "Custom Profiles",
    description: "Personalize your profile with avatars, banners, bios, and custom usernames that represent you.",
    color: "from-violet-500/20 to-violet-600/5",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Link2,
    title: "Social Links",
    description: "Connect all your social platforms in one beautiful link page. Instagram, Twitter, GitHub, and more.",
    color: "from-cyan-500/20 to-cyan-600/5",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Music,
    title: "Music Player",
    description: "Embed your favorite tracks and let visitors listen directly from your profile.",
    color: "from-rose-500/20 to-rose-600/5",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Palette,
    title: "Themes",
    description: "Choose from stunning pre-built themes or create your own unique style with the theme editor.",
    color: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
    span: "sm:col-span-2 row-span-1",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Track views, clicks, and engagement with a built-in analytics dashboard.",
    color: "from-emerald-500/20 to-emerald-600/5",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Lock,
    title: "Invite-Only",
    description: "Exclusive access ensures quality and prevents spam across the platform.",
    color: "from-violet-500/20 to-violet-600/5",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Upload,
    title: "Secure Uploads",
    description: "Upload avatars, banners, and files with S3-compatible storage. Your files, your control.",
    color: "from-cyan-500/20 to-cyan-600/5",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Server,
    title: "Self-Hostable",
    description: "Deploy on your own server with Docker in minutes. Full control over your data and infrastructure.",
    color: "from-emerald-500/20 to-emerald-600/5",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    span: "sm:col-span-2 row-span-1",
  },
  {
    icon: Gauge,
    title: "Fast Performance",
    description: "Lightning-fast loading with optimized assets, CDN support, and edge deployment.",
    color: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
    span: "col-span-1 row-span-1",
  },
  {
    icon: Paintbrush,
    title: "Modern Design",
    description: "Clean, modern interfaces built with the latest design trends and attention to detail.",
    color: "from-rose-500/20 to-rose-600/5",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
    span: "col-span-1 row-span-1",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 sm:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-violet-950/[0.02] to-background" />

      <Container className="relative z-10">
        <ScrollReveal>
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              Everything you need,
              <br />
              nothing you don&apos;t.
            </h2>
            <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto">
              A complete toolkit for your online presence, designed for creators who care about quality.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={i * 60}>
              <div
                className={`group relative rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-7 transition-all duration-300 hover:border-zinc-700/80 hover:bg-zinc-900/60 card-glow h-full ${feature.span}`}
              >
                <div className={`inline-flex items-center justify-center rounded-xl ${feature.iconBg} p-2.5 mb-5`}>
                  <feature.icon className={`h-5 w-5 ${feature.iconColor}`} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
