import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Pressable, Text } from "react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment.
jest.mock("../lib/api-client");

import { client } from "../lib/api-client";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { registerPushTokenIfPermitted } from "../lib/push";

const mockRegister = client.account.pushTokens.register as jest.Mock;
const mockRemove = client.account.pushTokens.remove as jest.Mock;
const mockAuthLogout = client.auth.logout as jest.Mock;
const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const mockGetExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.Mock;

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Pressable testID="logout" onPress={() => logout()}>
      <Text>logout</Text>
    </Pressable>
  );
}

async function renderLogoutButton() {
  return render(
    <AuthProvider>
      <LogoutButton />
    </AuthProvider>,
  );
}

describe("logout — push token cleanup (I6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthLogout.mockResolvedValue(undefined);
    mockRegister.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
  });

  it("is a no-op on the push side when no token was ever registered this run", async () => {
    await renderLogoutButton();

    fireEvent.press(screen.getByTestId("logout"));

    await waitFor(() => expect(mockAuthLogout).toHaveBeenCalledTimes(1));
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("deregisters the device's Expo push token before the session ends", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetExpoPushTokenAsync.mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });

    // Simulates what app/_layout.tsx does on every `signedIn` transition —
    // by the time a real user can tap "log out", a token has already been
    // registered for this device at least once.
    await registerPushTokenIfPermitted();
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ expoPushToken: "ExponentPushToken[abc123]" }),
    );

    await renderLogoutButton();
    fireEvent.press(screen.getByTestId("logout"));

    // Without the fix, logout() never calls pushTokens.remove — a
    // signed-out device would keep receiving the previous user's
    // transactional notifications (reservation confirmations, the pickup
    // reminder carrying the redeem code) until some other device
    // registers the same Expo token.
    await waitFor(() =>
      expect(mockRemove).toHaveBeenCalledWith("ExponentPushToken[abc123]"),
    );
    expect(mockAuthLogout).toHaveBeenCalledTimes(1);
  });

  it("still completes the local sign-out even if unregistering the push token fails", async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetExpoPushTokenAsync.mockResolvedValue({
      data: "ExponentPushToken[abc123]",
    });
    await registerPushTokenIfPermitted();
    mockRemove.mockRejectedValue(new Error("network down"));

    await renderLogoutButton();
    fireEvent.press(screen.getByTestId("logout"));

    await waitFor(() => expect(mockAuthLogout).toHaveBeenCalledTimes(1));
  });
});
