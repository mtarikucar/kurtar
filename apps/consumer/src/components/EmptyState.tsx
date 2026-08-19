import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { usePalet } from "../design/theme";
import { s, yazi } from "../design/tokens";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: ComponentProps<typeof Ionicons>["name"];
  title: string;
  body?: string;
  ctaLabel?: string;
  onPressCta?: () => void;
}

/**
 * An empty screen is an invitation to act, so every caller that HAS
 * somewhere to send the user passes a CTA — a state that explains and
 * then stops is the defect this component kept re-shipping.
 *
 * It draws its type on the STREET ground (`yaziAnaZemin`/`yaziSisZemin`),
 * because `Screen` paints the phase's asphalt under it and the card inks
 * do not survive there in every phase.
 *
 * Deliberately NOT the closed-shutter picture: that belongs to the street
 * itself (`kesif/BosSokak`, `teslim/DurumEkrani`), where "nothing is
 * open" is the actual fact. Here the fact is usually about the user — no
 * favourites yet, nothing typed, already rated — and drawing a shuttered
 * shopfront over it would say something untrue.
 */
export function EmptyState({
  icon = "leaf-outline",
  title,
  body,
  ctaLabel,
  onPressCta,
}: EmptyStateProps) {
  const palet = usePalet();
  return (
    <View style={styles.kap}>
      <Ionicons name={icon} size={36} color={palet.yaziSisZemin} />
      <Text style={[yazi.title, styles.baslik, { color: palet.yaziAnaZemin }]}>{title}</Text>
      {body ? (
        <Text style={[yazi.body, styles.govde, { color: palet.yaziSisZemin }]}>{body}</Text>
      ) : null}
      {ctaLabel && onPressCta ? (
        <View style={styles.cta}>
          <Button label={ctaLabel} onPress={onPressCta} varyant="ikincil" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: s.s8,
    gap: s.s2,
  },
  baslik: { textAlign: "center", marginTop: s.s2 },
  govde: { textAlign: "center" },
  cta: { marginTop: s.s4, alignSelf: "stretch" },
});
