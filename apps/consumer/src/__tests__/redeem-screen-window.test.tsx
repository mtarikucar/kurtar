import {
  render,
  screen,
  waitFor,
  act,
  within,
  fireEvent,
} from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "resv-1" }),
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test-utils/render";
import { client } from "../lib/api-client";
import RedeemScreen from "../app/redeem/[id]";
import { savePurchaseSnapshot } from "../lib/purchase-cache";
import { KurtarApiError } from "@kurtar/api-client";
import { formatClockTime, formatPickupWindow } from "../lib/format";
import type { ReservationItem, ReservationListResponse } from "../lib/api-types";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;

function reservation(overrides: Partial<ReservationItem> = {}): ReservationItem {
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

function listResponse(item: ReservationItem): ReservationListResponse {
  return { items: [item], total: 1, page: 1, pageSize: 20 };
}

function renderRedeemScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RedeemScreen />
    </QueryClientProvider>,
  );
}

// [I9 fix] The redeem screen used to show no pickup window at all, and
// would let a too-early/too-late swipe fail server-side into one vague
// "Bu sipariş şu anda teslim alınamıyor" message.
//
// [Cross-lane fix, I9] The window now comes off the RESERVATION itself
// (`GET /reservations/mine` joins the offer's window), not off a local
// purchase-time snapshot — so these tests deliberately drive it through
// the reservation and, in the first case, assert it renders with NO
// snapshot saved at all: the reinstalled-device-at-the-counter case that
// previously had no window and no end time.
describe("Redeem screen — pickup window visibility and pre-emptive gating (I9)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the window and offers the swipe when it is open — with no local snapshot at all", async () => {
    const pickupStartAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const pickupEndAt = new Date(Date.now() + 60 * 60_000).toISOString();
    mockListMine.mockResolvedValue(
      listResponse(reservation({ pickupStartAt, pickupEndAt })),
    );

    await renderRedeemScreen();

    expect(
      await screen.findByText(formatPickupWindow(pickupStartAt, pickupEndAt), { exact: false }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Teslim almak için kaydır")).toBeTruthy();
    expect(screen.queryByTestId("redeem-not-started-yet")).toBeNull();
  });

  it("before the window opens, replaces the swipe control with a specific reason instead of letting it fail", async () => {
    const pickupStartAt = new Date(Date.now() + 45 * 60_000).toISOString();
    const pickupEndAt = new Date(Date.now() + 105 * 60_000).toISOString();
    mockListMine.mockResolvedValue(
      listResponse(reservation({ pickupStartAt, pickupEndAt })),
    );
    await savePurchaseSnapshot("resv-1", {
      storeName: "Ada Fırın",
      storeDistrict: "Kadıköy",
      bagTitle: "Sürpriz Fırın Paketi",
      coverImageUrl: null,
      pickupStartAt,
      pickupEndAt,
    });

    await renderRedeemScreen();

    const banner = await screen.findByTestId("redeem-not-started-yet");
    // The specific start time is stated, not a vague "not redeemable" line.
    expect(
      within(banner).getByText(new RegExp(formatClockTime(pickupStartAt))),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Teslim almak için kaydır")).toBeNull();
  });

  it("unlocks the swipe control live once the clock crosses the window start, with no navigation", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const pickupStartAt = new Date(Date.now() + 2_000).toISOString();
    const pickupEndAt = new Date(Date.now() + 60 * 60_000).toISOString();
    mockListMine.mockResolvedValue(
      listResponse(reservation({ pickupStartAt, pickupEndAt })),
    );

    await renderRedeemScreen();
    await waitFor(() => expect(screen.getByTestId("redeem-not-started-yet")).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Teslim almak için kaydır")).toBeTruthy(),
    );
    expect(screen.queryByTestId("redeem-not-started-yet")).toBeNull();
  });

  it("once the window has closed, falls through to the not-redeemable empty state instead of offering a doomed swipe", async () => {
    const pickupStartAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const pickupEndAt = new Date(Date.now() - 60 * 60_000).toISOString();
    mockListMine.mockResolvedValue(
      listResponse(reservation({ pickupStartAt, pickupEndAt })),
    );

    await renderRedeemScreen();

    expect(await screen.findByText("Bu sipariş şu anda teslim alınamıyor")).toBeTruthy();
    expect(screen.queryByLabelText("Teslim almak için kaydır")).toBeNull();
  });
});

// [Cross-lane fix, I9] The other half: a swipe that DOES reach the server
// and is refused now comes back with a reason-specific errorCode, and the
// screen renders the sentence for THAT reason instead of one vague line
// for all of them. Driven end-to-end through the real screen + the real
// getErrorMessage mapping, not by asserting the i18n file's contents.
describe("Redeem screen — a server refusal states its own reason", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  const openWindow = () => ({
    pickupStartAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    pickupEndAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });

  async function swipeAndReadError(errorCode: string, message: string) {
    mockListMine.mockResolvedValue(listResponse(reservation(openWindow())));
    (client.reservations.redeem as jest.Mock).mockRejectedValueOnce(
      new KurtarApiError({
        statusCode: errorCode === "RESERVATION_NOT_YOURS" ? 403 : 409,
        errorCode,
        message,
        isBackendErrorCode: true,
      }),
    );

    await renderRedeemScreen();
    const swipe = await screen.findByLabelText("Teslim almak için kaydır");
    await act(async () => {
      fireEvent(swipe, "accessibilityAction", {
        nativeEvent: { actionName: "activate" },
      });
    });
  }

  it("renders the merchant-cancelled sentence, not the generic one", async () => {
    await swipeAndReadError(
      "RESERVATION_CANCELLED_BY_MERCHANT",
      "The merchant cancelled this offer.",
    );
    expect(
      await screen.findByText(
        "Mağaza bu paketi iptal etti — ödemen iade edildi.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("Bu sipariş şu anda teslim alınamıyor."),
    ).toBeNull();
  });

  it("renders the window-passed sentence for a too-late swipe the client did not pre-empt", async () => {
    await swipeAndReadError(
      "RESERVATION_PICKUP_WINDOW_PASSED",
      "The pickup window has already closed.",
    );
    expect(
      await screen.findByText(
        "Teslim alma penceresi kapandı. Paketi alamadıysan buradan şikayet oluşturabilirsin.",
      ),
    ).toBeTruthy();
  });

  it("renders the not-yours sentence rather than the bare permission copy", async () => {
    await swipeAndReadError(
      "RESERVATION_NOT_YOURS",
      "This reservation does not belong to you.",
    );
    expect(
      await screen.findByText("Bu sipariş sana ait değil."),
    ).toBeTruthy();
    expect(screen.queryByText("Bu işlem için yetkin yok.")).toBeNull();
  });
});
