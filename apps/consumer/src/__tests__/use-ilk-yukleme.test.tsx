import { act } from "@testing-library/react-native";
import { useIlkYuklemeKademesi } from "../components/kesif/use-ilk-yukleme";
import { renderHookWithProviders } from "../test-utils/render";

describe("useIlkYuklemeKademesi — the loading list's 40ms stagger", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
