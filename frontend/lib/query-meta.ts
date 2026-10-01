import "@tanstack/react-query";

/**
 * Per query / mutation hints for the global error policy (app/providers.tsx).
 */
export interface AppMeta extends Record<string, unknown> {
  /** Statuses the caller renders itself (field errors, banners, 404 states). */
  handles?: number[];
  /** A 401 is an expected answer here (public pages): do not redirect. */
  allowAnonymous?: boolean;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}
