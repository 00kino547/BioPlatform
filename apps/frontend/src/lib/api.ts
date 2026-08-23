import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { getEnv } from "@/config/env";

const API_URL = getEnv("VITE_API_URL") ?? "/api";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  unlockRequired?: boolean;
}

let _token: string | null = localStorage.getItem("token");

export function getToken() {
  return _token;
}

export function setToken(token: string | null) {
  _token = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (_token) {
    headers["Authorization"] = `Bearer ${_token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  return res.json();
}

export interface Role {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  inviteBatchLimit: number;
  inviteOutstandingLimit: number;
  inviteCooldownMinutes: number;
  inviteDefaultExpiryDays: number;
  inviteMinExpiryDays: number;
  inviteMaxExpiryDays: number;
  _count?: { users: number };
}

export interface InviteMeta {
  banned: boolean;
  generationEnabled: boolean;
  canGenerate: boolean;
  allowance: number;
  allowanceExpiresAt: string | null;
  allowanceActive: boolean;
  outstanding: number;
  cooldownRemainingSeconds: number;
  role: {
    slug: string;
    canGenerate: boolean;
    batchLimit: number;
    outstandingLimit: number;
    cooldownMinutes: number;
    defaultExpiryDays: number;
    minExpiryDays: number;
    maxExpiryDays: number;
  };
}

export interface InviteGrantEvent {
  id: string;
  count: number;
  expiryDays: number;
  createdById: string | null;
  createdBy: { id: string; username: string } | null;
  createdAt: string;
}

export interface Badge {
  id: string;
  slug: string;
  label: string;
  color: string;
  icon: string;
  isSystem: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: Role | null;
  permissions: string[];
  isAdmin: boolean;
  tier: "FREE" | "PRO" | "ENTERPRISE";
  apiLevel: "basic" | "advanced" | "enterprise";
  trackLimit: number | null;
  profileLimit: number | null;
  aliasLimit: number | null;
  badges: string[];
  totpEnabled: boolean;
}

export interface LoginMethods {
  password: boolean;
  passkey: boolean;
  totp: boolean;
}

export interface TwoFactorRequired {
  requiresTwoFactor: true;
  methods: { totp: boolean; passkey: boolean };
  twoFactorToken: string;
}

export interface Passkey {
  id: string;
  name: string;
  credentialId: string;
  residentKey: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface TotpSetupData {
  secret: string;
  otpauthUrl: string;
}

export type MusicProvider = "local" | "spotify" | "youtube";

export interface MusicTrack {
  id: string;
  profileId: string;
  provider: MusicProvider;
  title: string | null;
  artist: string | null;
  url: string | null;
  filePath: string | null;
  fullUrl: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface MusicSettings {
  tracks: MusicTrack[];
  limit: number;
  tier: "FREE" | "PRO" | "ENTERPRISE";
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ProfileAlias {
  id: string;
  profileId: string;
  slug: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  userId: string;
  slug: string;
  isPrimary: boolean;
  badges: string[];
  aliases?: ProfileAlias[];
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  location: string | null;
  website: string | null;
  socialLinks: { platform: string; url: string }[] | null;
  theme: {
    bg?: string;
    cardBg?: string;
    text?: string;
    accent?: string;
    fontFamily?: string;
  } | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  musicTracks?: MusicTrack[];
  _count?: { musicTracks: number };
}

export interface MyProfiles {
  profiles: Profile[];
  limits: { profiles: number; aliases: number };
  primaryId: string | null;
  aliasCount: number;
  ownedBadges: string[];
}

export interface PublicProfile {
  username: string;
  slug: string;
  requestedSlug: string;
  isPrimary: boolean;
  badges: string[];
  createdAt: string;
  id: string;
  userId: string;
  displayName: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  location: string | null;
  website: string | null;
  socialLinks: { platform: string; url: string }[] | null;
  theme: {
    bg?: string;
    cardBg?: string;
    text?: string;
    accent?: string;
    fontFamily?: string;
  } | null;
  isPublic: boolean;
  musicTracks?: MusicTrack[];
  discord?: {
    username: string;
    globalName: string | null;
    avatar: string | null;
    presence: DiscordPresence | null;
  } | null;
}

export type DiscordPresenceStatus = "online" | "idle" | "dnd" | "offline";

export interface DiscordActivity {
  type: number;
  name: string;
  details: string | null;
  state: string | null;
  applicationId: string | null;
  largeImage: string | null;
  smallImage: string | null;
  buttons: string[] | null;
  timestamps: { start: number | null; end: number | null } | null;
}

export interface DiscordPresence {
  status: DiscordPresenceStatus;
  statusLabel: string;
  activities: DiscordActivity[];
  line: string | null;
  customStatus: string | null;
  updatedAt: number | null;
}

export interface DiscordAccount {
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface DiscordStatus {
  configured: boolean;
  connected: boolean;
  botConfigured: boolean;
  botInviteUrl: string | null;
  presenceHubInvite: string | null;
  sessionActive: boolean;
  discord: DiscordAccount | null;
  settings: {
    showDiscordPresence: boolean;
    showDiscordActivity: boolean;
  };
  webhookConfigured: boolean;
  presence: DiscordPresence | null;
}

export type CustomDomainStatus = "PENDING_VERIFICATION" | "VERIFIED" | "ACTIVE" | "REJECTED";
export type TlsStatus = "NONE" | "PENDING" | "ISSUED" | "FAILED";

export interface ProfileDomain {
  id: string;
  profileId: string;
  domain: string;
  status: CustomDomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rootTarget: string | null;
  tlsStatus: TlsStatus;
  tlsIssuedAt: string | null;
  tlsExpiresAt: string | null;
  tlsError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsData {
  total: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  last30d: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  last7d: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  last24h: { views: number; uniqueViews: number; clicks: number; uniqueClicks: number };
  viewsByDay: { date: string; count: number }[];
  uniqueViewsByDay: { date: string; count: number }[];
  clicksByDay: { date: string; count: number }[];
  uniqueClicksByDay: { date: string; count: number }[];
  clicksByPlatform: { platform: string; count: number }[];
  uniqueClicksByPlatform: { platform: string; count: number }[];
  topReferrers: { referer: string; count: number }[];
}

export interface EmailSettings {
  enabled: boolean;
  provider: "gmail" | "custom";
  gmailUser?: string;
  gmailAppPassword?: string;
  customHost?: string;
  customPort?: number;
  customUser?: string;
  customPassword?: string;
  customSecure?: boolean;
}

export interface EmailNotificationSettings {
  smtpConfigured: boolean;
  fromEmail: string | null;
  notifyOnView: boolean;
  notifyOnClick: boolean;
}

export const WEBHOOK_EVENTS = [
  "profile.viewed",
  "link.clicked",
  "profile.updated",
  "profile.created",
  "profile.deleted",
  "user.registered",
  "user.updated",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: unknown;
  status: "pending" | "success" | "failed";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  active: boolean;
  events: string[];
  template?: string | null;
  createdAt: string;
  updatedAt: string;
  lastDelivery?: {
    status: string;
    lastStatusCode: number | null;
    lastError: string | null;
    updatedAt: string;
  } | null;
}

export interface WebhookWithSecret {
  id: string;
  name: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
  template?: string | null;
  createdAt: string;
}

export interface ProfileUpdate {
  slug?: string;
  displayName?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  socialLinks?: { platform: string; url: string }[] | null;
  theme?: Profile["theme"];
  isPublic?: boolean;
}

export const api = {
  register: (data: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
  }) => request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  login: (data: { identifier: string; password: string }) =>
    request<AuthResponse | TwoFactorRequired>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  loginStart: (identifier: string) =>
    request<{ found: boolean; methods?: LoginMethods }>("/auth/login/start", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  loginPasskeyOptions: (identifier: string) =>
    request<{ options: PublicKeyCredentialRequestOptionsJSON; identifier: string }>("/auth/login/passkey/options", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  loginPasskeyVerify: (identifier: string, response: unknown) =>
    request<AuthResponse>("/auth/login/passkey/verify", {
      method: "POST",
      body: JSON.stringify({ identifier, response }),
    }),

  verifyTotp: (token: string, code: string) =>
    request<AuthResponse>("/auth/2fa/totp", {
      method: "POST",
      body: JSON.stringify({ token, code }),
    }),

  twoFactorPasskeyOptions: (token: string) =>
    request<{ options: PublicKeyCredentialRequestOptionsJSON }>("/auth/2fa/passkey/options", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  twoFactorPasskeyVerify: (token: string, response: unknown) =>
    request<AuthResponse>("/auth/2fa/passkey/verify", {
      method: "POST",
      body: JSON.stringify({ token, response }),
    }),

  registerPasskeyOptions: (residentKey: "resident" | "nonResident") =>
    request<PublicKeyCredentialCreationOptionsJSON>("/auth/passkeys/options", {
      method: "POST",
      body: JSON.stringify({ residentKey }),
    }),

  registerPasskey: (response: unknown, name: string, residentKey: "resident" | "nonResident") =>
    request<{ passkey: Passkey }>("/auth/passkeys/register", {
      method: "POST",
      body: JSON.stringify({ response, name, residentKey }),
    }),

  getPasskeys: () => request<Passkey[]>("/auth/passkeys"),

  deletePasskey: (id: string) =>
    request(`/auth/passkeys/${id}`, { method: "DELETE" }),

  setupTotp: () => request<TotpSetupData>("/auth/totp/setup", { method: "POST" }),

  enableTotp: (code: string) =>
    request<{ totpEnabled: boolean }>("/auth/totp/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  disableTotp: (code: string) =>
    request<{ totpEnabled: boolean }>("/auth/totp/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  me: () => request<AuthUser>("/auth/me"),

  requestUnlock: (identifier: string) =>
    request<{ sent: boolean }>("/auth/unlock", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    }),

  verifyUnlock: (token: string) =>
    request("/auth/unlock/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  getMyProfiles: () => request<MyProfiles>("/profiles/me"),

  createProfile: (data: { slug: string } & ProfileUpdate) =>
    request<Profile>("/profiles/me", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getProfile: (profileId: string) =>
    request<Profile>(`/profiles/me/${profileId}`),

  updateProfile: (data: ProfileUpdate, profileId?: string) =>
    profileId
      ? request<Profile>(`/profiles/me/${profileId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        })
      : request<Profile>("/profiles/me", {
          method: "PUT",
          body: JSON.stringify(data),
        }),

  deleteProfile: (profileId: string) =>
    request(`/profiles/me/${profileId}`, { method: "DELETE" }),

  setPrimaryProfile: (profileId: string) =>
    request(`/profiles/me/${profileId}/primary`, { method: "POST" }),

  getAliases: (profileId: string) =>
    request<ProfileAlias[]>(`/profiles/me/${profileId}/aliases`),

  createAlias: (profileId: string, slug: string) =>
    request<ProfileAlias>(`/profiles/me/${profileId}/aliases`, {
      method: "POST",
      body: JSON.stringify({ slug }),
    }),

  deleteAlias: (profileId: string, aliasId: string) =>
    request(`/profiles/me/${profileId}/aliases/${aliasId}`, { method: "DELETE" }),

  toggleProfileBadge: (profileId: string, badgeId: string, enabled: boolean) =>
    request<{ badges: string[] }>(`/profiles/me/${profileId}/badges`, {
      method: "POST",
      body: JSON.stringify({ badge: badgeId, enabled }),
    }),

  reorderProfileBadges: (profileId: string, order: string[]) =>
    request<{ badges: string[] }>(`/profiles/me/${profileId}/badges/order`, {
      method: "PUT",
      body: JSON.stringify({ order }),
    }),

  getBadges: () => request<Badge[]>("/badges"),

  uploadAvatar: async (file: File, profileId?: string) => {
    const form = new FormData();
    form.append("avatar", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/avatar${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{ success: boolean; data?: { avatar: string }; error?: string }>;
  },

  uploadBanner: async (file: File, profileId?: string) => {
    const form = new FormData();
    form.append("banner", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/banner${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{ success: boolean; data?: { banner: string }; error?: string }>;
  },

  removeAvatar: (profileId?: string) =>
    request(`/profiles/me/avatar${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "DELETE" }),

  removeBanner: (profileId?: string) =>
    request(`/profiles/me/banner${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "DELETE" }),

  getPublicProfile: async (username: string) => {
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/profiles/${username}`, { headers, credentials: "include" });
    return res.json() as Promise<{ success: boolean; data?: PublicProfile; error?: string }>;
  },

  getDomainInfo: async () => {
    const res = await fetch(`${API_URL}/domain`, { credentials: "include" });
    return res.json() as Promise<{
      success: boolean;
      data?: { active: boolean; host: string; slug: string | null; canonical: string | null };
      error?: string;
    }>;
  },

  getProfileDomain: (profileId: string) => request<ProfileDomain | null>(`/profiles/me/${profileId}/domain`),

  requestProfileDomain: (profileId: string, domain: string) =>
    request<ProfileDomain>(`/profiles/me/${profileId}/domain`, { method: "POST", body: JSON.stringify({ domain }) }),

  verifyProfileDomain: (profileId: string) =>
    request<ProfileDomain>(`/profiles/me/${profileId}/domain/verify`, { method: "POST" }),

  setProfileDomainRoot: (profileId: string, rootTarget: string | null) =>
    request<ProfileDomain>(`/profiles/me/${profileId}/domain`, { method: "PUT", body: JSON.stringify({ rootTarget }) }),

  removeProfileDomain: (profileId: string) =>
    request<ProfileDomain | null>(`/profiles/me/${profileId}/domain`, { method: "DELETE" }),

  getProfilePresence: async (username: string) => {
    const res = await fetch(`${API_URL}/profiles/${username}/presence`, { credentials: "include" });
    return res.json() as Promise<{ success: boolean; data?: DiscordPresence | null; error?: string }>;
  },

  trackClick: (profileId: string, platform: string) =>
    request("/profiles/click", {
      method: "POST",
      body: JSON.stringify({ profileId, platform }),
    }),

  getAnalytics: (profileId?: string) =>
    request<AnalyticsData>(`/analytics/me${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  getEmailSettings: (profileId?: string) =>
    request<EmailNotificationSettings>(`/email/settings${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  updateEmailSettings: (data: { notifyOnView: boolean; notifyOnClick: boolean }, profileId?: string) =>
    request(`/email/settings${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  testEmail: (profileId?: string) =>
    request(`/email/test${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "POST" }),

  getWebhooks: () => request<Webhook[]>("/webhooks"),

  createWebhook: (data: { name: string; url: string; events: WebhookEvent[]; active: boolean; template?: string | null }) =>
    request<WebhookWithSecret>("/webhooks", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateWebhook: (id: string, data: { name?: string; url?: string; events?: WebhookEvent[]; active?: boolean; template?: string | null }) =>
    request<Webhook>(`/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  rotateWebhookSecret: (id: string) =>
    request<{ secret: string; secretPrefix: string }>(`/webhooks/${id}/rotate-secret`, {
      method: "POST",
    }),

  testWebhook: (id: string) =>
    request(`/webhooks/${id}/test`, { method: "POST" }),

  getWebhookDeliveries: (id: string, limit = 20) =>
    request<WebhookDelivery[]>(`/webhooks/${id}/deliveries?limit=${limit}`),

  deleteWebhook: (id: string) =>
    request(`/webhooks/${id}`, { method: "DELETE" }),

  exportProfile: async (format: "xlsx" | "ods", profileId?: string) => {
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/export?format=${format}${profileId ? `&profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        headers,
        credentials: "include",
      }
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Export failed");
    }
    return res.blob();
  },

  importProfile: async (file: File, profileId?: string) => {
    const form = new FormData();
    form.append("file", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/profiles/me/import${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{
      success: boolean;
      data?: { applied: string[]; warnings: string[] };
      error?: string;
      warnings?: string[];
    }>;
  },

  getMusic: (profileId?: string) =>
    request<MusicSettings>(`/music/me${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  addMusicTrack: (data: {
    provider: MusicProvider;
    title?: string;
    artist?: string;
    url?: string;
    fullUrl?: string;
  }, profileId?: string) => request<MusicTrack>(`/music/me${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
    method: "POST",
    body: JSON.stringify(data),
  }),

  uploadMusicTrack: async (file: File, title?: string, artist?: string, fullUrl?: string, profileId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (artist) form.append("artist", artist);
    if (fullUrl) form.append("fullUrl", fullUrl);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(
      `${API_URL}/music/me/upload${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`,
      {
        method: "POST",
        headers,
        body: form,
        credentials: "include",
      }
    );
    return res.json() as Promise<{ success: boolean; data?: MusicTrack; error?: string }>;
  },

  updateMusicTrack: (id: string, data: { title?: string; artist?: string; position?: number; fullUrl?: string | null }) =>
    request<MusicTrack>(`/music/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  reorderMusicTracks: (ids: string[]) =>
    request("/music/reorder", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  deleteMusicTrack: (id: string) =>
    request(`/music/${id}`, { method: "DELETE" }),

  getDiscordStatus: (profileId?: string) =>
    request<DiscordStatus>(`/discord${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`),

  getDiscordConnectUrl: () => request<{ url: string }>("/discord/connect"),

  disconnectDiscord: (profileId?: string) =>
    request(`/discord/disconnect${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, { method: "POST" }),

  updateDiscordSettings: (data: {
    showDiscordPresence?: boolean;
    showDiscordActivity?: boolean;
    webhookUrl?: string;
  }, profileId?: string) => request(`/discord/settings${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  postToDiscord: (url?: string, profileId?: string) =>
    request<{ messageId: string | null; mode: "created" | "updated" | "none" }>(`/discord/post${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ""}`, {
      method: "POST",
      body: JSON.stringify(url ? { url } : {}),
    }),

  getInvites: () => request<{ data: InviteCodeInfo[]; meta: InviteMeta }>("/invites"),

  generateInvites: (body: { count: number; expiresInDays?: number }) =>
    request<{ data: InviteCodeInfo[]; meta: InviteMeta }>("/invites", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  revokeInvite: (id: string) =>
    request(`/invites/${id}`, { method: "DELETE" }),

  getInviteSettings: () =>
    request<{ userGenerationEnabled: boolean; eligibleUserCount: number }>("/admin/invite-settings"),

  updateInviteSettings: (body: { userGenerationEnabled: boolean }) =>
    request<{ userGenerationEnabled: boolean }>("/admin/invite-settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  createInviteEvent: (body: { count: number; expiryDays: number }) =>
    request<{ grantedUsers: number; event: InviteGrantEvent; allowanceExpiresAt: string }>("/admin/invite-events", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getInviteEvents: () =>
    request<InviteGrantEvent[]>("/admin/invite-events"),
};

export interface InviteCodeInfo {
  id: string;
  code: string;
  usedById: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  fromAllowance: boolean;
}
