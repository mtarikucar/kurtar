import { useEffect, useRef, useState } from "react";

/**
 * Staggers the FIRST reveal of the list once it loads (spec §4.8: "As
 * each shop's data arrives, its shutter rolls to its true height (220ms,
 * 40ms stagger)"). Progressively raises `gorunenSatir` from 0 up to
 * `satirSayisi`, 40ms apart, capped at `KADEME_USTU` steps so a long list
 * finishes staggering in well under half a second rather than growing
 * linearly with list length — past the cap the remainder appears
 * together right after the staggered head.
 *
 * Only the FIRST successful load staggers. A refetch (pull-to-refresh, a
 * filter change, the list simply re-rendering on the minute tick) shows
 * every row immediately — replaying the entry roll on cards that are
 * already sitting on screen would be noise, not information.
 */
const KADEME_MS = 40;
const KADEME_USTU = 10;

export function useIlkYuklemeKademesi(satirSayisi: number, hazir: boolean): number {
  const [gorunenSatir, setGorunenSatir] = useState(0);
  const oynatildi = useRef(false);

  useEffect(() => {
    if (!hazir) return;
    if (oynatildi.current) {
      setGorunenSatir(satirSayisi);
      return;
    }
    oynatildi.current = true;
    if (satirSayisi === 0) return;

    const sinir = Math.min(satirSayisi, KADEME_USTU);
    const zamanlayicilar: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= sinir; i += 1) {
      zamanlayicilar.push(setTimeout(() => setGorunenSatir(i), i * KADEME_MS));
    }
    if (sinir < satirSayisi) {
      zamanlayicilar.push(
        setTimeout(() => setGorunenSatir(satirSayisi), sinir * KADEME_MS),
      );
    }
    return () => {
      for (const zamanlayici of zamanlayicilar) clearTimeout(zamanlayici);
    };
  }, [hazir, satirSayisi]);

  return gorunenSatir;
}
