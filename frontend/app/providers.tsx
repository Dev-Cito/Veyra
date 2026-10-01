"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import type { AppMeta } from "@/lib/query-meta";
import { markSignedOut } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/session";

/**
 * The global error policy. Server messages are written for people: they are
 * shown as they are, except where the status calls for our own wording.
 *
 *   400  fields         -> rendered under the fields by the form (meta.handles)
 *   401  unauthenticated -> back to /login, once (lib/session.ts)
 *   403  forbidden      -> toast with the server's message
 *   404  out of scope   -> a "not found" state in the page, never a toast
 *   409  conflict       -> toast; the caller offers the way out when it can
 *   429  rate limited   -> toast, retry in a minute
 *   5xx / network       -> generic toast with a Retry action
 */
function handleError(
  error: unknown,
  meta: AppMeta | undefined,
  context: { kind: "query" | "mutation"; retry: () => void; signOut: () => void },
) {
  if (!(error instanceof ApiError)) {
    toast.error("Une erreur inattendue s'est produite.", {
      action: { label: "Réessayer", onClick: context.retry },
    });
    return;
  }
  if (meta?.handles?.includes(error.status)) {
    return;
  }
  switch (true) {
    case error.status === 401:
      if (!meta?.allowAnonymous) {
        context.signOut();
      }
      return;
    case error.status === 404 && context.kind === "query":
      return;
    case error.status === 429:
      toast.error("Trop de tentatives. Réessayez dans une minute.");
      return;
    case error.isServerError:
      toast.error(
        error.isNetworkError
          ? error.message
          : "Le serveur a rencontré un problème. Votre action n'a pas été enregistrée.",
        { action: { label: "Réessayer", onClick: context.retry } },
      );
      return;
    default:
      toast.error(error.message);
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) =>
          handleError(error, query.meta, {
            kind: "query",
            retry: () => void client.refetchQueries({ queryKey: query.queryKey }),
            signOut,
          }),
      }),
      mutationCache: new MutationCache({
        onError: (error, variables, _context, mutation) =>
          handleError(error, mutation.meta, {
            kind: "mutation",
            retry: () => void mutation.execute(variables).catch(() => undefined),
            signOut,
          }),
      }),
      defaultOptions: {
        queries: {
          // 4xx answers are final; 5xx get an explicit Retry instead.
          retry: false,
          staleTime: 30_000,
        },
      },
    });

    // No cache clearing here: the page is still mounted, and its observers
    // would refetch at once (and 401 again). The user is marked signed out so
    // /login does not send them back; the rest of the old session's data is
    // dropped when the next one starts (useLogin / useRegister) or on logout.
    function signOut() {
      markSignedOut(client);
      redirectToLogin(router);
    }

    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      {/* Respects prefers-reduced-motion for every motion animation. */}
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster position="bottom-right" />
      </MotionConfig>
    </QueryClientProvider>
  );
}
