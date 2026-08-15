import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { createClient } from "@kurtar/api-client";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";

// Placeholder wiring only — Task 12 owns building out the real consumer
// app (phone-OTP auth, discovery, reservations, complaints) on top of
// this. See docs/frontend-contract.md for the client usage guide and the
// auth flow this app should implement (consumer phone-OTP, body
// transport — the refresh token belongs in SecureStore, not a plain
// module-level variable like this placeholder uses).
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4750";

let accessToken: string | null = null;
let refreshToken: string | null = null;

const client = createClient({
  baseUrl: apiBaseUrl,
  transport: "body",
  getAccessToken: () => accessToken,
  getRefreshToken: () => refreshToken,
  onTokensIssued: (tokens) => {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken ?? refreshToken;
  },
});

type HealthState =
  | { status: "loading" }
  | { status: "ok"; service: string }
  | { status: "error"; message: string };

export default function HomeScreen() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    client.health
      .check()
      // HealthController_getHealth has no declared OpenAPI response schema
      // (see docs/frontend-contract.md's "known OpenAPI contract gaps") —
      // this cast reads the real backend/src/modules/health/health.
      // controller.ts's HealthStatus shape by hand, at the APP layer, not
      // inside @kurtar/api-client itself.
      .then((result) => {
        if (cancelled) return;
        const body = result as { status?: string; service?: string };
        setHealth({ status: "ok", service: body.service ?? "kurtar-api" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setHealth({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>kurtar</Text>
        <Text style={styles.body}>
          {health.status === "loading" && "Sunucu durumu kontrol ediliyor…"}
          {health.status === "ok" && `Bağlantı OK — ${health.service}`}
          {health.status === "error" && `Bağlantı hatası: ${health.message}`}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing["2xl"],
  },
  title: {
    fontSize: typeScale.display.size,
    fontWeight: typeScale.display.weight,
    color: colors.primary[500],
  },
  body: {
    fontSize: typeScale.body.size,
    color: colors.neutral[900],
    textAlign: "center",
  },
});
