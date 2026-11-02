import { createContext } from "react";
import type { AuthUser, TwoFactorRequired } from "@/lib/api";

export interface PasskeyLoginResult {
  error?: string;
  twoFactor?: TwoFactorRequired;
}

export interface AuthContextValue {
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

// Provider and hook import this private context separately. This keeps the
// provider module's exports component-only for React Fast Refresh.
export const authContext = createContext<AuthContextValue | null>(null);
