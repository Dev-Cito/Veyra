"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { InvitationRole } from "@/lib/types";
import { workspaceKeys } from "./use-workspaces";

export const invitationKeys = {
  pending: (workspaceId: string) => ["workspaces", workspaceId, "invitations"] as const,
  // Never the token: query keys are visible in devtools and caches.
  preview: ["invitation-preview"] as const,
};

/** OWNER and ADMIN only: the API answers 403 to members, so do not ask. */
export function usePendingInvitations(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: invitationKeys.pending(workspaceId),
    queryFn: () => api.invitations.listPending(workspaceId),
    enabled,
  });
}

export function useCreateInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: InvitationRole }) =>
      api.invitations.create(workspaceId, body),
    // 400 under the fields, 409 with its way out: both in the dialog.
    meta: { handles: [400, 409] },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: invitationKeys.pending(workspaceId) }),
  });
}

export function useRevokeInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => api.invitations.revoke(workspaceId, invitationId),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: invitationKeys.pending(workspaceId) }),
  });
}

/** Public: POST /invitations/preview, token in the body. Its 404 is a page state. */
export function useInvitationPreview(token: string | null) {
  return useQuery({
    queryKey: invitationKeys.preview,
    queryFn: () => api.invitations.preview(token!),
    enabled: token !== null,
    meta: { allowAnonymous: true, handles: [404] },
    gcTime: 0,
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.invitations.accept(token),
    // 403 (another account) and 404 (no longer valid) are page states.
    meta: { handles: [403, 404] },
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceKeys.detail(workspace.id), workspace);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
    },
  });
}
