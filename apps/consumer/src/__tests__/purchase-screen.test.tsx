import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment for why a
// hand-written factory closing over an outer `mockClient` const isn't
// reliable in this toolchain.
jest.mock("../lib/api-client");

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ offerId: "offer-1", storeId: "store-1" }),
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test-utils/render";
import { client } from "../lib/api-client";
import PurchaseScreen from "../app/purchase/[offerId]";
import "../i18n";
import { KurtarApiError } from "@kurtar/api-client";

const mockStore = client.discovery.store as jest.Mock;
const mockCreate = client.reservations.create as jest.Mock;

const STORE_PROFILE = {
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
      pickupStartAt: new Date(Date.now() + 3600_000).toISOString(),
      pickupEndAt: new Date(Date.now() + 7200_000).toISOString(),
      qtyLeft: 3,
    },
  ],
  rating: { average: 4.5, count: 12 },
};

function renderPurchaseScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PurchaseScreen />
    </QueryClientProvider>,
  );
}

describe("Purchase screen — losing the race at drop time (OFFER_UNAVAILABLE)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.mockResolvedValue(STORE_PROFILE);
  });

  it("shows the 'just sold out' state instead of a raw error when reservation create returns OFFER_UNAVAILABLE", async () => {
    mockCreate.mockRejectedValue(
      new KurtarApiError({
        statusCode: 409,
        errorCode: "OFFER_UNAVAILABLE",
        message: "This offer is no longer available.",
        isBackendErrorCode: true,
      }),
    );

    await renderPurchaseScreen();
    await waitFor(() => expect(screen.getByTestId("purchase-confirm")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("purchase-consent-checkbox"));
    await fireEvent.press(screen.getByTestId("purchase-confirm"));

    await waitFor(() =>
      expect(screen.getByText("Bu paket artık alınamıyor")).toBeTruthy(),
    );
    expect(screen.getByText(/Yakınındaki diğer paketlere göz atabilirsin/)).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledWith({
      offerId: "offer-1",
      qty: 1,
    });
  });

  it("increments quantity up to the live stock cap before confirming", async () => {
    mockCreate.mockResolvedValue({
      reservationId: "resv-1",
      code: "AB12CD",
      totalCents: 9980,
      payment: { merchantOid: "oid-1", redirectUrl: "https://mock-payment.local/pay/oid-1" },
    });

    await renderPurchaseScreen();
    await waitFor(() => expect(screen.getByTestId("purchase-qty")).toBeTruthy());
    expect(screen.getByTestId("purchase-qty").props.children).toBe(1);

    await fireEvent.press(screen.getByLabelText("Artır"));
    expect(screen.getByTestId("purchase-qty").props.children).toBe(2);

    await fireEvent.press(screen.getByTestId("purchase-consent-checkbox"));
    await fireEvent.press(screen.getByTestId("purchase-confirm"));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        offerId: "offer-1",
        qty: 2,
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: "/payment/[id]",
          params: expect.objectContaining({ id: "resv-1", code: "AB12CD" }),
        }),
      ),
    );
  });
});

// [I13 fix] Regression coverage: this screen used to go straight from a
// quantity stepper to "Ödemeye geç" with no ÖBF/MSS link and no consent
// control at all — the ONLY place a Turkish consumer forms a distance
// contract (landing has no checkout).
describe("Purchase screen — pre-contract disclosure gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.mockResolvedValue(STORE_PROFILE);
  });

  it("disables the confirm button until the consent checkbox is ticked, and never calls create for an unconfirmed consent", async () => {
    await renderPurchaseScreen();
    await waitFor(() => expect(screen.getByTestId("purchase-confirm")).toBeTruthy());

    const confirmButton = screen.getByTestId("purchase-confirm");
    expect(confirmButton.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(confirmButton);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("enables the confirm button once the consent checkbox is ticked", async () => {
    await renderPurchaseScreen();
    await waitFor(() => expect(screen.getByTestId("purchase-confirm")).toBeTruthy());

    await fireEvent.press(screen.getByTestId("purchase-consent-checkbox"));

    expect(
      screen.getByTestId("purchase-confirm").props.accessibilityState?.disabled,
    ).toBe(false);
  });

  it("links to the real Ön Bilgilendirme Formu and Mesafeli Satış Sözleşmesi documents, not a placeholder", async () => {
    await renderPurchaseScreen();
    await waitFor(() => expect(screen.getByText("Ön Bilgilendirme Formu'nu oku")).toBeTruthy());

    await fireEvent.press(screen.getByText("Ön Bilgilendirme Formu'nu oku"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/legal/[doc]",
      params: { doc: "on-bilgilendirme-formu" },
    });

    await fireEvent.press(screen.getByText("Mesafeli Satış Sözleşmesi'ni oku"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/legal/[doc]",
      params: { doc: "mesafeli-satis-sozlesmesi" },
    });
  });
});
