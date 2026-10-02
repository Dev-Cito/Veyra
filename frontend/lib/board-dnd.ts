import { arrayMove } from "@dnd-kit/sortable";

/**
 * The board as the drag sees it: each list's task ids, in order. Pure
 * functions, shared by the pointer and the keyboard (both go through the same
 * dnd-kit events), and unit-tested in board-dnd.test.ts.
 */
export type Columns = Record<string, string[]>;

/** Droppable id of a column's body: receives cards, empty column included. */
export const columnDropId = (listId: string) => `column:${listId}`;
/** Sortable id of a column itself, for reordering columns. */
export const listSortId = (listId: string) => `list:${listId}`;

const COLUMN_DROP = "column:";

export function columnOf(columns: Columns, id: string): string | null {
  if (id.startsWith(COLUMN_DROP)) {
    const listId = id.slice(COLUMN_DROP.length);
    return listId in columns ? listId : null;
  }
  for (const [listId, ids] of Object.entries(columns)) {
    if (ids.includes(id)) {
      return listId;
    }
  }
  return null;
}

/**
 * onDragOver, when the card enters another column: it is taken out of its
 * column and inserted at the hovered card's index (just after it when
 * `after`), or at the end when hovering the column itself.
 */
export function moveToColumn(
  columns: Columns,
  activeId: string,
  overId: string,
  after: boolean,
): Columns {
  const from = columnOf(columns, activeId);
  const to = columnOf(columns, overId);
  if (!from || !to || from === to) {
    return columns;
  }
  const target = columns[to];
  const overIndex = target.indexOf(overId);
  const index = overIndex === -1 ? target.length : overIndex + (after ? 1 : 0);
  return {
    ...columns,
    [from]: columns[from].filter((id) => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
  };
}

export interface Drop {
  listId: string;
  /** Index of the card in `order`, i.e. AFTER the move (what neighbours() takes). */
  index: number;
  /** The target column's ids once the card is dropped. */
  order: string[];
}

/**
 * Where the card lands, from dnd-kit's `active` and `over`.
 *
 * Within one column, @dnd-kit/sortable never reorders the array during the
 * drag: it only translates the items on screen. So `over` is the hovered card
 * at its index in the array that STILL CONTAINS the dragged card, moving down
 * as well as up, and the result is arrayMove(ids, activeIndex, overIndex): the
 * dragged card ends at overIndex. Across columns, onDragOver has already put
 * the card in its new column (moveToColumn); the same rule then applies.
 */
export function resolveDrop(columns: Columns, activeId: string, overId: string): Drop | null {
  const to = columnOf(columns, overId);
  if (to && to !== columnOf(columns, activeId)) {
    // Dropped before onDragOver caught up with the column change: inserting
    // at the hovered card IS the final place (no arrayMove on top of it).
    const order = moveToColumn(columns, activeId, overId, false)[to];
    return { listId: to, index: order.indexOf(activeId), order };
  }
  const listId = columnOf(columns, activeId);
  if (!listId) {
    return null;
  }
  const ids = columns[listId];
  const activeIndex = ids.indexOf(activeId);
  const overIndex = ids.indexOf(overId);
  // Over the column body itself: the card stays where onDragOver put it.
  const order = overIndex === -1 ? ids : arrayMove(ids, activeIndex, overIndex);
  return { listId, index: order.indexOf(activeId), order };
}
