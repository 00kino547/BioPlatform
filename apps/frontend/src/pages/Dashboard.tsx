import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { PlatformIcon, platformDisplayNames } from "@/components/ui/PlatformIcon";
import { api, type Profile } from "@/lib/api";
import {
  Camera,
  Save,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  MapPin,
  Globe,
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
  },
  {
    name: "Ocean",
    bg: "#0c1222",
    cardBg: "rgba(15,23,42,0.7)",
    text: "#e2e8f0",
    accent: "#0ea5e9",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    name: "Sunset",
    bg: "#1a0a0a",
    cardBg: "rgba(45,10,10,0.6)",
    text: "#fef2f2",
    accent: "#f97316",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    name: "Forest",
    bg: "#0a1a0f",
    cardBg: "rgba(10,30,15,0.6)",
    text: "#ecfdf5",
    accent: "#22c55e",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    name: "Lavender",
    bg: "#130d1a",
    cardBg: "rgba(30,20,40,0.6)",
    text: "#f3e8ff",
    accent: "#a855f7",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    name: "Rose",
    bg: "#1a0a14",
    cardBg: "rgba(40,15,30,0.6)",
    text: "#fdf2f8",
    accent: "#ec4899",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    name: "Arctic",
    bg: "#f8fafc",
    cardBg: "rgba(241,245,249,0.8)",
    text: "#1e293b",
    accent: "#6366f1",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  {
    name: "Minimal",
    bg: "#ffffff",
    cardBg: "rgba(255,255,255,0.9)",
    text: "#18181b",
    accent: "#18181b",
    fontFamily: "Inter, system-ui, sans-serif",
  },
];

export function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"profile" | "links" | "appearance">("profile");
  const [uploadError, setUploadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const [newPlatform, setNewPlatform] = useState("Twitter");
  const [newUrl, setNewUrl] = useState("");

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getMyProfile().then((res) => {
      if (res.success && res.data) {
        const p = res.data;
        setProfile(p);
        setDisplayName(p.displayName ?? "");
        setBio(p.bio ?? "");
        setLocation(p.location ?? "");
        setWebsite(p.website ?? "");
        setIsPublic(p.isPublic);
        setSocialLinks(p.socialLinks ?? []);

        if (p.theme) {
          const match = themePresets.find(
            (t) =>
              t.bg === p.theme!.bg &&
              t.accent === p.theme!.accent
          );
          setSelectedTheme(match?.name ?? null);
        }
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
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
    });
    setSaving(false);

    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setSaveError(res.error ?? "Failed to save profile");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    const res = await api.uploadAvatar(file);
    if (res.success && res.data) {
      setProfile((prev) =>
        prev ? { ...prev, avatar: res.data!.avatar } : prev
      );
    } else {
      setUploadError(res.error ?? "Failed to upload avatar");
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    const res = await api.uploadBanner(file);
    if (res.success && res.data) {
      setProfile((prev) =>
        prev ? { ...prev, banner: res.data!.banner } : prev
      );
    } else {
      setUploadError(res.error ?? "Failed to upload banner");
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadError("");
    const res = await api.removeAvatar();
    if (res.success) {
      setProfile((prev) => (prev ? { ...prev, avatar: null } : prev));
    } else {
      setUploadError(res.error ?? "Failed to remove avatar");
    }
  };

  const handleRemoveBanner = async () => {
    setUploadError("");
    const res = await api.removeBanner();
    if (res.success) {
      setProfile((prev) => (prev ? { ...prev, banner: null } : prev));
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
      if (/^https?:\/\//i.test(url)) {
        try {
          const parsed = new URL(url);
          const h = parsed.hostname.toLowerCase();
          const isInvite =
            h === "discord.gg" || h.endsWith(".discord.gg") || h === "discord.com" || h === "discordapp.com";
          if (!isInvite) {
            setUploadError("Invalid Discord link. Use a discord.gg/x invite or a username.");
            return;
          }
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
              href={`/${user?.username}`}
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
              {new URL(branding.url).host}/{user?.username}
            </p>
          </div>
          <div className="flex items-center gap-3">
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

        <div className="flex gap-1 mb-6 border-b border-zinc-800/80">
          {(["profile", "links", "appearance"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-violet-400 border-b-2 border-violet-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t === "profile" ? "Profile" : t === "links" ? "Links" : "Appearance"}
            </button>
          ))}
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
            <p className="text-sm text-zinc-400">
              Choose a theme for your public profile page.
            </p>

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
        )}
      </main>
    </div>
  );
}
