import { render, screen } from "@testing-library/react-native";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { SeninSokagin } from "../components/sokak/SeninSokagin";
import type { KurtarmaKaydi } from "../components/sokak/sokak-hesap";
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
});
