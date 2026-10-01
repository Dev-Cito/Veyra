import "@tanstack/react-query";
import type { ErrorContext } from "./error-messages";

/**
 * Per query / mutation hints for the global error policy (app/providers.tsx).
 */
export interface AppMeta extends Record<string, unknown> {
  /** Statuses the caller renders itself (field errors, banners, 404 states). */
  handles?: number[];
  /** A 401 is an expected answer here (public pages): do not redirect. */
  allowAnonymous?: boolean;
  /** The action being attempted, to pick the French copy (lib/error-messages). */
  context?: ErrorContext;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}
