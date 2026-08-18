import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, typeScale } from "@kurtar/ui-tokens";
import { formatRemaining, formatClockTime } from "../lib/format";

interface PickupCountdownProps {
  pickupStartAt: string;
}

/** "Teslim alma: 18:30 · 2 sa 14 dk" style live countdown on an active
 * order row — ticks every second so it stays honest as time passes,
 * without needing a network round-trip. [M5 fix] Renders via
 * `formatRemaining` (minutes -> hours+minutes -> days+hours), not the old
 * fixed mm:ss `formatCountdown` — a pickup hours away used to print e.g.
 * "420:00" right next to its own "18:30" absolute time. */
export function PickupCountdown({ pickupStartAt }: PickupCountdownProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const target = new Date(pickupStartAt).getTime();
  const remaining = target - now;

  return (
    <Text style={styles.text}>
      {t("orders.pickupWindow")}: {formatClockTime(pickupStartAt)}
      {remaining > 0 ? ` · ${formatRemaining(remaining)}` : ""}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: typeScale.caption.size,
    color: colors.neutral[600],
    fontVariant: ["tabular-nums"],
  },
});
