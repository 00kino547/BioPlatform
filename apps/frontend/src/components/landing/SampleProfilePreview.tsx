import { useState } from "react";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { FxOverlay, type FxEffect } from "@/components/ui/FxOverlay";
import { InteractiveTerminal } from "@/components/terminal/InteractiveTerminal";
import { branding } from "@/config/branding";
import { toBackgroundImage } from "@/lib/media";

export interface PreviewLink {
  platform: string;
  url: string;
}

export interface SeasonalPreviewConfig {
  bg?: string | null;
  cardBg?: string | null;
  text?: string | null;
  accent?: string | null;
  fontFamily?: string | null;
  layout?: string | null;
  backgroundImage?: string | null;
  effect?: string | null;
}

const DEFAULT_LINKS: PreviewLink[] = [
  { platform: "GitHub", url: "https://github.com" },
  { platform: "Twitter", url: "https://x.com" },
  { platform: "Discord", url: "alexmorgan" },
  { platform: "Email", url: "mailto:alex@example.com" },
];

const PRESET_THEMES = [
  { label: "Midnight", bg: "#09090b", cardBg: "rgba(24,24,27,0.6)", text: "#e4e4e7", accent: "#7c3aed" },
  { label: "Ocean", bg: "#0c1222", cardBg: "rgba(15,23,42,0.7)", text: "#e2e8f0", accent: "#0ea5e9" },
  { label: "Sunset", bg: "#1a0a0a", cardBg: "rgba(45,10,10,0.6)", text: "#fef2f2", accent: "#f97316" },
  { label: "Forest", bg: "#0a1a0f", cardBg: "rgba(10,30,15,0.6)", text: "#ecfdf5", accent: "#22c55e" },
  { label: "Aurora", bg: "#071426", cardBg: "rgba(10,25,45,0.65)", text: "#e0f2fe", accent: "#22d3ee" },
  { label: "Pearl", bg: "#f4f1eb", cardBg: "rgba(255,255,255,0.85)", text: "#1c1917", accent: "#b45309" },
];

const LINK_PLATFORMS = ["GitHub", "Twitter", "YouTube", "Twitch", "Discord", "Instagram", "TikTok", "Email"];

interface SampleProfilePreviewProps {
  theme?: SeasonalPreviewConfig | null;
  badge?: string | null;
  showEditor?: boolean;
  editable?: boolean;
  fill?: boolean;
  className?: string;
}

export function SampleProfilePreview({
  theme = null,
  badge = null,
  showEditor = true,
  editable = true,
  fill = false,
  className = "",
}: SampleProfilePreviewProps) {
  const [name, setName] = useState("Alex Morgan");
  const [handle, setHandle] = useState("alexmorgan");
  const [bio, setBio] = useState("Designer & developer building the future of digital identity.");
  const [links, setLinks] = useState<PreviewLink[]>(DEFAULT_LINKS);
  const [preset, setPreset] = useState(0);
  const [bg, setBg] = useState("#09090b");
  const [cardBg, setCardBg] = useState("rgba(24,24,27,0.6)");
  const [text, setText] = useState("#e4e4e7");
  const [accent, setAccent] = useState("#7c3aed");
  const fontFamily = "Inter, system-ui, sans-serif";
  const [background, setBackground] = useState<string | null>(null);
  const [layout, setLayout] = useState<string>("default");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [newPlatform, setNewPlatform] = useState("GitHub");
  const [newUrl, setNewUrl] = useState("");

  // The `theme` override (seasonal for admin, active preset for showcase) wins entirely when provided.
  const effBg = theme?.bg ?? bg;
  const effText = theme?.text ?? text;
  const effAccent = theme?.accent ?? accent;
  const effFont = theme?.fontFamily ?? fontFamily;
  const effBackground = theme?.backgroundImage ?? background;
  const effLayout = theme?.layout ?? layout;

  const isSidebar = effLayout === "sidebar";
  const isEditorial = effLayout === "editorial";
  const isCompact = effLayout === "compact";
  const isTerminal = effLayout === "terminal";
  const isPolaroid = effLayout === "polaroid";
  const isBento = effLayout === "bento";
  const isHero = effLayout === "hero";
  const isTopbar = effLayout === "topbar";

  const effTextColor = isPolaroid ? "#292524" : effText;
  const effMutedColor = isPolaroid ? "#6b6559" : `${effText}88`;
  const effFontFamily = isTerminal
    ? '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    : effFont;

  const outerClass =
    effLayout === "sidebar"
      ? "mx-auto flex w-full max-w-5xl flex-col gap-8 @min-[560px]:grid @min-[560px]:grid-cols-[260px_minmax(0,1fr)] @min-[560px]:items-start"
      : effLayout === "wide" || effLayout === "editorial" || effLayout === "bento"
        ? "mx-auto flex w-full max-w-5xl flex-col items-center"
        : effLayout === "minimal" || effLayout === "compact"
          ? "mx-auto flex w-full max-w-3xl flex-col items-center"
          : effLayout === "terminal" || effLayout === "polaroid"
            ? "mx-auto flex w-full max-w-2xl flex-col items-center"
            : "mx-auto flex w-full max-w-4xl flex-col items-center";

  const linkVariant: "row" | "tight" | "tile" | "divider" =
    effLayout === "grid" || effLayout === "bento"
      ? "tile"
      : effLayout === "compact"
        ? "tight"
        : effLayout === "editorial" || effLayout === "topbar"
          ? "divider"
          : "row";

  const linkContainerClass =
    effLayout === "grid"
      ? "grid w-full gap-2.5 sm:grid-cols-2"
      : effLayout === "bento"
        ? "grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3"
        : effLayout === "wide"
          ? "grid w-full gap-2.5 sm:grid-cols-3"
          : effLayout === "compact"
            ? "flex w-full flex-col gap-1.5"
            : effLayout === "editorial" || effLayout === "topbar"
              ? "flex w-full flex-col"
: effLayout === "sidebar"
                  ? "flex w-full flex-col gap-2.5"
                : effLayout === "terminal"
                  ? "flex w-full flex-col gap-1.5"
                  : "flex w-full flex-col gap-2.5";

  const pickPreset = (i: number) => {
    const t = PRESET_THEMES[i];
    setPreset(i);
    setBg(t.bg);
    setCardBg(t.cardBg);
    setText(t.text);
    setAccent(t.accent);
  };

  const addLink = () => {
    const url = newUrl.trim();
    if (!url) return;
    setLinks((prev) => [...prev, { platform: newPlatform, url }]);
    setNewUrl("");
    setShowLinkForm(false);
  };

  const removeLink = (i: number) => {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  };

  const renderLinkItem = (link: PreviewLink, i: number, variant: "row" | "tight" | "tile" | "divider") => {
    const display = link.url.startsWith("mailto:") ? link.url.slice(7) : link.url.startsWith("@") ? link.url : link.url.replace(/^https?:\/\//, "");
    const isTile = variant === "tile";
    const isTight = variant === "tight";
    const isDivider = variant === "divider";
    const variantClass = isTile
      ? "flex-col items-center justify-center gap-1.5 px-4 py-5 rounded-xl text-center"
      : isTight
        ? "gap-2.5 px-2.5 py-2 rounded-lg"
        : isDivider
          ? "gap-3 px-2 py-3 rounded-none"
          : "gap-3 px-4 py-3 rounded-xl";
    const content = isTile ? (
      <>
        <PlatformIcon platform={link.platform} className="h-5 w-5 flex-shrink-0" color={effAccent} />
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80 w-full text-center truncate">{link.platform}</span>
        <span className="text-[11px] opacity-55 w-full text-center truncate">{display}</span>
      </>
    ) : isTight ? (
      <>
        <PlatformIcon platform={link.platform} className="h-4 w-4 flex-shrink-0" color={effAccent} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider opacity-70">{link.platform}</span>
        <span className="hidden sm:block text-[11px] opacity-50 truncate">{display}</span>
      </>
    ) : (
      <>
        <PlatformIcon platform={link.platform} className="h-4 w-4 flex-shrink-0" color={effAccent} />
        <div className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{link.platform}</span>
          <span className="text-xs opacity-60 truncate w-full text-left">{display}</span>
        </div>
      </>
    );
    return (
      <div
        key={i}
        className={`flex w-full text-sm font-medium ${variantClass}`}
        style={
          isDivider
            ? { borderBottom: `1px solid ${effAccent}16`, color: effAccent }
            : { backgroundColor: `${effAccent}12`, color: effAccent, border: `1px solid ${effAccent}25` }
        }
      >
        {content}
        {editable && !isTile && (
          <button
            type="button"
            onClick={() => removeLink(i)}
            aria-label="Remove link"
            className="ml-auto shrink-0 self-center text-current opacity-50 hover:opacity-100 transition-opacity"
          >
            &times;
          </button>
        )}
      </div>
    );
  };

  const avatarBox = (sizeClass: string) => {
    const lumM = effAccent.match(/(\d+),\s*(\d+),\s*(\d+)/) ?? effAccent.match(/([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
    let initialColor = "#ffffff";
    if (lumM && effAccent.startsWith("#")) {
      const [r, g, b] = [parseInt(lumM[1], 16) / 255, parseInt(lumM[2], 16) / 255, parseInt(lumM[3], 16) / 255];
      const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      initialColor = lum > 0.3 ? "#1c1917" : "#ffffff";
    }
    return (
      <div
        className={`flex items-center justify-center rounded-full font-bold ring-4 ring-black/30 ${sizeClass}`}
        style={{ backgroundColor: effAccent, color: initialColor }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  const effCardBg = theme?.cardBg ?? cardBg;
  const previewCardStyle: React.CSSProperties = {
    color: effTextColor,
    ...(effLayout === "minimal"
      ? {
          background: "transparent",
          boxShadow: "none",
          border: "none",
          padding: "clamp(1.75rem, 5vw, 3rem)",
          ...(effBackground
            ? {
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                backgroundColor: "rgba(9,9,11,0.28)",
              }
            : {}),
        }
      : {
          backgroundColor: effCardBg,
          padding:
            effLayout === "compact" || effLayout === "topbar"
              ? "clamp(0.875rem, 2.5vw, 1.25rem)"
              : effLayout === "editorial"
                ? "clamp(1.75rem, 5vw, 3rem)"
                : "clamp(1.25rem, 4vw, 2rem)",
          ...(effLayout === "glassmorphism"
            ? {
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: `1px solid ${effAccent}22`,
              }
            : {}),
        }),
  };
  const fillStyle = fill ? { height: "100%", justifyContent: "center" } : undefined;

  return (
    <div className={`${showEditor && editable ? "grid gap-6 lg:grid-cols-2" : ""} ${className}`}>
      <div
        className={`relative overflow-hidden rounded-2xl border border-zinc-800/80 min-h-[420px] @container ${fill ? "h-full" : ""}`}
        style={{
          backgroundColor: effBg,
          ...(effBackground
            ? {
                backgroundImage: toBackgroundImage(effBackground),
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "fixed",
              }
            : {}),
        }}
      >
        {badge && (
          <div className="absolute top-3 left-3 z-20 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            {badge}
          </div>
        )}
        <FxOverlay effect={theme?.effect as FxEffect | null} accent={effAccent} />

        {isPolaroid ? (
          <div className={`relative z-10 ${outerClass} px-6 py-10`} style={fillStyle}>
            <div
              className="w-full rounded-sm bg-[#f6f2e7] p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)]"
              style={{ transform: "rotate(-1.25deg)" }}
            >
              <div className="flex justify-center">
                <div className="rotate-2 rounded-sm bg-white p-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)]">
                  <div className="flex h-24 w-24 items-center justify-center rounded-sm font-bold" style={{ color: effAccent }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center font-serif italic tracking-wide text-[#44403c]">{name}</p>
              <p className="text-center text-xs text-[#78716c]">@{handle}</p>
              <p className="mt-3 text-center text-sm leading-relaxed whitespace-pre-wrap text-[#57534e]">{bio}</p>
              <div className="mt-5 flex flex-col gap-2.5">
                {links.map((link, i) => renderLinkItem(link, i, "divider"))}
              </div>
            </div>
          </div>
        ) : isTerminal ? (
          <div className={`relative z-10 ${outerClass} px-6 py-10`} style={{ fontFamily: effFontFamily, ...fillStyle }}>
            <div
              className="w-full overflow-hidden rounded-lg border"
              style={{ borderColor: `${effAccent}30`, backgroundColor: "rgba(6,8,10,0.85)", boxShadow: `0 0 40px -12px ${effAccent}40` }}
            >
              <div className="flex items-center gap-1.5 border-b px-4 py-2.5" style={{ borderColor: `${effAccent}22`, backgroundColor: "rgba(0,0,0,0.3)" }}>
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-[10px] uppercase tracking-widest text-zinc-400">{handle}@bioplatform ~ zsh</span>
              </div>
              <div className="space-y-2.5 px-4 py-5">
                <p className="text-xs text-zinc-400">$ cat whoami.txt</p>
                <p className="text-sm font-semibold text-zinc-100">
                  {name} <span className="font-normal opacity-50">@ {handle}</span>
                </p>
                <p className="text-xs text-zinc-400 opacity-70"># {bio}</p>
                <InteractiveTerminal
                  username={handle}
                  displayName={name}
                  bio={bio}
                  website={null}
                  brand={branding.name}
                  accent={effAccent}
                  text={effTextColor}
                  links={links}
                  noPadding
                  className="pt-2"
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`relative z-10 mx-auto w-full rounded-2xl text-left ${
              isSidebar
                ? "flex flex-col gap-6 @min-[380px]:grid @min-[380px]:grid-cols-[220px_minmax(0,1fr)] @min-[380px]:items-start @min-[380px]:gap-8"
                : isBento
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-12"
                  : ""
            } ${
              isSidebar || effLayout === "wide" || effLayout === "editorial" || effLayout === "bento"
                ? "max-w-5xl"
                : effLayout === "compact" || effLayout === "minimal"
                  ? "max-w-3xl"
                  : "max-w-4xl"
            }`}
            style={{ fontFamily: effFontFamily, ...fillStyle, ...previewCardStyle }}
          >
            {isHero ? (
              <div>
                <div
                  className="w-full"
                  style={{ height: "clamp(5rem, 10vw, 7rem)", background: `linear-gradient(135deg, ${effAccent}3d, ${effAccent}0f)` }}
                />
                <div className="flex flex-col items-center px-6 -mt-12">
                  {avatarBox("h-24 w-24 text-3xl")}
                  <p
                    className="font-extrabold truncate mt-4 text-center"
                    style={{ color: effText, fontSize: "clamp(2rem, 4.5vw, 2.75rem)", letterSpacing: "-0.02em" }}
                  >
                    {name}
                  </p>
                  <p className="text-sm mt-1" style={{ color: effMutedColor }}>@{handle}</p>
                  {bio && (
                    <p className="mt-4 max-w-xl text-sm leading-relaxed whitespace-pre-wrap text-center" style={{ color: `${effText}cc` }}>
                      {bio}
                    </p>
                  )}
                  <div className="mt-6 w-full pb-4">
                    <div className="flex flex-col gap-2.5 w-full">
                      {links.map((link, i) => renderLinkItem(link, i, "row"))}
                    </div>
                  </div>
                </div>
              </div>
            ) : isBento ? (
              <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-12">
                <div
                  className="flex flex-col items-center justify-center rounded-2xl border p-5 text-center sm:col-span-2 lg:col-span-5"
                  style={{ backgroundColor: `${effAccent}0d`, borderColor: `${effAccent}20` }}
                >
                  {avatarBox("h-20 w-20 text-2xl")}
                  <p className="mt-3 text-xl font-bold" style={{ color: effText }}>{name}</p>
                  <p className="text-xs" style={{ color: effMutedColor }}>@{handle}</p>
                </div>
                <div
                  className="flex flex-col justify-center rounded-2xl border p-5 sm:col-span-2 lg:col-span-7"
                  style={{ backgroundColor: `${effAccent}08`, borderColor: `${effAccent}16` }}
                >
                  {bio && <p className="text-sm leading-relaxed" style={{ color: `${effText}cc` }}>{bio}</p>}
                </div>
                <div className="sm:col-span-2 lg:col-span-12">
                  <div className={linkContainerClass}>
                    {links.map((link, i) => renderLinkItem(link, i, "tile"))}
                  </div>
                </div>
              </div>
            ) : isEditorial ? (
              <div className="flex flex-col items-center text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] mb-3" style={{ color: effAccent }}>@{handle}</p>
                {avatarBox("h-24 w-24 text-3xl")}
                <p
                  className="font-extrabold truncate mt-4"
                  style={{ color: effText, fontSize: "clamp(2.25rem, 6vw, 4rem)", letterSpacing: "-0.03em" }}
                >
                  {name}
                </p>
                <div className="mt-7 w-full border-t" style={{ borderColor: `${effAccent}26` }} />
                {bio && (
                  <p className="mt-5 max-w-xl text-sm leading-relaxed whitespace-pre-wrap text-center mx-auto" style={{ color: `${effText}cc` }}>
                    {bio}
                  </p>
                )}
                <div className={linkContainerClass}>
                  {links.map((link, i) => renderLinkItem(link, i, "divider"))}
                </div>
              </div>
            ) : isSidebar ? (
              <>
                <aside className="@min-[380px]:self-start @min-[380px]:sticky @min-[380px]:top-8">
                  <div className="flex flex-col items-center text-center">
                    {avatarBox("h-24 w-24 text-3xl")}
                    <p className="mt-3 text-xl font-bold" style={{ color: effText }}>{name}</p>
                    <p className="text-sm" style={{ color: effMutedColor }}>@{handle}</p>
                  </div>
                  {bio && (
                    <p className="mt-4 w-full text-sm leading-relaxed whitespace-pre-wrap" style={{ color: `${effText}cc` }}>{bio}</p>
                  )}
                </aside>
                <div className="@min-[380px]:min-w-0">
                  <div className={linkContainerClass}>
                    {links.map((link, i) => renderLinkItem(link, i, linkVariant))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {isTopbar ? (
                  <>
                    <div className="flex items-center gap-3 border-b" style={{ borderColor: `${effAccent}22`, paddingBottom: "clamp(0.75rem, 2vw, 1rem)" }}>
                      {avatarBox("h-12 w-12 text-base")}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold" style={{ color: effText }}>{name}</p>
                        <p className="truncate text-xs" style={{ color: effMutedColor }}>@{handle}</p>
                      </div>
                    </div>
                    {bio && <p className="mt-4 w-full text-sm leading-relaxed whitespace-pre-wrap" style={{ color: `${effText}cc` }}>{bio}</p>}
                    <div className="mt-5 w-full">
                      <div className={linkContainerClass}>
                        {links.map((link, i) => renderLinkItem(link, i, "divider"))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 sm:gap-4">
                      {avatarBox(isCompact ? "h-12 w-12 text-base" : "h-20 w-20 text-2xl")}
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-bold truncate"
                          style={{
                            color: effTextColor,
                            fontSize: isCompact ? "clamp(1rem, 2.5vw, 1.25rem)" : "clamp(1.25rem, 3.5vw, 1.75rem)",
                          }}
                        >
                          {name}
                        </p>
                        <p className="text-xs sm:text-sm truncate" style={{ color: effMutedColor }}>@{handle}</p>
                      </div>
                    </div>
                    {bio && (
                      <p className="mt-4 sm:mt-5 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: `${effTextColor}cc` }}>{bio}</p>
                    )}
                    <div className="mt-6 sm:mt-7 w-full">
                      <div className={linkContainerClass}>
                        {links.map((link, i) => renderLinkItem(link, i, linkVariant))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showEditor && editable && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5">
            <p className="text-sm font-medium text-white mb-4">Sample profile</p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-zinc-400">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400">Handle</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs text-zinc-400">Bio</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5">
            <p className="text-sm font-medium text-white mb-4">Appearance</p>
            <div className="grid grid-cols-3 gap-2.5">
              {PRESET_THEMES.map((t, i) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => pickPreset(i)}
                  className={`rounded-xl p-2.5 transition-all cursor-pointer ${
                    preset === i ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-zinc-950" : "hover:ring-1 hover:ring-zinc-700"
                  }`}
                >
                  <div className="h-12 rounded-lg mb-2" style={{ backgroundColor: t.accent }} />
                  <p className="text-xs font-medium text-white">{t.label}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ColorField label="Background" value={bg} onChange={setBg} disabled={!!theme} />
              <ColorField label="Card" value={cardBg} onChange={setCardBg} disabled={!!theme} />
              <ColorField label="Text" value={text} onChange={setText} disabled={!!theme} />
              <ColorField label="Accent" value={accent} onChange={setAccent} disabled={!!theme} />
            </div>
            <div className="mt-3">
              <label className="block">
                <span className="text-xs text-zinc-400">Background image URL</span>
                <input
                  value={background ?? ""}
                  onChange={(e) => setBackground(e.target.value || null)}
                  disabled={!!theme}
                  placeholder="https://… optional"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none disabled:opacity-40"
                />
              </label>
            </div>
            <div className="mt-4">
              <p className="text-xs text-zinc-400 mb-2">Layout</p>
              <div className="grid grid-cols-3 gap-2">
                {["default", "grid", "compact", "wide", "glassmorphism", "minimal", "sidebar", "editorial", "hero", "bento", "terminal", "polaroid", "topbar"].map((l) => (
                  <button
                    key={l}
                    type="button"
                    disabled={!!theme}
                    onClick={() => setLayout(l)}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium capitalize transition-colors disabled:opacity-40 ${
                      effLayout === l ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-white">Links</p>
              <button
                type="button"
                onClick={() => setShowLinkForm((v) => !v)}
                className="rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-400 hover:bg-violet-500/25 transition-colors"
              >
                + Add
              </button>
            </div>
            {showLinkForm && (
              <div className="mb-3 flex gap-2">
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                >
                  {LINK_PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLink()}
                  placeholder="https://… or @username"
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addLink}
                  className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400 transition-colors"
                >
                  Add
                </button>
              </div>
            )}
            <ul className="space-y-1">
              {links.map((link, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
                  <span className="flex items-center gap-2">
                    <PlatformIcon platform={link.platform} className="h-3.5 w-3.5" color="#a78bfa" />
                    {link.platform} <span className="text-zinc-500">{link.url}</span>
                  </span>
                  <button type="button" onClick={() => removeLink(i)} aria-label="Remove" className="text-zinc-500 hover:text-red-400 transition-colors">
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith("#") ? value : "#7c3aed"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-8 w-8 rounded cursor-pointer border border-zinc-700 bg-zinc-900 disabled:opacity-40"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-violet-500 focus:outline-none disabled:opacity-40"
        />
      </div>
    </label>
  );
}
