"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const boardKeys = {
  list: (workspaceId: string) => ["workspaces", workspaceId, "boards"] as const,
};

export function useBoards(workspaceId: string) {
  return useQuery({
    queryKey: boardKeys.list(workspaceId),
    queryFn: () => api.boards.list(workspaceId),
  });
}

export function useCreateBoard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api.boards.create(workspaceId, body),
    meta: { handles: [400] },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: boardKeys.list(workspaceId) }),
  });
}
