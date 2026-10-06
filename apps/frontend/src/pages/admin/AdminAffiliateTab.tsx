import { useCallback, useEffect, useState } from "react";
import { api, type AffiliateLevelInfo, type AffiliateOverview } from "@/lib/api";
import { RefreshCw, Users, Percent, Trophy, Shield, Plus, Trash2, Save, RotateCcw } from "lucide-react";

type Kind = "discountLevels" | "allowanceLevels" | "badgeLevels";

interface DraftRow {
  key: string;
  level: string;
  value: string;
}

interface Draft {
  discountLevels: DraftRow[];
  allowanceLevels: DraftRow[];
  badgeLevels: DraftRow[];
  inviteeDiscountPercent: string;
  discountDurationDays: string;
}

const KIND_LABEL: Record<Kind, string> = {
  discountLevels: "Discount levels",
  allowanceLevels: "Allowance levels",
  badgeLevels: "Badge levels",
};

const KIND_HINT: Record<Kind, string> = {
  discountLevels: "Referrals → discount to the referrer (%)",
  allowanceLevels: "Referrals → extra invite credits",
  badgeLevels: "Referrals → badge slug",
};

function toRows(levels: AffiliateLevelInfo[]): DraftRow[] {
  return levels.map((l, i) => ({ key: `row-${i}-${l.level}`, level: String(l.level), value: l.value }));
}

function toLevels(rows: DraftRow[]): { level: number; value: string }[] {
  const out: { level: number; value: string }[] = [];
  for (const row of rows) {
    const level = Number(row.level);
    const value = row.value.trim();
    if (Number.isInteger(level) && level >= 1 && value !== "") {
      out.push({ level, value });
    }
  }
  return out;
}

export function AdminAffiliateTab() {
  const [overview, setOverview] = useState<AffiliateOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const syncDraft = useCallback((o: AffiliateOverview) => {
    setDraft({
      discountLevels: toRows(o.config.discountLevels),
      allowanceLevels: toRows(o.config.allowanceLevels),
      badgeLevels: toRows(o.config.badgeLevels),
      inviteeDiscountPercent: String(o.config.inviteeDiscountPercent ?? 0),
      discountDurationDays: String(o.config.discountDurationDays ?? 365),
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.getAffiliateOverview();
      if (res.success && res.data) {
        setOverview(res.data);
        syncDraft(res.data);
        setError("");
      } else {
        setError(res.error ?? "Could not load affiliate overview");
      }
    } catch {
      setError("Could not load affiliate overview");
    }
    setLoading(false);
  }, [syncDraft]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = !draft || !overview
    ? false
    : JSON.stringify({
        discountLevels: toLevels(draft.discountLevels),
        allowanceLevels: toLevels(draft.allowanceLevels),
        badgeLevels: toLevels(draft.badgeLevels),
        inviteeDiscountPercent: Number(draft.inviteeDiscountPercent),
        discountDurationDays: Number(draft.discountDurationDays),
      }) !==
      JSON.stringify({
        discountLevels: overview.config.discountLevels,
        allowanceLevels: overview.config.allowanceLevels,
        badgeLevels: overview.config.badgeLevels,
        inviteeDiscountPercent: overview.config.inviteeDiscountPercent,
        discountDurationDays: overview.config.discountDurationDays,
      });

  const addRow = (kind: Kind) => {
    setDraft((d) => (d ? { ...d, [kind]: [...d[kind], { key: crypto.randomUUID(), level: "", value: "" }] } : d));
  };

  const patchParam = (key: "inviteeDiscountPercent" | "discountDurationDays", value: string) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const removeRow = (kind: Kind, key: string) => {
    setDraft((d) => (d ? { ...d, [kind]: d[kind].filter((r) => r.key !== key) } : d));
  };

  const patchRow = (kind: Kind, key: string, patch: Partial<DraftRow>) => {
    setDraft((d) =>
      d ? { ...d, [kind]: d[kind].map((r) => (r.key === key ? { ...r, ...patch } : r)) } : d
    );
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.saveAffiliateMilestones({
        discountLevels: toLevels(draft.discountLevels),
        allowanceLevels: toLevels(draft.allowanceLevels),
        badgeLevels: toLevels(draft.badgeLevels),
        inviteeDiscountPercent: Number(draft.inviteeDiscountPercent),
        discountDurationDays: Number(draft.discountDurationDays),
      });
      if (res.success && res.data) {
        setOverview(res.data);
        syncDraft(res.data);
      } else {
        setError(res.error ?? "Could not save milestone configuration");
      }
    } catch {
      setError("Could not save milestone configuration");
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!window.confirm("Reset milestone configuration to the environment (AFFILIATE_*_LEVELS) defaults?")) return;
    setResetting(true);
    setError("");
    try {
      const res = await api.resetAffiliateMilestones();
      if (res.success && res.data) {
        setOverview(res.data);
        syncDraft(res.data);
      } else {
        setError(res.error ?? "Could not reset milestone configuration");
      }
    } catch {
      setError("Could not reset milestone configuration");
    }
    setResetting(false);
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">Loading affiliate overview…</p>;
  }

  const cfg = overview?.config;
  const source = overview?.configSource ?? "env";

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-violet-400" />
            <p className="text-sm font-medium text-white">Referrals</p>
          </div>
          <p className="text-3xl font-bold text-white">{overview?.totalReferrals ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">Total redeemed invites</p>
        </div>
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-violet-400" />
            <p className="text-sm font-medium text-white">Invitee discount</p>
          </div>
          <p className="text-3xl font-bold text-white">{cfg?.inviteeDiscountPercent ?? 0}%</p>
          <p className="text-xs text-zinc-500 mt-1">Flat discount per invited user</p>
        </div>
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-violet-400" />
            <p className="text-sm font-medium text-white">Referrers</p>
          </div>
          <p className="text-3xl font-bold text-white">{overview?.distinctReferrers ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">Distinct referrers with redemptions</p>
        </div>
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-violet-400" />
            <p className="text-sm font-medium text-white">Anti-abuse</p>
          </div>
          <p className="text-2xl font-bold text-white capitalize">{cfg?.abuseAction ?? "reject"}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Scope: <span className="capitalize">{cfg?.abuseScope ?? "both"}</span> on same IP/device
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-white">Milestone configuration</h3>
          <button
            onClick={load}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-zinc-500">
            {source === "db" ? (
              <span className="text-violet-400 font-medium">
                Admin override — replaces the AFFILIATE_*_LEVELS environment defaults
              </span>
            ) : (
              "Using the AFFILIATE_*_LEVELS environment defaults"
            )}
          </p>
          {source === "db" && (
            <button
              onClick={reset}
              disabled={resetting}
              className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {resetting ? "Resetting…" : "Use environment defaults"}
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 mb-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
            <p className="text-sm font-medium text-white mb-0.5">Invitee discount</p>
            <p className="text-xs text-zinc-500 mb-3">Flat % off the referred user gets when they sign up via an invite (0 = off)</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={draft?.inviteeDiscountPercent ?? ""}
                onChange={(e) => patchParam("inviteeDiscountPercent", e.target.value)}
                placeholder="%"
                className="w-24 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500/50"
              />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
            <p className="text-sm font-medium text-white mb-0.5">Discount duration</p>
            <p className="text-xs text-zinc-500 mb-3">How long the discount lasts for the invitee and the referrer (days, -1 = permanent)</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={-1}
                max={3650}
                value={draft?.discountDurationDays ?? ""}
                onChange={(e) => patchParam("discountDurationDays", e.target.value)}
                placeholder="days"
                className="w-28 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500/50"
              />
              <span className="text-sm text-zinc-500">days</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {(["discountLevels", "allowanceLevels", "badgeLevels"] as Kind[]).map((kind) => (
            <div key={kind} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
              <p className="text-sm font-medium text-white mb-0.5">{KIND_LABEL[kind]}</p>
              <p className="text-xs text-zinc-500 mb-3">{KIND_HINT[kind]}</p>
              <div className="space-y-2">
                {(draft?.[kind] ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-500 py-1">No levels configured</p>
                ) : (
                  (draft?.[kind] ?? []).map((row) => (
                    <div key={row.key} className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={row.level}
                        onChange={(e) => patchRow(kind, row.key, { level: e.target.value })}
                        placeholder="refs"
                        className="w-20 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500/50"
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => patchRow(kind, row.key, { value: e.target.value })}
                        placeholder={kind === "badgeLevels" ? "badge slug" : kind === "allowanceLevels" ? "invites" : "%"}
                        className="flex-1 min-w-0 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500/50"
                      />
                      <button
                        onClick={() => removeRow(kind, row.key)}
                        className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                        aria-label="Remove level"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => addRow(kind)}
                className="mt-3 text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add level
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : dirty ? "Save configuration" : "Saved"}
          </button>
          {!dirty && <p className="text-xs text-zinc-500">No pending changes</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6">
        <h3 className="text-sm font-medium text-white mb-4">Top referrers</h3>
        {(overview?.leaderboard ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">No referrals yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                  <th className="pb-3 font-medium">#</th>
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium">Tier</th>
                  <th className="pb-3 font-medium">Referrals</th>
                  <th className="pb-3 font-medium">Discount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {(overview?.leaderboard ?? []).map((u, i) => (
                  <tr key={u.id}>
                    <td className="py-3 text-zinc-500">{i + 1}</td>
                    <td className="py-3 text-white">@{u.username}</td>
                    <td className="py-3 text-zinc-400">{u.tier}</td>
                    <td className="py-3 text-zinc-300">{u.referralCount}</td>
                    <td className="py-3 text-violet-400">{u.discountPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}