import { useCallback, useEffect, useState } from "react";
import { api, type AffiliateLevelInfo, type AffiliateStatus } from "@/lib/api";
import { RefreshCw, Gift, Users, Percent, Trophy, ArrowRight, Shield } from "lucide-react";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString();
}

export function AffiliateTab() {
  const [status, setStatus] = useState<AffiliateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.getAffiliateStatus();
      if (res.success && res.data) {
        setStatus(res.data);
      } else {
        setError(res.error ?? "Could not load affiliate info");
      }
    } catch {
      setError("Could not load affiliate info");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">Loading affiliate info…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Referrals</h4>
          </div>
          <p className="text-2xl font-bold text-white">{status?.referralCount ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">People who joined through your invite</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Your discount</h4>
          </div>
          <p className="text-2xl font-bold text-white">{status?.discountPercent ?? 0}%</p>
          <p className="text-xs text-zinc-500 mt-1">Expires {fmtDate(status?.discountExpiresAt)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Next milestone</h4>
          </div>
          {status?.nextMilestone ? (
            <>
              <p className="text-2xl font-bold text-white">{status.nextMilestone.level} refs</p>
              <p className="text-xs text-zinc-500 mt-1 text-violet-400">{milestoneLabel(status.nextMilestone)}</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500 py-1">No further milestones configured</p>
          )}
        </div>
      </div>

      {status?.referredBy && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-violet-400" />
            <p className="text-sm text-zinc-300">
              You were invited by <span className="font-semibold text-white">@{status.referredBy.username}</span> —
              you received a {(status.config?.inviteeDiscountPercent ?? 0)}% discount.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-white">Milestone rewards</h4>
          <button
            onClick={load}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <MilestoneList status={status} />
      </div>

      <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/25 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-zinc-500" />
          <p className="text-xs text-zinc-400">
            One account per device/network per invitation. Current policy:{" "}
            <span className="capitalize text-zinc-300">{status?.config.abuseAction ?? "reject"}</span> across{" "}
            <span className="capitalize text-zinc-300">{status?.config.abuseScope ?? "both"}</span>.
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

function milestoneLabel(l: AffiliateLevelInfo): string {
  const value = l.value;
  if (/^\d+$/.test(value)) return `+${value}%`;
  return `Badge "${value}"`;
}

function MilestoneList({ status }: { status: AffiliateStatus | null }) {
  if (!status) return <p className="text-sm text-zinc-500">No milestone data.</p>;
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
    return <p className="text-sm text-zinc-500">No milestone rewards configured for this instance.</p>;
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
              <p className="text-sm font-medium text-white">{l.level} referrals</p>
              {reached ? (
                <span className="text-xs text-emerald-400">Reached</span>
              ) : (
                <span className="text-xs text-zinc-500">Up next</span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <ArrowRight className="h-3 w-3" />
              {l.kind === "allowance" ? `+${l.value} invite credit(s)` : milestoneLabel(l)}
            </p>
          </div>
        );
      })}
    </div>
  );
}