import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { getToken, type Badge, type Role, type InviteGrantEvent } from "@/lib/api";
import { BadgePill } from "@/components/ui/BadgePill";
import { X, Edit, Save, Trash2 } from "lucide-react";

interface InviteCode {
  id: string;
  code: string;
  createdById: string;
  createdBy: { id: string; username: string } | null;
  usedById: string | null;
  usedBy: { id: string; username: string } | null;
  usedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  fromAllowance: boolean;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  roleId: string;
  role: { id: string; slug: string; name: string; isSystem: boolean } | null;
  tier: string;
  trackLimit: number | null;
  profileLimit: number | null;
  aliasLimit: number | null;
  badges: string[];
  inviteBanned: boolean;
  inviteBannedAt: string | null;
  inviteAllowance: number;
  createdAt: string;
  updatedAt: string;
}

interface UserProfile {
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  location: string | null;
  website: string | null;
  socialLinks: { platform: string; url: string }[] | null;
  isPublic: boolean;
}

interface AuthBan {
  id: string;
  kind: string;
  value: string;
  accountId: string | null;
  failCount: number;
  lockedUntil: string | null;
  permanent: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthLogEntry {
  id: string;
  kind: string;
  username: string | null;
  accountId: string | null;
  ip: string;
  userAgentHash: string | null;
  fingerprint: string | null;
  reason: string;
  penaltyMinutes: number | null;
  permanent: boolean;
  triggeredBy: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface AdminDomainEntry {
  id: string;
  profileId: string;
  profileSlug: string;
  owner: { id: string; username: string; email: string; tier: string } | null;
  domain: string;
  status: "PENDING_VERIFICATION" | "VERIFIED" | "ACTIVE" | "REJECTED";
  rootTarget: string | null;
  verificationToken: string;
  verifiedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  tlsStatus: "NONE" | "PENDING" | "ISSUED" | "FAILED";
  tlsIssuedAt: string | null;
  tlsExpiresAt: string | null;
  tlsError: string | null;
  createdAt: string;
}

type Tab = "codes" | "users" | "roles" | "badges" | "bans" | "logs" | "domains";

const PERMISSION_LABELS: Record<string, string> = {
  "users.view": "View users",
  "users.manage": "Manage users",
  "profiles.manage": "Manage profiles",
  "profiles.customDomain": "Use custom domains",
  "invites.manage": "Manage invite codes",
  "invites.generate": "Generate own invite codes",
  "bans.manage": "Manage bans & lockouts",
  "roles.manage": "Manage roles",
  "badges.manage": "Manage badges",
  "logs.view": "View auth logs",
  "api.basic": "API access — basic endpoints",
  "api.advanced": "API access — advanced (Premium)",
  "api.enterprise": "API access — enterprise endpoints",
};

const PERMISSION_ORDER = Object.keys(PERMISSION_LABELS);

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const perms = new Set(user?.permissions ?? []);

  usePageMeta({ title: "Admin Panel", description: `Administrative panel for ${branding.name}.`, url: "/admin" });
  const canInvites = perms.has("invites.manage");
  const canViewUsers = perms.has("users.view");
  const canManageUsers = perms.has("users.manage");
  const canRoles = perms.has("roles.manage");
  const canBadges = perms.has("badges.manage");
  const canBans = perms.has("bans.manage");
  const canLogs = perms.has("logs.view");
  const canDomains = perms.has("profiles.manage");

  const allowedTabs: Tab[] = [
    ...(canInvites ? (["codes"] as Tab[]) : []),
    ...(canViewUsers ? (["users"] as Tab[]) : []),
    ...(canRoles ? (["roles"] as Tab[]) : []),
    ...(canBadges ? (["badges"] as Tab[]) : []),
    ...(canBans ? (["bans"] as Tab[]) : []),
    ...(canLogs ? (["logs"] as Tab[]) : []),
    ...(canDomains ? (["domains"] as Tab[]) : []),
  ];
  const [tab, setTab] = useState<Tab>(allowedTabs[0] ?? "codes");
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [inviteFilter, setInviteFilter] = useState<"all" | "available" | "mine">("all");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<Badge[]>([]);
  const [bans, setBans] = useState<AuthBan[]>([]);
  const [logs, setLogs] = useState<AuthLogEntry[]>([]);
  const [domains, setDomains] = useState<AdminDomainEntry[]>([]);
  const [count, setCount] = useState(1);
  const [expiresDays, setExpiresDays] = useState("");
  const [inviteSettings, setInviteSettings] = useState<{ userGenerationEnabled: boolean; eligibleUserCount: number } | null>(null);
  const [events, setEvents] = useState<InviteGrantEvent[]>([]);
  const [eventCount, setEventCount] = useState(3);
  const [eventExpiry, setEventExpiry] = useState(7);
  const [eventUnit, setEventUnit] = useState<"days" | "weeks">("days");
  const [eventMsg, setEventMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editProfile, setEditProfile] = useState<UserProfile>({
    displayName: "",
    bio: "",
    avatar: null,
    banner: null,
    location: "",
    website: "",
    socialLinks: null,
    isPublic: true,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [editTier, setEditTier] = useState<"FREE" | "PRO" | "ENTERPRISE">("FREE");
  const [editTrackLimit, setEditTrackLimit] = useState("");
  const [editProfileLimit, setEditProfileLimit] = useState("");
  const [editAliasLimit, setEditAliasLimit] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [editBadges, setEditBadges] = useState<string[]>([]);

  const [roleForm, setRoleForm] = useState<{
    id: string | null;
    name: string;
    description: string;
    permissions: string[];
    inviteBatchLimit: string;
    inviteOutstandingLimit: string;
    inviteCooldownMinutes: string;
    inviteDefaultExpiryDays: string;
    inviteMinExpiryDays: string;
    inviteMaxExpiryDays: string;
  }>({
    id: null,
    name: "",
    description: "",
    permissions: [],
    inviteBatchLimit: "0",
    inviteOutstandingLimit: "0",
    inviteCooldownMinutes: "0",
    inviteDefaultExpiryDays: "30",
    inviteMinExpiryDays: "1",
    inviteMaxExpiryDays: "365",
  });
  const [roleMsg, setRoleMsg] = useState("");

  const [badgeForm, setBadgeForm] = useState<{ id: string | null; slug: string; label: string; color: string; icon: string }>({
    id: null,
    slug: "",
    label: "",
    color: "#a855f7",
    icon: "Award",
  });
  const [badgeMsg, setBadgeMsg] = useState("");

  const fetchCodes = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/invites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setCodes(data.data);
  };

  const fetchInviteSettings = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/invite-settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setInviteSettings(data.data);
  };

  const fetchEvents = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/invite-events", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setEvents(data.data);
  };

  const fetchUsers = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setUsers(data.data);
  };

  const fetchBans = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/auth-bans", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setBans(data.data);
  };

  const fetchRoles = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/roles", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setRoles(data.data);
  };

  const fetchBadges = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/badges", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setBadgeCatalog(data.data);
  };

  const fetchLogs = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/auth-logs?limit=100", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setLogs(data.data);
  };

  const fetchDomains = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/custom-domains", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setDomains(data.data);
  };

  const handleApproveDomain = async (id: string) => {
    const token = getToken();
    const res = await fetch(`/api/admin/custom-domains/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      fetchDomains();
    } else {
      window.alert(data.error ?? "Failed to approve domain");
    }
  };

  const handleRejectDomain = async (id: string) => {
    const token = getToken();
    const res = await fetch(`/api/admin/custom-domains/${id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      fetchDomains();
    } else {
      window.alert(data.error ?? "Failed to reject domain");
    }
  };

  const handleIssueCert = async (id: string) => {
    const token = getToken();
    const res = await fetch(`/api/admin/custom-domains/${id}/issue-cert`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      fetchDomains();
    } else {
      window.alert(data.error ?? "Failed to issue certificate");
    }
  };

  const handleUnban = async (id: string) => {
    const token = getToken();
    const res = await fetch(`/api/admin/auth-bans/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setBans((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const handleUnlockAccount = async (userId: string) => {
    const token = getToken();
    const res = await fetch("/api/admin/auth-unlock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.success) {
      fetchBans();
      fetchLogs();
    }
  };

  useEffect(() => {
    if (canInvites) {
      fetchCodes();
      fetchInviteSettings();
      fetchEvents();
    }
    if (canViewUsers) fetchUsers();
    if (canRoles) fetchRoles();
    if (canBadges) fetchBadges();
    if (canBans) fetchBans();
    if (canLogs) fetchLogs();
    if (canDomains) fetchDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body: Record<string, unknown> = { count };
    if (expiresDays) body.expiresInDays = Number(expiresDays);

    const token = getToken();
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    setLoading(false);

    if (!data.success) {
      setError(data.error ?? "Failed to create codes");
      return;
    }

    setCount(1);
    setExpiresDays("");
    await fetchCodes();
  };

  const handleRevoke = async (id: string) => {
    const token = getToken();
    const res = await fetch(`/api/invites/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setCodes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, revokedAt: new Date().toISOString() } : c))
      );
    }
  };

  const handleToggleGeneration = async (enabled: boolean) => {
    setEventMsg("");
    const token = getToken();
    const res = await fetch("/api/admin/invite-settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userGenerationEnabled: enabled }),
    });
    const data = await res.json();
    if (data.success) {
      setInviteSettings((prev) => (prev ? { ...prev, userGenerationEnabled: enabled } : prev));
    } else {
      setEventMsg(data.error ?? "Failed to update invite settings");
    }
  };

  const handleCreateEvent = async (e: FormEvent) => {
    e.preventDefault();
    setEventMsg("");
    setLoading(true);
    const expiryDays = eventUnit === "weeks" ? eventExpiry * 7 : eventExpiry;
    const token = getToken();
    const res = await fetch("/api/admin/invite-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ count: eventCount, expiryDays }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.success) {
      setEventMsg(data.error ?? "Failed to run invite event");
      return;
    }
    setEventMsg(
      `Granted ${data.data.grantedUsers} user(s) ${eventCount} invite credit(s) each, expiring ${new Date(data.data.allowanceExpiresAt).toLocaleDateString()}.`
    );
    await fetchEvents();
    await fetchCodes();
    setTimeout(() => setEventMsg(""), 5000);
  };

  const handleInviteBan = async (u: User, banned: boolean) => {
    if (banned && !window.confirm(
      `Ban "${u.username}" from invites?\n\n` +
      "They can no longer generate invite codes or receive invite-event allowances. " +
      "Their unused invites are revoked immediately and their remaining allowance is zeroed."
    )) return;
    const token = getToken();
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ inviteBanned: banned }),
    });
    const data = await res.json();
    if (data.success) {
      const patch = {
        inviteBanned: data.data.inviteBanned,
        inviteBannedAt: data.data.inviteBannedAt,
        inviteAllowance: data.data.inviteAllowance,
      };
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...patch } : x)));
      setEditingUser((prev) => (prev && prev.id === u.id ? { ...prev, ...patch } : prev));
    } else {
      window.alert(data.error ?? "Failed to update invite ban");
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!window.confirm(
      `Permanently delete user "${u.username}"?\n\n` +
      "This erases their account, all profiles, badges, webhooks, passkeys, invite codes, auth logs and uploads from the database and disk. This is irreversible (GDPR erasure)."
    )) return;
    const token = getToken();
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      if (canBans) fetchBans();
      if (canLogs) fetchLogs();
    } else {
      window.alert(data.error ?? "Failed to delete user");
    }
  };

  const openEditProfile = async (u: User) => {
    setEditingUser(u);
    setEditSaved(false);
    setEditLoading(true);
    setEditTier(u.tier === "PRO" ? "PRO" : u.tier === "ENTERPRISE" ? "ENTERPRISE" : "FREE");
    setEditTrackLimit(u.trackLimit !== null && u.trackLimit !== undefined ? String(u.trackLimit) : "");
    setEditProfileLimit(u.profileLimit !== null && u.profileLimit !== undefined ? String(u.profileLimit) : "");
    setEditAliasLimit(u.aliasLimit !== null && u.aliasLimit !== undefined ? String(u.aliasLimit) : "");
    setEditRoleId(u.roleId ?? "");
    setEditBadges(u.badges ?? []);
    const token = getToken();
    const res = await fetch(`/api/admin/users/${u.id}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success && data.data?.profile) {
      const p = data.data.profile;
      setEditProfile({
        displayName: p.displayName ?? "",
        bio: p.bio ?? "",
        avatar: p.avatar,
        banner: p.banner,
        location: p.location ?? "",
        website: p.website ?? "",
        socialLinks: p.socialLinks ?? null,
        isPublic: p.isPublic ?? true,
      });
    } else {
      setEditProfile({
        displayName: "",
        bio: "",
        avatar: null,
        banner: null,
        location: "",
        website: "",
        socialLinks: null,
        isPublic: true,
      });
    }
    setEditLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!editingUser) return;
    setEditLoading(true);
    setEditSaved(false);
    const token = getToken();
    await fetch(`/api/admin/users/${editingUser.id}/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        displayName: editProfile.displayName || null,
        bio: editProfile.bio || null,
        location: editProfile.location || null,
        website: editProfile.website || null,
        socialLinks: editProfile.socialLinks?.length ? editProfile.socialLinks : null,
        isPublic: editProfile.isPublic,
      }),
    });

    const trackLimitValue = editTrackLimit === "" ? null : Number(editTrackLimit);
    const profileLimitValue = editProfileLimit === "" ? null : Number(editProfileLimit);
    const aliasLimitValue = editAliasLimit === "" ? null : Number(editAliasLimit);
    const userRes = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tier: editTier,
        trackLimit: trackLimitValue,
        profileLimit: profileLimitValue,
        aliasLimit: aliasLimitValue,
        ...(editRoleId ? { roleId: editRoleId } : {}),
        badges: editBadges,
      }),
    });
    const userData = await userRes.json();

    setEditLoading(false);
    setEditSaved(true);
    if (userData.success) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                roleId: userData.data.roleId,
                role: userData.data.role,
                tier: userData.data.tier,
                trackLimit: userData.data.trackLimit,
                profileLimit: userData.data.profileLimit,
                aliasLimit: userData.data.aliasLimit,
                badges: userData.data.badges,
              }
            : u
        )
      );
    }
    setTimeout(() => setEditSaved(false), 2000);
  };

  const handleRoleSave = async (e: FormEvent) => {
    e.preventDefault();
    setRoleMsg("");
    const token = getToken();
    const body: Record<string, unknown> = {
      name: roleForm.name,
      description: roleForm.description,
      permissions: roleForm.permissions,
      inviteBatchLimit: Number(roleForm.inviteBatchLimit) || 0,
      inviteOutstandingLimit: Number(roleForm.inviteOutstandingLimit) || 0,
      inviteCooldownMinutes: Number(roleForm.inviteCooldownMinutes) || 0,
      inviteDefaultExpiryDays: Number(roleForm.inviteDefaultExpiryDays) || 30,
      inviteMinExpiryDays: Number(roleForm.inviteMinExpiryDays) || 1,
      inviteMaxExpiryDays: Number(roleForm.inviteMaxExpiryDays) || 365,
    };
    const url = roleForm.id ? `/api/admin/roles/${roleForm.id}` : "/api/admin/roles";
    const res = await fetch(url, {
      method: roleForm.id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) {
      setRoleMsg(data.error ?? "Failed to save role");
      return;
    }
    setRoleMsg("Saved");
    setRoleForm({ id: null, name: "", description: "", permissions: [], inviteBatchLimit: "0", inviteOutstandingLimit: "0", inviteCooldownMinutes: "0", inviteDefaultExpiryDays: "30", inviteMinExpiryDays: "1", inviteMaxExpiryDays: "365" });
    fetchRoles();
    setTimeout(() => setRoleMsg(""), 2000);
  };

  const handleRoleDelete = async (id: string) => {
    if (!window.confirm("Delete this role? Users with this role must be reassigned first.")) return;
    const token = getToken();
    const res = await fetch(`/api/admin/roles/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } else {
      setRoleMsg(data.error ?? "Failed to delete role");
      setTimeout(() => setRoleMsg(""), 3000);
    }
  };

  const handleBadgeSave = async (e: FormEvent) => {
    e.preventDefault();
    setBadgeMsg("");
    const token = getToken();
    const body: Record<string, unknown> = {
      label: badgeForm.label,
      color: badgeForm.color,
      icon: badgeForm.icon,
      ...(badgeForm.slug ? { slug: badgeForm.slug } : {}),
    };
    const url = badgeForm.id ? `/api/admin/badges/${badgeForm.id}` : "/api/admin/badges";
    const res = await fetch(url, {
      method: badgeForm.id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) {
      setBadgeMsg(data.error ?? "Failed to save badge");
      return;
    }
    setBadgeMsg("Saved");
    setBadgeForm({ id: null, slug: "", label: "", color: "#a855f7", icon: "Award" });
    fetchBadges();
    setTimeout(() => setBadgeMsg(""), 2000);
  };

  const handleBadgeDelete = async (id: string) => {
    if (!window.confirm("Delete this badge? It will be removed from all profiles and users.")) return;
    const token = getToken();
    const res = await fetch(`/api/admin/badges/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setBadgeCatalog((prev) => prev.filter((b) => b.id !== id));
    } else {
      setBadgeMsg(data.error ?? "Failed to delete badge");
      setTimeout(() => setBadgeMsg(""), 3000);
    }
  };

  const roleUserCount = (roleId: string) => users.filter((u) => u.roleId === roleId).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-zinc-800/80 bg-zinc-900/30">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm text-violet-400 hover:text-violet-300 transition-colors font-medium"
            >
              My Dashboard
            </Link>
            <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
              {user?.username}
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-400 border border-violet-500/20">
                {user?.role?.name ?? "Staff"}
              </span>
            </span>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <h1 className="text-2xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-zinc-400 mb-8">Manage invite codes, users, roles, badges and security.</p>

        <div className="flex gap-1 mb-8 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-1 w-fit overflow-x-auto">
          {allowedTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              {t === "codes" ? "Invite Codes" : t === "users" ? "Users" : t === "roles" ? "Roles" : t === "badges" ? "Badges" : t === "bans" ? "Bans" : t === "domains" ? "Custom Domains" : "Logs"}
            </button>
          ))}
        </div>

        {tab === "codes" && (
          <>
            <div className="grid gap-6 sm:grid-cols-3 mb-8">
              <StatCard label="Total" value={codes.length} />
              <StatCard label="Used" value={codes.filter((c) => c.usedById).length} />
              <StatCard label="Available" value={codes.filter((c) => !c.usedById && !c.revokedAt && (!c.expiresAt || new Date(c.expiresAt).getTime() > Date.now())).length} />
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">User invite generation</h2>
                  <p className="text-sm text-zinc-500">
                    Allow non-admin users to generate invite codes. Role quotas and event allowances still
                    apply; invite-banned users stay excluded.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleGeneration(!inviteSettings?.userGenerationEnabled)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    inviteSettings?.userGenerationEnabled ? "bg-violet-500" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      inviteSettings?.userGenerationEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-3">
                {inviteSettings === null
                  ? "Loading…"
                  : inviteSettings.userGenerationEnabled
                  ? `Enabled — ${inviteSettings.eligibleUserCount} user(s) eligible.`
                  : "Disabled — users with a generation-enabled role still need this switch on."}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
              <h2 className="text-lg font-semibold text-white mb-1">Invite event</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Grant every non-banned user an invite allowance. They generate the codes themselves; the
                allowance and any code created from it expire on the chosen date.
              </p>

              {eventMsg && (
                <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${
                  eventMsg.startsWith("Failed") || eventMsg.startsWith("Please")
                    ? "bg-red-500/10 border border-red-500/20 text-red-400"
                    : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                }`}>
                  {eventMsg}
                </div>
              )}

              <form onSubmit={handleCreateEvent} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Invites per user
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={eventCount}
                    onChange={(e) => setEventCount(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Allowance expires in</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={eventExpiry}
                      onChange={(e) => setEventExpiry(Number(e.target.value))}
                      className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                    <select
                      value={eventUnit}
                      onChange={(e) => setEventUnit(e.target.value as "days" | "weeks")}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    >
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? "Granting…" : "Run event"}
                  </Button>
                </div>
              </form>

              {events.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-white mb-3">Recent events</h3>
                  <div className="space-y-2">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5">
                        <span className="text-zinc-300">
                          +{ev.count} invite{ev.count === 1 ? "" : "s"} per user
                        </span>
                        <span className="text-zinc-500">expires {ev.expiryDays}d</span>
                        <span className="text-zinc-500">by {ev.createdBy?.username ?? "deleted admin"}</span>
                        <span className="text-xs text-zinc-600 ml-auto">
                          {new Date(ev.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
              <h2 className="text-lg font-semibold text-white mb-4">Generate Invite Codes</h2>

              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Count</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Expires in days <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(e.target.value)}
                    placeholder="Never"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? "Creating..." : "Generate"}
                  </Button>
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-lg font-semibold text-white">All Invite Codes</h2>
                <div className="flex items-center gap-2">
                  {(["all", "available", "mine"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setInviteFilter(f)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        inviteFilter === f
                          ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                      }`}
                    >
                      {f === "all" ? "All" : f === "available" ? "Available" : "Created by me"}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const filtered = codes.filter((c) => {
                  if (inviteFilter === "mine") return c.createdById === user?.id;
                  if (inviteFilter === "available") {
                    return !c.usedById && !c.revokedAt && (!c.expiresAt || new Date(c.expiresAt).getTime() > Date.now());
                  }
                  return true;
                });
                if (filtered.length === 0) {
                  return <p className="text-sm text-zinc-500">{codes.length === 0 ? "No codes yet." : "No invite codes match this filter."}</p>;
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                          <th className="pb-3 font-medium">Code</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Created by</th>
                          <th className="pb-3 font-medium">Expires</th>
                          <th className="pb-3 font-medium">Created</th>
                          <th className="pb-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40">
                        {filtered.map((code) => (
                          <tr key={code.id}>
                            <td className="py-3 font-mono text-zinc-300">
                              {code.code}
                              {code.fromAllowance && (
                                <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400 border border-violet-500/20">
                                  EVENT
                                </span>
                              )}
                            </td>
                            <td className="py-3">
                              {code.revokedAt ? (
                                <span className="text-red-400">Revoked</span>
                              ) : code.usedById ? (
                                <span className="text-zinc-500">
                                  Used{code.usedBy ? ` by ${code.usedBy.username}` : ""}
                                </span>
                              ) : (
                                <span className="text-emerald-400">Available</span>
                              )}
                            </td>
                            <td className="py-3 text-zinc-400">
                              {code.createdBy?.username ?? code.createdById}
                            </td>
                            <td className="py-3 text-zinc-500">
                              {code.expiresAt
                                ? new Date(code.expiresAt).toLocaleDateString()
                                : "Never"}
                            </td>
                            <td className="py-3 text-zinc-500">
                              {new Date(code.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3">
                              {!code.usedById && !code.revokedAt && (
                                <button
                                  onClick={() => handleRevoke(code.id)}
                                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {tab === "users" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-4">All Users</h2>

            {users.length === 0 ? (
              <p className="text-sm text-zinc-500">No users.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">Username</th>
                      <th className="pb-3 font-medium">Email</th>
                      <th className="pb-3 font-medium">Role</th>
                      <th className="pb-3 font-medium">Tier</th>
                      <th className="pb-3 font-medium">Joined</th>
                      <th className="pb-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 font-mono text-zinc-300">
                          {u.username}
                          {u.inviteBanned && (
                            <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 border border-red-500/20">
                              INVITE BANNED
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-400">{u.email}</td>
                        <td className="py-3">
                          <span
                            className={`text-xs font-semibold ${
                              u.role?.slug === "admin" ? "text-violet-400" : "text-zinc-400"
                            }`}
                          >
                            {u.role?.name ?? "—"}
                          </span>
                          <span className="block text-[10px] text-zinc-600 mt-0.5">
                            (t:{u.trackLimit ?? "–"} p:{u.profileLimit ?? "–"} a:{u.aliasLimit ?? "–"})
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`text-xs font-semibold ${
                              u.tier === "PRO"
                                ? "text-emerald-400"
                                : u.tier === "ENTERPRISE"
                                ? "text-amber-400"
                                : "text-zinc-500"
                            }`}
                          >
                            {u.tier}
                          </span>
                        </td>
                        <td className="py-3 text-zinc-500">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          {canManageUsers && (
                            <div className="flex items-center gap-3">
                              {u.id !== user?.id && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                                  title="Permanently delete this user (GDPR erasure)"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              )}
                              <button
                                onClick={() => openEditProfile(u)}
                                className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                              >
                                <Edit className="h-3 w-3" />
                                Edit Profile
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === "roles" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <h2 className="text-lg font-semibold text-white mb-1">
                {roleForm.id ? "Edit Role" : "Create Role"}
              </h2>
              <p className="text-sm text-zinc-500 mb-4">
                The Admin role always has every permission. The User role and custom roles can be edited here.
              </p>

              {roleMsg && (
                <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${roleMsg === "Saved" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                  {roleMsg}
                </div>
              )}

              <form onSubmit={handleRoleSave} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name</label>
                    <input
                      type="text"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                      placeholder="e.g. Moderator"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
                    <input
                      type="text"
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                      placeholder="What is this role for?"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Invite generation
                  </label>
                  <p className="text-xs text-zinc-500 mb-3">
                    Requires the "Generate own invite codes" permission. Batch limit 0 disables role-based
                    generation. Outstanding limit 0 = unlimited. Cooldown 0 = none. Expiry bounds apply to
                    every code the role generates.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Max per batch (0 = off)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={roleForm.inviteBatchLimit}
                        onChange={(e) => setRoleForm({ ...roleForm, inviteBatchLimit: e.target.value })}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Max unused at once (0 = ∞)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={roleForm.inviteOutstandingLimit}
                        onChange={(e) => setRoleForm({ ...roleForm, inviteOutstandingLimit: e.target.value })}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Cooldown (minutes)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={roleForm.inviteCooldownMinutes}
                        onChange={(e) => setRoleForm({ ...roleForm, inviteCooldownMinutes: e.target.value })}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Default expiry (days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={roleForm.inviteDefaultExpiryDays}
                        onChange={(e) => setRoleForm({ ...roleForm, inviteDefaultExpiryDays: e.target.value })}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Min expiry (days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={roleForm.inviteMinExpiryDays}
                        onChange={(e) => setRoleForm({ ...roleForm, inviteMinExpiryDays: e.target.value })}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Max expiry (days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={roleForm.inviteMaxExpiryDays}
                        onChange={(e) => setRoleForm({ ...roleForm, inviteMaxExpiryDays: e.target.value })}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Permissions</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {PERMISSION_ORDER.map((perm) => {
                      const checked = roleForm.permissions.includes(perm);
                      const locked = roleForm.id !== null && roles.find((r) => r.id === roleForm.id)?.slug === "admin";
                      return (
                        <button
                          key={perm}
                          type="button"
                          disabled={locked}
                          onClick={() =>
                            setRoleForm((prev) => ({
                              ...prev,
                              permissions: checked
                                ? prev.permissions.filter((p) => p !== perm)
                                : [...prev.permissions, perm],
                            }))
                          }
                          className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm text-left transition-colors ${
                            locked
                              ? "border-zinc-800 bg-zinc-900/30 text-zinc-600 cursor-not-allowed"
                              : checked
                              ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                              : "border-zinc-800 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700"
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded border flex items-center justify-center text-[10px] ${
                              checked ? "bg-violet-500 border-violet-500 text-white" : "border-zinc-600"
                            }`}
                          >
                            {checked && "✓"}
                          </span>
                          {PERMISSION_LABELS[perm]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button type="submit">
                    <Save className="h-4 w-4" />
                    {roleForm.id ? "Save Role" : "Create Role"}
                  </Button>
                  {roleForm.id && (
                    <Button variant="secondary" onClick={() => setRoleForm({ id: null, name: "", description: "", permissions: [], inviteBatchLimit: "0", inviteOutstandingLimit: "0", inviteCooldownMinutes: "0", inviteDefaultExpiryDays: "30", inviteMinExpiryDays: "1", inviteMaxExpiryDays: "365" })}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <h2 className="text-lg font-semibold text-white mb-4">Roles</h2>
              {roles.length === 0 ? (
                <p className="text-sm text-zinc-500">No roles yet.</p>
              ) : (
                <div className="space-y-3">
                  {roles.map((r) => (
                    <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{r.name}</span>
                            {r.isSystem && (
                              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                System
                              </span>
                            )}
                            <span className="text-[11px] text-zinc-600">
                              {roleUserCount(r.id)} user{roleUserCount(r.id) === 1 ? "" : "s"}
                            </span>
                          </div>
                          {r.description && (
                            <p className="text-xs text-zinc-500 mt-0.5">{r.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {r.permissions.length === 0 ? (
                              <span className="text-[11px] text-zinc-600">No permissions</span>
                            ) : (
                              r.permissions.map((p) => (
                                <span key={p} className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-300 border border-zinc-700/50">
                                  {PERMISSION_LABELS[p] ?? p}
                                </span>
                              ))
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-600 mt-2">
                            Invites:{" "}
                            {r.inviteBatchLimit > 0
                              ? `${r.inviteBatchLimit}/batch · ${r.inviteOutstandingLimit > 0 ? `${r.inviteOutstandingLimit} outstanding` : "∞ outstanding"} · ${r.inviteCooldownMinutes}min cooldown · expiry ${r.inviteDefaultExpiryDays}d (${r.inviteMinExpiryDays}–${r.inviteMaxExpiryDays})`
                              : "generation disabled"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() =>
                              setRoleForm({
                                id: r.id,
                                name: r.name,
                                description: r.description ?? "",
                                permissions: r.permissions,
                                inviteBatchLimit: String(r.inviteBatchLimit ?? 0),
                                inviteOutstandingLimit: String(r.inviteOutstandingLimit ?? 0),
                                inviteCooldownMinutes: String(r.inviteCooldownMinutes ?? 0),
                                inviteDefaultExpiryDays: String(r.inviteDefaultExpiryDays ?? 30),
                                inviteMinExpiryDays: String(r.inviteMinExpiryDays ?? 1),
                                inviteMaxExpiryDays: String(r.inviteMaxExpiryDays ?? 365),
                              })
                            }
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </button>
                          {!r.isSystem && (
                            <button
                              onClick={() => handleRoleDelete(r.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "badges" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <h2 className="text-lg font-semibold text-white mb-1">
                {badgeForm.id ? "Edit Badge" : "Create Badge"}
              </h2>
              <p className="text-sm text-zinc-500 mb-4">
                Badges appear on profiles as colored icons. Pick a label, color and lucide icon name.
              </p>

              {badgeMsg && (
                <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${badgeMsg === "Saved" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                  {badgeMsg}
                </div>
              )}

              <form onSubmit={handleBadgeSave} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Label</label>
                    <input
                      type="text"
                      value={badgeForm.label}
                      onChange={(e) => setBadgeForm({ ...badgeForm, label: e.target.value })}
                      placeholder="e.g. Gold Member"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Slug <span className="text-zinc-500">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={badgeForm.slug}
                      onChange={(e) => setBadgeForm({ ...badgeForm, slug: e.target.value })}
                      placeholder="gold-member"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={badgeForm.color}
                        onChange={(e) => setBadgeForm({ ...badgeForm, color: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900/50 p-1"
                      />
                      <input
                        type="text"
                        value={badgeForm.color}
                        onChange={(e) => setBadgeForm({ ...badgeForm, color: e.target.value })}
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Icon <span className="text-zinc-500">(lucide name)</span>
                    </label>
                    <input
                      type="text"
                      value={badgeForm.icon}
                      onChange={(e) => setBadgeForm({ ...badgeForm, icon: e.target.value })}
                      placeholder="Award"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Preview</label>
                  <BadgePill badge={{ id: "preview", slug: badgeForm.slug || "preview", label: badgeForm.label || "Badge", color: badgeForm.color, icon: badgeForm.icon, isSystem: false }} size="lg" />
                </div>

                <div className="flex gap-3">
                  <Button type="submit">
                    <Save className="h-4 w-4" />
                    {badgeForm.id ? "Save Badge" : "Create Badge"}
                  </Button>
                  {badgeForm.id && (
                    <Button variant="secondary" onClick={() => setBadgeForm({ id: null, slug: "", label: "", color: "#a855f7", icon: "Award" })}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <h2 className="text-lg font-semibold text-white mb-4">Badges</h2>
              {badgeCatalog.length === 0 ? (
                <p className="text-sm text-zinc-500">No badges yet.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {badgeCatalog.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                      <BadgePill badge={b} size="lg" />
                      {!b.isSystem && (
                        <>
                          <button
                            onClick={() =>
                              setBadgeForm({
                                id: b.id,
                                slug: b.slug,
                                label: b.label,
                                color: b.color,
                                icon: b.icon,
                              })
                            }
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleBadgeDelete(b.id)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "bans" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">Auth Bans &amp; Lockouts</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Automatically applied to fingerprints (IP, cookie, user agent) and accounts after repeated failed
              auth attempts. Remove a record to allow access again.
            </p>

            {bans.length === 0 ? (
              <p className="text-sm text-zinc-500">No bans or lockouts.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium">Value</th>
                      <th className="pb-3 font-medium">Failures</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Updated</th>
                      <th className="pb-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {bans.map((ban) => {
                      const locked = ban.permanent || (ban.lockedUntil && new Date(ban.lockedUntil) > new Date());
                      const value =
                        ban.kind === "COOKIE" ? `${ban.value.slice(0, 12)}…` : ban.value;
                      return (
                        <tr key={ban.id}>
                          <td className="py-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                              {ban.kind}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-zinc-300">{value}</td>
                          <td className="py-3 text-zinc-400">{ban.failCount}</td>
                          <td className="py-3">
                            {ban.permanent ? (
                              <span className="text-red-400 text-xs font-semibold">Permanent ban</span>
                            ) : locked ? (
                              <span className="text-amber-400 text-xs font-semibold">
                                Locked until{" "}
                                {new Date(ban.lockedUntil as string).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-emerald-400 text-xs">Clear</span>
                            )}
                          </td>
                          <td className="py-3 text-zinc-500">
                            {new Date(ban.updatedAt).toLocaleString()}
                          </td>
                          <td className="py-3">
                            {ban.kind === "ACCOUNT" && (
                              <button
                                onClick={() => handleUnlockAccount(ban.accountId!)}
                                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors mr-3"
                              >
                                Unlock
                              </button>
                            )}
                            <button
                              onClick={() => handleUnban(ban.id)}
                              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                            >
                              Unban
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === "logs" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">Auth Log</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Failed auth attempts with the applied penalty. Entries are pruned automatically once their lock
              expires or after the retention period.
            </p>

            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500">No auth log entries.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">Time</th>
                      <th className="pb-3 font-medium">User</th>
                      <th className="pb-3 font-medium">Reason</th>
                      <th className="pb-3 font-medium">IP</th>
                      <th className="pb-3 font-medium">Penalty</th>
                      <th className="pb-3 font-medium">Triggered by</th>
                      <th className="pb-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {logs.map((log) => {
                      const locked = log.accountId && (log.permanent || log.penaltyMinutes !== null);
                      return (
                        <tr key={log.id}>
                          <td className="py-3 whitespace-nowrap text-zinc-500">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 font-mono text-zinc-300">{log.username ?? "—"}</td>
                          <td className="py-3 text-zinc-300">{log.reason}</td>
                          <td className="py-3 font-mono text-zinc-500">{log.ip}</td>
                          <td className="py-3">
                            {log.permanent ? (
                              <span className="text-red-400 text-xs font-semibold">Permanent lock</span>
                            ) : log.penaltyMinutes !== null ? (
                              <span className="text-amber-400 text-xs">+{log.penaltyMinutes} min</span>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3 text-zinc-500">{log.triggeredBy ?? "—"}</td>
                          <td className="py-3">
                            {locked && (
                              <button
                                onClick={() => handleUnlockAccount(log.accountId!)}
                                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                              >
                                Unlock
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "domains" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">Custom Domains</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Self-serve custom domain requests. Users prove ownership with a TXT record; review verified
              requests and activate or reject them here.
            </p>

            {domains.length === 0 ? (
              <p className="text-sm text-zinc-500">No custom domain requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">Domain</th>
                      <th className="pb-3 font-medium">Owner</th>
                      <th className="pb-3 font-medium">Profile</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">TLS</th>
                      <th className="pb-3 font-medium">Requested</th>
                      <th className="pb-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {domains.map((d) => (
                      <tr key={d.id}>
                        <td className="py-3 font-mono text-zinc-200">{d.domain}</td>
                        <td className="py-3 text-zinc-300">
                          @{d.owner?.username ?? "—"}
                          <span className="block text-xs text-zinc-500">
                            {d.owner?.tier ?? ""} {d.owner?.email ? `· ${d.owner.email}` : ""}
                          </span>
                        </td>
                        <td className="py-3 text-zinc-300">
                          {d.profileSlug}
                          {d.rootTarget ? (
                            <span className="block text-xs text-zinc-500">root → {d.rootTarget}</span>
                          ) : (
                            <span className="block text-xs text-zinc-600">root → landing</span>
                          )}
                        </td>
                        <td className="py-3">
                          {d.status === "VERIFIED" ? (
                            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                              Verified
                            </span>
                          ) : d.status === "ACTIVE" ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                              Active
                            </span>
                          ) : d.status === "REJECTED" ? (
                            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                              Rejected
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                              Pending TXT
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          {d.status === "ACTIVE" && d.tlsStatus === "ISSUED" ? (
                            <span className="text-xs text-emerald-400" title={d.tlsError ?? undefined}>
                              valid to {d.tlsExpiresAt ? new Date(d.tlsExpiresAt).toLocaleDateString() : "—"}
                            </span>
                          ) : d.status === "ACTIVE" && d.tlsStatus === "PENDING" ? (
                            <span className="text-xs text-amber-400">issuing…</span>
                          ) : d.status === "ACTIVE" && d.tlsStatus === "FAILED" ? (
                            <span className="text-xs text-red-400" title={d.tlsError ?? undefined}>
                              failed
                            </span>
                          ) : d.status === "ACTIVE" ? (
                            <span className="text-xs text-zinc-500">none</span>
                          ) : (
                            <span className="text-xs text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-500 whitespace-nowrap">
                          {new Date(d.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          {d.status === "VERIFIED" ? (
                            <button
                              onClick={() => handleApproveDomain(d.id)}
                              className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                            >
                              Activate
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                          {(d.status === "VERIFIED" || d.status === "PENDING_VERIFICATION") && (
                            <button
                              onClick={() => handleRejectDomain(d.id)}
                              className="ml-2 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition-colors"
                            >
                              Reject
                            </button>
                          )}
                          {d.status === "ACTIVE" && d.tlsStatus !== "ISSUED" && d.tlsStatus !== "PENDING" && (
                            <button
                              onClick={() => handleIssueCert(d.id)}
                              className="ml-2 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-400 hover:bg-violet-500/25 transition-colors"
                            >
                              Issue cert
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Edit Profile</h2>
                <p className="text-sm text-zinc-400">@{editingUser.username}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={editProfile.displayName ?? ""}
                    onChange={(e) =>
                      setEditProfile({ ...editProfile, displayName: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Bio</label>
                  <textarea
                    value={editProfile.bio ?? ""}
                    onChange={(e) =>
                      setEditProfile({ ...editProfile, bio: e.target.value })
                    }
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Location
                    </label>
                    <input
                      type="text"
                      value={editProfile.location ?? ""}
                      onChange={(e) =>
                        setEditProfile({ ...editProfile, location: e.target.value })
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Website
                    </label>
                    <input
                      type="url"
                      value={editProfile.website ?? ""}
                      onChange={(e) =>
                        setEditProfile({ ...editProfile, website: e.target.value })
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tier</label>
                    <select
                      value={editTier}
                      onChange={(e) => setEditTier(e.target.value as "FREE" | "PRO" | "ENTERPRISE")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    >
                      <option value="FREE">Free</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Track Limit <span className="text-zinc-500">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editTrackLimit}
                      onChange={(e) => setEditTrackLimit(e.target.value)}
                      placeholder="Tier default"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Profile Limit <span className="text-zinc-500">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editProfileLimit}
                      onChange={(e) => setEditProfileLimit(e.target.value)}
                      placeholder="Tier default"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Alias Limit <span className="text-zinc-500">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editAliasLimit}
                      onChange={(e) => setEditAliasLimit(e.target.value)}
                      placeholder="Tier default"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-zinc-300">Public</label>
                  <button
                    onClick={() =>
                      setEditProfile({ ...editProfile, isPublic: !editProfile.isPublic })
                    }
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      editProfile.isPublic ? "bg-violet-600" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        editProfile.isPublic ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Role</label>
                  <select
                    value={editRoleId}
                    onChange={(e) => setEditRoleId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.isSystem ? " (System)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Badges</label>
                  <div className="flex flex-wrap gap-2">
                    {badgeCatalog.map((badge) => {
                      const active = editBadges.includes(badge.id);
                      return (
                        <button
                          key={badge.id}
                          type="button"
                          onClick={() =>
                            setEditBadges((prev) =>
                              active ? prev.filter((b) => b !== badge.id) : [...prev, badge.id]
                            )
                          }
                          className={`rounded-full transition-all duration-200 ${
                            active
                              ? "scale-105 ring-2 ring-offset-1 ring-offset-zinc-900"
                              : "opacity-40 grayscale hover:opacity-80 hover:grayscale-0"
                          }`}
                          style={{ border: `1px solid ${badge.color}40` }}
                        >
                          <BadgePill badge={badge} />
                        </button>
                      );
                    })}
                    {badgeCatalog.length === 0 && (
                      <span className="text-[11px] text-zinc-600">No badges available</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 px-3.5 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">Invite access</p>
                    <p className="text-xs text-zinc-500">
                      {editingUser.inviteBanned
                        ? "Banned from invite events and invite generation."
                        : "Allowed to join invite events and generate invites."}
                    </p>
                  </div>
                  {editingUser.id !== user?.id && (
                    <button
                      type="button"
                      onClick={() => handleInviteBan(editingUser, !editingUser.inviteBanned)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        editingUser.inviteBanned
                          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                          : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                      }`}
                    >
                      {editingUser.inviteBanned ? "Unban invites" : "Ban invites"}
                    </button>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setEditingUser(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={editLoading}>
                    <Save className="h-4 w-4" />
                    {editSaved ? "Saved!" : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-5">
      <p className="text-sm text-zinc-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
