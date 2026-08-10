import { useEffect, useState } from "react";
import type { DiscordAccount, DiscordActivity, DiscordPresence } from "@/lib/api";
import { Gamepad2, Radio, ListMusic, Tv, Trophy, MessageCircle, ExternalLink, Music2, PlayCircle } from "lucide-react";

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

function activityLabel(activity: DiscordActivity): string {
  switch (activity.type) {
    case 1:
      return "Streaming";
    case 2:
      return "Listening to";
    case 3:
      return "Watching";
    case 5:
      return "Competing in";
    case 6:
      return "Hanging out";
    default:
      return "Playing";
  }
}

function resolveButtonUrl(activity: DiscordActivity, label: string): string {
  const query = [activity.name, activity.details, activity.state].filter(Boolean).join(" ");
  const lower = label.toLowerCase();

  if (activity.type === 2) {
    const track = [activity.details, activity.state].filter(Boolean).join(" ");
    return `https://open.spotify.com/search/${encodeURIComponent(track || query)}`;
  }

  if (lower.includes("watch") || lower.includes("view") || activity.type === 3) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function ProgressTimebar({ activity, accent, textColor }: { activity: DiscordActivity; accent?: string; textColor?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const start = activity.timestamps?.start;
  const end = activity.timestamps?.end;
  if (typeof start !== "number" || typeof end !== "number" || end <= start) return null;

  const elapsed = now - start;
  const total = end - start;
  const pct = Math.min(1, Math.max(0, elapsed / total));

  return (
    <div className="mt-3">
      <div className="h-1 w-full rounded-full" style={{ backgroundColor: `${accent ?? "#a78bfa"}26` }}>
        <div
          className="h-1 rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct * 100}%`, backgroundColor: accent ?? "#a78bfa" }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums" style={{ color: `${textColor ?? "#ffffff"}88` }}>
        <span>{formatMs(elapsed)}</span>
        <span>{formatMs(total)}</span>
      </div>
    </div>
  );
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
  const primary = presence?.activities.find((a) => a.type !== 4) ?? null;
  const image = primary ? activityImage(primary) : null;
  const isMusic = primary?.type === 2;
  const activityTitle = isMusic ? (primary?.details ?? primary?.name ?? "") : (primary?.name ?? "");
  const activitySubtitle = isMusic
    ? primary?.state
    : primary?.details ?? primary?.state ?? null;

  return (
    <div
      className="rounded-2xl px-5 py-4 text-left w-full"
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

      {(presence?.customStatus || primary) && (
        <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: `${textColor ?? "#ffffff"}1a` }}>
          {presence?.customStatus && (
            <p className="flex items-center gap-2 text-xs" style={{ color: `${textColor ?? "#ffffff"}b3` }}>
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{presence.customStatus}</span>
            </p>
          )}

          {primary && (
            <div className="rounded-xl border p-3" style={{ borderColor: `${accent ?? "#a78bfa"}1f`, backgroundColor: `${accent ?? "#a78bfa"}08` }}>
              <div className="flex items-center gap-3 sm:gap-4">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className={isMusic ? "h-24 w-24 sm:h-32 sm:w-32 shrink-0 rounded-2xl object-cover shadow-lg" : "h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-xl object-cover"}
                    style={{ boxShadow: accent ? `0 8px 24px -8px ${accent}55` : undefined }}
                  />
                ) : AccentIcon ? (
                  <div
                    className={isMusic ? "h-24 w-24 sm:h-32 sm:w-32 shrink-0 rounded-2xl flex items-center justify-center" : "h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-xl flex items-center justify-center"}
                    style={{ backgroundColor: `${accent ?? "#a78bfa"}1a` }}
                  >
                    {isMusic ? (
                      <Music2 className="h-10 w-10 sm:h-12 sm:w-12" style={{ color: accent ?? "#a78bfa" }} />
                    ) : (
                      <AccentIcon className="h-7 w-7" style={{ color: accent ?? "#a78bfa" }} />
                    )}
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <p
                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: accent ?? "#a78bfa" }}
                  >
                    {isMusic ? (
                      <Music2 className="h-3.5 w-3.5 shrink-0" />
                    ) : primary.type === 3 ? (
                      <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                    ) : AccentIcon ? (
                      <AccentIcon className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Gamepad2 className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {activityLabel(primary)} {primary.name}
                  </p>
                  <p className={isMusic ? "mt-1 text-sm sm:text-base font-semibold truncate" : "mt-0.5 text-sm font-semibold truncate"} style={{ color: textColor }}>
                    {activityTitle}
                  </p>
                  {activitySubtitle && (
                    <p className="mt-0.5 text-xs sm:text-sm truncate" style={{ color: `${textColor ?? "#ffffff"}99` }}>
                      {activitySubtitle}
                    </p>
                  )}
                </div>
              </div>

              {primary.timestamps && <ProgressTimebar activity={primary} accent={accent} textColor={textColor} />}

              {primary.buttons?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {primary.buttons.map((label, i) => (
                    <a
                      key={i}
                      href={resolveButtonUrl(primary, label)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium select-none transition-all hover:brightness-125"
                      style={{ borderColor: `${accent ?? "#a78bfa"}40`, backgroundColor: `${accent ?? "#a78bfa"}14`, color: accent ?? "#a78bfa" }}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
