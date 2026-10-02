"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, isApiError, type TaskChanges } from "@/lib/api";
import * as cache from "@/lib/board-cache";
import { errorMessage, type ErrorContext } from "@/lib/error-messages";
import type { Neighbours } from "@/lib/neighbours";
import type { FullBoard, List, Moved, Task } from "@/lib/types";

export const boardKeys = {
  // Not under ["workspaces", id, "boards"]: invalidating the boards list must
  // not refetch every open board with it.
  full: (workspaceId: string, boardId: string) =>
    ["workspaces", workspaceId, "board", boardId] as const,
};

/** One queue per board, for task AND column moves: see useMoveTask. */
const movesKey = (boardId: string) => ["board-moves", boardId] as const;

/** 404 / 400 (malformed id) render "Ce tableau est introuvable" in the page. */
export function useBoard(workspaceId: string, boardId: string) {
  return useQuery({
    queryKey: boardKeys.full(workspaceId, boardId),
    queryFn: () => api.boards.full(workspaceId, boardId),
    meta: { handles: [400, 403, 404] },
  });
}

function useBoardCache(workspaceId: string, boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.full(workspaceId, boardId);
  return {
    queryClient,
    key,
    edit: (change: (board: FullBoard) => FullBoard) =>
      queryClient.setQueryData<FullBoard>(key, (board) => (board ? change(board) : board)),
    refresh: () => void queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** 404 / 409 mean the cached board is stale: re-read it (the toast says so). */
const staleOn = [404, 409];

// ─── Moves ───────────────────────────────────────────────────────────────

export interface TaskMove extends Neighbours {
  taskId: string;
  targetListId: string;
}

export interface ListMove extends Neighbours {
  listId: string;
}

interface MoveContext {
  snapshot: FullBoard | undefined;
  /** Where the item was: to undo this move alone if others are queued behind it. */
  undo: (board: FullBoard) => FullBoard;
}

/**
 * Shared by task and column moves. Optimistic, in the cache, the very moment
 * the item is dropped; serialised per board (`scope`): a second drop is shown
 * at once but its request waits for the first, so two moves never race on
 * the same siblings, and each one's neighbours are read from a state the
 * server will have reached by the time it runs.
 */
function moveHandlers<TVariables, TData extends { reindexed: boolean }>(
  queryClient: QueryClient,
  key: readonly unknown[],
  boardId: string,
  context: ErrorContext,
  apply: (board: FullBoard, move: TVariables) => FullBoard,
  undoFor: (board: FullBoard, move: TVariables) => (board: FullBoard) => FullBoard,
  merge: (board: FullBoard, data: TData) => FullBoard,
) {
  const othersQueued = () => queryClient.isMutating({ mutationKey: movesKey(boardId) }) > 1;
  return {
    mutationKey: movesKey(boardId),
    scope: { id: `board-moves:${boardId}` },
    // The UI explains every refusal itself; 5xx keep the global toast + Retry.
    meta: { handles: [400, 403, 404, 409], context },
    // Synchronous on purpose (nothing awaited before setQueryData): the item
    // is in its new place in the same frame as the drop, with no flash back.
    onMutate: (move: TVariables): MoveContext => {
      void queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<FullBoard>(key);
      if (snapshot) {
        queryClient.setQueryData(key, apply(snapshot, move));
      }
      return { snapshot, undo: snapshot ? undoFor(snapshot, move) : (board) => board };
    },
    onSuccess: (data: TData) => {
      queryClient.setQueryData<FullBoard>(key, (board) => (board ? merge(board, data) : board));
      // Every sibling's position was rewritten: re-read now, not at the end of the queue.
      if (data.reindexed) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error: Error, move: TVariables, ctx: MoveContext | undefined) => {
      if (ctx) {
        // Alone: back to the exact snapshot. With later moves queued (already
        // shown), undo this one only, so theirs stay on screen.
        if (othersQueued()) {
          queryClient.setQueryData<FullBoard>(key, (board) => (board ? ctx.undo(board) : board));
        } else if (ctx.snapshot) {
          queryClient.setQueryData(key, ctx.snapshot);
        }
      }
      if (!isApiError(error) || error.status === 0 || error.status >= 500) {
        return; // the global policy: "not saved" + Retry
      }
      if (error.status === 400 && process.env.NODE_ENV === "development") {
        // Never expected: a bug in the neighbours computation. What was sent:
        console.error(`[${context}] 400 "${error.message}" for`, move);
      }
      // Never a silent snap-back: the user would think they missed the target.
      toast.error(errorMessage(error, context));
      if (staleOn.includes(error.status) || error.status === 403) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onSettled: () => {
      // Last of the queue: resynchronise. Earlier ones would overwrite the
      // optimistic state of the moves still waiting.
      if (!othersQueued()) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  };
}

/** Where an item sits now, as neighbours: to put it back exactly there. */
function placeOf(items: readonly { id: string }[], id: string): Neighbours {
  const index = items.findIndex((item) => item.id === id);
  return { previousId: items[index - 1]?.id ?? null, nextId: items[index + 1]?.id ?? null };
}

export function useMoveTask(workspaceId: string, boardId: string) {
  const { queryClient, key } = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: ({ taskId, targetListId, previousId, nextId }: TaskMove) =>
      api.tasks.move(workspaceId, taskId, {
        targetListId,
        previousTaskId: previousId,
        nextTaskId: nextId,
      }),
    ...moveHandlers(
      queryClient,
      key,
      boardId,
      "moveTask",
      (board, move: TaskMove) => cache.moveTask(board, move.taskId, move.targetListId, move),
      (board, move) => {
        const found = cache.findTask(board, move.taskId);
        if (!found) {
          return (current) => current;
        }
        const origin = placeOf(found.list.tasks, move.taskId);
        return (current) => cache.moveTask(current, move.taskId, found.list.id, origin);
      },
      // The answer has no assignees: merge the fields it is authoritative on.
      (board, task: Moved<Task>) =>
        cache.updateTask(board, task.id, (current) => ({
          ...current,
          listId: task.listId,
          position: task.position,
          updatedAt: task.updatedAt,
        })),
    ),
  });
}

export function useMoveList(workspaceId: string, boardId: string) {
  const { queryClient, key } = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: ({ listId, previousId, nextId }: ListMove) =>
      api.lists.move(workspaceId, listId, { previousListId: previousId, nextListId: nextId }),
    ...moveHandlers(
      queryClient,
      key,
      boardId,
      "moveList",
      (board, move: ListMove) => cache.moveList(board, move.listId, move),
      (board, move) => {
        const origin = placeOf(board.lists, move.listId);
        return (current) => cache.moveList(current, move.listId, origin);
      },
      (board, list: Moved<List>) => cache.updateList(board, list),
    ),
  });
}

// ─── Lists ───────────────────────────────────────────────────────────────

export function useCreateList(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: (name: string) => api.lists.create(workspaceId, boardId, { name }),
    meta: { context: "createList" },
    onSuccess: (list) => board.edit((current) => cache.addList(current, list)),
    onError: (error) => isApiError(error, 404) && board.refresh(),
  });
}

export function useRenameList(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: ({ listId, name }: { listId: string; name: string }) =>
      api.lists.rename(workspaceId, listId, { name }),
    meta: { context: "renameList" },
    onSuccess: (list) => board.edit((current) => cache.updateList(current, list)),
    onError: (error) => isApiError(error, 404) && board.refresh(),
  });
}

export function useDeleteList(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: (listId: string) => api.lists.remove(workspaceId, listId),
    meta: { context: "deleteList" },
    onSuccess: (deleted) => board.edit((current) => cache.removeList(current, deleted.id)),
    onError: (error) => isApiError(error, 404) && board.refresh(),
  });
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export function useCreateTask(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: ({ listId, title }: { listId: string; title: string }) =>
      api.tasks.create(workspaceId, listId, { title }),
    meta: { context: "createTask" },
    onSuccess: (task) => board.edit((current) => cache.addTask(current, task)),
    onError: (error) => isApiError(error, 404) && board.refresh(),
  });
}

export function useUpdateTask(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: ({ taskId, changes }: { taskId: string; changes: TaskChanges }) =>
      api.tasks.update(workspaceId, taskId, changes),
    meta: { context: "updateTask" },
    onSuccess: (task) => board.edit((current) => cache.updateTask(current, task.id, () => task)),
    onError: (error) => isApiError(error, 404) && board.refresh(),
  });
}

export function useDeleteTask(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: (taskId: string) => api.tasks.remove(workspaceId, taskId),
    meta: { context: "deleteTask" },
    onSuccess: ({ id }) => board.edit((current) => cache.removeTask(current, id)),
    onError: (error) => isApiError(error, 404) && board.refresh(),
  });
}

export function useAssignTask(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      api.tasks.assign(workspaceId, taskId, userId),
    meta: { context: "assignTask" },
    onSuccess: (assignee) =>
      board.edit((current) =>
        cache.updateTask(current, assignee.taskId, (task) => ({
          ...task,
          assignees: [...task.assignees.filter((a) => a.userId !== assignee.userId), assignee],
        })),
      ),
    // 400: no longer an active member; 404 / 409: the task or the assignment changed.
    onError: (error) => isApiError(error) && [400, ...staleOn].includes(error.status) && board.refresh(),
  });
}

export function useUnassignTask(workspaceId: string, boardId: string) {
  const board = useBoardCache(workspaceId, boardId);
  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      api.tasks.unassign(workspaceId, taskId, userId),
    meta: { context: "unassignTask" },
    onSuccess: ({ taskId, userId }) =>
      board.edit((current) =>
        cache.updateTask(current, taskId, (task) => ({
          ...task,
          assignees: task.assignees.filter((a) => a.userId !== userId),
        })),
      ),
    onError: (error) => isApiError(error, 404) && board.refresh(),
  });
}
