import { screen } from "@testing-library/react-native";
import { PixelRatio } from "react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "offer-1", storeId: "store-1" }),
}));

import { ekraniCiz } from "../test-utils/ekran";
import { client } from "../lib/api-client";
import OfferDetailScreen from "../app/offer/[id]";
import "../i18n";

const mockStoreProfile = client.discovery.store as jest.Mock;

function yaziOlceginiAyarla(olcek: number): () => void {
  const onceki = PixelRatio.getFontScale;
  PixelRatio.getFontScale = jest.fn(() => olcek);
  return () => {
    PixelRatio.getFontScale = onceki;
  };
}

function dukkanProfili() {
  return {
    store: {
      id: "store-1",
      name: "Ada Fırın",
      address: "Bağdat Cd. 1",
      district: "Kadıköy",
      city: "İstanbul",
      coverImageUrl: null,
      categoryTags: [],
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
          originalValueCentsMin: 10000,
          originalValueCentsMax: 15000,
          allergenDisclaimer: "Fındık ve süt ürünleri içerir.",
        },
        pickupStartAt: "2026-08-19T14:30:00.000Z",
        pickupEndAt: "2026-08-19T17:00:00.000Z",
        qtyLeft: 3,
      },
    ],
    rating: { average: 4.5, count: 12 },
  };
}

interface Dugum {
  readonly props?: { readonly style?: unknown };
  readonly parent: Dugum | null;
}

/** The row both secondary buttons live in — found by walking up from one
 * of them, so the spec does not depend on a testID the layout does not
 * carry. */
function dugmeSatiri(): Record<string, unknown> {
  let dugum: Dugum | null = screen.getByTestId("teklif-harita") as unknown as Dugum;
  while (dugum) {
    const stil = dugum.props?.style;
    const stiller = (Array.isArray(stil) ? stil.flat(4) : [stil]) as Record<string, unknown>[];
    // Merged, not first-match: the stacked form is an OVERRIDE layered on
    // top of the row, and reading only the base object would report the
    // direction the screen is not drawing.
    const birlesik: Record<string, unknown> = {};
    for (const s of stiller) {
      if (s && typeof s === "object") Object.assign(birlesik, s);
    }
    if ("flexDirection" in birlesik && "gap" in birlesik) return birlesik;
    dugum = dugum.parent;
  }
  throw new Error("the two secondary buttons are not in a row");
}

/**
 * FINDING #31. `Dugme`'s label is `yazi.label` (Archivo 500 12 / +0.9)
 * at `numberOfLines={1}`. "HARİTADA GÖSTER" is 128pt of glyph advance
 * against the 141pt interior half a 390pt row gives it — no margin at
 * all. At the label's own 1.3 ceiling it is 162pt, and the user is left
 * reading "HARİTADA GÖS…" with no way to tell which button opens the map
 * and which gives directions.
 *
 * The fix is the ROW, not the label: capping the multiplier here would
 * freeze UI copy at 12pt for exactly the person who raised it, and
 * shortening the string would trade a real word for a layout constant.
 */
describe("offer detail's two secondary buttons (finding #31)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreProfile.mockResolvedValue(dukkanProfili());
  });

  it("keeps them side by side at the default text size on a 390pt phone", async () => {
    const geriAl = yaziOlceginiAyarla(1);
    const gorunum = await ekraniCiz(<OfferDetailScreen />, {
      sabitZaman: new Date("2026-08-19T15:00:00.000Z"),
    });
    await screen.findByTestId("teklif-harita");
    expect(dugmeSatiri().flexDirection).toBe("row");
    await gorunum.unmount();
    geriAl();
  });

  it("stacks them once the label cannot fit half the row", async () => {
    const geriAl = yaziOlceginiAyarla(1.3);
    const gorunum = await ekraniCiz(<OfferDetailScreen />, {
      sabitZaman: new Date("2026-08-19T15:00:00.000Z"),
    });
    await screen.findByTestId("teklif-harita");
    expect(dugmeSatiri().flexDirection).toBe("column");
    await gorunum.unmount();
    geriAl();
  });

  it("keeps both labels whole and readable when it does — no ellipsis, no shortened copy", async () => {
    const geriAl = yaziOlceginiAyarla(1.3);
    const gorunum = await ekraniCiz(<OfferDetailScreen />, {
      sabitZaman: new Date("2026-08-19T15:00:00.000Z"),
    });
    expect(await screen.findByText("HARİTADA GÖSTER")).toBeTruthy();
    expect(screen.getByText("YOL TARİFİ")).toBeTruthy();
    await gorunum.unmount();
    geriAl();
  });
});
