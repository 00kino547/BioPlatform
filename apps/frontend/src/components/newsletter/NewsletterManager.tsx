import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Globe, History, Loader2, Mail, MailCheck, Megaphone, Rocket, Save, Send, Server, ShieldCheck, Trash2, Users } from "lucide-react";
import { api, type NewsletterSendRecord, type NewsletterSenderPayload, type NewsletterSenderSettings, type NewsletterSubscriber, type Profile } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/intl";
import { Button } from "@/components/ui/button";
import { SectionCard, Toggle } from "@/components/ui/dashboard";

interface NewsletterManagerProps {
  profile: Profile | null;
  tier: "FREE" | "PRO" | "ENTERPRISE";
  senderWhitelisted: boolean;
  hasPlatformSender: boolean;
  onProfileChange: (patch: Partial<Profile>) => void;
}

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500";

const emptySenderDraft: NewsletterSenderPayload = {
  fromName: "",
  fromEmail: "",
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
};

export function NewsletterManager({ profile, tier, senderWhitelisted, hasPlatformSender, onProfileChange }: NewsletterManagerProps) {
  // All user-facing strings come from the `dashboard` namespace (newsletter.* keys).
  const { t } = useTranslation("dashboard");
  const profileId = profile?.id;
  const [enabled, setEnabled] = useState(!!profile?.newsletterEnabled);
  const [visible, setVisible] = useState(!!profile?.newsletterVisible);
  const [heading, setHeading] = useState(profile?.newsletterHeading ?? "");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [subscriberCount, setSubscriberCount] = useState({ total: 0, active: 0, unsubscribed: 0 });
  const [subscribersLoading, setSubscribersLoading] = useState(false);

  const [sends, setSends] = useState<NewsletterSendRecord[]>([]);
  const [sendHistoryLoading, setSendHistoryLoading] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [sender, setSender] = useState<NewsletterSenderSettings | null>(null);
  const [senderLoading, setSenderLoading] = useState(false);
  const [senderDraft, setSenderDraft] = useState<NewsletterSenderPayload>(emptySenderDraft);
  const [senderSaving, setSenderSaving] = useState(false);
  const [senderError, setSenderError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [testing, setTesting] = useState(false);
  const [platformEnabled, setPlatformEnabled] = useState(false);

  const loadSubscribers = useCallback(async () => {
    if (!profileId) return;
    setSubscribersLoading(true);
    const res = await api.getNewsletterSubscribers(profileId);
    if (res.success && res.data) {
      setSubscribers(res.data.subscribers);
      setSubscriberCount(res.data.counts);
    }
    setSubscribersLoading(false);
  }, [profileId]);

  const loadSends = useCallback(async () => {
    if (!profileId) return;
    setSendHistoryLoading(true);
    const res = await api.getNewsletterSends(profileId);
    if (res.success && res.data) setSends(res.data.sends);
    setSendHistoryLoading(false);
  }, [profileId]);

  const loadSender = useCallback(async () => {
    if (!profileId) return;
    setSenderLoading(true);
    const res = await api.getNewsletterSender(profileId);
    if (res.success && res.data) {
      const s = res.data.sender;
      setSender(s);
      setPlatformEnabled(res.data.platformEnabled);
      if (s) {
        setSenderDraft({
          fromName: s.fromName,
          fromEmail: s.fromEmail,
          smtpHost: s.smtpHost,
          smtpPort: s.smtpPort,
          smtpSecure: s.smtpSecure,
          smtpUser: s.smtpUser ?? "",
          smtpPassword: "",
        });
      }
    } else if (res.error && res.error !== "Profile not found") {
      setSenderError(res.error);
    }
    setSenderLoading(false);
  }, [profileId]);

  useEffect(() => {
    setEnabled(!!profile?.newsletterEnabled);
    setVisible(!!profile?.newsletterVisible);
    setHeading(profile?.newsletterHeading ?? "");
    if (profileId) {
      void loadSubscribers();
      void loadSends();
      void loadSender();
    }
  }, [profileId, profile?.newsletterEnabled, profile?.newsletterVisible, profile?.newsletterHeading, loadSubscribers, loadSends, loadSender]);

  const saveSettings = async () => {
    if (!profileId) return;
    setSettingsSaving(true);
    setSettingsSaved(false);
    const res = await api.updateProfile(
      { newsletterEnabled: enabled, newsletterVisible: visible, newsletterHeading: heading },
      profileId
    );
    if (res.success) {
      setSettingsSaved(true);
      onProfileChange({ newsletterEnabled: enabled, newsletterVisible: visible, newsletterHeading: heading });
    } else {
      setSettingsError(res.error ?? t("newsletter.toasts.settingsFailed"));
    }
    setSettingsSaving(false);
  };

  const removeSubscriber = async (id: string) => {
    if (!profileId) return;
    const res = await api.deleteNewsletterSubscriber(id, profileId);
    if (res.success) {
      void loadSubscribers();
    } else {
      setSettingsError(res.error ?? t("newsletter.toasts.removeSubscriberFailed"));
    }
  };

  const saveSender = async () => {
    if (!profileId) return;
    setSenderSaving(true);
    setSenderError("");
    const res = await api.setNewsletterSender(senderDraft, profileId);
    if (res.success && res.data) {
      setSender(res.data.sender);
      setSenderDraft({
        fromName: res.data.sender.fromName,
        fromEmail: res.data.sender.fromEmail,
        smtpHost: res.data.sender.smtpHost,
        smtpPort: res.data.sender.smtpPort,
        smtpSecure: res.data.sender.smtpSecure,
        smtpUser: res.data.sender.smtpUser ?? "",
        smtpPassword: "",
      });
    } else {
      setSenderError(res.error ?? t("newsletter.toasts.senderSaveFailed"));
    }
    setSenderSaving(false);
  };

  const verifySenderDomain = async () => {
    if (!profileId || !sender) return;
    setVerifying(true);
    setSenderError("");
    const res = await api.verifyNewsletterSender(profileId);
    if (res.success && res.data?.verified) {
      setSender((s) => (s ? { ...s, verifiedAt: new Date().toISOString() } : s));
    } else {
      const rec = res.data?.verificationRecord;
      const tok = res.data?.verificationToken;
      setSenderError(
        rec && tok
          ? t("newsletter.toasts.verifyPending", { record: rec, token: tok })
          : (res.error ?? t("newsletter.toasts.verifyFailed"))
      );
    }
    setVerifying(false);
  };

  const testSenderSmtp = async () => {
    if (!profileId || !sender) return;
    setTesting(true);
    setSenderError("");
    const res = await api.testNewsletterSender(profileId);
    if (res.success && res.data?.tested) {
      setSender((s) => (s ? { ...s, testedAt: new Date().toISOString() } : s));
    } else {
      setSenderError(res.error ?? t("newsletter.toasts.testFailed"));
    }
    setTesting(false);
  };

  const removeSender = async () => {
    if (!profileId) return;
    setSenderError("");
    const res = await api.deleteNewsletterSender(profileId);
    if (res.success) {
      setSender(null);
      setSenderDraft(emptySenderDraft);
    } else {
      setSenderError(res.error ?? t("newsletter.toasts.removeSenderFailed"));
    }
  };

  const sendNewsletter = async () => {
    if (!profileId) return;
    setSending(true);
    setSendResult(null);
    const res = await api.sendNewsletter({ subject, body }, profileId);
    if (res.success && res.data) {
      setSendResult({
        ok: true,
        message: t("newsletter.toasts.sent", {
          recipients: res.data.recipientCount,
          delivered: res.data.successCount,
          failed: res.data.failedCount,
        }),
      });
      setSubject("");
      setBody("");
      void loadSends();
    } else {
      setSendResult({ ok: false, message: res.error ?? t("newsletter.toasts.sendFailed") });
    }
    setSending(false);
  };

  if (!profileId) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("newsletter.selectProfile")}</p>;
  }

  // Tier name labels (Free/Pro/Enterprise) live under newsletter.* — not the
  // billing section, whose PRO label reads "Premium".
  const tierLabel =
    tier === "FREE" ? t("common:tiers.free") : tier === "PRO" ? t("common:tiers.pro") : t("common:tiers.enterprise");
  const senderUnlocked = tier !== "FREE" || senderWhitelisted;
  const domainOk = !!sender?.verifiedAt || senderWhitelisted;
  const senderReady = !!sender && !!sender.hasPassword && domainOk && !!sender.testedAt;
  const userPlatformSend = hasPlatformSender || (platformEnabled && senderWhitelisted && tier !== "FREE");
  const canSendNow = (senderReady || userPlatformSend) && enabled;

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<Mail className="h-4 w-4" />}
        title={t("newsletter.title")}
        desc={t("newsletter.desc")}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{t("newsletter.enabledLabel")}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {enabled ? t("newsletter.enabledOn") : t("newsletter.enabledOff")}
              </p>
            </div>
            <Toggle on={enabled} onChange={() => setEnabled(!enabled)} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{t("newsletter.visibleLabel")}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{t("newsletter.visibleHint")}</p>
            </div>
            <Toggle on={visible} onChange={() => setVisible(!visible)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("newsletter.headingLabel")}</label>
            <input
              value={heading}
              maxLength={60}
              onChange={(e) => setHeading(e.target.value)}
              placeholder={t("newsletter.headingPlaceholder")}
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">{t("newsletter.headingHint")}</p>
          </div>

          {settingsError && (
            <p className="text-xs text-red-400">{settingsError}</p>
          )}

          <div className="flex gap-2.5">
            <Button onClick={saveSettings} disabled={settingsSaving}>
              <Save className="h-4 w-4" />
              {settingsSaving ? t("newsletter.saving") : settingsSaved ? t("newsletter.saved") : t("newsletter.saveSettings")}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Server className="h-4 w-4" />}
        title={t("newsletter.senderTitle")}
        desc={
          senderUnlocked
            ? t("newsletter.senderDescUnlocked")
            : t("newsletter.senderDescLocked")
        }
      >
        {!senderUnlocked && !sender ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {t("newsletter.tierLocked")}
          </div>
        ) : (
          <div className="space-y-3">
            {senderLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("newsletter.fromName")}</label>
                    <input value={senderDraft.fromName} maxLength={60} onChange={(e) => setSenderDraft((d) => ({ ...d, fromName: e.target.value }))} placeholder={t("newsletter.fromNamePlaceholder")} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("newsletter.fromEmail")}</label>
                    <input type="email" value={senderDraft.fromEmail} onChange={(e) => setSenderDraft((d) => ({ ...d, fromEmail: e.target.value }))} placeholder={t("newsletter.fromEmailPlaceholder")} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("newsletter.smtpHost")}</label>
                    <input value={senderDraft.smtpHost} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpHost: e.target.value }))} placeholder={t("newsletter.smtpHostPlaceholder")} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("newsletter.port")}</label>
                      <input type="number" value={senderDraft.smtpPort} min={1} max={65535} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpPort: Number(e.target.value) || 587 }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("newsletter.username")}</label>
                      <input value={senderDraft.smtpUser ?? ""} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpUser: e.target.value }))} placeholder={t("newsletter.usernamePlaceholder")} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      {t("newsletter.smtpPassword")}{sender?.hasPassword ? ` ${t("newsletter.smtpPasswordSuffix")}` : ""}
                    </label>
                    <input type="password" value={senderDraft.smtpPassword} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpPassword: e.target.value }))} placeholder="••••••••" className={inputClass} />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                      <input type="checkbox" checked={senderDraft.smtpSecure} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpSecure: e.target.checked }))} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-violet-500" />
                      {t("newsletter.useTls")}
                    </label>
                  </div>
                </div>

                {sender && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${domainOk ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {sender.verifiedAt ? t("newsletter.domainVerified") : senderWhitelisted ? t("newsletter.domainExempt") : t("newsletter.domainUnverified")}
                    </span>
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${sender.testedAt ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      <MailCheck className="h-3.5 w-3.5" />
                      {sender.testedAt ? t("newsletter.testSent") : t("newsletter.testMissing")}
                    </span>
                  </div>
                )}

                {!domainOk && sender && (
                  <p className="text-xs text-zinc-500">
                    <Trans
                      ns="dashboard"
                      i18nKey="newsletter.dnsHint"
                      values={{ record: sender.verificationRecord, token: sender.verificationToken }}
                      components={{
                        0: <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-violet-300" />,
                        1: <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-violet-300" />,
                        2: <Globe className="h-3.5 w-3.5 inline-block -mt-0.5" />,
                      }}
                    />
                  </p>
                )}

                {senderError && <p className="text-xs text-red-400">{senderError}</p>}

                <div className="flex flex-wrap gap-2.5">
                  <Button onClick={saveSender} disabled={senderSaving || !senderDraft.fromName.trim() || !senderDraft.fromEmail.trim() || !senderDraft.smtpHost.trim() || !senderDraft.smtpPassword}>
                    <Save className="h-4 w-4" />
                    {senderSaving ? t("newsletter.saving") : t("newsletter.saveSender")}
                  </Button>
                  {sender && (
                    <>
                      <Button variant="secondary" onClick={verifySenderDomain} disabled={verifying || !!sender.verifiedAt || senderWhitelisted}>
                        <ShieldCheck className="h-4 w-4" />
                        {verifying ? t("newsletter.verifying") : t("newsletter.verifyDomain")}
                      </Button>
                      <Button variant="secondary" onClick={testSenderSmtp} disabled={testing || !sender.hasPassword}>
                        <MailCheck className="h-4 w-4" />
                        {testing ? t("newsletter.sendingTest") : t("newsletter.sendTestEmail")}
                      </Button>
                      <Button variant="secondary" onClick={removeSender}>
                        <Trash2 className="h-4 w-4" />
                        {t("newsletter.remove")}
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={<Users className="h-4 w-4" />}
        title={t("newsletter.subsTitle")}
        desc={t("newsletter.subsDesc", {
          active: subscriberCount.active,
          unsubscribed: subscriberCount.unsubscribed,
          total: subscriberCount.total,
        })}
      >
        {subscribersLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : subscribers.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">{t("newsletter.noSubscribers")}</p>
        ) : (
          <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
            {subscribers.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{sub.email}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {t("newsletter.subscribedLine", {
                      date: formatDate(sub.agreedAt),
                      tos: sub.tosVersion,
                      privacy: sub.privacyVersion,
                    })}
                    {sub.unsubscribedAt ? t("newsletter.unsubscribedSuffix", { date: formatDate(sub.unsubscribedAt) }) : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeSubscriber(sub.id)}
                  className="flex-shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title={t("newsletter.eraseTitle")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={<Megaphone className="h-4 w-4" />}
        title={t("newsletter.sendTitle")}
        desc={t("newsletter.sendDesc", {
          tier: tierLabel,
          deliverer: senderReady
            ? t("newsletter.delivererOwn")
            : hasPlatformSender
              ? t("newsletter.delivererAdmin")
              : userPlatformSend
                ? t("newsletter.delivererApproved")
                : "",
        })}
      >
        <div className="space-y-3">
          {!senderReady && !userPlatformSend && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {tier === "FREE" && !senderWhitelisted
                ? t("newsletter.warnNotReadyTier")
                : t("newsletter.warnFinishSetup")}
            </div>
          )}
          {!senderReady && userPlatformSend && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {hasPlatformSender
                ? t("newsletter.infoPlatformSender")
                : t("newsletter.infoPlatformSenderApproved")}
            </div>
          )}
          {sender === null && !userPlatformSend && (
            !canSendNow ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {t("newsletter.warnConfigureSmtp")}
              </div>
            ) : null
          )}
          {!enabled && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {t("newsletter.warnPaused")}
            </div>
          )}
          <input
            value={subject}
            maxLength={120}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("newsletter.subjectPlaceholder")}
            className={inputClass}
          />
          <textarea
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("newsletter.bodyPlaceholder")}
            rows={5}
            className={`${inputClass} resize-y`}
          />
          {sendResult && (
            <p className={sendResult.ok ? "flex items-center gap-2 text-sm text-emerald-400" : "flex items-center gap-2 text-sm text-red-400"}>
              {sendResult.ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
              {sendResult.message}
            </p>
          )}
          <div className="flex gap-2.5">
            <Button onClick={sendNewsletter} disabled={sending || !enabled || !subject.trim() || !body.trim() || !canSendNow}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? t("newsletter.sending") : t("newsletter.sendNewsletter")}
            </Button>
            <Button variant="secondary" onClick={() => void loadSends()}>
              <History className="h-4 w-4" />
              {t("newsletter.refreshHistory")}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Rocket className="h-4 w-4" />}
        title={t("newsletter.historyTitle")}
        desc={t("newsletter.historyDesc")}
      >
        {sendHistoryLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : sends.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">{t("newsletter.noSends")}</p>
        ) : (
          <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
            {sends.map((send) => (
              <li key={send.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{send.subject}</p>
                  <p className="text-xs text-zinc-500">{formatDateTime(send.sentAt)}</p>
                </div>
                <span className="text-xs text-zinc-400 flex-shrink-0">
                  {t("newsletter.delivered", { delivered: send.successCount, total: send.recipientCount })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}