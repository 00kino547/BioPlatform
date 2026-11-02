import { useEffect, useState, useRef, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "@/contexts/useAuth";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { platformDisplayNames } from "@/components/ui/platformMeta";
import { SecurityTab } from "@/components/auth/SecurityTab";
import { WebhooksTab } from "@/components/settings/WebhooksTab";
import { DiscordTab } from "@/components/settings/DiscordTab";
import { DataTab } from "@/components/settings/DataTab";
import { InvitesTab } from "@/components/settings/InvitesTab";
import { AffiliateTab } from "@/components/settings/AffiliateTab";
import { BillingTab } from "@/components/settings/BillingTab";
import { DomainTab } from "@/components/settings/DomainTab";
import { NewsletterManager } from "@/components/newsletter/NewsletterManager";
import { TipsTab } from "@/components/tips/TipsTab";
import { ShopTab } from "@/components/shop/ShopTab";
import { PurchasesTab } from "@/components/shop/PurchasesTab";
import { AppFooter } from "@/components/layout/AppFooter";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
import { useInstanceConfig } from "@/lib/useInstanceConfig";
import { formatDate, formatTime, formatNumber, formatDateTime } from "@/lib/intl";
import { api, FX_EFFECTS, type Profile, type AnalyticsData, type EmailNotificationSettings, type MusicSettings, type MusicProvider, type MusicTrack, type Badge, type SocialLink, type TerminalCommand, type LayoutName, type FeatureFlags } from "@/lib/api";
import { BadgePill } from "@/components/ui/BadgePill";
import { ImageCropper } from "@/components/ui/ImageCropper";
import { LayoutSelector } from "@/components/ui/LayoutSelector";
import { BackgroundSelector } from "@/components/ui/BackgroundSelector";
import { SectionCard, Toggle } from "@/components/ui/dashboard";
import { LockedFeature } from "@/components/ui/LockedFeature";
import { tabBtn } from "@/components/ui/dashboard-tokens";
import {
  Camera,
  Save,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  MapPin,
  Globe,
  BarChart3,
  Eye as EyeIcon,
  MousePointerClick,
  Send,
  CheckCircle,
  XCircle,
  Check,
  X,
  Music,
  Upload,
  ChevronUp,
  ChevronDown,
  Pencil,
  ExternalLink,
  Layers,
  Star,
  Link2,
  Lock,
  Crown,
  Image,
  GripVertical,
  Medal,
  Loader2,
  Sparkles,
  Terminal as TerminalIcon,
  QrCode,
  Download,
  CircleDot,
  Clock,
  Timer,
  Building2,
  Construction,
  AtSign,
} from "lucide-react";

const LINK_ICON_EMOJI = ["🔥", "💫", "⭐", "🎮", "🎵", "📺", "📍", "💬", "🚀", "🎯", "💼", "🎨", "📷", "🌐", "🤝", "💎"];

const platforms = [
  "Twitter",
  "GitHub",
  "YouTube",
  "Twitch",
  "Discord",
  "TikTok",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "Spotify",
  "GitLab",
  "Reddit",
  "Pinterest",
  "Snapchat",
  "Threads",
  "Bluesky",
  "Mastodon",
  "WhatsApp",
  "Telegram",
  "Signal",
  "Kick",
  "Steam",
  "SoundCloud",
  "Email",
];

const themePresets = [
  {
    name: "Midnight",
    bg: "#09090b",
    cardBg: "rgba(24,24,27,0.6)",
    text: "#e4e4e7",
    accent: "#7c3aed",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Ocean",
    bg: "#0c1222",
    cardBg: "rgba(15,23,42,0.7)",
    text: "#e2e8f0",
    accent: "#0ea5e9",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Sunset",
    bg: "#1a0a0a",
    cardBg: "rgba(45,10,10,0.6)",
    text: "#fef2f2",
    accent: "#f97316",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Forest",
    bg: "#0a1a0f",
    cardBg: "rgba(10,30,15,0.6)",
    text: "#ecfdf5",
    accent: "#22c55e",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Lavender",
    bg: "#130d1a",
    cardBg: "rgba(30,20,40,0.6)",
    text: "#f3e8ff",
    accent: "#a855f7",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Rose",
    bg: "#1a0a14",
    cardBg: "rgba(40,15,30,0.6)",
    text: "#fdf2f8",
    accent: "#ec4899",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Arctic",
    bg: "#f8fafc",
    cardBg: "rgba(241,245,249,0.8)",
    text: "#1e293b",
    accent: "#6366f1",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Minimal",
    bg: "#ffffff",
    cardBg: "rgba(255,255,255,0.9)",
    text: "#18181b",
    accent: "#18181b",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "free" as const,
  },
  {
    name: "Aurora",
    bg: "#071426",
    cardBg: "rgba(10,25,45,0.65)",
    text: "#e0f2fe",
    accent: "#22d3ee",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "premium" as const,
  },
  {
    name: "Royal",
    bg: "#0b0712",
    cardBg: "rgba(28,17,42,0.65)",
    text: "#f5f3ff",
    accent: "#a78bfa",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "premium" as const,
  },
  {
    name: "Golden",
    bg: "#120d04",
    cardBg: "rgba(35,28,10,0.6)",
    text: "#fffbeb",
    accent: "#f59e0b",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "premium" as const,
  },
  {
    name: "Obsidian",
    bg: "#05060a",
    cardBg: "rgba(16,18,26,0.7)",
    text: "#eef2ff",
    accent: "#34d399",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "enterprise" as const,
  },
  {
    name: "Nebula",
    bg: "#0a0614",
    cardBg: "rgba(30,10,45,0.6)",
    text: "#fae8ff",
    accent: "#d946ef",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "enterprise" as const,
  },
  {
    name: "Pearl",
    bg: "#f4f1eb",
    cardBg: "rgba(255,255,255,0.85)",
    text: "#1c1917",
    accent: "#b45309",
    fontFamily: "Inter, system-ui, sans-serif",
    tier: "enterprise" as const,
  },
];

function buildDayChart(
  series: { date: string; count: number }[],
  uniqueSeries: { date: string; count: number }[]
): { max: number; days: { date: string; label: string; total: number; unique: number }[] } {
  const allCounts = [...series.map((d) => d.count), ...uniqueSeries.map((d) => d.count)];
  const max = Math.max(...allCounts, 1);
  const days: { date: string; label: string; total: number; unique: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    days.push({
      date: dateStr,
      label: formatDate(`${dateStr}T00:00:00`, { month: "short", day: "numeric" }),
      total: series.find((v) => v.date === dateStr)?.count ?? 0,
      unique: uniqueSeries.find((v) => v.date === dateStr)?.count ?? 0,
    });
  }
  return { max, days };
}

function buildHourChart(
  series: { hour: string; count: number }[],
  uniqueSeries: { hour: string; count: number }[]
): { max: number; hours: { hour: string; label: string; total: number; unique: number }[] } {
  const allCounts = [...series.map((d) => d.count), ...uniqueSeries.map((d) => d.count)];
  const max = Math.max(...allCounts, 1);
  const hours: { hour: string; label: string; total: number; unique: number }[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourStr = d.toISOString().slice(0, 13) + ":00:00";
    hours.push({
      hour: hourStr,
      label: formatTime(d, { hour: "numeric", hour12: false }),
      total: series.find((v) => v.hour && v.hour.startsWith(hourStr.slice(0, 13)))?.count ?? 0,
      unique: uniqueSeries.find((v) => v.hour && v.hour.startsWith(hourStr.slice(0, 13)))?.count ?? 0,
    });
  }
  return { max, hours };
}

type DashboardTab =
  | "profiles"
  | "profile"
  | "links"
  | "appearance"
  | "analytics"
  | "email"
  | "tips"
  | "shop"
  | "purchases"
  | "music"
  | "billing"
  | "security"
  | "webhooks"
  | "data"
  | "discord"
  | "invites"
  | "enterprise"
  | "domain"
  | "affiliate";

const DASHBOARD_TABS: DashboardTab[] = [
  "profiles",
  "profile",
  "links",
  "appearance",
  "analytics",
  "email",
  "tips",
  "shop",
  "purchases",
  "music",
  "billing",
  "webhooks",
  "data",
  "discord",
  "invites",
  "enterprise",
  "domain",
  "affiliate",
  "security",
];

export function Dashboard() {
  const { user, logout, refreshUser } = useAuth();
  // Single namespace for every string rendered by this page component.
  const { t } = useTranslation("dashboard");
  const isAdmin = user?.isAdmin === true;
  const apiLevel = user?.apiLevel ?? "basic";
  const hasAdvanced = apiLevel === "advanced" || apiLevel === "enterprise";
  const hasEnterprise = apiLevel === "enterprise";
  const hasCustomDomain = (user?.tier === "PRO" || user?.tier === "ENTERPRISE") && user?.permissions?.includes("profiles.customDomain");

  // Prefer the localized platform name; fall back to the shared display-name map
  // (and finally the raw value) for platforms the locale file does not cover.
  const platformLabel = (p: string): string => {
    const key = `dashboard.platforms.${p.toLowerCase()}`;
    const localized = t(key);
    return localized === key ? (platformDisplayNames[p.toLowerCase()] ?? p) : localized;
  };

  // Theme preset identity stays the English name; only the rendered label is localized.
  const themeLabel = (name: string): string => t(`common:themes.${name.toLowerCase()}`);

  usePageMeta({ title: t("dashboard.meta.title"), description: t("dashboard.meta.description", { name: branding.name }), url: "/dashboard" });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<Badge[]>([]);
  const [limits, setLimits] = useState<{ profiles: number; aliases: number }>({ profiles: 1, aliases: 0 });
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [ownedBadges, setOwnedBadges] = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<DashboardTab>("profile");
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);

  const [profileSlug, setProfileSlug] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [expandedAliasesFor, setExpandedAliasesFor] = useState<string | null>(null);
  const [newAliasSlug, setNewAliasSlug] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  const [aliasMsg, setAliasMsg] = useState("");

  // @username editor (Dashboard → Profile tab): live availability oracle with a
  // debounce, plus a save that is throttled to one rename per 30 days by the API.
  const [usernameInput, setUsernameInput] = useState(user?.username ?? "");
  const [usernameAvailability, setUsernameAvailability] = useState<
    { available: boolean; reason: "reserved" | "taken" | "current" | "available" } | null
  >(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profile = profiles.find((p) => p.id === selectedProfileId) ?? profiles[0] ?? null;

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [presenceStatus, setPresenceStatus] = useState<"online" | "idle" | "offline" | null>(null);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [countdownDate, setCountdownDate] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [hideAds, setHideAds] = useState(false);
  // Adblock-notice gate. FREE profiles always show the notice (server keeps the
  // flag at true), so the toggle only appears for PRO/Enterprise.
  const [adblockDetectorEnabled, setAdblockDetectorEnabled] = useState(true);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [seasonalDecorations, setSeasonalDecorations] = useState(false);
  const [alwaysAllowChristmas, setAlwaysAllowChristmas] = useState(false);
  const [animatedFx, setAnimatedFx] = useState(false);
  const [fxEffect, setFxEffect] = useState("none");
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutName>("default");
  const [terminalCommands, setTerminalCommands] = useState<TerminalCommand[]>([]);

  // Instance ads are opt-out per profile. The toggle only appears while the
  // operator enabled ads; FREE plans can only switch it on when the operator
  // granted that (freeOptOutAllowed) — and can always switch it back off.
  const instance = useInstanceConfig();
  const adsEnabled = Boolean(instance?.ads?.enabled && instance.ads.slots.length > 0);
  const adsOptOutLocked =
    adsEnabled && user?.tier === "FREE" && !(instance?.ads?.freeOptOutAllowed ?? false) && !hideAds;
  const adsOptOutHint = adsOptOutLocked
    ? t("dashboard.editor.adsHints.locked")
    : user?.tier === "FREE"
      ? t("dashboard.editor.adsHints.freeAllowed")
      : t("dashboard.editor.adsHints.hidden");

  // The adblock notice accompanies rendered ads. FREE always shows it; paid
  // plans may turn it off while keeping the ads themselves.
  const adblockNoticeHint =
    user?.tier === "FREE"
      ? t("dashboard.editor.adsHints.freeAdblock")
      : adblockDetectorEnabled
        ? t("dashboard.editor.adsHints.adblockShown")
        : t("dashboard.editor.adsHints.adblockHidden");

  const [newPlatform, setNewPlatform] = useState("Twitter");
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPlatform, setEditPlatform] = useState("Twitter");
  const [editUrl, setEditUrl] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editHeading, setEditHeading] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editShowQr, setEditShowQr] = useState(false);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);
  const [qrLink, setQrLink] = useState<SocialLink | null>(null);
  const iconFileInput = useRef<HTMLInputElement>(null);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const viewsChart = useMemo(
    () => (analytics ? buildDayChart(analytics.viewsByDay, analytics.uniqueViewsByDay) : null),
    [analytics]
  );
  const clicksChart = useMemo(
    () => (analytics ? buildDayChart(analytics.clicksByDay, analytics.uniqueClicksByDay) : null),
    [analytics]
  );
  const hourlyViewsChart = useMemo(
    () => (analytics ? buildHourChart(analytics.viewsByHour, analytics.uniqueViewsByHour) : null),
    [analytics]
  );
  const hourlyClicksChart = useMemo(
    () => (analytics ? buildHourChart(analytics.clicksByHour, analytics.uniqueClicksByHour) : null),
    [analytics]
  );
  const [analyticsResetting, setAnalyticsResetting] = useState<string | null>(null);
  const [analyticsResetMsg, setAnalyticsResetMsg] = useState("");

  const [emailSettings, setEmailSettings] = useState<EmailNotificationSettings>({
    smtpConfigured: false,
    fromEmail: null,
    notifyOnView: false,
    notifyOnClick: false,
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<"success" | "error" | null>(null);
  const [platformAnnouncements, setPlatformAnnouncements] = useState(Boolean(user?.newsletterOptIn));
  const [optInSaving, setOptInSaving] = useState(false);
  const [optInMsg, setOptInMsg] = useState<"saved" | "error" | null>(null);

  const [music, setMusic] = useState<MusicSettings | null>(null);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState("");
  const [musicProvider, setMusicProvider] = useState<MusicProvider>("local");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [musicArtist, setMusicArtist] = useState("");
  const [musicFullUrl, setMusicFullUrl] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editFullUrl, setEditFullUrl] = useState("");

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && (DASHBOARD_TABS as string[]).includes(tabParam)) {
      setTab(tabParam as DashboardTab);
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const navKey = () => `bioplatform:dashboard:nav:${user?.id ?? "anon"}`;

  const saveNavState = (nextTab: DashboardTab, scrollY: number) => {
    try {
      sessionStorage.setItem(navKey(), JSON.stringify({ tab: nextTab, scrollY }));
    } catch {
      /* storage unavailable: skip */
    }
  };

  useEffect(() => {
    if (!user) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(navKey());
    } catch {
      /* ignore */
    }
    if (raw) {
      const saved = JSON.parse(raw) as { tab?: string; scrollY?: number };
      if (saved.tab && (DASHBOARD_TABS as string[]).includes(saved.tab)) setTab(saved.tab as DashboardTab);
      if (typeof saved.scrollY === "number") {
        requestAnimationFrame(() => window.scrollTo(0, saved.scrollY ?? 0));
      }
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        saveNavState(tab, window.scrollY);
      }, 150);
    };
    const onLeave = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      saveNavState(tab, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
      if (timer) clearTimeout(timer);
    };
  }, [tab, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfiles = async () => {
    const res = await api.getMyProfiles();
    if (res.success && res.data) {
      const data = res.data;
      setProfiles(data.profiles);
      setLimits(data.limits);
      setPrimaryId(data.primaryId);
      setOwnedBadges(data.ownedBadges ?? []);
      setSelectedProfileId((prev) =>
        prev && data.profiles.some((p) => p.id === prev) ? prev : (data.primaryId ?? data.profiles[0]?.id ?? null)
      );
    }
  };

  useEffect(() => {
    refreshProfiles().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.getBadges().then((res) => {
      if (res.success && res.data) setBadgeCatalog(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getFeatures().then((res) => {
      if (res.success && res.data) setFeatures(res.data);
    }).catch(() => {});
  }, []);

  const [formProfileId, setFormProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.id === formProfileId) return;
    setFormProfileId(profile.id);
    setDisplayName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
    setLocation(profile.location ?? "");
    setWebsite(profile.website ?? "");
    setPresenceStatus(profile.presenceStatus ?? null);
    setCountdownLabel(profile.countdown?.label ?? "");
    setCountdownDate(profile.countdown?.targetDate ? new Date(profile.countdown.targetDate).toISOString().slice(0, 16) : "");
    setIsPublic(profile.isPublic);
    setHideAds(profile.hideAds ?? false);
    setAdblockDetectorEnabled(profile.adblockDetectorEnabled ?? true);
    setSocialLinks(profile.socialLinks ?? []);
    setSelectedTheme(
      profile.theme
        ? themePresets.find((t) => t.bg === profile.theme!.bg && t.accent === profile.theme!.accent)?.name ?? null
        : null
    );
    setSeasonalDecorations(!!profile.theme?.seasonalDecorations);
    setAlwaysAllowChristmas(!!profile.theme?.alwaysAllowChristmas);
    setAnimatedFx(!!profile.theme?.animatedFx);
    setFxEffect(profile.theme?.effect ?? "none");
    setBackgroundImage(profile.theme?.backgroundImage ?? null);
    setLayout((profile.theme?.layout as LayoutName) ?? "default");
    setTerminalCommands(profile.terminalCommands ?? []);
    setAnalytics(null);
    setMusic(null);
    setUploadError("");
    setSaveError("");
  }, [profile, formProfileId]);

  useEffect(() => {
    if (tab === "analytics" && !analytics && profile) {
      setAnalyticsLoading(true);
      api.getAnalytics(profile.id).then((res) => {
        if (res.success && res.data) {
          setAnalytics(res.data);
        }
        setAnalyticsLoading(false);
      });
    }
  }, [tab, analytics, profile]);

  const handleResetAnalytics = async (slug?: string) => {
    if (!profile) return;
    if ((slug && !confirm(t("dashboard.analytics.resetConfirm", { slug }))) ||
        (!slug && !confirm(t("dashboard.analytics.resetConfirmAll")))) {
      return;
    }
    setAnalyticsResetting(slug ?? "*");
    setAnalyticsResetMsg("");
    const res = await api.resetAnalytics(profile.id, slug);
    setAnalyticsResetting(null);
    if (res.success && res.data) {
      setAnalytics(null);
      setAnalyticsLoading(true);
      const fresh = await api.getAnalytics(profile.id);
      if (fresh.success && fresh.data) setAnalytics(fresh.data);
      setAnalyticsLoading(false);
      setAnalyticsResetMsg(slug ? t("dashboard.analytics.resetDoneSlug", { slug }) : t("dashboard.analytics.resetDone"));
      setTimeout(() => setAnalyticsResetMsg(""), 2500);
    } else {
      setAnalyticsResetMsg(res.error ?? t("dashboard.analytics.resetFailed"));
    }
  };

  useEffect(() => {
    if (tab === "email" && profile) {
      api.getEmailSettings(profile.id).then((res) => {
        if (res.success && res.data) {
          setEmailSettings(res.data);
        }
      });
      // Hydrate the opt-in toggle from the fresh /auth/me payload (on a page
      // refresh AuthContext re-fetches the user, so this keeps the switch in
      // sync with the real DB value instead of the initial `user` snapshot).
      api.me().then((res) => {
        if (res.success && res.data) {
          setPlatformAnnouncements(Boolean(res.data.newsletterOptIn));
        }
      });
    }
  }, [tab, profile]);

  useEffect(() => {
    if (tab === "music" && !music && profile) {
      setMusicLoading(true);
      api.getMusic(profile.id).then((res) => {
        if (res.success && res.data) {
          setMusic(res.data);
        }
        setMusicLoading(false);
      });
    }
  }, [tab, music, profile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");

    const baseTheme = selectedTheme
      ? themePresets.find((t) => t.name === selectedTheme) ?? null
      : null;

    const themeData = baseTheme
      ? {
          ...baseTheme,
          seasonalDecorations,
          alwaysAllowChristmas,
          animatedFx,
          ...(fxEffect !== "none" ? { effect: fxEffect } : {}),
          layout: layout === "default" ? null : layout,
          ...(backgroundImage ? { backgroundImage } : {}),
        }
      : {
          seasonalDecorations,
          alwaysAllowChristmas,
          animatedFx,
          ...(fxEffect !== "none" ? { effect: fxEffect } : {}),
          layout: layout === "default" ? null : layout,
          ...(backgroundImage ? { backgroundImage } : {}),
        };

    const normalizedCommands: TerminalCommand[] = terminalCommands
      .filter((c) => c.command.trim() && c.output.trim())
      .map((c) => ({
        command: c.command.trim().toLowerCase(),
        output: c.output.trim(),
        description: c.description?.trim() ? c.description.trim() : undefined,
        url: c.url?.trim() ? c.url.trim() : undefined,
      }));

    const res = await api.updateProfile({
      displayName: displayName || null,
      bio: bio || null,
      location: location || null,
      website: website || null,
      presenceStatus: presenceStatus ?? null,
      ...(countdownDate && !isNaN(new Date(countdownDate).getTime())
        ? { countdown: { label: countdownLabel.trim() || undefined, targetDate: new Date(countdownDate).toISOString() } }
        : { countdown: null }),
      socialLinks: socialLinks.length > 0 ? socialLinks : null,
      ...(user?.tier !== "FREE" || normalizedCommands.length > 0
        ? { terminalCommands: normalizedCommands.length > 0 ? normalizedCommands : null }
        : {}),
      theme: themeData,
      isPublic,
      hideAds,
      adblockDetectorEnabled,
    }, profile.id);
    setSaving(false);

    if (res.success && res.data) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...(res.data as Profile), aliases: p.aliases } : p))
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setSaveError(res.error ?? t("dashboard.toasts.profileSaveFailed"));
    }
  };

  const updateTerminalCommand = (idx: number, field: "command" | "output" | "description" | "url", value: string) => {
    setTerminalCommands((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };
  const removeTerminalCommand = (idx: number) => {
    setTerminalCommands((prev) => prev.filter((_, i) => i !== idx));
  };
  const addTerminalCommand = () => {
if (terminalCommands.length >= 12) return;
setTerminalCommands((prev) => [...prev, { command: "", output: "", description: "", url: "" }]);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    e.target.value = "";
    setUploadError("");
    setAvatarCropFile(file);
  };

  const confirmAvatarCrop = async (file: File) => {
    if (!profile) return;
    setAvatarCropFile(null);
    setUploadError("");
    const res = await api.uploadAvatar(file, profile.id);
    if (res.success && res.data) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, avatar: res.data!.avatar } : p))
      );
    } else {
      setUploadError(res.error ?? t("dashboard.toasts.avatarUploadFailed"));
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadError("");
    const res = await api.uploadBanner(file, profile.id);
    if (res.success && res.data) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, banner: res.data!.banner } : p))
      );
    } else {
      setUploadError(res.error ?? t("dashboard.toasts.bannerUploadFailed"));
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile) return;
    setUploadError("");
    const res = await api.removeAvatar(profile.id);
    if (res.success) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, avatar: null } : p))
      );
    } else {
      setUploadError(res.error ?? t("dashboard.toasts.avatarRemoveFailed"));
    }
  };

  const handleRemoveBanner = async () => {
    if (!profile) return;
    setUploadError("");
    const res = await api.removeBanner(profile.id);
    if (res.success) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, banner: null } : p))
      );
    } else {
      setUploadError(res.error ?? t("dashboard.toasts.bannerRemoveFailed"));
    }
  };

  const normalizeLinkUrl = (platform: string, raw: string): { url?: string; error?: string } => {
    let url = raw.trim();
    const platformLower = platform.toLowerCase();
    if (platformLower === "email") {
      if (!url.startsWith("mailto:")) {
        url = `mailto:${url}`;
      }
    } else if (platformLower === "discord") {
      let candidate = url;
      if (!/^https?:\/\//i.test(candidate) && /^discord\.(gg|com|app)\//i.test(candidate)) {
        candidate = `https://${candidate}`;
      }
      if (/^https?:\/\//i.test(candidate)) {
        try {
          const parsed = new URL(candidate);
          const h = parsed.hostname.toLowerCase();
          const isInvite =
            (h === "discord.gg" || h.endsWith(".discord.gg") || h === "discord.com" || h === "discordapp.com") &&
            (/^\/invite\/.+/.test(parsed.pathname) ||
              (h === "discord.gg" && /^\/.+/.test(parsed.pathname) && !parsed.pathname.startsWith("/invite")));
          if (!isInvite) {
            return { error: t("dashboard.links.errors.invalidDiscordLink") };
          }
          url = candidate;
        } catch {
          return { error: t("dashboard.links.errors.invalidDiscordUrl") };
        }
      } else {
        if (!/^[a-z0-9_.]{2,32}$/i.test(url) || /\.\./.test(url) || /^\./.test(url) || /\.$/.test(url)) {
          return { error: t("dashboard.links.errors.invalidDiscordUsername") };
        }
      }
} else if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    return { url };
  };

  const resolveQrValue = (link: SocialLink): string => {
    const p = link.platform.toLowerCase();
    if (p === "email") return link.url.startsWith("mailto:") ? link.url : `mailto:${link.url}`;
    if (p === "discord" && !/^https?:\/\//i.test(link.url)) return "";
    return link.url;
  };

  const handleLinkIconUpload = async (file: File) => {
    const res = await api.uploadLinkIcon(file);
    if (res.success && res.data?.image) {
      setEditImage(res.data.image);
      setUploadError("");
    } else {
      setUploadError(res.error ?? t("dashboard.toasts.uploadFailed"));
    }
  };

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleQrDownload = () => {
    if (!qrCanvasRef.current || !qrLink) return;
    const dataUrl = qrCanvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${qrLink.platform.toLowerCase()}-qr.png`;
    a.click();
  };

  const addLink = () => {
    if (!newUrl) return;
    const result = normalizeLinkUrl(newPlatform, newUrl);
    if (result.error) {
      setUploadError(result.error);
      return;
    }
    setUploadError("");
    setSocialLinks([
      ...socialLinks,
      {
        platform: newPlatform,
        url: result.url!,
        ...(newLabel.trim() ? { label: newLabel.trim() } : {}),
      },
    ]);
    setNewUrl("");
    setNewLabel("");
  };

  const removeLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
    setEditingIndex(null);
  };

  const moveLink = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= socialLinks.length) return;
    const next = [...socialLinks];
    [next[index], next[target]] = [next[target], next[index]];
    setSocialLinks(next);
  };

  const startEditLink = (index: number) => {
    setEditPlatform(socialLinks[index].platform);
    setEditUrl(socialLinks[index].url);
    setEditLabel(socialLinks[index].label ?? "");
    setEditHeading(socialLinks[index].heading ?? "");
    setEditIcon(socialLinks[index].icon ?? "");
    setEditImage(socialLinks[index].image ?? "");
    setEditShowQr(!!socialLinks[index].showQr);
    setEditingIndex(index);
  };

  const cancelEditLink = () => {
    setEditingIndex(null);
  };

  const saveEditLink = () => {
    if (editingIndex === null || !editUrl) return;
    const result = normalizeLinkUrl(editPlatform, editUrl);
    if (result.error) {
      setUploadError(result.error);
      return;
    }
    setUploadError("");
    setSocialLinks(
      socialLinks.map((link, i) =>
        i === editingIndex
          ? {
              platform: editPlatform,
              url: result.url!,
              ...(editLabel.trim() ? { label: editLabel.trim() } : {}),
              ...(editHeading.trim() ? { heading: editHeading.trim() } : {}),
              ...(editIcon.trim() ? { icon: editIcon.trim() } : {}),
              ...(editImage ? { image: editImage } : {}),
              showQr: editShowQr,
            }
          : link
      )
    );
    setEditingIndex(null);
  };

  const handleSaveEmail = async () => {
    if (!profile) return;
    setEmailSaving(true);
    setEmailSaved(false);
    const res = await api.updateEmailSettings({
      notifyOnView: emailSettings.notifyOnView,
      notifyOnClick: emailSettings.notifyOnClick,
    }, profile.id);
    setEmailSaving(false);
    if (res.success) {
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 2000);
    }
  };

  const handleTestEmail = async () => {
    if (!profile) return;
    setEmailTesting(true);
    setEmailTestResult(null);
    const res = await api.testEmail(profile.id);
    setEmailTesting(false);
    setEmailTestResult(res.success ? "success" : "error");
    setTimeout(() => setEmailTestResult(null), 3000);
  };

  const toggleOptIn = async (enabled: boolean) => {
    if (optInSaving) return;
    setOptInSaving(true);
    setOptInMsg(null);
    const res = await api.optInNewsletter(enabled);
    if (res.success && res.data) {
      setPlatformAnnouncements(res.data.enabled);
      setOptInMsg("saved");
      // Keep the AuthContext user in sync so other tabs/routes see the new value.
      await refreshUser();
    } else {
      setOptInMsg("error");
    }
    setOptInSaving(false);
    setTimeout(() => setOptInMsg(null), 2500);
  };

  const handleAddMusic = async () => {
    setMusicError("");
    if (!music) return;

    if (music.tracks.length >= music.limit) {
      setMusicError(t("dashboard.toasts.trackLimitReached", { limit: music.limit }));
      return;
    }

    setMusicBusy(true);
    let res;
    if (musicProvider === "local") {
      if (!musicFile) {
        setMusicError(t("dashboard.toasts.chooseAudioFile"));
        setMusicBusy(false);
        return;
      }
      res = await api.uploadMusicTrack(musicFile, musicTitle || undefined, musicArtist || undefined, musicFullUrl || undefined, profile.id);
    } else {
      if (!musicUrl.trim()) {
        setMusicError(t("dashboard.toasts.enterProviderUrl", { provider: musicProvider }));
        setMusicBusy(false);
        return;
      }
      res = await api.addMusicTrack({
        provider: musicProvider,
        title: musicTitle || undefined,
        artist: musicArtist || undefined,
        url: musicUrl.trim(),
        fullUrl: musicFullUrl.trim() || undefined,
      }, profile.id);
    }
    setMusicBusy(false);

    if (res.success && res.data) {
      setMusic((prev) => {
        if (!prev) return prev;
        return { ...prev, tracks: [...prev.tracks, res.data as MusicTrack] };
      });
      setMusicTitle("");
      setMusicArtist("");
      setMusicUrl("");
      setMusicFullUrl("");
      setMusicFile(null);
      const fileInput = document.getElementById("music-file-input") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } else {
      setMusicError(res.error ?? t("dashboard.toasts.trackAddFailed"));
    }
  };

  const handleMoveTrack = async (index: number, dir: -1 | 1) => {
    if (!music) return;
    const target = index + dir;
    if (target < 0 || target >= music.tracks.length) return;

    const next = [...music.tracks];
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((t, i) => (t.position = i));
    setMusic({ ...music, tracks: next });
    await api.reorderMusicTracks(next.map((t) => t.id)).catch(() => {});
  };

  const handleDeleteTrack = async (id: string) => {
    if (!music) return;
    const res = await api.deleteMusicTrack(id);
    if (res.success) {
      setMusic({ ...music, tracks: music.tracks.filter((t) => t.id !== id) });
    } else {
      setMusicError(res.error ?? t("dashboard.toasts.trackRemoveFailed"));
    }
  };

  const startEditTrack = (track: MusicTrack) => {
    setEditingTrackId(track.id);
    setEditTitle(track.title ?? "");
    setEditArtist(track.artist ?? "");
    setEditFullUrl(track.fullUrl ?? "");
  };

  const saveEditTrack = async (id: string) => {
    if (!music) return;
    const res = await api.updateMusicTrack(id, {
      title: editTitle || undefined,
      artist: editArtist || undefined,
      fullUrl: editFullUrl.trim() || null,
    });
    if (res.success && res.data) {
      setMusic({
        ...music,
        tracks: music.tracks.map((t) => (t.id === id ? res.data as MusicTrack : t)),
      });
    } else {
      setMusicError(res.error ?? t("dashboard.toasts.trackUpdateFailed"));
    }
    setEditingTrackId(null);
  };

  const handleCreateProfile = async () => {
    const slug = profileSlug.trim().toLowerCase();
    if (!slug) {
      setProfileMsg(t("dashboard.toasts.enterProfileSlug"));
      return;
    }
    if (profiles.length >= limits.profiles) {
      setProfileMsg(t("dashboard.profiles.limitReached", { limit: limits.profiles }));
      return;
    }
    setProfileBusy(true);
    setProfileMsg("");
    const res = await api.createProfile({ slug, isPublic: true });
    setProfileBusy(false);
    if (res.success && res.data) {
      setProfileMsg(t("dashboard.toasts.profileCreated"));
      setProfileSlug("");
      await refreshProfiles();
      if (res.data) setSelectedProfileId(res.data.id);
    } else {
      setProfileMsg(res.error ?? t("dashboard.toasts.profileCreateFailed"));
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!window.confirm(t("dashboard.toasts.profileDeleteConfirm"))) return;
    const res = await api.deleteProfile(id);
    if (res.success) {
      setSelectedProfileId((prev) => (prev === id ? null : prev));
      await refreshProfiles();
    } else {
      setProfileMsg(res.error ?? t("dashboard.toasts.profileDeleteFailed"));
    }
  };

  const handleSetPrimary = async (id: string) => {
    const res = await api.setPrimaryProfile(id);
    if (res.success) {
      setPrimaryId(id);
      await refreshProfiles();
    } else {
      setProfileMsg(res.error ?? t("dashboard.toasts.setPrimaryFailed"));
    }
  };

  const handleToggleBadge = async (profileId: string, badgeId: string) => {
    const active = profiles.find((p) => p.id === profileId)?.badges?.includes(badgeId) ?? false;
    const res = await api.toggleProfileBadge(profileId, badgeId, !active);
    if (res.success && res.data) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, badges: res.data!.badges } : p))
      );
    } else {
      setProfileMsg(res.error ?? t("dashboard.toasts.badgeUpdateFailed"));
    }
  };

  const [badgeOrderIds, setBadgeOrderIds] = useState<string[]>([]);
  const [badgeOrderBusy, setBadgeOrderBusy] = useState(false);
  const [badgeOrderMsg, setBadgeOrderMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [badgeDragIndex, setBadgeDragIndex] = useState<number | null>(null);

  const profileBadgeIds = profile?.badges;
  const activeProfileId = profile?.id;

  useEffect(() => {
    setBadgeOrderIds(profileBadgeIds?.slice() ?? []);
    setBadgeDragIndex(null);
  }, [profileBadgeIds]);

  useEffect(() => {
    setBadgeOrderMsg(null);
  }, [activeProfileId]);

  const orderedActiveBadges = badgeOrderIds
    .map((id) => badgeCatalog.find((b) => b.id === id))
    .filter((b): b is Badge => Boolean(b));

  const handleBadgeDragStart = (index: number) => (e: React.DragEvent) => {
    setBadgeDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleBadgeDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (badgeDragIndex === null || badgeDragIndex === index) return;
    const next = [...badgeOrderIds];
    const [moved] = next.splice(badgeDragIndex, 1);
    if (!moved) return;
    next.splice(index, 0, moved);
    setBadgeOrderIds(next);
    setBadgeDragIndex(index);
  };

  const handleBadgeDragEnd = () => {
    setBadgeDragIndex(null);
  };

  const saveBadgeOrder = async () => {
    if (!profile) return;
    setBadgeOrderBusy(true);
    setBadgeOrderMsg(null);
    const res = await api.reorderProfileBadges(profile.id, badgeOrderIds);
    setBadgeOrderBusy(false);
    if (res.success && res.data) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, badges: res.data!.badges } : p))
      );
      setBadgeOrderMsg({ type: "success", text: t("dashboard.toasts.badgeOrderSaved") });
    } else {
      setBadgeOrderMsg({ type: "error", text: res.error ?? t("dashboard.toasts.badgeOrderFailed") });
    }
  };

  const loadAliases = async (profileId: string) => {
    const res = await api.getAliases(profileId);
    if (res.success && res.data) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, aliases: res.data! } : p))
      );
    }
  };

  const handleExpandAliases = async (profileId: string) => {
    if (expandedAliasesFor === profileId) {
      setExpandedAliasesFor(null);
      return;
    }
    setAliasMsg("");
    await loadAliases(profileId);
    setExpandedAliasesFor(profileId);
  };

  const handleAddAlias = async (profileId: string) => {
    const slug = newAliasSlug.trim().toLowerCase();
    if (!slug) {
      setAliasMsg(t("dashboard.toasts.aliasSlugRequired"));
      return;
    }
    setAliasBusy(true);
    setAliasMsg("");
    const res = await api.createAlias(profileId, slug);
    setAliasBusy(false);
    if (res.success) {
      setNewAliasSlug("");
      await loadAliases(profileId);
    } else {
      setAliasMsg(res.error ?? t("dashboard.toasts.aliasAddFailed"));
    }
  };

  const handleDeleteAlias = async (profileId: string, aliasId: string) => {
    const res = await api.deleteAlias(profileId, aliasId);
    if (res.success) {
      await loadAliases(profileId);
    } else {
      setAliasMsg(res.error ?? t("dashboard.toasts.aliasRemoveFailed"));
    }
  };

  // Live availability oracle for the @username editor. Debounced so the API's
  // per-IP rate limit (20 checks/min) is never tripped by typing.
  const checkUsername = (value: string) => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    const username = value.trim().toLowerCase();
    const valid = /^[a-z0-9_-]{3,32}$/.test(username);
    setUsernameChecking(false);

    if (!valid || username === (user?.username ?? "").toLowerCase()) {
      setUsernameAvailability(null);
      return;
    }

    setUsernameChecking(true);
    usernameDebounceRef.current = setTimeout(async () => {
      const res = await api.checkUsernameAvailability(username);
      setUsernameChecking(false);
      setUsernameAvailability(
        res.success && res.data ? res.data : { available: false, reason: "available" as const }
      );
    }, 350);
  };

  const handleUsernameChange = async () => {
    const username = usernameInput.trim().toLowerCase();
    setUsernameBusy(true);
    setUsernameMsg(null);
    const res = await api.changeUsername(username);
    setUsernameBusy(false);

    if (res.success && res.data) {
      await refreshUser();
      setProfiles((prev) =>
        prev.map((p) => (p.isPrimary ? { ...p, slug: res.data!.slug } : p))
      );
      setUsernameAvailability(null);
      setUsernameMsg({ kind: "success", text: t("dashboard.toasts.usernameChanged", { username: res.data.username, slug: res.data.slug }) });
    } else {
      setUsernameMsg({ kind: "error", text: res.error ?? t("dashboard.toasts.usernameChangeFailed") });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-zinc-800/80 bg-zinc-900/30">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-base font-bold tracking-tight text-white">
            {branding.name}
          </Link>
          <div className="flex items-center gap-2.5">
            <LanguageSwitcher />
            <a
              href={`/${profile?.slug ?? user?.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-zinc-400 hover:text-violet-400 transition-colors"
            >
              {t("dashboard.header.viewProfile")}
            </a>
            {isAdmin && (
              <Link
                to="/admin"
                className="text-[13px] font-medium text-violet-400 hover:text-violet-300 transition-colors"
              >
                {t("dashboard.header.adminPanel")}
              </Link>
            )}
            <span className="text-[13px] text-zinc-400">{user?.username}</span>
            <Button variant="secondary" size="sm" onClick={logout}>
              {t("dashboard.header.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">{t("dashboard.page.title")}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {new URL(branding.url).host}/{profile?.slug ?? user?.username}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {profiles.length > 1 && (
              <select
                value={profile?.id ?? ""}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName || p.slug} {p.isPrimary ? "★" : ""}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setIsPublic(!isPublic)}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              {isPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {isPublic ? t("dashboard.page.public") : t("dashboard.page.private")}
            </button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? t("dashboard.page.saving") : saved ? t("dashboard.page.saved") : t("dashboard.page.save")}
            </Button>
          </div>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-800/80">
          {DASHBOARD_TABS.map((tabId) => {
            const locked =
              (tabId === "analytics" || tabId === "data" || tabId === "discord") && !hasAdvanced
                ? true
                : tabId === "webhooks" && !hasEnterprise
                  ? true
                  : tabId === "enterprise" && !hasEnterprise
                    ? true
                    : tabId === "domain" && !hasCustomDomain;
            return (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={tabBtn(tab === tabId)}
            >
              {t(`dashboard.tabs.${tabId}`)}
              {locked && <Lock className="h-3 w-3 opacity-70" />}
            </button>
            );
          })}
        </div>

        {uploadError && (
          <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {uploadError}
          </div>
        )}

        {saveError && (
          <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {saveError}
          </div>
        )}

        {tab === "profiles" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
              <div className="flex items-center gap-2.5 mb-3">
                <Layers className="h-5 w-5 text-violet-400" />
                <div>
                  <h3 className="text-sm font-medium text-white">{t("dashboard.profiles.title")}</h3>
                  <p className="text-xs text-zinc-500">
                    {t("dashboard.page.profilesUsed", { used: profiles.length, limit: limits.profiles })} · {primaryId ? t("dashboard.page.primary", { slug: profiles.find((p) => p.id === primaryId)?.slug ?? "" }) : t("dashboard.page.noPrimary")}
                  </p>
                </div>
              </div>

              {profiles.length < limits.profiles && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={profileSlug}
                    onChange={(e) => setProfileSlug(e.target.value)}
                    placeholder={t("dashboard.profiles.createPlaceholder")}
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  <Button onClick={handleCreateProfile} disabled={profileBusy}>
                    <Plus className="h-4 w-4" />
                    {profileBusy ? t("dashboard.profiles.creating") : t("dashboard.profiles.create")}
                  </Button>
                </div>
              )}
              {profiles.length >= limits.profiles && (
                <p className="text-xs text-zinc-500 text-center py-2">
                  {t("dashboard.profiles.limitReached", { limit: limits.profiles })}
                </p>
              )}
            </div>

            {profileMsg && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
                {profileMsg}
              </div>
            )}

            <div className="space-y-4">
              {profiles.map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.slug} className="h-10 w-10 rounded-full object-cover ring-1 ring-zinc-700" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
                          {(p.displayName || p.slug).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {p.displayName || p.slug}
                          {p.isPrimary && (
                            <Star className="inline h-3.5 w-3.5 text-amber-400 ml-1.5 -mt-0.5" />
                          )}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">/{p.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!p.isPrimary && (
                        <Button variant="secondary" size="sm" onClick={() => handleSetPrimary(p.id)}>
                          <Star className="h-3.5 w-3.5" /> {t("dashboard.profiles.setPrimary")}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedProfileId(p.id)}
                      >
                        {t("dashboard.profiles.edit")}
                      </Button>
                      {profiles.length > 1 && (
                        <button
                          onClick={() => handleDeleteProfile(p.id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                          title={t("dashboard.profiles.deleteTitle")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-zinc-400 mb-2">{t("dashboard.profiles.badges")}</p>
                    <div className="flex flex-wrap gap-2">
                      {badgeCatalog.map((badge) => {
                        const owned = ownedBadges.includes(badge.id);
                        const active = p.badges?.includes(badge.id) ?? false;
                        return owned ? (
                          <button
                            key={badge.id}
                            onClick={() => handleToggleBadge(p.id, badge.id)}
                            title={active ? t("dashboard.profiles.removeBadge", { label: badge.label }) : t("dashboard.profiles.addBadge", { label: badge.label })}
                            className={`rounded-full transition-all duration-200 ${
                              active
                                ? "scale-105 ring-2 ring-offset-1 ring-offset-zinc-900"
                                : "opacity-40 grayscale hover:opacity-80 hover:grayscale-0"
                            }`}
                            style={{ border: `1px solid ${badge.color}40` }}
                          >
                            <BadgePill badge={badge} />
                          </button>
                        ) : (
                          <span
                            key={badge.id}
                            className="relative inline-flex cursor-not-allowed rounded-full opacity-40 grayscale"
                            style={{ border: `1px solid ${badge.color}40` }}
                            title={t("dashboard.profiles.badgeNotEarned")}
                          >
                            <BadgePill badge={badge} />
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 ring-1 ring-zinc-600">
                              <Lock className="h-2.5 w-2.5 text-zinc-400" />
                            </span>
                          </span>
                        );
                      })}
                      {badgeCatalog.length === 0 && (
                        <span className="text-xs text-zinc-500">{t("dashboard.profiles.noBadges")}</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-zinc-800/60 pt-4">
                    <button
                      onClick={() => handleExpandAliases(p.id)}
                      className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {t("dashboard.profiles.aliases", { count: p.aliases?.length ?? 0, limit: limits.aliases })}
                      {expandedAliasesFor === p.id ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {expandedAliasesFor === p.id && (
                      <div className="mt-3 space-y-3">
                        {(p.aliases?.length ?? 0) > 0 && (
                          <div className="space-y-2">
                            {p.aliases!.map((a) => (
                              <div key={a.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                                <span className="text-sm text-zinc-300">/{a.slug}</span>
                                <button
                                  onClick={() => handleDeleteAlias(p.id, a.id)}
                                  className="text-zinc-500 hover:text-red-400 transition-colors"
                                  title={t("dashboard.profiles.removeAlias")}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {(p.aliases?.length ?? 0) < limits.aliases ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newAliasSlug}
                              onChange={(e) => setNewAliasSlug(e.target.value)}
                              placeholder={t("dashboard.profiles.aliasPlaceholder")}
                              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                            <Button variant="secondary" size="sm" onClick={() => handleAddAlias(p.id)} disabled={aliasBusy}>
                              <Plus className="h-3.5 w-3.5" />
                              {t("dashboard.profiles.add")}
                            </Button>
                          </div>
                        ) : (
                           <p className="text-xs text-zinc-500">{t("dashboard.profiles.aliasLimitReached", { limit: limits.aliases })}</p>
                        )}
                        {aliasMsg && <p className="text-xs text-red-400">{aliasMsg}</p>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "profile" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
              <div className="flex items-center gap-2.5 mb-3">
                <AtSign className="h-5 w-5 text-violet-400" />
                <div>
                  <h3 className="text-sm font-medium text-white">{t("dashboard.username.title")}</h3>
                  <p className="text-xs text-zinc-500">
                    {t("dashboard.username.description")}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setUsernameInput(value);
                    setUsernameMsg(null);
                    checkUsername(value);
                  }}
                  placeholder={t("dashboard.username.placeholder")}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <Button
                  onClick={handleUsernameChange}
                  disabled={
                    usernameBusy ||
                    !usernameInput.trim() ||
                    usernameInput.trim().toLowerCase() === (user?.username ?? "").toLowerCase()
                  }
                >
                  {usernameBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AtSign className="h-4 w-4" />}
                  {usernameBusy ? t("dashboard.username.saving") : t("dashboard.username.change")}
                </Button>
              </div>

              <div className="mt-3 min-h-[18px]">
                {usernameChecking && <p className="text-xs text-zinc-500">{t("dashboard.username.checking")}</p>}
                {!usernameChecking && usernameAvailability && usernameInput && (
                  usernameAvailability.available ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5" /> {t("dashboard.username.available", { username: usernameInput.trim().toLowerCase() })}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-400 flex items-center gap-1.5">
                      {usernameAvailability.reason === "reserved" && <>{t("dashboard.username.reserved", { username: usernameInput.trim().toLowerCase() })}</>}
                      {usernameAvailability.reason === "taken" && <>{t("dashboard.username.taken", { username: usernameInput.trim().toLowerCase() })}</>}
                      {usernameAvailability.reason === "current" && <>{t("dashboard.username.current")}</>}
                    </p>
                  )
                )}
                {usernameMsg && (
                  usernameMsg.kind === "success" ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" /> {usernameMsg.text}
                    </p>
                  ) : (
                    <p className="text-xs text-red-400 flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5" /> {usernameMsg.text}
                    </p>
                  )
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {t("dashboard.username.rules")}
              </p>
            </div>

            <div className="flex gap-6">
              <div className="flex-shrink-0">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <button
                  onClick={() => avatarInput.current?.click()}
                  className="relative group h-20 w-20 rounded-full overflow-hidden ring-2 ring-zinc-700 hover:ring-violet-500 transition-all"
                >
                  {profile?.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={t("dashboard.editor.avatarAlt")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-zinc-800 flex items-center justify-center text-2xl font-bold text-zinc-400">
                      {(displayName || (user?.username ?? "?")).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                </button>
                {profile?.avatar && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="mt-2 w-full text-xs text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    {t("dashboard.editor.remove")}
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                    {t("dashboard.editor.displayName")}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={user?.username}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("dashboard.editor.bio")}</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t("dashboard.editor.bioPlaceholder")}
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-zinc-500 mt-1">{t("dashboard.editor.bioCount", { count: bio.length })}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("dashboard.editor.location")}
                  </span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("dashboard.editor.locationPlaceholder")}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    {t("dashboard.editor.website")}
                  </span>
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder={t("dashboard.editor.websitePlaceholder")}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <CircleDot className="h-3.5 w-3.5" />
                    {t("dashboard.editor.presenceStatus")}
                  </span>
                </label>
                <select
                  value={presenceStatus ?? ""}
                  onChange={(e) => setPresenceStatus(e.target.value === "" ? null : (e.target.value as "online" | "idle" | "offline"))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">{t("dashboard.editor.presenceOff")}</option>
                  <option value="online">{t("dashboard.editor.presenceOnline")}</option>
                  <option value="idle">{t("dashboard.editor.presenceAway")}</option>
                  <option value="offline">{t("dashboard.editor.presenceOffline")}</option>
                </select>
                <p className="text-xs text-zinc-500 mt-1">{t("dashboard.editor.presenceHint")}</p>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {t("dashboard.editor.countdownLabel")}
                  </span>
                </label>
                <input
                  type="text"
                  value={countdownLabel}
                  onChange={(e) => setCountdownLabel(e.target.value)}
                  placeholder={t("dashboard.editor.countdownLabelPlaceholder")}
                  maxLength={60}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  {t("dashboard.editor.countdownTarget")}
                </span>
              </label>
              <input
                type="datetime-local"
                value={countdownDate}
                onChange={(e) => setCountdownDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <p className="text-xs text-zinc-500 mt-1">{t("dashboard.editor.countdownHint")}</p>
            </div>

            {adsEnabled && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span>
                    <span className="block text-[13px] font-medium text-zinc-200">
                      {t("dashboard.editor.hideAds")}
                    </span>
                    <span className="block text-xs text-zinc-500 mt-0.5">{adsOptOutHint}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={hideAds}
                    disabled={adsOptOutLocked}
                    onChange={(e) => setHideAds(e.target.checked)}
                    className="h-4 w-4 accent-violet-500 disabled:opacity-40"
                  />
                </label>
                {user?.tier !== "FREE" && (
                  <label className="flex cursor-pointer items-center justify-between gap-3 mt-4 pt-4 border-t border-zinc-800/70">
                    <span>
                      <span className="block text-[13px] font-medium text-zinc-200">
                        {t("dashboard.editor.showAdblockNotice")}
                      </span>
                      <span className="block text-xs text-zinc-500 mt-0.5">{adblockNoticeHint}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={adblockDetectorEnabled}
                      onChange={(e) => setAdblockDetectorEnabled(e.target.checked)}
                      className="h-4 w-4 accent-violet-500"
                    />
                  </label>
                )}
              </div>
            )}

            <input
              ref={bannerInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBannerUpload}
            />
            <div>
              <button
                onClick={() => bannerInput.current?.click()}
                className="w-full rounded-2xl border border-dashed border-zinc-700 hover:border-violet-500 bg-zinc-900/30 p-6 text-center transition-colors group"
              >
                {profile?.banner ? (
                  <img
                    src={profile.banner}
                    alt={t("dashboard.editor.bannerAlt")}
                    className="w-full h-32 object-cover rounded-xl mb-3"
                  />
                ) : null}
                <Camera className="h-5 w-5 text-zinc-500 group-hover:text-violet-400 mx-auto mb-2 transition-colors" />
                <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                  {profile?.banner ? t("dashboard.editor.changeBanner") : t("dashboard.editor.uploadBanner")}{" "}
                  <span className="text-zinc-600">{t("dashboard.editor.bannerRecommended")}</span>
                </p>
              </button>
              {profile?.banner && (
                <button
                  onClick={handleRemoveBanner}
                  className="mt-2 w-full text-xs text-red-400/70 hover:text-red-400 transition-colors"
                >
                  {t("dashboard.editor.removeBanner")}
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "links" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {platformLabel(p)}
                  </option>
                ))}
              </select>
              <input
                type={newPlatform.toLowerCase() === "email" || newPlatform.toLowerCase() === "discord" ? "text" : "url"}
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={
                  newPlatform.toLowerCase() === "email" ? t("dashboard.links.placeholderEmail")
                    : newPlatform.toLowerCase() === "discord" ? t("dashboard.links.placeholderDiscord")
                    : t("dashboard.links.placeholderUrl")
                }
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <Button onClick={addLink} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
              }}
              placeholder={t("dashboard.links.labelPlaceholder")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />

            {socialLinks.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">
                {t("dashboard.links.noLinks")}
              </p>
            )}

            {socialLinks.map((link, i) =>
              editingIndex === i ? (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5"
                >
                  <div className="flex gap-2">
                    <select
                      value={editPlatform}
                      onChange={(e) => setEditPlatform(e.target.value)}
                      className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      {platforms.map((p) => (
                        <option key={p} value={p}>
                          {platformLabel(p)}
                        </option>
                      ))}
                    </select>
                    <input
                      type={editPlatform.toLowerCase() === "email" || editPlatform.toLowerCase() === "discord" ? "text" : "url"}
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder={
                        editPlatform.toLowerCase() === "email" ? t("dashboard.links.placeholderEmail")
                          : editPlatform.toLowerCase() === "discord" ? t("dashboard.links.placeholderDiscord")
                          : t("dashboard.links.placeholderUrl")
                      }
                      className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveEditLink();
                        }
                      }}
                      placeholder={t("dashboard.links.labelOptional")}
                      className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <Button onClick={saveEditLink} size="icon">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button onClick={cancelEditLink} size="icon" variant="ghost">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {features?.linksSections && (
                    <input
                      type="text"
                      value={editHeading}
                      onChange={(e) => setEditHeading(e.target.value)}
                      placeholder={t("dashboard.links.headingPlaceholder")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  )}
                  {features?.linksCustomIcons && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {LINK_ICON_EMOJI.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setEditIcon(editIcon === emoji ? "" : emoji)}
                            className={`h-7 w-7 rounded-md text-sm transition-colors ${
                              editIcon === emoji
                                ? "bg-violet-500/30 ring-1 ring-violet-400"
                                : "hover:bg-zinc-700/60"
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                        {(editIcon || editImage) && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditIcon("");
                              setEditImage("");
                            }}
                            className="ml-auto text-xs text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            {t("dashboard.links.clearIcon")}
                          </button>
                        )}
                      </div>
                      {editImage ? (
                        <div className="flex items-center gap-2">
                          <img src={editImage} alt="" className="h-8 w-8 rounded object-contain bg-zinc-800" />
                          {editIcon ? (
                            <span className="text-xs text-zinc-500">{t("dashboard.links.customEmoji", { emoji: editIcon })}</span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editIcon}
                          onChange={(e) => setEditIcon(e.target.value.slice(0, 24))}
                          placeholder={t("dashboard.links.customEmojiPlaceholder")}
                          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                        />
                        <input
                          ref={iconFileInput}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleLinkIconUpload(file);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          onClick={() => iconFileInput.current?.click()}
                          size="sm"
                          variant="secondary"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          <span className="ml-1.5">{t("dashboard.links.image")}</span>
                        </Button>
                      </div>
                    </div>
                  )}
                  {features?.linksQr && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editShowQr}
                        onChange={(e) => setEditShowQr(e.target.checked)}
                        className="accent-violet-500"
                      />
                      <span className="text-xs text-zinc-400">
                        {t("dashboard.links.showQr")}
                      </span>
                    </label>
                  )}
                </div>
              ) : (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveLink(i, -1)}
                        disabled={editingIndex !== null || i === 0}
                        title={t("dashboard.links.moveUp")}
                        className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveLink(i, 1)}
                        disabled={editingIndex !== null || i === socialLinks.length - 1}
                        title={t("dashboard.links.moveDown")}
                        className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {link.image ? (
                        <img src={link.image} alt="" className="h-5 w-5 flex-shrink-0 rounded object-contain bg-zinc-800" />
                      ) : link.icon ? (
                        <span className="h-5 w-5 flex-shrink-0 text-center leading-5 text-base" aria-hidden>
                          {link.icon}
                        </span>
                      ) : (
                        <PlatformIcon platform={link.platform} className="h-4 w-4 flex-shrink-0 text-violet-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-white">
                          {link.label || platformLabel(link.platform)}
                        </p>
                        <p className="text-xs text-zinc-400 truncate max-w-xs">
                          {link.heading ? <span className="text-violet-400">{link.heading} · </span> : null}
                          {platformLabel(link.platform)}
                          {" · "}
                          {link.url.startsWith("mailto:") ? link.url.slice(7) : link.url}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {features?.linksQr && (
                      <button
                        onClick={() => setQrLink(link)}
                        disabled={!resolveQrValue(link)}
                        title={resolveQrValue(link) ? t("dashboard.links.generateQr") : t("dashboard.links.noScannableUrl")}
                        className={resolveQrValue(link) ? "text-zinc-500 hover:text-violet-400 transition-colors" : "text-zinc-700 cursor-not-allowed"}
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => startEditLink(i)}
                      className="text-zinc-500 hover:text-violet-400 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeLink(i)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {tab === "appearance" && (
          <div className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white">{t("dashboard.appearance.themesTitle")}</h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t("dashboard.appearance.themesDescription")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {themePresets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() =>
                      setSelectedTheme(
                        selectedTheme === preset.name ? null : preset.name
                      )
                    }
                    className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                      selectedTheme === preset.name
                        ? "border-violet-500 ring-1 ring-violet-500/30"
                        : "border-zinc-800 hover:border-zinc-600"
                    }`}
                    style={{ backgroundColor: preset.bg }}
                  >
                    {preset.tier !== "free" && (
                      <span
                        className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          preset.tier === "enterprise"
                            ? "bg-amber-400/15 text-amber-300"
                            : "bg-violet-400/15 text-violet-300"
                        }`}
                      >
                        {preset.tier === "enterprise" ? t("common:tiers.enterprise") : t("common:tiers.premium")}
                      </span>
                    )}
                    <div className="flex items-center gap-2.5 mb-3">
                      <div
                        className="h-6 w-6 rounded-full ring-2 ring-white/20"
                        style={{ backgroundColor: preset.accent }}
                      />
                      <span
                        className="text-sm font-medium"
                        style={{ color: preset.text }}
                      >
                        {themeLabel(preset.name)}
                      </span>
                    </div>

                    <div
                      className="rounded-lg p-3 text-center"
                      style={{ backgroundColor: preset.cardBg }}
                    >
                      <div
                        className="mx-auto h-8 w-8 rounded-full mb-2"
                        style={{ backgroundColor: preset.accent }}
                      />
                      <div
                        className="h-2 w-20 mx-auto rounded mb-1"
                        style={{ backgroundColor: preset.text }}
                      />
                      <div
                        className="h-2 w-14 mx-auto rounded"
                        style={{ backgroundColor: `${preset.text}40` }}
                      />
                    </div>

                    <div className="flex gap-1.5 mt-3">
                      {[preset.accent, `${preset.accent}80`, `${preset.accent}40`].map(
                        (c, i) => (
                          <div
                            key={i}
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: c }}
                          />
                        )
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {selectedTheme && (
                <p className="text-xs text-zinc-500 text-center">
                  {t("dashboard.appearance.selected", { theme: themeLabel(selectedTheme) })}
                </p>
              )}
            </div>

            <SectionCard
              icon={<Sparkles className="h-4 w-4 text-violet-400" />}
              title={t("dashboard.appearance.seasonalTitle")}
              desc={t("dashboard.appearance.seasonalDescription")}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{t("dashboard.appearance.enableSeasonal")}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {t("dashboard.appearance.enableSeasonalHint")}
                    </p>
                  </div>
                  <Toggle on={seasonalDecorations} onChange={() => setSeasonalDecorations((v) => !v)} />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{t("dashboard.appearance.alwaysAllowChristmas")}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {t("dashboard.appearance.alwaysAllowChristmasHint")}
                    </p>
                  </div>
                  <Toggle
                    on={alwaysAllowChristmas}
                    onChange={() => setAlwaysAllowChristmas((v) => !v)}
                    onColorClass="bg-red-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{t("dashboard.appearance.animatedTitle")}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {t("dashboard.appearance.animatedDescription")}
                    </p>
                  </div>
                  <Toggle on={animatedFx} onChange={() => setAnimatedFx((v) => !v)} onColorClass="bg-cyan-500" />
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
                  <p className="text-sm font-medium text-white">{t("dashboard.appearance.effect")}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 mb-3">
                    {t("dashboard.appearance.effectDescription")}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {FX_EFFECTS.filter((e) => e !== "none").map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setFxEffect(e)}
                        disabled={!animatedFx}
                        className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                          fxEffect === e
                            ? "bg-cyan-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        {t(`dashboard.appearance.effects.${e}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={<Layers className="h-4 w-4 text-violet-400" />}
              title={t("dashboard.appearance.layoutTitle")}
              desc={t("dashboard.appearance.layoutDescription")}
            >
              <LayoutSelector value={layout} onChange={(l) => setLayout(l ?? "default")} />
            </SectionCard>

            {layout === "terminal" && (
              <SectionCard
                dataTestId="terminal-commands-editor"
                icon={<TerminalIcon className="h-4 w-4 text-violet-400" />}
                title={t("dashboard.appearance.terminalTitle")}
                desc={t("dashboard.appearance.terminalDescription")}
              >
                {user?.tier !== "FREE" ? (
                  <>
                    <div className="space-y-2.5">
                      {terminalCommands.map((cmd, idx) => (
                        <div
                          key={idx}
                          className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                        >
                          <input
                            value={cmd.command}
                            onChange={(e) => updateTerminalCommand(idx, "command", e.target.value)}
                            placeholder={t("dashboard.appearance.commandPlaceholder")}
                            aria-label={t("dashboard.appearance.commandNameAria", { index: idx + 1 })}
                            className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500"
                          />
                          <input
                            value={cmd.output}
                            onChange={(e) => updateTerminalCommand(idx, "output", e.target.value)}
                            placeholder={t("dashboard.appearance.outputPlaceholder")}
                            aria-label={t("dashboard.appearance.commandOutputAria", { index: idx + 1 })}
                            className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500"
                          />
                          <input
                            value={cmd.description ?? ""}
                            onChange={(e) => updateTerminalCommand(idx, "description", e.target.value)}
                            placeholder={t("dashboard.appearance.descriptionPlaceholder")}
                            aria-label={t("dashboard.appearance.commandDescriptionAria", { index: idx + 1 })}
                            className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500"
                          />
                          <input
                            value={cmd.url ?? ""}
                            onChange={(e) => updateTerminalCommand(idx, "url", e.target.value)}
                            placeholder={t("dashboard.appearance.linkPlaceholder")}
                            aria-label={t("dashboard.appearance.commandLinkAria", { index: idx + 1 })}
                            className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeTerminalCommand(idx)}
                            aria-label={t("dashboard.appearance.removeCommandAria", { index: idx + 1 })}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:border-red-500/50 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={addTerminalCommand}
                      disabled={terminalCommands.length >= 12}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-violet-500 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                      {t("dashboard.appearance.addCommand")}
                    </button>

                    <p className="mt-4 text-xs text-zinc-500">
                      {t("dashboard.appearance.terminalHelp")}
                    </p>
                  </>
                ) : (
                  <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-3">
                    <Crown className="h-5 w-5 shrink-0 text-violet-400" />
                    <div>
                      <p className="text-sm font-medium text-white">{t("dashboard.appearance.premiumTitle")}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {t("dashboard.appearance.premiumDescription")}
                      </p>
                    </div>
                  </div>
                )}
                </SectionCard>
            )}

                <SectionCard
                icon={<Medal className="h-4 w-4 text-zinc-500" />}
                title={t("dashboard.appearance.badgeOrderTitle")}
                desc={t("dashboard.appearance.badgeOrderDescription")}
              >
                {profileBadgeIds && profileBadgeIds.length > 0 ? (
                  <>
                    {badgeCatalog.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/40 px-4 py-6 text-center">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                        <p className="text-sm text-zinc-500">{t("dashboard.appearance.loadingBadges")}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                          {orderedActiveBadges.map((badge, index) => (
                            <div
                              key={badge.id}
                              draggable
                              onDragStart={handleBadgeDragStart(index)}
                              onDragOver={handleBadgeDragOver(index)}
                              onDragEnd={handleBadgeDragEnd}
                              onDrop={handleBadgeDragEnd}
                              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all select-none cursor-grab active:cursor-grabbing ${
                                badgeDragIndex === index
                                  ? "border-violet-500/60 bg-violet-500/10 opacity-60 scale-[1.01]"
                                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-600"
                              }`}
                            >
                              <GripVertical className="h-4 w-4 shrink-0 text-zinc-500" />
                              <BadgePill badge={badge} />
                              <span className="ml-auto text-xs text-zinc-500 tabular-nums">
                                {index + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Button onClick={saveBadgeOrder} disabled={badgeOrderBusy}>
                          {badgeOrderBusy ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {t("dashboard.appearance.badgeOrderSaving")}
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4" />
                              {t("dashboard.appearance.save")}
                            </>
                          )}
                        </Button>
                        {badgeOrderMsg && (
                          <p
                            className={`flex items-center gap-1.5 text-sm ${
                              badgeOrderMsg.type === "success"
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {badgeOrderMsg.type === "success" ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            {badgeOrderMsg.text}
                          </p>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">
                        {t("dashboard.appearance.badgeOrderNote")}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/40 px-4 py-8 text-center">
                      <Medal className="h-8 w-8 text-zinc-600" />
                      <p className="mt-4 text-sm font-medium text-zinc-400">
                        {t("dashboard.appearance.noActiveBadges")}
                      </p>
                      <p className="mt-1.5 text-xs text-zinc-600">
                        {t("dashboard.appearance.noActiveBadgesHint")}
                      </p>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  icon={<Image className="h-4 w-4 text-violet-400" />}
                  title={t("dashboard.appearance.backgroundTitle")}
                  desc={t("dashboard.appearance.backgroundDescription")}
                >
                  <BackgroundSelector
                  value={backgroundImage}
                  onChange={(v) => setBackgroundImage(v)}
                  seasonal
                  onUpload={async (file) => {
                    if (!profile) return;
                    const res = await api.uploadProfileBackground(file, profile.id);
                    if (res.success && res.data?.backgroundImage) {
                      setBackgroundImage(res.data.backgroundImage);
                    }
                  }}
                  onRemoveUpload={async () => {
                    if (!profile) return;
                    await api.removeProfileBackground(profile.id);
                    setBackgroundImage(null);
                  }}
                />
            </SectionCard>
          </div>
        )}

        {tab === "analytics" && (
          hasAdvanced ? (
            <div className="space-y-4">
            {analyticsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
              </div>
            ) : analytics ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">{t("dashboard.analytics.dedupeNote")}</p>
                  <div className="flex items-center gap-2">
                    {analyticsResetMsg && <span className="text-xs text-zinc-400">{analyticsResetMsg}</span>}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleResetAnalytics()}
                      disabled={analyticsResetting !== null}
                    >
                      {analyticsResetting === "*" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      {t("dashboard.analytics.resetAll")}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: t("dashboard.analytics.statTotalViews"), sub: t("dashboard.analytics.uniqueCount", { count: analytics.total.uniqueViews }), value: analytics.total.views, icon: EyeIcon },
                    { label: t("dashboard.analytics.statTotalClicks"), sub: t("dashboard.analytics.uniqueCount", { count: analytics.total.uniqueClicks }), value: analytics.total.clicks, icon: MousePointerClick },
                    { label: t("dashboard.analytics.statViews7d"), sub: t("dashboard.analytics.uniqueCount", { count: analytics.last7d.uniqueViews }), value: analytics.last7d.views, icon: BarChart3 },
                    { label: t("dashboard.analytics.statClicks7d"), sub: t("dashboard.analytics.uniqueCount", { count: analytics.last7d.uniqueClicks }), value: analytics.last7d.clicks, icon: BarChart3 },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 group hover:border-zinc-700 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{stat.label}</span>
                        <stat.icon className="h-4 w-4 text-violet-400/80 group-hover:text-violet-400 transition-colors" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{formatNumber(stat.value)}</p>
                      <p className="text-xs text-zinc-500 mt-1.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-medium text-white">{t("dashboard.analytics.views30Title")}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />{t("dashboard.analytics.legendTotal")}</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-sky-400" />{t("dashboard.analytics.legendUnique")}</span>
                    </div>
                  </div>
                  {analytics.viewsByDay.length > 0 || analytics.uniqueViewsByDay.length > 0 ? (
                    <div className="relative flex items-end gap-1 h-56 sm:h-64">
                      <div className="absolute left-0 right-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
                        {[25, 50, 75].map((p) => (
                          <div key={p} className="border-t border-dashed border-zinc-800/80" />
                        ))}
                      </div>
                      {viewsChart?.days.map((day, i) => (
                          <div
                            key={i}
                            className="flex-1 flex flex-col h-full relative group"
                          >
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-center whitespace-nowrap">
                                <p className="text-xs font-semibold text-white">{day.label}</p>
                                <p className="text-xs mt-1"><span className="text-violet-400 font-semibold">{day.total}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipTotal")}</span></p>
                                <p className="text-xs"><span className="text-sky-400 font-semibold">{day.unique}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipUnique")}</span></p>
                              </div>
                              <div className="mx-auto w-2 h-2 bg-zinc-800 border-b border-r border-zinc-700 -mt-1 rotate-45" />
                            </div>
                            <div className="flex-1 flex items-end gap-0.5">
                              <div
                                className="flex-1 rounded-t-md transition-all duration-150 hover:brightness-125"
                                style={{
                                  height: `${(day.total / viewsChart.max) * 100}%`,
                                  minHeight: day.total > 0 ? "6px" : "2px",
                                  background: `linear-gradient(to top, #7c3aed, #a78bfa)`,
                                  opacity: day.total > 0 ? 0.85 : 0.25,
                                }}
                              />
                              <div
                                className="flex-1 rounded-t-md transition-all duration-150 hover:brightness-125"
                                style={{
                                  height: `${(day.unique / viewsChart.max) * 100}%`,
                                  minHeight: day.unique > 0 ? "6px" : "2px",
                                  background: `linear-gradient(to top, #0ea5e9, #38bdf8)`,
                                  opacity: day.unique > 0 ? 0.85 : 0.25,
                                }}
                              />
                            </div>
                            <div className="h-6 flex items-end justify-center">
                              {i % 5 === 0 && (
                                <span className="text-[9px] text-zinc-600 whitespace-nowrap">
                                  {day.label}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 text-center py-8">{t("dashboard.analytics.noViews")}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                    <h3 className="text-sm font-medium text-white mb-3">{t("dashboard.analytics.clicksByPlatform")}</h3>
                    {analytics.clicksByPlatform.length > 0 ? (
                      <div className="space-y-3">
                        {analytics.clicksByPlatform.map((item, idx) => {
                          const max = analytics.clicksByPlatform[0]?.count ?? 1;
                          const unique = analytics.uniqueClicksByPlatform.find((u) => u.platform === item.platform)?.count ?? 0;
                          const colors = ["#a78bfa", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#fb7185", "#60a5fa", "#c084fc"];
                          const barColor = colors[idx % colors.length];
                          return (
                            <div key={item.platform}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center gap-2.5 text-sm text-zinc-200 font-medium">
                                  <PlatformIcon platform={item.platform} className="h-5 w-5" color={barColor} />
                                  {platformLabel(item.platform)}
                                </span>
                                <span className="text-sm text-zinc-300">{item.count} <span className="text-zinc-600">· {t("dashboard.analytics.uniqueCount", { count: unique })}</span></span>
                              </div>
                              <div className="h-4 rounded-full bg-zinc-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-300 hover:brightness-125"
                                  style={{ width: `${(item.count / max) * 100}%`, background: `linear-gradient(to right, ${barColor}99, ${barColor})` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 text-center py-4">{t("dashboard.analytics.noClicks")}</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                    <h3 className="text-sm font-medium text-white mb-3">{t("dashboard.analytics.topReferrers")}</h3>
                    {analytics.topReferrers.length > 0 ? (
                      <div className="space-y-2.5">
                        {analytics.topReferrers.map((item) => (
                          <div key={item.referer} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0">
                            <span className="text-sm text-zinc-300 truncate max-w-[220px]">{item.referer}</span>
                            <span className="text-sm font-medium text-zinc-400">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 text-center py-4">{t("dashboard.analytics.noReferrers")}</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-medium text-white">{t("dashboard.analytics.clicks30Title")}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />{t("dashboard.analytics.legendTotal")}</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />{t("dashboard.analytics.legendUnique")}</span>
                    </div>
                  </div>
                  {analytics.clicksByDay.length > 0 || analytics.uniqueClicksByDay.length > 0 ? (
                    <div className="relative flex items-end gap-1 h-56 sm:h-64">
                      <div className="absolute left-0 right-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
                        {[25, 50, 75].map((p) => (
                          <div key={p} className="border-t border-dashed border-zinc-800/80" />
                        ))}
                      </div>
                      {clicksChart?.days.map((day, i) => (
                          <div
                            key={i}
                            className="flex-1 flex flex-col h-full relative group"
                          >
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-center whitespace-nowrap">
                                <p className="text-xs font-semibold text-white">{day.label}</p>
                                <p className="text-xs mt-1"><span className="text-emerald-400 font-semibold">{day.total}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipTotal")}</span></p>
                                <p className="text-xs"><span className="text-amber-400 font-semibold">{day.unique}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipUnique")}</span></p>
                              </div>
                              <div className="mx-auto w-2 h-2 bg-zinc-800 border-b border-r border-zinc-700 -mt-1 rotate-45" />
                            </div>
                            <div className="flex-1 flex items-end gap-0.5">
                              <div
                                className="flex-1 rounded-t-md transition-all duration-150 hover:brightness-125"
                                style={{
                                  height: `${(day.total / clicksChart.max) * 100}%`,
                                  minHeight: day.total > 0 ? "6px" : "2px",
                                  background: `linear-gradient(to top, #059669, #34d399)`,
                                  opacity: day.total > 0 ? 0.85 : 0.25,
                                }}
                              />
                              <div
                                className="flex-1 rounded-t-md transition-all duration-150 hover:brightness-125"
                                style={{
                                  height: `${(day.unique / clicksChart.max) * 100}%`,
                                  minHeight: day.unique > 0 ? "6px" : "2px",
                                  background: `linear-gradient(to top, #d97706, #fbbf24)`,
                                  opacity: day.unique > 0 ? 0.85 : 0.25,
                                }}
                              />
                            </div>
                            <div className="h-6 flex items-end justify-center">
                              {i % 5 === 0 && (
                                <span className="text-[9px] text-zinc-600 whitespace-nowrap">
                                  {day.label}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 text-center py-8">{t("dashboard.analytics.noClicks")}</p>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-medium text-white">{t("dashboard.analytics.views24Title")}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />{t("dashboard.analytics.legendTotal")}</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-sky-400" />{t("dashboard.analytics.legendUnique")}</span>
                    </div>
                  </div>
                  {hourlyViewsChart && (hourlyViewsChart.hours.some((h) => h.total > 0) || hourlyViewsChart.hours.some((h) => h.unique > 0)) ? (
                    <div className="relative flex items-end gap-1 h-48 sm:h-56 overflow-x-auto">
                      <div className="absolute left-0 right-0 top-0 bottom-4 flex flex-col justify-between pointer-events-none">
                        {[25, 50, 75].map((p) => (
                          <div key={p} className="border-t border-dashed border-zinc-800/80" />
                        ))}
                      </div>
                      {hourlyViewsChart.hours.map((h, i) => (
                        <div key={i} className="flex-1 min-w-[14px] flex flex-col h-full relative group">
                          <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-center whitespace-nowrap">
                              <p className="text-xs font-semibold text-white">{h.label}</p>
                              <p className="text-xs mt-1"><span className="text-violet-400 font-semibold">{h.total}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipTotal")}</span></p>
                              <p className="text-xs"><span className="text-sky-400 font-semibold">{h.unique}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipUnique")}</span></p>
                            </div>
                            <div className="mx-auto w-2 h-2 bg-zinc-800 border-b border-r border-zinc-700 -mt-1 rotate-45" />
                          </div>
                          <div className="flex-1 flex items-end gap-px">
                            <div
                              className="flex-1 rounded-t-sm transition-all duration-150 hover:brightness-125"
                              style={{
                                height: `${(h.total / hourlyViewsChart.max) * 100}%`,
                                minHeight: h.total > 0 ? "4px" : "2px",
                                background: `linear-gradient(to top, #7c3aed, #a78bfa)`,
                                opacity: h.total > 0 ? 0.85 : 0.25,
                              }}
                            />
                            <div
                              className="flex-1 rounded-t-sm transition-all duration-150 hover:brightness-125"
                              style={{
                                height: `${(h.unique / hourlyViewsChart.max) * 100}%`,
                                minHeight: h.unique > 0 ? "4px" : "2px",
                                background: `linear-gradient(to top, #0ea5e9, #38bdf8)`,
                                opacity: h.unique > 0 ? 0.85 : 0.25,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 text-center py-8">{t("dashboard.analytics.noViews24")}</p>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-medium text-white">{t("dashboard.analytics.clicks24Title")}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />{t("dashboard.analytics.legendTotal")}</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />{t("dashboard.analytics.legendUnique")}</span>
                    </div>
                  </div>
                  {hourlyClicksChart && (hourlyClicksChart.hours.some((h) => h.total > 0) || hourlyClicksChart.hours.some((h) => h.unique > 0)) ? (
                    <div className="relative flex items-end gap-1 h-48 sm:h-56 overflow-x-auto">
                      <div className="absolute left-0 right-0 top-0 bottom-4 flex flex-col justify-between pointer-events-none">
                        {[25, 50, 75].map((p) => (
                          <div key={p} className="border-t border-dashed border-zinc-800/80" />
                        ))}
                      </div>
                      {hourlyClicksChart.hours.map((h, i) => (
                        <div key={i} className="flex-1 min-w-[14px] flex flex-col h-full relative group">
                          <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-center whitespace-nowrap">
                              <p className="text-xs font-semibold text-white">{h.label}</p>
                              <p className="text-xs mt-1"><span className="text-emerald-400 font-semibold">{h.total}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipTotal")}</span></p>
                              <p className="text-xs"><span className="text-amber-400 font-semibold">{h.unique}</span> <span className="text-zinc-500">{t("dashboard.analytics.tooltipUnique")}</span></p>
                            </div>
                            <div className="mx-auto w-2 h-2 bg-zinc-800 border-b border-r border-zinc-700 -mt-1 rotate-45" />
                          </div>
                          <div className="flex-1 flex items-end gap-px">
                            <div
                              className="flex-1 rounded-t-sm transition-all duration-150 hover:brightness-125"
                              style={{
                                height: `${(h.total / hourlyClicksChart.max) * 100}%`,
                                minHeight: h.total > 0 ? "4px" : "2px",
                                background: `linear-gradient(to top, #059669, #34d399)`,
                                opacity: h.total > 0 ? 0.85 : 0.25,
                              }}
                            />
                            <div
                              className="flex-1 rounded-t-sm transition-all duration-150 hover:brightness-125"
                              style={{
                                height: `${(h.unique / hourlyClicksChart.max) * 100}%`,
                                minHeight: h.unique > 0 ? "4px" : "2px",
                                background: `linear-gradient(to top, #d97706, #fbbf24)`,
                                opacity: h.unique > 0 ? 0.85 : 0.25,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 text-center py-8">{t("dashboard.analytics.noClicks24")}</p>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                  <h3 className="text-sm font-medium text-white mb-4">{t("dashboard.analytics.clicksByLink")}</h3>
                  {analytics.clicksByLink.length > 0 ? (
                    <div className="space-y-3">
                      {analytics.clicksByLink.map((item) => {
                        const unique = analytics.uniqueClicksByLink.find((u) => u.slug === item.slug)?.uniqueCount ?? 0;
                        return (
                          <div
                            key={`${item.platform}|${item.slug}`}
                            className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-zinc-200 font-medium truncate">{item.slug}</p>
                              <p className="text-xs text-zinc-500">
                                {platformLabel(item.platform)}
                                {item.lastClickedAt ? ` · ${t("dashboard.analytics.lastClicked", { date: formatDateTime(item.lastClickedAt) })}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-zinc-300"><span className="text-emerald-400 font-semibold">{item.count}</span> <span className="text-zinc-600">{t("dashboard.analytics.clicks")}</span></span>
                              <span className="text-zinc-400"><span className="text-amber-400 font-semibold">{unique}</span> <span className="text-zinc-600">{t("dashboard.analytics.tooltipUnique")}</span></span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("dashboard.analytics.resetLabel", { slug: item.slug })}
                              disabled={analyticsResetting !== null}
                              onClick={() => void handleResetAnalytics(item.slug)}
                            >
                              {analyticsResetting === item.slug ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500 text-center py-4">{t("dashboard.analytics.noClicks")}</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-12">{t("dashboard.analytics.noData")}</p>
            )}
            </div>
          ) : (
            <LockedFeature feature="Analytics" required="premium" onAction={() => setTab("billing")} />
          )
        )}

        {tab === "music" && (
          <div className="space-y-4">
            {musicLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
              </div>
            ) : music ? (
              <>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <Music className="h-5 w-5 text-violet-400" />
                      <div>
                        <h3 className="text-sm font-medium text-white">{t("dashboard.music.title")}</h3>
                        <p className="text-xs text-zinc-500">
                          {t("dashboard.music.tracksUsed", { used: music.tracks.length, limit: music.limit, tier: music.tier })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {music.tracks.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-8">
                      {t("dashboard.music.noTracks")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {music.tracks.map((track, i) => (
                        <div
                          key={track.id}
                          className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                        >
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleMoveTrack(i, -1)}
                              disabled={i === 0}
                              className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveTrack(i, 1)}
                              disabled={i === music.tracks.length - 1}
                              className="text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex-1 min-w-0">
                            {editingTrackId === track.id ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  placeholder={t("dashboard.music.editTitlePlaceholder")}
                                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                <input
                                  type="text"
                                  value={editArtist}
                                  onChange={(e) => setEditArtist(e.target.value)}
                                  placeholder={t("dashboard.music.editArtistPlaceholder")}
                                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                <input
                                  type="text"
                                  value={editFullUrl}
                                  onChange={(e) => setEditFullUrl(e.target.value)}
                                  placeholder={t("dashboard.music.editFullUrlPlaceholder")}
                                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => saveEditTrack(track.id)}
                                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                                  >
                                    {t("dashboard.music.save")}
                                  </button>
                                  <button
                                    onClick={() => setEditingTrackId(null)}
                                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                  >
                                    {t("dashboard.music.cancel")}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm font-medium text-white truncate">
                                  {track.title ?? (track.provider === "local" ? t("dashboard.music.localTrack") : track.provider)}
                                </p>
                                <p className="text-xs text-zinc-500 truncate">
                                  {track.artist ? t("dashboard.music.artistWithSeparator", { artist: track.artist }) : ""}
                                  <span className="uppercase text-[10px]">{track.provider}</span>
                                </p>
                              </>
                            )}
                          </div>

                          {editingTrackId !== track.id && (
                            <>
                              <button
                                onClick={() => startEditTrack(track)}
                                className="text-zinc-500 hover:text-violet-400 transition-colors"
                                title={t("dashboard.music.edit")}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <a
                                href={track.provider === "local" ? track.filePath ?? undefined : track.url ?? undefined}
                                target={track.provider === "local" ? undefined : "_blank"}
                                rel="noopener noreferrer"
                                className="text-zinc-500 hover:text-violet-400 transition-colors"
                                title={t("dashboard.music.open")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                              <button
                                onClick={() => handleDeleteTrack(track.id)}
                                className="text-zinc-500 hover:text-red-400 transition-colors"
                                title={t("dashboard.music.remove")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {music.tracks.length < music.limit && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                    <h3 className="text-sm font-medium text-white mb-3">{t("dashboard.music.addTrackTitle")}</h3>

                    <div className="flex gap-2 mb-4">
                      {(["local", "spotify", "youtube"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setMusicProvider(p);
                            setMusicError("");
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                            musicProvider === p
                              ? "bg-violet-600 text-white"
                              : "bg-zinc-800 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    {musicProvider === "local" ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                            {t("dashboard.music.audioFile")} <span className="text-zinc-500">{t("dashboard.music.audioFileHint")}</span>
                          </label>
                          <input
                            id="music-file-input"
                            type="file"
                            accept=".mp3,.opus,.ogg,.wav,.m4a,.flac,.aac,.webm,.oga,audio/*"
                            onChange={(e) => setMusicFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-500 file:cursor-pointer cursor-pointer"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("dashboard.music.titleLabel")}</label>
                            <input
                              type="text"
                              value={musicTitle}
                              onChange={(e) => setMusicTitle(e.target.value)}
                              placeholder={t("dashboard.music.titlePlaceholder")}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("dashboard.music.artistLabel")}</label>
                            <input
                              type="text"
                              value={musicArtist}
                              onChange={(e) => setMusicArtist(e.target.value)}
                              placeholder={t("dashboard.music.artistPlaceholder")}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                            {t("dashboard.music.fullVersionUrl")} <span className="text-zinc-500">{t("dashboard.music.optional")}</span>
                          </label>
                          <input
                            type="url"
                            value={musicFullUrl}
                            onChange={(e) => setMusicFullUrl(e.target.value)}
                            placeholder={t("dashboard.music.fullUrlPlaceholder")}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            <Trans ns="dashboard" i18nKey="dashboard.music.fullUrlNote" components={{ 0: <a href="/terms" className="text-violet-400 hover:text-violet-300" /> }} />
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                            {musicProvider === "spotify" ? t("dashboard.music.spotifyUrl") : t("dashboard.music.youtubeUrl")}
                          </label>
                          <input
                            type="url"
                            value={musicUrl}
                            onChange={(e) => setMusicUrl(e.target.value)}
                            placeholder={
                              musicProvider === "spotify"
                                ? t("dashboard.music.spotifyPlaceholder")
                                : t("dashboard.music.youtubePlaceholder")
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                              {t("dashboard.music.titleLabel")} <span className="text-zinc-500">{t("dashboard.music.optional")}</span>
                            </label>
                            <input
                              type="text"
                              value={musicTitle}
                              onChange={(e) => setMusicTitle(e.target.value)}
                              placeholder={t("dashboard.music.titlePlaceholder")}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                              {t("dashboard.music.artistLabel")} <span className="text-zinc-500">{t("dashboard.music.optional")}</span>
                            </label>
                            <input
                              type="text"
                              value={musicArtist}
                              onChange={(e) => setMusicArtist(e.target.value)}
                              placeholder={t("dashboard.music.artistPlaceholder")}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        {musicProvider === "spotify" && (
                          <div>
                            <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">
                              {t("dashboard.music.fullVersionUrl")} <span className="text-zinc-500">{t("dashboard.music.optional")}</span>
                            </label>
                            <input
                              type="url"
                              value={musicFullUrl}
                              onChange={(e) => setMusicFullUrl(e.target.value)}
                              placeholder={t("dashboard.music.fullUrlPlaceholder")}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                            <p className="mt-1 text-xs text-zinc-500">
                              <Trans ns="dashboard" i18nKey="dashboard.music.spotifyNote" components={{ 0: <a href="/terms" className="text-violet-400 hover:text-violet-300" /> }} />
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-4">
                      <Button onClick={handleAddMusic} disabled={musicBusy}>
                        <Upload className="h-4 w-4" />
                        {musicBusy ? t("dashboard.music.adding") : t("dashboard.music.add")}
                      </Button>
                    </div>
                  </div>
                )}

                {music.tracks.length >= music.limit && (
                  <p className="text-xs text-zinc-500 text-center">
                    {t("dashboard.music.limitReached", { limit: music.limit })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-12">{t("dashboard.music.noSettings")}</p>
            )}

            {musicError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {musicError}
              </div>
            )}
          </div>
        )}

        {tab === "security" && (
          <SecurityTab />
        )}

        {tab === "webhooks" && (
          hasEnterprise ? (
            <WebhooksTab />
          ) : (
            <LockedFeature feature="Webhooks" required="enterprise" onAction={() => setTab("billing")} />
          )
        )}

        {tab === "discord" && (
          hasAdvanced ? (
            <DiscordTab profileId={profile?.id} />
          ) : (
            <LockedFeature feature="Discord" required="premium" onAction={() => setTab("billing")} />
          )
        )}

        {tab === "data" && (
          hasAdvanced ? (
            <DataTab profileId={profile?.id} />
          ) : (
            <LockedFeature feature="Data" required="premium" onAction={() => setTab("billing")} />
          )
        )}

        {tab === "invites" && (
          <InvitesTab />
        )}

        {tab === "enterprise" && (
          hasEnterprise ? (
            <SectionCard
              icon={<Building2 className="h-4 w-4" />}
              title={t("dashboard.enterprise.title")}
              desc={t("dashboard.enterprise.description")}
            >
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-12 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 text-violet-400">
                  <Construction className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t("dashboard.enterprise.comingSoon")}</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
                    {t("dashboard.enterprise.comingSoonDescription")}
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : (
            <LockedFeature feature="Enterprise dashboard" required="enterprise" onAction={() => setTab("billing")} />
          )
        )}

        {tab === "affiliate" && (
          <AffiliateTab />
        )}

        {tab === "billing" && (
          <BillingTab currentTier={user?.tier ?? "FREE"} />
        )}

        {tab === "email" && (
          <div className="space-y-4">
            <SectionCard
              icon={
                emailSettings.smtpConfigured ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t("dashboard.email.active")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {t("dashboard.email.unavailable")}
                  </span>
                )
              }
              title={t("dashboard.email.title")}
              desc={
                emailSettings.smtpConfigured
                  ? t("dashboard.email.configuredFrom", { email: emailSettings.fromEmail ?? "" })
                  : t("dashboard.email.notConfigured")
              }
            >
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-white">{t("dashboard.email.preferencesTitle")}</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {t("dashboard.email.preferencesDescription")}
                  </p>
                </div>

                {[
                  { key: "notifyOnView" as const, label: t("dashboard.email.profileViews"), desc: t("dashboard.email.profileViewsDescription") },
                  { key: "notifyOnClick" as const, label: t("dashboard.email.linkClicks"), desc: t("dashboard.email.linkClicksDescription") },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                    </div>
                    <Toggle
                      on={emailSettings[item.key]}
                      onChange={() => setEmailSettings({ ...emailSettings, [item.key]: !emailSettings[item.key] })}
                    />
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{t("dashboard.email.announcements")}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {platformAnnouncements
                        ? t("dashboard.email.subscribed")
                        : t("dashboard.email.optIn")}
                    </p>
                  </div>
                  <Toggle
                    on={platformAnnouncements}
                    onChange={() => void toggleOptIn(!platformAnnouncements)}
                  />
                </div>
                {optInMsg === "saved" && (
                  <p className="text-xs text-emerald-400">{t("dashboard.email.preferenceSaved")}</p>
                )}
                {optInMsg === "error" && (
                  <p className="text-xs text-red-400">{t("dashboard.email.preferenceError")}</p>
                )}

                <div className="flex gap-2.5">
                  <Button onClick={handleSaveEmail} disabled={emailSaving}>
                    <Save className="h-4 w-4" />
                    {emailSaving ? t("dashboard.email.saving") : emailSaved ? t("dashboard.email.saved") : t("dashboard.email.savePreferences")}
                  </Button>
                  {emailSettings.smtpConfigured && (
                    <Button variant="secondary" onClick={handleTestEmail} disabled={emailTesting}>
                      <Send className="h-4 w-4" />
                      {emailTesting ? t("dashboard.email.sending") : t("dashboard.email.sendTest")}
                    </Button>
                  )}
                </div>

                {emailTestResult === "success" && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-400">
                    <CheckCircle className="h-4 w-4" />
                    {t("dashboard.email.testSuccess")}
                  </div>
                )}
                {emailTestResult === "error" && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                    <XCircle className="h-4 w-4" />
                    {t("dashboard.email.testError")}
                  </div>
                )}
              </div>
            </SectionCard>

            <NewsletterManager
              key={profile?.id ?? "none"}
              profile={profile}
              tier={user?.tier ?? "FREE"}
              senderWhitelisted={user?.newsletterSenderWhitelisted ?? false}
              hasPlatformSender={(user?.permissions ?? []).includes("newsletter.manage")}
              onProfileChange={(patch) =>
                setProfiles((prev) =>
                  prev.map((p) => (p.id === profile?.id ? { ...p, ...patch } : p))
                )
              }
            />
          </div>
        )}

        {tab === "tips" && (
          <div className="space-y-4">
            <TipsTab
              key={profile?.id ?? "none"}
              profile={profile}
              onProfileChange={(patch) =>
                setProfiles((prev) =>
                  prev.map((p) => (p.id === profile?.id ? { ...p, ...patch } : p))
                )
              }
            />
          </div>
        )}

        {tab === "shop" && (
          <div className="space-y-4">
            <ShopTab
              key={profile?.id ?? "none"}
              profile={profile}
              onProfileChange={(patch) =>
                setProfiles((prev) =>
                  prev.map((p) => (p.id === profile?.id ? { ...p, ...patch } : p))
                )
              }
            />
          </div>
        )}

        {tab === "purchases" && (
          <PurchasesTab />
        )}

        {tab === "domain" && (
          <DomainTab profileId={profile?.id} profiles={profiles} />
        )}
      </main>

      <AppFooter />

      {avatarCropFile && (
        <ImageCropper
          file={avatarCropFile}
          aspectRatio={1}
          targetSize={512}
          onConfirm={confirmAvatarCrop}
          onCancel={() => setAvatarCropFile(null)}
        />
      )}

      {qrLink && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setQrLink(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{t("dashboard.qr.title")}</h3>
              <button
                onClick={() => setQrLink(null)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {resolveQrValue(qrLink) ? (
              <>
                <div className="mx-auto mb-4 w-fit rounded-xl bg-white p-3">
                  <QRCodeCanvas ref={qrCanvasRef} value={resolveQrValue(qrLink)} size={208} level="M" />
                </div>
                <p className="mb-4 text-center text-xs text-zinc-500 break-all">
                  {qrLink.label || platformLabel(qrLink.platform)} —{" "}
                  {resolveQrValue(qrLink)}
                </p>
                <Button onClick={handleQrDownload} className="w-full">
                  <Download className="h-4 w-4" />
                  <span className="ml-2">{t("dashboard.qr.download")}</span>
                </Button>
              </>
            ) : (
              <p className="text-center text-sm text-zinc-500">{t("dashboard.qr.noUrl")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
