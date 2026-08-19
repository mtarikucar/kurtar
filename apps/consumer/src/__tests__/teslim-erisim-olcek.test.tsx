import fs from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("../lib/api-client");

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: { id: string } = { id: "resv-1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { ekraniCiz } from "../test-utils/ekran";
import { renderWithPanelProviders } from "../test-utils/panel-render";
import { erisimAzaltmayiAyarla } from "../test-utils/erisim";
import { client } from "../lib/api-client";
import RedeemScreen from "../app/redeem/[id]";
import OrderDetailScreen from "../app/order/[id]";
import { TeslimSeli } from "../components/teslim/TeslimSeli";
import { YapiskanCubuk } from "../components/teslim/ortak";
import { ClockProvider } from "../design/saat";
import { ThemeProvider, usePalet } from "../design/theme";
import { KOL_YUKSEKLIGI } from "../components/teslim/perde";
import { s, yazi } from "../design/tokens";
import { savePurchaseSnapshot } from "../lib/purchase-cache";
import type { ReservationItem, ReservationListResponse } from "../lib/api-types";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;
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

async function kepengiCiz() {
  mockSearchParams = { id: "resv-1" };
  return ekraniCiz(<RedeemScreen />);
}

/** Turns the screen reader on for one test, the same
 * capture-and-put-back way `erisimAzaltmayiAyarla` handles reduce motion. */
function ekranOkuyucuyuAc(): () => void {
  const { AccessibilityInfo } = jest.requireActual<typeof import("react-native")>(
    "react-native",
  );
  const onceki = AccessibilityInfo.isScreenReaderEnabled;
  AccessibilityInfo.isScreenReaderEnabled = jest.fn(() => Promise.resolve(true));
  return () => {
    AccessibilityInfo.isScreenReaderEnabled = onceki;
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockSearchParams = { id: "resv-1" };
  mockListMine.mockResolvedValue(liste(acikPencere()));
  mockStore.mockResolvedValue({
    store: { id: "store-1", name: "Moda Fırın", district: "Kadıköy", coverImageUrl: null },
    todaysOffers: [],
    rating: { average: 0, count: 0 },
  });
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
 * §4.5 / §5.11 — "Do not require the gesture — the plain button path is
 * not optional."
 *
 * Under reduce motion the drag is swapped for a 600ms press-and-hold, and
 * that substitution used to be the ONLY way in: an early release was not
 * counted as a failed attempt, so the `Kaldıramıyor musun?` escape the
 * spec promises after two failures could never appear, and the handle
 * carried `accessibilityRole="button"` with no activate action at all, so
 * Switch Control / Voice Control (and a keyboard on the web build) got
 * nothing. A vestibular user who could not hold 600ms was locked out of
 * their own order.
 */
describe("Kepenk — reduced motion is not a gesture-only mode", () => {
  it("counts an early release as a failed attempt, so the escape hatch appears", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    try {
      await kepengiCiz();
      const kol = await screen.findByTestId("kepenk-kol-basili");

      // Lifted at ~200ms, twice — 600ms is longer than it feels.
      for (let deneme = 0; deneme < 2; deneme += 1) {
        await act(async () => {
          fireEvent(kol, "pressIn");
        });
        await act(async () => {
          fireEvent(kol, "pressOut");
        });
      }

      expect(screen.getByTestId("kepenk-yardim")).toBeTruthy();
      expect(screen.getByText("Kaldıramıyor musun?")).toBeTruthy();
    } finally {
      geriAl();
    }
  });

  it("does not count a COMPLETED hold as a failure when the finger comes off", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    jest.useFakeTimers({ advanceTimers: true });
    try {
      await kepengiCiz();
      const kol = await screen.findByTestId("kepenk-kol-basili");

      // A hold that RUNS OUT: the shutter goes up, then the finger lifts.
      await act(async () => {
        fireEvent(kol, "pressIn");
      });
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
      await act(async () => {
        fireEvent(kol, "pressOut");
      });
      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();

      // Put it back down and miss ONCE. One failure is not two.
      await act(async () => {
        fireEvent.press(screen.getByTestId("kepenk-yanlislikla"));
      });
      await act(async () => {
        fireEvent(kol, "pressIn");
      });
      await act(async () => {
        fireEvent(kol, "pressOut");
      });
      expect(screen.queryByTestId("kepenk-yardim")).toBeNull();

      // The second real miss is the one that opens the way out.
      await act(async () => {
        fireEvent(kol, "pressIn");
      });
      await act(async () => {
        fireEvent(kol, "pressOut");
      });
      expect(screen.getByTestId("kepenk-yardim")).toBeTruthy();
    } finally {
      jest.useRealTimers();
      geriAl();
    }
  });

  it("gives the press-and-hold handle a real activate action, so Switch Control can open it", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    try {
      await kepengiCiz();
      const kol = await screen.findByTestId("kepenk-kol-basili");
      expect(kol.props.accessibilityActions).toEqual([{ name: "activate" }]);

      await act(async () => {
        fireEvent(kol, "accessibilityAction", {
          nativeEvent: { actionName: "activate" },
        });
      });
      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
    } finally {
      geriAl();
    }
  });
});

/**
 * §32 — the rescue path may not be a smaller target than the thing that
 * just failed. `Kaldıramıyor musun?` is 22pt of line box inside 8pt
 * padding: 38pt, under both the iOS 44 and the Android 48 threshold, and
 * it is shown to exactly the customer whose thumb has already missed
 * twice. The handle itself is 64pt.
 */
describe("Kepenk — the escape hatch is a real target", () => {
  it("gives 'Kaldıramıyor musun?' enough hitSlop to clear 44pt", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    try {
      await kepengiCiz();
      const kol = await screen.findByTestId("kepenk-kol-basili");
      for (let deneme = 0; deneme < 2; deneme += 1) {
        await act(async () => {
          fireEvent(kol, "pressIn");
        });
        await act(async () => {
          fireEvent(kol, "pressOut");
        });
      }

      const yardim = screen.getByTestId("kepenk-yardim");
      const bicim = StyleSheet.flatten(
        typeof yardim.props.style === "function"
          ? yardim.props.style({ pressed: false })
          : yardim.props.style,
      );
      const tasma = yardim.props.hitSlop;
      const dikey = typeof tasma === "number" ? tasma : (tasma?.top ?? 0);
      const etkin = yazi.bodyStrong.lineHeight + 2 * Number(bicim.paddingVertical ?? 0) + 2 * dikey;

      expect(etkin).toBeGreaterThanOrEqual(48);
      // …and it is still smaller than the handle it rescues, so nothing moved.
      expect(etkin).toBeLessThan(KOL_YUKSEKLIGI);
    } finally {
      geriAl();
    }
  });
});

/**
 * §7 — at the largest text step the open shutter's column needs ~536pt in
 * a ~411pt aperture, and `vitrin` clips with `overflow: 'hidden'`: TESLİM
 * ALDIM and the `yanlışlıkla açtım` undo are simply not on the screen, and
 * nothing scrolls. The customer standing at the counter can neither
 * confirm the handover nor put the shutter back down.
 */
describe("Kepenk — the open state scrolls rather than clipping its own button", () => {
  it("puts the whole open column in a scroll view whose content may exceed the aperture", async () => {
    await kepengiCiz();
    await act(async () => {
      fireEvent(await screen.findByTestId("kepenk-kol-suruklenir"), "accessibilityAction", {
        nativeEvent: { actionName: "activate" },
      });
    });

    // RNTL 14 dropped the UNSAFE_* type queries, so the open column is
    // identified by the host component it actually renders as.
    const kaydirma = screen.getByTestId("kepenk-acik");
    expect(kaydirma.type).toBe("RCTScrollView");
    expect(within(kaydirma).getByTestId("kepenk-teslim-aldim")).toBeTruthy();
    expect(within(kaydirma).getByTestId("kepenk-yanlislikla")).toBeTruthy();

    const icerik = StyleSheet.flatten(kaydirma.props.contentContainerStyle);
    // flexGrow, not flex: at normal size the column still fills the
    // opening and the button still sits on the sill; over-size it grows
    // past the aperture and scrolls instead of being cut off.
    expect(icerik.flexGrow).toBe(1);
    expect(icerik.flex).toBeUndefined();
  });

  it("caps the undo label, the one unbounded text on the screen", async () => {
    await kepengiCiz();
    await act(async () => {
      fireEvent(await screen.findByTestId("kepenk-kol-suruklenir"), "accessibilityAction", {
        nativeEvent: { actionName: "activate" },
      });
    });

    expect(screen.getByText("yanlışlıkla açtım").props.maxFontSizeMultiplier).toBe(1.4);
  });
});

/**
 * §16 — the 30-second auto-close destroys screen-reader focus. A TalkBack
 * user swipes item by item through announcement, clock, date, code, qty,
 * price and counter towards TESLİM ALDIM; the counter runs out, the whole
 * `kepenk-acik` subtree unmounts, focus is thrown back to the top of the
 * screen, and it happens again on the next attempt. The shutter is not
 * left open forever: `yanlışlıkla açtım` and the back control both close
 * it, and the code is still never mounted until the shutter moves.
 */
describe("Kepenk — the shutter does not slam on a screen-reader user", () => {
  it("keeps the open state up past thirty seconds and drops the countdown that would be lying", async () => {
    const geriAl = ekranOkuyucuyuAc();
    jest.useFakeTimers({ advanceTimers: true });
    try {
      await kepengiCiz();
      await act(async () => {
        fireEvent.press(await screen.findByTestId("kepenk-kol-dugmesi"));
      });
      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
      expect(screen.queryByTestId("kepenk-sayac")).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(31_000);
      });
      expect(screen.getByTestId("kepenk-acik")).toBeTruthy();
    } finally {
      jest.useRealTimers();
      geriAl();
    }
  });

  it("still rolls itself back down for everybody else", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      await kepengiCiz();
      await act(async () => {
        fireEvent(await screen.findByTestId("kepenk-kol-suruklenir"), "accessibilityAction", {
          nativeEvent: { actionName: "activate" },
        });
      });
      expect(screen.getByTestId("kepenk-sayac")).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(31_000);
      });
      await waitFor(() => expect(screen.queryByTestId("kepenk-acik")).toBeNull());
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * §1.2 — "`allowFontScaling` stays true everywhere." The redeem clock is
 * the app's own proof that the screen is live, and it was the one element
 * that ignored the user's text size: `allowFontScaling={false}` beat the
 * 1.6 ceiling sitting right next to it and made that prop dead code.
 */
describe("Kepenk — the liveness clock obeys the user's text size", () => {
  it("scales the live clock, up to the 1.6 ceiling", async () => {
    await kepengiCiz();
    await act(async () => {
      fireEvent(await screen.findByTestId("kepenk-kol-suruklenir"), "accessibilityAction", {
        nativeEvent: { actionName: "activate" },
      });
    });

    const saat = screen.getByTestId("kepenk-saat");
    expect(saat.props.allowFontScaling).not.toBe(false);
    expect(saat.props.maxFontSizeMultiplier).toBe(yazi.clock.maxFontSizeMultiplier);
  });

  it("scales the frozen handover time in the flood too, with the same ceiling", async () => {
    await render(
      <ClockProvider sabitZaman={new Date("2026-08-19T17:35:00.000Z")}>
        <ThemeProvider fazZorla="gece">
          <TeslimSeli
            dukkanAdi="Moda Fırın"
            paketAdi="Fırından Sürpriz Paket"
            saat="20:35:11"
            azaltHareket={false}
          />
        </ThemeProvider>
      </ClockProvider>,
    );

    const saat = screen.getByText("20:35:11");
    expect(saat.props.allowFontScaling).not.toBe(false);
    expect(saat.props.maxFontSizeMultiplier).toBe(yazi.clock.maxFontSizeMultiplier);
  });

  it("leaves no `allowFontScaling={false}` anywhere in the handover surfaces", () => {
    const kok = path.resolve(__dirname, "..", "components", "teslim");
    // Comments stripped first, the same way design-yasaklar.test.ts does
    // it: these files document the rule they obey, and the prose about a
    // forbidden string is not the string.
    const kod = (dosya: string) =>
      fs
        .readFileSync(dosya, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const suclular = fs
      .readdirSync(kok)
      .filter((ad) => /\.tsx?$/.test(ad))
      .filter((ad) => kod(path.join(kok, ad)).includes("allowFontScaling={false}"));
    expect(suclular).toEqual([]);
  });
});

/**
 * §8 — Android edge-to-edge is mandatory on SDK 57 / RN 0.86, and both
 * hosts of the sticky bar declare `edges={["top","left","right"]}`, so the
 * bar's bottom edge IS the physical screen edge. With only 16pt of its own
 * padding, the lower 32pt of a 56pt CTA sits behind Back/Home/Recents on a
 * 3-button phone and inside the home-indicator gesture strip on iOS: the
 * customer in the doorway taps 'KUTUYU AYIR' and goes to the home screen.
 * The tab bar next door already ADDS the inset; this now does the same.
 */
describe("Yapışkan çubuk — the CTA is not under the system navigation bar", () => {
  function cubuguCiz(alt: number) {
    return render(
      <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: alt, left: 0, right: 0 }}>
        <ClockProvider sabitZaman={new Date("2026-08-19T17:35:00.000Z")}>
          <ThemeProvider fazZorla="gece">
            <YapiskanCubukSonda />
          </ThemeProvider>
        </ClockProvider>
      </SafeAreaInsetsContext.Provider>,
    );
  }

  it("pays the device's bottom inset ON TOP of its own padding", async () => {
    await cubuguCiz(34);
    const bicim = StyleSheet.flatten(screen.getByTestId("yapiskan-cubuk").props.style);
    expect(bicim.paddingBottom).toBe(s.s4 + 34);
  });

  it("keeps its 16pt floor on a phone with no inset at all", async () => {
    await cubuguCiz(0);
    const bicim = StyleSheet.flatten(screen.getByTestId("yapiskan-cubuk").props.style);
    expect(bicim.paddingBottom).toBe(s.s4);
  });
});

function YapiskanCubukSonda() {
  const palet = usePalet();
  return (
    <YapiskanCubuk palet={palet}>
      <View testID="yapiskan-cubuk-icerik">
        <Text>KUTUYU AYIR · 149₺</Text>
      </View>
    </YapiskanCubuk>
  );
}

/**
 * §17 — the ticket draws the shop only as a `<Tabela/>`, and Tabela hides
 * its own subtree from the screen reader (it is a drawn plaque, not a
 * label). There is no other copy of the name on the page, so a blind
 * customer opening a past order hears the district, the package, the qty,
 * the price, the code and the status — and never learns which shop it was.
 */
describe("Sipariş fişi — the ticket says whose shop it is", () => {
  it("gives the sign area an accessible name and a header role", async () => {
    mockSearchParams = { id: "resv-1" };
    mockListMine.mockResolvedValue(
      liste(acikPencere({ status: "REDEEMED", redeemedAt: new Date().toISOString() })),
    );

    await renderWithPanelProviders(<OrderDetailScreen />, {
      sabitZaman: new Date("2026-08-19T20:00:00.000Z"),
    });

    const tabela = await screen.findByLabelText("Moda Fırın");
    expect(tabela.props.accessibilityRole).toBe("header");
  });
});
