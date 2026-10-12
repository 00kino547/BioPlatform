import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

// B3 regression — the `/:username` route does not remount when only the param
// changes, so PublicProfilePage resets its per-navigation state (error, profile,
// loading) at the start of the username effect. Without that reset a previous
// 404 kept `error` true and the next valid profile rendered "Profile not found".
vi.mock("@/lib/api", () => ({
  api: {
    getPublicProfile: vi.fn(),
    getBadges: vi.fn(() => Promise.resolve({ success: true, data: [] })),
    getFeatures: vi.fn(() => Promise.resolve({ success: true, data: null })),
    getProfilePresence: vi.fn(() => Promise.resolve({ success: true, data: null })),
  },
}));
vi.mock("@/lib/useInstanceConfig", () => ({ useInstanceConfig: () => null }));
vi.mock("@/contexts/DomainContext", () => ({ useDomain: () => ({ info: null }) }));
vi.mock("@/lib/seo", () => ({
  usePageMeta: () => {},
  useJsonLd: () => {},
  useMetaTags: () => {},
}));

import { PublicProfilePage } from "@/pages/PublicProfile";
import { api } from "@/lib/api";

describe("PublicProfile username switch (B3)", () => {
  beforeEach(() => {
    vi.mocked(api.getPublicProfile).mockImplementation((u: string) =>
      u === "ghost"
        ? Promise.resolve({ success: false, error: "not found" } as never)
        : // Never resolves: the second profile stays in the loading state, which
          // is exactly where a missing reset would still be showing the old 404.
          (new Promise(() => {}) as never)
    );
  });

  test("clears a previous 404 when the username changes", async () => {
    const router = createMemoryRouter([{ path: "/:username", element: <PublicProfilePage /> }], {
      initialEntries: ["/ghost"],
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText(/profile not found/i)).toBeTruthy();

    await act(async () => {
      await router.navigate("/alive");
    });

    await waitFor(() => {
      expect(screen.queryByText(/profile not found/i)).toBeNull();
    });
  });
});
