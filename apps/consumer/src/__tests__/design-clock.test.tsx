import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  ClockProvider,
  dakikaKovasi,
  useDakikaKovasi,
  useSaniyeTiki,
  useSimdi,
} from "../design/saat";

/**
 * ClockProvider — spec §2 rule 3 (one shared clock for the whole list)
 * and §1.3 (the shutter snaps on a 60s tick and never creeps).
 */

function DakikaProbu() {
  const kova = useDakikaKovasi();
  const simdi = useSimdi();
  return (
    <>
      <Text testID="kova">{String(kova)}</Text>
      <Text testID="simdi">{simdi.toISOString()}</Text>
    </>
  );
}

function SaniyeProbu() {
  const ms = useSaniyeTiki();
  return <Text testID="saniye">{String(ms)}</Text>;
}

const T0 = new Date("2026-08-19T15:34:37.400Z");

describe("the 60s minute bucket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("floors the wall clock to the minute", async () => {
    await render(
      <ClockProvider>
        <DakikaProbu />
      </ClockProvider>,
    );
    expect(screen.getByTestId("kova").props.children).toBe(
      String(dakikaKovasi(T0.getTime())),
    );
    expect(screen.getByTestId("simdi").props.children).toBe(
      "2026-08-19T15:34:00.000Z",
    );
  });

  it("does not move within the minute, and flips exactly on the boundary", async () => {
    await render(
      <ClockProvider>
        <DakikaProbu />
      </ClockProvider>,
    );
    const baslangic = screen.getByTestId("kova").props.children;

    // 22.5s later — still 15:34.
    await act(async () => {
      jest.advanceTimersByTime(22_500);
    });
    expect(screen.getByTestId("kova").props.children).toBe(baslangic);

    // …and 100ms after that, the minute turns.
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByTestId("kova").props.children).toBe(
      String(dakikaKovasi(T0.getTime()) + 60_000),
    );
  });

  it("re-aligns to the wall-clock boundary rather than drifting", async () => {
    await render(
      <ClockProvider>
        <DakikaProbu />
      </ClockProvider>,
    );
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
    }
    expect(screen.getByTestId("simdi").props.children).toBe(
      "2026-08-19T15:39:00.000Z",
    );
  });
});

describe("the opt-in 1Hz rail", () => {
  let araVer: jest.SpyInstance;
  let araTemizle: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    araVer = jest.spyOn(global, "setInterval");
    araTemizle = jest.spyOn(global, "clearInterval");
  });
  afterEach(() => {
    araVer.mockRestore();
    araTemizle.mockRestore();
    jest.useRealTimers();
  });

  it("starts no interval at all until something subscribes", async () => {
    await render(
      <ClockProvider>
        <DakikaProbu />
      </ClockProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(araVer).not.toHaveBeenCalled();
  });

  it("ticks every second while a subscriber is mounted, and stops after it leaves", async () => {
    const gorunum = await render(
      <ClockProvider>
        <DakikaProbu />
        <SaniyeProbu />
      </ClockProvider>,
    );
    expect(araVer).toHaveBeenCalledTimes(1);
    expect(araVer.mock.calls[0]?.[1]).toBe(1_000);

    const ilk = Number(screen.getByTestId("saniye").props.children);
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    const ikinci = Number(screen.getByTestId("saniye").props.children);
    expect(ikinci - ilk).toBe(1_000);

    // The minute bucket is untouched by the second rail.
    expect(screen.getByTestId("kova").props.children).toBe(
      String(dakikaKovasi(T0.getTime())),
    );

    await gorunum.unmount();
    expect(araTemizle).toHaveBeenCalled();
  });

  it("runs ONE interval for many subscribers", async () => {
    await render(
      <ClockProvider>
        <SaniyeProbu />
        <SaniyeProbu />
        <SaniyeProbu />
      </ClockProvider>,
    );
    expect(araVer).toHaveBeenCalledTimes(1);
  });
});

describe("a pinned clock", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("holds its instant and schedules nothing", async () => {
    const sabit = new Date("2026-08-19T18:12:45.000Z");
    const araVer = jest.spyOn(global, "setInterval");
    await render(
      <ClockProvider sabitZaman={sabit}>
        <DakikaProbu />
        <SaniyeProbu />
      </ClockProvider>,
    );
    expect(screen.getByTestId("simdi").props.children).toBe(
      "2026-08-19T18:12:00.000Z",
    );
    expect(screen.getByTestId("saniye").props.children).toBe(String(sabit.getTime()));

    await act(async () => {
      jest.advanceTimersByTime(3_600_000);
    });
    expect(screen.getByTestId("simdi").props.children).toBe(
      "2026-08-19T18:12:00.000Z",
    );
    expect(araVer).not.toHaveBeenCalled();
    araVer.mockRestore();
  });
});

describe("the single-clock rule", () => {
  it("refuses to read a clock that isn't provided", async () => {
    const sessiz = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<DakikaProbu />)).rejects.toThrow(/ClockProvider/);
    sessiz.mockRestore();
  });
});
