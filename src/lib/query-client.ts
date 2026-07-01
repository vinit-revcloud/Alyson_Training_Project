import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isAuthError } from "@/lib/auth-errors";

function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8000);
}

function handleQueryError(error: unknown): void {
  if (isAuthError(error)) {
    toast.error("Session expired — please sign in again.");
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
      window.location.href = "/auth";
    }
  }
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (isAuthError(error)) return false;
          return failureCount < 2;
        },
        retryDelay,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: (failureCount, error) => {
          if (isAuthError(error)) return false;
          return failureCount < 1;
        },
        retryDelay,
        onError: handleQueryError,
      },
    },
  });
}

export const queryClient = createAppQueryClient();
