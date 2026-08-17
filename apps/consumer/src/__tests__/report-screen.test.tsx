import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

const mockBack = jest.fn();
let mockSearchParams: { targetType: string; targetId: string } = {
  targetType: "OFFER",
  targetId: "offer-1",
};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test-utils/render";
import { client } from "../lib/api-client";
import NewReportScreen from "../app/report/new";
import "../i18n";
import { KurtarApiError } from "@kurtar/api-client";

const mockCreateReport = client.complaints.createReport as jest.Mock;

function renderReportScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <NewReportScreen />
    </QueryClientProvider>,
  );
}

// [I14 fix] Regression coverage: before this screen existed,
// client.complaints.createReport (POST /api/reports, the 48h
// notice-and-takedown clock) had zero call sites anywhere in the app —
// nothing a consumer could press ever created a ContentReport.
describe("Report screen — the notice-and-takedown entry point", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { targetType: "OFFER", targetId: "offer-1" };
  });

  it("submits with the target passed via route params and shows the received confirmation", async () => {
    mockCreateReport.mockResolvedValue({
      id: "report-1",
      targetType: "OFFER",
      targetId: "offer-1",
      reason: "Yasa dışı içerik var.",
      status: "OPEN",
    });

    await renderReportScreen();
    await fireEvent.changeText(
      screen.getByTestId("report-reason-input"),
      "Yasa dışı içerik var.",
    );
    await fireEvent.press(screen.getByTestId("report-submit"));

    await waitFor(() =>
      expect(mockCreateReport).toHaveBeenCalledWith({
        targetType: "OFFER",
        targetId: "offer-1",
        reason: "Yasa dışı içerik var.",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Bildirimin alındı, ekibimiz 48 saat içinde inceleyecek."),
      ).toBeTruthy(),
    );
  });

  it("disables submit until a reason is typed, and never calls createReport for an empty reason", async () => {
    await renderReportScreen();
    const submitButton = screen.getByTestId("report-submit");
    expect(submitButton.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(submitButton);
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it("surfaces a server error inline instead of silently discarding the report", async () => {
    mockCreateReport.mockRejectedValue(
      new KurtarApiError({
        statusCode: 429,
        errorCode: "THROTTLED",
        message: "Too many reports. Please try again later.",
        isBackendErrorCode: false,
      }),
    );

    await renderReportScreen();
    await fireEvent.changeText(
      screen.getByTestId("report-reason-input"),
      "Spam ilan.",
    );
    await fireEvent.press(screen.getByTestId("report-submit"));

    // getErrorMessage falls back to the generic copy for an unmapped
    // errorCode/status (see lib/errors.ts) — the point of this test is
    // that submission failure is shown at all, not silently swallowed.
    await waitFor(() =>
      expect(
        screen.getByText("Bir şeyler ters gitti. Lütfen tekrar dene."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Bildirimin alındı, ekibimiz 48 saat içinde inceleyecek.")).toBeNull();
  });
});
