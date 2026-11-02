import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, Crown, Lock } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";

const TIER_RANK: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
const TIER_LABEL: Record<string, string> = { FREE: "Free", PRO: "Premium", ENTERPRISE: "Enterprise" };

const REQUIRED: Record<"premium" | "enterprise", { label: string; rank: number }> = {
  premium: { label: "Premium", rank: 1 },
  enterprise: { label: "Enterprise", rank: 2 },
};

export type RequiredTier = "premium" | "enterprise";

interface LockedFeatureProps {
  feature: string;
  required: RequiredTier;
  title?: string;
  description?: string;
  note?: string;
  icon?: ReactNode;
  onAction?: () => void;
}

export function LockedFeature({ feature, required, title, description, note, icon, onAction }: LockedFeatureProps) {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const tier = (user?.tier ?? "FREE") as string;
  const req = REQUIRED[required];
  const rank = TIER_RANK[tier] ?? 0;
  const label = TIER_LABEL[tier] ?? tier.toLowerCase();
  const isEnterprise = required === "enterprise";
  const overridden = isEnterprise
    ? user?.permissions?.includes("api.enterprise")
    : user?.permissions?.includes("api.advanced") || user?.permissions?.includes("api.enterprise");

  const { verb, ActionIcon } =
    rank > req.rank
      ? { verb: t("lockedFeature.downgradeTo", { tier: req.label }), ActionIcon: ArrowDownLeft }
      : rank < req.rank
        ? { verb: t("lockedFeature.upgradeTo", { tier: req.label }), ActionIcon: ArrowUpRight }
        : { verb: t("lockedFeature.moveTo", { tier: req.label }), ActionIcon: ArrowRight };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 sm:p-10 text-center">
      <div
        className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${
          isEnterprise
            ? "border-amber-400/25 bg-gradient-to-br from-amber-500/30 to-transparent shadow-[0_0_24px_-6px_rgba(251,191,36,0.4)]"
            : "border-violet-400/25 bg-gradient-to-br from-violet-500/30 to-transparent shadow-[0_0_24px_-6px_rgba(167,139,250,0.4)]"
        }`}
      >
        {icon ??
          (isEnterprise ? <Building2 className="h-6 w-6 text-amber-300" /> : <Crown className="h-6 w-6 text-violet-300" />)}
      </div>
      <h3 className="text-lg font-semibold text-white">{title ?? t("lockedFeature.featureIsTierFeature", { feature, tier: req.label })}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        {overridden ? (
          t("lockedFeature.overriddenHelp", { permission: isEnterprise ? "api.enterprise" : "api.advanced" })
        ) : (
          description ?? t("lockedFeature.tierDescription", { tier: label, verb, feature: feature.toLowerCase() })
        )}
      </p>
      {onAction && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-violet-400/25 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-300 transition-all hover:border-violet-400/40 hover:bg-violet-500/25"
          >
            <ActionIcon className="h-4 w-4" />
            {verb}
          </button>
        </div>
      )}
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-500">
        <Lock className="h-3.5 w-3.5" />
        {note ?? t("lockedFeature.requires", { tier: req.label, level: isEnterprise ? "enterprise" : "advanced" })}
      </div>
    </div>
  );
}
