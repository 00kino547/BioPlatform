import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { api, type DiscordStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PresenceWidget } from "@/components/discord/PresenceWidget";
import {
  Link2,
  Link2Off,
  Send,
  Save,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Users,
  Bot,
} from "lucide-react";

const POLL_MS = 30_000;
const ACTIVE_POLL_MS = 15_000;
const ACTIVITY_END_BUFFER_MS = 2_000;

export function DiscordTab({ profileId }: { profileId?: string }) {
  // All user-facing strings come from the `dashboard` namespace (discord.* keys).
  const { t } = useTranslation("dashboard");
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await api.getDiscordStatus(profileId);
    if (res.success && res.data) {
      setStatus(res.data);
      setLastRefreshedAt(Date.now());
    } else {
      setError(res.error ?? t("discord.toasts.loadFailed"));
    }
    setLoading(false);
  }, [profileId, t]);

  useEffect(() => {
    load();
    const poll = window.setInterval(() => load(true), POLL_MS);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const primary = status?.presence?.activities?.find((a) => a.type !== 4);
    const endTime = primary?.timestamps?.end;
    const playing = typeof endTime === "number" && endTime - Date.now() > 0;
    if (!playing) return;
    const poll = window.setInterval(() => load(true), ACTIVE_POLL_MS);
    const endDelay = Math.max(endTime - Date.now(), 0) + ACTIVITY_END_BUFFER_MS;
    const endTimer = window.setTimeout(() => load(true), endDelay);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(endTimer);
    };
  }, [status?.presence?.activities, load]);

  const secsAgo = lastRefreshedAt != null
    ? Math.floor((Date.now() - lastRefreshedAt) / 1000)
    : null;
  const activePrimary = status?.presence?.activities?.find((a) => a.type !== 4);
  const isPlaying = typeof activePrimary?.timestamps?.end === "number" && (activePrimary!.timestamps!.end! - Date.now()) > 0;
  void tick;
  void isPlaying;

  useEffect(() => {
    const result = searchParams.get("discord");
    if (result === "connected") {
      setSuccess(t("discord.toasts.connected"));
      const next = new URLSearchParams(searchParams);
      next.delete("discord");
      next.delete("tab");
      setSearchParams(next, { replace: true });
      load(true);
    } else if (result === "error") {
      setError(t("discord.toasts.connectFailed"));
      const next = new URLSearchParams(searchParams);
      next.delete("discord");
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, load, t]);

  const handleConnect = async () => {
    setError("");
    setSuccess("");
    const res = await api.getDiscordConnectUrl();
    if (res.success && res.data?.url) {
      window.location.href = res.data.url;
    } else {
      setError(res.error ?? t("discord.toasts.connectStartFailed"));
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t("discord.disconnectConfirm"))) return;
    setError("");
    const res = await api.disconnectDiscord(profileId);
    if (res.success) {
      setSuccess(t("discord.toasts.disconnected"));
      await load(true);
    } else {
      setError(res.error ?? t("discord.toasts.disconnectFailed"));
    }
  };

  const togglePresence = async (value: boolean) => {
    setError("");
    setSuccess("");
    const res = await api.updateDiscordSettings({ showDiscordPresence: value }, profileId);
    if (res.success) {
      setStatus((prev) => (prev ? { ...prev, settings: { ...prev.settings, showDiscordPresence: value } } : prev));
      await load(true);
    } else {
      setError(res.error ?? t("discord.toasts.presenceUpdateFailed"));
    }
  };

  const toggleActivity = async (value: boolean) => {
    setError("");
    setSuccess("");
    const res = await api.updateDiscordSettings({ showDiscordActivity: value }, profileId);
    if (res.success) {
      setStatus((prev) => (prev ? { ...prev, settings: { ...prev.settings, showDiscordActivity: value } } : prev));
      await load(true);
    } else {
      setError(res.error ?? t("discord.toasts.activityUpdateFailed"));
    }
  };

  const saveWebhook = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    const res = await api.updateDiscordSettings({ webhookUrl: webhookUrl.trim() }, profileId);
    setSaving(false);
    if (res.success) {
      setSuccess(webhookUrl.trim() ? t("discord.toasts.webhookSaved") : t("discord.toasts.webhookRemoved"));
      await load(true);
    } else {
      setError(res.error ?? t("discord.toasts.webhookSaveFailed"));
    }
  };

  const handlePost = async () => {
    setError("");
    setSuccess("");
    setPosting(true);
    const res = await api.postToDiscord(webhookUrl.trim() || undefined, profileId);
    setPosting(false);
    if (res.success) {
      setSuccess(
        res.data?.mode === "updated"
          ? t("discord.toasts.updated")
          : t("discord.toasts.posted")
      );
    } else {
      setError(res.error ?? t("discord.toasts.postFailed"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  if (!status) {
    return <p className="text-sm text-zinc-500 text-center py-12">{t("discord.loadFailed")}</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle className="h-4 w-4" /> {success}
        </div>
      )}

      {!status.configured ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-5 text-center opacity-60 pointer-events-none select-none">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <AlertTriangle className="h-6 w-6 text-zinc-500" />
          </div>
          <h4 className="text-sm font-medium text-white">{t("discord.unavailableTitle")}</h4>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-md mx-auto">
            <Trans
              ns="dashboard"
              i18nKey="discord.unavailableBody"
              components={{
                0: <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400" />,
                1: <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400" />,
                2: <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400" />,
              }}
            />
          </p>
        </div>
      ) : !status.connected ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-5 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#5865F2]/15">
            <Link2 className="h-6 w-6 text-[#7289da]" />
          </div>
          <h4 className="text-sm font-medium text-white">{t("discord.connectTitle")}</h4>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-md mx-auto">
            {t("discord.connectBody")}
          </p>
          <Button onClick={handleConnect} className="mt-5">
            <Link2 className="h-4 w-4" /> {t("discord.connect")}
          </Button>
          {status.botInviteUrl && (
            <a
              href={status.botInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-700 cursor-pointer"
            >
              <Bot className="h-4 w-4" /> {t("discord.inviteBot")}
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">
                      {t("discord.connectedAs")} {status.discord?.globalName ?? status.discord?.username}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        status.sessionActive ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      <Activity className="h-3 w-3" />
                      {status.sessionActive ? t("discord.presenceLive") : status.botConfigured ? t("discord.presenceConnecting") : t("discord.presenceOff")}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">@{status.discord?.username}</p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={handleDisconnect}>
                <Link2Off className="h-3.5 w-3.5" /> {t("discord.disconnect")}
              </Button>
            </div>

            {!status.botConfigured && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-400 leading-relaxed">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <Trans
                    ns="dashboard"
                    i18nKey="discord.botNotConfigured"
                    components={{
                      0: <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300" />,
                    }}
                  />
                </span>
              </div>
            )}

            <div className="mt-5">
              <PresenceWidget
                account={status.discord ?? { username: "", globalName: null, avatar: null }}
                presence={status.presence}
              />
              <p className="text-xs text-zinc-600 mt-2">
                {status.settings.showDiscordPresence
                  ? secsAgo != null
                    ? t("discord.presenceUpdated", {
                        seconds: secsAgo,
                        interval: isPlaying ? Math.round(ACTIVE_POLL_MS / 1000) : Math.round(POLL_MS / 1000),
                      })
                    : status.botConfigured
                      ? t("discord.presenceWaiting")
                      : t("discord.presenceRequiresBot")
                  : t("discord.presenceHidden")}
              </p>
              {status.presenceHubInvite && (
                <a
                  href={status.presenceHubInvite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:bg-violet-700 cursor-pointer"
                >
                  <Users className="h-4 w-4" /> {t("discord.joinPresenceHub")}
                </a>
              )}
              {status.botInviteUrl && (
                <a
                  href={status.botInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-all duration-200 hover:bg-zinc-700 cursor-pointer"
                >
                  <Bot className="h-4 w-4" /> {t("discord.inviteBot")}
                </a>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white">{t("discord.privacyTitle")}</h3>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium text-white">{t("discord.showPresence")}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t("discord.showPresenceHint")}
                </p>
              </div>
              <button
                onClick={() => togglePresence(!status.settings.showDiscordPresence)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  status.settings.showDiscordPresence ? "bg-violet-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    status.settings.showDiscordPresence ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-medium text-white">{t("discord.showActivity")}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t("discord.showActivityHint")}
                </p>
              </div>
              <button
                onClick={() => toggleActivity(!status.settings.showDiscordActivity)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  status.settings.showDiscordActivity ? "bg-violet-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    status.settings.showDiscordActivity ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5 space-y-4">
            <h3 className="text-sm font-medium text-white">{t("discord.postTitle")}</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {t("discord.postBody")}
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder={t("discord.webhookPlaceholder")}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              />
              <Button variant="secondary" onClick={saveWebhook} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? t("discord.saving") : t("discord.save")}
              </Button>
            </div>
            <Button onClick={handlePost} disabled={posting}>
              <Send className="h-4 w-4" />
              {posting ? t("discord.posting") : t("discord.post")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
