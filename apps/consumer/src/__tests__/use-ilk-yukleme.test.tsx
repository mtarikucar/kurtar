import { act } from "@testing-library/react-native";
import { useIlkYuklemeKademesi } from "../components/kesif/use-ilk-yukleme";
import { erisimAzaltmayiAyarla } from "../test-utils/erisim";
import { renderHookWithProviders } from "../test-utils/render";

describe("useIlkYuklemeKademesi — the loading list's 40ms stagger", () => {
  let hareketiGeriAl: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    // The ladder only runs on an explicit "reduce motion is OFF"; without
    // pinning it, jest-expo's AccessibilityInfo mock leaves the answer at
    // `null` and nothing moves.
    hareketiGeriAl = erisimAzaltmayiAyarla(false);
  });
  afterEach(() => {
    hareketiGeriAl();
    jest.useRealTimers();
  });

  it("reveals nothing before hazir is true", async () => {
    const { result } = await renderHookWithProviders(() => useIlkYuklemeKademesi(5, false));
    expect(result.current).toBe(0);
  });

  it("reveals rows one at a time, 40ms apart, once hazir flips true", async () => {
    const { result, rerender } = await renderHookWithProviders(
      ({ hazir }: { hazir: boolean }) => useIlkYuklemeKademesi(3, hazir),
      { initialProps: { hazir: false } },
    );
    expect(result.current).toBe(0);

    await rerender({ hazir: true });
    expect(result.current).toBe(0);

    await act(() => jest.advanceTimersByTime(40));
    expect(result.current).toBe(1);

    await act(() => jest.advanceTimersByTime(40));
    expect(result.current).toBe(2);

    await act(() => jest.advanceTimersByTime(40));
    expect(result.current).toBe(3);
  });

  it("caps the stagger at 10 steps — the remainder appears together right after", async () => {
    const { result } = await renderHookWithProviders(() => useIlkYuklemeKademesi(25, true));

    await act(() => jest.advanceTimersByTime(10 * 40));
    expect(result.current).toBe(25);
  });

  it("does not replay the stagger on a later refetch — everything shows immediately", async () => {
    const { result, rerender } = await renderHookWithProviders(
      ({ satirSayisi }: { satirSayisi: number }) => useIlkYuklemeKademesi(satirSayisi, true),
      { initialProps: { satirSayisi: 3 } },
    );
    await act(() => jest.advanceTimersByTime(3 * 40));
    expect(result.current).toBe(3);

    // A refetch that changes the row count (e.g. a filter change) — no
    // stagger the second time, the new count is reflected at once.
    await rerender({ satirSayisi: 6 });
    expect(result.current).toBe(6);
  });
});

/**
 * FINDING #30. §2 Degradation reads "shutters render at their final
 * position; no entry roll, no stagger". Each card's own roll was already
 * suppressed, so a vestibular user got the half of the sentence nobody
 * implemented: silent shutters under rows still popping into the street
 * one at a time over ~400ms.
 */
describe("reduced motion — the street is already there (finding #30)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows every row the moment it is ready, with no timer to advance", async () => {
    const geriAl = erisimAzaltmayiAyarla(true);
    const { result } = await renderHookWithProviders(() => useIlkYuklemeKademesi(8, true));
    expect(result.current).toBe(8);
    geriAl();
  });

  it("still shows every row while the platform has not answered yet", async () => {
    // `useReduceMotion` reports `null` until the query resolves. Movement
    // needs an explicit yes; CONTENT does not — holding the rows back
    // would leave an empty list with no empty-state under it.
    const { result } = await renderHookWithProviders(() => useIlkYuklemeKademesi(8, true));
    expect(result.current).toBe(8);
  });
});
