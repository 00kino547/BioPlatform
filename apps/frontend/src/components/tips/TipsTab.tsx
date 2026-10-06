import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Save, Trash2 } from "lucide-react";
import { api, type Profile, type TipRecord, type TipCoinTotals } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SectionCard, Toggle } from "@/components/ui/dashboard";

interface TipsTabProps {
  profile: Profile | null;
  onProfileChange: (patch: Partial<Profile>) => void;
}

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500";

function fmtAmt(v: string, coin: string): string {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return v;
  return `${n.toFixed(coin === "BTC" ? 8 : 8)} ${coin}`;
}

export function TipsTab({ profile, onProfileChange }: TipsTabProps) {
  const profileId = profile?.id;
  const [enabled, setEnabled] = useState(!!profile?.tipsEnabled);
  const [heading, setHeading] = useState(profile?.tipsHeading ?? "");
  const [btcAddress, setBtcAddress] = useState(profile?.tipsBtcAddress ?? "");
  const [ltcAddress, setLtcAddress] = useState(profile?.tipsLtcAddress ?? "");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const [recent, setRecent] = useState<TipRecord[]>([]);
  const [totals, setTotals] = useState<Record<string, TipCoinTotals>>({});
  const [overviewMode, setOverviewMode] = useState<"btcpay" | "address">("address");
  const [overviewLoading, setOverviewLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!profileId) return;
    setOverviewLoading(true);
    const res = await api.getTipsOverview(profileId);
    if (res.success && res.data) {
      setRecent(res.data.recent);
      setTotals(res.data.totals);
      setOverviewMode(res.data.mode);
    }
    setOverviewLoading(false);
  }, [profileId]);

  useEffect(() => {
    setEnabled(!!profile?.tipsEnabled);
    setHeading(profile?.tipsHeading ?? "");
    setBtcAddress(profile?.tipsBtcAddress ?? "");
    setLtcAddress(profile?.tipsLtcAddress ?? "");
    if (profileId) {
      void loadOverview();
    }
  }, [profile?.id, profile?.tipsEnabled, profile?.tipsHeading, profile?.tipsBtcAddress, profile?.tipsLtcAddress, profileId, loadOverview]);

  const saveSettings = async () => {
    if (!profileId) return;
    setSettingsSaving(true);
    setSettingsError("");
    const patch = {
      tipsEnabled: enabled,
      tipsHeading: heading.trim() || null,
      tipsBtcAddress: btcAddress.trim() || null,
      tipsLtcAddress: ltcAddress.trim() || null,
    };
    const res = await api.updateProfile(patch, profileId);
    setSettingsSaving(false);
    if (!res.success || !res.data) {
      setSettingsError(res.error ?? "Could not save tips settings.");
      return;
    }
    onProfileChange({
      tipsEnabled: res.data.tipsEnabled,
      tipsHeading: res.data.tipsHeading,
      tipsBtcAddress: res.data.tipsBtcAddress,
      tipsLtcAddress: res.data.tipsLtcAddress,
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const removeTip = async (id: string) => {
    if (!profileId) return;
    if (!confirm("Delete this tip record?")) return;
    await api.deleteTip(id, profileId);
    void loadOverview();
  };

  if (!profileId) {
    return <p className="text-sm text-zinc-500 text-center py-12">Select a profile to manage its tips.</p>;
  }

  const btcTotals = totals.BTC ?? { confirmedAmount: "0", recordedAmount: "0", confirmedCount: 0, recordedCount: 0 };
  const ltcTotals = totals.LTC ?? { confirmedAmount: "0", recordedAmount: "0", confirmedCount: 0, recordedCount: 0 };

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<Coins className="h-4 w-4" />}
        title="Tips"
        desc="Accept cryptocurrency tips from your visitors. When BTCPay is configured on this instance, visitors can pay directly; otherwise a wallet address + QR is shown and you reconcile recorded tips manually."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Tips enabled</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {enabled ? "The tip block is shown on your public profile." : "Off — no tip block is visible to visitors."}
              </p>
            </div>
            <Toggle on={enabled} onChange={() => setEnabled(!enabled)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tip heading</label>
            <input
              value={heading}
              maxLength={60}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="Send a tip"
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">Shown above the public tip block. Leave empty for the default heading.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Bitcoin address</label>
            <input
              value={btcAddress}
              onChange={(e) => setBtcAddress(e.target.value)}
              placeholder="1... / 3... / bc1..."
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">Your public BTC wallet address (P2PKH, P2SH, or bech32).</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Litecoin address</label>
            <input
              value={ltcAddress}
              onChange={(e) => setLtcAddress(e.target.value)}
              placeholder="L... / M... / ltc1..."
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">Your public LTC wallet address (P2PKH, P2SH, or bech32).</p>
          </div>

          {settingsError && (
            <p className="text-xs text-red-400">{settingsError}</p>
          )}

          <div className="flex gap-2.5">
            <Button onClick={saveSettings} disabled={settingsSaving}>
              <Save className="h-4 w-4" />
              {settingsSaving ? "Saving..." : settingsSaved ? "Saved!" : "Save Settings"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Coins className="h-4 w-4" />}
        title="Overview"
        desc={`${overviewMode === "btcpay" ? "BTCPay is configured — confirmed payments are marked automatically via webhook." : "Address mode — tips are recorded as intents; you reconcile them against your wallet."}`}
      >
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs text-zinc-500">Bitcoin (recorded)</p>
            <p className="text-sm font-semibold text-white">{fmtAmt(btcTotals.recordedAmount, "BTC")}</p>
            <p className="text-xs text-zinc-500">{btcTotals.recordedCount} tip(s)</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs text-zinc-500">Litecoin (recorded)</p>
            <p className="text-sm font-semibold text-white">{fmtAmt(ltcTotals.recordedAmount, "LTC")}</p>
            <p className="text-xs text-zinc-500">{ltcTotals.recordedCount} tip(s)</p>
          </div>
        </div>

        {overviewLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">No tips yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {fmtAmt(t.amount, t.coin)}{t.name ? ` — ${t.name}` : ""}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {t.status}{t.paidAt ? ` · paid ${new Date(t.paidAt).toLocaleDateString()}` : ` · recorded ${new Date(t.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeTip(t.id)}
                  className="flex-shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Delete tip record"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
