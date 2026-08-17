import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, radii, spacing, typeScale } from "@kurtar/ui-tokens";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        placeholderTextColor={colors.neutral[400]}
        style={[styles.input, error && styles.inputError, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typeScale.label.size,
    fontWeight: typeScale.label.weight,
    color: colors.neutral[700],
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    fontSize: typeScale.body.size,
    color: colors.neutral[900],
    backgroundColor: colors.neutral[0],
  },
  inputError: {
    borderColor: colors.semantic.danger[500],
  },
  error: {
    fontSize: typeScale.caption.size,
    color: colors.semantic.danger[500],
  },
});
