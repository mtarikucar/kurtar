import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";
import { Chip } from "./Chip";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

export type CategoryFilter = "MEAL" | "BAKERY" | "GROCERY" | "PRODUCE" | "OTHER";
export type DietFilter = "VEGETARIAN" | "VEGAN" | "GLUTEN_FREE" | "LACTOSE_FREE";
/** "TONIGHT" maps to `pickupBefore` = end of today (Istanbul-local) — the
 * only pickup-time shape `GET /discovery/offers` actually supports
 * (`pickupAfter`/`pickupBefore` bound the window's start/end, there is no
 * "already open now" param) that's still a meaningful, honest filter for
 * this domain (same-day-only offers). */
export type PickupTimeFilter = "ALL" | "TONIGHT";

export interface DiscoveryFilterState {
  category: CategoryFilter | null;
  diet: DietFilter[];
  radiusM: number;
  pickupTime: PickupTimeFilter;
}

const CATEGORIES: CategoryFilter[] = ["MEAL", "BAKERY", "GROCERY", "PRODUCE", "OTHER"];
const DIETS: DietFilter[] = ["VEGETARIAN", "VEGAN", "GLUTEN_FREE", "LACTOSE_FREE"];
const RADII_M = [1000, 3000, 5000, 10000];

interface FilterSheetProps {
  visible: boolean;
  value: DiscoveryFilterState;
  onApply: (next: DiscoveryFilterState) => void;
  onClose: () => void;
}

export function FilterSheet({ visible, value, onApply, onClose }: FilterSheetProps) {
  const { t } = useTranslation();

  const toggleDiet = (diet: DietFilter) => {
    const next = value.diet.includes(diet)
      ? value.diet.filter((d) => d !== diet)
      : [...value.diet, diet];
    onApply({ ...value, diet: next });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("discover.filters.title")}</Text>
            <IconButton
              name="close"
              accessibilityLabel={t("common.close")}
              onPress={onClose}
            />
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.sectionLabel}>{t("discover.filters.category")}</Text>
            <View style={styles.chipRow}>
              <Chip
                label={t("discover.filters.allCategories")}
                selected={value.category === null}
                onPress={() => onApply({ ...value, category: null })}
              />
              {CATEGORIES.map((category) => (
                <Chip
                  key={category}
                  label={t(`discover.categories.${category}`)}
                  selected={value.category === category}
                  onPress={() => onApply({ ...value, category })}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>{t("discover.filters.diet")}</Text>
            <View style={styles.chipRow}>
              {DIETS.map((diet) => (
                <Chip
                  key={diet}
                  label={t(`discover.diet.${diet}`)}
                  selected={value.diet.includes(diet)}
                  onPress={() => toggleDiet(diet)}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>{t("discover.filters.radius")}</Text>
            <View style={styles.chipRow}>
              {RADII_M.map((radius) => (
                <Chip
                  key={radius}
                  label={radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
                  selected={value.radiusM === radius}
                  onPress={() => onApply({ ...value, radiusM: radius })}
                />
              ))}
            </View>

            <Text style={styles.sectionLabel}>{t("discover.filters.pickupTime")}</Text>
            <View style={styles.chipRow}>
              {(["ALL", "TONIGHT"] as PickupTimeFilter[]).map((pt) => (
                <Chip
                  key={pt}
                  label={t(`discover.filters.pickupTime${pt === "ALL" ? "All" : "Tonight"}`)}
                  selected={value.pickupTime === pt}
                  onPress={() => onApply({ ...value, pickupTime: pt })}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label={t("discover.filters.reset")}
              variant="secondary"
              onPress={() =>
                onApply({
                  category: null,
                  diet: [],
                  radiusM: 3000,
                  pickupTime: "ALL",
                })
              }
              style={styles.footerButton}
            />
            <Button
              label={t("discover.filters.apply")}
              onPress={onClose}
              style={styles.footerButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  title: {
    fontSize: typeScale.h2.size,
    fontWeight: typeScale.h2.weight,
    color: colors.neutral[900],
  },
  body: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: typeScale.label.size,
    fontWeight: typeScale.label.weight,
    color: colors.neutral[600],
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  footerButton: {
    flex: 1,
  },
});
