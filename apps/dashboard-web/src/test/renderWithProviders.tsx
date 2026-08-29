import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Fresh QueryClient tuned for tests: no caching (staleTime 0) and no retries,
 * so failures surface on the first fetch and refetches always hit the network.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        retry: false,
      },
    },
  });
}

/** RTL render options pass straight through, plus an optional QueryClient. */
export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  queryClient?: QueryClient;
};

/**
 * Render a React element with the app's React Query provider wired up, using
 * an isolated QueryClient per call so tests never share cache. Returns
 * whatever RTL's `render` returns.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderWithProvidersOptions,
): ReturnType<typeof render> {
  const { queryClient = makeQueryClient(), ...renderOptions } = options ?? {};
  return render(ui, {
    ...renderOptions,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}
