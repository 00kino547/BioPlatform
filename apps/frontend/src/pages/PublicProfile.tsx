import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api, type PublicProfile, type Badge, type DiscordPresence, type SocialLink, type FeatureFlags } from "@/lib/api";
import { branding } from "@/config/branding";
import { usePageMeta, useJsonLd } from "@/lib/seo";
import { useDomain } from "@/contexts/DomainContext";
import { bannerSrcSet, avatarSrcSet, toBackgroundImage } from "@/lib/media";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { FloatingMusicPlayer } from "@/components/music/MusicPlayer";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EnterGate } from "@/components/EnterGate";
import { VersionBadge } from "@/components/updates/VersionBadge";
import { PresenceWidget } from "@/components/discord/PresenceWidget";
import { BadgePill } from "@/components/ui/BadgePill";
import { CountdownBanner } from "@/components/ui/CountdownBanner";
import { FxOverlay, type FxEffect } from "@/components/ui/FxOverlay";
import { InteractiveTerminal } from "@/components/terminal/InteractiveTerminal";
import { NewsletterSubscribeForm } from "@/components/newsletter/NewsletterSubscribeForm";
import { TipBlock } from "@/components/tips/TipBlock";
import { ShopBlock } from "@/components/shop/ShopBlock";
import { MapPin, Globe, ExternalLink } from "lucide-react";

const GITHUB_URL = "https://github.com/00kino547/BioPlatform";

function isSafeHref(href: string): boolean {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

// Gradient presets are already valid CSS backgrounds; image paths need url() wrapping.
function fallbackInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

function contrastInitialColor(bg: string) {
  const rgb = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
  let r: number, g: number, b: number;
  if (rgb) {
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  } else {
    const hx = bg.match(/#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (!hx) return "#ffffff";
    [r, g, b] = [parseInt(hx[1], 16), parseInt(hx[2], 16), parseInt(hx[3], 16)];
  }
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.3 ? "#1c1917" : "#ffffff";
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const { info: domainInfo } = useDomain();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [badgeCatalog, setBadgeCatalog] = useState<Badge[]>([]);
  const [entered, setEntered] = useState(false);
  const [livePresence, setLivePresence] = useState<DiscordPresence | null | undefined>(undefined);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);

  const customBase = domainInfo?.active && domainInfo.canonical ? domainInfo.canonical : null;

  usePageMeta({
    title: profile ? `${profile.displayName || profile.username} (@${profile.username})` : "Profile",
    description: profile?.bio || branding.description,
    url: `/${username ?? ""}`,
    image: profile ? `${customBase ?? branding.url}/api/profiles/${profile.username}/og.png` : branding.ogImage,
    baseUrl: customBase ?? undefined,
  });

  const profileJsonLd = useMemo(() => {
    if (!profile) return null;
    const root = (customBase ?? branding.url).replace(/\/+$/, "");
    const sameAs = (profile.socialLinks ?? [])
      .map((l) => l.url)
      .filter((url): url is string => /^https?:\/\//i.test(url));
    return {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name: profile.displayName || profile.username,
        url: `${root}/${profile.slug}`,
        image: `${root}/api/profiles/${profile.username}/og.png`,
        description: profile.bio ?? undefined,
        sameAs: sameAs.length > 0 ? sameAs : undefined,
      },
    };
  }, [profile, customBase]);
  useJsonLd("profile", profileJsonLd);

  useEffect(() => {
    api.getBadges().then((res) => {
      if (res.success && res.data) setBadgeCatalog(res.data);
    }).catch(() => {});
    api.getFeatures().then((res) => {
      if (res.success && res.data) setFeatures(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setEntered(false);
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
  const seasonal = profile.seasonal?.theme ?? null;
  const scfg = seasonal?.config ?? {};
  // Seasonal themes win entirely over the user's custom theme while active.
  const bg = scfg.bg ?? theme.bg ?? "#09090b";
  const cardBg = scfg.cardBg ?? theme.cardBg ?? "rgba(24,24,27,0.6)";
  const textColor = scfg.text ?? theme.text ?? "#e4e4e7";
  const accent = scfg.accent ?? theme.accent ?? "#7c3aed";
  const fontFamily = scfg.fontFamily ?? theme.fontFamily ?? "Inter, system-ui, sans-serif";

  const mutedColor = `${textColor}88`;
  const backgroundImage = scfg.backgroundImage ?? theme.backgroundImage ?? null;
  const layout = (scfg.layout ?? theme.layout ?? "default") as string;
  const effect: FxEffect = (scfg.effect as FxEffect) ?? (theme.animatedFx ? (theme.effect as FxEffect) : "none") ?? "none";

  const layoutClasses: Record<string, string> = {
    default: "items-center",
    grid: "items-center",
    compact: "items-center",
    wide: "items-center",
    glassmorphism: "items-center",
    minimal: "items-center",
    sidebar: "items-center",
    editorial: "items-center",
    hero: "items-center",
    bento: "items-center",
    terminal: "items-center",
    polaroid: "items-center",
    topbar: "items-center",
  };

  const layoutClass = layoutClasses[layout] ?? "items-center";

  const isSidebar = layout === "sidebar";
  const isEditorial = layout === "editorial";
  const isCompact = layout === "compact";
  const isTerminal = layout === "terminal";
  const isPolaroid = layout === "polaroid";
  const isBento = layout === "bento";
  const isHero = layout === "hero";
  const isTopbar = layout === "topbar";

  const contentWidthClass = (() => {
    switch (layout) {
      case "wide":
      case "sidebar":
      case "editorial":
      case "bento":
        return "max-w-5xl";
      case "compact":
      case "minimal":
        return "max-w-3xl";
      case "terminal":
      case "polaroid":
        return "max-w-2xl";
      default:
        return "max-w-4xl";
    }
  })();

  const displayTextColor = isPolaroid ? "#292524" : textColor;
  const displayMuted = isPolaroid ? "#6b6559" : mutedColor;
  const displayFont = isTerminal
    ? '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    : fontFamily;

  const cardLayoutClass = isSidebar
    ? `flex flex-col gap-6 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 ${contentWidthClass}`
    : isBento
      ? `grid gap-4 sm:grid-cols-2 lg:grid-cols-12 ${contentWidthClass}`
      : contentWidthClass;

  const cardStyle: React.CSSProperties = {
    color: displayTextColor,
    ...(isPolaroid
      ? {
          backgroundColor: "#f6f2e7",
          border: `1px solid ${accent}33`,
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.5)",
          transform: "rotate(-1.25deg)",
          padding: "clamp(1.5rem, 4vw, 2.5rem)",
        }
      : layout === "minimal"
        ? {
            background: "transparent",
            boxShadow: "none",
            border: "none",
            padding: "clamp(1.75rem, 5vw, 3rem)",
            ...(backgroundImage
              ? {
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  backgroundColor: "rgba(9,9,11,0.28)",
                }
              : {}),
          }
        : {
            backgroundColor: cardBg,
            padding:
              layout === "compact" || layout === "topbar"
                ? "clamp(0.875rem, 2.5vw, 1.25rem)"
                : layout === "editorial"
                  ? "clamp(1.75rem, 5vw, 3rem)"
                  : "clamp(1.25rem, 4vw, 2rem)",
            ...(layout === "glassmorphism"
              ? {
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: `1px solid ${accent}22`,
                }
              : layout === "terminal"
                ? {
                    border: `1px solid ${accent}30`,
                    boxShadow: `0 0 40px -12px ${accent}40, inset 0 0 60px -45px ${accent}50`,
                    borderRadius: "0.85rem",
                    padding: "0",
                  }
                : {}),
          }),
  };

  const linkVariant =
    layout === "grid" || layout === "bento"
      ? "tile"
      : layout === "compact"
        ? "tight"
        : layout === "editorial" || layout === "topbar"
          ? "divider"
          : "row";

  const linkContainerClass =
    layout === "grid"
      ? "grid gap-2.5 sm:grid-cols-2"
      : layout === "bento"
        ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        : layout === "wide"
          ? "grid gap-2.5 sm:grid-cols-3"
          : layout === "compact"
            ? "flex flex-col gap-1.5"
            : layout === "editorial" || layout === "topbar"
              ? "flex flex-col"
            : layout === "sidebar"
              ? "grid gap-2.5 sm:grid-cols-2"
              : layout === "terminal"
                ? "flex flex-col gap-1.5"
                : "flex flex-col gap-2.5";

  const avatarSize = (() => {
    if (isHero) return { width: "clamp(6rem, 14vw, 8.5rem)", height: "clamp(6rem, 14vw, 8.5rem)" };
    if (isSidebar || isBento) return { width: "clamp(5rem, 12vw, 7rem)", height: "clamp(5rem, 12vw, 7rem)" };
    if (isCompact || isTopbar || isTerminal) return { width: "clamp(2.4rem, 6vw, 3rem)", height: "clamp(2.4rem, 6vw, 3rem)" };
    return { width: "clamp(3.5rem, 9vw, 5rem)", height: "clamp(3.5rem, 9vw, 5rem)" };
  })();

  const renderAvatar = (size: { width: string; height: string }, extraClassName = "") => {
    const ring = isPolaroid ? "" : "ring-4 ring-black/30";
    if (profile.avatar) {
      return (
        <img
          src={profile.avatar}
          srcSet={avatarSrcSet(profile.avatar)}
          sizes="120px"
          decoding="async"
          alt={profile.displayName ?? profile.username}
          className={`shrink-0 ${isPolaroid ? "rounded-sm" : "rounded-full"} object-cover ${ring} ${extraClassName}`}
          style={size}
        />
      );
    }
    return (
      <div
        className={`shrink-0 ${isPolaroid ? "rounded-sm" : "rounded-full"} flex items-center justify-center font-bold ${ring} ${extraClassName}`}
        style={{
          ...size,
          backgroundColor: accent,
          color: contrastInitialColor(accent),
        }}
      >
        <span style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)" }}>
          {fallbackInitial(profile.displayName ?? profile.username)}
        </span>
      </div>
    );
  };

  const identityBlock = isEditorial ? (
    <div className="flex flex-col items-center text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] mb-3" style={{ color: accent }}>
        @{profile.username}
      </p>
      {renderAvatar({
        width: "clamp(4rem, 10vw, 5.5rem)",
        height: "clamp(4rem, 10vw, 5.5rem)",
      })}
      <h1
        className="font-extrabold truncate mt-4"
        style={{
          color: displayTextColor,
          fontSize: "clamp(2.25rem, 6vw, 4rem)",
          letterSpacing: "-0.03em",
        }}
      >
        {profile.displayName ?? profile.username}
      </h1>
      {profile.badges && profile.badges.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {profile.badges
            .map((id) => badgeCatalog.find((b) => b.id === id))
            .filter((b): b is Badge => Boolean(b))
            .map((badge) => (
              <BadgePill key={badge.id} badge={badge} />
            ))}
        </div>
      )}
      <div className="mt-7 w-full border-t" style={{ borderColor: `${accent}26` }} />
    </div>
  ) : (
    <div className={`flex items-center gap-3 sm:gap-4 ${isSidebar ? "flex-col items-center text-center gap-4" : ""}`}>
      {renderAvatar(avatarSize)}
      <div className="min-w-0 flex-1">
        <h1
          className="font-bold truncate"
          style={{
            color: displayTextColor,
            fontSize:
              isHero ? "clamp(2rem, 4.5vw, 2.75rem)"
                : isCompact || isTopbar ? "clamp(1rem, 2.5vw, 1.25rem)"
                  : "clamp(1.25rem, 3.5vw, 1.75rem)",
          }}
        >
          {profile.displayName ?? profile.username}
        </h1>
        <p className="text-xs sm:text-sm truncate" style={{ color: displayMuted }}>
          @{profile.username}
        </p>
        {profile.badges && profile.badges.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 mt-2 ${isTopbar ? "sm:hidden" : ""}`}>
            {profile.badges
              .map((id) => badgeCatalog.find((b) => b.id === id))
              .filter((b): b is Badge => Boolean(b))
              .map((badge) => (
                <BadgePill key={badge.id} badge={badge} />
              ))}
          </div>
        )}
      </div>
      {isTopbar && profile.badges && profile.badges.length > 0 && (
        <div className="hidden sm:flex flex-wrap justify-end gap-1.5 ml-auto">
          {profile.badges
            .map((id) => badgeCatalog.find((b) => b.id === id))
            .filter((b): b is Badge => Boolean(b))
            .map((badge) => (
              <BadgePill key={badge.id} badge={badge} />
            ))}
        </div>
      )}
    </div>
  );

  const bioBlock = profile.bio ? (
    <p
      className={`text-sm leading-relaxed whitespace-pre-wrap ${isSidebar ? "mt-4" : "mt-4 sm:mt-5"} ${
        isEditorial ? "mt-5 text-center max-w-xl mx-auto" : ""
      }`}
      style={{ color: `${displayTextColor}cc` }}
    >
      {profile.bio}
    </p>
  ) : null;

  const metaBlock = (
    <div
      className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${isEditorial ? "justify-center" : ""}`}
      style={{ color: displayMuted }}
    >
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
          style={{ color: displayMuted }}
          onMouseEnter={(e) => (e.currentTarget.style.color = accent)}
          onMouseLeave={(e) => (e.currentTarget.style.color = displayMuted)}
        >
          <Globe className="h-3.5 w-3.5" />
          {new URL(profile.website).hostname || profile.website}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );

  const discordBlock = profile.discord ? (
    <div className={`flex flex-col ${isSidebar ? "" : "mt-6 sm:mt-7"}`}>
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
  ) : null;

  const renderLinkItem = (
    link: SocialLink,
    variant: "row" | "tight" | "tile" | "divider"
  ) => {
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

    const variantClass =
      variant === "tile"
        ? "flex-col items-center justify-center gap-2.5 px-4 py-6 rounded-xl text-center"
        : variant === "tight"
          ? "gap-2.5 px-2.5 py-2 rounded-lg"
          : variant === "divider"
            ? "gap-3 px-2 py-3 rounded-none"
            : "gap-3 px-4 py-3 rounded-xl";

    const icon = features?.linksCustomIcons && link.image ? (
      <img
        src={link.image}
        alt=""
        className={variant === "tile" ? "h-6 w-6 flex-shrink-0 rounded object-contain" : "h-5 w-5 flex-shrink-0 rounded object-contain"}
      />
    ) : features?.linksCustomIcons && link.icon ? (
      <span aria-hidden className={variant === "tile" ? "h-6 w-6 flex-shrink-0 text-center leading-6 text-lg" : "h-5 w-5 flex-shrink-0 text-center leading-5 text-base"}>
        {link.icon}
      </span>
    ) : (
      <PlatformIcon platform={link.platform} className={variant === "tile" ? "h-6 w-6 flex-shrink-0" : "h-5 w-5 flex-shrink-0"} color={accent} />
    );

    const content =
      variant === "tile" ? (
        <>
          {icon}
          <div className="flex flex-col items-center min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80 truncate w-full text-center">
              {link.label || link.platform}
            </span>
            <span className="text-[11px] opacity-55 truncate w-full text-center">{displayText}</span>
          </div>
        </>
      ) : variant === "tight" ? (
        <>
          {icon}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider opacity-70">
            {link.label || link.platform}
          </span>
          <span className="hidden sm:block text-[11px] opacity-50 truncate">{displayText}</span>
        </>
      ) : (
        <>
          {icon}
          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70 truncate w-full text-left">
              {link.label || link.platform}
            </span>
            <span className="text-xs opacity-60 truncate w-full text-left">{displayText}</span>
          </div>
        </>
      );

    return (
      <Tag
        {...(linkProps as Record<string, unknown>)}
        className={`flex w-full text-sm font-medium transition-all duration-200 ${variantClass} ${
          isClickable
            ? variant === "tile"
              ? "hover:-translate-y-0.5 cursor-pointer"
              : "hover:scale-[1.02] cursor-pointer"
            : "cursor-default"
        }`}
        style={
          variant === "divider"
            ? { borderBottom: `1px solid ${accent}16` }
            : { backgroundColor: `${accent}12`, border: `1px solid ${accent}25` }
        }
        onClick={isClickable && profile.id ? () => {
          api.trackClick(profile.id, link.platform, link.label?.trim() || link.platform).catch(() => {});
        } : undefined}
      >
        {content}
      </Tag>
    );
  };

  const resolveQrValue = (link: SocialLink): string => {
    const p = link.platform.toLowerCase();
    if (p === "email") return link.url.startsWith("mailto:") ? link.url : `mailto:${link.url}`;
    if (p === "discord" && !/^https?:\/\//i.test(link.url)) return "";
    return link.url;
  };

  const renderQr = (link: SocialLink, variant: string) => {
    if (!features?.linksQr || !link.showQr) return null;
    const value = resolveQrValue(link);
    if (!value) return null;
    return (
      <div
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200 hover:opacity-90"
        style={{ backgroundColor: `${accent}10`, border: `1px solid ${accent}22` }}
        onClick={profile.id ? () => api.trackClick(profile.id!, link.platform, link.label?.trim() || link.platform).catch(() => {}) : undefined}
        title="Scan to open this link"
      >
        <span className="rounded-lg bg-white p-1.5 flex-shrink-0" style={variant === "tile" ? { marginInline: "auto" } : undefined}>
          <QRCodeSVG value={value} size={72} bgColor="#ffffff" fgColor="#18181b" level="M" />
        </span>
        {variant !== "tile" ? (
          <span className="min-w-0 text-left">
            <span className="block text-[11px] font-semibold uppercase tracking-wider opacity-70">Scan to open</span>
            <span className="block text-xs opacity-55 truncate">{value.replace(/^mailto:/, "")}</span>
          </span>
        ) : null}
      </div>
    );
  };

  const renderLinks = (variant: "row" | "tight" | "tile" | "divider"): React.ReactNode[] => {
    if (!profile) return [];
    const links = profile.socialLinks ?? [];
    const out: React.ReactNode[] = [];
    let lastHeading: string | null = null;
    links.forEach((link, idx) => {
      const heading = features?.linksSections ? (link.heading ?? "") : "";
      if (heading && heading !== lastHeading) {
        out.push(
          <div key={`sec-${idx}-${heading}`} className="w-full text-left">
            <span className="block px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-60">
              {heading}
            </span>
          </div>
        );
      }
      lastHeading = heading || null;
      out.push(
        <div key={`l-${idx}`} className="w-full flex flex-col gap-2">
          {renderLinkItem(link, variant)}
          {renderQr(link, variant)}
        </div>
      );
    });
    return out;
  };

  const presenceLine = profile.presenceStatus ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        className="h-2 w-2 rounded-full shadow"
        style={{ backgroundColor: profile.presenceStatus === "online" ? "#22c55e" : profile.presenceStatus === "idle" ? "#eab308" : "#a1a1aa" }}
      />
      {profile.presenceStatus === "online" ? "Online" : profile.presenceStatus === "idle" ? "Away" : "Offline"}
    </span>
  ) : null;

  const countdownBlock =
    profile.countdown && profile.countdown.targetDate ? (
      <CountdownBanner label={profile.countdown.label} targetDate={profile.countdown.targetDate} accent={accent} />
    ) : null;

  const statusBanner = presenceLine || countdownBlock ? (
    <div className="flex flex-wrap items-center gap-3 mb-4 text-sm" style={{ color: displayMuted }}>
      {presenceLine}
      {countdownBlock && <div className="flex-1 min-w-full">{countdownBlock}</div>}
    </div>
  ) : null;

  const newsletterBlock = profile.newsletterVisible && profile.id ? (
    <NewsletterSubscribeForm
      profileId={profile.id}
      heading={profile.newsletterHeading}
      accent={accent}
      textColor={displayTextColor}
      mutedColor={displayMuted}
    />
  ) : null;

  const tipBlock = profile.tipsEnabled && profile.id ? (
    <TipBlock
      profileId={profile.id}
      heading={profile.tipsHeading}
      btcAddress={profile.tipsBtcAddress ?? null}
      ltcAddress={profile.tipsLtcAddress ?? null}
      accent={accent}
      textColor={displayTextColor}
      mutedColor={displayMuted}
    />
  ) : null;

  const shopReturnStatus =
    searchParams.get("shop") === "purchase" ? searchParams.get("status") : null;

  const shopBlock =
    profile.products && profile.products.length > 0 ? (
      <ShopBlock
        products={profile.products}
        discountPercent={profile.shopDiscountPercent}
        accent={accent}
        textColor={displayTextColor}
        mutedColor={displayMuted}
      />
    ) : null;

  const linksBlock =
    profile.socialLinks && profile.socialLinks.length > 0 ? (
      <div className={`${isSidebar ? "" : "mt-6 sm:mt-7"} ${linkContainerClass}`}>
        {statusBanner}
        {renderLinks(linkVariant)}
        {newsletterBlock}
        {tipBlock}
        {shopBlock}
      </div>
    ) : statusBanner || newsletterBlock || tipBlock || shopBlock ? (
      <div className={`${isSidebar ? "" : "mt-6 sm:mt-7"} ${linkContainerClass}`}>
        {statusBanner}
        {newsletterBlock}
        {tipBlock}
        {shopBlock}
      </div>
    ) : null;

  const shopReturnNotice = shopReturnStatus ? (
    <div
      className={`${contentWidthClass} mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
        shopReturnStatus === "success"
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border border-zinc-700 bg-zinc-800/60 text-zinc-400"
      }`}
    >
      {shopReturnStatus === "success"
        ? "Payment received! Your download is ready — open the product card to download it."
        : "Your purchase was cancelled. No charge was made."}
    </div>
  ) : null;

  return (
    <div
      className={`min-h-screen flex flex-col ${layoutClass} py-8 sm:py-12 px-4 sm:px-6 relative`}
      style={{
        backgroundColor: bg,
        color: textColor,
        fontFamily,
        ...(backgroundImage
          ? {
              backgroundImage: toBackgroundImage(backgroundImage),
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
            }
          : {}),
      }}
    >
      <FxOverlay effect={effect} accent={accent} />
      {shopReturnNotice}
      {profile.banner && (
        <div className={`relative z-10 w-full ${contentWidthClass} mb-5 sm:mb-6 rounded-2xl overflow-hidden`}>
          <img
            src={profile.banner}
            srcSet={bannerSrcSet(profile.banner)}
            sizes="(min-width: 928px) 896px, 92vw"
            fetchPriority="high"
            decoding="async"
            alt="Banner"
            className="w-full object-cover"
            style={{ height: "clamp(7rem, 16vw, 11rem)" }}
          />
        </div>
      )}

      <div
        className={`relative z-10 w-full ${cardLayoutClass} rounded-2xl text-left`}
        style={cardStyle}
      >
        {layout === "hero" || layout === "terminal" || layout === "polaroid" || layout === "topbar" ? (
          layout === "polaroid" ? (
            <div className="flex flex-col items-center text-center">
              <div
                className="rotate-2 rounded-sm bg-white p-4 pb-3 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.45)]"
                style={{ maxWidth: "min(100%, 11rem)" }}
              >
                {renderAvatar({ width: "9.5rem", height: "9.5rem" }, "block mx-auto")}
              </div>
              <p className="mt-4 font-serif italic tracking-wide" style={{ color: "#44403c" }}>
                {profile.displayName ?? profile.username}
              </p>
              <p className="text-xs" style={{ color: "#78716c" }}>@{profile.username}</p>
              {profile.badges && profile.badges.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                  {profile.badges.map((id) => badgeCatalog.find((b) => b.id === id)).filter((b): b is Badge => Boolean(b)).map((badge) => (
                    <BadgePill key={badge.id} badge={badge} />
                  ))}
                </div>
              )}
              {profile.bio && (
                <p className="mt-4 max-w-sm text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#57534e" }}>
                  {profile.bio}
                </p>
              )}
              <div className="mt-5 flex flex-col gap-2.5 w-full">
                {statusBanner}
                {renderLinks("divider")}
              </div>
              {discordBlock}
            </div>
          ) : layout === "terminal" ? (
            <div style={{ fontFamily: displayFont }}>
              <div
                className="flex items-center gap-1.5 px-4 py-2.5 border-b"
                style={{ borderColor: `${accent}22`, backgroundColor: "rgba(0,0,0,0.25)" }}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-[10px] uppercase tracking-widest opacity-50" style={{ color: displayTextColor }}>
                  {profile.username}@bioplatform ~ zsh
                </span>
              </div>
              <div className="px-4 sm:px-6 py-5 space-y-3">
                <p className="text-xs opacity-60">$ cat whoami.txt</p>
                <p className="text-sm font-semibold" style={{ color: accent }}>
                  {profile.displayName ?? profile.username}
                  <span className="opacity-50 font-normal"> @ {profile.username}</span>
                </p>
                {profile.bio && (
                  <p className="text-xs opacity-50"># {profile.bio}</p>
                )}
                <InteractiveTerminal
                  username={profile.username}
                  displayName={profile.displayName}
                  bio={profile.bio}
                  website={profile.website}
                  brand={branding.name}
                  accent={accent}
                  text={textColor}
                  links={profile.socialLinks ?? []}
                  terminalCommands={profile.terminalCommands ?? []}
                  className="pt-1"
                />
              </div>
            </div>
          ) : layout === "hero" ? (
            <div>
              <div
                className="w-full"
                style={{ height: "clamp(5rem, 10vw, 7rem)", background: `linear-gradient(135deg, ${accent}3d, ${accent}0f)` }}
              />
              <div className="flex flex-col items-center px-6 -mt-12">
                {renderAvatar(avatarSize)}
                <h1
                  className="font-extrabold truncate mt-4 text-center"
                  style={{ color: displayTextColor, fontSize: "clamp(2rem, 4.5vw, 2.75rem)", letterSpacing: "-0.02em" }}
                >
                  {profile.displayName ?? profile.username}
                </h1>
                <p className="text-sm mt-1" style={{ color: displayMuted }}>@{profile.username}</p>
                {profile.badges && profile.badges.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                    {profile.badges.map((id) => badgeCatalog.find((b) => b.id === id)).filter((b): b is Badge => Boolean(b)).map((badge) => (
                      <BadgePill key={badge.id} badge={badge} />
                    ))}
                  </div>
                )}
                {profile.bio && (
                  <p className="mt-4 max-w-xl text-sm leading-relaxed whitespace-pre-wrap text-center" style={{ color: `${displayTextColor}cc` }}>
                    {profile.bio}
                  </p>
                )}
                <div className="mt-6 w-full pb-8">
                  {discordBlock}
                  {linksBlock}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div
                className="flex items-center gap-3 border-b"
                style={{ borderColor: `${accent}22`, paddingBottom: "clamp(0.75rem, 2vw, 1rem)" }}
              >
                {renderAvatar({ width: "clamp(2.5rem, 6vw, 3rem)", height: "clamp(2.5rem, 6vw, 3rem)" })}
                <div className="min-w-0 flex-1">
                  <h1 className="font-bold truncate text-lg" style={{ color: displayTextColor }}>
                    {profile.displayName ?? profile.username}
                  </h1>
                  <p className="text-xs truncate" style={{ color: displayMuted }}>@{profile.username}</p>
                </div>
                {profile.badges && profile.badges.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {profile.badges.map((id) => badgeCatalog.find((b) => b.id === id)).filter((b): b is Badge => Boolean(b)).map((badge) => (
                      <BadgePill key={badge.id} badge={badge} />
                    ))}
                  </div>
                )}
              </div>
              {profile.bio && (
                <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: `${displayTextColor}cc` }}>
                  {profile.bio}
                </p>
              )}
              <div className="mt-3">
                {metaBlock}
              </div>
              <div className="mt-5">
                {discordBlock}
              </div>
              {linksBlock}
            </div>
          )
        ) : layout === "bento" ? (
          <>
            <div
              className="sm:col-span-2 lg:col-span-5 rounded-2xl flex flex-col items-center justify-center text-center p-6"
              style={{ backgroundColor: `${accent}0d`, border: `1px solid ${accent}20` }}
            >
              {renderAvatar(avatarSize)}
              <h1 className="font-bold truncate mt-4 text-xl" style={{ color: displayTextColor }}>
                {profile.displayName ?? profile.username}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: displayMuted }}>@{profile.username}</p>
              {profile.badges && profile.badges.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                  {profile.badges.map((id) => badgeCatalog.find((b) => b.id === id)).filter((b): b is Badge => Boolean(b)).map((badge) => (
                    <BadgePill key={badge.id} badge={badge} />
                  ))}
                </div>
              )}
            </div>
            <div
              className="sm:col-span-2 lg:col-span-7 rounded-2xl p-6 flex flex-col justify-center"
              style={{ backgroundColor: `${accent}08`, border: `1px solid ${accent}16` }}
            >
              {profile.bio && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: `${displayTextColor}cc` }}>
                  {profile.bio}
                </p>
              )}
              {metaBlock}
            </div>
            {discordBlock && (
              <div className="sm:col-span-2 lg:col-span-12">
                {discordBlock}
              </div>
            )}
            {linksBlock && (
              <div className="sm:col-span-2 lg:col-span-12">
                {linksBlock}
              </div>
            )}
          </>
        ) : isSidebar ? (
          <>
            <aside className="lg:self-start lg:sticky lg:top-8">
              {identityBlock}
              {bioBlock}
              {metaBlock}
            </aside>
            <div className="lg:min-w-0">
              {discordBlock}
              {linksBlock}
            </div>
          </>
        ) : (
          <>
            {identityBlock}
            {bioBlock}
            {metaBlock}
            {discordBlock}
            {linksBlock}
          </>
        )}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <VersionBadge />
        <p className="text-xs" style={{ color: `${textColor}44` }}>
          Powered by{" "}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity">
            {branding.name}
          </a>
        </p>
      </div>

      {profile.musicTracks && profile.musicTracks.length > 0 && (
        <ErrorBoundary fallback={null}>
          <FloatingMusicPlayer tracks={profile.musicTracks} accent={accent} textColor={textColor} started={entered} />
        </ErrorBoundary>
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
