import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState, type ReactNode } from "react";

// B4 regression — AuthContext `refreshUser`/`completeAuth` are wrapped in
// useCallback so `setAuth` (aliased to completeAuth) keeps a stable identity
// across provider re-renders. The OAuth/SSO callback pages list `setAuth` in an
// effect dependency array; an unstable identity made the effect re-run after
// `setUser`, redeeming the one-time exchange code a second time.
vi.mock("@/lib/api", () => ({
  api: { me: vi.fn(() => Promise.resolve({ success: false })) },
  // No stored token, so the provider's mount effect never calls api.me.
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

let bump: () => void = () => {};

function Wrapper({ children }: { children: ReactNode }) {
  const [n, setN] = useState(0);
  bump = () => setN(n + 1);
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext stability (B4)", () => {
  beforeEach(() => {
    bump = () => {};
  });

  test("setAuth, refreshUser and completeAuth keep a stable identity across re-renders", () => {
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    const firstSetAuth = result.current.setAuth;
    const firstRefreshUser = result.current.refreshUser;

    act(() => bump());
    expect(result.current.setAuth).toBe(firstSetAuth);
    expect(result.current.refreshUser).toBe(firstRefreshUser);

    act(() => bump());
    expect(result.current.setAuth).toBe(firstSetAuth);
    expect(result.current.refreshUser).toBe(firstRefreshUser);
  });
});
