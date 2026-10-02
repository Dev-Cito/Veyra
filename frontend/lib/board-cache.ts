import type { Neighbours } from "./neighbours";
import type { FullBoard, List, ListWithTasks, Task } from "./types";

/**
 * Immutable edits of the cached board (GET /full), for optimistic updates and
 * for merging mutation answers without refetching the whole board.
 */

/**
 * Inserts `item` right after `previousId`, else right before `nextId` (as the
 * server does), else at the head of an empty target. A neighbour missing
 * from the cache (it changed meanwhile) falls back to the end: the refetch
 * that follows every move puts things right.
 */
export function insertBetween<T extends { id: string }>(
  items: readonly T[],
  item: T,
  { previousId, nextId }: Neighbours,
): T[] {
  const rest = items.filter((other) => other.id !== item.id);
  const indexOf = (id: string | null) => (id ? rest.findIndex((other) => other.id === id) : -1);
  let index: number;
  if (indexOf(previousId) !== -1) {
    index = indexOf(previousId) + 1;
  } else if (indexOf(nextId) !== -1) {
    index = indexOf(nextId);
  } else {
    index = previousId || nextId ? rest.length : 0;
  }
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}

export function findTask(board: FullBoard | undefined, taskId: string) {
  for (const list of board?.lists ?? []) {
    const task = list.tasks.find((t) => t.id === taskId);
    if (task) {
      return { task, list };
    }
  }
  return null;
}

export function moveTask(board: FullBoard, taskId: string, targetListId: string, at: Neighbours): FullBoard {
  const found = findTask(board, taskId);
  if (!found) {
    return board;
  }
  const task = { ...found.task, listId: targetListId };
  return {
    ...board,
    lists: board.lists.map((list) => {
      const tasks = list.tasks.filter((t) => t.id !== taskId);
      return list.id === targetListId
        ? { ...list, tasks: insertBetween(tasks, task, at) }
        : tasks.length === list.tasks.length
          ? list
          : { ...list, tasks };
    }),
  };
}

export function moveList(board: FullBoard, listId: string, at: Neighbours): FullBoard {
  const list = board.lists.find((l) => l.id === listId);
  return list ? { ...board, lists: insertBetween(board.lists, list, at) } : board;
}

export function updateTask(board: FullBoard, taskId: string, change: (task: Task) => Task): FullBoard {
  return {
    ...board,
    lists: board.lists.map((list) =>
      list.tasks.some((t) => t.id === taskId)
        ? { ...list, tasks: list.tasks.map((t) => (t.id === taskId ? change(t) : t)) }
        : list,
    ),
  };
}

export function addTask(board: FullBoard, task: Task): FullBoard {
  return {
    ...board,
    lists: board.lists.map((list) =>
      list.id === task.listId && !list.tasks.some((t) => t.id === task.id)
        ? { ...list, tasks: [...list.tasks, task] }
        : list,
    ),
  };
}

export function removeTask(board: FullBoard, taskId: string): FullBoard {
  return {
    ...board,
    lists: board.lists.map((list) =>
      list.tasks.some((t) => t.id === taskId)
        ? { ...list, tasks: list.tasks.filter((t) => t.id !== taskId) }
        : list,
    ),
  };
}

export function addList(board: FullBoard, list: List): FullBoard {
  if (board.lists.some((l) => l.id === list.id)) {
    return board;
  }
  const withTasks: ListWithTasks = { ...list, tasks: [] };
  return { ...board, lists: [...board.lists, withTasks] };
}

export function updateList(board: FullBoard, list: List): FullBoard {
  return {
    ...board,
    lists: board.lists.map((l) => (l.id === list.id ? { ...l, ...list, tasks: l.tasks } : l)),
  };
}

export function removeList(board: FullBoard, listId: string): FullBoard {
  return { ...board, lists: board.lists.filter((l) => l.id !== listId) };
}
