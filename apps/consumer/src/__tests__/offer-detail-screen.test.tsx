import { render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: {
  id: string;
  storeId: string;
  distanceM?: string;
} = { id: "offer-1", storeId: "store-1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test-utils/render";
import { client } from "../lib/api-client";
import OfferDetailScreen from "../app/offer/[id]";
import "../i18n";

const mockStoreProfile = client.discovery.store as jest.Mock;

function baseStoreProfile(overrides: Record<string, unknown> = {}) {
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
          ...((overrides.template as object) ?? {}),
        },
        pickupStartAt: new Date(Date.now() + 3600_000).toISOString(),
        pickupEndAt: new Date(Date.now() + 7200_000).toISOString(),
        qtyLeft: 3,
      },
    ],
    rating: { average: 4.5, count: 12 },
    ...overrides,
  };
}

function renderOfferDetail() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OfferDetailScreen />
    </QueryClientProvider>,
  );
}

// [I12 fix] Regression coverage: the allergen Section used to always
// render a hard-coded "coming soon" placeholder, even though the
// merchant's real disclaimer text is mandatory at submit and was already
// present in this exact API response — apps/consumer just never read it.
describe("Offer detail screen — allergen disclosure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: "offer-1", storeId: "store-1" };
  });

  it("shows the merchant's own allergen text, not the generic placeholder", async () => {
    mockStoreProfile.mockResolvedValue(baseStoreProfile());

    await renderOfferDetail();

    await waitFor(() =>
      expect(screen.getByText("Fındık ve süt ürünleri içerir.")).toBeTruthy(),
    );
    expect(
      screen.queryByText(/alerjen beyanı yakında eklenecek/),
    ).toBeNull();
  });

  it("falls back to the generic notice when a template genuinely has no allergen text", async () => {
    mockStoreProfile.mockResolvedValue(
      baseStoreProfile({ template: { allergenDisclaimer: "" } }),
    );

    await renderOfferDetail();

    await waitFor(() =>
      expect(
        screen.getByText(
          "İçerik gün be gün değişebileceğinden alerjen bilgisi mağazaya göre değişir. Bu mağaza için bir alerjen beyanı bulunamadı — alerjin varsa teslim alırken mağaza personeline mutlaka sor.",
        ),
      ).toBeTruthy(),
    );
  });
});
