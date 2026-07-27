import { ArrowRight, Sparkles, Shield, Zap, Globe, Users, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/Container";
import { branding } from "@/config/branding";

const stats = [
  { icon: Users, value: "2,400+", label: "Early Access Users" },
  { icon: Eye, value: "50k+", label: "Page Views" },
  { icon: Zap, value: "<50ms", label: "Load Time" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-grid bg-grid-fade" />

      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-violet-600/[0.07] rounded-full blur-[120px] animate-pulse-slow" />
      <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-cyan-500/[0.04] rounded-full blur-[100px] animate-float" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-violet-500/[0.03] rounded-full blur-[100px] animate-float-delayed" />

      <div className="absolute top-20 left-1/4 w-px h-32 bg-gradient-to-b from-transparent via-violet-500/20 to-transparent" />
      <div className="absolute top-40 right-1/3 w-px h-24 bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />

      <Container className="relative z-10 py-32 sm:py-40">
        <div className="mx-auto max-w-4xl text-center">
          <div className="animate-fade-in">
            <Badge variant="violet" className="mb-8 inline-flex items-center gap-1.5 px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Now in Early Access
            </Badge>
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl leading-[1.05] animate-reveal">
            <span className="text-white block">Your digital identity,</span>
            <span className="text-gradient block mt-1">beautifully crafted.</span>
          </h1>

          <p
            className="mt-8 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed animate-reveal opacity-0-initial"
            style={{ animationDelay: "200ms" }}
          >
            {branding.description}. Links, themes, and analytics — all in one beautifully designed page.
          </p>

          <div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-reveal opacity-0-initial"
            style={{ animationDelay: "400ms" }}
          >
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 h-13 px-8 text-base rounded-lg font-medium bg-violet-600 text-white hover:bg-violet-700 shadow-xl shadow-violet-600/25 hover:shadow-violet-600/40 transition-all duration-200 group"
            >
              Get Early Access
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#showcase"
              className="inline-flex items-center justify-center gap-2 h-13 px-8 text-base rounded-lg font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all duration-200"
            >
              View Showcase
            </a>
          </div>

          <div
            className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 animate-reveal opacity-0-initial"
            style={{ animationDelay: "600ms" }}
          >
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                  <stat.icon className="h-4.5 w-4.5 text-zinc-400" />
                </div>
                <div className="text-left">
                  <p className="text-lg font-semibold text-white leading-tight">{stat.value}</p>
                  <p className="text-xs text-zinc-500">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-14 flex items-center justify-center gap-x-6 gap-y-3 flex-wrap animate-reveal opacity-0-initial"
            style={{ animationDelay: "800ms" }}
          >
            {[
              { icon: Shield, label: "Open Source" },
              { icon: Zap, label: "Lightning Fast" },
              { icon: Globe, label: "Self-Hostable" },
            ].map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-2 text-sm text-zinc-500"
              >
                <badge.icon className="h-4 w-4 text-zinc-600" />
                {badge.label}
              </div>
            ))}
          </div>
        </div>
      </Container>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
    </section>
  );
}
