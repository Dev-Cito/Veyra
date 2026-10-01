"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const workspaceKeys = {
  all: ["workspaces"] as const,
  detail: (id: string) => ["workspaces", id] as const,
};

export function useWorkspaces() {
  return useQuery({ queryKey: workspaceKeys.all, queryFn: api.workspaces.list });
}

/**
 * 403 (not a member), 404 and 400 (malformed id) all render the same
 * "not found" state: the page handles them, no toast.
 */
export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: () => api.workspaces.get(workspaceId),
    meta: { handles: [400, 403, 404] },
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.workspaces.create,
    meta: { handles: [400] },
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceKeys.detail(workspace.id), workspace);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
    },
  });
}

export function useRenameWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.workspaces.rename(workspaceId, { name }),
    meta: { handles: [400] },
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceKeys.detail(workspaceId), workspace);
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
    },
  });
}

export function useDeleteWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.workspaces.remove(workspaceId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: workspaceKeys.detail(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
    },
  });
}
