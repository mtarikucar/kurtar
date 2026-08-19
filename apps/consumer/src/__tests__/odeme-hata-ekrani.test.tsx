import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

let mockSearchParams: { id: string; redirectUrl?: string; code?: string } = {
  id: "res-1",
  redirectUrl: "https://saglayici.example/odeme/abc",
};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { ekraniCiz } from "../test-utils/ekran";
import { client } from "../lib/api-client";
import OdemeEkrani from "../app/payment/[id]";
import "../i18n";

const mockListMine = client.reservations.listMine as jest.Mock;

const BEKLEME =
  "Ödeme sağlayıcısında işlemini tamamla. Onaylandığında otomatik olarak devam edeceğiz.";
const HATA = "Ödeme sayfası açılamadı.";
const KONTROL = "Ödeme durumu kontrol ediliyor…";

function pendingReservation() {
  return {
    items: [
      {
        id: "res-1",
        status: "PENDING_PAYMENT",
        qty: 1,
        totalCents: 4990,
        code: "AB12",
        pickupStartAt: "2026-08-19T14:30:00.000Z",
        pickupEndAt: "2026-08-19T17:00:00.000Z",
        cancelDeadlineAt: "2026-08-19T16:00:00.000Z",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 50,
  };
}

type Ekran = Awaited<ReturnType<typeof ekraniCiz>>;

async function renderOdeme(): Promise<Ekran> {
  mockListMine.mockResolvedValue(pendingReservation());
  return ekraniCiz(<OdemeEkrani />, {
    sabitZaman: new Date("2026-08-19T15:00:00.000Z"),
  });
}

/** The provider's page, found by the props only it carries — RNTL 14
 * dropped the UNSAFE_ByType queries, and the WebView renders nothing a
 * user-facing query could reach. */
function webViewBul(ekran: Ekran) {
  return ekran.container.queryAll(
    (dugum) =>
      typeof dugum.props.onError === "function" &&
      dugum.props.startInLoadingState === true,
  );
}

/** The provider page failing: `onError` is what react-native-webview
 * itself calls when the page 404s or the connection drops. */
async function webViewiPatlat(ekran: Ekran) {
  const [web] = webViewBul(ekran);
  expect(web).toBeTruthy();
  await act(async () => {
    (web.props as { onError: () => void }).onError();
  });
}

/**
 * [#11] This is the money path: a customer who has just been charged, or
 * believes they have, and whose provider page then failed to load. The
 * screen stacked three statements that cannot all be true — "finish
 * paying at the provider", "the payment page could not be opened", "we
 * are checking your payment status" — and offered no action at all. The
 * only affordance was the ✕, which asks whether to abandon the payment.
 */
describe("Ödeme — the failure screen says one thing and offers an action (#11)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {
      id: "res-1",
      redirectUrl: "https://saglayici.example/odeme/abc",
    };
  });

  it("drops the 'finish at the provider' instruction once the provider page has failed", async () => {
    const ekran = await renderOdeme();
    await waitFor(() => expect(screen.getByText(BEKLEME)).toBeTruthy());

    await webViewiPatlat(ekran);

    expect(screen.queryByText(BEKLEME)).toBeNull();
    expect(screen.getByText(HATA)).toBeTruthy();
    expect(screen.getByText(KONTROL)).toBeTruthy();
  });

  it("offers a retry that puts the provider page back", async () => {
    const ekran = await renderOdeme();
    await webViewiPatlat(ekran);

    const yeniden = screen.getByTestId("odeme-yeniden-dene");
    await fireEvent.press(yeniden);

    await waitFor(() => expect(screen.queryByText(HATA)).toBeNull());
    expect(webViewBul(ekran)).toHaveLength(1);
    expect(screen.getByText(BEKLEME)).toBeTruthy();
  });

  it("gives the retry a fresh WebView rather than the one that failed", async () => {
    const ekran = await renderOdeme();
    expect(webViewBul(ekran)).toHaveLength(1);

    await webViewiPatlat(ekran);
    await fireEvent.press(screen.getByTestId("odeme-yeniden-dene"));

    // A second failure must still be reachable — which it only is if the
    // view was genuinely re-created rather than put back still sitting on
    // the page that failed.
    await webViewiPatlat(ekran);
    expect(screen.getByText(HATA)).toBeTruthy();
  });

  it("offers no retry when there is no provider URL to retry", async () => {
    mockSearchParams = { id: "res-1" };
    await renderOdeme();

    await waitFor(() => expect(screen.getByText(HATA)).toBeTruthy());
    expect(screen.queryByTestId("odeme-yeniden-dene")).toBeNull();
    expect(screen.queryByText(BEKLEME)).toBeNull();
  });
});
