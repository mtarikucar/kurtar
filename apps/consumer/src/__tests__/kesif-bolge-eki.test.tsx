import { render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { client } from "../lib/api-client";
import { createTestQueryClient } from "../test-utils/render";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { BASLIK_ESIGI } from "../lib/kesif";
import KesifEkrani from "../app/(tabs)/index";
import "../i18n";

const mockOffers = client.discovery.offers as jest.Mock;
const mockMap = client.discovery.map as jest.Mock;

const SIMDI = new Date("2026-08-19T16:00:00.000Z"); // 19:00 İstanbul

function offer(index: number, district: string) {
  return {
    offerId: `offer-${index}`,
    store: {
      id: `store-${index}`,
      name: `Dükkân ${index}`,
      district,
      distanceM: 400 + index,
    },
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
  };
}

async function renderKesifIn(district: string) {
  const items = Array.from({ length: BASLIK_ESIGI + 1 }, (_, i) => offer(i, district));
  mockOffers.mockResolvedValue({ items, total: items.length, page: 1, pageSize: 50 });
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClockProvider sabitZaman={SIMDI}>
        <ThemeProvider fazZorla="gece">
          <KesifEkrani />
        </ThemeProvider>
      </ClockProvider>
    </QueryClientProvider>,
  );
}

/**
 * The discovery header names the district the open shutters are in, and
 * Turkish decides between 'de / 'da / 'te / 'ta from the name itself. The
 * suffix used to be baked into the copy string, so the header printed
 * "Beşiktaş'de" — the exact failure mode components/teslim/tr-yer.ts was
 * written to prevent, and which it already prevents on the redeem screen.
 *
 * Beşiktaş is not an arbitrary example: it is the cross-Bosphorus case
 * the seed data is built around, and it needs BOTH halves of the rule
 * (back vowel AND a hardened d).
 */
describe("Keşif header — the district takes a real Turkish locative", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMap.mockResolvedValue([]);
  });

  it.each([
    ["Beşiktaş", "Beşiktaş'ta"],
    ["Üsküdar", "Üsküdar'da"],
    ["Beyoğlu", "Beyoğlu'nda"],
    ["Kadıköy", "Kadıköy'de"],
  ])("%s -> %s", async (district, bulunma) => {
    await renderKesifIn(district);

    await waitFor(() =>
      expect(
        screen.getByText(`${bulunma} ${BASLIK_ESIGI + 1} kepenk hâlâ açık`),
      ).toBeTruthy(),
    );
  });
});
