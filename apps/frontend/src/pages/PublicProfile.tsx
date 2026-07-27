import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type PublicProfile } from "@/lib/api";
import { branding } from "@/config/branding";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import {
  MapPin,
  Globe,
  ExternalLink,
} from "lucide-react";

const GITHUB_URL = "https://github.com/00kino547/BioPlatform";

function fallbackInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
      className="min-h-screen flex flex-col items-center py-12 px-4"
      style={{ backgroundColor: bg, color: textColor, fontFamily }}
    >
      {profile.banner && (
        <div className="w-full max-w-lg mb-6 rounded-2xl overflow-hidden">
          <img
            src={profile.banner}
            alt="Banner"
            className="w-full h-40 object-cover"
          />
        </div>
      )}

      <div className="w-full max-w-lg rounded-2xl p-8 text-center" style={{ backgroundColor: cardBg }}>
        {profile.avatar ? (
          <img
            src={profile.avatar}
            alt={profile.displayName ?? profile.username}
            className="mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-black/30 mb-5"
          />
        ) : (
          <div
            className="mx-auto h-24 w-24 rounded-full flex items-center justify-center text-3xl font-bold text-white ring-4 ring-black/30 mb-5"
            style={{ backgroundColor: accent }}
          >
            {fallbackInitial(profile.displayName ?? profile.username)}
          </div>
        )}

        <h1 className="text-2xl font-bold mb-1" style={{ color: textColor }}>
          {profile.displayName ?? profile.username}
        </h1>
        <p className="text-sm mb-4" style={{ color: mutedColor }}>
          @{profile.username}
        </p>

        {profile.bio && (
          <p className="text-sm leading-relaxed mb-5 whitespace-pre-wrap" style={{ color: `${textColor}cc` }}>
            {profile.bio}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-3 mb-6 text-xs" style={{ color: mutedColor }}>
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {profile.location}
            </span>
          )}
          {profile.website && (
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
              {new URL(profile.website).hostname}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {profile.socialLinks && profile.socialLinks.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            {profile.socialLinks.map((link, i) => {
              const platformLower = link.platform.toLowerCase();
              const isEmail = platformLower === "email";
              const isDiscordUsername = platformLower === "discord" && !/^https?:\/\//i.test(link.url);
              const isClickable = !isDiscordUsername;

              let href = link.url;
              if (isEmail && !link.url.startsWith("mailto:")) {
                href = `mailto:${link.url}`;
              }

              const displayText = isEmail
                ? link.url.startsWith("mailto:") ? link.url.slice(7) : link.url
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
                  className={`flex items-center gap-3 w-full max-w-sm px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isClickable ? "hover:scale-[1.02] cursor-pointer" : "cursor-default"
                  }`}
                  style={{
                    backgroundColor: `${accent}12`,
                    color: accent,
                    border: `1px solid ${accent}25`,
                  }}
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
    </div>
  );
}
