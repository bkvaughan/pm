import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardMeta } from "@/components/CardMeta";
import { toIsoDate, type Card } from "@/lib/kanban";

const card = (fields: Partial<Card>): Card => ({
  id: "card-1",
  title: "Task",
  details: "",
  priority: null,
  dueDate: null,
  labels: [],
  checklist: [],
  archived: false,
  ...fields,
});

const daysFromToday = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

describe("CardMeta", () => {
  it("renders nothing for a card without details", () => {
    const { container } = render(<CardMeta card={card({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows priority and labels", () => {
    render(<CardMeta card={card({ priority: "high", labels: ["Bug", "UI"] })} />);

    expect(screen.getByText("High priority")).toBeInTheDocument();
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("UI")).toBeInTheDocument();
  });

  it.each([
    [-1, "overdue", /^Overdue /],
    [0, "today", /^Due today$/],
    [3, "upcoming", /^Due /],
  ])("marks a due date %i days away as %s", (days, status, text) => {
    render(<CardMeta card={card({ dueDate: daysFromToday(days) })} />);

    const due = screen.getByText(text);
    expect(due).toHaveAttribute("data-due-status", status);
  });
});
