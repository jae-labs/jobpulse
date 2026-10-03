import { QueryClient } from "@tanstack/react-query";
import { reportError } from './logger';
import { disposeProfileEmbeddingWorker } from './browserEmbedding';

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
  disposeProfileEmbeddingWorker();
  try {
    queryClient.clear();
  } catch (err) {
    reportError(err);
  }
}
