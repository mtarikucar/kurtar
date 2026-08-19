import { useRef } from "react";

/**
 * Unique ids for SVG `<Defs>` (patterns, clip paths).
 *
 * On web, react-native-svg renders real DOM, so every card sharing the id
 * "oluk" would put a dozen identical `<pattern id="oluk">` nodes in one
 * document and every `url(#oluk)` would resolve to whichever came first.
 * They happen to be identical today (metals are phase-invariant), which is
 * the worst kind of bug: it works until someone makes one of them
 * different. React's own `useId` is not usable here — it produces ":r0:",
 * and a colon inside a fragment reference is not portable.
 */
let sayac = 0;

export function useSvgKimlik(onEk: string): string {
  const kimlik = useRef<string | null>(null);
  if (kimlik.current === null) {
    sayac += 1;
    kimlik.current = `${onEk}-${sayac}`;
  }
  return kimlik.current;
}
