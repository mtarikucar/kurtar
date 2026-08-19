import { fireEvent, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: { id: string } = { id: "complaint-1" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { renderWithPanelProviders } from "../test-utils/panel-render";
import { client } from "../lib/api-client";
import { KurtarApiError } from "@kurtar/api-client";
import MyComplaintsScreen from "../app/complaints/index";
import ComplaintDetailScreen from "../app/complaints/[id]";
import "../i18n";

const mockListMine = client.complaints.listMine as jest.Mock;
const mockGet = client.complaints.get as jest.Mock;
const mockAddMessage = client.complaints.addMessage as jest.Mock;

function renderComplaintsList() {
  return renderWithPanelProviders(<MyComplaintsScreen />);
}

function renderComplaintDetail() {
  return renderWithPanelProviders(<ComplaintDetailScreen />);
}

const listItem = {
  id: "complaint-1",
  userId: "user-1",
  merchantId: "merchant-1",
  reservationId: "res-1",
  category: "MISSING_ITEMS" as const,
  description: "Poşette bir ürün eksikti.",
  status: "OPEN" as const,
  slaDeadlineAt: "2026-08-30T12:00:00.000Z",
  resolvedAt: null,
  slaWarningSentAt: null,
  refundedAt: null,
  createdAt: "2026-08-15T12:00:00.000Z",
  updatedAt: "2026-08-15T12:00:00.000Z",
};

// [I8 fix] Before this screen existed, GET /complaints/mine had zero
// callers anywhere in the app — a consumer who filed a complaint could
// never see it again, let alone the reply.
describe("MyComplaintsScreen — GET /complaints/mine has a caller (I8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the caller's complaints from the mine endpoint", async () => {
    mockListMine.mockResolvedValue({ items: [listItem], total: 1, page: 1, pageSize: 50 });

    await renderComplaintsList();

    await waitFor(() => expect(mockListMine).toHaveBeenCalledWith({ page: 1, pageSize: 50 }));
    expect(await screen.findByText("Poşette bir ürün eksikti.")).toBeTruthy();
  });

  it("shows an empty state instead of a blank screen when there are no complaints", async () => {
    mockListMine.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

    await renderComplaintsList();

    expect(await screen.findByText("Henüz şikayetin yok")).toBeTruthy();
  });

  it("navigates to the detail thread when a row is pressed", async () => {
    mockListMine.mockResolvedValue({ items: [listItem], total: 1, page: 1, pageSize: 50 });

    await renderComplaintsList();
    const row = await screen.findByText("Poşette bir ürün eksikti.");
    await fireEvent.press(row);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/complaints/[id]",
      params: { id: "complaint-1" },
    });
  });
});

describe("ComplaintDetailScreen — GET /complaints/{id} has a caller (I8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: "complaint-1" };
  });

  it("renders the thread, including the merchant/admin's reply the consumer filed the complaint to see", async () => {
    mockGet.mockResolvedValue({
      ...listItem,
      status: "MERCHANT_RESPONDED",
      messages: [
        {
          id: "msg-1",
          complaintId: "complaint-1",
          authorType: "CONSUMER",
          authorId: "user-1",
          body: "Poşette bir ürün eksikti.",
          createdAt: "2026-08-15T12:00:00.000Z",
        },
        {
          id: "msg-2",
          complaintId: "complaint-1",
          authorType: "MERCHANT",
          authorId: "merchant-1",
          body: "Özür dileriz, bir sonraki siparişinize indirim tanımladık.",
          createdAt: "2026-08-16T09:00:00.000Z",
        },
      ],
    });

    await renderComplaintDetail();

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("complaint-1"));
    expect(
      await screen.findByText("Özür dileriz, bir sonraki siparişinize indirim tanımladık."),
    ).toBeTruthy();
  });

  it("lets the consumer reply into the thread via POST /complaints/{id}/messages", async () => {
    mockGet.mockResolvedValue({ ...listItem, messages: [] });
    mockAddMessage.mockResolvedValue({
      id: "msg-3",
      complaintId: "complaint-1",
      authorType: "CONSUMER",
      authorId: "user-1",
      body: "Hâlâ yanıt bekliyorum.",
      createdAt: "2026-08-17T09:00:00.000Z",
    });

    await renderComplaintDetail();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    const input = await screen.findByLabelText("Yanıt yaz…");
    await fireEvent.changeText(input, "Hâlâ yanıt bekliyorum.");
    await fireEvent.press(screen.getByText("Gönder"));

    await waitFor(() =>
      expect(mockAddMessage).toHaveBeenCalledWith("complaint-1", {
        body: "Hâlâ yanıt bekliyorum.",
      }),
    );
  });

  // `GET /complaints/{id}` is CONSUMER-only AND ownership-checked
  // server-side (complaints.service.ts's `getMine` throws a 403 — a
  // distinct ForbiddenException — when `complaint.userId !== userId`,
  // and a 404 when the id doesn't exist at all). Both branches must land
  // on the SAME "not found" screen: telling a caller "this complaint
  // exists but isn't yours" (vs. "no such complaint") would leak which
  // ids are real to someone probing IDs they don't own.
  it("renders the same not-found state for a 403 (not the caller's complaint) as for a 404", async () => {
    mockGet.mockRejectedValue(
      new KurtarApiError({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message: "Not your complaint",
        isBackendErrorCode: false,
      }),
    );

    await renderComplaintDetail();

    expect(await screen.findByText("Aradığın kayıt bulunamadı.")).toBeTruthy();
  });

  it("renders the not-found state for a 404 (complaint id does not exist)", async () => {
    mockGet.mockRejectedValue(
      new KurtarApiError({
        statusCode: 404,
        errorCode: "NOT_FOUND",
        message: "Complaint not found",
        isBackendErrorCode: false,
      }),
    );

    await renderComplaintDetail();

    expect(await screen.findByText("Aradığın kayıt bulunamadı.")).toBeTruthy();
  });
});
