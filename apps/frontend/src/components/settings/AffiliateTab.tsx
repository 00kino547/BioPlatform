import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { api, type AffiliateLevelInfo, type AffiliateStatus } from "@/lib/api";
import { formatDate } from "@/lib/intl";
import { RefreshCw, Gift, Users, Percent, Trophy, ArrowRight, Shield } from "lucide-react";

// Stable translator type so module-level helpers (outside components) can
// translate without needing their own useTranslation hook.
type Translate = ReturnType<typeof useTranslation>["t"];

function fmtDate(iso: string | null | undefined, neverLabel: string) {
  if (!iso) return neverLabel;
  return formatDate(iso);
}

export function AffiliateTab() {
  // All user-facing strings come from the `dashboard` namespace (affiliate.* keys).
  const { t } = useTranslation("dashboard");
  const [status, setStatus] = useState<AffiliateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.getAffiliateStatus();
      if (res.success && res.data) {
        setStatus(res.data);
      } else {
        setError(res.error ?? t("affiliate.toasts.loadFailed"));
      }
    } catch {
      setError(t("affiliate.toasts.loadFailed"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("affiliate.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("affiliate.referrals")}</h4>
          </div>
          <p className="text-2xl font-bold text-white">{status?.referralCount ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">{t("affiliate.referralsHint")}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("affiliate.discount")}</h4>
          </div>
          <p className="text-2xl font-bold text-white">{status?.discountPercent ?? 0}%</p>
          <p className="text-xs text-zinc-500 mt-1">
            {t("affiliate.expires", { date: fmtDate(status?.discountExpiresAt, t("affiliate.never")) })}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">{t("affiliate.nextMilestone")}</h4>
          </div>
          {status?.nextMilestone ? (
            <>
              <p className="text-2xl font-bold text-white">
                {t("affiliate.refsCount", { level: status.nextMilestone.level })}
              </p>
              <p className="text-xs text-zinc-500 mt-1 text-violet-400">{milestoneLabel(status.nextMilestone, t)}</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500 py-1">{t("affiliate.noMoreMilestones")}</p>
          )}
        </div>
      </div>

      {status?.referredBy && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-violet-400" />
            <p className="text-sm text-zinc-300">
              <Trans
                ns="dashboard"
                i18nKey="affiliate.referredBy"
                values={{
                  username: status.referredBy.username,
                  percent: status.config?.inviteeDiscountPercent ?? 0,
                }}
                components={{ 0: <span className="font-semibold text-white" /> }}
              />
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-white">{t("affiliate.milestoneRewards")}</h4>
          <button
            onClick={load}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("affiliate.refresh")}
          </button>
        </div>
        <MilestoneList status={status} />
      </div>

      <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/25 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-zinc-500" />
          <p className="text-xs text-zinc-400">
            <Trans
              ns="dashboard"
              i18nKey="affiliate.abusePolicy"
              values={{
                action: status?.config.abuseAction ?? "reject",
                scope: status?.config.abuseScope ?? "both",
              }}
              components={{
                0: <span className="capitalize text-zinc-300" />,
                1: <span className="capitalize text-zinc-300" />,
              }}
            />
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

// Label for a milestone reward: numeric values render as a +N% discount,
// anything else is a badge name from the instance config.
function milestoneLabel(l: AffiliateLevelInfo, t: Translate): string {
  const value = l.value;
  if (/^\d+$/.test(value)) return `+${value}%`;
  return t("affiliate.badge", { value });
}

function MilestoneList({ status }: { status: AffiliateStatus | null }) {
  // All user-facing strings come from the `dashboard` namespace (affiliate.* keys).
  const { t } = useTranslation("dashboard");
  if (!status) return <p className="text-sm text-zinc-500">{t("affiliate.noMilestoneData")}</p>;
  interface LevelEntry extends AffiliateLevelInfo {
    kind: "discount" | "allowance" | "badge";
  }
  const levels: LevelEntry[] = [
    ...status.config.discountLevels.map((l) => ({ ...l, kind: "discount" as const })),
    ...status.config.allowanceLevels.map((l) => ({ ...l, kind: "allowance" as const })),
    ...status.config.badgeLevels.map((l) => ({ ...l, kind: "badge" as const })),
  ].sort((a, b) => a.level - b.level);
  const granted = new Set(status.rewards.map((r) => `${r.kind}:${r.level}`));

  if (levels.length === 0) {
    return <p className="text-sm text-zinc-500">{t("affiliate.noMilestoneRewards")}</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {levels.map((l) => {
        const reached = l.level <= status.referralCount;
        const isGranted = granted.has(`${l.kind}:${l.level}`);
        return (
          <div
            key={`${l.kind}:${l.level}`}
            className={`rounded-lg border px-4 py-3 ${
              reached && isGranted
                ? "border-emerald-500/30 bg-emerald-500/5"
                : reached
                  ? "border-violet-500/30 bg-violet-500/5"
                  : "border-zinc-800 bg-zinc-900/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">{t("affiliate.referralCount", { level: l.level })}</p>
              {reached ? (
                <span className="text-xs text-emerald-400">{t("affiliate.reached")}</span>
              ) : (
                <span className="text-xs text-zinc-500">{t("affiliate.upNext")}</span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <ArrowRight className="h-3 w-3" />
              {l.kind === "allowance" ? t("affiliate.credits", { count: Number(l.value) }) : milestoneLabel(l, t)}
            </p>
          </div>
        );
      })}
    </div>
  );
}