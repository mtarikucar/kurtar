import { screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

import { ekraniCiz } from "../test-utils/ekran";
import { client } from "../lib/api-client";
import FavorilerEkrani from "../app/(tabs)/favorites";
import "../i18n";

const mockFavorites = client.favorites.listMine as jest.Mock;

function favori(over: Record<string, unknown> = {}) {
  return {
    storeId: "store-1",
    favoritedAt: "2026-08-01T10:00:00.000Z",
    store: {
      id: "store-1",
      name: "Ada Fırın",
      district: "Kadıköy",
      avgStars: 4.5,
      ratingCount: 12,
    },
    hasLiveOfferToday: true,
    ...over,
  };
}

async function renderFavoriler(items: ReturnType<typeof favori>[]) {
  mockFavorites.mockResolvedValue({ items, total: items.length, page: 1, pageSize: 50 });
  return ekraniCiz(<FavorilerEkrani />, {
    sabitZaman: new Date("2026-08-19T16:30:00.000Z"),
  });
}

/**
 * [#19] The row's Pressable is `accessible` by default, so labelling it
 * with the shop's name REPLACED its children — including the one badge
 * the whole screen exists to carry. A reader with twelve favourites heard
 * twelve shop names and had to open every one to find out which had a bag
 * today.
 */
describe("Favoriler — the row says whether there is a bag today (#19)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("announces the district, the rating and today's badge with the name", async () => {
    await renderFavoriler([favori()]);

    const satir = await waitFor(() => screen.getByLabelText(/^Ada Fırın/));
    const etiket = satir.props.accessibilityLabel as string;

    expect(etiket).toContain("Kadıköy");
    expect(etiket).toContain("★ 4,5");
    expect(etiket).toContain("12 değerlendirme");
    expect(etiket).toContain("Bugün paketi var");
  });

  it("says there is none when there is none", async () => {
    await renderFavoriler([favori({ hasLiveOfferToday: false })]);

    const satir = await waitFor(() => screen.getByLabelText(/^Ada Fırın/));
    expect(satir.props.accessibilityLabel).toContain("Bugün paket yok");
  });

  it("drops the rating from the label for a shop nobody has rated", async () => {
    await renderFavoriler([
      favori({ store: { id: "s2", name: "Yeni Fırın", district: "Şişli", avgStars: 0, ratingCount: 0 } }),
    ]);

    const satir = await waitFor(() => screen.getByLabelText(/^Yeni Fırın/));
    const etiket = satir.props.accessibilityLabel as string;

    expect(etiket).toContain("Şişli");
    expect(etiket).not.toContain("★");
  });
});
