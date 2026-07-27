import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, getToken, type AuthUser } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
  }) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    if (!res.success || !res.data) return res.error ?? "Login failed";

    setToken(res.data.token);
    setUser(res.data.user);
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

    setToken(res.data.token);
    setUser(res.data.user);
    return null;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
