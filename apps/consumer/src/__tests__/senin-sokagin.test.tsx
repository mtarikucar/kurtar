import { render, screen } from "@testing-library/react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { SeninSokagin, SOKAK_OLCEGI } from "../components/sokak/SeninSokagin";
import {
  ayGenisligi,
  ayGenisligiDevamli,
  sokakYuksekligi,
  DUKKAN_TABAN_YUKSEKLIK,
  KAPALI_DUKKAN_YUKSEKLIGI,
  SOKAK_DEVAM_DUKKAN_SAYISI,
  SOKAK_SVG_YUKSEKLIGI,
  type KurtarmaKaydi,
} from "../components/sokak/sokak-hesap";
import "../i18n";

// The decorative <Svg> is `accessibilityElementsHidden` (mirrors the
// signature card's own convention), so text queries must opt into hidden
// elements exactly like vitrin-karti.test.tsx does.
const GORUNUR = { includeHiddenElements: true } as const;

async function ciz(
  kayitlar: readonly KurtarmaKaydi[],
  dukkanAdi?: (id: string) => string | null,
) {
  return render(
    <ClockProvider sabitZaman={new Date("2026-08-19T18:00:00.000Z")}>
      <ThemeProvider fazZorla="gece">
        <SeninSokagin kayitlar={kayitlar} dukkanAdi={dukkanAdi ?? (() => null)} />
      </ThemeProvider>
    </ClockProvider>,
  );
}

function kayit(reservationId: string, storeId: string, iso: string): KurtarmaKaydi {
  return { reservationId, storeId, redeemedAt: new Date(iso) };
}

/** react-native-svg's host tree under jest — `RNSVGSvgView`, `RNSVGRect`,
 * `RNSVGPath`, nested inside a `RNSVGGroup`. Walks the rendered JSON tree
 * (not the accessibility tree, which the whole `<Svg>` opts out of) so
 * the low-rescue-count tests can assert on the actual shapes drawn —
 * exactly how many closed, un-rescued frontages continue the street past
 * the one that is lit. */
type Dugum = ReactTestRendererJSON | string;

function dugumleriTopla(
  agac: Dugum | Dugum[] | null,
  tip: string,
  sonuc: ReactTestRendererJSON[] = [],
): ReactTestRendererJSON[] {
  if (agac === null || typeof agac === "string") return sonuc;
  const liste = Array.isArray(agac) ? agac : [agac];
  for (const dugum of liste) {
    if (typeof dugum === "string") continue;
    if (dugum.type === tip) sonuc.push(dugum);
    if (dugum.children) dugumleriTopla(dugum.children, tip, sonuc);
  }
  return sonuc;
}

/** The three things this drawing is MADE of, found by the testID each
 * carries: the terrace (one path, every façade), a rescued frontage, and
 * a shuttered one. Asserting on those rather than on a raw shape count is
 * what lets the storefront gain a door, a glazing bar or a fanlight
 * without a test having to be rewritten to permit it — while the counts
 * that carry meaning (how many shops are lit, how many are shut) stay
 * pinned exactly. */
function testIdIle(
  agac: Dugum | Dugum[] | null,
  testID: string,
  sonuc: ReactTestRendererJSON[] = [],
): ReactTestRendererJSON[] {
  if (agac === null || typeof agac === "string") return sonuc;
  const liste = Array.isArray(agac) ? agac : [agac];
  for (const dugum of liste) {
    if (typeof dugum === "string") continue;
    if (dugum.props?.testID === testID) sonuc.push(dugum);
    if (dugum.children) testIdIle(dugum.children, testID, sonuc);
  }
  return sonuc;
}

describe("SeninSokagin — the street", () => {
  it("renders one accessible month group per calendar month, oldest to newest", async () => {
    await ciz([
      kayit("r1", "moda-firin", "2026-06-05T18:00:00.000Z"),
      kayit("r2", "yeldegirmeni", "2026-08-05T18:00:00.000Z"),
    ]);

    expect(screen.getByText("Haziran 2026", GORUNUR)).toBeTruthy();
    expect(screen.getByText("Ağustos 2026", GORUNUR)).toBeTruthy();
  });

  it("composes one screen-reader label per month naming every shop rescued that month", async () => {
    await ciz(
      [
        kayit("r1", "moda-firin", "2026-08-01T18:00:00.000Z"),
        kayit("r2", "moda-firin", "2026-08-10T18:00:00.000Z"),
        kayit("r3", "yeldegirmeni", "2026-08-15T18:00:00.000Z"),
      ],
      (id) =>
        id === "moda-firin"
          ? "Moda Fırın"
          : id === "yeldegirmeni"
            ? "Yeldeğirmeni Pastanesi"
            : null,
    );

    // A screen reader landing on the month group gets the FULL content —
    // not "scroll right to see more of a canvas" (task brief).
    const grup = screen.getByLabelText(/Ağustos 2026:/, GORUNUR);
    expect(grup).toBeTruthy();
    expect(grup.props.accessibilityLabel).toContain("Moda Fırın, toplamda 2 kez");
    expect(grup.props.accessibilityLabel).toContain("Yeldeğirmeni Pastanesi");
  });

  it("still reports a count-only summary when names have not resolved yet", async () => {
    await ciz([kayit("r1", "moda-firin", "2026-08-01T18:00:00.000Z")]);
    const grup = screen.getByLabelText(/Ağustos 2026:/, GORUNUR);
    expect(grup.props.accessibilityLabel).toContain("1 kurtarma");
  });

  it("renders a dedicated empty state for a street with no rescues yet", async () => {
    await ciz([]);
    expect(screen.getByLabelText("Henüz bir kurtarman yok.", GORUNUR)).toBeTruthy();
  });

  // Review finding: at the seeded consumer's single rescue, the street was
  // one 26pt box alone under a month label — a stray element, not a
  // street. These pin the fix at exactly the counts the review named:
  // 0 (above), 1, 2 and 3 — never only the 17-rescue harness.
  describe("low rescue counts — the street must read as a street, not an orphan box", () => {
    it.each([1, 2, 3])(
      "at %i rescue(s), the lit storefront(s) are followed by %i closed, un-rescued frontages",
      async (adet) => {
        const kayitlar = Array.from({ length: adet }, (_, i) =>
          kayit(`r${i}`, `dukkan-${i}`, `2026-08-0${i + 1}T18:00:00.000Z`),
        );
        await ciz(kayitlar);

        const agac = screen.toJSON();
        const svgler = dugumleriTopla(agac, "RNSVGSvgView");
        // Exactly one month, so exactly one <Svg>.
        expect(svgler).toHaveLength(1);
        // The street is drawn in geometry units and SHOWN at SOKAK_OLCEGI
        // (at 1:1 it read as a progress bar). The viewBox is what carries
        // the geometry, so that is what the shop count has to agree with;
        // the rendered width is that same number, scaled.
        expect(svgler[0]!.props.vbWidth).toBe(ayGenisligiDevamli(adet));
        expect(svgler[0]!.props.width).toBe(ayGenisligiDevamli(adet) * SOKAK_OLCEGI);

        const aydinlik = testIdIle(agac, "sokak-dukkan");
        const kapali = testIdIle(agac, "sokak-kapali");
        expect(aydinlik).toHaveLength(adet);
        expect(kapali).toHaveLength(SOKAK_DEVAM_DUKKAN_SAYISI);

        // One scalloped awning — canopy plus its second stripe colour —
        // per REAL rescue only. A closed frontage has no awning at all,
        // because it is not a shop of yours yet.
        for (const dukkan of aydinlik) {
          expect(dugumleriTopla(dukkan, "RNSVGPath")).toHaveLength(2);
        }
        for (const kapaliDukkan of kapali) {
          expect(dugumleriTopla(kapaliDukkan, "RNSVGPath")).toHaveLength(0);
        }

        // Every closed frontage is a SHUT SHOP in the app's own shutter
        // language: corrugated steel from one shared <Pattern> (spec
        // §5.3 — never a <Rect> per slat), and the same one for all of
        // them, so no placeholder can look like a special case.
        const olukDolgular = new Set(
          kapali.map((k) => {
            const kepenk = dugumleriTopla(k, "RNSVGRect").find(
              (r) => (r.props.fill as { type?: number } | undefined)?.type === 1,
            );
            return (kepenk?.props.fill as { brushRef?: string } | undefined)?.brushRef;
          }),
        );
        expect(olukDolgular.size).toBe(1);
        expect([...olukDolgular][0]).toBeTruthy();

        // The terrace itself: ONE path for every façade on the block, with
        // ONE move-to in it. Adjoining buildings sharing party walls —
        // the detached blocks on a baseline this used to draw are what a
        // bar chart is made of, and no gap survives here to put them back.
        const teras = testIdIle(agac, "sokak-teras");
        expect(teras).toHaveLength(1);
        const yol = String(teras[0]!.props.d);
        expect(yol.match(/M/g)).toHaveLength(1);
        expect(yol.trim().endsWith("Z")).toBe(true);
        // It spans the whole street, ending flush with the last frontage.
        expect(yol).toContain(`L${ayGenisligiDevamli(adet)},`);
      },
    );

    it("reserves only the height the street actually stands to, not room for a regular it doesn't have", async () => {
      // The strip sits directly above the impact figures on the profile
      // screen: a one-rescue street reserving four storeys of empty sky
      // pushes real content off the first screen for the user who has
      // seen the least of the product.
      await ciz([kayit("r1", "dukkan-0", "2026-08-01T18:00:00.000Z")]);
      const svg = dugumleriTopla(screen.toJSON(), "RNSVGSvgView")[0]!;
      expect(svg.props.vbHeight).toBeLessThan(SOKAK_SVG_YUKSEKLIGI);
      expect(svg.props.vbHeight).toBeGreaterThanOrEqual(
        sokakYuksekligi(DUKKAN_TABAN_YUKSEKLIK),
      );
      expect(svg.props.height).toBe(svg.props.vbHeight * SOKAK_OLCEGI);
    });

    it("draws the empty street as the same shuttered terrace, at the same scale", async () => {
      // The empty state and the growing edge are the identical fact — a
      // shop you have not opened — so they are the identical drawing.
      // (It used to render at 1:1 while everything else was scaled.)
      await ciz([]);
      const svg = dugumleriTopla(screen.toJSON(), "RNSVGSvgView")[0]!;
      expect(svg.props.vbWidth).toBe(ayGenisligi(SOKAK_DEVAM_DUKKAN_SAYISI));
      expect(svg.props.width).toBe(
        ayGenisligi(SOKAK_DEVAM_DUKKAN_SAYISI) * SOKAK_OLCEGI,
      );
      expect(svg.props.vbHeight).toBe(sokakYuksekligi(KAPALI_DUKKAN_YUKSEKLIGI));
      expect(testIdIle(screen.toJSON(), "sokak-kapali")).toHaveLength(
        SOKAK_DEVAM_DUKKAN_SAYISI,
      );
      expect(testIdIle(screen.toJSON(), "sokak-dukkan")).toHaveLength(0);
    });

    it("does not lie: a continuation frontage is never counted in the month's rescue summary", async () => {
      await ciz([kayit("r1", "moda-firin", "2026-08-01T18:00:00.000Z")]);
      const grup = screen.getByLabelText(/Ağustos 2026:/, GORUNUR);
      // Exactly the one real rescue — never "4" (1 real + 3 placeholders).
      expect(grup.props.accessibilityLabel).toContain("1 kurtarma");
      expect(grup.props.accessibilityLabel).not.toMatch(/\b4\b/);
    });

    it("only the most recent month carries the continuation — earlier, settled months render exactly their own rescues", async () => {
      await ciz([
        kayit("r1", "moda-firin", "2026-06-05T18:00:00.000Z"),
        kayit("r2", "yeldegirmeni", "2026-06-12T18:00:00.000Z"),
        kayit("r3", "caferaga", "2026-08-05T18:00:00.000Z"),
      ]);

      const agac = screen.toJSON();
      const svgler = dugumleriTopla(agac, "RNSVGSvgView");
      expect(svgler).toHaveLength(2);
      const [haziranSvg, agustosSvg] = svgler as [ReactTestRendererJSON, ReactTestRendererJSON];

      // June (settled history): exactly its 2 rescues, no continuation.
      expect(haziranSvg.props.vbWidth).toBe(52); // ayGenisligi(2) = 2*26, adjoining
      // August (the growing edge): 1 rescue + the fixed continuation.
      expect(agustosSvg.props.vbWidth).toBe(ayGenisligiDevamli(1));

      const haziranEtiket = screen.getByLabelText(/Haziran 2026:/, GORUNUR);
      expect(haziranEtiket.props.accessibilityLabel).not.toContain(
        "Sokağın devamı henüz karanlık",
      );
      const agustosEtiket = screen.getByLabelText(/Ağustos 2026:/, GORUNUR);
      expect(agustosEtiket.props.accessibilityLabel).toContain(
        "Sokağın devamı henüz karanlık",
      );
    });
  });
});
