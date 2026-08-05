import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/api";
import { X, Edit, Save } from "lucide-react";

interface InviteCode {
  id: string;
  code: string;
  usedById: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  tier: string;
  trackLimit: number | null;
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

type Tab = "codes" | "users" | "bans";

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("codes");
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bans, setBans] = useState<AuthBan[]>([]);
  const [count, setCount] = useState(1);
  const [expiresDays, setExpiresDays] = useState("");
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

  const fetchCodes = async () => {
    const token = getToken();
    const res = await fetch("/api/invites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) setCodes(data.data);
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

  useEffect(() => {
    fetchCodes();
    fetchUsers();
    fetchBans();
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

    setCodes((prev) => [...(data.data as InviteCode[]), ...prev]);
    setCount(1);
    setExpiresDays("");
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

  const openEditProfile = async (u: User) => {
    setEditingUser(u);
    setEditSaved(false);
    setEditLoading(true);
    setEditTier(u.tier === "PRO" ? "PRO" : u.tier === "ENTERPRISE" ? "ENTERPRISE" : "FREE");
    setEditTrackLimit(u.trackLimit !== null && u.trackLimit !== undefined ? String(u.trackLimit) : "");
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
    const userRes = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tier: editTier,
        trackLimit: trackLimitValue,
      }),
    });
    const userData = await userRes.json();

    setEditLoading(false);
    setEditSaved(true);
    if (userData.success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, tier: userData.data.tier, trackLimit: userData.data.trackLimit } : u))
      );
    }
    setTimeout(() => setEditSaved(false), 2000);
  };

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
                Admin
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
        <p className="text-zinc-400 mb-8">Manage invite codes and users.</p>

        <div className="flex gap-1 mb-8 rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-1 w-fit">
          <button
            onClick={() => setTab("codes")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === "codes"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Invite Codes
          </button>
          <button
            onClick={() => setTab("users")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === "users"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setTab("bans")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === "bans"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Bans
          </button>
        </div>

        {tab === "codes" && (
          <>
            <div className="grid gap-6 sm:grid-cols-3 mb-8">
              <StatCard label="Total" value={codes.length} />
              <StatCard label="Used" value={codes.filter((c) => c.usedById).length} />
              <StatCard label="Available" value={codes.filter((c) => !c.usedById && !c.revokedAt).length} />
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
              <h2 className="text-lg font-semibold text-white mb-4">All Invite Codes</h2>

              {codes.length === 0 ? (
                <p className="text-sm text-zinc-500">No codes yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800/60 text-left text-zinc-500">
                        <th className="pb-3 font-medium">Code</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">Expires</th>
                        <th className="pb-3 font-medium">Created</th>
                        <th className="pb-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {codes.map((code) => (
                        <tr key={code.id}>
                          <td className="py-3 font-mono text-zinc-300">{code.code}</td>
                          <td className="py-3">
                            {code.revokedAt ? (
                              <span className="text-red-400">Revoked</span>
                            ) : code.usedById ? (
                              <span className="text-zinc-500">Used</span>
                            ) : (
                              <span className="text-emerald-400">Available</span>
                            )}
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
              )}
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
                        <td className="py-3 font-mono text-zinc-300">{u.username}</td>
                        <td className="py-3 text-zinc-400">{u.email}</td>
                        <td className="py-3">
                          {u.role === "ADMIN" ? (
                            <span className="text-violet-400 text-xs font-semibold">Admin</span>
                          ) : (
                            <span className="text-zinc-500 text-xs">User</span>
                          )}
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
                          {u.trackLimit !== null && u.trackLimit !== undefined && (
                            <span className="text-[10px] text-zinc-600 ml-1">({u.trackLimit})</span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-500">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => openEditProfile(u)}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit Profile
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
