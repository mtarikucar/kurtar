import { Archivo_400Regular } from "@expo-google-fonts/archivo/400Regular";
import { Archivo_500Medium } from "@expo-google-fonts/archivo/500Medium";
import { Archivo_600SemiBold } from "@expo-google-fonts/archivo/600SemiBold";
import { Archivo_700Bold } from "@expo-google-fonts/archivo/700Bold";
import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black/400Regular";
import { ChivoMono_500Medium } from "@expo-google-fonts/chivo-mono/500Medium";
import { ChivoMono_700Bold } from "@expo-google-fonts/chivo-mono/700Bold";
import { useFonts } from "expo-font";

/**
 * The seven files of the three families (spec §1.2). Imported per WEIGHT,
 * not from the package root: the root module `require()`s all eighteen
 * cuts of Archivo at import time, which would put eleven fonts nobody
 * asks for into the bundle.
 *
 * Keys are the `fontFamily` values the type scale (tokens.ts `yazi`) sets;
 * they are the same strings on iOS, Android and web.
 *
 * Coverage of ĞğŞşİıÇçÖöÜü is asserted over these exact TTFs in
 * design-fonts-glyph-coverage.test.ts — in CI, not at runtime, because a
 * width probe can be fooled and a Turkish user must never see tofu.
 */
export const UYGULAMA_FONTLARI = {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  ArchivoBlack_400Regular,
  ChivoMono_500Medium,
  ChivoMono_700Bold,
} as const;

/**
 * True once the app may render type. A LOAD FAILURE also returns true: the
 * fallback is the system face, and a blank app forever is a worse answer
 * than a plainly-set one (the CI test is what keeps a missing glyph from
 * ever reaching here).
 */
export function useUygulamaFontlari(): boolean {
  const [yuklendi, hata] = useFonts(UYGULAMA_FONTLARI);
  return yuklendi || hata !== null;
}
