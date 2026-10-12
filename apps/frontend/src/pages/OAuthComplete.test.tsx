import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// B1 regression — OAuthComplete snapshots the sessionStorage `setup` payload in
// a lazy useState initializer. The success path removes the sessionStorage key
// before switching to the "check your email" panel; when `setup` was re-read on
// every render, that removal nulled it and the verification screen was replaced
// by the "session expired" panel.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ setAuth: vi.fn() }),
}));
vi.mock("@/lib/seo", () => ({ usePageMeta: () => {} }));
vi.mock("@/lib/api", () => ({ api: { oauthSignup: vi.fn() } }));

import { OAuthComplete } from "@/pages/OAuthComplete";
import { OAUTH_SETUP_KEY } from "@/lib/oauthStorage";
import { api } from "@/lib/api";

const SETUP = {
  status: "needs_setup" as const,
  signupToken: "signup-token-123",
  provider: "google" as const,
  name: null,
  avatar: null,
  email: null,
  requiresEmail: false,
  requiresInvite: false,
  suggestedUsername: "alice",
};

describe("OAuthComplete (B1)", () => {
  beforeEach(() => {
    sessionStorage.setItem(OAUTH_SETUP_KEY, JSON.stringify(SETUP));
    vi.mocked(api.oauthSignup).mockResolvedValue({
      success: true,
      // No `token` -> the account still needs email verification, which is the
      // branch that removes the sessionStorage key and shows the panel.
      data: { status: "verification_required", emailSent: false },
    } as never);
  });

  test("keeps the verification screen after sessionStorage is cleared", async () => {
    render(
      <MemoryRouter>
        <OAuthComplete />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeTruthy();
    });
    // The regression symptom: the expired panel replacing the success screen.
    expect(screen.queryByText(/session has expired or is missing/i)).toBeNull();
    // And the payload really was consumed.
    expect(sessionStorage.getItem(OAUTH_SETUP_KEY)).toBeNull();
  });

  test("a missing setup payload still shows the expired panel", () => {
    sessionStorage.removeItem(OAUTH_SETUP_KEY);
    render(
      <MemoryRouter>
        <OAuthComplete />
      </MemoryRouter>
    );
    expect(screen.getByText(/session has expired or is missing/i)).toBeTruthy();
  });
});
