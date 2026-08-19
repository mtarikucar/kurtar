import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("../lib/api-client");

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "resv-1" }),
}));

import { ekraniCiz } from "../test-utils/ekran";
import { erisimAzaltmayiAyarla } from "../test-utils/erisim";
import { client } from "../lib/api-client";
import RedeemScreen from "../app/redeem/[id]";
import { savePurchaseSnapshot } from "../lib/purchase-cache";
import type { ReservationItem, ReservationListResponse } from "../lib/api-types";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockRedeem = client.reservations.redeem as jest.Mock;
const mockImpact = client.impact.getMine as jest.Mock;

function acikPencere(overrides: Partial<ReservationItem> = {}): ReservationItem {
  return {
    id: "resv-1",
    code: "K-7F3M",
    userId: "user-1",
    offerId: "offer-1",
    storeId: "store-1",
    qty: 1,
    unitPriceCents: 6900,
    totalCents: 6900,
    status: "CONFIRMED",
    cancelDeadlineAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    pickupStartAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    pickupEndAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    redeemedAt: null,
    redeemedByMerchantUserId: null,
    pickupReminderSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function liste(item: ReservationItem): ReservationListResponse {
  return { items: [item], total: 1, page: 1, pageSize: 20 };
}

async function ciz() {
  return ekraniCiz(<RedeemScreen />);
}

async function etkinlestir(testID: string) {
  const el = await screen.findByTestId(testID);
  await act(async () => {
    fireEvent(el, "accessibilityAction", {
      nativeEvent: { actionName: "activate" },
    });
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockListMine.mockResolvedValue(liste(acikPencere()));
  mockImpact.mockResolvedValue({
    mealsSaved: 13,
    co2eGrams: 1000,
    moneySavedCents: 100000,
    count: 13,
  });
  await savePurchaseSnapshot("resv-1", {
    storeName: "Moda Fırın",
    storeDistrict: "Kadıköy",
    bagTitle: "Fırından Sürpriz Paket",
    coverImageUrl: null,
    pickupStartAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    pickupEndAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
});

/**
 * The one property that makes this design beat a static QR: a screenshot
 * of the closed state is a picture of a closed shop and NOTHING else. The
 * code, the clock and the order are not styled away — they are not
 * mounted (spec §4.5 State A).
 */
describe("Kepenk — the closed state has nothing to screenshot", () => {
  it("shows an unlit sign and no code, no clock and no order", async () => {
    await ciz();

    expect(await screen.findByTestId("kepenk-tabela-sonuk")).toBeTruthy();
    expect(screen.queryByTestId("kepenk-tabela-yanik")).toBeNull();
    expect(screen.queryByTestId("kepenk-kod-hanesi")).toBeNull();
    expect(screen.queryByTestId("kepenk-saat")).toBeNull();
    expect(screen.queryByTestId("kepenk-acik")).toBeNull();
    // The shop name IS the largest thing on the screen even shut: staff
    // verify "this is us" first, always.
    expect(screen.getByText("MODA FIRIN")).toBeTruthy();
  });

  it("lights the sign and produces the code, the clock and the order only after the shutter moves", async () => {
    await ciz();
    await etkinlestir("kepenk-kol-suruklenir");

    expect(screen.getByTestId("kepenk-tabela-yanik")).toBeTruthy();
    expect(screen.getByTestId("kepenk-saat")).toBeTruthy();
    // Four separately speakable characters, one text node each. They are
    // deliberately hidden from the screen reader — the open state
    // announces the code character by character in one live region
    // instead — so the query has to opt into hidden elements.
    expect(
      screen
        .getAllByTestId("kepenk-kod-hanesi", { includeHiddenElements: true })
        .map((n) => n.props.children),
    ).toEqual([
      "7",
      "F",
      "3",
      "M",
    ]);
    expect(screen.getByText("Ödendi 69₺ · #K-7F3M")).toBeTruthy();
    expect(screen.getByText("1 × Fırından Sürpriz Paket")).toBeTruthy();
  });
});

/** §5.11 and §4.5: never one-shot, and the undo costs nothing because no
 * server call has happened at the point the shutter goes up. */
describe("Kepenk — it is never one-shot", () => {
  it("puts the shutter back down on 'yanlışlıkla açtım' and lets it be lifted again", async () => {
    await ciz();
    await etkinlestir("kepenk-kol-suruklenir");
    expect(screen.getByTestId("kepenk-acik")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("kepenk-yanlislikla"));
    });
    expect(
      screen.queryByTestId("kepenk-kod-hanesi", { includeHiddenElements: true }),
    ).toBeNull();
    // Nothing was spent: no redeem was ever attempted.
    expect(mockRedeem).not.toHaveBeenCalled();

    await etkinlestir("kepenk-kol-suruklenir");
    expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
  });

  it("closes itself after the thirty-second window and stays re-openable", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      await ciz();
      await etkinlestir("kepenk-kol-suruklenir");
      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(31_000);
      });
      await waitFor(() => expect(screen.queryByTestId("kepenk-acik")).toBeNull());

      await etkinlestir("kepenk-kol-suruklenir");
      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

/** §4.5 Accessibility: a gesture is NEVER the only path. */
describe("Kepenk — the gesture is never the only path", () => {
  it("replaces the drag with a plain button under a screen reader", async () => {
    const { AccessibilityInfo } = jest.requireActual<
      typeof import("react-native")
    >("react-native");
    const onceki = AccessibilityInfo.isScreenReaderEnabled;
    AccessibilityInfo.isScreenReaderEnabled = jest.fn(() => Promise.resolve(true));
    try {
      await ciz();
      const dugme = await screen.findByTestId("kepenk-kol-dugmesi");
      expect(screen.queryByTestId("kepenk-kol-suruklenir")).toBeNull();
      expect(dugme.props.accessibilityLabel).toBe("Kepengi kaldır — kodu göster");

      await act(async () => {
        fireEvent.press(dugme);
      });
      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
    } finally {
      AccessibilityInfo.isScreenReaderEnabled = onceki;
    }
  });
});

/**
 * §2 Degradation and §4.5: reduced motion removes the ROLL and replaces
 * the sweep with a discrete notch ring — but the clock is proof, not
 * decoration, and is exempt entirely.
 */
describe("Kepenk — reduced motion", () => {
  it("offers the press-and-hold instead of the drag, and swaps the sweep for a notch ring", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    try {
      await ciz();
      const kol = await screen.findByTestId("kepenk-kol-basili");
      expect(screen.queryByTestId("kepenk-kol-suruklenir")).toBeNull();
      expect(screen.getByText("basılı tut")).toBeTruthy();

      await act(async () => {
        fireEvent(kol, "pressIn");
      });
      await act(async () => {
        await new Promise((coz) => setTimeout(coz, 700));
      });

      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
      expect(
        screen.getByTestId("kepenk-nabiz-halkasi", { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(
        screen.queryByTestId("kepenk-nabiz", { includeHiddenElements: true }),
      ).toBeNull();
    } finally {
      geriAl();
    }
  });

  it("keeps the clock TICKING under reduced motion — it is proof, not decoration", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    jest.useFakeTimers({ advanceTimers: true });
    try {
      await ciz();
      const kol = await screen.findByTestId("kepenk-kol-basili");
      await act(async () => {
        fireEvent(kol, "pressIn");
      });
      await act(async () => {
        jest.advanceTimersByTime(700);
      });

      const once = screen.getByTestId("kepenk-saat").props.children as string;
      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });
      const sonra = screen.getByTestId("kepenk-saat").props.children as string;

      expect(once).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(sonra).not.toBe(once);
    } finally {
      jest.useRealTimers();
      geriAl();
    }
  });
});

/** The handover: the flood, and the impact line read from the server
 * rather than fabricated. */
describe("Kepenk — handover", () => {
  it("redeems on TESLİM ALDIM and floods the screen", async () => {
    mockRedeem.mockResolvedValue({
      reservationId: "resv-1",
      status: "REDEEMED",
      redeemedAt: new Date().toISOString(),
    });

    await ciz();
    await etkinlestir("kepenk-kol-suruklenir");
    await act(async () => {
      fireEvent.press(screen.getByTestId("kepenk-teslim-aldim"));
    });

    await waitFor(() => expect(mockRedeem).toHaveBeenCalledWith("resv-1"));
    expect(await screen.findByTestId("teslim-seli")).toBeTruthy();
    expect(screen.getByText("TESLİM ALINDI")).toBeTruthy();
  });

  it("states the impact line from the server's own ledger, with the district's real locative", async () => {
    mockListMine.mockResolvedValue(
      liste(acikPencere({ status: "REDEEMED", redeemedAt: new Date().toISOString() })),
    );

    await ciz();

    expect(await screen.findByTestId("kepenk-etki")).toBeTruthy();
    expect(screen.getByText("Kadıköy'de 13. kepenk")).toBeTruthy();
  });

  it("omits the impact line entirely rather than inventing one when the ledger has nothing", async () => {
    mockImpact.mockRejectedValue(new Error("impact unavailable"));
    mockListMine.mockResolvedValue(
      liste(acikPencere({ status: "REDEEMED", redeemedAt: new Date().toISOString() })),
    );

    await ciz();

    await waitFor(() => expect(screen.getByText("TESLİM ALINDI")).toBeTruthy());
    expect(screen.queryByTestId("kepenk-etki")).toBeNull();
  });
});
