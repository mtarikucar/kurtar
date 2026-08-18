import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "../test-utils/render";
import { client } from "../lib/api-client";
import NotificationPreferencesScreen from "../app/notification-preferences";
import "../i18n";

const mockGet = client.account.notificationPreferences.get as jest.Mock;
const mockUpdate = client.account.notificationPreferences.update as jest.Mock;

function renderScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationPreferencesScreen />
    </QueryClientProvider>,
  );
}

const PREFS = {
  id: "pref-1",
  userId: "user-1",
  favoritesEnabled: true,
  nearbyEnabled: true,
  nearbyRadiusM: 3000,
  marketingEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

// [M16 fix] The marketingEnabled toggle used to be rendered here even
// though no NotificationKind maps to it anywhere in the backend
// (notification-policy.table.ts) — consent was captured and never
// consulted, so the control was a false promise. It's gone, and saving
// never sends the field.
describe("Notification preferences screen — no dead marketing toggle (M16)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(PREFS);
    mockUpdate.mockResolvedValue(PREFS);
  });

  it("renders favorites/nearby/quiet-hours controls but no marketing toggle", async () => {
    await renderScreen();

    await waitFor(() => expect(screen.getByLabelText("Favori mağaza güncellemeleri")).toBeTruthy());
    expect(screen.getByLabelText("Yakınımdaki fırsatlar")).toBeTruthy();
    expect(screen.queryByText("Kampanya ve duyurular")).toBeNull();
    expect(screen.queryByLabelText("Kampanya ve duyurular")).toBeNull();
  });

  it("saving never sends marketingEnabled in the PATCH body", async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByLabelText("Favori mağaza güncellemeleri")).toBeTruthy());

    await fireEvent.press(screen.getByText("Kaydet"));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const sentBody = mockUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty("marketingEnabled");
  });
});
