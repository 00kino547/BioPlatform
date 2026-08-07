import { Award, Code, Crown, Wrench, Shield, BadgeCheck, Gem, Building2, Star, Rocket, Heart, Zap, Trophy, Flame, Leaf, Sparkles, ShieldCheck, CheckCircle2, type LucideIcon } from "lucide-react";
import type { Badge } from "@/lib/api";

const ICON_MAP: Record<string, LucideIcon> = {
  Award,
  Code,
  Crown,
  Wrench,
  Shield,
  BadgeCheck,
  Gem,
  Building2,
  Star,
  Rocket,
  Heart,
  Zap,
  Trophy,
  Flame,
  Leaf,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
};

export function BadgePill({ badge, size = "sm" }: { badge: Badge; size?: "sm" | "lg" }) {
  const Icon = ICON_MAP[badge.icon] ?? Award;
  const dim = size === "lg";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wider ${
        dim ? "px-3 py-1 text-xs" : "px-2.5 py-1 text-[10px]"
      }`}
      style={{
        backgroundColor: `${badge.color}18`,
        color: badge.color,
        border: `1px solid ${badge.color}35`,
      }}
      title={badge.label}
    >
      <Icon className={dim ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {badge.label}
    </span>
  );
}
