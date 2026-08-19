import { useEffect } from "react";
import { Platform } from "react-native";
import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

/**
 * The redeem screen's two device concessions (spec §4.5).
 *
 * The customer holds the phone up in front of a stranger who has three
 * seconds and bad lighting, so:
 *  • screen brightness ramps to 1.0, and is RESTORED on unmount — the
 *    app borrows the screen, it does not keep it;
 *  • auto-lock is disabled, because a phone that sleeps while a baker is
 *    reading a code off it is the one failure that makes the customer
 *    look like they are the problem.
 *
 * Both are app-scoped, not system-scoped: `setBrightnessAsync` changes
 * only this app's window and needs no permission, unlike
 * `setSystemBrightnessAsync`, which on Android needs WRITE_SETTINGS and
 * would leave the device changed after the app is closed. Nothing here is
 * worth a permission prompt at a till.
 *
 * Every call is best-effort. A device that refuses (a simulator, web, an
 * OEM that blocks it) must never break the one screen that has to work.
 */
const AYIK_ETIKETI = "kurtar-kepenk";

export const DESTEKLENIYOR = Platform.OS === "ios" || Platform.OS === "android";

export async function parlaklikYukselt(): Promise<number | null> {
  if (!DESTEKLENIYOR) return null;
  try {
    const onceki = await Brightness.getBrightnessAsync();
    await Brightness.setBrightnessAsync(1);
    return onceki;
  } catch {
    return null;
  }
}

export async function parlaklikGeriVer(onceki: number | null): Promise<void> {
  if (!DESTEKLENIYOR) return;
  try {
    if (onceki === null) await Brightness.restoreSystemBrightnessAsync();
    else await Brightness.setBrightnessAsync(onceki);
  } catch {
    // Best-effort — see the doc comment.
  }
}

/**
 * Mounted by the redeem screen and by nothing else, so no other screen
 * pays for either concession. The restore runs on unmount, including the
 * unmount that happens when the user backs out mid-handover.
 */
export function useTezgahModu(etkin: boolean): void {
  useEffect(() => {
    if (!etkin) return;
    let canli = true;
    let onceki: number | null = null;

    void parlaklikYukselt().then((deger) => {
      if (canli) onceki = deger;
      // The screen was unmounted while the platform was still answering:
      // put the brightness straight back rather than leaving it pinned.
      else void parlaklikGeriVer(deger);
    });
    void activateKeepAwakeAsync(AYIK_ETIKETI).catch(() => undefined);

    return () => {
      canli = false;
      void parlaklikGeriVer(onceki);
      void deactivateKeepAwake(AYIK_ETIKETI).catch(() => undefined);
    };
  }, [etkin]);
}
