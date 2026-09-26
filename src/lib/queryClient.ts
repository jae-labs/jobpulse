import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

/** Purges TanStack Query cache upon session termination. */
export function clearAppCache(): void {
  try {
    queryClient.clear();
  } catch (err) {
    console.warn("Failed to clear application cache:", err);
  }
}
