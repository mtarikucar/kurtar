import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, type RenderOptions } from "@testing-library/react-native";
import "../i18n";

/** A fresh, retry-disabled QueryClient per test — retries would make
 * error-path tests slow/flaky (real timers between attempts). */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function Wrapper({
  children,
  client,
}: {
  children: ReactNode;
  client: QueryClient;
}) {
  // `@tanstack/react-query` is npm-hoisted to the workspace ROOT
  // node_modules, so ITS OWN type declarations resolve "react" (and thus
  // `ReactNode`) against the root's `@types/react@18` — while this file
  // (nested under apps/consumer) resolves the SAME import against the
  // locally-pinned `@types/react@19`, whose `ReactNode` union is a
  // (harmless) superset (adds `bigint`, a real React 19 typing change).
  // The two nominally differ even though every value that matters is
  // identical at runtime; this cast is scoped to exactly that mismatch; no
  // API/business type is involved.
  return (
    <QueryClientProvider client={client}>
      {children as never}
    </QueryClientProvider>
  );
}

/** `@testing-library/react-native` v14's `render`/`renderHook` are ASYNC
 * (they `await act(...)` internally, for React 19's concurrent rendering) —
 * MUST be awaited, or `screen`/`result` observe a render that hasn't
 * committed yet ("`render` function has not been called"). These wrappers
 * are async for the same reason; every call site awaits them. */
export async function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
) {
  const client = options?.queryClient ?? createTestQueryClient();
  const renderResult = await render(ui, {
    wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    ...options,
  });
  return { ...renderResult, queryClient: client };
}

export async function renderHookWithProviders<TResult, TProps>(
  hook: (props: TProps) => TResult,
  options?: { queryClient?: QueryClient; initialProps?: TProps },
) {
  const client = options?.queryClient ?? createTestQueryClient();
  // NOT a spread of renderHook()'s return value — RNTL defines `result`
  // via a non-enumerable accessor on some versions, which `{...x}` silently
  // drops (the consuming test would see `result: undefined`). Naming the
  // fields explicitly avoids that footgun.
  const hookResult = await renderHook(hook, {
    wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    initialProps: options?.initialProps,
  });
  return {
    result: hookResult.result,
    rerender: hookResult.rerender,
    unmount: hookResult.unmount,
    queryClient: client,
  };
}
