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

function activityPlatform(activity: DiscordActivity): string {
  const name = activity.name?.toLowerCase() ?? "";
  if (name.includes("spotify")) return "spotify";
  if (name.includes("youtube")) return "youtube";
  if (name.includes("twitch")) return "twitch";
  if (name.includes("soundcloud")) return "soundcloud";
  if (name.includes("apple music")) return "applemusic";
  if (name.includes("roblox")) return "roblox";
  if (name.includes("steam")) return "steam";
  if (name.includes("netflix")) return "netflix";
  if (name.includes("crunchyroll")) return "crunchyroll";
  if (name.includes("discord")) return "discord";
  return "generic";
}

const PLATFORM_LABEL: Record<string, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  twitch: "Twitch",
  soundcloud: "SoundCloud",
  applemusic: "Apple Music",
  roblox: "Roblox",
  steam: "Steam",
  netflix: "Netflix",
  crunchyroll: "Crunchyroll",
  discord: "Discord",
  generic: "",
};

function PlatformMark({ platform }: { platform: string }) {
  if (platform === "spotify") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#1DB954]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#1DB954]">
        <SpotifyMark /> Spotify
      </span>
    );
  }
  if (platform === "youtube") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0000]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#FF0000]">
        <PlayCircle className="h-3 w-3" /> YouTube
      </span>
    );
  }
  if (platform === "twitch") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#9146FF]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#a970ff]">
        <Tv className="h-3 w-3" /> Twitch
      </span>
    );
  }
  const label = PLATFORM_LABEL[platform];
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
      {label}
    </span>
  );
}

function SpotifyMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.26-1.32 9.66-.66 13.32 1.62.42.3.541.96.24 1.26v.18zm.12-3.36C15.24 8.4 8.099 8.16 4.44 9.42c-.54.18-1.14-.12-1.32-.66-.18-.54.12-1.14.66-1.32 4.14-1.44 11.821-1.14 15.9 1.68.479.358.6 1.08.24 1.561-.359.42-1.08.54-1.561.18z"/>
    </svg>
  );
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

function activityUrl(activity: DiscordActivity): string | null {
  const linked = [activity.detailsUrl, activity.stateUrl, activity.largeUrl, activity.smallUrl].find(
    (u) => typeof u === "string" && u.length > 0 && /^https?:\/\//i.test(u)
  );
  return linked ?? null;
}

function resolveButtonUrl(activity: DiscordActivity, label: string): string {
  const direct = activityUrl(activity);
  if (direct) return direct;

  const query = [activity.details, activity.state, activity.name].filter(Boolean).join(" ");
  const lower = label.toLowerCase();
  const activityName = activity.name.toLowerCase();

  if (activity.type === 2 || activityName.includes("spotify") || lower.includes("spotify")) {
    if (activity.syncId && activity.syncId.length > 8) {
      const trackId = encodeURIComponent(activity.syncId);
      return `https://open.spotify.com/track/${trackId}`;
    }
    const track = [activity.details, activity.state].filter(Boolean).join(" ");
    return `https://open.spotify.com/search/${encodeURIComponent(track || query)}`;
  }

  if (
    activity.type === 3 ||
    activityName.includes("youtube") ||
    lower.includes("youtube") ||
    lower.includes("watch") ||
    lower.includes("view")
  ) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  if (activityName.includes("twitch") || activity.type === 1 || lower.includes("twitch") || lower.includes("stream")) {
    return `https://www.twitch.tv/search?term=${encodeURIComponent(query)}`;
  }

  if (activityName.includes("roblox") || lower.includes("roblox")) {
    return `https://www.roblox.com/discover?Keyword=${encodeURIComponent(query)}`;
  }

  if (activityName.includes("soundcloud") || lower.includes("soundcloud")) {
    return `https://soundcloud.com/search?q=${encodeURIComponent(query)}`;
  }

  if (activityName.includes("apple music") || lower.includes("apple music") || lower.includes("apple")) {
    return `https://music.apple.com/us/search?term=${encodeURIComponent(query)}`;
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

  const buttonRows: { label: string; url?: string }[] | null = primary?.buttons?.length
    ? primary.buttons.map((label) => ({ label, url: resolveButtonUrl(primary, label) }))
    : isMusic && activityPlatform(primary!) === "spotify"
      ? [{ label: "Play on Spotify", url: resolveButtonUrl(primary!, "Spotify") }]
      : null;

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
                  <PlatformMark platform={activityPlatform(primary)} />
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

              {buttonRows?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {buttonRows.map((btn, i) => (
                    <a
                      key={i}
                      href={btn.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium select-none transition-all hover:brightness-125"
                      style={{ borderColor: `${accent ?? "#a78bfa"}40`, backgroundColor: `${accent ?? "#a78bfa"}14`, color: accent ?? "#a78bfa" }}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {btn.label}
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
