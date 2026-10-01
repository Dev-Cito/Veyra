"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-auth";
import { isApiError } from "@/lib/api";
import { errorMessage } from "@/lib/error-messages";
import { redirectToLogin } from "@/lib/session";
import type { User } from "@/lib/types";
import { EmptyState } from "./primitives";
import { ShellSkeleton } from "./skeletons";

/**
 * Guards the /w group: GET /auth/me on mount, a skeleton while it answers,
 * /login on 401. Children only render for a signed-in user.
 */
export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const router = useRouter();
  const me = useMe();
  // A 401 on /auth/me, or any other request having marked the session over.
  const unauthenticated = isApiError(me.error, 401) || me.data === null;

  useEffect(() => {
    if (unauthenticated) {
      redirectToLogin(router);
    }
  }, [unauthenticated, router]);

  if (me.data) {
    return children(me.data);
  }
  if (me.isError && !unauthenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone">
        <EmptyState
          title="Impossible de vérifier votre session"
          action={<Button onClick={() => void me.refetch()}>Réessayer</Button>}
        >
          {errorMessage(me.error)}
        </EmptyState>
      </main>
    );
  }
  return <ShellSkeleton />;
}
