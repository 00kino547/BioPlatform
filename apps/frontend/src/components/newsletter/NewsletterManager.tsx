import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Globe, History, Loader2, Mail, MailCheck, Megaphone, Rocket, Save, Send, Server, ShieldCheck, Trash2, Users } from "lucide-react";
import { api, type NewsletterSendRecord, type NewsletterSenderPayload, type NewsletterSenderSettings, type NewsletterSubscriber, type Profile } from "@/lib/api";
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
      setSettingsError(res.error ?? "Could not save newsletter settings.");
    }
    setSettingsSaving(false);
  };

  const removeSubscriber = async (id: string) => {
    if (!profileId) return;
    const res = await api.deleteNewsletterSubscriber(id, profileId);
    if (res.success) {
      void loadSubscribers();
    } else {
      setSettingsError(res.error ?? "Could not remove subscriber.");
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
      setSenderError(res.error ?? "Could not save your SMTP sender.");
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
          ? `Domain not verified yet. Add the TXT record ${rec} with the value ${tok} on your DNS, then verify again.`
          : (res.error ?? "Domain verification failed.")
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
      setSenderError(res.error ?? "Test email failed.");
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
      setSenderError(res.error ?? "Could not remove the sender.");
    }
  };

  const sendNewsletter = async () => {
    if (!profileId) return;
    setSending(true);
    setSendResult(null);
    const res = await api.sendNewsletter({ subject, body }, profileId);
    if (res.success && res.data) {
      setSendResult({ ok: true, message: `Sent to ${res.data.recipientCount} recipient(s) — ${res.data.successCount} delivered, ${res.data.failedCount} failed.` });
      setSubject("");
      setBody("");
      void loadSends();
    } else {
      setSendResult({ ok: false, message: res.error ?? "Could not send the newsletter." });
    }
    setSending(false);
  };

  if (!profileId) {
    return <p className="text-sm text-zinc-500 text-center py-12">Select a profile to manage its newsletter.</p>;
  }

  const tierLabel = tier === "FREE" ? "Free" : tier === "PRO" ? "Pro" : "Enterprise";
  const senderUnlocked = tier !== "FREE" || senderWhitelisted;
  const domainOk = !!sender?.verifiedAt || senderWhitelisted;
  const senderReady = !!sender && !!sender.hasPassword && domainOk && !!sender.testedAt;
  const userPlatformSend = hasPlatformSender || (platformEnabled && senderWhitelisted && tier !== "FREE");
  const canSendNow = (senderReady || userPlatformSend) && enabled;

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<Mail className="h-4 w-4" />}
        title="Newsletter"
        desc="Collect subscribers with a single opt-in form and send them updates. Toggling the newsletter off only pauses sending — the public form stays visible and keeps collecting signups."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Newsletter enabled (sending)</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {enabled ? "Sending is allowed." : "Paused — signups are still collected, but nothing can be sent."}
              </p>
            </div>
            <Toggle on={enabled} onChange={() => setEnabled(!enabled)} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Show the subscribe form on your public profile</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                New profiles start with this off (and with the master switch off), so nothing appears until you opt in.
              </p>
            </div>
            <Toggle on={visible} onChange={() => setVisible(!visible)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Form heading</label>
            <input
              value={heading}
              maxLength={60}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="Join the newsletter"
              className={inputClass}
            />
            <p className="text-xs text-zinc-500 mt-1">Shown above the subscribe form. Leave empty for the default heading.</p>
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
        icon={<Server className="h-4 w-4" />}
        title="Send with your own SMTP"
        desc={
          senderUnlocked
            ? "Send newsletters from your own domain using your own SMTP relay. You must prove you own the from-domain (DNS TXT record) and confirm deliverability with a test email before sending."
            : "On the Free tier only admins can send. Upgrade to Pro or Enterprise to send from your own domain and SMTP — or ask the instance operator to allowlist your account."
        }
      >
        {!senderUnlocked && !sender ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Your current tier doesn&apos;t allow sending newsletters from your own SMTP. Upgrade to Pro or Enterprise.
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
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">From name</label>
                    <input value={senderDraft.fromName} maxLength={60} onChange={(e) => setSenderDraft((d) => ({ ...d, fromName: e.target.value }))} placeholder="ACME Corp" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">From email (your domain)</label>
                    <input type="email" value={senderDraft.fromEmail} onChange={(e) => setSenderDraft((d) => ({ ...d, fromEmail: e.target.value }))} placeholder="noreply@acme.com" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">SMTP host</label>
                    <input value={senderDraft.smtpHost} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpHost: e.target.value }))} placeholder="smtp.yourdomain.com" className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">Port</label>
                      <input type="number" value={senderDraft.smtpPort} min={1} max={65535} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpPort: Number(e.target.value) || 587 }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">Username</label>
                      <input value={senderDraft.smtpUser ?? ""} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpUser: e.target.value }))} placeholder="(optional)" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      SMTP password {sender?.hasPassword ? "(leave empty to keep the stored one)" : ""}
                    </label>
                    <input type="password" value={senderDraft.smtpPassword} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpPassword: e.target.value }))} placeholder="••••••••" className={inputClass} />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
                      <input type="checkbox" checked={senderDraft.smtpSecure} onChange={(e) => setSenderDraft((d) => ({ ...d, smtpSecure: e.target.checked }))} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-violet-500" />
                      Use implicit TLS (port 465)
                    </label>
                  </div>
                </div>

                {sender && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${domainOk ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {sender.verifiedAt ? "Domain verified" : senderWhitelisted ? "Domain check exempted (admin allowlist)" : "Domain not verified"}
                    </span>
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${sender.testedAt ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                      <MailCheck className="h-3.5 w-3.5" />
                      {sender.testedAt ? "Test email sent" : "Test email not sent"}
                    </span>
                  </div>
                )}

                {!domainOk && sender && (
                  <p className="text-xs text-zinc-500">
                    Add the TXT record <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-violet-300">{sender.verificationRecord}</code> with the value{" "}
                    <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-violet-300">{sender.verificationToken}</code> on your DNS{" "}
                    <Globe className="h-3.5 w-3.5 inline-block -mt-0.5" />, then click Verify.
                  </p>
                )}

                {senderError && <p className="text-xs text-red-400">{senderError}</p>}

                <div className="flex flex-wrap gap-2.5">
                  <Button onClick={saveSender} disabled={senderSaving || !senderDraft.fromName.trim() || !senderDraft.fromEmail.trim() || !senderDraft.smtpHost.trim() || !senderDraft.smtpPassword}>
                    <Save className="h-4 w-4" />
                    {senderSaving ? "Saving..." : "Save Sender"}
                  </Button>
                  {sender && (
                    <>
                      <Button variant="secondary" onClick={verifySenderDomain} disabled={verifying || !!sender.verifiedAt || senderWhitelisted}>
                        <ShieldCheck className="h-4 w-4" />
                        {verifying ? "Verifying..." : "Verify Domain"}
                      </Button>
                      <Button variant="secondary" onClick={testSenderSmtp} disabled={testing || !sender.hasPassword}>
                        <MailCheck className="h-4 w-4" />
                        {testing ? "Sending..." : "Send Test Email"}
                      </Button>
                      <Button variant="secondary" onClick={removeSender}>
                        <Trash2 className="h-4 w-4" />
                        Remove
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
        title="Subscribers"
        desc={`${subscriberCount.active} active, ${subscriberCount.unsubscribed} unsubscribed, ${subscriberCount.total} total. Only the email address is stored — no IP or device data leaves your public page (consent evidence stays transient and expires).`}
      >
        {subscribersLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : subscribers.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">No subscribers yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
            {subscribers.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{sub.email}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    Subscribed {new Date(sub.agreedAt).toLocaleDateString()} · agreed to TOS v{sub.tosVersion} + Privacy v{sub.privacyVersion}
                    {sub.unsubscribedAt ? ` · unsubscribed ${new Date(sub.unsubscribedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeSubscriber(sub.id)}
                  className="flex-shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Erase subscriber (right to erasure)"
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
        title="Send an update"
        desc={`${tierLabel} tier${senderReady ? " · own SMTP deliverer" : hasPlatformSender ? " · platform sender (admin)" : userPlatformSend ? " · platform sender (approved)" : ""} · sends to your active subscribers, each with a one-click unsubscribe link and the sender's identity, per EU GDPR, US CAN-SPAM and Canadian Anti-Spam Law.`}
      >
        <div className="space-y-3">
          {!senderReady && !userPlatformSend && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {tier === "FREE" && !senderWhitelisted
                ? "Your current tier doesn't allow sending newsletters from your own SMTP. Upgrade to Pro or Enterprise, or configure your sender above."
                : "Finish setting up your own SMTP sender above (domain verified + test email) to start sending."}
            </div>
          )}
          {!senderReady && userPlatformSend && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {hasPlatformSender
                ? "Sending uses the platform sender (instance SMTP)."
                : "Sending uses the platform sender (instance SMTP) — your account is approved and a reduced recipient limit applies."}
            </div>
          )}
          {sender === null && !userPlatformSend && (
            !canSendNow ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Configure your own SMTP sender above to start sending newsletters from your domain.
              </div>
            ) : null
          )}
          {!enabled && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              The newsletter is paused — enable it above before sending.
            </div>
          )}
          <input
            value={subject}
            maxLength={120}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={inputClass}
          />
          <textarea
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your update…"
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
              {sending ? "Sending…" : "Send Newsletter"}
            </Button>
            <Button variant="secondary" onClick={() => void loadSends()}>
              <History className="h-4 w-4" />
              Refresh history
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Rocket className="h-4 w-4" />}
        title="Send history"
        desc="Recent newsletter sends (used to enforce the per-tier sending window)."
      >
        {sendHistoryLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : sends.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">No sends yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 border-t border-zinc-800">
            {sends.map((send) => (
              <li key={send.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{send.subject}</p>
                  <p className="text-xs text-zinc-500">{new Date(send.sentAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-zinc-400 flex-shrink-0">
                  {send.successCount}/{send.recipientCount} delivered
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}