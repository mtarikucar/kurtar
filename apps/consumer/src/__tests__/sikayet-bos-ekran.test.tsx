import { fireEvent, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import { renderWithPanelProviders } from "../test-utils/panel-render";
import { client } from "../lib/api-client";
import MyComplaintsScreen from "../app/complaints/index";
import "../i18n";

const mockListMine = client.complaints.listMine as jest.Mock;

/**
 * [#28] The empty state said "you can report it FROM HERE" and then gave
 * no way to do so: no CTA on the empty state, no action in the header,
 * and no reference to /complaint/new anywhere on the screen. The only
 * route to filing was to back out to Profil — on the support path a
 * frustrated user reaches after a bad handover. An empty screen is an
 * invitation to act, and this one made a promise the screen could not
 * keep.
 */
describe("Şikayetlerim — the empty state keeps its own promise (#28)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("offers the action its copy points at", async () => {
    mockListMine.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

    await renderWithPanelProviders(<MyComplaintsScreen />);

    await waitFor(() => expect(screen.getByText("Henüz şikayetin yok")).toBeTruthy());
    const cta = screen.getByText("Şikayet / destek");
    await fireEvent.press(cta);

    expect(mockPush).toHaveBeenCalledWith("/complaint/new");
  });

  it("does not offer it when the list is not empty", async () => {
    mockListMine.mockResolvedValue({
      items: [
        {
          id: "complaint-1",
          userId: "user-1",
          merchantId: "merchant-1",
          reservationId: "res-1",
          category: "MISSING_ITEMS",
          description: "Poşette bir ürün eksikti.",
          status: "OPEN",
          slaDeadlineAt: "2026-08-30T12:00:00.000Z",
          resolvedAt: null,
          slaWarningSentAt: null,
          refundedAt: null,
          createdAt: "2026-08-15T12:00:00.000Z",
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    await renderWithPanelProviders(<MyComplaintsScreen />);

    await waitFor(() =>
      expect(screen.getByText("Poşette bir ürün eksikti.")).toBeTruthy(),
    );
    expect(screen.queryByText("Şikayet / destek")).toBeNull();
  });
});
