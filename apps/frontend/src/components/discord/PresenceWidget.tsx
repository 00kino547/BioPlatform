import type { DiscordAccount, DiscordActivity, DiscordPresence } from "@/lib/api";
import { Gamepad2, Radio, ListMusic, Tv, Trophy, MessageCircle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  online: "#3ba55d",
  idle: "#faa61a",
  dnd: "#ed4245",
  offline: "#747f8d",
};

function activityImage(activity: DiscordActivity): string | null {
  const img = activity.largeImage;
  if (!img) return null;
  if (img.startsWith("spotify:")) {
    const id = img.slice("spotify:".length).split(":")[0];
    return id ? `https://i.scdn.co/image/${id}` : null;
  }
  if (img.startsWith("app_icons/") && activity.applicationId) {
    const hash = img.slice("app_icons/".length).split("/")[0];
    return hash ? `https://cdn.discordapp.com/app-assets/${activity.applicationId}/${hash}.png` : null;
  }
  if (img.startsWith("mp:external/")) {
    const candidate = img.slice("mp:external/".length).split("/").find((part) => part.startsWith("http"));
    if (candidate) {
      try {
        const decoded = decodeURIComponent(candidate);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function activityIcon(activities: DiscordActivity[]) {
  const primary = activities.find((a) => a.type !== 4);
  if (!primary) return null;
  switch (primary.type) {
    case 1:
      return Radio;
    case 2:
      return ListMusic;
    case 3:
      return Tv;
    case 5:
      return Trophy;
    default:
      return Gamepad2;
  }
}

interface PresenceWidgetProps {
  account: DiscordAccount;
  presence: DiscordPresence | null;
  accent?: string;
  textColor?: string;
}

export function PresenceWidget({ account, presence, accent, textColor }: PresenceWidgetProps) {
  const statusColor = presence ? STATUS_COLORS[presence.status] ?? "#747f8d" : "#747f8d";
  const AccentIcon = presence ? activityIcon(presence.activities) : null;
  const image = presence?.activities.length
    ? activityImage(presence.activities.find((a) => a.type !== 4) ?? presence.activities[0])
    : null;

  return (
    <div
      className="rounded-2xl px-5 py-4 text-left w-full max-w-sm"
      style={{
        backgroundColor: accent ? `${accent}0d` : "rgba(124,58,237,0.05)",
        border: `1px solid ${accent ? `${accent}22` : "rgba(124,58,237,0.12)"}`,
      }}
    >
      <div className="flex items-center gap-3">
        {account.avatar ? (
          <img
            src={account.avatar}
            alt={account.username}
            className="h-10 w-10 rounded-full object-cover ring-2"
            style={{ boxShadow: `0 0 0 2px ${statusColor}` }}
          />
        ) : (
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ backgroundColor: statusColor }}
          >
            {(account.globalName ?? account.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: textColor }}>
            {account.globalName ?? account.username}
          </p>
          <p className="text-xs truncate" style={{ color: `${textColor ?? "#ffffff"}88` }}>
            @{account.username}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
          style={{ backgroundColor: `${statusColor}1a`, color: statusColor }}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
          {presence?.statusLabel ?? "Offline"}
        </span>
      </div>

      {(presence?.customStatus || presence?.line) && (
        <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: `${textColor ?? "#ffffff"}1a` }}>
          {presence.customStatus && (
            <p className="flex items-center gap-2 text-xs" style={{ color: `${textColor ?? "#ffffff"}b3` }}>
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{presence.customStatus}</span>
            </p>
          )}
          {presence.line && (
            <p className="flex items-center gap-2 text-xs" style={{ color: accent ?? "#a78bfa" }}>
              {image ? (
                <img src={image} alt="" className="h-4 w-4 rounded-[4px] object-cover shrink-0" />
              ) : AccentIcon ? (
                <AccentIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Gamepad2 className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{presence.line}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
