import { render } from "@testing-library/react-native";
import i18n from "../i18n";
import "../i18n";
import { SwipeToConfirm } from "../components/SwipeToConfirm";
import { LiveClock } from "../components/LiveClock";

/**
 * [M22 fix] Four accessibility/fallback strings used to be hardcoded
 * Turkish literals instead of i18n keys — everything else in this app has
 * exact tr/en key parity (see i18n/tr.json + en.json), but these four
 * would have stayed Turkish even if the app ever shipped a language
 * switch. A DOM/text snapshot can't distinguish "sourced from i18n" from
 * "hardcoded to the same string" (both render identical Turkish by
 * default), so this proves it the only way that actually can: switch the
 * active language and assert the accessible text changes with it.
 */
describe("Accessibility strings are i18n-sourced, not hardcoded (M22)", () => {
  afterEach(async () => {
    await i18n.changeLanguage("tr");
  });

  it("SwipeToConfirm's accessibilityHint changes with the active language", async () => {
    await i18n.changeLanguage("tr");
    const first = await render(
      <SwipeToConfirm label="Kaydır" onConfirm={() => undefined} />,
    );
    expect(first.getByLabelText("Kaydır").props.accessibilityHint).toBe(
      "Teslim almayı onaylamak için etkinleştir",
    );
    await first.unmount();

    await i18n.changeLanguage("en");
    const second = await render(
      <SwipeToConfirm label="Swipe" onConfirm={() => undefined} />,
    );
    expect(second.getByLabelText("Swipe").props.accessibilityHint).toBe(
      "Activate to confirm pickup",
    );
    await second.unmount();
  });

  it("LiveClock's accessibilityLabel changes with the active language", async () => {
    const clockFace = /^\d{2}:\d{2}:\d{2}$/;

    await i18n.changeLanguage("tr");
    const first = await render(<LiveClock color="#fff" />);
    const trLabel = first.getByText(clockFace).props
      .accessibilityLabel as string;
    expect(trLabel.startsWith("Canlı saat:")).toBe(true);
    await first.unmount();

    await i18n.changeLanguage("en");
    const second = await render(<LiveClock color="#fff" />);
    const enLabel = second.getByText(clockFace).props
      .accessibilityLabel as string;
    expect(enLabel.startsWith("Live clock:")).toBe(true);
    await second.unmount();
  });
});
