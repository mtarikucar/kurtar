import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockBack = jest.fn();
let mockSearchParams = { id: "resv-1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test-utils/render";
import { client } from "../lib/api-client";
import CancelScreen from "../app/cancel/[id]";
import "../i18n";
import { ThemeProvider } from "../design/theme";
import { ClockProvider } from "../design/saat";
import { KurtarApiError } from "@kurtar/api-client";
import type { ReservationItem } from "../lib/api-types";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockCancel = client.reservations.cancel as jest.Mock;

function reservation(overrides: Partial<ReservationItem>): ReservationItem {
  return {
    id: "resv-1",
    code: "AB12CD",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-1",
    qty: 1,
    unitPriceCents: 4990,
    totalCents: 4990,
    status: "CONFIRMED",
    cancelDeadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    // [I9 fix] The pickup window now comes off the reservation itself —
    // GET /reservations/mine joins the offer's window, so no screen has
    // to reconstruct it from cancelDeadlineAt any more.
    pickupStartAt: new Date(Date.now() + 3600_000 + 7_200_000).toISOString(),
    pickupEndAt: new Date(Date.now() + 3600_000 + 7_200_000 + 5_400_000).toISOString(),
    redeemedAt: null,
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderCancelScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClockProvider>
        <ThemeProvider fazZorla="gece">
        <CancelScreen />
      </ThemeProvider>
      </ClockProvider>
    </QueryClientProvider>,
  );
}

describe("Cancel screen — cancel-deadline gating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: "resv-1" };
  });

  it("before the deadline: shows the refund note and a working cancel CTA", async () => {
    mockListMine.mockResolvedValue({
      items: [reservation({ cancelDeadlineAt: new Date(Date.now() + 3600_000).toISOString() })],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mockCancel.mockResolvedValue({
      reservationId: "resv-1",
      status: "CANCELLED_BY_USER",
    });

    await renderCancelScreen();
    await waitFor(() => expect(screen.getByText("Evet, iptal et")).toBeTruthy());
    expect(screen.getByText("Ücretin tamamı iade edilecek.")).toBeTruthy();

    await fireEvent.press(screen.getByText("Evet, iptal et"));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("resv-1"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("after the deadline: hides the cancel CTA and shows the non-cancellable notice instead", async () => {
    mockListMine.mockResolvedValue({
      items: [reservation({ cancelDeadlineAt: new Date(Date.now() - 60_000).toISOString() })],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    await renderCancelScreen();
    await waitFor(() =>
      expect(screen.getByText("Bu sipariş artık iptal edilemiyor.")).toBeTruthy(),
    );
    expect(screen.queryByText("Evet, iptal et")).toBeNull();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("surfaces the server's RESERVATION_NOT_CANCELLABLE rejection inline (a race with the deadline sweeper)", async () => {
    mockListMine.mockResolvedValue({
      items: [reservation({ cancelDeadlineAt: new Date(Date.now() + 3600_000).toISOString() })],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mockCancel.mockRejectedValue(
      new KurtarApiError({
        statusCode: 409,
        errorCode: "RESERVATION_NOT_CANCELLABLE",
        message: "This reservation can no longer be cancelled.",
        isBackendErrorCode: true,
      }),
    );

    await renderCancelScreen();
    await waitFor(() => expect(screen.getByText("Evet, iptal et")).toBeTruthy());
    await fireEvent.press(screen.getByText("Evet, iptal et"));

    await waitFor(() =>
      expect(screen.getByText("Bu sipariş artık iptal edilemiyor.")).toBeTruthy(),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });
});
