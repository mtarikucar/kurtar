import { screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: "store-1" }),
}));

import { ekraniCiz } from "../test-utils/ekran";
import { client } from "../lib/api-client";
import DukkanEkrani from "../app/store/[id]";
import "../i18n";

const mockStoreProfile = client.discovery.store as jest.Mock;
const mockFavorites = client.favorites.listMine as jest.Mock;

const SIMDI = new Date("2026-08-19T16:30:00.000Z"); // 19:30 İstanbul

function storeProfile(offerOverrides: Record<string, unknown> = {}) {
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
          allergenDisclaimer: "Fındık içerir.",
        },
        pickupStartAt: "2026-08-19T14:30:00.000Z", // 17:30
        pickupEndAt: "2026-08-19T17:00:00.000Z", //   20:00
        qtyLeft: 3,
        ...offerOverrides,
      },
    ],
    rating: { average: 4.5, count: 12 },
  };
}

async function renderDukkan(offerOverrides: Record<string, unknown> = {}) {
  mockStoreProfile.mockResolvedValue(storeProfile(offerOverrides));
  mockFavorites.mockResolvedValue({ items: [] });
  return ekraniCiz(<DukkanEkrani />, { sabitZaman: SIMDI });
}

/**
 * [#4] The row's Pressable is `accessible` by default in React Native, so
 * an explicit `accessibilityLabel` REPLACES its children's text rather
 * than adding to it. With the bag's title as the whole label, the price,
 * the value band, the pickup window and the time pill — everything a
 * reader needs to choose between two bags — never reached a screen
 * reader at all: the user had to open each row and come back.
 */
describe("Dükkân — the offer row says the whole offer (#4)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("announces the price, the value band, the window and the time left", async () => {
    await renderDukkan();

    const satir = await waitFor(() =>
      screen.getByLabelText(/^Sürpriz Fırın Paketi/),
    );
    const etiket = satir.props.accessibilityLabel as string;

    expect(etiket).toContain("49,90₺");
    expect(etiket).toContain("100–150₺ değerinde");
    expect(etiket).toContain("17:30–20:00");
    expect(etiket).toContain("30 dakika");
  });

  it("says TÜKENDİ instead of a countdown when the bag is gone", async () => {
    await renderDukkan({ qtyLeft: 0 });

    const satir = await waitFor(() =>
      screen.getByLabelText(/^Sürpriz Fırın Paketi/),
    );
    const etiket = satir.props.accessibilityLabel as string;

    expect(etiket).toContain("TÜKENDİ");
    expect(etiket).not.toContain("dakika");
  });

  it("reads the hour when more than an hour is left, not a 90-minute count", async () => {
    await renderDukkan({ pickupEndAt: "2026-08-19T18:00:00.000Z" }); // 90 dk left

    const satir = await waitFor(() =>
      screen.getByLabelText(/^Sürpriz Fırın Paketi/),
    );
    expect(satir.props.accessibilityLabel).toContain("1 saat 30 dakika");
  });
});

/**
 * [#18] The shopfront was `accessibilityElementsHidden` +
 * `no-hide-descendants`, and it is the ONLY place this screen prints the
 * shop's name — so the one thing the file's own comment says a shop page
 * must always say ("which shop it is") was the one thing a screen-reader
 * user never heard.
 */
describe("Dükkân — the shopfront names the shop (#18)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("exposes the shop's name as a header", async () => {
    await renderDukkan();

    const tabela = await waitFor(() => screen.getByLabelText("Ada Fırın"));
    expect(tabela.props.accessibilityRole).toBe("header");
  });

  it("keeps the address and rating as their own separate announcements", async () => {
    await renderDukkan();

    // The name must not be merged into the header block that also carries
    // the address, the rating and the section title — grouping those into
    // one element swallows all three.
    expect(await screen.findByText("Bağdat Cd. 1, Kadıköy")).toBeTruthy();
    expect(await screen.findByText(/★ 4,5/)).toBeTruthy();
  });
});
