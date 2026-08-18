import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { typeScale } from "@kurtar/ui-tokens";
import { formatClockWithSeconds } from "../lib/format";

interface LiveClockProps {
  color: string;
  size?: number;
}

/**
 * The redeem screen's proof-of-liveness clock — ticks every second off the
 * device's own clock, no network dependency. This is deliberately NOT a
 * still timestamp: a screenshot of a still clock is indistinguishable from
 * a live screen, but a screenshot of a TICKING clock freezes, which is
 * exactly the trust signal store staff are shown to check for.
 */
export function LiveClock({ color, size = 56 }: LiveClockProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text
      style={[styles.clock, { color, fontSize: size }]}
      accessibilityLabel={t("redeem.liveClockAccessibilityLabel", {
        time: formatClockWithSeconds(now),
      })}
    >
      {formatClockWithSeconds(now)}
    </Text>
  );
}

const styles = StyleSheet.create({
  clock: {
    fontWeight: typeScale.display.weight,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
});
