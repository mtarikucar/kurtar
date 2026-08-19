import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react-native";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import type { Faz } from "../design/tokens";
import { createTestQueryClient } from "./render";

/**
 * Track C's screens read `usePalet()`/`useSimdi()` (design/theme.tsx,
 * design/saat.tsx), which throw without a `<ThemeProvider>`/
 * `<ClockProvider>` ancestor — the app's root layout supplies both in
 * production (src/app/_layout.tsx), but a screen test renders in
 * isolation. A new file rather than a change to test-utils/render.tsx:
 * that wrapper is shared by every screen test in the app (including the
 * other two tracks' in-flight work), and most of them do NOT touch the
 * design system.
 */
export async function renderWithPanelProviders(
  ui: ReactElement,
  options?: RenderOptions & {
    queryClient?: QueryClient;
    sabitZaman?: Date;
    faz?: Faz;
  },
) {
  const { queryClient, sabitZaman: sabitZamanOpt, faz: fazOpt, ...renderOptions } = options ?? {};
  const client = queryClient ?? createTestQueryClient();
  const sabitZaman = sabitZamanOpt ?? new Date("2026-08-19T18:00:00.000Z");
  const faz = fazOpt ?? "gece";

  const renderResult = await render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ClockProvider sabitZaman={sabitZaman}>
          <ThemeProvider fazZorla={faz}>{children as never}</ThemeProvider>
        </ClockProvider>
      </QueryClientProvider>
    ),
    ...renderOptions,
  });
  return { ...renderResult, queryClient: client };
}
