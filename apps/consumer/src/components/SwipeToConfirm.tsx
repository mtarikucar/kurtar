import { useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

interface SwipeToConfirmProps {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}

const THUMB_SIZE = 56;
const CONFIRM_THRESHOLD_RATIO = 0.72;

/**
 * The redeem screen's defining gesture. Built on plain PanResponder/
 * Animated (no gesture-handler/reanimated dependency) so it needs no extra
 * native setup beyond what Expo ships by default.
 *
 * Accessibility: a physical drag is genuinely hard for a screen-reader
 * user to perform reliably, so this is ALSO exposed as a plain
 * accessibilityRole="button" with a real activate action — VoiceOver/
 * TalkBack users double-tap to confirm exactly like any other button,
 * sighted users drag the thumb across the track. Both paths call the same
 * `onConfirm`.
 */
export function SwipeToConfirm({ label, onConfirm, disabled }: SwipeToConfirmProps) {
  const { t } = useTranslation();
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const confirmedRef = useRef(false);

  const maxTranslate = Math.max(trackWidth - THUMB_SIZE - 8, 1);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_evt, gesture) => {
          if (disabled || confirmedRef.current) return;
          const next = Math.min(Math.max(gesture.dx, 0), maxTranslate);
          translateX.setValue(next);
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (disabled || confirmedRef.current) return;
          const progress = maxTranslate > 0 ? gesture.dx / maxTranslate : 0;
          if (progress >= CONFIRM_THRESHOLD_RATIO) {
            confirmedRef.current = true;
            Animated.timing(translateX, {
              toValue: maxTranslate,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start(() => onConfirm());
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [disabled, maxTranslate, onConfirm, translateX],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const handleActivate = () => {
    if (disabled || confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm();
  };

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled]}
      onLayout={handleLayout}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("redeem.swipeAccessibilityHint")}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={handleActivate}
    >
      <Text style={styles.label} pointerEvents="none">
        {label}
      </Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.thumb, { transform: [{ translateX }] }]}
      >
        <Ionicons name="chevron-forward" size={26} color={colors.neutral[0]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE + 8,
    borderRadius: radii.full,
    backgroundColor: colors.primary[100],
    justifyContent: "center",
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  trackDisabled: {
    opacity: 0.5,
  },
  label: {
    position: "absolute",
    alignSelf: "center",
    fontSize: typeScale.bodyStrong.size,
    fontWeight: typeScale.bodyStrong.weight,
    color: colors.primary[700],
    paddingLeft: spacing["3xl"],
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
});
