import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Reduced motion — SUBSCRIBED, not read once (spec §2 Degradation). A
 * user who flips the switch in Settings while the app is backgrounded
 * comes back to a still-animating app otherwise, which is precisely the
 * user who cannot tolerate it.
 *
 * What it turns off is movement, never information: shutters still update
 * their position on the 60s tick (instantly), and the redeem clock is
 * exempt entirely — it is proof, not decoration.
 *
 * `null` means NOT YET KNOWN — the platform answers asynchronously, and
 * a hook that reported `false` in the meantime would start an entry roll
 * one frame before learning it was not allowed to. Every consumer treats
 * null as "no movement", and starts the entry roll on the first render
 * where the answer is actually `false`.
 */
export function useReduceMotion(): boolean | null {
  const [azalt, setAzalt] = useState<boolean | null>(null);

  useEffect(() => {
    let canli = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((deger) => {
      if (canli) setAzalt(deger);
    });
    const abone = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (deger: boolean) => setAzalt(deger),
    );
    return () => {
      canli = false;
      abone.remove();
    };
  }, []);

  return azalt;
}
