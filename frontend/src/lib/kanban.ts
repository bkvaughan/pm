export type Priority = "low" | "medium" | "high";

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  dueDate: string | null; // YYYY-MM-DD
  labels: string[];
};

export type CardFields = Omit<Card, "id">;

export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;

// "Bug, ui , bug" -> ["Bug", "ui"]: trimmed, case-insensitively unique, capped.
export const parseLabels = (text: string): string[] => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of text.split(",")) {
    const label = raw.trim().slice(0, MAX_LABEL_LENGTH);
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      labels.push(label);
    }
  }
  return labels.slice(0, MAX_LABELS);
};

// Local calendar date as YYYY-MM-DD, comparable with Card.dueDate.
export const toIsoDate = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

export type DueStatus = "overdue" | "today" | "upcoming";

export const dueStatus = (dueDate: string, today: string): DueStatus =>
  dueDate < today ? "overdue" : dueDate === today ? "today" : "upcoming";

export const formatDueDate = (dueDate: string) =>
  new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
  wipLimit: number | null;
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

// Swap a column with its neighbour; moving past either end is a no-op.
export const moveColumn = (columns: Column[], columnId: string, offset: -1 | 1) => {
  const index = columns.findIndex((column) => column.id === columnId);
  const target = index + offset;
  if (index === -1 || target < 0 || target >= columns.length) {
    return columns;
  }
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const MAX_WIP_LIMIT = 99;

// "" -> null (no limit); otherwise a whole number from 1 to MAX_WIP_LIMIT.
export const parseWipLimit = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 1 && value <= MAX_WIP_LIMIT
    ? value
    : undefined;
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

export type DueFilter = "" | "overdue" | "today" | "week" | "none";

export type CardFilter = {
  query: string;
  priority: Priority | "";
  label: string;
  due: DueFilter;
};

export const emptyFilter: CardFilter = { query: "", priority: "", label: "", due: "" };

export const isFilterActive = (filter: CardFilter) =>
  Boolean(filter.query.trim() || filter.priority || filter.label || filter.due);

export const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

const matchesDue = (dueDate: string | null, due: DueFilter, today: string) => {
  switch (due) {
    case "":
      return true;
    case "none":
      return dueDate === null;
    case "overdue":
      return dueDate !== null && dueDate < today;
    case "today":
      return dueDate === today;
    case "week":
      return dueDate !== null && dueDate >= today && dueDate <= addDays(today, 7);
  }
};

// Every active criterion must match; the query matches title, details, or a label.
export const matchesFilter = (card: Card, filter: CardFilter, today: string) => {
  const query = filter.query.trim().toLowerCase();
  const matchesQuery =
    !query ||
    [card.title, card.details, ...card.labels].some((text) =>
      text.toLowerCase().includes(query)
    );
  return (
    matchesQuery &&
    (!filter.priority || card.priority === filter.priority) &&
    (!filter.label ||
      card.labels.some((label) => label.toLowerCase() === filter.label.toLowerCase())) &&
    matchesDue(card.dueDate, filter.due, today)
  );
};

// Distinct labels on a board, sorted, using the first spelling seen.
export const boardLabels = (board: BoardData) => {
  const labels = new Map<string, string>();
  for (const card of Object.values(board.cards)) {
    for (const label of card.labels) {
      if (!labels.has(label.toLowerCase())) {
        labels.set(label.toLowerCase(), label);
      }
    }
  }
  return [...labels.values()].sort((a, b) => a.localeCompare(b));
};
