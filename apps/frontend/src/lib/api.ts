import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  tier: "FREE" | "PRO" | "ENTERPRISE";
  trackLimit: number | null;
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

export interface Profile {
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
  createdAt: string;
  updatedAt: string;
  musicTracks?: MusicTrack[];
}

export interface PublicProfile {
  username: string;
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

  login: (data: { email: string; password: string }) =>
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
    request<PublicKeyCredentialRequestOptionsJSON>("/auth/login/passkey/options", {
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
    request<PublicKeyCredentialRequestOptionsJSON>("/auth/2fa/passkey/options", {
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

  getMyProfile: () => request<Profile>("/profiles/me"),

  updateProfile: (data: {
    displayName?: string | null;
    bio?: string | null;
    location?: string | null;
    website?: string | null;
    socialLinks?: { platform: string; url: string }[] | null;
    theme?: Profile["theme"];
    isPublic?: boolean;
  }) => request<Profile>("/profiles/me", {
    method: "PUT",
    body: JSON.stringify(data),
  }),

  uploadAvatar: async (file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/profiles/me/avatar`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    return res.json() as Promise<{ success: boolean; data?: { avatar: string }; error?: string }>;
  },

  uploadBanner: async (file: File) => {
    const form = new FormData();
    form.append("banner", file);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/profiles/me/banner`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
    return res.json() as Promise<{ success: boolean; data?: { banner: string }; error?: string }>;
  },

  removeAvatar: () =>
    request("/profiles/me/avatar", { method: "DELETE" }),

  removeBanner: () =>
    request("/profiles/me/banner", { method: "DELETE" }),

  getPublicProfile: async (username: string) => {
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/profiles/${username}`, { headers, credentials: "include" });
    return res.json() as Promise<{ success: boolean; data?: PublicProfile; error?: string }>;
  },

  trackClick: (profileId: string, platform: string) =>
    request("/profiles/click", {
      method: "POST",
      body: JSON.stringify({ profileId, platform }),
    }),

  getAnalytics: () => request<AnalyticsData>("/analytics/me"),

  getEmailSettings: () => request<EmailNotificationSettings>("/email/settings"),

  updateEmailSettings: (data: { notifyOnView: boolean; notifyOnClick: boolean }) =>
    request("/email/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  testEmail: () => request("/email/test", { method: "POST" }),

  getMusic: () => request<MusicSettings>("/music/me"),

  addMusicTrack: (data: {
    provider: MusicProvider;
    title?: string;
    artist?: string;
    url?: string;
    fullUrl?: string;
  }) => request<MusicTrack>("/music/me", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  uploadMusicTrack: async (file: File, title?: string, artist?: string, fullUrl?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (artist) form.append("artist", artist);
    if (fullUrl) form.append("fullUrl", fullUrl);
    const headers: Record<string, string> = {};
    if (_token) headers["Authorization"] = `Bearer ${_token}`;
    const res = await fetch(`${API_URL}/music/me/upload`, {
      method: "POST",
      headers,
      body: form,
      credentials: "include",
    });
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
};
