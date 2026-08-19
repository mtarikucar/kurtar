import { render, screen } from "@testing-library/react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { SeninSokagin } from "../components/sokak/SeninSokagin";
import {
  ayGenisligiDevamli,
  SOKAK_DEVAM_DUKKAN_SAYISI,
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
        expect(svgler[0]!.props.width).toBe(ayGenisligiDevamli(adet));

        const yollar = dugumleriTopla(agac, "RNSVGPath");
        // One scalloped awning per REAL rescue only — a placeholder
        // frontage has no awning, because it is not a shop yet.
        expect(yollar).toHaveLength(adet);

        const dikdortgenler = dugumleriTopla(agac, "RNSVGRect");
        // The pavement line + one lit window per rescue + the fixed
        // continuation, regardless of how many rescues came before it.
        expect(dikdortgenler).toHaveLength(1 + adet + SOKAK_DEVAM_DUKKAN_SAYISI);

        // The continuation frontages stand immediately after the last
        // real one, in slot order, sharing the same closed-shutter fill
        // (proving they are copies of one shape, not per-shop nodes).
        const devamKutulari = dikdortgenler.slice(1 + adet);
        expect(devamKutulari).toHaveLength(SOKAK_DEVAM_DUKKAN_SAYISI);
        const renkler = new Set(devamKutulari.map((k) => JSON.stringify(k.props.fill)));
        expect(renkler.size).toBe(1);
      },
    );

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
      expect(haziranSvg.props.width).toBe(58); // ayGenisligi(2) = 2*26 + 1*6
      // August (the growing edge): 1 rescue + the fixed continuation.
      expect(agustosSvg.props.width).toBe(ayGenisligiDevamli(1));

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
