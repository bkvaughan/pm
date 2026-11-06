import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { initialData } from "@/test/fixtures";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];
const countSaves = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "PUT").length;

let persistedBoard: BoardData;
let saveCount = 0;
// One activity entry per save, so tests can see the panel refetch.
const activityEntries = () =>
  Array.from({ length: saveCount }, (_, index) => ({
    id: index + 1,
    source: "user",
    message: `Save ${index + 1}`,
    createdAt: new Date().toISOString(),
  })).reverse();

describe("KanbanBoard", () => {
  beforeEach(() => {
    persistedBoard = structuredClone(initialData);
    saveCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/activity")) {
          return new Response(JSON.stringify(activityEntries()), { status: 200 });
        }
        if (init?.method === "PUT") {
          persistedBoard = JSON.parse(String(init.body)) as BoardData;
          saveCount += 1;
        }
        return new Response(JSON.stringify(persistedBoard), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and renders five columns", async () => {
    render(<KanbanBoard boardId="board-1" />);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/boards/board-1");
    expect(screen.getByRole("status")).toHaveTextContent("Loading board...");
    expect(await screen.findAllByLabelText("Column title")).toHaveLength(5);
  });

  it("loads and persists a renamed column", async () => {
    render(<KanbanBoard boardId="board-1" />);
    const input = (await screen.findAllByLabelText("Column title"))[0];
    await userEvent.clear(input);
    await userEvent.type(input, "New Name{Enter}");
    await vi.waitFor(() => {
      expect(persistedBoard.columns[0].title).toBe("New Name");
    });
    expect(screen.getAllByLabelText("Column title")[0]).toHaveValue("New Name");
    expect(countSaves()).toBe(1);
  });

  it("restores an emptied column title without saving", async () => {
    render(<KanbanBoard boardId="board-1" />);
    const input = (await screen.findAllByLabelText("Column title"))[0];
    await userEvent.clear(input);
    await userEvent.tab();

    expect(input).toHaveValue("Backlog");
    expect(countSaves()).toBe(0);
  });

  it("persists added, archived, restored, and deleted cards", async () => {
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = await within(column).findByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();
    const newCard = () =>
      Object.values(persistedBoard.cards).find((card) => card.title === "New card");
    await vi.waitFor(() => expect(newCard()).toBeDefined());
    expect(newCard()).toMatchObject({
      details: "Notes",
      priority: null,
      dueDate: null,
      labels: [],
      checklist: [],
      archived: false,
    });

    // Archiving hides the card but keeps it, in place, in its column.
    await userEvent.click(within(column).getByRole("button", { name: "Archive New card" }));
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    expect(within(column).getByTestId("count-badge")).toHaveTextContent("2");
    await vi.waitFor(() => expect(newCard()?.archived).toBe(true));
    expect(persistedBoard.columns[0].cardIds).toContain(newCard()!.id);

    await userEvent.click(screen.getByRole("tab", { name: "Archived (1)" }));
    const archived = screen.getByRole("list", { name: "Archived cards" });
    expect(within(archived).getByText("From Backlog")).toBeInTheDocument();
    await userEvent.click(within(archived).getByRole("button", { name: "Restore New card" }));
    expect(within(column).getByText("New card")).toBeInTheDocument();
    expect(screen.getByText(/No archived cards/)).toBeInTheDocument();
    await vi.waitFor(() => expect(newCard()?.archived).toBe(false));

    await userEvent.click(within(column).getByRole("button", { name: "Archive New card" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete New card permanently" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("New card")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete New card permanently" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByText("New card")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Archived" })).toBeInTheDocument();
    await vi.waitFor(() => expect(newCard()).toBeUndefined());
    expect(persistedBoard.columns[0].cardIds).toEqual(["card-1", "card-2"]);
  });

  it("leaves archived cards out of counts and filters", async () => {
    persistedBoard.cards["card-1"].archived = true;
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");

    expect(screen.getByText("5 columns, 7 cards")).toBeInTheDocument();
    expect(within(getFirstColumn()).getByTestId("count-badge")).toHaveTextContent("1");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
    expect(screen.getByTestId("filter-summary")).toHaveTextContent("Showing 1 of 7 cards");
  });

  it("shows a visible error when a board update cannot be saved", async () => {
    render(<KanbanBoard boardId="board-1" />);
    const firstTitle = (await screen.findAllByLabelText("Column title"))[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return new Response("save failed", { status: 500 });
        }
        return new Response(JSON.stringify(initialData), { status: 200 });
      })
    );

    await userEvent.clear(firstTitle);
    await userEvent.type(firstTitle, "Unsaved name{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to save changes: Request failed (500)."
    );
  });

  it("edits a card title and details", async () => {
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: "Edit Align roadmap themes" })
    );

    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    const detailsInput = within(card).getByLabelText("Card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Updated details");
    expect(within(card).getByLabelText("Priority")).toHaveValue("high");
    expect(within(card).getByLabelText("Labels")).toHaveValue("Planning");
    await userEvent.selectOptions(within(card).getByLabelText("Priority"), "low");
    await userEvent.type(within(card).getByLabelText("Due date"), "2030-01-15");
    const labelsInput = within(card).getByLabelText("Labels");
    await userEvent.clear(labelsInput);
    await userEvent.type(labelsInput, "Roadmap, roadmap , Q1");
    await userEvent.click(within(card).getByRole("button", { name: "Save" }));

    expect(within(card).getByText("Updated title")).toBeInTheDocument();
    expect(within(card).getByText("Low priority")).toBeInTheDocument();
    expect(within(card).getByText("Q1")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(persistedBoard.cards["card-1"]).toEqual({
        id: "card-1",
        title: "Updated title",
        details: "Updated details",
        priority: "low",
        dueDate: "2030-01-15",
        labels: ["Roadmap", "Q1"],
        checklist: [],
        archived: false,
      });
    });
  });

  it("clears card priority, due date, and labels", async () => {
    persistedBoard.cards["card-1"].dueDate = "2030-01-15";
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: "Edit Align roadmap themes" })
    );

    await userEvent.selectOptions(within(card).getByLabelText("Priority"), "");
    await userEvent.clear(within(card).getByLabelText("Due date"));
    await userEvent.clear(within(card).getByLabelText("Labels"));
    await userEvent.click(within(card).getByRole("button", { name: "Save" }));

    expect(within(card).queryByTestId("badges")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(persistedBoard.cards["card-1"]).toMatchObject({
        priority: null,
        dueDate: null,
        labels: [],
      });
    });
  });

  it("cancels a card edit without saving", async () => {
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: "Edit Align roadmap themes" })
    );
    await userEvent.clear(within(card).getByLabelText("Card title"));
    await userEvent.click(within(card).getByRole("button", { name: "Cancel" }));

    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(countSaves()).toBe(0);
  });

  it("reloads the saved board after a failed save", async () => {
    render(<KanbanBoard boardId="board-1" />);
    const firstTitle = (await screen.findAllByLabelText("Column title"))[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return new Response("save failed", { status: 500 });
        }
        return new Response(JSON.stringify(initialData), { status: 200 });
      })
    );

    await userEvent.clear(firstTitle);
    await userEvent.type(firstTitle, "Unsaved name{Enter}");
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Reload board" }));

    await vi.waitFor(() => {
      expect(screen.getAllByLabelText("Column title")[0]).toHaveValue("Backlog");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a visible load error and retries the board request", async () => {
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        requests += 1;
        if (requests === 1) {
          return new Response("unavailable", { status: 503 });
        }
        return new Response(JSON.stringify(initialData), { status: 200 });
      })
    );

    render(<KanbanBoard boardId="board-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Request failed (503)."
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findAllByLabelText("Column title")).toHaveLength(5);
    expect(requests).toBe(2);
  });

  it("locks the board during an assistant request and applies its saved board", async () => {
    const updatedBoard = structuredClone(initialData);
    updatedBoard.columns[0].title = "Ideas";
    let finishAssistant = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/boards/board-1/assistant") {
          await new Promise<void>((resolve) => (finishAssistant = resolve));
          return new Response(
            JSON.stringify({ reply: "Renamed.", board: updatedBoard, model: "m" }),
            { status: 200 }
          );
        }
        if (init?.method === "PUT") {
          persistedBoard = JSON.parse(String(init.body)) as BoardData;
        }
        return new Response(JSON.stringify(persistedBoard), { status: 200 });
      })
    );
    const user = userEvent.setup();
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");

    await user.type(screen.getByLabelText("Message the assistant"), "Rename");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const board = screen.getByRole("main");
    await vi.waitFor(() => expect(board).toHaveAttribute("inert"));
    expect(screen.getByTestId("board-save-status")).toHaveTextContent(
      "Board is locked while the assistant works..."
    );

    finishAssistant();
    expect(await screen.findByText("Renamed.")).toBeInTheDocument();
    expect(board).not.toHaveAttribute("inert");
    expect(screen.getAllByLabelText("Column title")[0]).toHaveValue("Ideas");
    expect(countSaves()).toBe(0);
  });

  it("adds a column at the end of the board", async () => {
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    await userEvent.type(screen.getByLabelText("New column title"), "Blocked{Enter}");

    expect(screen.getAllByLabelText("Column title")).toHaveLength(6);
    await vi.waitFor(() => {
      expect(persistedBoard.columns.at(-1)).toMatchObject({
        title: "Blocked",
        cardIds: [],
      });
    });
  });

  it("deletes a column and its cards after confirmation", async () => {
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");
    const column = screen.getByTestId("column-col-backlog");
    await userEvent.click(
      within(column).getByRole("button", { name: "Column options for Backlog" })
    );
    await userEvent.click(
      within(column).getByRole("button", { name: "Delete column Backlog" })
    );
    expect(within(column).getByText("Delete this column and its 2 cards?")).toBeInTheDocument();
    await userEvent.click(within(column).getByRole("button", { name: "Delete" }));

    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(persistedBoard.columns.map((c) => c.id)).not.toContain("col-backlog");
    });
    expect(persistedBoard.cards["card-1"]).toBeUndefined();
    expect(persistedBoard.cards["card-2"]).toBeUndefined();
  });

  it("hides column delete when only one column remains", async () => {
    const singleColumn: BoardData = {
      columns: [{ id: "col-only", title: "Only", cardIds: [], wipLimit: null }],
      cards: {},
    };
    persistedBoard = singleColumn;
    render(<KanbanBoard boardId="board-1" />);
    await screen.findAllByLabelText("Column title");
    await userEvent.click(screen.getByRole("button", { name: "Column options for Only" }));

    expect(screen.getByTestId("options-panel")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete column Only" })
    ).not.toBeInTheDocument();
    expect(countSaves()).toBe(0);
  });

  describe("filters", () => {
    const visibleCardIds = () =>
      screen
        .getAllByTestId(/^card-card-/)
        .map((element) => element.dataset.testid?.replace("card-", ""));

    it("searches titles, details, and labels", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");

      await userEvent.type(screen.getByLabelText("Search cards"), "design");

      // card-3 has the Design label; card-5 has it in its title and label.
      expect(visibleCardIds()).toEqual(["card-3", "card-5"]);
      expect(screen.getByTestId("filter-summary")).toHaveTextContent(
        "Showing 2 of 8 cards"
      );
      const backlog = screen.getByTestId("column-col-backlog");
      expect(within(backlog).getByText("No matching cards")).toBeInTheDocument();
      expect(within(backlog).getByLabelText("0 of 2 cards shown")).toHaveTextContent(
        "0/2"
      );
    });

    it("combines priority and label filters and clears them", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");

      const labelSelect = screen.getByLabelText("Filter by label");
      expect(
        within(labelSelect)
          .getAllByRole("option")
          .map((option) => option.textContent)
      ).toEqual(["Any label", "Analytics", "Design", "Marketing", "Planning", "QA", "Research"]);

      await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
      expect(visibleCardIds()).toEqual(["card-1", "card-5"]);
      await userEvent.selectOptions(labelSelect, "Design");
      expect(visibleCardIds()).toEqual(["card-5"]);

      await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(visibleCardIds()).toHaveLength(8);
      expect(screen.queryByTestId("filter-summary")).not.toBeInTheDocument();
    });

    it("filters by due date", async () => {
      persistedBoard.cards["card-2"].dueDate = "2000-01-01";
      persistedBoard.cards["card-6"].dueDate = "2999-01-01";
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");

      await userEvent.selectOptions(screen.getByLabelText("Filter by due date"), "overdue");
      expect(visibleCardIds()).toEqual(["card-2"]);
      await userEvent.selectOptions(screen.getByLabelText("Filter by due date"), "none");
      expect(visibleCardIds()).toHaveLength(6);
    });

    it("keeps hidden cards when saving while filtered", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
      expect(visibleCardIds()).toEqual(["card-1"]);

      const card = screen.getByTestId("card-card-1");
      await userEvent.click(
        within(card).getByRole("button", { name: "Edit Align roadmap themes" })
      );
      const title = within(card).getByLabelText("Card title");
      await userEvent.clear(title);
      await userEvent.type(title, "Align roadmap");
      await userEvent.click(within(card).getByRole("button", { name: "Save" }));

      await vi.waitFor(() =>
        expect(persistedBoard.cards["card-1"].title).toBe("Align roadmap")
      );
      expect(Object.keys(persistedBoard.cards)).toHaveLength(8);
      expect(persistedBoard.columns[0].cardIds).toEqual(["card-1", "card-2"]);
    });

    it("counts hidden cards when confirming a column delete", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");

      const backlog = screen.getByTestId("column-col-backlog");
      await userEvent.click(
        within(backlog).getByRole("button", { name: "Column options for Backlog" })
      );
      await userEvent.click(
        within(backlog).getByRole("button", { name: "Delete column Backlog" })
      );

      expect(
        within(backlog).getByText("Delete this column and its 2 cards?")
      ).toBeInTheDocument();
    });
  });

  describe("checklists", () => {
    it("shows progress and toggles an item from the card", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");
      const card = screen.getByTestId("card-card-5");
      expect(within(card).getByTestId("checklist-progress")).toHaveTextContent(
        "Checklist 1/2"
      );

      await userEvent.click(within(card).getByLabelText("Set spacing tokens"));

      expect(within(card).getByTestId("checklist-progress")).toHaveTextContent(
        "Checklist 2/2"
      );
      await vi.waitFor(() => {
        expect(persistedBoard.cards["card-5"].checklist).toEqual([
          { id: "item-1", text: "Pick a type scale", done: true },
          { id: "item-2", text: "Set spacing tokens", done: true },
        ]);
      });
      expect(persistedBoard.cards["card-5"].title).toBe("Design card layout");
    });

    it("hides the checklist when a card has none", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");

      expect(
        within(screen.getByTestId("card-card-1")).queryByTestId("checklist-progress")
      ).not.toBeInTheDocument();
    });

    it("adds, renames, and removes items in the card editor", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");
      const card = screen.getByTestId("card-card-5");
      await userEvent.click(
        within(card).getByRole("button", { name: "Edit Design card layout" })
      );

      // Enter adds the item rather than saving the card.
      await userEvent.type(within(card).getByLabelText("New checklist item"), "Ship it{Enter}");
      expect(within(card).getByLabelText("Checklist item 3")).toHaveValue("Ship it");
      expect(within(card).getByLabelText("New checklist item")).toHaveValue("");
      await userEvent.type(within(card).getByLabelText("New checklist item"), "   ");
      await userEvent.click(within(card).getByRole("button", { name: "Add item" }));
      expect(within(card).queryByLabelText("Checklist item 4")).not.toBeInTheDocument();

      const first = within(card).getByLabelText("Checklist item 1");
      await userEvent.clear(first);
      await userEvent.type(first, "Pick fonts");
      await userEvent.click(within(card).getByLabelText("Done: checklist item 3"));
      await userEvent.click(
        within(card).getByRole("button", { name: "Remove checklist item 2" })
      );
      await userEvent.click(within(card).getByRole("button", { name: "Save" }));

      expect(within(card).getByTestId("checklist-progress")).toHaveTextContent(
        "Checklist 2/2"
      );
      await vi.waitFor(() => {
        const items = persistedBoard.cards["card-5"].checklist;
        expect(items.map(({ text, done }) => [text, done])).toEqual([
          ["Pick fonts", true],
          ["Ship it", true],
        ]);
      });
    });

    it("drops blank items when saving", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");
      const card = screen.getByTestId("card-card-5");
      await userEvent.click(
        within(card).getByRole("button", { name: "Edit Design card layout" })
      );

      await userEvent.clear(within(card).getByLabelText("Checklist item 2"));
      await userEvent.click(within(card).getByRole("button", { name: "Save" }));

      await vi.waitFor(() => {
        expect(persistedBoard.cards["card-5"].checklist).toEqual([
          { id: "item-1", text: "Pick a type scale", done: true },
        ]);
      });
    });
  });

  describe("column options", () => {
    const openOptions = async (title: string) => {
      await userEvent.click(
        screen.getByRole("button", { name: `Column options for ${title}` })
      );
      return screen.getByTestId(`column-${columnIdByTitle[title]}`);
    };
    const columnIdByTitle: Record<string, string> = {
      Backlog: "col-backlog",
      "In Progress": "col-progress",
      Done: "col-done",
    };
    const columnOrder = () =>
      screen.getAllByTestId(/^column-col-/).map((element) => element.dataset.testid);

    it("moves columns left and right and persists the order", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");

      const backlog = await openOptions("Backlog");
      expect(within(backlog).getByRole("button", { name: "Move left" })).toBeDisabled();
      await userEvent.click(within(backlog).getByRole("button", { name: "Move right" }));

      expect(columnOrder().slice(0, 2)).toEqual(["column-col-discovery", "column-col-backlog"]);
      await vi.waitFor(() =>
        expect(persistedBoard.columns.map((column) => column.id)).toEqual([
          "col-discovery",
          "col-backlog",
          "col-progress",
          "col-review",
          "col-done",
        ])
      );
      const done = await openOptions("Done");
      expect(within(done).getByRole("button", { name: "Move right" })).toBeDisabled();
      await userEvent.click(within(done).getByRole("button", { name: "Move left" }));
      expect(columnOrder().slice(-2)).toEqual(["column-col-done", "column-col-review"]);
    });

    it("shows WIP limits and flags columns over their limit", async () => {
      persistedBoard.columns[3].cardIds = ["card-6", "card-7", "card-8"];
      persistedBoard.columns[4].cardIds = [];
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");

      const progress = within(screen.getByTestId("column-col-progress")).getByTestId(
        "count-badge"
      );
      expect(progress).toHaveTextContent("2/3");
      expect(progress).toHaveAccessibleName("2 cards, within the WIP limit of 3");
      const review = within(screen.getByTestId("column-col-review")).getByTestId(
        "count-badge"
      );
      expect(review).toHaveTextContent("3/2");
      expect(review).toHaveAccessibleName("3 cards, over the WIP limit of 2");
      expect(review).toHaveClass("bg-red-600");
    });

    it("sets, clears, and rejects invalid WIP limits", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");
      const backlog = await openOptions("Backlog");
      // The input remounts when the saved limit changes, so query it each time.
      const input = () => within(backlog).getByLabelText("WIP limit");

      await userEvent.type(input(), "1{Enter}");
      await vi.waitFor(() => expect(persistedBoard.columns[0].wipLimit).toBe(1));
      expect(within(backlog).getByTestId("count-badge")).toHaveTextContent("2/1");

      await userEvent.clear(input());
      await userEvent.type(input(), "0{Enter}");
      expect(input()).toHaveValue(1);

      await userEvent.clear(input());
      await userEvent.tab();
      await vi.waitFor(() => expect(persistedBoard.columns[0].wipLimit).toBeNull());
      expect(within(backlog).getByTestId("count-badge")).toHaveTextContent("2");
      expect(countSaves()).toBe(2);
    });
  });

  describe("sidebar", () => {
    it("switches tabs without losing the assistant draft", async () => {
      render(<KanbanBoard boardId="board-1" />);
      await screen.findAllByLabelText("Column title");
      await userEvent.type(screen.getByLabelText("Message the assistant"), "Draft");

      await userEvent.click(screen.getByRole("tab", { name: "Activity" }));
      expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
      expect(screen.getByLabelText("Message the assistant")).not.toBeVisible();

      await userEvent.click(screen.getByRole("tab", { name: "Assistant" }));
      expect(screen.getByLabelText("Message the assistant")).toHaveValue("Draft");
      expect(screen.queryByRole("region", { name: "Board activity" })).not.toBeInTheDocument();
    });

    it("refreshes activity after a board save", async () => {
      render(<KanbanBoard boardId="board-1" />);
      const input = (await screen.findAllByLabelText("Column title"))[0];
      await userEvent.click(screen.getByRole("tab", { name: "Activity" }));
      await screen.findByText("No activity yet.");

      await userEvent.clear(input);
      await userEvent.type(input, "Ideas{Enter}");

      expect(await screen.findByText("Save 1")).toBeInTheDocument();
    });
  });
});
