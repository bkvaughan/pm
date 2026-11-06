import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardsHome } from "@/components/BoardsHome";
import type { BoardSummary } from "@/lib/api";
import { mockFetch, requestsTo } from "@/test/mockFetch";

const summary = (id: string, name: string, cardCount = 0): BoardSummary => ({
  id,
  name,
  cardCount,
  createdAt: "2026-11-01T10:00:00+00:00",
  updatedAt: "2026-11-02T10:00:00+00:00",
});

describe("BoardsHome", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists boards with card counts and opens one", async () => {
    const roadmap = summary("board-1", "Roadmap", 8);
    mockFetch({
      "GET /api/boards": () => ({ body: [roadmap, summary("board-2", "Launch", 1)] }),
    });
    const onOpenBoard = vi.fn();
    render(<BoardsHome onOpenBoard={onOpenBoard} />);

    const tile = await screen.findByTestId("board-tile-board-1");
    expect(within(tile).getByText(/8 cards/)).toBeInTheDocument();
    expect(screen.getByTestId("board-tile-board-2")).toHaveTextContent("1 card -");
    await userEvent.click(within(tile).getByRole("button", { name: "Roadmap" }));

    expect(onOpenBoard).toHaveBeenCalledWith(roadmap);
  });

  it("shows an empty state", async () => {
    mockFetch({ "GET /api/boards": () => ({ body: [] }) });
    render(<BoardsHome onOpenBoard={vi.fn()} />);

    expect(await screen.findByText(/You have no boards yet/)).toBeInTheDocument();
  });

  it("creates a board and opens it", async () => {
    const created = summary("board-3", "Hiring");
    const fetchMock = mockFetch({
      "GET /api/boards": () => ({ body: [] }),
      "POST /api/boards": () => ({ status: 201, body: created }),
    });
    const onOpenBoard = vi.fn();
    render(<BoardsHome onOpenBoard={onOpenBoard} />);
    await screen.findByText(/You have no boards yet/);

    expect(screen.getByRole("button", { name: "Create board" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("New board name"), "  Hiring ");
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));

    await vi.waitFor(() => expect(onOpenBoard).toHaveBeenCalledWith(created));
    expect(requestsTo(fetchMock, "POST /api/boards")).toEqual([{ name: "Hiring" }]);
  });

  it("renames a board", async () => {
    const fetchMock = mockFetch({
      "GET /api/boards": () => ({ body: [summary("board-1", "Roadmap")] }),
      "PATCH /api/boards/board-1": () => ({ body: summary("board-1", "Roadmap 2027") }),
    });
    render(<BoardsHome onOpenBoard={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Rename Roadmap" }));
    const input = screen.getByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.type(input, "Roadmap 2027{Enter}");

    expect(
      await screen.findByRole("button", { name: "Roadmap 2027" })
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, "PATCH /api/boards/board-1")).toEqual([
      { name: "Roadmap 2027" },
    ]);
  });

  it("deletes a board only after confirmation", async () => {
    const fetchMock = mockFetch({
      "GET /api/boards": () => ({
        body: [summary("board-1", "Roadmap"), summary("board-2", "Launch")],
      }),
      "DELETE /api/boards/board-1": () => ({ status: 204 }),
    });
    render(<BoardsHome onOpenBoard={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Delete Roadmap" }));
    const tile = screen.getByTestId("board-tile-board-1");
    await userEvent.click(within(tile).getByRole("button", { name: "Cancel" }));
    expect(requestsTo(fetchMock, "DELETE /api/boards/board-1")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Delete Roadmap" }));
    await userEvent.click(within(tile).getByRole("button", { name: "Delete" }));

    await vi.waitFor(() =>
      expect(screen.queryByTestId("board-tile-board-1")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("board-tile-board-2")).toBeInTheDocument();
  });

  it("shows load errors and retries", async () => {
    let attempts = 0;
    mockFetch({
      "GET /api/boards": () => {
        attempts += 1;
        return attempts === 1
          ? { status: 503, body: { detail: "Service unavailable." } }
          : { body: [summary("board-1", "Roadmap")] };
      },
    });
    render(<BoardsHome onOpenBoard={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable.");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByTestId("board-tile-board-1")).toBeInTheDocument();
  });
});
