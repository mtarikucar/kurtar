"use client";

import { useEffect, useState } from "react";
import { createClient } from "@kurtar/api-client";
import { colors, spacing, typeScale } from "@kurtar/ui-tokens";

// Placeholder wiring only — Task 13 owns the real landing page (TR/EN SEO
// content, merchant acquisition funnel). See docs/frontend-contract.md.
// Deliberately a client-side check, not a Server Component fetch at
// request/build time: a server-side fetch here would make `next build`
// (and every server render) depend on the backend being reachable, which
// this placeholder should not require.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4750";

const client = createClient({
  baseUrl: apiBaseUrl,
  transport: "cookie",
  getAccessToken: () => null, // landing has no authenticated surface
});

type HealthState =
  | { status: "loading" }
  | { status: "ok"; service: string }
  | { status: "error"; message: string };

export default function Home() {
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
      }}
    >
      <h1 style={{ fontSize: typeScale.display.size, color: colors.primary[500], margin: 0 }}>kurtar</h1>
      <p style={{ fontSize: typeScale.body.size, margin: 0 }}>Gün sonu sürpriz paket pazaryeri</p>
      <p style={{ fontSize: typeScale.caption.size, color: colors.neutral[600], margin: 0 }}>
        {health.status === "loading" && "Sunucu durumu kontrol ediliyor…"}
        {health.status === "ok" && `Bağlantı OK — ${health.service}`}
        {health.status === "error" && `Bağlantı hatası: ${health.message}`}
      </p>
    </main>
  );
}
