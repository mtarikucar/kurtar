import { fireEvent, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

import { client } from "../lib/api-client";
import { renderWithPanelProviders } from "../test-utils/panel-render";
import { OrderRow } from "../components/OrderRow";
import type { ReservationItem } from "../lib/api-types";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;

// The status pill/stamp is `accessibilityElementsHidden` (the row's ONE
// composed accessibilityLabel already carries the status text) — mirrors
// the offer card's own convention (vitrin-karti.test.tsx).
const GORUNUR = { includeHiddenElements: true } as const;

function reservation(overrides: Partial<ReservationItem> = {}): ReservationItem {
  return {
    id: "resv-1",
    code: "A8213",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-1",
    qty: 1,
    unitPriceCents: 6900,
    totalCents: 6900,
    status: "CONFIRMED",
    cancelDeadlineAt: "2026-08-19T16:00:00.000Z",
    pickupStartAt: "2026-08-19T18:30:00.000Z",
    pickupEndAt: "2026-08-19T21:00:00.000Z",
    redeemedAt: null,
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

async function ciz(res: ReservationItem, simdi = new Date("2026-08-19T18:00:00.000Z")) {
  mockListMine.mockResolvedValue({ items: [res], total: 1, page: 1, pageSize: 50 });
  mockStore.mockResolvedValue({
    store: { id: res.storeId, name: "Moda Fırın", district: "Moda", coverImageUrl: null },
    todaysOffers: [],
    rating: { average: 0, count: 0 },
  });
  const onPress = jest.fn();
  const onKepenkAc = jest.fn();
  const result = await renderWithPanelProviders(
    <OrderRow reservation={res} onPress={onPress} onKepenkAc={onKepenkAc} />,
    { sabitZaman: simdi },
  );
  return { ...result, onPress, onKepenkAc };
}

describe("OrderRow — spec §4.6", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the live pickup pill and a KEPENGİ AÇ shortcut for a CONFIRMED order", async () => {
    await ciz(reservation({ status: "CONFIRMED" }));
    await waitFor(() => expect(screen.getByText("Moda Fırın")).toBeTruthy());
    // 18:00 -> 21:00 is 3h left, capped display as "2 sa 30 dk"-style text —
    // exact wording is ZamanHapi's; here we assert the shortcut exists.
    expect(screen.getByLabelText("KEPENGİ AÇ")).toBeTruthy();
  });

  it("pressing the KEPENGİ AÇ shortcut fires onKepenkAc without navigating to the ticket", async () => {
    const { onKepenkAc, onPress } = await ciz(reservation({ status: "CONFIRMED" }));
    await waitFor(() => expect(screen.getByText("Moda Fırın")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("KEPENGİ AÇ"));
    expect(onKepenkAc).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows the KURTARILDI stamp for a REDEEMED order, no shortcut button", async () => {
    await ciz(
      reservation({
        status: "REDEEMED",
        redeemedAt: "2026-08-19T18:34:11.000Z",
      }),
    );
    await waitFor(() => expect(screen.getByText("Moda Fırın")).toBeTruthy());
    expect(screen.getByText("KURTARILDI", GORUNUR)).toBeTruthy();
    expect(screen.queryByLabelText("KEPENGİ AÇ")).toBeNull();
  });

  it("shows a neutral status label for a cancelled order, no shortcut button", async () => {
    await ciz(reservation({ status: "CANCELLED_BY_USER" }));
    await waitFor(() => expect(screen.getByText("Moda Fırın")).toBeTruthy());
    expect(screen.getByText("İptal edildi", GORUNUR)).toBeTruthy();
    expect(screen.queryByLabelText("KEPENGİ AÇ")).toBeNull();
  });

  it("pressing the row (not the shortcut) fires onPress", async () => {
    const { onPress } = await ciz(reservation({ status: "REDEEMED", redeemedAt: "2026-08-19T18:34:11.000Z" }));
    await waitFor(() => expect(screen.getByText("Moda Fırın")).toBeTruthy());
    fireEvent.press(screen.getByText("Moda Fırın"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("falls back to the order code when no bag title is available", async () => {
    await ciz(reservation({ status: "CONFIRMED", code: "ZZ999" }));
    await waitFor(() => expect(screen.getByText(/ZZ999/)).toBeTruthy());
  });
});
