import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
let mockYolParametreleri: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockYolParametreleri,
}));

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { client } from "../lib/api-client";
import { createTestQueryClient } from "../test-utils/render";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { s, yazi } from "../design/tokens";
import { DistrictPicker } from "../components/DistrictPicker";
import HaritaEkrani from "../app/(tabs)/harita";
import PurchaseScreen from "../app/purchase/[offerId]";
import ComplaintDetailScreen from "../app/complaints/[id]";
import "../i18n";

const mockOffers = client.discovery.offers as jest.Mock;
const mockMap = client.discovery.map as jest.Mock;
const mockStore = client.discovery.store as jest.Mock;
const mockComplaint = client.complaints.get as jest.Mock;

const SIMDI = new Date("2026-08-19T16:00:00.000Z");

/** A phone with a system navigation bar at the bottom and a notch at the
 * top — the device this whole file is about. */
const CIHAZ_KENARLARI = { top: 47, left: 0, right: 0, bottom: 48 };

function sar(cocuk: ReactNode) {
  const queryClient = createTestQueryClient();
  return render(
    <SafeAreaInsetsContext.Provider value={CIHAZ_KENARLARI}>
      <QueryClientProvider client={queryClient}>
        <ClockProvider sabitZaman={SIMDI}>
          <ThemeProvider fazZorla="gece">{cocuk}</ThemeProvider>
        </ClockProvider>
      </QueryClientProvider>
    </SafeAreaInsetsContext.Provider>,
  );
}

/** The flattened style value an element actually resolved to. */
function stilAnahtari<T>(
  dugum: { props: Record<string, unknown> },
  anahtar: string,
): T | undefined {
  const stiller = ([] as unknown[]).concat(dugum.props.style as unknown[]).flat(3);
  const bulunan = stiller.findLast(
    (parca) => parca && typeof parca === "object" && anahtar in (parca as Record<string, unknown>),
  ) as Record<string, T> | undefined;
  return bulunan?.[anahtar];
}

/** Every rendered HOST node matching a predicate — the real output tree,
 * not the props we happened to pass a composite. */
function hostBul(
  dugum: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
  kosul: (d: ReactTestRendererJSON) => boolean,
): ReactTestRendererJSON[] {
  if (!dugum) return [];
  if (Array.isArray(dugum)) return dugum.flatMap((d) => hostBul(d, kosul));
  const bulunan = kosul(dugum) ? [dugum] : [];
  for (const cocuk of dugum.children ?? []) {
    if (typeof cocuk !== "string") bulunan.push(...hostBul(cocuk, kosul));
  }
  return bulunan;
}

function teklif(over: Record<string, unknown> = {}) {
  return {
    offerId: "offer-1",
    store: { id: "store-1", name: "Moda Fırın", district: "Kadıköy", distanceM: 400 },
    template: {
      title: "Fırından Sürpriz Paket",
      category: "BAKERY",
      dietFlags: [],
      priceCents: 6900,
      originalValueCentsMin: 15000,
      originalValueCentsMax: 22000,
    },
    pickupStartAt: "2026-08-19T15:30:00.000Z",
    pickupEndAt: "2026-08-19T18:00:00.000Z",
    qtyLeft: 5,
    coverImageUrl: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockYolParametreleri = {};
});

/**
 * DENETİM #9 — the map tab's bottom sheet was a flat `height: 180` with no
 * scroll, while the screen puts THREE 72pt rows in it. The third row
 * overflowed 65pt into the tab bar, which paints over it: a user who
 * opened Harita to compare the three offers closing soonest saw two, and
 * the third was neither visible nor tappable, with nothing on screen
 * saying it existed. The old fixture only ever had two visible offers,
 * which is why nothing caught it.
 */
describe("Harita bottom sheet — it can hold what it is given (denetim #9)", () => {
  it("resolves tall enough for its own label plus all three rows, and pins no fixed height", async () => {
    mockMap.mockResolvedValue([]);
    mockOffers.mockResolvedValue({
      items: [
        teklif({ offerId: "a", pickupEndAt: "2026-08-19T17:00:00.000Z" }),
        teklif({
          offerId: "b",
          store: { id: "store-2", name: "Levent Fırın", district: "Beşiktaş", distanceM: 900 },
          pickupEndAt: "2026-08-19T17:30:00.000Z",
        }),
        teklif({
          offerId: "c",
          store: { id: "store-3", name: "Moda Kasap", district: "Kadıköy", distanceM: 120 },
          pickupEndAt: "2026-08-19T18:30:00.000Z",
        }),
      ],
      total: 3,
      page: 1,
      pageSize: 50,
    });

    const ekran = await sar(<HaritaEkrani />);
    await waitFor(() => expect(screen.getByText("MODA FIRIN")).toBeTruthy());
    expect(screen.getByText("LEVENT FIRIN")).toBeTruthy();
    expect(screen.getByText("MODA KASAP")).toBeTruthy();

    // The row height is read off a REAL rendered row, so this cannot pass
    // by agreeing with a stale constant.
    const satir = screen.getByLabelText("Moda Fırın, 69₺");
    const satirYuksekligi = stilAnahtari<number>(satir, "height");
    expect(satirYuksekligi).toBe(72);

    // 1pt contact edge + s2 top padding + the label's absolute line height
    // + s1 beneath it + three rows.
    const gereken = 1 + s.s2 + yazi.label.lineHeight + s.s1 + 3 * (satirYuksekligi ?? 0);
    const tabaka = screen.getByTestId("harita-alt-sayfa");
    expect(stilAnahtari<number>(tabaka, "height")).toBeUndefined();
    expect(stilAnahtari<number>(tabaka, "minHeight")).toBeGreaterThanOrEqual(gereken);

    await ekran.unmount();
  });
});

/**
 * DENETİM #22 — the district sheet is the location-denied recovery path.
 * Its surface is meant to touch the physical bottom edge, but the LIST
 * inside it had no bottom inset, so on Android edge-to-edge the district
 * resting at the bottom of the scroll sat under the navigation bar:
 * tapping it pressed Home.
 */
describe("District picker — the last row is above the system bar (denetim #22)", () => {
  it("ends the list at the device's bottom inset, not at the physical edge", async () => {
    const ekran = await sar(
      <DistrictPicker visible onSelect={() => undefined} onClose={() => undefined} />,
    );

    const kaydirma = hostBul(
      ekran.toJSON(),
      (d) => d.props?.contentContainerStyle !== undefined,
    );
    expect(kaydirma).toHaveLength(1);
    const icerikStili = ([] as unknown[])
      .concat(kaydirma[0].props.contentContainerStyle as unknown[])
      .flat(3)
      .reduce<Record<string, unknown>>(
        (birlesik, parca) => Object.assign(birlesik, parca as object),
        {},
      );
    expect(icerikStili.paddingBottom).toBe(CIHAZ_KENARLARI.bottom);

    await ekran.unmount();
  });
});

/**
 * DENETİM #23 — the reply composer is the last child of the screen, with
 * 8pt of padding and no inset. With the keyboard closed on an Android
 * phone with 3-button navigation, the 48pt "Gönder" button sat under the
 * system bar: a user replying to a merchant about a bad bag pressed
 * Back/Home instead.
 */
describe("Complaint thread — the composer clears the system bar (denetim #23)", () => {
  it("gives the screen chassis the bottom edge, so the docked composer takes the inset", async () => {
    mockYolParametreleri = { id: "c1" };
    mockComplaint.mockResolvedValue({
      id: "c1",
      category: "BAG_QUALITY",
      status: "OPEN",
      description: "Paket eksikti.",
      slaDeadlineAt: "2026-08-21T12:00:00.000Z",
      resolvedAt: null,
      messages: [],
    });

    const ekran = await sar(<ComplaintDetailScreen />);
    await waitFor(() => expect(screen.getByText("Paket eksikti.")).toBeTruthy());

    const guvenliAlan = hostBul(ekran.toJSON(), (d) => d.props?.edges !== undefined);
    expect(guvenliAlan).toHaveLength(1);
    // "additive" is what the native view is told when an edge is claimed;
    // an unclaimed edge is "off", which is what this screen had.
    expect(guvenliAlan[0].props.edges).toMatchObject({ bottom: "additive" });

    await ekran.unmount();
  });
});

/**
 * DENETİM #24 — the two pre-contract document links are a legal
 * obligation (distance-selling disclosure), and the consent box directly
 * below them requires the user to have read them. They were 30pt text
 * targets with no hitSlop: a one-handed tap that missed vertically landed
 * in the 8pt gap and did nothing, which reads as a link that is broken.
 */
describe("Purchase pre-contract links — a 44pt legal target (denetim #24)", () => {
  it("gives both mandatory document links the app's 44pt minimum, and still routes", async () => {
    mockYolParametreleri = { offerId: "offer-1", storeId: "store-1" };
    mockStore.mockResolvedValue({
      store: {
        id: "store-1",
        name: "Simit Dünyası",
        address: "Bağdat Cad. 1",
        district: "Kadıköy",
        city: "İstanbul",
        coverImageUrl: null,
        categoryTags: ["BAKERY"],
        openingHoursJson: null,
      },
      todaysOffers: [
        {
          offerId: "offer-1",
          template: {
            title: "Sürpriz Fırın Paketi",
            category: "BAKERY",
            dietFlags: [],
            priceCents: 4990,
            originalValueCentsMin: 15000,
            originalValueCentsMax: 20000,
          },
          pickupStartAt: "2026-08-19T14:30:00.000Z",
          pickupEndAt: "2026-08-19T19:00:00.000Z",
          qtyLeft: 3,
        },
      ],
      rating: { average: 4.5, count: 12 },
    });

    const ekran = await sar(<PurchaseScreen />);
    await waitFor(() => expect(screen.getByTestId("purchase-obf-link")).toBeTruthy());

    for (const testID of ["purchase-obf-link", "purchase-mss-link"]) {
      const hedef = screen.getByTestId(testID);
      // The TARGET is the pressable, not the line of text inside it.
      expect(hedef.props.accessibilityRole).toBe("link");
      expect(stilAnahtari<number>(hedef, "minHeight")).toBeGreaterThanOrEqual(44);
    }

    await fireEvent.press(screen.getByTestId("purchase-obf-link"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/legal/[doc]",
      params: { doc: "on-bilgilendirme-formu" },
    });
    await fireEvent.press(screen.getByTestId("purchase-mss-link"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/legal/[doc]",
      params: { doc: "mesafeli-satis-sozlesmesi" },
    });

    await ekran.unmount();
  });
});
