import { useEffect, useState, useRef, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { PlatformIcon, platformDisplayNames } from "@/components/ui/PlatformIcon";
import { SecurityTab } from "@/components/auth/SecurityTab";
import { WebhooksTab } from "@/components/settings/WebhooksTab";
import { DiscordTab } from "@/components/settings/DiscordTab";
import { DataTab } from "@/components/settings/DataTab";
import { InvitesTab } from "@/components/settings/InvitesTab";
import { DomainTab } from "@/components/settings/DomainTab";
import { api, type Profile, type AnalyticsData, type EmailNotificationSettings, type MusicSettings, type MusicProvider, type MusicTrack, type Badge } from "@/lib/api";
import { BadgePill } from "@/components/ui/BadgePill";
import { ImageCropper } from "@/components/ui/ImageCropper";
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
  Building2,
  Image,
} from "lucide-react";

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

function LockedTab({ feature, required }: { feature: string; required: "premium" | "enterprise" }) {
  const { user } = useAuth();
  const tier = user?.tier ?? "FREE";
  const overridden = required === "enterprise"
    ? user?.permissions?.includes("api.enterprise")
    : user?.permissions?.includes("api.advanced") || user?.permissions?.includes("api.enterprise");

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 sm:p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800/60 mb-4">
        {required === "enterprise" ? (
          <Building2 className="h-6 w-6 text-amber-400" />
        ) : (
          <Crown className="h-6 w-6 text-violet-400" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-white">{feature} is a {required === "enterprise" ? "Enterprise" : "Premium"} feature</h3>
      <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
        {overridden
          ? `Your role already unlocks this — ask an admin to grant your role the ${
              required === "enterprise" ? "api.enterprise" : "api.advanced"
            } permission.`
          : `Your account is on the ${tier.toLowerCase()} tier. Upgrade to ${required === "enterprise" ? "Enterprise" : "Premium"} to unlock ${feature.toLowerCase()}.`}
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
        <Lock className="h-3.5 w-3.5" />
        Requires {required === "enterprise" ? "Enterprise" : "Premium"} · API level “{required === "enterprise" ? "enterprise" : "advanced"}”
      </div>
    </div>
  );
}

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
      label: new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      total: series.find((v) => v.date === dateStr)?.count ?? 0,
      unique: uniqueSeries.find((v) => v.date === dateStr)?.count ?? 0,
    });
  }
  return { max, days };
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const apiLevel = user?.apiLevel ?? "basic";
  const hasAdvanced = apiLevel === "advanced" || apiLevel === "enterprise";
  const hasEnterprise = apiLevel === "enterprise";
  const hasCustomDomain = (user?.tier === "PRO" || user?.tier === "ENTERPRISE") && user?.permissions?.includes("profiles.customDomain");

  usePageMeta({ title: "Dashboard", description: `Manage your ${branding.name} profiles, links, appearance, and settings.`, url: "/dashboard" });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<Badge[]>([]);
  const [limits, setLimits] = useState<{ profiles: number; aliases: number }>({ profiles: 1, aliases: 0 });
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [ownedBadges, setOwnedBadges] = useState<string[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"profiles" | "profile" | "links" | "appearance" | "analytics" | "email" | "music" | "security" | "webhooks" | "data" | "discord" | "invites" | "domain">("profile");
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

  const profile = profiles.find((p) => p.id === selectedProfileId) ?? profiles[0] ?? null;

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const [newPlatform, setNewPlatform] = useState("Twitter");
  const [newUrl, setNewUrl] = useState("");

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
    if (tabParam && ["profiles", "profile", "links", "appearance", "analytics", "email", "music", "security", "webhooks", "data", "discord", "invites"].includes(tabParam)) {
      setTab(tabParam as "profiles" | "profile" | "links" | "appearance" | "analytics" | "email" | "music" | "security" | "webhooks" | "data" | "discord" | "invites");
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const [formProfileId, setFormProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.id === formProfileId) return;
    setFormProfileId(profile.id);
    setDisplayName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
    setLocation(profile.location ?? "");
    setWebsite(profile.website ?? "");
    setIsPublic(profile.isPublic);
    setSocialLinks(profile.socialLinks ?? []);
    setSelectedTheme(
      profile.theme
        ? themePresets.find((t) => t.bg === profile.theme!.bg && t.accent === profile.theme!.accent)?.name ?? null
        : null
    );
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

  useEffect(() => {
    if (tab === "email" && profile) {
      api.getEmailSettings(profile.id).then((res) => {
        if (res.success && res.data) {
          setEmailSettings(res.data);
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

    const themeData = selectedTheme
      ? themePresets.find((t) => t.name === selectedTheme) ?? null
      : null;

    const res = await api.updateProfile({
      displayName: displayName || null,
      bio: bio || null,
      location: location || null,
      website: website || null,
      socialLinks: socialLinks.length > 0 ? socialLinks : null,
      theme: themeData,
      isPublic,
    }, profile.id);
    setSaving(false);

    if (res.success && res.data) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, ...(res.data as Profile), aliases: p.aliases } : p))
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setSaveError(res.error ?? "Failed to save profile");
    }
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
      setUploadError(res.error ?? "Failed to upload avatar");
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
      setUploadError(res.error ?? "Failed to upload banner");
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
      setUploadError(res.error ?? "Failed to remove avatar");
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
      setUploadError(res.error ?? "Failed to remove banner");
    }
  };

  const addLink = () => {
    if (!newUrl) return;
    let url = newUrl.trim();
    const platformLower = newPlatform.toLowerCase();
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
            setUploadError("Invalid Discord link. Use a discord.gg invite or a username.");
            return;
          }
          url = candidate;
        } catch {
          setUploadError("Invalid Discord URL.");
          return;
        }
      } else {
        if (!/^[a-z0-9_.]{2,32}$/i.test(url) || /\.\./.test(url) || /^\./.test(url) || /\.$/.test(url)) {
          setUploadError("Invalid Discord username. Use 2-32 characters: letters, numbers, underscores, or periods.");
          return;
        }
      }
    } else if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    setUploadError("");
    setSocialLinks([...socialLinks, { platform: newPlatform, url }]);
    setNewUrl("");
  };

  const removeLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
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

  const handleAddMusic = async () => {
    setMusicError("");
    if (!music) return;

    if (music.tracks.length >= music.limit) {
      setMusicError(`Track limit reached (${music.limit}). Upgrade your tier to add more tracks.`);
      return;
    }

    setMusicBusy(true);
    let res;
    if (musicProvider === "local") {
      if (!musicFile) {
        setMusicError("Choose an audio file to upload.");
        setMusicBusy(false);
        return;
      }
      res = await api.uploadMusicTrack(musicFile, musicTitle || undefined, musicArtist || undefined, musicFullUrl || undefined, profile.id);
    } else {
      if (!musicUrl.trim()) {
        setMusicError(`Enter a ${musicProvider} URL.`);
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
      setMusicError(res.error ?? "Failed to add track");
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
      setMusicError(res.error ?? "Failed to remove track");
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
      setMusicError(res.error ?? "Failed to update track");
    }
    setEditingTrackId(null);
  };

  const handleCreateProfile = async () => {
    const slug = profileSlug.trim().toLowerCase();
    if (!slug) {
      setProfileMsg("Enter a slug for the new profile.");
      return;
    }
    if (profiles.length >= limits.profiles) {
      setProfileMsg(`Profile limit reached (${limits.profiles}). Upgrade your tier to add more profiles.`);
      return;
    }
    setProfileBusy(true);
    setProfileMsg("");
    const res = await api.createProfile({ slug, isPublic: true });
    setProfileBusy(false);
    if (res.success && res.data) {
      setProfileMsg("Profile created.");
      setProfileSlug("");
      await refreshProfiles();
      if (res.data) setSelectedProfileId(res.data.id);
    } else {
      setProfileMsg(res.error ?? "Failed to create profile");
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!window.confirm("Delete this profile? This cannot be undone.")) return;
    const res = await api.deleteProfile(id);
    if (res.success) {
      setSelectedProfileId((prev) => (prev === id ? null : prev));
      await refreshProfiles();
    } else {
      setProfileMsg(res.error ?? "Failed to delete profile");
    }
  };

  const handleSetPrimary = async (id: string) => {
    const res = await api.setPrimaryProfile(id);
    if (res.success) {
      setPrimaryId(id);
      await refreshProfiles();
    } else {
      setProfileMsg(res.error ?? "Failed to set primary profile");
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
      setProfileMsg(res.error ?? "Failed to update badge");
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
      setAliasMsg("Enter a slug for the alias.");
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
      setAliasMsg(res.error ?? "Failed to add alias");
    }
  };

  const handleDeleteAlias = async (profileId: string, aliasId: string) => {
    const res = await api.deleteAlias(profileId, aliasId);
    if (res.success) {
      await loadAliases(profileId);
    } else {
      setAliasMsg(res.error ?? "Failed to remove alias");
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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <div className="flex items-center gap-4">
            <a
              href={`/${profile?.slug ?? user?.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-violet-400 transition-colors"
            >
              View Profile
            </a>
            {isAdmin && (
              <Link
                to="/admin"
                className="text-sm text-violet-400 hover:text-violet-300 transition-colors font-medium"
              >
                Admin Panel
              </Link>
            )}
            <span className="text-sm text-zinc-400">{user?.username}</span>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Edit Profile</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {new URL(branding.url).host}/{profile?.slug ?? user?.username}
            </p>
          </div>
          <div className="flex items-center gap-3">
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
              {isPublic ? "Public" : "Private"}
            </button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-zinc-800/80 overflow-x-auto">
          {(["profiles", "profile", "links", "appearance", "analytics", "email", "music", "webhooks", "data", "discord", "invites", "domain", "security"] as const).map((t) => {
            const locked =
              (t === "analytics" || t === "data" || t === "discord") && !hasAdvanced
                ? true
                : t === "webhooks" && !hasEnterprise
                  ? true
                  : t === "domain" && !hasCustomDomain;
            return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                tab === t
                  ? "text-violet-400 border-b-2 border-violet-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t === "profiles" ? "Profiles" : t === "profile" ? "Profile" : t === "links" ? "Links" : t === "appearance" ? "Appearance" : t === "analytics" ? "Analytics" : t === "email" ? "Email" : t === "music" ? "Music" : t === "webhooks" ? "Webhooks" : t === "data" ? "Data" : t === "discord" ? "Discord" : t === "invites" ? "Invites" : t === "domain" ? "Domain" : "Security"}
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
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
              <div className="flex items-center gap-3 mb-4">
                <Layers className="h-5 w-5 text-violet-400" />
                <div>
                  <h3 className="text-sm font-medium text-white">Profiles</h3>
                  <p className="text-xs text-zinc-500">
                    {profiles.length}/{limits.profiles} profiles used · {primaryId ? "Primary: " + (profiles.find((p) => p.id === primaryId)?.slug ?? "") : "No primary"}
                  </p>
                </div>
              </div>

              {profiles.length < limits.profiles && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={profileSlug}
                    onChange={(e) => setProfileSlug(e.target.value)}
                    placeholder="new-profile-slug"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  <Button onClick={handleCreateProfile} disabled={profileBusy}>
                    <Plus className="h-4 w-4" />
                    {profileBusy ? "Creating..." : "Create Profile"}
                  </Button>
                </div>
              )}
              {profiles.length >= limits.profiles && (
                <p className="text-xs text-zinc-500 text-center py-2">
                  Profile limit reached ({limits.profiles}). Upgrade your tier to add more profiles.
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
                <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                  <div className="flex items-center justify-between gap-4">
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
                          <Star className="h-3.5 w-3.5" /> Set Primary
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedProfileId(p.id)}
                      >
                        Edit
                      </Button>
                      {profiles.length > 1 && (
                        <button
                          onClick={() => handleDeleteProfile(p.id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                          title="Delete profile"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-zinc-400 mb-2">Badges</p>
                    <div className="flex flex-wrap gap-2">
                      {badgeCatalog.map((badge) => {
                        const owned = ownedBadges.includes(badge.id);
                        const active = p.badges?.includes(badge.id) ?? false;
                        return owned ? (
                          <button
                            key={badge.id}
                            onClick={() => handleToggleBadge(p.id, badge.id)}
                            title={active ? `Remove ${badge.label} badge` : `Add ${badge.label} badge`}
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
                            title="Badge not earned — it must be granted by an admin"
                          >
                            <BadgePill badge={badge} />
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 ring-1 ring-zinc-600">
                              <Lock className="h-2.5 w-2.5 text-zinc-400" />
                            </span>
                          </span>
                        );
                      })}
                      {badgeCatalog.length === 0 && (
                        <span className="text-[11px] text-zinc-600">No badges available</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-zinc-800/60 pt-4">
                    <button
                      onClick={() => handleExpandAliases(p.id)}
                      className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Aliases ({p.aliases?.length ?? 0} / {limits.aliases})
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
                                  title="Remove alias"
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
                              placeholder="alias-slug"
                              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                            <Button variant="secondary" size="sm" onClick={() => handleAddAlias(p.id)} disabled={aliasBusy}>
                              <Plus className="h-3.5 w-3.5" />
                              Add
                            </Button>
                          </div>
                        ) : (
                          <p className="text-[11px] text-zinc-600">Alias limit reached ({limits.aliases}).</p>
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
          <div className="space-y-6">
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
                  className="relative group h-24 w-24 rounded-full overflow-hidden ring-2 ring-zinc-700 hover:ring-violet-500 transition-all"
                >
                  {profile?.avatar ? (
                    <img
                      src={profile.avatar}
                      alt="Avatar"
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
                    Remove
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={user?.username}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell the world about yourself..."
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-zinc-500 mt-1">{bio.length}/500</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Location
                  </span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Earth"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    Website
                  </span>
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>
            </div>

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
                    alt="Banner"
                    className="w-full h-32 object-cover rounded-xl mb-3"
                  />
                ) : null}
                <Camera className="h-5 w-5 text-zinc-500 group-hover:text-violet-400 mx-auto mb-2 transition-colors" />
                <p className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
                  {profile?.banner ? "Change Banner" : "Upload Banner"}{" "}
                  <span className="text-zinc-600">(16:9 recommended)</span>
                </p>
              </button>
              {profile?.banner && (
                <button
                  onClick={handleRemoveBanner}
                  className="mt-2 w-full text-xs text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Remove Banner
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
                className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {platformDisplayNames[p.toLowerCase()] ?? p}
                  </option>
                ))}
              </select>
              <input
                type={newPlatform.toLowerCase() === "email" || newPlatform.toLowerCase() === "discord" ? "text" : "url"}
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={
                  newPlatform.toLowerCase() === "email" ? "user@example.com"
                    : newPlatform.toLowerCase() === "discord" ? "username or discord.gg/invite"
                    : "https://..."
                }
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <Button onClick={addLink} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {socialLinks.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-8">
                No links yet. Add your social links above.
              </p>
            )}

            {socialLinks.map((link, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={link.platform} className="h-4 w-4 text-violet-400" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {platformDisplayNames[link.platform.toLowerCase()] ?? link.platform}
                    </p>
                    <p className="text-xs text-zinc-400 truncate max-w-xs">
                      {link.url.startsWith("mailto:") ? link.url.slice(7) : link.url}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeLink(i)}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "appearance" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Themes</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Choose a theme for your public profile page.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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
                        {preset.tier === "enterprise" ? "Enterprise" : "Premium"}
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="h-6 w-6 rounded-full ring-2 ring-white/20"
                        style={{ backgroundColor: preset.accent }}
                      />
                      <span
                        className="text-sm font-medium"
                        style={{ color: preset.text }}
                      >
                        {preset.name}
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
                  Selected: {selectedTheme} — click Save to apply
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 text-zinc-500" />
                <div>
                  <h3 className="text-base font-semibold text-white">Layout</h3>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    Choose how your profile is arranged.
                  </p>
                </div>
                <span className="ml-auto inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Coming Soon
                </span>
              </div>
              <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/40 px-4 py-16 text-center">
                <Layers className="h-8 w-8 text-zinc-600" />
                <p className="mt-4 text-sm font-medium text-zinc-400">
                  Layout customization is on the way
                </p>
                <p className="mt-1.5 text-xs text-zinc-600">
                  This space is reserved for card styles, spacing, and layout options.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <div className="flex items-center gap-3">
                <Image className="h-5 w-5 text-zinc-500" />
                <div>
                  <h3 className="text-base font-semibold text-white">Background</h3>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    Customize the background of your public profile.
                  </p>
                </div>
                <span className="ml-auto inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Coming Soon
                </span>
              </div>
              <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/40 px-4 py-16 text-center">
                <Image className="h-8 w-8 text-zinc-600" />
                <p className="mt-4 text-sm font-medium text-zinc-400">
                  Background customization is on the way
                </p>
                <p className="mt-1.5 text-xs text-zinc-600">
                  This space is reserved for background images and effects.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === "analytics" && (
          hasAdvanced ? (
            <div className="space-y-6">
            {analyticsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
              </div>
            ) : analytics ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Total Views", sub: `${analytics.total.uniqueViews} unique`, value: analytics.total.views, icon: EyeIcon },
                    { label: "Total Clicks", sub: `${analytics.total.uniqueClicks} unique`, value: analytics.total.clicks, icon: MousePointerClick },
                    { label: "Views (7d)", sub: `${analytics.last7d.uniqueViews} unique`, value: analytics.last7d.views, icon: BarChart3 },
                    { label: "Clicks (7d)", sub: `${analytics.last7d.uniqueClicks} unique`, value: analytics.last7d.clicks, icon: BarChart3 },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 group hover:border-zinc-700 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{stat.label}</span>
                        <stat.icon className="h-5 w-5 text-violet-400/80 group-hover:text-violet-400 transition-colors" />
                      </div>
                      <p className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{stat.value.toLocaleString()}</p>
                      <p className="text-xs text-zinc-500 mt-1.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-medium text-white">Views — Last 30 Days</h3>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-500" />Total</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" />Unique</span>
                    </div>
                  </div>
                  {analytics.viewsByDay.length > 0 || analytics.uniqueViewsByDay.length > 0 ? (
                    <div className="relative flex items-end gap-1 h-72 sm:h-80">
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
                                <p className="text-[11px] font-semibold text-white">{day.label}</p>
                                <p className="text-xs mt-1"><span className="text-violet-400 font-semibold">{day.total}</span> <span className="text-zinc-500">total</span></p>
                                <p className="text-xs"><span className="text-sky-400 font-semibold">{day.unique}</span> <span className="text-zinc-500">unique</span></p>
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
                    <p className="text-sm text-zinc-500 text-center py-8">No views yet</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6">
                    <h3 className="text-sm font-medium text-white mb-5">Clicks by Platform</h3>
                    {analytics.clicksByPlatform.length > 0 ? (
                      <div className="space-y-5">
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
                                  {platformDisplayNames[item.platform.toLowerCase()] ?? item.platform}
                                </span>
                                <span className="text-sm text-zinc-300">{item.count} <span className="text-zinc-600">· {unique} unique</span></span>
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
                      <p className="text-sm text-zinc-500 text-center py-4">No clicks yet</p>
                    )}
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6">
                    <h3 className="text-sm font-medium text-white mb-4">Top Referrers</h3>
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
                      <p className="text-sm text-zinc-500 text-center py-4">No referrers yet</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-medium text-white">Clicks — Last 30 Days</h3>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />Total</span>
                      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />Unique</span>
                    </div>
                  </div>
                  {analytics.clicksByDay.length > 0 || analytics.uniqueClicksByDay.length > 0 ? (
                    <div className="relative flex items-end gap-1 h-72 sm:h-80">
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
                                <p className="text-[11px] font-semibold text-white">{day.label}</p>
                                <p className="text-xs mt-1"><span className="text-emerald-400 font-semibold">{day.total}</span> <span className="text-zinc-500">total</span></p>
                                <p className="text-xs"><span className="text-amber-400 font-semibold">{day.unique}</span> <span className="text-zinc-500">unique</span></p>
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
                    <p className="text-sm text-zinc-500 text-center py-8">No clicks yet</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-12">No analytics data available</p>
            )}
            </div>
          ) : (
            <LockedTab feature="Analytics" required="premium" />
          )
        )}

        {tab === "music" && (
          <div className="space-y-6">
            {musicLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
              </div>
            ) : music ? (
              <>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Music className="h-5 w-5 text-violet-400" />
                      <div>
                        <h3 className="text-sm font-medium text-white">Music Player</h3>
                        <p className="text-xs text-zinc-500">
                          {music.tracks.length}/{music.limit} tracks used · {music.tier} tier
                        </p>
                      </div>
                    </div>
                  </div>

                  {music.tracks.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-8">
                      No tracks yet. Add local files, Spotify, or YouTube tracks below.
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
                                  placeholder="Title"
                                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                <input
                                  type="text"
                                  value={editArtist}
                                  onChange={(e) => setEditArtist(e.target.value)}
                                  placeholder="Artist"
                                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                <input
                                  type="text"
                                  value={editFullUrl}
                                  onChange={(e) => setEditFullUrl(e.target.value)}
                                  placeholder="Full version URL (optional)"
                                  className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveEditTrack(track.id)}
                                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingTrackId(null)}
                                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm font-medium text-white truncate">
                                  {track.title ?? (track.provider === "local" ? "Local track" : track.provider)}
                                </p>
                                <p className="text-xs text-zinc-500 truncate">
                                  {track.artist ? `${track.artist} · ` : ""}
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
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <a
                                href={track.provider === "local" ? track.filePath ?? undefined : track.url ?? undefined}
                                target={track.provider === "local" ? undefined : "_blank"}
                                rel="noopener noreferrer"
                                className="text-zinc-500 hover:text-violet-400 transition-colors"
                                title="Open"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                              <button
                                onClick={() => handleDeleteTrack(track.id)}
                                className="text-zinc-500 hover:text-red-400 transition-colors"
                                title="Remove"
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
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                    <h3 className="text-sm font-medium text-white mb-4">Add Track</h3>

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
                          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                            Audio File <span className="text-zinc-500">(MP3, OGG, OPUS, WAV, M4A, FLAC, AAC — max 25MB)</span>
                          </label>
                          <input
                            id="music-file-input"
                            type="file"
                            accept=".mp3,.opus,.ogg,.wav,.m4a,.flac,.aac,.webm,.oga,audio/*"
                            onChange={(e) => setMusicFile(e.target.files?.[0] ?? null)}
                            className="w-full text-sm text-zinc-300 file:mr-4 file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-500 file:cursor-pointer cursor-pointer"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Title</label>
                            <input
                              type="text"
                              value={musicTitle}
                              onChange={(e) => setMusicTitle(e.target.value)}
                              placeholder="Track title"
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Artist</label>
                            <input
                              type="text"
                              value={musicArtist}
                              onChange={(e) => setMusicArtist(e.target.value)}
                              placeholder="Artist name"
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                            Full version URL <span className="text-zinc-500">(optional)</span>
                          </label>
                          <input
                            type="url"
                            value={musicFullUrl}
                            onChange={(e) => setMusicFullUrl(e.target.value)}
                            placeholder="https://... (audio file, YouTube, or other stream)"
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          />
                          <p className="mt-1 text-[11px] text-zinc-500">
                            Optional full streaming source for visitors. You are solely responsible for the content and any
                            terms of service of the source you link. See the{" "}
                            <a href="/terms" className="text-violet-400 hover:text-violet-300">Terms of Service</a>.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                            {musicProvider === "spotify" ? "Spotify URL" : "YouTube / YouTube Music URL"}
                          </label>
                          <input
                            type="url"
                            value={musicUrl}
                            onChange={(e) => setMusicUrl(e.target.value)}
                            placeholder={
                              musicProvider === "spotify"
                                ? "https://open.spotify.com/track/..."
                                : "https://www.youtube.com/watch?v=... or https://music.youtube.com/watch?v=..."
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                              Title <span className="text-zinc-500">(optional)</span>
                            </label>
                            <input
                              type="text"
                              value={musicTitle}
                              onChange={(e) => setMusicTitle(e.target.value)}
                              placeholder="Track title"
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                              Artist <span className="text-zinc-500">(optional)</span>
                            </label>
                            <input
                              type="text"
                              value={musicArtist}
                              onChange={(e) => setMusicArtist(e.target.value)}
                              placeholder="Artist name"
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        {musicProvider === "spotify" && (
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                              Full version URL <span className="text-zinc-500">(optional)</span>
                            </label>
                            <input
                              type="url"
                              value={musicFullUrl}
                              onChange={(e) => setMusicFullUrl(e.target.value)}
                              placeholder="https://... (audio file, YouTube, or other stream)"
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                            />
                            <p className="mt-1 text-[11px] text-zinc-500">
                              Spotify embeds only play previews. Provide an optional full streaming source here — you are
                              solely responsible for the content and any terms of service of the source. See the{" "}
                              <a href="/terms" className="text-violet-400 hover:text-violet-300">Terms of Service</a>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-4">
                      <Button onClick={handleAddMusic} disabled={musicBusy}>
                        <Upload className="h-4 w-4" />
                        {musicBusy ? "Adding..." : "Add Track"}
                      </Button>
                    </div>
                  </div>
                )}

                {music.tracks.length >= music.limit && (
                  <p className="text-xs text-zinc-500 text-center">
                    Track limit reached ({music.limit}). Upgrade to a higher tier for more tracks.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-12">No music settings available</p>
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
            <LockedTab feature="Webhooks" required="enterprise" />
          )
        )}

        {tab === "discord" && (
          hasAdvanced ? (
            <DiscordTab profileId={profile?.id} />
          ) : (
            <LockedTab feature="Discord" required="premium" />
          )
        )}

        {tab === "data" && (
          hasAdvanced ? (
            <DataTab profileId={profile?.id} />
          ) : (
            <LockedTab feature="Data" required="premium" />
          )
        )}

        {tab === "invites" && (
          <InvitesTab />
        )}

        {tab === "email" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`h-2.5 w-2.5 rounded-full ${emailSettings.smtpConfigured ? "bg-emerald-500" : "bg-zinc-600"}`} />
                <h4 className="text-sm font-medium text-white">
                  {emailSettings.smtpConfigured ? "SMTP Configured" : "SMTP Not Configured"}
                </h4>
              </div>
              {emailSettings.smtpConfigured ? (
                <p className="text-xs text-zinc-400">
                  Emails are sent from <span className="text-zinc-300">{emailSettings.fromEmail}</span>
                </p>
              ) : (
                <p className="text-xs text-zinc-500">
                  Configure SMTP in your server's <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">.env</code> file to enable email notifications.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Notification Preferences</h3>
              <p className="text-xs text-zinc-500">Choose which events trigger an email notification.</p>

              {[
                { key: "notifyOnView" as const, label: "Profile Views", desc: "Get notified when someone visits your profile page." },
                { key: "notifyOnClick" as const, label: "Link Clicks", desc: "Get notified when someone clicks one of your social links." },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setEmailSettings({ ...emailSettings, [item.key]: !emailSettings[item.key] })}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      emailSettings[item.key] ? "bg-violet-600" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        emailSettings[item.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSaveEmail} disabled={emailSaving}>
                <Save className="h-4 w-4" />
                {emailSaving ? "Saving..." : emailSaved ? "Saved!" : "Save Preferences"}
              </Button>
              {emailSettings.smtpConfigured && (
                <Button variant="secondary" onClick={handleTestEmail} disabled={emailTesting}>
                  <Send className="h-4 w-4" />
                  {emailTesting ? "Sending..." : "Send Test Email"}
                </Button>
              )}
            </div>

            {emailTestResult === "success" && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                Test email sent successfully!
              </div>
            )}
            {emailTestResult === "error" && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                <XCircle className="h-4 w-4" />
                Failed to send test email. Check server SMTP config.
              </div>
            )}
          </div>
        )}

        {tab === "domain" && (
          <DomainTab profileId={profile?.id} profiles={profiles} />
        )}
      </main>

      {avatarCropFile && (
        <ImageCropper
          file={avatarCropFile}
          aspectRatio={1}
          targetSize={512}
          onConfirm={confirmAvatarCrop}
          onCancel={() => setAvatarCropFile(null)}
        />
      )}
    </div>
  );
}
