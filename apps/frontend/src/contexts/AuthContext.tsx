import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, getToken, type AuthUser, type TwoFactorRequired } from "@/lib/api";

interface PasskeyLoginResult {
  error?: string;
  twoFactor?: TwoFactorRequired;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setAuth: (token: string, u: AuthUser) => Promise<void>;
  loginWithPasskey: (identifier: string) => Promise<PasskeyLoginResult>;
  loginWithPasskeyDiscoverable: () => Promise<PasskeyLoginResult>;
  login: (identifier: string, password: string, captchaToken?: string) => Promise<{
    error?: string;
    twoFactor?: TwoFactorRequired;
    unlockRequired?: boolean;
    verifyEmailRequired?: boolean;
  }>;
  verifyTotp: (token: string, code: string) => Promise<string | null>;
  verifyTwoFactorPasskey: (token: string) => Promise<string | null>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
    captchaToken?: string;
    acceptedPolicies: boolean;
    newsletterOptIn?: boolean;
  }) => Promise<{ error?: string; fieldErrors?: Record<string, string>; needsVerification?: boolean; emailSent?: boolean; warning?: string }>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-read the full account. Login/2FA/passkey/register/OAuth responses carry
  // the slim `userPublic` shape, which has no `consent` field, so a freshly
  // signed-in account would slip past ConsentGate (`undefined !== false`) into a
  // dashboard whose every request the backend answers `403 policies_outdated`.
  // Hydrating from `GET /auth/me` keeps the gate honest without a page reload.
  // Both callbacks are memoized so `setAuth` keeps a stable identity. The OAuth
  // / SSO callback pages list it in their effect dependency arrays; an unstable
  // identity made the effect re-run after `setUser`, redeeming the one-time
  // exchange code a second time.
  const refreshUser = useCallback(async () => {
    const res = await api.me();
    if (res.success && res.data) {
      setUser(res.data);
    }
  }, []);

  // Establish the session and THEN hydrate consent, so every caller (in-app login
  // flows and the OAuth/SSO/PocketBase callbacks alike) can await a user object
  // that already carries `consent` before it navigates anywhere.
  const completeAuth = useCallback(async (token: string, u: AuthUser) => {
    setToken(token);
    setUser(u);
    await refreshUser();
  }, [refreshUser]);

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

  const login = async (identifier: string, password: string, captchaToken?: string) => {
    const res = await api.login({ identifier, password, captchaToken });
    if (!res.success || !res.data) {
      if (res.unlockRequired) return { error: res.error ?? "Account locked", unlockRequired: true };
      // A3b — the password was correct but the account's email is unverified:
      // the gate is not a failed attempt and must not read as one.
      if (res.verifyEmailRequired) return { error: res.error ?? "Please verify your email before signing in.", verifyEmailRequired: true };
      return { error: res.error ?? "Login failed" };
    }

    if (!("requiresTwoFactor" in res.data)) {
      await completeAuth(res.data.token, res.data.user);
      return {};
    }

    return { twoFactor: res.data };
  };

  const loginWithPasskey = async (identifier: string): Promise<PasskeyLoginResult> => {
    const optionsRes = await api.loginPasskeyOptions(identifier);
    if (!optionsRes.success || !optionsRes.data) return { error: optionsRes.error ?? "Could not start passkey login" };

    const { startAuthentication } = await import("@simplewebauthn/browser");
    let response;
    try {
      response = await startAuthentication({ optionsJSON: optionsRes.data.options });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey login cancelled";
      if (msg.toLowerCase().includes("cancel")) return { error: msg };
      return { error: "Passkey login failed" };
    }

    const verifyRes = await api.loginPasskeyVerify(identifier, response);
    if (!verifyRes.success || !verifyRes.data) return { error: verifyRes.error ?? "Passkey authentication failed" };

    if ("requiresTwoFactor" in verifyRes.data) {
      return { twoFactor: verifyRes.data };
    }

    await completeAuth(verifyRes.data.token, verifyRes.data.user);
    return {};
  };

  const loginWithPasskeyDiscoverable = async (): Promise<PasskeyLoginResult> => {
    const optionsRes = await api.loginPasskeyDiscoverableOptions();
    if (!optionsRes.success || !optionsRes.data) return { error: optionsRes.error ?? "Could not start passkey login" };

    const { startAuthentication } = await import("@simplewebauthn/browser");
    let response;
    try {
      response = await startAuthentication({
        optionsJSON: optionsRes.data.options,
        useBrowserAutofill: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey login cancelled";
      if (msg.toLowerCase().includes("cancel")) return { error: msg };
      return { error: "Passkey login failed" };
    }

    const verifyRes = await api.loginPasskeyDiscoverableVerify(response);
    if (!verifyRes.success || !verifyRes.data) return { error: verifyRes.error ?? "Passkey authentication failed" };

    if ("requiresTwoFactor" in verifyRes.data) {
      return { twoFactor: verifyRes.data };
    }

    await completeAuth(verifyRes.data.token, verifyRes.data.user);
    return {};
  };

  const verifyTotp = async (token: string, code: string) => {
    const res = await api.verifyTotp(token, code);
    if (!res.success || !res.data) return res.error ?? "Verification failed";
    await completeAuth(res.data.token, res.data.user);
    return null;
  };

  const verifyTwoFactorPasskey = async (token: string) => {
    const optionsRes = await api.twoFactorPasskeyOptions(token);
    if (!optionsRes.success || !optionsRes.data) return optionsRes.error ?? "Could not start passkey verification";

    const { startAuthentication } = await import("@simplewebauthn/browser");
    let response;
    try {
      response = await startAuthentication({ optionsJSON: optionsRes.data.options });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Passkey verification cancelled";
      if (msg.toLowerCase().includes("cancel")) return msg;
      return "Passkey verification failed";
    }

    const verifyRes = await api.twoFactorPasskeyVerify(token, response);
    if (!verifyRes.success || !verifyRes.data) return verifyRes.error ?? "Passkey verification failed";

    await completeAuth(verifyRes.data.token, verifyRes.data.user);
    return null;
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
    captchaToken?: string;
    acceptedPolicies: boolean;
    newsletterOptIn?: boolean;
  }) => {
    const res = await api.register(data);
    if (!res.success || !res.data) {
      return {
        error: res.error ?? "Registration failed",
        fieldErrors: res.fieldErrors,
      };
    }

    // A3b — the account was created but its email was not verified yet (the
    // register flow no longer auto-logs-in). Persist no session: the page must
    // show the "check your email" confirmation instead.
    if (!("token" in res.data)) {
      return {
        needsVerification: true,
        emailSent: res.data.emailSent,
        warning: res.data.warning,
      };
    }

    await completeAuth(res.data.token, res.data.user);
    return {};
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setAuth: completeAuth, login, loginWithPasskey, loginWithPasskeyDiscoverable, verifyTotp, verifyTwoFactorPasskey, register, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
