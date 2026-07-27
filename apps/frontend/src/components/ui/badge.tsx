import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "violet" | "emerald";

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-violet-600/10 text-violet-400 border-violet-600/20",
  secondary: "bg-zinc-800 text-zinc-300 border-zinc-700",
  outline: "text-zinc-400 border-zinc-700",
  violet: "bg-violet-600/10 text-violet-400 border-violet-600/20",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge, type BadgeProps, type BadgeVariant };
