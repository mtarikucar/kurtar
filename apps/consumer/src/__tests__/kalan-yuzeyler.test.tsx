import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "store-1" }),
}));

jest.mock("../hooks/use-effective-location", () => ({
  useEffectiveLocation: () => ({
    coords: { lat: 40.99, lng: 29.03 },
    denied: false,
    setManualLocation: jest.fn(),
  }),
}));

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { client } from "../lib/api-client";
import { createTestQueryClient } from "../test-utils/render";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { PALETLER, type Faz } from "../design/tokens";
import { TextField } from "../components/TextField";
import { tenteDeseni } from "../components/kepenk/tente-desen";
import AramaEkrani from "../app/(tabs)/search";
import FavorilerEkrani from "../app/(tabs)/favorites";
import "../i18n";

const GORUNUR = { includeHiddenElements: true } as const;
const SIMDI = new Date("2026-08-19T17:35:00.000Z");

const mockOffers = client.discovery.offers as jest.Mock;
const mockFavorites = client.favorites.listMine as jest.Mock;

function sar(cocuk: ReactNode, faz: Faz = "gece") {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClockProvider sabitZaman={SIMDI}>
        <ThemeProvider fazZorla={faz}>{cocuk}</ThemeProvider>
      </ClockProvider>
    </QueryClientProvider>,
  );
}

/** The style key a component actually resolved to, out of the flattened
 * style array RN hands the element. */
function stilAnahtari<T>(dugum: { props: Record<string, unknown> }, anahtar: string): T {
  const stiller = ([] as unknown[]).concat(dugum.props.style as unknown[]).flat(3);
  const bulunan = stiller.findLast(
    (k) => k && typeof k === "object" && anahtar in (k as Record<string, unknown>),
  ) as Record<string, T>;
  return bulunan[anahtar];
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
    pickupStartAt: "2026-08-19T16:00:00.000Z",
    pickupEndAt: "2026-08-19T18:00:00.000Z",
    qtyLeft: 5,
    coverImageUrl: null,
    ...over,
  };
}

/**
 * The surfaces that belonged to no track and stayed on the pre-redesign
 * tokens. What is asserted here is what the review actually caught on the
 * frames: type in an ink the ground cannot carry, one string doing two
 * jobs, an empty state that explains and then stops, and a fetched
 * photograph in an app that has no photography.
 */

describe("TextField — the recessed slot (§1.1)", () => {
  it.each(["gece", "alacakaranlik", "gunduz"] as const)(
    "takes the card surface in %s, never white",
    async (faz) => {
      const palet = PALETLER[faz];
      const ekran = await sar(
        <TextField label="Paket, mağaza ara…" value="" onChangeText={() => undefined} />,
        faz,
      );
      const alan = ekran.getByLabelText("Paket, mağaza ara…");
      expect(stilAnahtari<string>(alan, "backgroundColor")).toBe(palet.yuzeyKaldirim);
      expect(stilAnahtari<string>(alan, "color")).toBe(palet.yaziAna);
      await ekran.unmount();
    },
  );

  it("carries the label for the screen reader without printing it twice", async () => {
    const ekran = await sar(
      <TextField
        label="Paket, mağaza ara…"
        placeholder="Paket, mağaza ara…"
        etiketGizli
        value=""
        onChangeText={() => undefined}
      />,
    );
    // The placeholder is the only visible instance of the string; the
    // label is still the field's accessible name.
    expect(ekran.queryByText("Paket, mağaza ara…")).toBeNull();
    expect(ekran.getByLabelText("Paket, mağaza ara…")).toBeTruthy();
  });

  it("says an error on an awning-red fill with dark ink, never as loose red type", async () => {
    const palet = PALETLER.gece;
    const ekran = await sar(
      <TextField
        label="Telefon"
        error="Geçerli bir telefon numarası girmelisin."
        value=""
        onChangeText={() => undefined}
      />,
    );
    const uyari = ekran.getByText("Geçerli bir telefon numarası girmelisin.");
    expect(stilAnahtari<string>(uyari, "color")).toBe(palet.tenteMurekkep);
    // …and the field's own border says the same thing a second time.
    expect(
      stilAnahtari<string>(ekran.getByLabelText("Telefon"), "borderColor"),
    ).toBe(palet.tenteYazi);
  });
});

describe("Ara — one search vocabulary, one storefront (§4.1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOffers.mockResolvedValue({ items: [teklif()], nextCursor: null });
  });

  it("offers the discovery screen's own chips, not a second category set", async () => {
    await sar(<AramaEkrani />);
    // The six the street uses (lib/kesif.ts), reached through the same
    // component — a user tapping "Fırın" here and on Keşfet is choosing
    // from one set.
    for (const kategori of ["TUMU", "FIRIN", "PASTANE", "MANAV", "KAFE", "MUTFAK"]) {
      expect(screen.getByTestId(`kesif-cip-${kategori}`)).toBeTruthy();
    }
  });

  it("shows results as the same storefront card the street shows", async () => {
    await sar(<AramaEkrani />);
    await fireEvent.press(screen.getByTestId("kesif-cip-FIRIN"));

    await waitFor(() => expect(mockOffers).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Fırından Sürpriz Paket", GORUNUR)).toBeTruthy(),
    );
    // The card's own composed accessibility label (§3) — proof this is
    // VitrinKarti and not the old photo row.
    expect(screen.getByLabelText(/^Moda Fırın\. Fırından Sürpriz Paket\./)).toBeTruthy();
  });

  it("gives a fruitless search somewhere to go", async () => {
    mockOffers.mockResolvedValue({ items: [], nextCursor: null });
    await sar(<AramaEkrani />);
    await fireEvent.press(screen.getByTestId("kesif-cip-MANAV"));
    await waitFor(() => expect(screen.getByText("Sonuç yok")).toBeTruthy());
    expect(screen.getByText("Yakındaki paketlere bak")).toBeTruthy();
  });
});

describe("Favoriler — the shop's own identity, and a way out of empty (§3, §5.15)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("invites an action instead of explaining and stopping", async () => {
    mockFavorites.mockResolvedValue({ items: [] });
    await sar(<FavorilerEkrani />);
    await waitFor(() => expect(screen.getByText("Henüz favorin yok")).toBeTruthy());

    await fireEvent.press(screen.getByText("Dükkânlara göz at"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)");
  });

  it("wears the shop's hashed awning stripe rather than a fetched photo", async () => {
    mockFavorites.mockResolvedValue({
      items: [
        {
          storeId: "store-1",
          hasLiveOfferToday: true,
          store: {
            id: "store-1",
            name: "Moda Fırın",
            district: "Kadıköy",
            avgStars: 4.7,
            ratingCount: 212,
            coverImageUrl: "https://example.test/kapak.jpg",
          },
        },
      ],
    });
    await sar(<FavorilerEkrani />);
    await waitFor(() => expect(screen.getByText("Moda Fırın")).toBeTruthy());
    // The rating reads in Turkish ("4,7"), not with a decimal point.
    expect(screen.getByText("Kadıköy · ★ 4,7 · 212 değerlendirme")).toBeTruthy();
    // The 4pt strip is the shop's own hashed awning — the same pair the
    // card, the map pin and the order row draw it with.
    const agac = JSON.stringify(screen.toJSON());
    expect(agac).toContain(`"backgroundColor":"${tenteDeseni("store-1").bir}"`);
    // And nothing here fetches an image, even though the API offers one
    // (§5.15: one photograph and the whole identity system reads broken).
    expect(agac).not.toContain('"source"');
  });
});
