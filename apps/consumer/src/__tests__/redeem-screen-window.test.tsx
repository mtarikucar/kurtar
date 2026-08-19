import { screen, waitFor, act, within, fireEvent } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "resv-1" }),
}));

import { ekraniCiz } from "../test-utils/ekran";
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
    code: "K-7F3M",
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
  return ekraniCiz(<RedeemScreen />);
}

/** The shutter's own activate action — the same path VoiceOver takes, and
 * the only one a Node test environment can drive (a 140pt drag needs real
 * touches). The threshold itself is proven in teslim-perde.test.ts. */
async function kepengiKaldir() {
  const kol = await screen.findByTestId("kepenk-kol-suruklenir");
  await act(async () => {
    fireEvent(kol, "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    });
  });
}

// [I9 fix] The redeem screen used to show no pickup window at all, and
// would let a too-early/too-late swipe fail server-side into one vague
// "Bu sipariş şu anda teslim alınamıyor" message.
//
// [Cross-lane fix, I9] The window comes off the RESERVATION itself
// (`GET /reservations/mine` joins the offer's window), not off a local
// purchase-time snapshot — so these tests deliberately drive it through
// the reservation and, in the first case, assert it renders with NO
// snapshot saved at all: the reinstalled-device-at-the-counter case that
// previously had no window and no end time.
describe("Kepenk — pickup window visibility and pre-emptive gating (I9)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the window on the closed shutter and lets it be lifted — with no local snapshot at all", async () => {
    const pickupStartAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const pickupEndAt = new Date(Date.now() + 60 * 60_000).toISOString();
    mockListMine.mockResolvedValue(
      listResponse(reservation({ pickupStartAt, pickupEndAt })),
    );

    await renderRedeemScreen();

    expect(
      await screen.findByText(formatPickupWindow(pickupStartAt, pickupEndAt), {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("kepenk-kol-suruklenir")).toBeTruthy();
    expect(screen.queryByTestId("kepenk-uyari")).toBeNull();

    await kepengiKaldir();
    expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
  });

  it("before the window opens, bolts the shutter and states the reason instead of letting a swipe fail", async () => {
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

    const uyari = await screen.findByTestId("kepenk-uyari");
    // The specific start time is stated, not a vague "not redeemable" line.
    expect(
      within(uyari).getByText(new RegExp(formatClockTime(pickupStartAt))),
    ).toBeTruthy();

    // The handle still exists — a dead control reads as a broken screen —
    // but it cannot open anything, and the code stays off the screen.
    await kepengiKaldir();
    expect(screen.queryByTestId("kepenk-acik")).toBeNull();
    expect(screen.queryByTestId("kepenk-kod-hanesi")).toBeNull();
  });

  it("unlocks the shutter live once the clock crosses the window start, with no navigation", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const pickupStartAt = new Date(Date.now() + 2_000).toISOString();
    const pickupEndAt = new Date(Date.now() + 60 * 60_000).toISOString();
    mockListMine.mockResolvedValue(
      listResponse(reservation({ pickupStartAt, pickupEndAt })),
    );

    await renderRedeemScreen();
    await waitFor(() => expect(screen.getByTestId("kepenk-uyari")).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });

    await waitFor(() => expect(screen.queryByTestId("kepenk-uyari")).toBeNull());
    await kepengiKaldir();
    expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
  });

  it("once the window has closed, falls through to the not-redeemable state instead of offering a doomed swipe", async () => {
    const pickupStartAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const pickupEndAt = new Date(Date.now() - 60 * 60_000).toISOString();
    mockListMine.mockResolvedValue(
      listResponse(reservation({ pickupStartAt, pickupEndAt })),
    );

    await renderRedeemScreen();

    expect(await screen.findByText("Bu sipariş şu anda teslim alınamıyor")).toBeTruthy();
    expect(screen.queryByTestId("kepenk-kol-suruklenir")).toBeNull();
  });
});

// [Cross-lane fix, I9] The other half: a redeem that DOES reach the server
// and is refused now comes back with a reason-specific errorCode, and the
// screen renders the sentence for THAT reason instead of one vague line
// for all of them. Driven end-to-end through the real screen + the real
// getErrorMessage mapping, not by asserting the i18n file's contents.
describe("Kepenk — a server refusal states its own reason", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  const openWindow = () => ({
    pickupStartAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    pickupEndAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });

  async function teslimAlVeHatayiOku(errorCode: string, message: string) {
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
    await kepengiKaldir();
    await act(async () => {
      fireEvent.press(screen.getByTestId("kepenk-teslim-aldim"));
    });
  }

  it("renders the merchant-cancelled sentence, not the generic one", async () => {
    await teslimAlVeHatayiOku(
      "RESERVATION_CANCELLED_BY_MERCHANT",
      "The merchant cancelled this offer.",
    );
    expect(
      await screen.findByText("Mağaza bu paketi iptal etti — ödemen iade edildi."),
    ).toBeTruthy();
    expect(screen.queryByText("Bu sipariş şu anda teslim alınamıyor.")).toBeNull();
  });

  it("renders the window-passed sentence for a too-late redeem the client did not pre-empt", async () => {
    await teslimAlVeHatayiOku(
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
    await teslimAlVeHatayiOku(
      "RESERVATION_NOT_YOURS",
      "This reservation does not belong to you.",
    );
    expect(await screen.findByText("Bu sipariş sana ait değil.")).toBeTruthy();
    expect(screen.queryByText("Bu işlem için yetkin yok.")).toBeNull();
  });
});
