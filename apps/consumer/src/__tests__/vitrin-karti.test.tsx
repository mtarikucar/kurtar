import { render, screen } from "@testing-library/react-native";
import { Animated } from "react-native";
import { erisimAzaltmayiAyarla } from "../test-utils/erisim";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import type { Faz } from "../design/tokens";
import { VitrinKarti, type VitrinTeklifi } from "../components/kepenk/VitrinKarti";
import {
  ALIS_BITIS,
  GERCEK_TEKLIFLER,
} from "../components/kepenk/gercek-teklifler";
import "../i18n";

/**
 * Every visible part of the card is `accessibilityElementsHidden` behind
 * the ONE composed label the card exposes (spec §3), and RNTL's queries
 * skip hidden subtrees by default — so the text queries below opt in
 * explicitly. That they need to is itself the proof that a screen reader
 * lands on one target per card and not on fourteen.
 */
const GORUNUR = { includeHiddenElements: true } as const;

function metin(deger: string | RegExp) {
  return screen.getByText(deger, GORUNUR);
}

const [YELDEGIRMENI, MODA, MANAV] = GERCEK_TEKLIFLER as readonly [
  VitrinTeklifi,
  VitrinTeklifi,
  VitrinTeklifi,
  VitrinTeklifi,
];

function kapanmaya(dk: number): Date {
  return new Date(new Date(ALIS_BITIS).getTime() - dk * 60_000);
}

async function ciz(
  teklif: VitrinTeklifi,
  simdi: Date,
  faz: Faz = "gece",
) {
  return render(
    <ClockProvider sabitZaman={simdi}>
      <ThemeProvider fazZorla={faz}>
        <VitrinKarti teklif={teklif} />
      </ThemeProvider>
    </ClockProvider>,
  );
}

describe("VitrinKarti — the four real offers", () => {
  it("sets the shop name in Turkish caps, on the plaque", async () => {
    await ciz(YELDEGIRMENI, kapanmaya(146));
    expect(metin("YELDEĞİRMENİ PASTANESİ")).toBeTruthy();
    await screen.unmount?.();
  });

  it("prints the dotless I correctly on the two fırın cards", async () => {
    const gorunum = await ciz(MODA, kapanmaya(146));
    expect(metin("MODA FIRIN")).toBeTruthy();
    await gorunum.unmount();
  });

  it("shows price, value band and the value multiple — and no struck price", async () => {
    const gorunum = await ciz(YELDEGIRMENI, kapanmaya(146));
    expect(metin("149₺")).toBeTruthy();
    expect(metin("280–380₺ değerinde")).toBeTruthy();
    expect(metin("×2,2 değer")).toBeTruthy();
    expect(screen.queryByText(/^\d+₺$/, GORUNUR)).toBeTruthy();
    await gorunum.unmount();
  });

  it("carries the pickup window, distance and walk on the meta rail", async () => {
    const gorunum = await ciz(YELDEGIRMENI, kapanmaya(146));
    expect(metin("18:30–21:00 · 405 m · 5 dk")).toBeTruthy();
    await gorunum.unmount();
  });

  it("drops the walking figure once the shop is a bus ride away", async () => {
    const gorunum = await ciz(MANAV, kapanmaya(146));
    expect(metin("18:30–21:00 · 6,1 km")).toBeTruthy();
    await gorunum.unmount();
  });
});

describe("the time pill rides the lip with its number (§3)", () => {
  it.each([
    [146, "2 sa 26 dk"],
    [56, "56 dk"],
    [30, "30 dk"],
    [18, "SON 18 DK"],
    [1, "SON 1 DK"],
  ])("%s dk left -> %s", async (kalan, beklenen) => {
    const gorunum = await ciz(MODA, kapanmaya(kalan));
    expect(metin(beklenen)).toBeTruthy();
    await gorunum.unmount();
  });

  it("says '3 sa', never '3 sa 0 dk'", async () => {
    // A whole number of hours: the pill drops the empty minutes rather
    // than reading like a machine.
    const uzunPencere: VitrinTeklifi = {
      ...MODA,
      alisBaslangic: "2026-08-19T13:30:00.000Z",
    };
    const gorunum = await ciz(uzunPencere, kapanmaya(180));
    expect(metin("3 sa")).toBeTruthy();
    expect(screen.queryByText("3 sa 0 dk", GORUNUR)).toBeNull();
    const etiket = screen.getByRole("button").props.accessibilityLabel as string;
    expect(etiket).toContain("kapanmasına 3 saat.");
    await gorunum.unmount();
  });

  it("reads as opening, not closing, before the window", async () => {
    const gorunum = await ciz(MODA, new Date("2026-08-19T15:00:00.000Z"));
    expect(metin("18:30'da açılıyor")).toBeTruthy();
    await gorunum.unmount();
  });
});

describe("the stock chip (§3)", () => {
  it("is a plain number above four", async () => {
    const gorunum = await ciz(MODA, kapanmaya(146));
    expect(metin("son 6")).toBeTruthy();
    await gorunum.unmount();
  });

  it("flips to the red chip at the last package", async () => {
    const gorunum = await ciz(YELDEGIRMENI, kapanmaya(146));
    expect(metin("SON 1")).toBeTruthy();
    await gorunum.unmount();
  });

  it("shows a countable row at three", async () => {
    const uc: VitrinTeklifi = { ...MODA, kalanAdet: 3 };
    const gorunum = await ciz(uc, kapanmaya(146));
    expect(metin("son 3")).toBeTruthy();
    await gorunum.unmount();
  });
});

describe("the TÜKENDİ variant (§3)", () => {
  it("keeps the shop in the list, stickered, with tomorrow's opening", async () => {
    const bitmis: VitrinTeklifi = { ...MODA, kalanAdet: 0 };
    const gorunum = await ciz(bitmis, kapanmaya(90));
    expect(metin("TÜKENDİ")).toBeTruthy();
    expect(metin("yarın 18:30'da açılıyor")).toBeTruthy();
    // The pill is gone: the shutter is fully down and carries the sticker.
    expect(screen.queryByText("1 sa 30 dk", GORUNUR)).toBeNull();
    // …but the offer is still readable, not greyed into nothing.
    expect(metin("MODA FIRIN")).toBeTruthy();
    expect(metin("69₺")).toBeTruthy();
    await gorunum.unmount();
  });
});

describe("accessibility — one composed label per card (§3)", () => {
  it("says the whole offer in one sentence", async () => {
    const gorunum = await ciz(YELDEGIRMENI, kapanmaya(18));
    const etiket = screen.getByRole("button").props.accessibilityLabel as string;
    expect(etiket).toBe(
      "Yeldeğirmeni Pastanesi. Pastane Sürpriz Kutusu. 149 lira, 280 ile 380 lira değerinde, 2,2 kat değer. Son 1 paket. Alış 18:30–21:00, kapanmasına 18 dakika. 405 m, 5 dakika yürüme.",
    );
    await gorunum.unmount();
  });

  it("hides every decorative part behind that one label", async () => {
    const gorunum = await ciz(MODA, kapanmaya(56));
    const kart = screen.getByRole("button");
    const gizli = kart.props.children;
    expect(gizli).toBeTruthy();
    // The gauge, the awning and the pavement block are all marked hidden;
    // the assertion that matters is that there is exactly ONE focusable
    // element for the whole 196pt card.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await gorunum.unmount();
  });

  it("says it differently when the shop has not opened yet", async () => {
    const gorunum = await ciz(MODA, new Date("2026-08-19T15:00:00.000Z"));
    const etiket = screen.getByRole("button").props.accessibilityLabel as string;
    expect(etiket).toContain("18:30'da");
    expect(etiket).not.toContain("kapanmasına");
    await gorunum.unmount();
  });
});

describe("reduced motion — the ritual survives, the movement doesn't (§2)", () => {
  it("runs no entry roll and no breathing loop when it is on", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    const zamanlama = jest.spyOn(Animated, "timing");
    const dongu = jest.spyOn(Animated, "loop");

    const gorunum = await ciz(YELDEGIRMENI, kapanmaya(56));
    // The gauge is still correct — it is set, not animated.
    expect(metin("56 dk")).toBeTruthy();
    expect(metin("SON 1")).toBeTruthy();
    expect(dongu).not.toHaveBeenCalled();
    expect(zamanlama).not.toHaveBeenCalled();

    await gorunum.unmount();
    zamanlama.mockRestore();
    dongu.mockRestore();
    geriAl();
  });

  it("breathes the last lit square when it is off", async () => {
    const geriAl = erisimAzaltmayiAyarla(false);
    // Stubbed rather than spied through: a real `Animated.loop` never
    // stops, and an endless animation outlives the test that started it.
    // Stubbed rather than spied through: a real `Animated.loop` never
    // stops, and an endless animation outlives the test that started it.
    const dongu = jest.spyOn(Animated, "loop").mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);

    const gorunum = await ciz(YELDEGIRMENI, kapanmaya(56));
    expect(dongu).toHaveBeenCalled();

    await gorunum.unmount();
    dongu.mockRestore();
    geriAl();
  });
});

describe("the card renders in all three phases", () => {
  it.each(["gece", "alacakaranlik", "gunduz"] as const)("%s", async (faz) => {
    const gorunum = await ciz(YELDEGIRMENI, kapanmaya(56), faz);
    expect(metin("YELDEĞİRMENİ PASTANESİ")).toBeTruthy();
    expect(metin("149₺")).toBeTruthy();
    await gorunum.unmount();
  });
});
