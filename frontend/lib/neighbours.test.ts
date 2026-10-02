import { arrayMove } from "@dnd-kit/sortable";
import { describe, expect, it } from "vitest";
import { resolveDrop, type Columns } from "./board-dnd";
import { currentNeighbours, neighbours, sameNeighbours } from "./neighbours";

const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ABCDE = items("A", "B", "C", "D", "E");

describe("neighbours", () => {
  it("empty target list -> { null, null }", () => {
    expect(neighbours([], "X", 0)).toEqual({ previousId: null, nextId: null });
  });

  it("insertion at the head -> { null, first }", () => {
    expect(neighbours(items("A", "B"), "X", 0)).toEqual({ previousId: null, nextId: "A" });
  });

  it("insertion at the tail -> { last, null }", () => {
    expect(neighbours(items("A", "B"), "X", 2)).toEqual({ previousId: "B", nextId: null });
  });

  it("between two -> { A, B }", () => {
    expect(neighbours(items("A", "B"), "X", 1)).toEqual({ previousId: "A", nextId: "B" });
  });

  it("within the list, moving down: the task is never its own neighbour", () => {
    // B (index 1) dropped on D (index 3): dnd-kit reports overIndex 3, and
    // arrayMove puts B at 3 -> A C D B E.
    expect(neighbours(ABCDE, "B", 3)).toEqual({ previousId: "D", nextId: "E" });
    // One step down: B on C.
    expect(neighbours(ABCDE, "B", 2)).toEqual({ previousId: "C", nextId: "D" });
  });

  it("within the list, moving up: idem", () => {
    // D (index 3) dropped on B (index 1) -> A D B C E.
    expect(neighbours(ABCDE, "D", 1)).toEqual({ previousId: "A", nextId: "B" });
    // To the very top.
    expect(neighbours(ABCDE, "D", 0)).toEqual({ previousId: null, nextId: "A" });
  });

  it("within the list, same spot: unchanged neighbours, a no-op", () => {
    const result = neighbours(ABCDE, "C", 2);
    expect(result).toEqual({ previousId: "B", nextId: "D" });
    expect(sameNeighbours(currentNeighbours(ABCDE, "C"), result)).toBe(true);
  });

  it("single-item list, which is the moved task -> { null, null }", () => {
    expect(neighbours(items("A"), "A", 0)).toEqual({ previousId: null, nextId: null });
  });

  it("never { null, null } on a target that is not empty once filtered", () => {
    for (let index = -2; index <= 8; index++) {
      const result = neighbours(ABCDE, "C", index);
      expect(result.previousId !== null || result.nextId !== null).toBe(true);
    }
  });

  it("the unfiltered array WOULD name the task itself (the trap this avoids)", () => {
    // Reading B's neighbours at its destination index 2 in A B C D E,
    // without removing B first: index 1 is B itself.
    expect(ABCDE[2 - 1].id).toBe("B");
    expect(neighbours(ABCDE, "B", 2).previousId).not.toBe("B");
  });
});

/**
 * The real behaviour of @dnd-kit/sortable's index within one list, checked
 * against arrayMove (what dnd-kit itself uses to reorder) for every pair:
 * overIndex is read in the array that still contains the dragged card, and
 * the card ends at overIndex. neighbours(order, id, overIndex) must then be
 * exactly the cards around it in arrayMove's result.
 */
describe("dnd-kit index within one list, every (from, to)", () => {
  const ids = ["A", "B", "C", "D", "E"];
  for (let from = 0; from < ids.length; from++) {
    for (let to = 0; to < ids.length; to++) {
      it(`${ids[from]}: ${from} -> ${to}`, () => {
        const moved = ids[from];
        const result = arrayMove(ids, from, to);
        expect(result.indexOf(moved)).toBe(to);

        const expected = {
          previousId: result[to - 1] ?? null,
          nextId: result[to + 1] ?? null,
        };
        expect(neighbours(items(...ids), moved, to)).toEqual(expected);
        expect([expected.previousId, expected.nextId]).not.toContain(moved);

        // resolveDrop: dnd-kit's over is the card that was at index `to`.
        const columns: Columns = { L: ids };
        const drop = resolveDrop(columns, moved, ids[to])!;
        expect(drop).toEqual({ listId: "L", index: to, order: result });
      });
    }
  }
});
