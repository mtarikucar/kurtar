import { render, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "offer-1" }),
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test-utils/render";
import { client } from "../lib/api-client";
import ShareLinkOfferScreen from "../app/o/[id]";
import "../i18n";
import { ThemeProvider } from "../design/theme";
import { ClockProvider } from "../design/saat";

const mockOffer = client.discovery.offer as jest.Mock;

function renderScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClockProvider>
        <ThemeProvider fazZorla="gece">
        <ShareLinkOfferScreen />
      </ThemeProvider>
      </ClockProvider>
    </QueryClientProvider>,
  );
}

// [M4 fix] apps/consumer/src/app/o/[id].tsx did not exist before this
// fix — a device opening the app via the landing share-link bridge
// (kurtar://o/<id>) had no matching route at all.
describe("ShareLinkOfferScreen — the /o/[id] deep-link target apps/consumer used to be missing (M4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves the offer's storeId via discovery.offer and redirects into the real offer screen with BOTH params", async () => {
    mockOffer.mockResolvedValue({
      offerId: "offer-1",
      store: { id: "store-1", name: "Ada Fırın", district: "Kadıköy" },
      template: {
        title: "Sürpriz Fırın Paketi",
        category: "BAKERY",
        dietFlags: [],
        priceCents: 4990,
        originalValueCentsMin: 10000,
        originalValueCentsMax: 15000,
      },
      pickupStartAt: new Date(Date.now() + 3600_000).toISOString(),
      pickupEndAt: new Date(Date.now() + 7200_000).toISOString(),
      qtyLeft: 3,
      coverImageUrl: null,
    });

    await renderScreen();

    await waitFor(() => expect(mockOffer).toHaveBeenCalledWith("offer-1"));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/offer/[id]",
        params: { id: "offer-1", storeId: "store-1" },
      }),
    );
  });

  it("shows a branded not-found state (never a blank/frozen screen) when the offer can't be resolved", async () => {
    mockOffer.mockRejectedValue(new Error("404"));

    const { findByText } = await renderScreen();

    expect(await findByText("Bu paket artık mevcut değil.")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
