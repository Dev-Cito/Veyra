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
import { errorMessage } from "@/lib/error-messages";
import type { AppMeta } from "@/lib/query-meta";
import { markSignedOut } from "@/hooks/use-auth";
import { workspaceKeys } from "@/hooks/use-workspaces";
import { redirectToLogin } from "@/lib/session";

/**
 * The global error policy, one explicit branch per status. Copy is French
 * (lib/error-messages), never the API's English, except for unforeseen cases.
 *
 *   400  fields under the form when the caller handles it; otherwise a toast
 *   401  one redirect to /login (lib/session.ts), no toast
 *   403  the workspace is re-read so the UI matches what the API allows;
 *        toast on a mutation only (a query's page shows its own state)
 *   404  a state in the page on a query; a toast on a mutation
 *   409  toast; callers that know the way out handle it and offer it
 *   429  how long to wait
 *   5xx  toast with a Retry action (also network failures, status 0)
 */
interface ErrorContextInfo {
  kind: "query" | "mutation";
  queryKey?: readonly unknown[];
  retry: () => void;
  signOut: () => void;
  refreshWorkspace: (failedKey?: readonly unknown[]) => void;
}

function handleError(error: unknown, meta: AppMeta | undefined, info: ErrorContextInfo) {
  if (!(error instanceof ApiError)) {
    toast.error(errorMessage(error), { action: { label: "Réessayer", onClick: info.retry } });
    return;
  }
  const status = error.status;
  const isQuery = info.kind === "query";

  // Whoever renders the error, a 403 means the cached role may be stale.
  if (status === 403) {
    info.refreshWorkspace(info.queryKey);
  }
  if (meta?.handles?.includes(status)) {
    return;
  }

  if (status === 401) {
    if (!meta?.allowAnonymous) {
      info.signOut();
    }
    return;
  }
  if (status === 0 || status >= 500) {
    toast.error(errorMessage(error, meta?.context), {
      action: { label: "Réessayer", onClick: info.retry },
    });
    return;
  }
  if (status === 429) {
    toast.error(errorMessage(error, meta?.context));
    return;
  }
  if (status === 400 || status === 403 || status === 404) {
    // On a query the page shows its own state (not found, no access).
    if (!isQuery) {
      toast.error(errorMessage(error, meta?.context));
    }
    return;
  }
  if (status === 409) {
    toast.error(errorMessage(error, meta?.context));
    return;
  }
  toast.error(errorMessage(error, meta?.context));
}

/** The workspace a request concerned: from its query key, or from the URL. */
function workspaceIdOf(queryKey: readonly unknown[] | undefined): string | null {
  if (queryKey?.[0] === "workspaces" && typeof queryKey[1] === "string") {
    return queryKey[1];
  }
  const match = /^\/w\/([0-9a-f-]{36})(?:\/|$)/.exec(window.location.pathname);
  return match?.[1] ?? null;
}

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) =>
          handleError(error, query.meta, {
            kind: "query",
            queryKey: query.queryKey,
            retry: () => void client.refetchQueries({ queryKey: query.queryKey }),
            signOut,
            refreshWorkspace,
          }),
      }),
      mutationCache: new MutationCache({
        onError: (error, variables, _context, mutation) =>
          handleError(error, mutation.meta, {
            kind: "mutation",
            retry: () => void mutation.execute(variables).catch(() => undefined),
            signOut,
            refreshWorkspace,
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

    // Re-read the workspace (hence the caller's role) after a 403. Never the
    // very query that failed: re-reading a 403'd workspace would loop.
    function refreshWorkspace(failedKey?: readonly unknown[]) {
      const workspaceId = workspaceIdOf(failedKey);
      if (!workspaceId) {
        return;
      }
      const detail = workspaceKeys.detail(workspaceId);
      const failedIsDetail =
        failedKey?.length === detail.length && failedKey.every((part, i) => part === detail[i]);
      if (!failedIsDetail) {
        void client.invalidateQueries({ queryKey: detail, exact: true });
      }
      void client.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
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
