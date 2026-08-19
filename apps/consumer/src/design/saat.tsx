import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * ClockProvider — spec §2 engineering rule 3: ONE shared clock for the
 * whole list. Every gauge in a FlashList window derives from a single
 * minute bucket ticked here; never a timer per card.
 *
 * Two rails, deliberately separate:
 *   • `useDakikaKovasi()` — a 60s bucket. The shutter snaps on it and
 *     never creeps (spec §1.3): a continuously sliding gauge is anxiety on
 *     a screen you are holding while walking, and it burns battery for a
 *     change nobody can perceive within a second.
 *   • `useSaniyeTiki()` — an OPT-IN 1Hz tick, mounted only by the redeem
 *     screen. The interval does not exist until something subscribes, and
 *     stops the moment the last subscriber unmounts.
 */

const DAKIKA_MS = 60_000;
const SANIYE_MS = 1_000;

export function dakikaKovasi(ms: number): number {
  return Math.floor(ms / DAKIKA_MS) * DAKIKA_MS;
}

type Dinleyici = (ms: number) => void;

interface SaatDegeri {
  /** Epoch ms floored to the minute. Changes at most once a minute. */
  readonly kova: number;
  /** Subscribe to the 1Hz rail; returns an unsubscribe. */
  readonly saniyeAbone: (dinleyici: Dinleyici) => () => void;
  /** Current instant — the fixed one under `sabitZaman`. */
  readonly simdiMs: () => number;
  /** True when the clock is pinned (tests, and the review screen's six
   * simulated times). */
  readonly sabit: boolean;
}

const SaatContext = createContext<SaatDegeri | null>(null);

export function ClockProvider({
  children,
  sabitZaman,
}: {
  children: ReactNode;
  /** Pins the whole clock. The review screen mounts one provider per
   * simulated time; tests use it to render a deterministic frame. */
  sabitZaman?: Date;
}) {
  const sabitMs = sabitZaman?.getTime();
  const sabit = sabitMs !== undefined;

  const [kova, setKova] = useState(() =>
    dakikaKovasi(sabitMs ?? Date.now()),
  );

  useEffect(() => {
    if (sabitMs !== undefined) {
      setKova(dakikaKovasi(sabitMs));
      return;
    }
    // A self-rescheduling timeout rather than a bare setInterval: it
    // re-aligns to the wall-clock minute boundary on every tick, so the
    // bucket flips WHEN the minute flips (and cannot drift after the
    // device sleeps), which is what makes "56 dk" turn into "55 dk" at
    // the same moment on every card.
    let zamanlayici: ReturnType<typeof setTimeout>;
    const planla = () => {
      const simdi = Date.now();
      setKova(dakikaKovasi(simdi));
      zamanlayici = setTimeout(planla, DAKIKA_MS - (simdi % DAKIKA_MS));
    };
    planla();
    return () => clearTimeout(zamanlayici);
  }, [sabitMs]);

  const aboneler = useRef<Set<Dinleyici>>(new Set());
  const saniyeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const durdur = useCallback(() => {
    if (saniyeTimer.current !== null) {
      clearInterval(saniyeTimer.current);
      saniyeTimer.current = null;
    }
  }, []);

  const saniyeAbone = useCallback(
    (dinleyici: Dinleyici) => {
      if (sabitMs !== undefined) {
        dinleyici(sabitMs);
        return () => undefined;
      }
      aboneler.current.add(dinleyici);
      if (saniyeTimer.current === null) {
        saniyeTimer.current = setInterval(() => {
          const simdi = Date.now();
          for (const fn of aboneler.current) fn(simdi);
        }, SANIYE_MS);
      }
      return () => {
        aboneler.current.delete(dinleyici);
        if (aboneler.current.size === 0) durdur();
      };
    },
    [durdur, sabitMs],
  );

  useEffect(() => durdur, [durdur]);

  const deger = useMemo<SaatDegeri>(
    () => ({
      kova,
      saniyeAbone,
      simdiMs: () => sabitMs ?? Date.now(),
      sabit,
    }),
    [kova, saniyeAbone, sabit, sabitMs],
  );

  return <SaatContext.Provider value={deger}>{children}</SaatContext.Provider>;
}

function useSaat(): SaatDegeri {
  const deger = useContext(SaatContext);
  if (!deger) {
    throw new Error(
      "useSaat: bir <ClockProvider> içinde olmalı — tek saat kuralı (spec §2).",
    );
  }
  return deger;
}

/** The 60s bucket every offer gauge in the app reads. */
export function useDakikaKovasi(): number {
  return useSaat().kova;
}

/** The bucket as a Date, stable within the minute. */
export function useSimdi(): Date {
  const kova = useDakikaKovasi();
  return useMemo(() => new Date(kova), [kova]);
}

/**
 * The opt-in 1Hz rail. Mounting this hook is what starts the interval, so
 * nothing outside the redeem screen pays for it. The clock is proof, not
 * decoration: it keeps ticking under reduced motion (spec §4.5).
 */
export function useSaniyeTiki(): number {
  const { saniyeAbone, simdiMs } = useSaat();
  const [ms, setMs] = useState(() => simdiMs());
  useEffect(() => saniyeAbone(setMs), [saniyeAbone]);
  return ms;
}
