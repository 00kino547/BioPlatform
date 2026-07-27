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
  });

  return res.json();
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
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
}

export interface PublicProfile {
  username: string;
  createdAt: string;
  id: string;
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
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
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
    const res = await fetch(`${API_URL}/profiles/${username}`, { headers });
    return res.json() as Promise<{ success: boolean; data?: PublicProfile; error?: string }>;
  },
};
