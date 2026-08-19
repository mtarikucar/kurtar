import { act, render, renderHook, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { erisimAzaltmayiAyarla } from "../test-utils/erisim";
import { ClockProvider } from "../design/saat";
import { ThemeProvider, useTema } from "../design/theme";
import { useReduceMotion } from "../design/reduce-motion";
import { kart, m, PALETLER, r, s, yazi } from "../design/tokens";

function Probu() {
  const { faz, palet } = useTema();
  return (
    <>
      <Text testID="faz">{faz}</Text>
      <Text testID="kart">{palet.yuzeyKaldirim}</Text>
    </>
  );
}

async function fazDa(an: string) {
  const gorunum = await render(
    <ClockProvider sabitZaman={new Date(an)}>
      <ThemeProvider>
        <Probu />
      </ThemeProvider>
    </ClockProvider>,
  );
  const faz = screen.getByTestId("faz").props.children as string;
  await gorunum.unmount();
  return faz;
}

/** Kadıköy sunset on 19 August 2026 is 19:59 local (16:59Z). */
describe("ThemeProvider picks the phase off the local solar clock", () => {
  it.each([
    ["14:00 İstanbul — full sun", "2026-08-19T11:00:00Z", "gunduz"],
    ["19:10 İstanbul — 49 dk before sunset", "2026-08-19T16:10:00Z", "gunduz"],
    ["19:20 İstanbul — 39 dk before sunset", "2026-08-19T16:20:00Z", "alacakaranlik"],
    ["20:00 İstanbul — sunset", "2026-08-19T17:00:00Z", "alacakaranlik"],
    ["20:30 İstanbul — 31 dk after", "2026-08-19T17:30:00Z", "gece"],
    ["04:00 İstanbul — before dawn", "2026-08-19T01:00:00Z", "gece"],
  ])("%s -> %s", async (_ad, an, beklenen) => {
    expect(await fazDa(an)).toBe(beklenen);
  });

  it("hands every component the whole palette object, frozen", async () => {
    await render(
      <ClockProvider sabitZaman={new Date("2026-08-19T20:00:00Z")}>
        <ThemeProvider>
          <Probu />
        </ThemeProvider>
      </ClockProvider>,
    );
    expect(screen.getByTestId("kart").props.children).toBe(
      PALETLER.gece.yuzeyKaldirim,
    );
  });

  it("can be pinned, which is how the review screen shows all three", async () => {
    await render(
      <ClockProvider sabitZaman={new Date("2026-08-19T20:00:00Z")}>
        <ThemeProvider fazZorla="gunduz">
          <Probu />
        </ThemeProvider>
      </ClockProvider>,
    );
    expect(screen.getByTestId("faz").props.children).toBe("gunduz");
    expect(screen.getByTestId("kart").props.children).toBe(
      PALETLER.gunduz.yuzeyKaldirim,
    );
  });
});

describe("the three palettes are frozen at module scope (§1.1)", () => {
  it.each(["gece", "alacakaranlik", "gunduz"] as const)("%s", (ad) => {
    expect(Object.isFrozen(PALETLER[ad])).toBe(true);
    const once = PALETLER[ad].bgAsfalt;
    try {
      // @ts-expect-error — the point of the test is that this cannot take.
      PALETLER[ad].bgAsfalt = "#FF0000";
    } catch {
      // Strict mode throws; sloppy mode ignores it. Either is a refusal.
    }
    expect(PALETLER[ad].bgAsfalt).toBe(once);
  });

  it("freezes the record itself, and the scales beside it", () => {
    expect(Object.isFrozen(PALETLER)).toBe(true);
    expect([s, r, m, yazi, kart].every(Object.isFrozen)).toBe(true);
  });

  it("keeps every phase on the same key set, so no component branches on phase", () => {
    const anahtarlar = Object.keys(PALETLER.gece).sort();
    expect(Object.keys(PALETLER.gunduz).sort()).toEqual(anahtarlar);
    expect(Object.keys(PALETLER.alacakaranlik).sort()).toEqual(anahtarlar);
  });

  it("keeps line heights absolute, never multiplied (§1.2)", () => {
    for (const token of Object.values(yazi)) {
      expect(token.lineHeight).toBeGreaterThan(token.fontSize);
      expect(Number.isInteger(token.lineHeight)).toBe(true);
    }
  });
});

describe("useReduceMotion() is subscribed, not read once (§2)", () => {
  it("reports the current setting and then follows it", async () => {
    let dinleyici: ((deger: boolean) => void) | undefined;
    const geriAl = erisimAzaltmayiAyarla(false);
    const abone = jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation(((_olay: string, fn: (deger: boolean) => void) => {
        dinleyici = fn;
        return { remove: jest.fn() };
      }) as unknown as typeof AccessibilityInfo.addEventListener);

    const { result } = await renderHook(() => useReduceMotion());
    expect(result.current).toBe(false);

    // The user flips the switch while the app is open.
    await act(async () => {
      dinleyici?.(true);
    });
    expect(result.current).toBe(true);

    abone.mockRestore();
    geriAl();
  });

  it("says 'not yet known' before the platform has answered", async () => {
    // The first frame must not start a movement it may not be allowed to
    // make, so the hook reports null until the answer arrives.
    let coz: ((deger: boolean) => void) | undefined;
    const oncekiOku = AccessibilityInfo.isReduceMotionEnabled;
    AccessibilityInfo.isReduceMotionEnabled = jest.fn(
      () => new Promise<boolean>((r) => { coz = r; }),
    );
    const { result } = await renderHook(() => useReduceMotion());
    expect(result.current).toBeNull();
    await act(async () => {
      coz?.(true);
    });
    expect(result.current).toBe(true);
    AccessibilityInfo.isReduceMotionEnabled = oncekiOku;
  });
});
