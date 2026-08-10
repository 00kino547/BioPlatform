import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
} from "lucide-react";

const POLL_MS = 30_000;

export function DiscordTab({ profileId }: { profileId?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await api.getDiscordStatus(profileId);
    if (res.success && res.data) {
      setStatus(res.data);
    } else {
      setError(res.error ?? "Could not load Discord status");
    }
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      load(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const result = searchParams.get("discord");
    if (result === "connected") {
      setSuccess("Discord connected.");
      const next = new URLSearchParams(searchParams);
      next.delete("discord");
      next.delete("tab");
      setSearchParams(next, { replace: true });
      load(true);
    } else if (result === "error") {
      setError("Discord connection failed. Try again.");
      const next = new URLSearchParams(searchParams);
      next.delete("discord");
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, load]);

  const handleConnect = async () => {
    setError("");
    setSuccess("");
    const res = await api.getDiscordConnectUrl();
    if (res.success && res.data?.url) {
      window.location.href = res.data.url;
    } else {
      setError(res.error ?? "Could not start Discord connection");
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect your Discord account? Your presence widget and Discord connection will be removed.")) return;
    setError("");
    const res = await api.disconnectDiscord(profileId);
    if (res.success) {
      setSuccess("Discord disconnected.");
      await load(true);
    } else {
      setError(res.error ?? "Could not disconnect Discord");
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
      setError(res.error ?? "Could not update presence setting");
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
      setError(res.error ?? "Could not update activity setting");
    }
  };

  const saveWebhook = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    const res = await api.updateDiscordSettings({ webhookUrl: webhookUrl.trim() }, profileId);
    setSaving(false);
    if (res.success) {
      setSuccess(webhookUrl.trim() ? "Webhook URL saved." : "Webhook URL removed.");
      await load(true);
    } else {
      setError(res.error ?? "Could not save webhook URL");
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
          ? "Updated your Discord embed. It will stay in sync as your profile changes."
          : "Posted to Discord. Posting again (or changing your profile) updates the same embed automatically."
      );
    } else {
      setError(res.error ?? "Could not post to Discord");
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
    return <p className="text-sm text-zinc-500 text-center py-12">Could not load Discord settings.</p>;
  }

  return (
    <div className="space-y-6">
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
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center opacity-60 pointer-events-none select-none">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <AlertTriangle className="h-6 w-6 text-zinc-500" />
          </div>
          <h4 className="text-sm font-medium text-white">Discord integration unavailable</h4>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-md mx-auto">
            This instance has not configured a Discord Developer application. Ask the server administrator to
            set <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">DISCORD_CLIENT_ID</code>,{" "}
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">DISCORD_CLIENT_SECRET</code>, and{" "}
            <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">DISCORD_REDIRECT_URI</code> to enable it.
          </p>
        </div>
      ) : !status.connected ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#5865F2]/15">
            <Link2 className="h-6 w-6 text-[#7289da]" />
          </div>
          <h4 className="text-sm font-medium text-white">Connect your Discord account</h4>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed max-w-md mx-auto">
            Connect with Discord to show your presence (online status, current activity, and what you&apos;re listening to)
            on your public profile and in shared link previews. Your connection uses the official Discord API and is
            opt-in — you control what is shown. Presence is tracked by an instance bot, so you must also be in a server
            that shares the bot.
          </p>
          <Button onClick={handleConnect} className="mt-5">
            <Link2 className="h-4 w-4" /> Connect Discord
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">
                      Connected as {status.discord?.globalName ?? status.discord?.username}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        status.sessionActive ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      <Activity className="h-3 w-3" />
                      {status.sessionActive ? "Live" : status.botConfigured ? "Connecting…" : "Presence off"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">@{status.discord?.username}</p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={handleDisconnect}>
                <Link2Off className="h-3.5 w-3.5" /> Disconnect
              </Button>
            </div>

            {!status.botConfigured && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-400 leading-relaxed">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Your account is linked, but this instance has not configured <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300">DISCORD_BOT_TOKEN</code>,
                  so presence stays off. Ask the server administrator to set up the bot (enable the Presence intent) and invite you to a shared server.
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
                  ? status.presence?.updatedAt
                    ? `Last updated ${new Date(status.presence.updatedAt).toLocaleTimeString()}`
                    : status.botConfigured
                      ? "Waiting for presence data from Discord… make sure you are in a server with the instance bot."
                      : "Presence requires the instance bot (DISCORD_BOT_TOKEN)."
                  : "Presence is currently hidden on your profile."}
              </p>
              {status.presenceHubInvite && (
                <a
                  href={status.presenceHubInvite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all duration-200 hover:bg-violet-700 cursor-pointer"
                >
                  <Users className="h-4 w-4" /> Join presence hub
                </a>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white">Privacy</h3>
            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">Show Discord presence on my profile</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Display your status and activity in a widget on your public page.
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

            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">Show activity details</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Include the game, song, or app you&apos;re using. Off keeps just your online status.
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

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
            <h3 className="text-sm font-medium text-white">Post to Discord</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Set a Discord webhook URL to add a &quot;Post to Discord&quot; action. Posting sends your profile card image
              (banner, avatar, name, bio, badges) with a short title to your channel. The embed is kept in sync: posting
              again — or editing your profile — updates the same message instead of spamming your channel, and switching
              webhooks removes the old message. Webhooks are stored encrypted. Live presence is not baked into the card
              (Discord caches images), so your current song/status never looks stale.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/<id>/<token>"
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
              />
              <Button variant="secondary" onClick={saveWebhook} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
            <Button onClick={handlePost} disabled={posting}>
              <Send className="h-4 w-4" />
              {posting ? "Posting..." : "Post to Discord"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
