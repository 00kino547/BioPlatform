import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "@/contexts/useAuth";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { UpdateDialog } from "@/components/updates/UpdateDialog";
import { AppFooter } from "@/components/layout/AppFooter";
import { useUpdateLockdown } from "@/lib/useVersionCheck";
import { getToken, type Badge, type Role, type InviteGrantEvent } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/intl";
import { BadgePill } from "@/components/ui/BadgePill";
import { X, Edit, Save, Trash2, ShieldAlert, Sparkles } from "lucide-react";
import {
  SeasonalThemesTab,
  type SeasonalThemeAdmin,
  type SeasonalAdminConfig,
  type SeasonalThemesData,
} from "./admin/SeasonalThemesTab";
import { LandingConfigTab } from "./admin/LandingConfigTab";
import { AdminAffiliateTab } from "./admin/AdminAffiliateTab";
import { AdminOrdersTab } from "./admin/AdminOrdersTab";
import { AdminNewsletterTab } from "./admin/AdminNewsletterTab";
import { AdminPolicyTab } from "./admin/AdminPolicyTab";
import { AdminInvitePurchaseCard } from "./admin/AdminInvitePurchaseCard";
import { ModerationTab } from "./admin/ModerationTab";
import { Pagination } from "./admin/Pagination";

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
  seatLimit: number | null;
  seatsUsed: number;
  hasPaidOrder: boolean;
  badges: string[];
  inviteBanned: boolean;
  inviteBannedAt: string | null;
  inviteAllowance: number;
  createdAt: string;
  updatedAt: string;
  passkeyCount: number;
  passkeysFreshCount: number;
  residentPasskeyCount: number;
  residentFreshCount: number;
  hasNoPasskeys: boolean;
  passkeysUnverified: boolean;
  securityFlag: "none" | "no-passkeys" | "passkeys-unverified";
}

interface UserProfile {
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  location: string | null;
  website: string | null;
  socialLinks: { platform: string; url: string; label?: string }[] | null;
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

interface AdminWhitelistEntry {
  id: string;
  value: string;
  note: string;
  createdAt: string;
  createdBy: string;
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

type Tab = "codes" | "users" | "roles" | "badges" | "bans" | "moderation" | "logs" | "domains" | "themes" | "landing" | "affiliates" | "orders" | "newsletter" | "policy";

function securityFlagLabel(flag: User["securityFlag"], t: TFunction<"admin">): string {
  return flag === "no-passkeys"
    ? t("admin.securityFlags.noPasskey")
    : flag === "passkeys-unverified"
    ? t("admin.securityFlags.passkeysUnverified")
    : "";
}

function securityFlagReason(u: User, t: TFunction<"admin">): string {
  if (u.securityFlag === "no-passkeys") {
    return t("admin.securityFlags.noPasskeyHint");
  }
  if (u.securityFlag === "passkeys-unverified") {
    const stale = u.passkeyCount - u.passkeysFreshCount;
    const staleResident = u.residentPasskeyCount - u.residentFreshCount;
    let reason = t("admin.securityFlags.stale", { stale, total: u.passkeyCount, s: u.passkeyCount === 1 ? "" : "s" });
    if (staleResident > 0) reason += t("admin.securityFlags.staleResident", { count: staleResident, s: staleResident === 1 ? "" : "s" });
    return reason;
  }
  return "";
}

const PERMISSION_ORDER = [
  "users.view",
  "users.manage",
  "profiles.manage",
  "profiles.customDomain",
  "invites.manage",
  "invites.generate",
  "bans.manage",
  "moderation.manage",
  "roles.manage",
  "badges.manage",
  "themes.manage",
  "affiliates.manage",
  "orders.manage",
  "settings.manage",
  "newsletter.manage",
  "logs.view",
  "api.basic",
  "api.advanced",
  "api.enterprise",
];

const PAGE_SIZE = 10;

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const { t } = useTranslation("admin");
  const perms = new Set(user?.permissions ?? []);

  usePageMeta({ title: t("dashboard:dashboard.header.adminPanel"), description: t("admin.meta.description", { name: branding.name }), url: "/admin" });
  const canInvites = perms.has("invites.manage");
  const canViewUsers = perms.has("users.view");
  const canManageUsers = perms.has("users.manage");
  const canRoles = perms.has("roles.manage");
  const canBadges = perms.has("badges.manage");
  const canBans = perms.has("bans.manage");
  const canModeration = perms.has("moderation.manage");
  const canLogs = perms.has("logs.view");
  const canDomains = perms.has("profiles.manage");
  const canThemes = perms.has("themes.manage");
  const canLanding = perms.has("settings.manage");
  const canAffiliates = perms.has("affiliates.manage");
  const canOrders = perms.has("orders.manage");
  const canNewsletter = perms.has("newsletter.manage");

  const allowedTabs: Tab[] = [
    ...(canInvites ? (["codes"] as Tab[]) : []),
    ...(canViewUsers ? (["users"] as Tab[]) : []),
    ...(canRoles ? (["roles"] as Tab[]) : []),
    ...(canBadges ? (["badges"] as Tab[]) : []),
    ...(canBans ? (["bans"] as Tab[]) : []),
    ...(canModeration ? (["moderation"] as Tab[]) : []),
    ...(canLogs ? (["logs"] as Tab[]) : []),
    ...(canDomains ? (["domains"] as Tab[]) : []),
    ...(canThemes ? (["themes"] as Tab[]) : []),
    ...(canLanding ? (["landing"] as Tab[]) : []),
    ...(canAffiliates ? (["affiliates"] as Tab[]) : []),
    ...(canOrders ? (["orders"] as Tab[]) : []),
    ...(canNewsletter ? (["newsletter"] as Tab[]) : []),
    ...(canLanding ? (["policy"] as Tab[]) : []),
  ];
  const [tab, setTab] = useState<Tab>(allowedTabs[0] ?? "codes");
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [codeCounts, setCodeCounts] = useState<{ total: number; used: number; revoked: number; available: number } | null>(null);
  const [inviteFilter, setInviteFilter] = useState<"all" | "available" | "mine">("all");
  const [users, setUsers] = useState<User[]>([]);
  const [invitesPage, setInvitesPage] = useState(0);
  const [invitesTotal, setInvitesTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [bansPage, setBansPage] = useState(0);
  const [bansTotal, setBansTotal] = useState(0);
  const [whitelistPage, setWhitelistPage] = useState(0);
  const [whitelistTotal, setWhitelistTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(0);
  const [logsTotal, setLogsTotal] = useState(0);
  const [domainsPage, setDomainsPage] = useState(0);
  const [domainsTotal, setDomainsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(0);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [roles, setRoles] = useState<Role[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<Badge[]>([]);
  const [bans, setBans] = useState<AuthBan[]>([]);
  const [whitelist, setWhitelist] = useState<AdminWhitelistEntry[]>([]);
  const [wlValue, setWlValue] = useState("");
  const [wlNote, setWlNote] = useState("");
  const [wlMsg, setWlMsg] = useState("");
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

  const [themesData, setThemesData] = useState<SeasonalThemesData | null>(null);
  const [themesError, setThemesError] = useState("");
  const [themesSaving, setThemesSaving] = useState(false);
  const [themeError, setThemeError] = useState("");
  const [themeSaved, setThemeSaved] = useState(false);

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
  const [editSeatLimit, setEditSeatLimit] = useState("");
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

  const { locked, data: versionData } = useUpdateLockdown();
  const [updateOpen, setUpdateOpen] = useState(false);
  const autoOpenedUpdate = useRef(false);

  useEffect(() => {
    if (locked && !autoOpenedUpdate.current) {
      autoOpenedUpdate.current = true;
      setUpdateOpen(true);
    }
  }, [locked]);

  const fetchCodes = async (page = invitesPage, filter = inviteFilter) => {
    const token = getToken();
    const res = await fetch(`/api/admin/invites?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}&filter=${filter}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setCodes(data.data);
      if (data.pagination) setInvitesTotal(data.pagination.total);
      if (data.counts) setCodeCounts(data.counts);
    }
  };

  const fetchInviteSettings = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/invite-settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setInviteSettings(data.data);
  };

  const fetchEvents = async (page = eventsPage) => {
    const token = getToken();
    const res = await fetch(`/api/admin/invite-events?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setEvents(data.data);
      if (data.pagination) setEventsTotal(data.pagination.total);
    }
  };

  const fetchUsers = async (page = usersPage) => {
    const token = getToken();
    const res = await fetch(`/api/admin/users?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setUsers(data.data);
      if (data.pagination) setUsersTotal(data.pagination.total);
    }
  };

  const fetchBans = async (page = bansPage) => {
    const token = getToken();
    const res = await fetch(`/api/admin/auth-bans?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setBans(data.data);
      if (data.pagination) setBansTotal(data.pagination.total);
    }
  };

  const fetchWhitelist = async (page = whitelistPage) => {
    const token = getToken();
    const res = await fetch(`/api/admin/whitelist?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setWhitelist(data.data);
      if (data.pagination) setWhitelistTotal(data.pagination.total);
    }
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

  const fetchLogs = async (page = logsPage) => {
    const token = getToken();
    const res = await fetch(`/api/admin/auth-logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setLogs(data.data);
      if (data.pagination) setLogsTotal(data.pagination.total);
    }
  };

  const fetchDomains = async (page = domainsPage) => {
    const token = getToken();
    const res = await fetch(`/api/admin/custom-domains?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setDomains(data.data);
      if (data.pagination) setDomainsTotal(data.pagination.total);
    }
  };

  const fetchThemes = async () => {
    const token = getToken();
    const res = await fetch("/api/admin/themes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setThemesData(data.data);
      setThemesError("");
    } else {
      setThemesError(data.error ?? t("admin.toasts.loadSeasonalThemesFailed"));
    }
  };

  const saveThemeConfig = async (config: SeasonalAdminConfig) => {
    setThemesSaving(true);
    setThemeError("");
    setThemeSaved(false);
    const token = getToken();
    const res = await fetch("/api/admin/themes/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    setThemesSaving(false);
    if (data.success) {
      setThemeSaved(true);
      setTimeout(() => setThemeSaved(false), 2000);
      fetchThemes();
    } else {
      setThemeError(data.error ?? t("admin.toasts.saveThemeSettingsFailed"));
    }
  };

  const updateThemeField = async (
    id: string,
    patch: Partial<SeasonalThemeAdmin>
  ) => {
    const theme = themesData?.themes.find((t) => t.id === id);
    if (!theme) return;
    setThemesSaving(true);
    setThemeError("");
    const token = getToken();
    const res = await fetch(`/api/admin/themes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...theme, ...patch }),
    });
    const data = await res.json();
    setThemesSaving(false);
    if (data.success) {
      fetchThemes();
    } else {
      setThemeError(data.error ?? t("admin.toasts.updateThemeFailed"));
    }
  };

  const uploadThemeBackground = async (id: string, file: File): Promise<boolean> => {
    const form = new FormData();
    form.append("background", file);
    const token = getToken();
    const res = await fetch(`/api/admin/themes/${id}/background`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (data.success) {
      fetchThemes();
      return true;
    }
    setThemeError(data.error ?? t("admin.toasts.uploadBackgroundFailed"));
    return false;
  };

  const removeThemeBackground = async (id: string): Promise<boolean> => {
    const token = getToken();
    const res = await fetch(`/api/admin/themes/${id}/background`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      fetchThemes();
      return true;
    }
    setThemeError(data.error ?? t("admin.toasts.removeBackgroundFailed"));
    return false;
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
      window.alert(data.error ?? t("admin.toasts.approveDomainFailed"));
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
      window.alert(data.error ?? t("admin.toasts.rejectDomainFailed"));
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
      window.alert(data.error ?? t("admin.toasts.issueCertFailed"));
    }
  };

  const handleRemoveDomain = async (d: AdminDomainEntry) => {
    if (!window.confirm(
      t("admin.toasts.removeDomainConfirm", { domain: d.domain })
    )) return;
    const token = getToken();
    const res = await fetch(`/api/admin/custom-domains/${d.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setDomains((prev) => prev.filter((x) => x.id !== d.id));
      setDomainsTotal((t) => Math.max(t - 1, 0));
    } else {
      window.alert(data.error ?? t("admin.toasts.removeDomainFailed"));
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
      setBansTotal((t) => Math.max(t - 1, 0));
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

  const handleAddWhitelist = async (e: FormEvent) => {
    e.preventDefault();
    setWlMsg("");
    if (!wlValue.trim()) {
      setWlMsg(t("admin.toasts.enterIpOrCidr"));
      return;
    }
    const token = getToken();
    const res = await fetch("/api/admin/whitelist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value: wlValue.trim(), note: wlNote.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      setWlValue("");
      setWlNote("");
      await fetchWhitelist(0);
      setWhitelistPage(0);
    } else {
      setWlMsg(data.error ?? t("admin.toasts.addAllowlistFailed"));
    }
  };

  const handleRemoveWhitelist = async (id: string) => {
    const token = getToken();
    const res = await fetch(`/api/admin/whitelist/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      await fetchWhitelist();
    } else {
      window.alert(data.error ?? t("admin.toasts.removeAllowlistFailed"));
    }
  };

  useEffect(() => {
    if (tab === "codes" && canInvites) {
      fetchCodes();
      fetchInviteSettings();
      fetchEvents();
    }
    if (tab === "users" && canViewUsers) {
      fetchUsers();
      if (canRoles) fetchRoles();
      if (canBadges) fetchBadges();
    }
    if (tab === "roles" && canRoles) fetchRoles();
    if (tab === "badges" && canBadges) fetchBadges();
    if (tab === "bans" && canBans) {
      fetchBans();
      fetchWhitelist();
    }
    if (tab === "logs" && canLogs) fetchLogs();
    if (tab === "domains" && canDomains) fetchDomains();
    if (tab === "themes" && canThemes) fetchThemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body: Record<string, unknown> = { count };
    if (expiresDays) body.expiresInDays = Number(expiresDays);

    const token = getToken();
    const res = await fetch("/api/admin/invites", {
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
      setError(data.error ?? t("admin.toasts.createCodesFailed"));
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
      await fetchCodes();
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
      setEventMsg(data.error ?? t("admin.toasts.updateInviteSettingsFailed"));
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
      setEventMsg(data.error ?? t("admin.toasts.runInviteEventFailed"));
      return;
    }
    setEventMsg(
      t("admin.inviteEvent.granted", { count: data.data.grantedUsers, each: eventCount, date: formatDate(data.data.allowanceExpiresAt) })
    );
    await fetchEvents();
    await fetchCodes();
    setTimeout(() => setEventMsg(""), 5000);
  };

  const handleInviteBan = async (u: User, banned: boolean) => {
    if (banned && !window.confirm(
      t("admin.toasts.banConfirm", { username: u.username })
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
      window.alert(data.error ?? t("admin.toasts.updateInviteBanFailed"));
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!window.confirm(
      t("admin.toasts.deleteUserConfirm", { username: u.username })
    )) return;
    const token = getToken();
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      void fetchUsers(usersPage);
      if (canBans) fetchBans();
      if (canLogs) fetchLogs();
    } else {
      window.alert(data.error ?? t("admin.toasts.deleteUserFailed"));
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
    setEditSeatLimit(u.seatLimit !== null && u.seatLimit !== undefined ? String(u.seatLimit) : "");
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
    const seatLimitValue = editSeatLimit === "" ? null : Number(editSeatLimit);
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
        seatLimit: seatLimitValue,
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
                seatLimit: userData.data.seatLimit,
                seatsUsed: userData.data.seatsUsed,
                hasPaidOrder: userData.data.hasPaidOrder,
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
      setRoleMsg(data.error ?? t("admin.toasts.saveRoleFailed"));
      return;
    }
    setRoleMsg(t("admin.roles.saved"));
    setRoleForm({ id: null, name: "", description: "", permissions: [], inviteBatchLimit: "0", inviteOutstandingLimit: "0", inviteCooldownMinutes: "0", inviteDefaultExpiryDays: "30", inviteMinExpiryDays: "1", inviteMaxExpiryDays: "365" });
    fetchRoles();
    setTimeout(() => setRoleMsg(""), 2000);
  };

  const handleRoleDelete = async (id: string) => {
    if (!window.confirm(t("admin.toasts.deleteRoleConfirm"))) return;
    const token = getToken();
    const res = await fetch(`/api/admin/roles/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } else {
      setRoleMsg(data.error ?? t("admin.toasts.deleteRoleFailed"));
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
      setBadgeMsg(data.error ?? t("admin.toasts.saveBadgeFailed"));
      return;
    }
    setBadgeMsg(t("admin.badges.saved"));
    setBadgeForm({ id: null, slug: "", label: "", color: "#a855f7", icon: "Award" });
    fetchBadges();
    setTimeout(() => setBadgeMsg(""), 2000);
  };

  const handleBadgeDelete = async (id: string) => {
    if (!window.confirm(t("admin.toasts.deleteBadgeConfirm"))) return;
    const token = getToken();
    const res = await fetch(`/api/admin/badges/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setBadgeCatalog((prev) => prev.filter((b) => b.id !== id));
    } else {
      setBadgeMsg(data.error ?? t("admin.toasts.deleteBadgeFailed"));
      setTimeout(() => setBadgeMsg(""), 3000);
    }
  };

  const roleUserCount = (roleId: string) => users.filter((u) => u.roleId === roleId).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-zinc-800/80 bg-zinc-900/30">
        <div className="mx-auto flex h-auto min-h-16 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm text-violet-400 hover:text-violet-300 transition-colors font-medium"
            >
              {t("admin.header.myDashboard")}
            </Link>
            <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
              {user?.username}
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-semibold text-violet-400 border border-violet-500/20">
                {user?.role?.name ?? t("admin.header.staff")}
              </span>
            </span>
            {versionData?.prereleaseAvailable && versionData.prereleaseLatest && (
              <span
                title={t("admin.header.prereleaseNotice", { version: versionData.prereleaseLatest })}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 border border-amber-500/20"
              >
                <Sparkles className="h-3 w-3" />
                {t("admin.header.prereleaseAvailable", { version: versionData.prereleaseLatest })}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUpdateOpen(true)}
              className={locked ? "border-red-500/30 text-red-300" : undefined}
            >
              <ShieldAlert className={`h-4 w-4 ${locked ? "text-red-400" : ""}`} />
              {t("admin.header.updates")}
            </Button>
            <Button variant="secondary" size="sm" onClick={logout}>
              {t("admin.header.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <h1 className="text-2xl font-bold text-white mb-2">{t("admin.header.title")}</h1>
        <p className="text-zinc-400 mb-8">{t("admin.header.subtitle")}</p>

        {locked && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <ShieldAlert className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-300">
              <p className="font-semibold">{t("admin.header.criticalRequired")}</p>
              <p className="mt-0.5 text-red-300/80">
                {t("admin.header.criticalBody")}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1 mb-8 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-1">
          {allowedTabs.map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === tabKey
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              {t(`admin.tabs.${tabKey}`)}
            </button>
          ))}
        </div>

        {tab === "codes" && (
          <>
            <div className="grid gap-6 sm:grid-cols-3 mb-8">
              <StatCard label={t("admin.stats.total")} value={codeCounts?.total ?? invitesTotal} />
              <StatCard label={t("admin.stats.used")} value={codeCounts?.used ?? codes.filter((c) => c.usedById).length} />
              <StatCard label={t("admin.stats.available")} value={codeCounts?.available ?? codes.filter((c) => !c.usedById && !c.revokedAt && (!c.expiresAt || new Date(c.expiresAt).getTime() > Date.now())).length} />
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-1">{t("admin.inviteSettings.userGenerationTitle")}</h2>
                  <p className="text-sm text-zinc-500">
                    {t("admin.inviteSettings.userGenerationDescription")}
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
                  ? t("admin.inviteSettings.loading")
                  : inviteSettings.userGenerationEnabled
                  ? t("admin.inviteSettings.enabled", { count: inviteSettings.eligibleUserCount })
                  : t("admin.inviteSettings.disabled")}
              </p>
            </div>

            <AdminInvitePurchaseCard />

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
              <h2 className="text-lg font-semibold text-white mb-1">{t("admin.inviteEvent.title")}</h2>
              <p className="text-sm text-zinc-500 mb-4">
                {t("admin.inviteEvent.description")}
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
                    {t("admin.inviteEvent.invitesPerUser")}
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
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.inviteEvent.allowanceExpiresIn")}</label>
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
                      <option value="days">{t("admin.inviteEvent.unitDays")}</option>
                      <option value="weeks">{t("admin.inviteEvent.unitWeeks")}</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? t("admin.inviteEvent.granting") : t("admin.inviteEvent.runEvent")}
                  </Button>
                </div>
              </form>

              {events.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-white mb-3">{t("admin.inviteEvent.recentEvents")}</h3>
                  <div className="space-y-2">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5">
                        <span className="text-zinc-300">
                          {t("admin.inviteEvent.perUserLine", { count: ev.count, s: ev.count === 1 ? "" : "s" })}
                        </span>
                        <span className="text-zinc-500">{t("admin.inviteEvent.expires")} {ev.expiryDays}{t("admin.inviteEvent.daySuffix")}</span>
                        <span className="text-zinc-500">{t("admin.inviteEvent.by")} {ev.createdBy?.username ?? t("admin.inviteEvent.deletedAdmin")}</span>
                        <span className="text-xs text-zinc-600 ml-auto">
                          {formatDateTime(ev.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Pagination
                    page={eventsPage}
                    total={eventsTotal}
                    pageSize={PAGE_SIZE}
                    onPage={(p) => {
                      setEventsPage(p);
                      void fetchEvents(p);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-8">
              <h2 className="text-lg font-semibold text-white mb-4">{t("admin.generateForm.title")}</h2>

              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.generateForm.count")}</label>
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
                    {t("admin.generateForm.expiresInDays")} <span className="text-zinc-500">{t("admin.generateForm.optional")}</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(e.target.value)}
                    placeholder={t("admin.generateForm.neverPlaceholder")}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading} className="whitespace-nowrap">
                    {loading ? t("admin.generateForm.creating") : t("admin.generateForm.generate")}
                  </Button>
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-lg font-semibold text-white">{t("admin.codesTable.title")}</h2>
                <div className="flex items-center gap-2">
                  {(["all", "available", "mine"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setInviteFilter(f);
                        setInvitesPage(0);
                        void fetchCodes(0, f);
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        inviteFilter === f
                          ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                      }`}
                    >
                      {f === "all" ? t("admin.codesTable.filterAll") : f === "available" ? t("admin.codesTable.filterAvailable") : t("admin.codesTable.filterCreatedByMe")}
                    </button>
                  ))}
                </div>
              </div>

              {codes.length === 0 ? (
                <p className="text-sm text-zinc-500">{inviteFilter === "all" ? t("admin.codesTable.noCodes") : t("admin.codesTable.noMatch")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                        <th className="pb-3 font-medium">{t("admin.codesTable.headerCode")}</th>
                        <th className="pb-3 font-medium">{t("admin.codesTable.headerStatus")}</th>
                        <th className="pb-3 font-medium">{t("admin.codesTable.headerCreatedBy")}</th>
                        <th className="pb-3 font-medium">{t("admin.codesTable.headerExpires")}</th>
                        <th className="pb-3 font-medium">{t("admin.codesTable.headerCreated")}</th>
                        <th className="pb-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {codes.map((code) => (
                          <tr key={code.id}>
                            <td className="py-3 font-mono text-zinc-300">
                              {code.code}
                              {code.fromAllowance && (
                                <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400 border border-violet-500/20">
                                  {t("admin.codesTable.statusEvent")}
                                </span>
                              )}
                            </td>
                            <td className="py-3">
                              {code.revokedAt ? (
                                <span className="text-red-400">{t("admin.codesTable.statusRevoked")}</span>
                              ) : code.usedById ? (
                                <span className="text-zinc-500">
                                  {t("admin.codesTable.statusUsed")}{code.usedBy ? t("admin.codesTable.usedBy", { username: code.usedBy.username }) : ""}
                                </span>
                              ) : (
                                <span className="text-emerald-400">{t("admin.codesTable.statusAvailable")}</span>
                              )}
                            </td>
                            <td className="py-3 text-zinc-400">
                              {code.createdBy?.username ?? code.createdById}
                            </td>
                            <td className="py-3 text-zinc-500">
                              {code.expiresAt
                                ? formatDate(code.expiresAt)
                                : t("admin.codesTable.never")}
                            </td>
                            <td className="py-3 text-zinc-500">
                              {formatDate(code.createdAt)}
                            </td>
                            <td className="py-3">
                              {!code.usedById && !code.revokedAt && (
                                <button
                                  onClick={() => handleRevoke(code.id)}
                                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                  {t("admin.codesTable.revoke")}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              )}
              <Pagination
                page={invitesPage}
                total={invitesTotal}
                pageSize={PAGE_SIZE}
                onPage={(p) => {
                  setInvitesPage(p);
                  void fetchCodes(p, inviteFilter);
                }}
              />
            </div>
          </>
        )}

        {tab === "users" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-4">{t("admin.usersTable.title")}</h2>

            {users.some((u) => u.securityFlag !== "none") && (
              <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                  <ShieldAlert className="h-4 w-4" />
                  {t("admin.usersTable.passkeyFlags")}
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  {t("admin.usersTable.passkeyFlagsDescription")}
                </p>
                <ul className="mt-3 space-y-2">
                  {users
                    .filter((u) => u.securityFlag !== "none")
                    .map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-mono text-red-300">{u.username}</span>
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 border border-red-500/20">
                          {securityFlagLabel(u.securityFlag, t)}
                        </span>
                        <span className="text-zinc-400">{securityFlagReason(u, t)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {users.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("admin.usersTable.noUsers")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">{t("admin.usersTable.headerUsername")}</th>
                      <th className="pb-3 font-medium">{t("admin.usersTable.headerEmail")}</th>
                      <th className="pb-3 font-medium">{t("admin.usersTable.headerRole")}</th>
                      <th className="pb-3 font-medium">{t("admin.usersTable.headerTier")}</th>
                      <th className="pb-3 font-medium">{t("admin.usersTable.headerJoined")}</th>
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
                              {t("admin.usersTable.inviteBanned")}
                            </span>
                          )}
                          {u.securityFlag !== "none" && (
                            <span
                              title={securityFlagReason(u, t)}
                              className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 border border-red-500/20"
                            >
                              {securityFlagLabel(u.securityFlag, t)}
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
                            {t("admin.usersTable.positionInfo", {
                              t: u.trackLimit ?? "–",
                              p: u.profileLimit ?? "–",
                              a: u.aliasLimit ?? "–",
                              seat:
                                u.seatLimit !== null && u.seatLimit !== undefined
                                  ? ` ${t("admin.usersTable.seats", { used: u.seatsUsed, limit: u.seatLimit })}${!u.hasPaidOrder && u.tier === "ENTERPRISE" ? t("admin.usersTable.seatWarning") : ""}`
                                  : "",
                            })}
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
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="py-3">
                          {canManageUsers && (
                            <div className="flex items-center gap-3">
                              {u.id !== user?.id && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={locked}
                                  title={locked ? t("admin.usersTable.deleteLocked") : t("admin.usersTable.deleteTitle")}
                                  className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  {t("admin.usersTable.delete")}
                                </button>
                              )}
                              <button
                                onClick={() => openEditProfile(u)}
                                disabled={locked}
                                title={locked ? t("admin.usersTable.deleteLocked") : undefined}
                                className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Edit className="h-3 w-3" />
                                {t("admin.usersTable.editProfile")}
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
            <Pagination
              page={usersPage}
              total={usersTotal}
              pageSize={PAGE_SIZE}
              onPage={(p) => {
                setUsersPage(p);
                void fetchUsers(p);
              }}
            />
          </div>
        )}
        {tab === "roles" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <h2 className="text-lg font-semibold text-white mb-1">
                {roleForm.id ? t("admin.roles.editRole") : t("admin.roles.createRole")}
              </h2>
              <p className="text-sm text-zinc-500 mb-4">
                {t("admin.roles.adminNote")}
              </p>

              {roleMsg && (
                <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${roleMsg === t("admin.roles.saved") ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                  {roleMsg}
                </div>
              )}

              <form onSubmit={handleRoleSave} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.roles.name")}</label>
                    <input
                      type="text"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                      placeholder={t("admin.roles.namePlaceholder")}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.roles.description")}</label>
                    <input
                      type="text"
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                      placeholder={t("admin.roles.descriptionPlaceholder")}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    {t("admin.roles.inviteGeneration")}
                  </label>
                  <p className="text-xs text-zinc-500 mb-3">
                    {t("admin.roles.inviteGenerationDescription")}
                  </p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        {t("admin.roles.maxPerBatch")}
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
                        {t("admin.roles.maxUnused")}
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
                        {t("admin.roles.cooldown")}
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
                        {t("admin.roles.defaultExpiry")}
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
                        {t("admin.roles.minExpiry")}
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
                        {t("admin.roles.maxExpiry")}
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
                  <label className="block text-sm font-medium text-zinc-300 mb-2">{t("admin.roles.permissions")}</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {PERMISSION_ORDER.map((perm) => {
                      const checked = roleForm.permissions.includes(perm);
                      const permLocked = roleForm.id !== null && roles.find((r) => r.id === roleForm.id)?.slug === "admin";
                      return (
                        <button
                          key={perm}
                          type="button"
                          disabled={permLocked}
                          onClick={() =>
                            setRoleForm((prev) => ({
                              ...prev,
                              permissions: checked
                                ? prev.permissions.filter((p) => p !== perm)
                                : [...prev.permissions, perm],
                            }))
                          }
                          className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm text-left transition-colors ${
                            permLocked
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
                          {t(`admin.permissions.${perm}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button type="submit" disabled={locked}>
                    <Save className="h-4 w-4" />
                    {roleForm.id ? t("admin.roles.saveRole") : t("admin.roles.createRoleButton")}
                  </Button>
                  {roleForm.id && (
                    <Button variant="secondary" onClick={() => setRoleForm({ id: null, name: "", description: "", permissions: [], inviteBatchLimit: "0", inviteOutstandingLimit: "0", inviteCooldownMinutes: "0", inviteDefaultExpiryDays: "30", inviteMinExpiryDays: "1", inviteMaxExpiryDays: "365" })}>
                      {t("admin.roles.cancel")}
                    </Button>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <h2 className="text-lg font-semibold text-white mb-4">{t("admin.roles.heading")}</h2>
              {roles.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("admin.roles.noRoles")}</p>
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
                                {t("admin.roles.system")}
                              </span>
                            )}
                            <span className="text-[11px] text-zinc-600">
                              {t("admin.roles.userCount", { count: roleUserCount(r.id), s: roleUserCount(r.id) === 1 ? "" : "s" })}
                            </span>
                          </div>
                          {r.description && (
                            <p className="text-xs text-zinc-500 mt-0.5">{r.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {r.permissions.length === 0 ? (
                                <span className="text-[11px] text-zinc-600">{t("admin.roles.noPermissions")}</span>
                            ) : (
                              r.permissions.map((p) => (
                                <span key={p} className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-300 border border-zinc-700/50">
                                  {t(`admin.permissions.${p}`, { defaultValue: p })}
                                </span>
                              ))
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-600 mt-2">
                            Invites:{" "}
                            {r.inviteBatchLimit > 0
                              ? t("admin.roles.inviteSummary", {
                                  batch: r.inviteBatchLimit,
                                  outstanding: r.inviteOutstandingLimit > 0 ? t("admin.roles.outstanding", { count: r.inviteOutstandingLimit }) : t("admin.roles.unlimitedOutstanding"),
                                  cooldown: r.inviteCooldownMinutes,
                                  def: r.inviteDefaultExpiryDays,
                                  min: r.inviteMinExpiryDays,
                                  max: r.inviteMaxExpiryDays,
                                })
                              : t("admin.roles.generationDisabled")}
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
                            disabled={locked}
                            title={locked ? t("admin.roles.locked") : undefined}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Edit className="h-3 w-3" />
                            {t("admin.roles.edit")}
                          </button>
                          {!r.isSystem && (
                            <button
                              onClick={() => handleRoleDelete(r.id)}
                              disabled={locked}
                            title={locked ? t("admin.usersTable.deleteLocked") : undefined}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                {badgeForm.id ? t("admin.badges.editBadge") : t("admin.badges.createBadge")}
              </h2>
              <p className="text-sm text-zinc-500 mb-4">
                {t("admin.badges.description")}
              </p>

              {badgeMsg && (
                <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${badgeMsg === t("admin.badges.saved") ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                  {badgeMsg}
                </div>
              )}

              <form onSubmit={handleBadgeSave} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.badges.label")}</label>
                    <input
                      type="text"
                      value={badgeForm.label}
                      onChange={(e) => setBadgeForm({ ...badgeForm, label: e.target.value })}
                      placeholder={t("admin.badges.labelPlaceholder")}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      {t("admin.badges.internalId")} <span className="text-zinc-500">{t("admin.badges.optional")}</span>
                    </label>
                    <input
                      type="text"
                      value={badgeForm.slug}
                      onChange={(e) => setBadgeForm({ ...badgeForm, slug: e.target.value })}
                      placeholder={t("admin.badges.internalIdPlaceholder")}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      {t("admin.badges.internalIdHint")}
                    </p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.badges.color")}</label>
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
                      {t("admin.badges.icon")} <span className="text-zinc-500">{t("admin.badges.iconHint")}</span>
                    </label>
                    <input
                      type="text"
                      value={badgeForm.icon}
                      onChange={(e) => setBadgeForm({ ...badgeForm, icon: e.target.value })}
                      placeholder={t("admin.badges.iconPlaceholder")}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">{t("admin.badges.preview")}</label>
                  <BadgePill badge={{ id: "preview", slug: badgeForm.slug || "preview", label: badgeForm.label || t("admin.badges.previewBadge"), color: badgeForm.color, icon: badgeForm.icon, isSystem: false }} size="lg" />
                </div>

                <div className="flex gap-3">
                  <Button type="submit" disabled={locked}>
                    <Save className="h-4 w-4" />
                    {badgeForm.id ? t("admin.badges.saveBadge") : t("admin.badges.createBadgeButton")}
                  </Button>
                  {badgeForm.id && (
                    <Button variant="secondary" onClick={() => setBadgeForm({ id: null, slug: "", label: "", color: "#a855f7", icon: "Award" })}>
                      {t("admin.badges.cancel")}
                    </Button>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
              <h2 className="text-lg font-semibold text-white mb-4">{t("admin.badges.heading")}</h2>
              {badgeCatalog.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("admin.badges.noBadges")}</p>
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
                            disabled={locked}
                            title={locked ? t("admin.badges.locked") : undefined}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleBadgeDelete(b.id)}
                            disabled={locked}
                            title={locked ? t("admin.badges.locked") : undefined}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 mb-6">
            <h2 className="text-lg font-semibold text-white mb-1">{t("admin.allowlist.title")}</h2>
            <p className="text-sm text-zinc-500 mb-4">
              {t("admin.allowlist.description")}
            </p>

            <form onSubmit={handleAddWhitelist} className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                value={wlValue}
                onChange={(e) => setWlValue(e.target.value)}
                placeholder={t("admin.allowlist.ipPlaceholder")}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
              />
              <input
                value={wlNote}
                onChange={(e) => setWlNote(e.target.value)}
                placeholder={t("admin.allowlist.notePlaceholder")}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
              />
              <button
                type="submit"
                className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
              >
                {t("admin.allowlist.add")}
              </button>
            </form>

            {wlMsg && <p className="text-sm text-amber-400 mb-3">{wlMsg}</p>}

            {whitelist.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("admin.allowlist.noEntries")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">{t("admin.allowlist.headerValue")}</th>
                      <th className="pb-3 font-medium">{t("admin.allowlist.headerNote")}</th>
                      <th className="pb-3 font-medium">{t("admin.allowlist.headerAddedBy")}</th>
                      <th className="pb-3 font-medium">{t("admin.allowlist.headerAdded")}</th>
                      <th className="pb-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {whitelist.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-3 font-mono text-zinc-300">{entry.value}</td>
                        <td className="py-3 text-zinc-400">{entry.note || "—"}</td>
                        <td className="py-3 text-zinc-400">{entry.createdBy}</td>
                        <td className="py-3 text-zinc-500">{formatDateTime(entry.createdAt)}</td>
                        <td className="py-3">
                          <button
                            onClick={() => handleRemoveWhitelist(entry.id)}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                          >
                            {t("admin.allowlist.remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={whitelistPage}
              total={whitelistTotal}
              pageSize={PAGE_SIZE}
              onPage={(p) => {
                setWhitelistPage(p);
                void fetchWhitelist(p);
              }}
            />
          </div>
        )}
        {tab === "bans" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">{t("admin.bans.title")}</h2>
            <p className="text-sm text-zinc-500 mb-4">
              {t("admin.bans.description")}
            </p>

            {bans.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("admin.bans.noEntries")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">{t("admin.bans.headerType")}</th>
                      <th className="pb-3 font-medium">{t("admin.bans.headerValue")}</th>
                      <th className="pb-3 font-medium">{t("admin.bans.headerFailures")}</th>
                      <th className="pb-3 font-medium">{t("admin.bans.headerStatus")}</th>
                      <th className="pb-3 font-medium">{t("admin.bans.headerUpdated")}</th>
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
                              <span className="text-red-400 text-xs font-semibold">{t("admin.bans.permanentBan")}</span>
                            ) : locked ? (
                              <span className="text-amber-400 text-xs font-semibold">
                                {t("admin.bans.lockedUntil")}{" "}
                                {formatDateTime(ban.lockedUntil as string)}
                              </span>
                            ) : (
                              <span className="text-emerald-400 text-xs">{t("admin.bans.clear")}</span>
                            )}
                          </td>
                          <td className="py-3 text-zinc-500">
                            {formatDateTime(ban.updatedAt)}
                          </td>
                          <td className="py-3">
                            {ban.kind === "ACCOUNT" && (
                              <button
                                onClick={() => handleUnlockAccount(ban.accountId!)}
                                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors mr-3"
                              >
                                {t("admin.bans.unlock")}
                              </button>
                            )}
                            <button
                              onClick={() => handleUnban(ban.id)}
                              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                            >
                              {t("admin.bans.unban")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={bansPage}
              total={bansTotal}
              pageSize={PAGE_SIZE}
              onPage={(p) => {
                setBansPage(p);
                void fetchBans(p);
              }}
            />
          </div>
        )}
        {tab === "moderation" && (
          <ModerationTab locked={locked} />
        )}
        {tab === "logs" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">{t("admin.authLog.title")}</h2>
            <p className="text-sm text-zinc-500 mb-4">
              {t("admin.authLog.description")}
            </p>

            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("admin.authLog.noEntries")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">{t("admin.authLog.headerTime")}</th>
                      <th className="pb-3 font-medium">{t("admin.authLog.headerUser")}</th>
                      <th className="pb-3 font-medium">{t("admin.authLog.headerReason")}</th>
                      <th className="pb-3 font-medium">{t("admin.authLog.headerIp")}</th>
                      <th className="pb-3 font-medium">{t("admin.authLog.headerPenalty")}</th>
                      <th className="pb-3 font-medium">{t("admin.authLog.headerTriggeredBy")}</th>
                      <th className="pb-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {logs.map((log) => {
                      const locked = log.accountId && (log.permanent || log.penaltyMinutes !== null);
                      return (
                        <tr key={log.id}>
                          <td className="py-3 whitespace-nowrap text-zinc-500">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="py-3 font-mono text-zinc-300">{log.username ?? "—"}</td>
                          <td className="py-3 text-zinc-300">{log.reason}</td>
                          <td className="py-3 font-mono text-zinc-500">{log.ip}</td>
                          <td className="py-3">
                            {log.permanent ? (
                              <span className="text-red-400 text-xs font-semibold">{t("admin.authLog.permanentLock")}</span>
                            ) : log.penaltyMinutes !== null ? (
                              <span className="text-amber-400 text-xs">{t("admin.authLog.plusMinutes", { count: log.penaltyMinutes })}</span>
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
                                {t("admin.authLog.unlock")}
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
            <Pagination
              page={logsPage}
              total={logsTotal}
              pageSize={PAGE_SIZE}
              onPage={(p) => {
                setLogsPage(p);
                void fetchLogs(p);
              }}
            />
          </div>
        )}

        {tab === "domains" && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">{t("admin.domains.title")}</h2>
            <p className="text-sm text-zinc-500 mb-4">
              {t("admin.domains.description")}
            </p>

            {domains.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("admin.domains.noRequests")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                      <th className="pb-3 font-medium">{t("admin.domains.headerDomain")}</th>
                      <th className="pb-3 font-medium">{t("admin.domains.headerOwner")}</th>
                      <th className="pb-3 font-medium">{t("admin.domains.headerProfile")}</th>
                      <th className="pb-3 font-medium">{t("admin.domains.headerStatus")}</th>
                      <th className="pb-3 font-medium">{t("admin.domains.headerTls")}</th>
                      <th className="pb-3 font-medium">{t("admin.domains.headerRequested")}</th>
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
                            <span className="block text-xs text-zinc-500">{t("admin.domains.root")} {d.rootTarget}</span>
                          ) : (
                            <span className="block text-xs text-zinc-600">{t("admin.domains.rootLanding")}</span>
                          )}
                        </td>
                        <td className="py-3">
                          {d.status === "VERIFIED" ? (
                            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                              {t("admin.domains.statusVerified")}
                            </span>
                          ) : d.status === "ACTIVE" ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                              {t("admin.domains.statusActive")}
                            </span>
                          ) : d.status === "REJECTED" ? (
                            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                              {t("admin.domains.statusRejected")}
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                              {t("admin.domains.statusPendingTxt")}
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          {d.status === "ACTIVE" && d.tlsStatus === "ISSUED" ? (
                            <span className="text-xs text-emerald-400" title={d.tlsError ?? undefined}>
                              {t("admin.domains.validTo")} {d.tlsExpiresAt ? formatDate(d.tlsExpiresAt) : "—"}
                            </span>
                          ) : d.status === "ACTIVE" && d.tlsStatus === "PENDING" ? (
                            <span className="text-xs text-amber-400">{t("admin.domains.issuing")}</span>
                          ) : d.status === "ACTIVE" && d.tlsStatus === "FAILED" ? (
                            <span
                              className="text-xs text-red-400 underline decoration-dotted underline-offset-2 cursor-help"
                              title={d.tlsError ?? t("admin.toasts.certIssuanceFailed")}
                            >
                              {t("admin.domains.failedHover")}
                            </span>
                          ) : d.status === "ACTIVE" ? (
                            <span className="text-xs text-zinc-500">{t("admin.domains.none")}</span>
                          ) : (
                            <span className="text-xs text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-500 whitespace-nowrap">
                          {formatDate(d.createdAt)}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          {d.status === "VERIFIED" ? (
                            <button
                              onClick={() => handleApproveDomain(d.id)}
                              className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                            >
                              {t("admin.domains.activate")}
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                          {(d.status === "VERIFIED" || d.status === "PENDING_VERIFICATION") && (
                            <button
                              onClick={() => handleRejectDomain(d.id)}
                              className="ml-2 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition-colors"
                            >
                              {t("admin.domains.reject")}
                            </button>
                          )}
                          {d.status === "ACTIVE" && d.tlsStatus !== "ISSUED" && d.tlsStatus !== "PENDING" && (
                            <button
                              onClick={() => handleIssueCert(d.id)}
                              className="ml-2 rounded-lg bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-400 hover:bg-violet-500/25 transition-colors"
                            >
                              {t("admin.domains.issueCert")}
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveDomain(d)}
                            disabled={locked}
                            title={locked ? t("admin.domains.locked") : t("admin.domains.removeTitle")}
                            className="ml-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-red-500/15 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {t("admin.domains.remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={domainsPage}
              total={domainsTotal}
              pageSize={PAGE_SIZE}
              onPage={(p) => {
                setDomainsPage(p);
                void fetchDomains(p);
              }}
            />
          </div>
        )}

        {tab === "themes" && (
          <SeasonalThemesTab
            data={themesData}
            error={themesError}
            saving={themesSaving}
            themeError={themeError}
            themeSaved={themeSaved}
            onSaveConfig={saveThemeConfig}
            onUpdateTheme={updateThemeField}
            onUploadBackground={uploadThemeBackground}
            onRemoveBackground={removeThemeBackground}
          />
        )}

        {tab === "landing" && <LandingConfigTab />}

        {tab === "affiliates" && <AdminAffiliateTab />}

        {tab === "orders" && <AdminOrdersTab />}

        {tab === "newsletter" && <AdminNewsletterTab />}
        {tab === "policy" && <AdminPolicyTab />}
      </main>

      <AppFooter />

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">{t("admin.editProfile.title")}</h2>
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
                    {t("admin.editProfile.displayName")}
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
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.editProfile.bio")}</label>
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
                      {t("admin.editProfile.location")}
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
                      {t("admin.editProfile.website")}
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
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.editProfile.tier")}</label>
                    <select
                      value={editTier}
                      onChange={(e) => setEditTier(e.target.value as "FREE" | "PRO" | "ENTERPRISE")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    >
                      <option value="FREE">{t("common:tiers.free")}</option>
                      <option value="PRO">{t("common:tiers.pro")}</option>
                      <option value="ENTERPRISE">{t("common:tiers.enterprise")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      {t("admin.editProfile.trackLimit")} <span className="text-zinc-500">{t("admin.editProfile.optional")}</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editTrackLimit}
                      onChange={(e) => setEditTrackLimit(e.target.value)}
                      placeholder={t("admin.editProfile.tierDefaultPlaceholder")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                </div>
<div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      {t("admin.editProfile.profileLimit")} <span className="text-zinc-500">{t("admin.editProfile.optional")}</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editProfileLimit}
                      onChange={(e) => setEditProfileLimit(e.target.value)}
                      placeholder={t("admin.editProfile.tierDefaultPlaceholder")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      {t("admin.editProfile.aliasLimit")} <span className="text-zinc-500">{t("admin.editProfile.optional")}</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editAliasLimit}
                      onChange={(e) => setEditAliasLimit(e.target.value)}
                      placeholder={t("admin.editProfile.tierDefaultPlaceholder")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      {t("admin.editProfile.teamSeatLimit")} <span className="text-zinc-500">{t("admin.editProfile.teamSeatEnterpriseGifted")}</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={editSeatLimit}
                      onChange={(e) => setEditSeatLimit(e.target.value)}
                      placeholder={t("admin.editProfile.unlimitedPlaceholder")}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-zinc-300">{t("admin.editProfile.public")}</label>
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
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">{t("admin.editProfile.role")}</label>
                  <select
                    value={editRoleId}
                    onChange={(e) => setEditRoleId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.isSystem ? t("admin.editProfile.systemSuffix") : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">{t("admin.editProfile.badges")}</label>
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
                      <span className="text-[11px] text-zinc-600">{t("admin.editProfile.noBadgesAvailable")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 px-3.5 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{t("admin.editProfile.inviteAccess")}</p>
                    <p className="text-xs text-zinc-500">
                      {editingUser.inviteBanned
                        ? t("admin.editProfile.inviteBannedNote")
                        : t("admin.editProfile.inviteAllowedNote")}
                    </p>
                  </div>
                  {editingUser.id !== user?.id && (
                    <button
                      type="button"
                      onClick={() => handleInviteBan(editingUser, !editingUser.inviteBanned)}
                      disabled={locked}
                      title={locked ? t("admin.editProfile.locked") : undefined}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        editingUser.inviteBanned
                          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                          : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                      }`}
                    >
                      {editingUser.inviteBanned ? t("admin.editProfile.unbanInvites") : t("admin.editProfile.banInvites")}
                    </button>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setEditingUser(null)}>
                      {t("admin.editProfile.cancel")}
                    </Button>
                  <Button onClick={handleSaveProfile} disabled={editLoading || locked}>
                    <Save className="h-4 w-4" />
                    {editSaved ? t("admin.editProfile.saved") : t("admin.editProfile.save")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <UpdateDialog open={updateOpen} onClose={() => setUpdateOpen(false)} recheckable />
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
