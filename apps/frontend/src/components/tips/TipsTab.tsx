import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Coins, Loader2, Save, Trash2 } from "lucide-react";
import { api, type Profile, type TipRecord, type TipCoinTotals } from "@/lib/api";
import { formatDate } from "@/lib/intl";
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
  const { t } = useTranslation("profile");
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
      setSettingsError(res.error ?? t("tipsTab.saveError"));
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
    if (!confirm(t("tipsTab.deleteConfirm"))) return;
    await api.deleteTip(id, profileId);
    void loadOverview();
  };

  if (!profileId) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("tipsTab.selectProfile")}</p>;
  }

  const btcTotals = totals.BTC ?? { confirmedAmount: "0", recordedAmount: "0", confirmedCount: 0, recordedCount: 0 };
  const ltcTotals = totals.LTC ?? { confirmedAmount: "0", recordedAmount: "0", confirmedCount: 0, recordedCount: 0 };

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<Coins className="h-4 w-4" />}
        title={t("tipsTab.title")}
        desc={t("tipsTab.description")}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{t("tipsTab.tipsEnabled")}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {enabled ? t("tipsTab.enabledOn") : t("tipsTab.enabledOff")}
              </p>
            </div>
            <Toggle on={enabled} onChange={() => setEnabled(!enabled)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("tipsTab.tipHeading")}</label>
            <input
              value={heading}
              maxLength={60}
              onChange={(e) => setHeading(e.target.value)}
              placeholder={t("tipsTab.tipHeadingPlaceholder")}
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">{t("tipsTab.tipHeadingHelp")}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("tipsTab.bitcoinAddress")}</label>
            <input
              value={btcAddress}
              onChange={(e) => setBtcAddress(e.target.value)}
              placeholder={t("tipsTab.bitcoinAddressPlaceholder")}
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">{t("tipsTab.bitcoinAddressHelp")}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("tipsTab.litecoinAddress")}</label>
            <input
              value={ltcAddress}
              onChange={(e) => setLtcAddress(e.target.value)}
              placeholder={t("tipsTab.litecoinAddressPlaceholder")}
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">{t("tipsTab.litecoinAddressHelp")}</p>
          </div>

          {settingsError && (
            <p className="text-xs text-red-400">{settingsError}</p>
          )}

          <div className="flex gap-2.5">
            <Button onClick={saveSettings} disabled={settingsSaving}>
              <Save className="h-4 w-4" />
              {settingsSaving ? t("tipsTab.saving") : settingsSaved ? t("tipsTab.saved") : t("tipsTab.saveSettings")}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Coins className="h-4 w-4" />}
        title={t("tipsTab.overview")}
        desc={overviewMode === "btcpay" ? t("tipsTab.overviewBtcpay") : t("tipsTab.overviewAddress")}
      >
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs text-zinc-500">{t("tipsTab.bitcoinRecorded")}</p>
            <p className="text-sm font-semibold text-white">{fmtAmt(btcTotals.recordedAmount, "BTC")}</p>
            <p className="text-xs text-zinc-500">{t("tipsTab.tipCount", { count: btcTotals.recordedCount })}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <p className="text-xs text-zinc-500">{t("tipsTab.litecoinRecorded")}</p>
            <p className="text-sm font-semibold text-white">{fmtAmt(ltcTotals.recordedAmount, "LTC")}</p>
            <p className="text-xs text-zinc-500">{t("tipsTab.tipCount", { count: ltcTotals.recordedCount })}</p>
          </div>
        </div>

        {overviewLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">{t("tipsTab.noTips")}</p>
        ) : (
          <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
            {recent.map((tip) => (
              <li key={tip.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {fmtAmt(tip.amount, tip.coin)}{tip.name ? t("tipsTab.tipNameSuffix", { name: tip.name }) : ""}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {tip.status}{tip.paidAt ? t("tipsTab.paidDate", { date: formatDate(tip.paidAt) }) : t("tipsTab.recordedDate", { date: formatDate(tip.createdAt) })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeTip(tip.id)}
                  className="flex-shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title={t("tipsTab.deleteTip")}
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
