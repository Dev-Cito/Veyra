"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { resetLoginRedirect } from "@/lib/session";
import type { User } from "@/lib/types";

export const meKey = ["me"] as const;

/**
 * Who is signed in, from GET /auth/me: the only source of authentication
 * state (the session cookie is httpOnly and unreadable here, by design).
 * `anonymous`: a 401 is a normal answer (public pages), not a reason to leave.
 */
export function useMe({ anonymous = false }: { anonymous?: boolean } = {}) {
  return useQuery({
    queryKey: meKey,
    // null: known to be signed out (set on a 401, see markSignedOut).
    queryFn: (): Promise<User | null> => api.auth.me(),
    meta: { allowAnonymous: anonymous },
    staleTime: 5 * 60_000,
  });
}

/**
 * The session ended (a 401 somewhere): remember it in the `me` query rather
 * than removing it. Removing would make the mounted observers refetch at once
 * (and 401 again); keeping the old user would make /login bounce back to /w.
 */
export function markSignedOut(queryClient: QueryClient) {
  queryClient.setQueryData<User | null>(meKey, null);
}

/**
 * Drops any data cached under a previous session, but keeps the `me` query
 * itself (observers mounted on the page stay attached) and fills it in.
 */
function startSession(queryClient: QueryClient, user: User) {
  resetLoginRedirect();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meKey[0] });
  queryClient.setQueryData(meKey, user);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.auth.login,
    // 401 (bad credentials) and 400 are shown in the form.
    meta: { handles: [400, 401], allowAnonymous: true, context: "login" },
    onSuccess: (user) => startSession(queryClient, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.auth.register,
    meta: { handles: [400, 409], allowAnonymous: true, context: "register" },
    onSuccess: (user) => startSession(queryClient, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.auth.logout,
    meta: { allowAnonymous: true, context: "logout" },
    onSettled: () => queryClient.clear(),
  });
}
