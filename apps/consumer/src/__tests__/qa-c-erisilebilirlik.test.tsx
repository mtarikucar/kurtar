import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

// Auto-mock (no factory) — see otp-screen.test.tsx's comment on why a
// hand-written factory closing over an outer const isn't reliable here.
jest.mock("../lib/api-client");

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ phone: "+905551234567" }),
}));

import { client, tokenStore } from "../lib/api-client";
import { AuthProvider } from "../lib/auth-context";
import { TextField } from "../components/TextField";
import OtpScreen from "../app/(auth)/otp";
import PhoneScreen from "../app/(auth)/phone";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import i18n from "../i18n";
import "../i18n";

const mockVerifyOtp = client.auth.verifyOtp as jest.Mock;
const mockRequestOtp = client.auth.requestOtp as jest.Mock;

const SABIT_ZAMAN = new Date("2026-08-19T19:00:00.000Z");

function sar(cocuk: React.ReactNode) {
  return (
    <AuthProvider>
      <ClockProvider sabitZaman={SABIT_ZAMAN}>
        <ThemeProvider fazZorla="gece">{cocuk}</ThemeProvider>
      </ClockProvider>
    </AuthProvider>
  );
}

/**
 * Everything this spy heard ABOUT one field. React flushes a passive
 * effect on its own schedule and jest's spy outlives the tree that made
 * the call, so a bare `toHaveBeenCalled` here can be satisfied by a
 * neighbouring test's announcement — filtering by the field's own name
 * keeps each spec honest about its own component.
 */
function duyurular(spy: jest.SpyInstance, etiket: string): string[] {
  return spy.mock.calls
    .map((cagri) => String(cagri[0]))
    .filter((metin) => metin.startsWith(`${etiket}: `));
}

/**
 * DENETİM #3 — a form error that is nowhere in the accessibility tree is
 * silence. On /(auth)/otp that silence costs the whole app: a TalkBack
 * user types the wrong 6-digit code, hears NOTHING, retypes the same code,
 * and walks into the backend's 24h failed-verification lockout. The front
 * door closes and there is no other door.
 *
 * These specs assert the message is EXPOSED, not that it renders — a
 * `<Text>` nobody announces already rendered before the fix.
 */
describe("TextField — the error is announced, not just drawn (denetim #3)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("puts the error strip in the accessibility tree as an assertive live region with the alert role", async () => {
    const ekran = await render(
      sar(
        <TextField
          label="Telefon numarası"
          error="Geçerli bir telefon numarası girmelisin."
          value="555"
          onChangeText={() => undefined}
        />,
      ),
    );

    // The role is how a screen reader knows this is an alarm; the live
    // region is how Android/RN Web speak it without moving focus.
    const uyari = screen.getByRole("alert");
    expect(uyari.props.accessibilityLiveRegion).toBe("assertive");
    expect(screen.getByText("Geçerli bir telefon numarası girmelisin.")).toBeTruthy();
    await ekran.unmount();
  });

  it("announces the field name with the error on iOS, which has no live-region concept at all", async () => {
    const duyur = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    expect(Platform.OS).toBe("ios");

    const ekran = await render(
      sar(<TextField label="Doğrulama kodu" value="123456" onChangeText={() => undefined} />),
    );
    await act(async () => undefined);
    // No error yet — nothing to say.
    expect(duyurular(duyur, "Doğrulama kodu")).toEqual([]);

    await ekran.rerender(
      sar(
        <TextField
          label="Doğrulama kodu"
          error="Kod hatalı ya da süresi doldu. Lütfen tekrar dene."
          value="123456"
          onChangeText={() => undefined}
        />,
      ),
    );
    await act(async () => undefined);

    expect(duyurular(duyur, "Doğrulama kodu")).toEqual([
      "Doğrulama kodu: Kod hatalı ya da süresi doldu. Lütfen tekrar dene.",
    ]);
    await ekran.unmount();
  });

  it("does not double-speak on Android, where the live region already says it", async () => {
    const duyur = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    jest.replaceProperty(Platform, "OS", "android" as never);

    const ekran = await render(
      sar(
        <TextField
          label="Android alanı"
          error="Kod hatalı ya da süresi doldu. Lütfen tekrar dene."
          value="123456"
          onChangeText={() => undefined}
        />,
      ),
    );
    await act(async () => undefined);

    expect(duyurular(duyur, "Android alanı")).toEqual([]);
    expect(screen.getByRole("alert").props.accessibilityLiveRegion).toBe("assertive");
    await ekran.unmount();
  });
});

describe("OTP screen — the wrong code reaches the user (denetim #3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exposes 'kod hatalı' as an alert and announces it after a rejected verify", async () => {
    const duyur = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    mockVerifyOtp.mockRejectedValue(new Error("401"));

    const ekran = await render(sar(<OtpScreen />));
    await fireEvent.changeText(screen.getByTestId("otp-input"), "111111");
    await fireEvent.press(screen.getByTestId("otp-verify"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").props.accessibilityLiveRegion).toBe("assertive");
    expect(
      screen.getByText("Kod hatalı ya da süresi doldu. Lütfen tekrar dene."),
    ).toBeTruthy();
    // "Kodu gir" is auth.otp.title — the field's own accessible name.
    await waitFor(() =>
      expect(duyurular(duyur, "Kodu gir")).toEqual([
        "Kodu gir: Kod hatalı ya da süresi doldu. Lütfen tekrar dene.",
      ]),
    );
    await ekran.unmount();
  });
});

/**
 * DENETİM #10 — both auth screens centre their content with
 * `flexGrow: 1` + `justifyContent: 'center'`, so on a tall phone the
 * ScrollView's content size EQUALS its frame and it cannot scroll at all.
 * iOS does not resize the window for the keyboard, and neither
 * 'number-pad' nor 'phone-pad' has a return key — so the submit button
 * ends up behind the keyboard with no way to reach it and sign-in
 * dead-ends. `automaticallyAdjustKeyboardInsets` adds the keyboard height
 * as a bottom content inset, which is what creates the scroll range.
 */
describe("Auth screens — the keyboard cannot bury the button (denetim #10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
    mockRequestOtp.mockResolvedValue(undefined);
  });

  it.each([
    ["otp", "otp-kaydirma", () => <OtpScreen />],
    ["phone", "phone-kaydirma", () => <PhoneScreen />],
  ])("%s takes the keyboard as a content inset on a scroll view that otherwise cannot scroll", async (
    _ad,
    testID,
    ekranYap,
  ) => {
    const ekran = await render(sar(ekranYap()));
    const kaydirma = ekran.getByTestId(testID);

    // The precondition that makes the prop load-bearing rather than
    // decorative: this content container can never produce scroll range
    // on its own.
    const icerik = ([] as unknown[])
      .concat(kaydirma.props.contentContainerStyle as unknown[])
      .flat(3)
      .reduce<Record<string, unknown>>(
        (birlesik, parca) => Object.assign(birlesik, parca as object),
        {},
      );
    expect(icerik.flexGrow).toBe(1);
    expect(icerik.justifyContent).toBe("center");

    expect(kaydirma.props.automaticallyAdjustKeyboardInsets).toBe(true);
    await ekran.unmount();
  });
});

/**
 * DENETİM #29 — `TextField`'s `label` IS the field's accessible name.
 * Passing the format mask to it meant a screen-reader user on the very
 * first screen of the app heard "5xx xxx xx xx" instead of what the field
 * is for.
 */
describe("Phone screen — the field is named, not masked (denetim #29)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestOtp.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await i18n.changeLanguage("tr");
  });

  it("names the phone field 'Telefon numarası' and keeps the mask as the placeholder only", async () => {
    const ekran = await render(sar(<PhoneScreen />));

    const alan = ekran.getByLabelText("Telefon numarası");
    expect(alan.props.placeholder).toBe("5xx xxx xx xx");
    // The mask is not the name of anything.
    expect(ekran.queryByLabelText("5xx xxx xx xx")).toBeNull();
    await ekran.unmount();
  });

  it("takes that name from i18n, not from a Turkish literal", async () => {
    await i18n.changeLanguage("en");
    const ekran = await render(sar(<PhoneScreen />));
    expect(ekran.getByLabelText("Phone number")).toBeTruthy();
    await ekran.unmount();
  });
});
