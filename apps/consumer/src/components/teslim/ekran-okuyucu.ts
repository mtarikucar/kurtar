import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether VoiceOver/TalkBack is running — SUBSCRIBED, not read once, for
 * the same reason `useReduceMotion()` is: somebody who turns a screen
 * reader on while the app is backgrounded is exactly the person who must
 * not come back to a gesture-only screen.
 *
 * The redeem screen replaces its drag outright when this is true (spec
 * §4.5: "a gesture is never the only path"). `false` until the platform
 * answers, because the drag is the path that works in every mode and the
 * substitution is what needs proof, not the default.
 */
export function useEkranOkuyucu(): boolean {
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    let canli = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((deger) => {
      if (canli) setAcik(deger);
    });
    const abone = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      (deger: boolean) => setAcik(deger),
    );
    return () => {
      canli = false;
      abone.remove();
    };
  }, []);

  return acik;
}
