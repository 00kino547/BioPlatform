import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type InviteCodeInfo, type InviteMeta } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw, Trash2, Ticket, Timer, Ban, Lock } from "lucide-react";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString();
}

export function InvitesTab() {
  const [codes, setCodes] = useState<InviteCodeInfo[]>([]);
  const [meta, setMeta] = useState<InviteMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [count, setCount] = useState(1);
  const [expiresDays, setExpiresDays] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.getInvites();
    if (res.success && res.data) {
      setCodes(res.data.data);
      setMeta(res.data.meta);
    } else {
      setError(res.error ?? "Could not load invites");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const body: { count: number; expiresInDays?: number } = { count };
    if (expiresDays) body.expiresInDays = Number(expiresDays);
    const res = await api.generateInvites(body);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? "Could not generate invites");
      return;
    }
    if (res.data) {
      setCodes(res.data.data);
      setMeta(res.data.meta);
    }
    setMessage("Invites generated!");
    setCount(1);
    setExpiresDays("");
    setTimeout(() => setMessage(""), 2500);
  };

  const handleRevoke = async (id: string) => {
    const res = await api.revokeInvite(id);
    if (res.success) {
      setCodes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, revokedAt: new Date().toISOString() } : c))
      );
    } else {
      setError(res.error ?? "Could not revoke invite");
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Invite copied!");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("");
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500 text-center py-12">Loading invites…</p>;
  }

  const cooldown = meta?.cooldownRemainingSeconds ?? 0;
  const maxBatch = meta?.role.canGenerate ? meta.role.batchLimit : 0;
  const defaultExpiry = meta?.role.defaultExpiryDays;
  const maxDays = meta?.role.maxExpiryDays;
  const minDays = meta?.role.minExpiryDays;

  return (
    <div className="space-y-6">
      {meta?.banned && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 flex items-start gap-3">
          <Ban className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white">Invite access suspended</h4>
            <p className="text-xs text-zinc-400 mt-1">
              You are banned from invite events and from generating invite codes. If you think this is a
              mistake, contact an administrator.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Ticket className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Event allowance</h4>
          </div>
          <p className="text-2xl font-bold text-white">{meta?.allowance ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">
            Expires {formatDate(meta?.allowanceExpiresAt)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Role quota</h4>
          </div>
          <p className="text-2xl font-bold text-white">
            {meta?.role.canGenerate ? `${maxBatch} / batch` : "—"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {meta?.role.canGenerate
              ? meta.role.outstandingLimit > 0
                ? `Max ${meta.role.outstandingLimit} unused at once`
                : "Unlimited unused at once"
              : "Your role cannot generate invites"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="h-4 w-4 text-violet-400" />
            <h4 className="text-sm font-medium text-white">Outstanding</h4>
          </div>
          <p className="text-2xl font-bold text-white">{meta?.outstanding ?? 0}</p>
          <p className="text-xs text-zinc-500 mt-1">Unused invite codes you hold</p>
        </div>
      </div>

      {!meta?.banned && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
          <h4 className="text-sm font-medium text-white mb-1">Generate invite codes</h4>
          <p className="text-xs text-zinc-500 mb-4">
            {meta?.role.canGenerate
              ? `Your role lets you create up to ${maxBatch} codes per batch${
                  meta.role.cooldownMinutes > 0 ? `, with a ${meta.role.cooldownMinutes} minute cooldown between batches` : ""
                }.`
              : "You can only generate codes while an invite event grants you an allowance."}
            {meta?.allowanceActive && meta.allowanceExpiresAt
              ? ` Event codes must expire before ${formatDate(meta.allowanceExpiresAt)} and are refunded if they expire unused.`
              : ""}
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
              {message}
            </div>
          )}

          {!meta?.generationEnabled ? (
            <p className="text-sm text-zinc-500">
              Invite generation is currently disabled. Check back later.
            </p>
          ) : cooldown > 0 ? (
            <p className="text-sm text-amber-400">
              Please wait {cooldown}s before generating more invites.
            </p>
          ) : meta?.allowanceActive || meta?.role.canGenerate ? (
            <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Count</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(maxBatch, meta?.allowance ?? 1)}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Expires in days{" "}
                  <span className="text-zinc-500">
                    (default {defaultExpiry ?? "—"}, {minDays ?? "—"}–{maxDays ?? "—"}d)
                  </span>
                </label>
                <input
                  type="number"
                  min={minDays ?? 1}
                  max={maxDays ?? 365}
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(e.target.value)}
                  placeholder={String(defaultExpiry ?? 30)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={busy} className="whitespace-nowrap">
                  {busy ? "Generating..." : "Generate"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-zinc-500">
              You currently have no invite credits. You'll be able to generate codes when an admin
              grants you an allowance or enables generation for your role.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-white">My invite codes</h4>
          <button
            onClick={load}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {codes.length === 0 ? (
          <p className="text-sm text-zinc-500">You have no invite codes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                  <th className="pb-3 font-medium">Code</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Expires</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {codes.map((c) => {
                  const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
                  return (
                    <tr key={c.id}>
                      <td className="py-3 font-mono text-zinc-300">
                        {c.code}
                        {c.fromAllowance && (
                          <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400 border border-violet-500/20">
                            EVENT
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        {c.revokedAt ? (
                          <span className="text-red-400">Revoked</span>
                        ) : c.usedById ? (
                          <span className="text-zinc-500">Used</span>
                        ) : expired ? (
                          <span className="text-zinc-500">Expired</span>
                        ) : (
                          <span className="text-emerald-400">Available</span>
                        )}
                      </td>
                      <td className="py-3 text-zinc-500">{formatDate(c.expiresAt)}</td>
                      <td className="py-3 text-zinc-500">{formatDate(c.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => copy(c.code)}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                            title="Copy code"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {!c.usedById && !c.revokedAt && !expired && (
                            <button
                              onClick={() => handleRevoke(c.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
