import { render, screen, act } from "@testing-library/react-native";
import { ThemeProvider } from "../design/theme";
import { ClockProvider } from "../design/saat";
import { TeslimSeli } from "../components/teslim/TeslimSeli";
import { m } from "../design/tokens";
import "../i18n";

/**
 * The handover flood has to END.
 *
 * It is the last thing a customer sees after paying, and it sits over the
 * order ticket and both of the screen's buttons on a phone whose brightness
 * this flow pins to 1.0 with auto-lock disabled. If it never unmounts there
 * is no way out of the app but force-quitting it.
 *
 * The defect this pins: `onBitti` was in the effect's dependency list while
 * the redeem screen passed it as an inline arrow AND re-rendered once a
 * second from its live clock. Every second the effect tore the sequence
 * down and started a new one, so the fade at the end was never reached and
 * the completion callback never fired.
 *
 * Note what this test must NOT do: pinning `ClockProvider` to a fixed
 * instant is exactly what hid the bug from every screenshot taken of this
 * screen — a pinned clock's per-second subscription fires once and returns
 * a no-op, so the re-render that triggers the defect never happens. The
 * re-render is therefore simulated here directly.
 */
async function seliCiz(onBitti: () => void) {
  return render(
    <ClockProvider>
      <ThemeProvider fazZorla="gece">
        <TeslimSeli
          dukkanAdi="Moda Fırın"
          paketAdi="Fırından Sürpriz Paket"
          saat="20:35"
          azaltHareket={false}
          onBitti={onBitti}
        />
      </ThemeProvider>
    </ClockProvider>,
  );
}

describe("TeslimSeli — the flood ends even on a screen that re-renders every second", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("reports completion once the whole sequence has run", async () => {
    const bitti = jest.fn();
    await seliCiz(bitti);
    expect(screen.getByTestId("teslim-seli")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(m.floodIn + m.floodHold + m.floodOut + 100);
    });
    expect(bitti).toHaveBeenCalledTimes(1);
  });

  it("still completes when the parent re-renders every second with a NEW callback identity", async () => {
    const bitti = jest.fn();
    const { rerender } = await seliCiz(bitti);

    const gecenSure = m.floodIn + m.floodHold + m.floodOut + 100;
    for (let saniye = 0; saniye * 1000 < gecenSure; saniye += 1) {
      // A fresh inline arrow every second — what redeem/[id].tsx passes.
      await act(async () => {
        rerender(
          <ClockProvider>
            <ThemeProvider fazZorla="gece">
              <TeslimSeli
                dukkanAdi="Moda Fırın"
                paketAdi="Fırından Sürpriz Paket"
                saat="20:35"
                azaltHareket={false}
                onBitti={() => bitti()}
              />
            </ThemeProvider>
          </ClockProvider>,
        );
        jest.advanceTimersByTime(1000);
      });
    }

    expect(bitti).toHaveBeenCalled();
  });

  it("also completes under reduced motion, where the flood is a held state rather than a ramp", async () => {
    const bitti = jest.fn();
    await render(
      <ClockProvider>
        <ThemeProvider fazZorla="gece">
          <TeslimSeli
            dukkanAdi="Moda Fırın"
            paketAdi={null}
            saat="20:35"
            azaltHareket
            onBitti={bitti}
          />
        </ThemeProvider>
      </ClockProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(m.floodIn + m.floodHold + m.floodOut + 100);
    });
    expect(bitti).toHaveBeenCalled();
  });
});
