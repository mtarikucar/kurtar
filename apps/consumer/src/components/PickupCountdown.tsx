import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, typeScale } from "@kurtar/ui-tokens";
import { formatCountdown, formatClockTime } from "../lib/format";

interface PickupCountdownProps {
  pickupStartAt: string;
}

/** "Teslim alma: 18:30 (2s 14dk sonra)" style live countdown on an active
 * order row — ticks every second so it stays honest as time passes,
 * without needing a network round-trip. */
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
      {remaining > 0 ? ` · ${formatCountdown(remaining)}` : ""}
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
