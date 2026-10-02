import { describe, expect, it } from "vitest";
import { columnDropId, columnOf, moveToColumn, resolveDrop, type Columns } from "./board-dnd";
import { insertBetween } from "./board-cache";
import { neighbours } from "./neighbours";

const board = (): Columns => ({ todo: ["A", "B", "C"], doing: ["D", "E"], done: [] });

describe("columnOf", () => {
  it("finds a card's column, and a column body's own list", () => {
    expect(columnOf(board(), "E")).toBe("doing");
    expect(columnOf(board(), columnDropId("done"))).toBe("done");
    expect(columnOf(board(), "Z")).toBeNull();
    expect(columnOf(board(), columnDropId("nope"))).toBeNull();
  });
});

describe("moveToColumn (onDragOver)", () => {
  it("inserts at the hovered card, or just after it", () => {
    expect(moveToColumn(board(), "A", "E", false).doing).toEqual(["D", "A", "E"]);
    expect(moveToColumn(board(), "A", "E", true).doing).toEqual(["D", "E", "A"]);
    expect(moveToColumn(board(), "A", "E", true).todo).toEqual(["B", "C"]);
  });

  it("appends when hovering the column body (empty column included)", () => {
    expect(moveToColumn(board(), "A", columnDropId("done"), false).done).toEqual(["A"]);
    expect(moveToColumn(board(), "A", columnDropId("doing"), false).doing).toEqual(["D", "E", "A"]);
  });

  it("does nothing within the same column", () => {
    const columns = board();
    expect(moveToColumn(columns, "A", "C", false)).toBe(columns);
  });
});

describe("resolveDrop + neighbours, across columns", () => {
  it("into an empty column -> { null, null }", () => {
    const columns = moveToColumn(board(), "B", columnDropId("done"), false);
    const drop = resolveDrop(columns, "B", columnDropId("done"))!;
    expect(drop).toMatchObject({ listId: "done", index: 0 });
    expect(neighbours(drop.order.map((id) => ({ id })), "B", drop.index)).toEqual({
      previousId: null,
      nextId: null,
    });
  });

  it("between two cards of another column", () => {
    const columns = moveToColumn(board(), "B", "E", false); // D B E
    const drop = resolveDrop(columns, "B", "B")!; // released over itself
    expect(drop.order).toEqual(["D", "B", "E"]);
    expect(neighbours(drop.order.map((id) => ({ id })), "B", drop.index)).toEqual({
      previousId: "D",
      nextId: "E",
    });
  });

  it("dropped before onDragOver caught up: still lands in the hovered column", () => {
    const drop = resolveDrop(board(), "A", "D")!;
    expect(drop.listId).toBe("doing");
    expect(drop.order).toEqual(["A", "D", "E"]);
  });
});

describe("insertBetween (optimistic cache update)", () => {
  const ids = (list: { id: string }[]) => list.map((item) => item.id);
  const row = (...names: string[]) => names.map((id) => ({ id }));

  it("puts the item exactly where neighbours() said", () => {
    const list = row("A", "B", "C", "D");
    for (let to = 0; to < 4; to++) {
      const at = neighbours(list, "B", to);
      expect(ids(insertBetween(list, { id: "B" }, at)).indexOf("B")).toBe(to);
    }
  });

  it("empty target, unknown neighbours", () => {
    expect(ids(insertBetween([], { id: "X" }, { previousId: null, nextId: null }))).toEqual(["X"]);
    expect(ids(insertBetween(row("A"), { id: "X" }, { previousId: "gone", nextId: null }))).toEqual([
      "A",
      "X",
    ]);
  });
});
