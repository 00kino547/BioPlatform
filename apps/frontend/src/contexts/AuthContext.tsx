import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, getToken, type AuthUser, type TwoFactorRequired } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{
    error?: string;
    twoFactor?: TwoFactorRequired;
    unlockRequired?: boolean;
  }>;
  loginWithPasskey: (identifier: string) => Promise<string | null>;
  verifyTotp: (token: string, code: string) => Promise<string | null>;
  verifyTwoFactorPasskey: (token: string) => Promise<string | null>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
  }) => Promise<string | null>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const completeAuth = (token: string, u: AuthUser) => {
    setToken(token);
    setUser(u);
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.me().then((res) => {
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        setToken(null);
      }
      setLoading(false);
    });
  }, []);

  const login = async (identifier: string, password: string) => {
    const res = await api.login({ email: identifier, password });
    if (!res.success || !res.data) {
      if (res.unlockRequired) return { error: res.error ?? "Account locked", unlockRequired: true };
      return { error: res.error ?? "Login failed" };
    }

    if (!("requiresTwoFactor" in res.data)) {
      completeAuth(res.data.token, res.data.user);
      return {};
    }

    return { twoFactor: res.data };
  };

  const loginWithPasskey = async (identifier: string) => {
    const optionsRes = await api.loginPasskeyOptions(identifier);
    if (!optionsRes.success || !optionsRes.data) return optionsRes.error ?? "Could not start passkey login";

    const { startAuthentication } = await import("@simplewebauthn/browser");
    let response;
    try {
      response = await startAuthentication({ optionsJSON: optionsRes.data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey login cancelled";
      if (msg.toLowerCase().includes("cancel")) return msg;
      return "Passkey login failed";
    }

    const verifyRes = await api.loginPasskeyVerify(identifier, response);
    if (!verifyRes.success || !verifyRes.data) return verifyRes.error ?? "Passkey authentication failed";

    completeAuth(verifyRes.data.token, verifyRes.data.user);
    return null;
  };

  const verifyTotp = async (token: string, code: string) => {
    const res = await api.verifyTotp(token, code);
    if (!res.success || !res.data) return res.error ?? "Verification failed";
    completeAuth(res.data.token, res.data.user);
    return null;
  };

  const verifyTwoFactorPasskey = async (token: string) => {
    const optionsRes = await api.twoFactorPasskeyOptions(token);
    if (!optionsRes.success || !optionsRes.data) return optionsRes.error ?? "Could not start passkey verification";

    const { startAuthentication } = await import("@simplewebauthn/browser");
    let response;
    try {
      response = await startAuthentication({ optionsJSON: optionsRes.data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey verification cancelled";
      if (msg.toLowerCase().includes("cancel")) return msg;
      return "Passkey verification failed";
    }

    const verifyRes = await api.twoFactorPasskeyVerify(token, response);
    if (!verifyRes.success || !verifyRes.data) return verifyRes.error ?? "Passkey verification failed";

    completeAuth(verifyRes.data.token, verifyRes.data.user);
    return null;
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
  }) => {
    const res = await api.register(data);
    if (!res.success || !res.data) return res.error ?? "Registration failed";

    completeAuth(res.data.token, res.data.user);
    return null;
  };

  const refreshUser = async () => {
    const res = await api.me();
    if (res.success && res.data) {
      setUser(res.data);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPasskey, verifyTotp, verifyTwoFactorPasskey, register, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
