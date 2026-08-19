import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react-native";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import type { Faz } from "../design/tokens";
import { createTestQueryClient } from "./render";
import "../i18n";

/**
 * Renders a screen inside the same three providers the real app mounts:
 * the query client, the ONE app clock, and the palette.
 *
 * `sabitZaman` pins the clock, which also means the 1Hz rail creates no
 * interval at all (see saat.tsx) — a screen test that does not care about
 * the seconds ticking should always pass it, so nothing is left running
 * between tests.
 */
export async function ekraniCiz(
  ui: React.ReactElement,
  secenekler?: RenderOptions & {
    queryClient?: QueryClient;
    sabitZaman?: Date;
    faz?: Faz;
  },
) {
  const istemci = secenekler?.queryClient ?? createTestQueryClient();
  const sonuc = await render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={istemci}>
        <ClockProvider sabitZaman={secenekler?.sabitZaman}>
          <ThemeProvider fazZorla={secenekler?.faz ?? "gece"}>
            {children as never}
          </ThemeProvider>
        </ClockProvider>
      </QueryClientProvider>
    ),
    ...secenekler,
  });
  return { ...sonuc, queryClient: istemci };
}
