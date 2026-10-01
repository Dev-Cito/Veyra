"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";
import { workspaceKeys } from "./use-workspaces";

export const memberKeys = {
  list: (workspaceId: string) => ["workspaces", workspaceId, "members"] as const,
};

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: memberKeys.list(workspaceId),
    queryFn: () => api.members.list(workspaceId),
  });
}

export function useUpdateMemberRole(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      api.members.updateRole(workspaceId, memberId, { role }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: memberKeys.list(workspaceId) }),
  });
}

/**
 * Removing a member, or leaving (removing yourself). The caller renders the
 * 409 "last owner" case itself, with its way out.
 */
export function useRemoveMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.members.remove(workspaceId, memberId),
    meta: { handles: [409] },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.list(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
    },
  });
}
