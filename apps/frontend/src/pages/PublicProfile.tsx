import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type PublicProfile, type Badge, type DiscordPresence } from "@/lib/api";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { useDomain } from "@/contexts/DomainContext";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { FloatingMusicPlayer } from "@/components/music/MusicPlayer";
import { EnterGate } from "@/components/EnterGate";
import { PresenceWidget } from "@/components/discord/PresenceWidget";
import { BadgePill } from "@/components/ui/BadgePill";
import {
  MapPin,
  Globe,
  ExternalLink,
} from "lucide-react";

const GITHUB_URL = "https://github.com/00kino547/BioPlatform";

function isSafeHref(href: string): boolean {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function fallbackInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { info: domainInfo } = useDomain();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [badgeCatalog, setBadgeCatalog] = useState<Badge[]>([]);
  const [entered, setEntered] = useState(false);
  const [livePresence, setLivePresence] = useState<DiscordPresence | null | undefined>(undefined);

  const customBase = domainInfo?.active && domainInfo.canonical ? domainInfo.canonical : null;

  usePageMeta({
    title: profile ? `${profile.displayName || profile.username} (@${profile.username})` : "Profile",
    description: profile?.bio || branding.description,
    url: `/${username ?? ""}`,
    image: profile ? `${customBase ?? branding.url}/api/profiles/${profile.username}/og.png` : branding.ogImage,
    baseUrl: customBase ?? undefined,
  });

  useEffect(() => {
    api.getBadges().then((res) => {
      if (res.success && res.data) setBadgeCatalog(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    api.getPublicProfile(username).then((res) => {
      if (res.success && res.data) {
        setProfile(res.data);
      } else {
        setError(true);
      }
      setLoading(false);
    });
  }, [username]);

  const hasDiscord = Boolean(profile?.discord);

  useEffect(() => {
    if (!entered || !username || !hasDiscord) return;
    let stopped = false;

    const tick = async () => {
      if (stopped || document.hidden) return;
      const res = await api.getProfilePresence(username);
      if (!stopped && res.success) setLivePresence(res.data ?? null);
    };

    const timer = window.setInterval(tick, 30_000);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [entered, username, hasDiscord]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Profile not found</h1>
          <p className="text-zinc-400 text-sm">This profile doesn&apos;t exist or is private.</p>
          <a
            href="/"
            className="inline-block mt-6 text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Back to {branding.name}
          </a>
        </div>
      </div>
    );
  }

  const theme = profile.theme ?? {};
  const bg = theme.bg ?? "#09090b";
  const cardBg = theme.cardBg ?? "rgba(24,24,27,0.6)";
  const textColor = theme.text ?? "#e4e4e7";
  const accent = theme.accent ?? "#7c3aed";
  const fontFamily = theme.fontFamily ?? "Inter, system-ui, sans-serif";

  const mutedColor = `${textColor}88`;

  return (
    <div
      className="min-h-screen flex flex-col items-center py-8 sm:py-12 px-4 sm:px-6"
      style={{ backgroundColor: bg, color: textColor, fontFamily }}
    >
      {profile.banner && (
        <div className="w-full max-w-4xl mb-5 sm:mb-6 rounded-2xl overflow-hidden">
          <img
            src={profile.banner}
            alt="Banner"
            className="w-full object-cover"
            style={{ height: "clamp(7rem, 16vw, 11rem)" }}
          />
        </div>
      )}

      <div
        className="w-full max-w-4xl rounded-2xl text-left"
        style={{ backgroundColor: cardBg, padding: "clamp(1.25rem, 4vw, 2rem)" }}
      >
        <div className="flex items-center gap-4 sm:gap-5">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.displayName ?? profile.username}
              className="shrink-0 rounded-full object-cover ring-4 ring-black/30"
              style={{ width: "clamp(3.5rem, 9vw, 5rem)", height: "clamp(3.5rem, 9vw, 5rem)" }}
            />
          ) : (
            <div
              className="shrink-0 rounded-full flex items-center justify-center font-bold text-white ring-4 ring-black/30"
              style={{
                width: "clamp(3.5rem, 9vw, 5rem)",
                height: "clamp(3.5rem, 9vw, 5rem)",
                backgroundColor: accent,
              }}
            >
              <span style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)" }}>
                {fallbackInitial(profile.displayName ?? profile.username)}
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="font-bold truncate" style={{ color: textColor, fontSize: "clamp(1.25rem, 3.5vw, 1.75rem)" }}>
              {profile.displayName ?? profile.username}
            </h1>
            <p className="text-xs sm:text-sm truncate" style={{ color: mutedColor }}>
              @{profile.username}
            </p>
            {profile.badges && profile.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {profile.badges
                  .map((id) => badgeCatalog.find((b) => b.id === id))
                  .filter((b): b is Badge => Boolean(b))
                  .map((badge) => (
                    <BadgePill key={badge.id} badge={badge} />
                  ))}
              </div>
            )}
          </div>
        </div>

        {profile.bio && (
          <p className="mt-4 sm:mt-5 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: `${textColor}cc` }}>
            {profile.bio}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: mutedColor }}>
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {profile.location}
            </span>
          )}
          {profile.website && isSafeHref(profile.website) && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors"
              style={{ color: mutedColor }}
              onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
              onMouseLeave={(e) => (e.currentTarget.style.color = mutedColor)}
            >
              <Globe className="h-3.5 w-3.5" />
              {new URL(profile.website).hostname || profile.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {profile.discord && (
          <div className="mt-6 sm:mt-7 flex flex-col">
            <h2
              className="text-[11px] font-semibold uppercase tracking-widest mb-2.5 text-left"
              style={{ color: mutedColor }}
            >
              Discord
            </h2>
            <PresenceWidget
              account={{
                username: profile.discord.username,
                globalName: profile.discord.globalName,
                avatar: profile.discord.avatar,
              }}
              presence={livePresence !== undefined ? livePresence : profile.discord.presence}
              accent={accent}
              textColor={textColor}
            />
          </div>
        )}

        {profile.socialLinks && profile.socialLinks.length > 0 && (
          <div className="mt-6 sm:mt-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {profile.socialLinks.map((link, i) => {
              const platformLower = link.platform.toLowerCase();
              const isEmail = platformLower === "email";
              const isDiscordUsername = platformLower === "discord" && !/^https?:\/\//i.test(link.url);

              let href = link.url;
              if (isEmail && !link.url.startsWith("mailto:")) {
                href = `mailto:${link.url}`;
              }

              const isDiscordInvite =
                platformLower === "discord" && /^https?:\/\//i.test(link.url) && /discord\.(gg|com|app)\//.test(link.url);

              const isClickable = !isDiscordUsername && isSafeHref(href);

              const displayText = isEmail
                ? link.url.startsWith("mailto:") ? link.url.slice(7) : link.url
                : isDiscordInvite
                  ? `discord.gg${new URL(link.url).pathname.replace(/^\/invite/, "") || "/invite"}`
                  : link.url;

              const Tag = isClickable ? "a" : "div";
              const linkProps = isClickable
                ? {
                    href,
                    target: isEmail ? undefined : "_blank",
                    rel: isEmail ? undefined : "noopener noreferrer",
                  }
                : {};

              return (
                <Tag
                  key={i}
                  {...(linkProps as Record<string, unknown>)}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isClickable ? "hover:scale-[1.02] cursor-pointer" : "cursor-default"
                  }`}
                  style={{
                    backgroundColor: `${accent}12`,
                    color: accent,
                    border: `1px solid ${accent}25`,
                  }}
                  onClick={isClickable && profile.id ? () => {
                    api.trackClick(profile.id, link.platform).catch(() => {});
                  } : undefined}
                >
                  <PlatformIcon
                    platform={link.platform}
                    className="h-5 w-5 flex-shrink-0"
                    color={accent}
                  />
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                      {link.platform}
                    </span>
                    <span className="text-xs opacity-60 truncate w-full text-left">
                      {displayText}
                    </span>
                  </div>
                </Tag>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs" style={{ color: `${textColor}44` }}>
        Powered by{" "}
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity">
          {branding.name}
        </a>
      </p>

      {profile.musicTracks && profile.musicTracks.length > 0 && (
        <FloatingMusicPlayer tracks={profile.musicTracks} accent={accent} textColor={textColor} started={entered} />
      )}

      <EnterGate
        key={profile.username}
        name={profile.displayName ?? profile.username}
        username={profile.username}
        avatar={profile.avatar}
        accent={accent}
        textColor={textColor}
        onEnter={() => setEntered(true)}
      />
    </div>
  );
}
