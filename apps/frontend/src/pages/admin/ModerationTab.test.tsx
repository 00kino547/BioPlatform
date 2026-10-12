import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// B2 regression — ReportDetail's dismiss() and recordCounter() call reset(),
// which clears `notice`, and then set the success notice. The order matters:
// if the success notice is set BEFORE reset() they collapse in the same React
// render batch and the OK banner never appears (the operator sees the action
// "do nothing" even though the API call succeeded). These tests pin the order
// by asserting the success toast is actually rendered after each action.
vi.mock("@/lib/api", () => ({
  api: {
    getAdminDmcaReports: vi.fn(),
    getAdminDmcaReport: vi.fn(),
    dismissAdminDmcaReport: vi.fn(),
    recordAdminDmcaCounterNotice: vi.fn(),
    searchAdminDmcaMedia: vi.fn(),
    getAdminDmcaHashes: vi.fn(),
    getAdminDmcaDisabled: vi.fn(),
    // Manual (report-less) moderation.
    runAdminDmcaManualTakedown: vi.fn(),
    banAdminDmcaHash: vi.fn(),
    deleteAdminDmcaMedia: vi.fn(),
    takedownAdminDmcaProfile: vi.fn(),
    disableAdminDmcaUser: vi.fn(),
  },
}));

import { ModerationTab, ReportDetail } from "@/pages/admin/ModerationTab";
import { api } from "@/lib/api";

const detail = {
  id: "report-1",
  status: "NEW" as const,
  claimantName: "Acme Rights",
  claimantEmail: "legal@acme.test",
  workUrl: "https://acme.test/work",
  description: "Copied art",
  infringingUrls: ["https://example.test/a"],
  contactNote: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  handledAt: null,
  decisionNote: null,
  counterNotice: null,
  counterNoticeAt: null,
  filedByUser: null,
  handledBy: null,
  hashes: [],
};

describe("ModerationTab report detail notices (B2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAdminDmcaReports).mockResolvedValue({
      success: true,
      data: [],
      counts: { NEW: 0, TAKEN_DOWN: 0, DISMISSED: 0, COUNTER_NOTICE: 0 },
      pagination: { total: 0, limit: 20, offset: 0 },
    } as never);
    vi.mocked(api.getAdminDmcaReport).mockResolvedValue({ success: true, data: detail } as never);
    vi.mocked(api.dismissAdminDmcaReport).mockResolvedValue({ success: true } as never);
    vi.mocked(api.recordAdminDmcaCounterNotice).mockResolvedValue({ success: true } as never);
    vi.mocked(api.searchAdminDmcaMedia).mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, limit: 20, offset: 0 },
    } as never);
    vi.mocked(api.getAdminDmcaHashes).mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, limit: 50, offset: 0 },
    } as never);
    vi.mocked(api.getAdminDmcaDisabled).mockResolvedValue({
      success: true,
      data: [],
      pagination: { total: 0, limit: 50, offset: 0 },
    } as never);
    vi.mocked(api.runAdminDmcaManualTakedown).mockResolvedValue({
      success: true,
      data: { filesRemoved: 1, hashesBanned: 1, accountsDisabled: [] },
    } as never);
    vi.mocked(api.banAdminDmcaHash).mockResolvedValue({ success: true, data: { id: "ban-1" } } as never);
    vi.mocked(api.deleteAdminDmcaMedia).mockResolvedValue({ success: true } as never);
    vi.mocked(api.takedownAdminDmcaProfile).mockResolvedValue({
      success: true,
      data: { filesRemoved: 2, hashesBanned: 2, accountsDisabled: [] },
    } as never);
    vi.mocked(api.disableAdminDmcaUser).mockResolvedValue({ success: true } as never);
  });

  // Regression: the report queue read `res.data.reports`, but routes/adminDmca.ts
  // returns the rows as `data` (an array) with `counts`/`pagination` as siblings.
  // The missing key made the queue dereference `.length` on undefined and trip the
  // ErrorBoundary ("Cannot read properties of undefined (reading 'length')").
  test("renders the report queue with the backend list envelope", async () => {
    render(<ModerationTab locked={false} />);

    await waitFor(() => {
      expect(screen.getByText(/no reports match these filters/i)).toBeTruthy();
    });
  });

  // The same envelope mistake lived in the other three list views; each must
  // render its empty state from `data` (an array) without crashing.
  test("renders the media, hashes and disabled sub-views from the list envelope", async () => {
    render(<ModerationTab locked={false} />);

    fireEvent.click(await screen.findByRole("button", { name: /media search/i }));
    await waitFor(() => {
      expect(screen.getByText(/no media files match/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /banned hashes/i }));
    await waitFor(() => {
      expect(screen.getByText(/no active hash bans/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /disabled accounts/i }));
    await waitFor(() => {
      expect(screen.getByText(/no accounts are currently disabled/i)).toBeTruthy();
    });
  });

  test("dismissing shows the success notice instead of clearing it", async () => {
    render(<ReportDetail reportId="report-1" locked={false} onBack={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /dismiss report/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/report dismissed\. the claimant has been emailed the outcome/i)
      ).toBeTruthy();
    });
    expect(api.dismissAdminDmcaReport).toHaveBeenCalledWith("report-1", "");
  });

  test("recording a counter-notice shows the success notice", async () => {
    render(<ReportDetail reportId="report-1" locked={false} onBack={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /record counter-notice/i }));

    await waitFor(() => {
      expect(screen.getByText(/counter-notice recorded/i)).toBeTruthy();
    });
  });
});

// Manual (report-less) moderation: the Media search view is now the operator's
// toolbox. These tests pin the client wiring — the right method, the right
// arguments (accounts OFF by default) and the success notice.
describe("ModerationTab manual moderation", () => {
  const mediaRow = {
    id: "media-1",
    kind: "AVATAR",
    sha256: "a".repeat(64),
    pHashHex: "b".repeat(16),
    filePath: "media/a.png",
    createdAt: "2026-10-01T00:00:00.000Z",
    profileId: "profile-1",
    profileSlug: "alice",
    owner: { userId: "user-1", username: "alice" },
    copyOwners: ["alice"],
    copyCount: 1,
    banned: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.mocked(api.searchAdminDmcaMedia).mockResolvedValue({
      success: true,
      data: [mediaRow],
      pagination: { total: 1, limit: 20, offset: 0 },
    } as never);
    vi.mocked(api.runAdminDmcaManualTakedown).mockResolvedValue({
      success: true,
      data: { filesRemoved: 1, hashesBanned: 1, accountsDisabled: [] },
    } as never);
    vi.mocked(api.banAdminDmcaHash).mockResolvedValue({ success: true, data: { id: "ban-1" } } as never);
    vi.mocked(api.deleteAdminDmcaMedia).mockResolvedValue({ success: true } as never);
    vi.mocked(api.takedownAdminDmcaProfile).mockResolvedValue({
      success: true,
      data: { filesRemoved: 2, hashesBanned: 2, accountsDisabled: [] },
    } as never);
    vi.mocked(api.disableAdminDmcaUser).mockResolvedValue({ success: true } as never);
  });

  async function openMediaView() {
    render(<ModerationTab locked={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /media search/i }));
    await screen.findByText(/ban a hash directly/i);
  }

  test("exposes the report-less operator tools", async () => {
    await openMediaView();
    expect(screen.getByText(/take down a whole profile/i)).toBeTruthy();
    expect(screen.getByText(/disable an account/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^ban hash$/i })).toBeTruthy();
  });

  test("banning a hash calls the API with the typed hash", async () => {
    await openMediaView();
    fireEvent.change(screen.getByLabelText(/sha-256 \(64 hex\)/i), { target: { value: "a".repeat(64) } });
    fireEvent.click(screen.getByRole("button", { name: /^ban hash$/i }));

    await waitFor(() => {
      expect(api.banAdminDmcaHash).toHaveBeenCalledWith({
        sha256: "a".repeat(64),
        pHashHex: undefined,
        note: undefined,
      });
    });
    expect(await screen.findByText(/hash banned/i)).toBeTruthy();
  });

  test("disabling an account from the form records the reason", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openMediaView();
    fireEvent.change(screen.getByLabelText(/username or user id/i), { target: { value: "bob" } });
    fireEvent.change(screen.getByLabelText(/^reason$/i), { target: { value: "Abuse" } });
    fireEvent.click(screen.getByRole("button", { name: /^disable account$/i }));

    await waitFor(() => {
      expect(api.disableAdminDmcaUser).toHaveBeenCalledWith("bob", "Abuse");
    });
  });

  test("manual bulk takedown keeps accounts enabled by default", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openMediaView();
    fireEvent.click(screen.getByLabelText(/select media\/a\.png/i));
    fireEvent.click(screen.getByRole("button", { name: /execute takedown/i }));

    await waitFor(() => {
      expect(api.runAdminDmcaManualTakedown).toHaveBeenCalledWith({
        mediaFileIds: ["media-1"],
        note: undefined,
        disableAccount: false,
      });
    });
  });

  test("deleting a single file does not run a takedown", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openMediaView();
    fireEvent.click(screen.getByRole("button", { name: /delete media\/a\.png/i }));

    await waitFor(() => {
      expect(api.deleteAdminDmcaMedia).toHaveBeenCalledWith("media-1");
    });
    expect(api.runAdminDmcaManualTakedown).not.toHaveBeenCalled();
  });

  test("taking down a profile from a row uses its slug", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openMediaView();
    fireEvent.click(screen.getByRole("button", { name: /take down profile alice/i }));

    await waitFor(() => {
      expect(api.takedownAdminDmcaProfile).toHaveBeenCalledWith("alice", {});
    });
  });
});
