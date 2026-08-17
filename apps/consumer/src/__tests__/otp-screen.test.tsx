import { fireEvent, render, screen, waitFor, act } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

// Auto-mock (no factory): every `client.*` method becomes a jest.fn(). A
// hand-written factory closing over a module-scope `mockClient` const was
// tried first and is NOT safe here — empirically, the factory ran before
// the const initializer (a babel-jest hoisting quirk with this toolchain),
// so `client` silently fell back to the REAL api-client hitting a real
// (absent) server. Auto-mock has no such timing dependency.
jest.mock("../lib/api-client");

const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockRouterReplace, back: mockRouterBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ phone: "+905551234567" }),
}));

import { client, tokenStore } from "../lib/api-client";
import { AuthProvider } from "../lib/auth-context";
import OtpScreen from "../app/(auth)/otp";
import "../i18n";
import { KurtarApiError } from "@kurtar/api-client";

const mockVerifyOtp = client.auth.verifyOtp as jest.Mock;
const mockRequestOtp = client.auth.requestOtp as jest.Mock;

// @testing-library/react-native v14's render() is async (awaits act()
// internally for React 19) — every call site below awaits it.
function renderOtpScreen() {
  return render(
    <AuthProvider>
      <OtpScreen />
    </AuthProvider>,
  );
}

describe("OTP screen — verify, cooldown, and lockout copy", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
    await SecureStore.deleteItemAsync("kurtar.refreshToken");
  });

  it("verifies a correct 6-digit code and lets the user continue", async () => {
    mockVerifyOtp.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: "u1", phone: "+905551234567", status: "ACTIVE", name: null },
    });

    await renderOtpScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), "123456");
    await fireEvent.press(screen.getByTestId("otp-verify"));

    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        phone: "+905551234567",
        code: "123456",
      }),
    );
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/(auth)/permissions"));
  });

  it("persists the issued access + refresh token pair on successful verify — without this, every authenticated call 401s and the app bounces straight back to signed-out", async () => {
    mockVerifyOtp.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { id: "u1", phone: "+905551234567", status: "ACTIVE", name: null },
    });

    await renderOtpScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), "123456");
    await fireEvent.press(screen.getByTestId("otp-verify"));

    await waitFor(() => expect(tokenStore.accessToken).toBe("access-token"));
    expect(tokenStore.refreshToken).toBe("refresh-token");
    // The refresh token must also survive a cold start — SecureStore, not
    // just the in-memory tokenStore.
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync("kurtar.refreshToken")).toBe("refresh-token"),
    );
  });

  it("shows the uniform invalid-code message on a wrong/expired code (no oracle)", async () => {
    mockVerifyOtp.mockRejectedValue(
      new KurtarApiError({
        statusCode: 401,
        errorCode: "UNAUTHORIZED",
        message: "Invalid or expired verification code",
        isBackendErrorCode: false,
      }),
    );

    await renderOtpScreen();
    await fireEvent.changeText(screen.getByTestId("otp-input"), "000000");
    await fireEvent.press(screen.getByTestId("otp-verify"));

    await waitFor(() =>
      expect(screen.getByText("Kod hatalı ya da süresi doldu. Lütfen tekrar dene.")).toBeTruthy(),
    );
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("starts a real 60s resend countdown on mount and disables resend until it elapses", async () => {
    await renderOtpScreen();
    // "Yeniden gönder (60)" — a real countdown, not a static "please wait".
    expect(screen.getByText("Yeniden gönder (60)")).toBeTruthy();
    const resendButton = screen.getByTestId("otp-resend");
    expect(resendButton.props.accessibilityState?.disabled).toBe(true);
  });

  it("shows the cooldown message and resyncs the countdown on a 400 'wait' response", async () => {
    mockRequestOtp.mockRejectedValue(
      new KurtarApiError({
        statusCode: 400,
        errorCode: "BAD_REQUEST",
        message: "Please wait before requesting another code.",
        isBackendErrorCode: false,
      }),
    );

    // Fake timers installed BEFORE render — the countdown's setInterval is
    // created inside the screen's mount effect, so it must already be a
    // fake timer for advanceTimersByTime to affect it (installing fake
    // timers after a real setInterval already exists does not retroactively
    // convert it). Fast-forwarding to a genuinely enabled resend control
    // and pressing it for real also sidesteps a real limitation: RN's
    // Pressable doesn't expose a functional `onPress` via `.props` while
    // `disabled` is true (it's not wired into the responder system in that
    // state), so a direct `.props.onPress()` call can't exercise this path.
    jest.useFakeTimers();
    await renderOtpScreen();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    jest.useRealTimers();

    await fireEvent.press(screen.getByTestId("otp-resend"));

    await waitFor(() =>
      expect(screen.getByText("Yeni kod istemeden önce biraz bekle.")).toBeTruthy(),
    );
  });

  it("shows the lockout message (no fabricated countdown) after too many failed attempts", async () => {
    mockRequestOtp.mockRejectedValue(
      new KurtarApiError({
        statusCode: 400,
        errorCode: "BAD_REQUEST",
        message:
          "Too many failed verification attempts on this phone. Please try again later.",
        isBackendErrorCode: false,
      }),
    );

    jest.useFakeTimers();
    await renderOtpScreen();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    jest.useRealTimers();

    await fireEvent.press(screen.getByTestId("otp-resend"));

    // Appears twice — the notice text AND the resend button's own label
    // (`locked` swaps the button's label to the same lockout copy).
    await waitFor(() =>
      expect(
        screen.getAllByText("Çok fazla başarısız deneme oldu. Lütfen daha sonra tekrar dene."),
      ).toHaveLength(2),
    );
    // Locked out — the resend control stays disabled with no countdown to show.
    expect(screen.getByTestId("otp-resend").props.accessibilityState?.disabled).toBe(true);
  });
});
