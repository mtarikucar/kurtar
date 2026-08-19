import { Animated } from "react-native";
import { render } from "@testing-library/react-native";
import i18n from "../i18n";
import "../i18n";
import { ClockProvider } from "../design/saat";
import { PALETLER } from "../design/tokens";
import { CanliSaat } from "../components/teslim/CanliSaat";
import { KepenkKolu } from "../components/teslim/KepenkKolu";

/**
 * [M22 fix] Accessibility strings must come from i18n, not from Turkish
 * literals that happen to render identically today. A DOM/text snapshot
 * cannot distinguish "sourced from i18n" from "hardcoded to the same
 * string", so this proves it the only way that actually can: switch the
 * active language and assert the accessible text changes with it.
 *
 * The two components under test are the redeem screen's own: the shutter
 * handle (whose label is the ONLY path a screen-reader user has to the
 * code — spec §4.5: "a gesture is never the only path") and the live
 * clock (announced on request, never as a live region every second).
 * They replaced `SwipeToConfirm`/`LiveClock`, which this test used to
 * cover; the guarantee moved with the screen rather than being deleted
 * along with the old components.
 */
function kol() {
  return (
    <ClockProvider sabitZaman={new Date("2026-08-19T15:34:07.000Z")}>
      <KepenkKolu
        genislik={358}
        yukseklik={800}
        konum={new Animated.Value(0)}
        palet={PALETLER.gece}
        kilitli={false}
        azaltHareket={false}
        ekranOkuyucu
        onKaldir={() => undefined}
        onKilitliDeneme={() => undefined}
      />
    </ClockProvider>
  );
}

function saat() {
  return (
    <ClockProvider sabitZaman={new Date("2026-08-19T15:34:07.000Z")}>
      <CanliSaat genislik={358} palet={PALETLER.gece} azaltHareket={false} />
    </ClockProvider>
  );
}

describe("Accessibility strings are i18n-sourced, not hardcoded (M22)", () => {
  afterEach(async () => {
    await i18n.changeLanguage("tr");
  });

  it("the shutter handle's accessible label changes with the active language", async () => {
    await i18n.changeLanguage("tr");
    const ilk = await render(kol());
    expect(
      ilk.getByTestId("kepenk-kol-dugmesi").props.accessibilityLabel,
    ).toBe("Kepengi kaldır — kodu göster");
    await ilk.unmount();

    await i18n.changeLanguage("en");
    const ikinci = await render(kol());
    expect(
      ikinci.getByTestId("kepenk-kol-dugmesi").props.accessibilityLabel,
    ).toBe("Lift the shutter — show the code");
    await ikinci.unmount();
  });

  it("the live clock's accessible label changes with the active language", async () => {
    await i18n.changeLanguage("tr");
    const ilk = await render(saat());
    expect(
      (ilk.getByTestId("kepenk-saat").props.accessibilityLabel as string).startsWith(
        "Saat ",
      ),
    ).toBe(true);
    await ilk.unmount();

    await i18n.changeLanguage("en");
    const ikinci = await render(saat());
    expect(
      (ikinci.getByTestId("kepenk-saat").props.accessibilityLabel as string).startsWith(
        "Time ",
      ),
    ).toBe(true);
    await ikinci.unmount();
  });
});
