import { describe, expect, it } from "vitest";
import {
  addDays,
  boardLabels,
  dueStatus,
  emptyFilter,
  isFilterActive,
  matchesFilter,
  moveCard,
  moveColumn,
  parseLabels,
  parseWipLimit,
  toIsoDate,
  type BoardData,
  type Card,
  type CardFilter,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"], wipLimit: null },
    { id: "col-b", title: "B", cardIds: ["card-3"], wipLimit: null },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("parseLabels", () => {
  it("trims, drops empties, and removes case-insensitive duplicates", () => {
    expect(parseLabels(" Bug, ui ,, bug , UI,Docs ")).toEqual(["Bug", "ui", "Docs"]);
  });

  it("caps label count and length", () => {
    const many = Array.from({ length: 12 }, (_, index) => `l${index}`).join(",");
    expect(parseLabels(many)).toHaveLength(10);
    expect(parseLabels("x".repeat(40))).toEqual(["x".repeat(30)]);
  });

  it("returns no labels for blank input", () => {
    expect(parseLabels("  ")).toEqual([]);
  });
});

describe("due dates", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("classifies due dates relative to today", () => {
    expect(dueStatus("2026-11-04", "2026-11-05")).toBe("overdue");
    expect(dueStatus("2026-11-05", "2026-11-05")).toBe("today");
    expect(dueStatus("2026-12-01", "2026-11-05")).toBe("upcoming");
  });
});

describe("card filters", () => {
  const today = "2026-11-05";
  const card = (fields: Partial<Card>): Card => ({
    id: "card-1",
    title: "Write launch email",
    details: "Draft for the newsletter",
    priority: null,
    dueDate: null,
    labels: [],
    ...fields,
  });

  it("matches everything with an empty filter", () => {
    expect(isFilterActive(emptyFilter)).toBe(false);
    expect(matchesFilter(card({}), emptyFilter, today)).toBe(true);
  });

  it("treats a whitespace query as inactive", () => {
    expect(isFilterActive({ ...emptyFilter, query: "  " })).toBe(false);
  });

  it.each(["LAUNCH", "newsletter", "marketing"])(
    "matches the query %s against title, details, and labels",
    (query) => {
      expect(
        matchesFilter(card({ labels: ["Marketing"] }), { ...emptyFilter, query }, today)
      ).toBe(true);
    }
  );

  it("filters by priority and label case-insensitively", () => {
    const tagged = card({ priority: "high", labels: ["UX"] });
    expect(matchesFilter(tagged, { ...emptyFilter, priority: "high" }, today)).toBe(true);
    expect(matchesFilter(tagged, { ...emptyFilter, priority: "low" }, today)).toBe(false);
    expect(matchesFilter(tagged, { ...emptyFilter, label: "ux" }, today)).toBe(true);
    expect(matchesFilter(tagged, { ...emptyFilter, label: "Bug" }, today)).toBe(false);
  });

  it.each([
    ["overdue", "2026-11-04", true],
    ["overdue", today, false],
    ["today", today, true],
    ["week", "2026-11-12", true],
    ["week", "2026-11-13", false],
    ["week", "2026-11-04", false],
    ["none", null, true],
    ["none", today, false],
    ["overdue", null, false],
  ] as const)("due filter %s with due date %s matches: %s", (due, dueDate, expected) => {
    expect(matchesFilter(card({ dueDate }), { ...emptyFilter, due }, today)).toBe(expected);
  });

  it("requires every active criterion to match", () => {
    const filter: CardFilter = { query: "launch", priority: "high", label: "", due: "" };
    expect(matchesFilter(card({ priority: "high" }), filter, today)).toBe(true);
    expect(matchesFilter(card({ priority: "low" }), filter, today)).toBe(false);
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
  });

  it("lists distinct board labels sorted", () => {
    const board: BoardData = {
      columns: [{ id: "c", title: "C", cardIds: ["a", "b"], wipLimit: null }],
      cards: {
        a: card({ id: "a", labels: ["UX", "Bug"] }),
        b: card({ id: "b", labels: ["bug", "API"] }),
      },
    };
    expect(boardLabels(board)).toEqual(["API", "Bug", "UX"]);
  });
});

describe("columns", () => {
  const columns: Column[] = ["a", "b", "c"].map((id) => ({
    id,
    title: id,
    cardIds: [],
    wipLimit: null,
  }));
  const ids = (list: Column[]) => list.map((column) => column.id);

  it("moves a column left or right", () => {
    expect(ids(moveColumn(columns, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(moveColumn(columns, "b", 1))).toEqual(["a", "c", "b"]);
  });

  it("ignores moves past either end and unknown columns", () => {
    expect(moveColumn(columns, "a", -1)).toBe(columns);
    expect(moveColumn(columns, "c", 1)).toBe(columns);
    expect(moveColumn(columns, "missing", 1)).toBe(columns);
  });

  it.each([
    ["", null],
    ["  ", null],
    ["3", 3],
    [" 99 ", 99],
    ["0", undefined],
    ["100", undefined],
    ["2.5", undefined],
    ["abc", undefined],
  ])("parses WIP limit %j as %s", (text, expected) => {
    expect(parseWipLimit(text)).toBe(expected);
  });
});
