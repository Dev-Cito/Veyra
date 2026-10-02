"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMoveList, useMoveTask } from "@/hooks/use-board";
import { columnDropId, listSortId, moveToColumn, resolveDrop, type Columns } from "@/lib/board-dnd";
import { currentNeighbours, neighbours, sameNeighbours } from "@/lib/neighbours";
import type { FullBoard, ListWithTasks, Task } from "@/lib/types";
import { useBoardContext } from "./board-context";
import { ColumnDragOverlay, SortableColumn, type DragKind } from "./column";
import { TaskDragOverlay } from "./task-card";

type Drag =
  | { kind: "task"; id: string; columns: Columns }
  | { kind: "list"; id: string };

const ARROWS: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

const LIST_PREFIX = "list:";
const listIdOf = (sortId: UniqueIdentifier) => String(sortId).slice(LIST_PREFIX.length);
const ids = (order: readonly string[]) => order.map((id) => ({ id }));

const columnsOf = (board: FullBoard): Columns =>
  Object.fromEntries(board.lists.map((list) => [list.id, list.tasks.map((task) => task.id)]));

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "Pour déplacer cet élément, appuyez sur Espace ou Entrée. Utilisez les flèches pour le déplacer, Espace ou Entrée pour le déposer, Échap pour annuler.",
};

export function BoardCanvas({
  board,
  reducedMotion,
  onDeleteList,
  trailing,
}: {
  board: FullBoard;
  reducedMotion: boolean;
  onDeleteList: (list: ListWithTasks) => void;
  /** After the last column: the "+ Colonne" ghost. */
  trailing: ReactNode;
}) {
  const { workspaceId, boardId } = useBoardContext();
  const moveTask = useMoveTask(workspaceId, boardId);
  const moveList = useMoveList(workspaceId, boardId);
  const [drag, setDrag] = useState<Drag | null>(null);

  const boardColumns = useMemo(() => columnsOf(board), [board]);

  // Read by the collision detection and the announcements, which dnd-kit
  // calls outside of React's render: always the latest values.
  const boardRef = useRef(board);
  const columnsRef = useRef<Columns>(columnsOf(board));
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const movedToNewColumn = useRef(false);
  /** The keyboard's target, decided by keyboardCoordinates: no geometry guessing. */
  const keyboardTarget = useRef<UniqueIdentifier | null>(null);
  /** The "over itself" that follows a grab must not overwrite the grab announcement. */
  const justGrabbed = useRef(false);
  useEffect(() => {
    boardRef.current = board;
    if (!drag) {
      columnsRef.current = boardColumns;
    }
  }, [board, boardColumns, drag]);

  const tasksById = useMemo(
    () => new Map(board.lists.flatMap((list) => list.tasks.map((task) => [task.id, task] as const))),
    [board],
  );
  const columns = drag?.kind === "task" ? drag.columns : boardColumns;

  /**
   * Arrow keys, as a Kanban: up / down to the previous / next slot of the
   * card's column, left / right to the neighbouring column (same index, or
   * its end). dnd-kit's sortableKeyboardCoordinates picks "the closest
   * droppable in that direction" by comparing rectangles, and the overlay's
   * sub-pixel offset makes a card just below look "to the right": → then
   * moved the card down instead of across. Here the target is named, and
   * collisionDetection takes it as is.
   */
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const step = ARROWS[event.code];
    if (!step || !context.active) {
      return undefined;
    }
    event.preventDefault();
    const activeId = context.active.id;
    const overId = context.over?.id ?? activeId;
    const lists = boardRef.current.lists.map((list) => list.id);
    let target: UniqueIdentifier | null = null;

    if (context.active.data.current?.type === "list") {
      if (step.x !== 0) {
        const index = lists.indexOf(listIdOf(overId)) + step.x;
        target = lists[index] ? listSortId(lists[index]) : null;
      }
    } else {
      const columns = columnsRef.current;
      const drop = resolveDrop(columns, String(activeId), String(overId));
      if (!drop) {
        return undefined;
      }
      if (step.y !== 0) {
        // `over` semantics (arrayMove): the card lands at the index `over`
        // has in the column's array, which still holds the card itself.
        const ids = columns[drop.listId];
        target = ids[drop.index + step.y] ?? null;
      } else {
        const next = lists[lists.indexOf(drop.listId) + step.x];
        const ids = next ? columns[next] : undefined;
        if (next && ids) {
          // Same height in the next column, or its end (the column body).
          target = ids[drop.index] ?? columnDropId(next);
        }
      }
    }

    const rect = target === null ? undefined : context.droppableRects.get(target);
    if (target === null || !rect) {
      return undefined;
    }
    keyboardTarget.current = target;
    return { x: rect.left, y: rect.top };
  };

  const sensors = useSensors(
    // 6px before a drag starts: a click on a card opens it instead.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const setColumns = (next: Columns) => {
    columnsRef.current = next;
    setDrag((current) => (current?.kind === "task" ? { ...current, columns: next } : current));
  };

  useEffect(() => {
    // Let the layout settle after a column change before trusting collisions again.
    const frame = requestAnimationFrame(() => {
      movedToNewColumn.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [columns]);

  /**
   * Cards hit cards and column bodies; columns hit columns only. Over a
   * column that has cards, the closest card in it wins, so the slot follows
   * the pointer. (The keyboard has no pointer: rectangle intersection.)
   */
  const collisionDetection: CollisionDetection = (args) => {
    if (args.pointerCoordinates === null && keyboardTarget.current !== null) {
      return [{ id: keyboardTarget.current }];
    }
    const kind = args.active.data.current?.type;
    if (kind === "list") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "list"),
      });
    }
    const targets = args.droppableContainers.filter((c) => c.data.current?.type !== "list");
    const scoped = { ...args, droppableContainers: targets };
    const pointer = pointerWithin(scoped);
    let overId = getFirstCollision(pointer.length > 0 ? pointer : rectIntersection(scoped), "id");
    if (overId != null) {
      const over = targets.find((c) => c.id === overId);
      if (over?.data.current?.type === "column") {
        const cardIds = columnsRef.current[over.data.current.listId as string] ?? [];
        if (cardIds.length > 0) {
          overId =
            closestCenter({
              ...args,
              droppableContainers: targets.filter((c) => cardIds.includes(String(c.id))),
            })[0]?.id ?? overId;
        }
      }
      lastOverId.current = overId;
      return [{ id: overId }];
    }
    // Just moved to another column: the card is its own target until layout settles.
    if (movedToNewColumn.current) {
      lastOverId.current = args.active.id;
    }
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    lastOverId.current = null;
    keyboardTarget.current = null;
    justGrabbed.current = true;
    if (active.data.current?.type === "list") {
      setDrag({ kind: "list", id: listIdOf(active.id) });
    } else {
      columnsRef.current = boardColumns;
      setDrag({ kind: "task", id: String(active.id), columns: boardColumns });
    }
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (active.data.current?.type !== "task" || !over || over.id === active.id) {
      return;
    }
    const current = columnsRef.current;
    const translated = active.rect.current.translated;
    const below =
      over.data.current?.type === "task" &&
      translated !== null &&
      translated.top > over.rect.top + over.rect.height / 2;
    const next = moveToColumn(current, String(active.id), String(over.id), below);
    if (next !== current) {
      movedToNewColumn.current = true;
      if (keyboardTarget.current !== null) {
        // In its new column, the card is its own target (see resolveDrop).
        keyboardTarget.current = active.id;
      }
      setColumns(next);
    }
  };

  /**
   * THE drop handler, for the pointer and the keyboard alike (same dnd-kit
   * event): one index -> neighbours conversion, one API call shape.
   */
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    keyboardTarget.current = null;
    const current = drag;
    if (!current || !over) {
      setDrag(null);
      return;
    }

    if (current.kind === "list") {
      const order = board.lists.map((list) => list.id);
      const from = order.indexOf(current.id);
      const to = order.indexOf(listIdOf(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        const target = neighbours(ids(arrayMove(order, from, to)), current.id, to);
        moveList.mutate({ listId: current.id, ...target });
      }
      setDrag(null);
      return;
    }

    const drop = resolveDrop(columnsRef.current, String(active.id), String(over.id));
    const origin = tasksById.get(current.id);
    if (drop && origin) {
      const target = neighbours(ids(drop.order), current.id, drop.index);
      const originList = board.lists.find((list) => list.id === origin.listId);
      const unchanged =
        drop.listId === origin.listId &&
        originList !== undefined &&
        sameNeighbours(currentNeighbours(originList.tasks, current.id), target);
      if (!unchanged) {
        // onMutate updates the cache synchronously: the card is already in
        // place when the drag state below is cleared.
        moveTask.mutate({ taskId: current.id, targetListId: drop.listId, ...target });
      }
    }
    setDrag(null);
  };

  // Read the refs only when dnd-kit calls them, never during render.
  const announcements: Announcements = {
    onDragStart: ({ active }) => announce("start", boardRef.current, columnsRef.current, active.id, active.id),
    onDragOver: ({ active, over }) => {
      if (justGrabbed.current) {
        justGrabbed.current = false;
        if (over?.id === active.id) {
          return undefined;
        }
      }
      return announce("over", boardRef.current, columnsRef.current, active.id, over?.id ?? null);
    },
    onDragEnd: ({ active, over }) =>
      announce("end", boardRef.current, columnsRef.current, active.id, over?.id ?? null),
    onDragCancel: ({ active }) => announce("cancel", boardRef.current, columnsRef.current, active.id, null),
  };

  const dragKind: DragKind = drag?.kind ?? null;
  const activeTask = drag?.kind === "task" ? tasksById.get(drag.id) : undefined;
  const activeList = drag?.kind === "list" ? board.lists.find((list) => list.id === drag.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        keyboardTarget.current = null;
        setDrag(null);
      }}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
    >
      <div className="flex h-full items-start gap-[14px] overflow-x-auto bg-surface p-[18px]">
        <SortableContext
          items={board.lists.map((list) => listSortId(list.id))}
          strategy={horizontalListSortingStrategy}
        >
          {board.lists.map((list) => (
            <SortableColumn
              key={list.id}
              list={list}
              taskIds={columns[list.id] ?? []}
              tasksById={tasksById}
              dragKind={dragKind}
              reducedMotion={reducedMotion}
              onDelete={onDeleteList}
            />
          ))}
        </SortableContext>
        {trailing}
      </div>
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {activeTask ? (
          <TaskDragOverlay task={activeTask} reducedMotion={reducedMotion} />
        ) : activeList ? (
          <ColumnDragOverlay list={activeList} tasks={activeList.tasks} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Screen reader announcements, in French, for the pointer and the keyboard.
 * Positions are 1-based and computed by the same resolveDrop as the drop.
 */
function announce(
  event: "start" | "over" | "end" | "cancel",
  board: FullBoard,
  columns: Columns,
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier | null,
): string {
  const isList = String(activeId).startsWith(LIST_PREFIX);
  const listName = (listId: string) => board.lists.find((list) => list.id === listId)?.name ?? "la colonne";
  const title = (id: UniqueIdentifier) => {
    for (const list of board.lists) {
      const task: Task | undefined = list.tasks.find((t) => t.id === id);
      if (task) {
        return task.title;
      }
    }
    return "La carte";
  };
  const name = isList ? `La colonne ${listName(listIdOf(activeId))}` : title(activeId);
  const cancelled = `Déplacement annulé, ${name} revient à sa place`;
  if (event === "cancel") {
    return cancelled;
  }

  let position: string | null = null;
  if (overId !== null && isList) {
    const order = board.lists.map((list) => list.id);
    const to = order.indexOf(listIdOf(overId));
    position = to === -1 ? null : `position ${to + 1} sur ${order.length}`;
  } else if (overId !== null) {
    const drop = resolveDrop(columns, String(activeId), String(overId));
    position = drop && `position ${drop.index + 1} sur ${drop.order.length} dans ${listName(drop.listId)}`;
  }

  switch (event) {
    case "start":
      return position ? `${name} saisie, ${position}` : `${name} saisie`;
    case "over":
      return position ? `${name} déplacée en ${position}` : `${name} n'est plus au-dessus d'une zone de dépôt`;
    case "end":
      return position ? `${name} déposée en ${position}` : cancelled;
  }
}
