import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, View } from "react-native";
import { fazHesapla, gunesOlaylari, VARSAYILAN_KONUM } from "./faz";
import { egri, YERLI_SURUCU } from "./motion";
import { useReduceMotion } from "./reduce-motion";
import { useDakikaKovasi } from "./saat";
import { m, PALETLER, type Faz, type Palet } from "./tokens";

/**
 * ThemeProvider — spec §1.1.
 *
 * The palette is swapped WHOLE on a phase change (three frozen objects at
 * module scope), never interpolated per property, so `StyleSheet.create`
 * keeps its static advantage inside a phase. The transition the user sees
 * is a 600ms linear cross-fade of ONE overlay View carrying the outgoing
 * ground colour — one animated node for the whole app, not one per
 * coloured property on every card in the list.
 */

interface TemaDegeri {
  readonly faz: Faz;
  readonly palet: Palet;
}

const TemaContext = createContext<TemaDegeri | null>(null);

const GUN_MS = 86_400_000;

export function ThemeProvider({
  children,
  konum = VARSAYILAN_KONUM,
  fazZorla,
}: {
  children: ReactNode;
  konum?: { readonly enlem: number; readonly boylam: number };
  /** Pins the phase. The review screen renders all three; nothing in the
   * shipping app passes it. */
  fazZorla?: Faz;
}) {
  const kova = useDakikaKovasi();
  const azaltHareket = useReduceMotion();

  // Sunset moves by ~1 minute a day, so it is computed once per local day
  // and not once per minute tick.
  const gunAnahtari = Math.floor(kova / GUN_MS);
  const olaylar = useMemo(
    () => gunesOlaylari(new Date(gunAnahtari * GUN_MS + GUN_MS / 2), konum.enlem, konum.boylam),
    [gunAnahtari, konum.enlem, konum.boylam],
  );

  const aktifFaz = fazZorla ?? fazHesapla(new Date(kova), olaylar);
  const palet = PALETLER[aktifFaz];

  const [gecenPalet, setGecenPalet] = useState<Palet | null>(null);
  const oncekiFaz = useRef<Faz>(aktifFaz);
  const opaklik = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (oncekiFaz.current === aktifFaz) return;
    const onceki = PALETLER[oncekiFaz.current];
    oncekiFaz.current = aktifFaz;
    // Reduced motion: the swap is discrete. The information (which phase
    // it is) is in the colours themselves, so nothing is lost.
    if (azaltHareket !== false) return;
    setGecenPalet(onceki);
    opaklik.setValue(1);
    Animated.timing(opaklik, {
      toValue: 0,
      duration: m.phase,
      easing: egri.phase,
      useNativeDriver: YERLI_SURUCU,
    }).start(() => setGecenPalet(null));
  }, [aktifFaz, azaltHareket, opaklik]);

  const deger = useMemo<TemaDegeri>(
    () => ({ faz: aktifFaz, palet }),
    [aktifFaz, palet],
  );

  return (
    <TemaContext.Provider value={deger}>
      <View style={[styles.kok, { backgroundColor: palet.bgAsfalt }]}>
        {children}
        {gecenPalet ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: gecenPalet.bgAsfalt, opacity: opaklik },
            ]}
          />
        ) : null}
      </View>
    </TemaContext.Provider>
  );
}

function useTemaDegeri(): TemaDegeri {
  const deger = useContext(TemaContext);
  if (!deger) {
    throw new Error("useTema: bir <ThemeProvider> içinde olmalı.");
  }
  return deger;
}

export function useTema(): TemaDegeri {
  return useTemaDegeri();
}

export function usePalet(): Palet {
  return useTemaDegeri().palet;
}

const styles = StyleSheet.create({
  kok: { flex: 1 },
});
