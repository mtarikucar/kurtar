import { useEffect, useState } from "react";
import { createClient } from "@kurtar/api-client";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";

// Placeholder wiring only — Task 10 owns building out the real merchant
// panel (auth flow, offer/store management, settlements) on top of this.
// See docs/frontend-contract.md for the client usage guide and the auth
// flow this app should implement (merchant email+password, cookie
// transport).
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4750";

// A real app persists this in React state/context and updates it from
// `onTokensIssued` — this placeholder never logs in, so it stays null.
let accessToken: string | null = null;

const client = createClient({
  baseUrl: apiBaseUrl,
  transport: "cookie",
  getAccessToken: () => accessToken,
  onTokensIssued: (tokens) => {
    accessToken = tokens.accessToken;
  },
});

type HealthState =
  | { status: "loading" }
  | { status: "ok"; service: string }
  | { status: "error"; message: string };

export default function App() {
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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.lg,
        backgroundColor: colors.neutral[50],
        color: colors.neutral[900],
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: typeScale.display.size,
          color: colors.primary[500],
          margin: 0,
        }}
      >
        kurtar işletme
      </h1>
      <p style={{ fontSize: typeScale.body.size, margin: 0 }}>
        {health.status === "loading" && "Sunucu durumu kontrol ediliyor…"}
        {health.status === "ok" && `Bağlantı OK — ${health.service}`}
        {health.status === "error" && `Bağlantı hatası: ${health.message}`}
      </p>
    </main>
  );
}
