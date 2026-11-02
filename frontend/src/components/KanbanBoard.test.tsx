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

describe("KanbanBoard", () => {
  beforeEach(() => {
    persistedBoard = structuredClone(initialData);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          persistedBoard = JSON.parse(String(init.body)) as BoardData;
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
    render(<KanbanBoard />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading board...");
    expect(await screen.findAllByLabelText("Column title")).toHaveLength(5);
  });

  it("loads and persists a renamed column", async () => {
    render(<KanbanBoard />);
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
    render(<KanbanBoard />);
    const input = (await screen.findAllByLabelText("Column title"))[0];
    await userEvent.clear(input);
    await userEvent.tab();

    expect(input).toHaveValue("Backlog");
    expect(countSaves()).toBe(0);
  });

  it("persists added and removed cards", async () => {
    render(<KanbanBoard />);
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
    await vi.waitFor(() => {
      expect(
        Object.values(persistedBoard.cards).some(
          (card) => card.title === "New card"
        )
      ).toBe(true);
    });

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(
        Object.values(persistedBoard.cards).some(
          (card) => card.title === "New card"
        )
      ).toBe(false);
    });
  });

  it("shows a visible error when a board update cannot be saved", async () => {
    render(<KanbanBoard />);
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
      "Board save failed (500)."
    );
  });

  it("edits a card title and details", async () => {
    render(<KanbanBoard />);
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
    await userEvent.click(within(card).getByRole("button", { name: "Save" }));

    expect(within(card).getByText("Updated title")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(persistedBoard.cards["card-1"]).toEqual({
        id: "card-1",
        title: "Updated title",
        details: "Updated details",
      });
    });
  });

  it("cancels a card edit without saving", async () => {
    render(<KanbanBoard />);
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
    render(<KanbanBoard />);
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

    render(<KanbanBoard />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Board request failed (503)."
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
        if (String(input) === "/api/ai/assistant") {
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
    render(<KanbanBoard />);
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
});

