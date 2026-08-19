import { PixelRatio } from "react-native";
import { render } from "@testing-library/react-native";
import { oku } from "../test-utils/sekme-yakala";
import TabsLayout from "../app/(tabs)/_layout";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import "../i18n";

jest.mock("../lib/auth-context", () => ({
  useAuth: () => ({ status: "signedIn" }),
}));

/**
 * The tab bar carries the only six words that are on every screen, and it
 * has lost them twice by different routes: first by shaving the cedilla
 * off "Keşfet"/"Siparişler" when the bar sat flush with the bottom edge,
 * then by ellipsising "Favoriler" to "Favor…" as soon as the user raised
 * their text size. Both are the same defect to a Turkish reader — the word
 * is no longer the word.
 *
 * Note this cannot be verified in the web export at all: react-native-web
 * hard-codes `Dimensions.fontScale` to 1 and ignores `allowFontScaling`,
 * so a browser screenshot of a large-text setting is a screenshot of the
 * default one.
 */
/** The navigator is mocked away; we assert on the options object the
 * layout hands it. The mailbox is a module because `jest.mock`'s factory
 * is hoisted above anything this file declares. */
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const kutu = jest.requireActual<typeof import("../test-utils/sekme-yakala")>(
    "../test-utils/sekme-yakala",
  );
  const Tabs = (props: { screenOptions: never; children?: React.ReactNode }) => {
    kutu.yaz(props.screenOptions);
    return React.createElement("Tabs", {}, props.children);
  };
  Tabs.Screen = () => null;
  return { Tabs, Redirect: () => null };
});

const ekranSecenekleri = () => oku();

function ciz() {
  return render(
    <ClockProvider>
      <ThemeProvider fazZorla="gece">
        <TabsLayout />
      </ThemeProvider>
    </ClockProvider>,
  );
}

describe("tab bar — the six words survive the user's text size", () => {
  afterEach(() => jest.restoreAllMocks());

  it("reserves one line of label at the default text size", async () => {
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
    await ciz();
    const { tabBarStyle } = ekranSecenekleri();
    // 24 icon + 17 leading + 8 + 8 padding + 4
    expect(tabBarStyle.height).toBe(24 + 17 + 8 * 2 + 4);
  });

  it("grows to two lines of label once the scale passes the point where 'Favoriler' stops fitting", async () => {
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1.3);
    await ciz();
    const { tabBarStyle } = ekranSecenekleri();
    expect(tabBarStyle.height).toBe(24 + Math.round(17 * 1.3 * 2 * 100) / 100 + 8 * 2 + 4);
  });

  it("renders the label itself so it can wrap, instead of leaving it to the navigator's single ellipsised line", async () => {
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1.3);
    await ciz();
    const { tabBarLabel } = ekranSecenekleri();
    expect(typeof tabBarLabel).toBe("function");
    const dugum = tabBarLabel({ color: "#fff", children: "Favoriler" });
    expect(dugum.props.numberOfLines).toBe(2);
  });

  it("keeps the label to one line at the default size, so nothing reflows for the people who never changed it", async () => {
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1);
    await ciz();
    const { tabBarLabel } = ekranSecenekleri();
    expect(tabBarLabel({ color: "#fff", children: "Favoriler" }).props.numberOfLines).toBe(1);
  });
});
