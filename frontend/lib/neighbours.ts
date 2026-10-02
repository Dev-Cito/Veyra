/**
 * Where an item was dropped, as the API wants it: the ids of the items it now
 * sits between, never a position (the server is the only authority on those).
 * Shared by every way of moving something: pointer drag, keyboard drag, the
 * "Déplacer vers…" menu, and column reordering.
 */
export interface Neighbours {
  previousId: string | null;
  nextId: string | null;
}

/**
 * `destIndex` is the index the moved item occupies in the target sequence
 * AFTER the move. The moved item is removed from the target before reading
 * its neighbours: within one list, the items at destIndex - 1 and destIndex
 * of the unfiltered array can be the moved item itself, which the API
 * rejects (400, "cannot be the moved item itself").
 *
 * Both are null only when the target holds nothing but (at most) the moved
 * item: the API answers 409 to { null, null } on a non-empty target.
 */
export function neighbours(
  itemsInTarget: readonly { id: string }[],
  movedId: string,
  destIndex: number,
): Neighbours {
  const without = itemsInTarget.filter((item) => item.id !== movedId);
  const index = Math.min(Math.max(destIndex, 0), without.length);
  return {
    previousId: without[index - 1]?.id ?? null,
    nextId: without[index]?.id ?? null,
  };
}

/** The item's own neighbours where it currently is (for no-op detection). */
export function currentNeighbours(
  items: readonly { id: string }[],
  id: string,
): Neighbours | null {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  return neighbours(items, id, index);
}

export function sameNeighbours(a: Neighbours | null, b: Neighbours): boolean {
  return a !== null && a.previousId === b.previousId && a.nextId === b.nextId;
}
