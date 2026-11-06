import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanel, formatRelativeTime } from "@/components/ActivityPanel";
import { mockFetch, requestsTo } from "@/test/mockFetch";

const url = "GET /api/boards/board-1/activity";

describe("formatRelativeTime", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it.each([
    ["2026-11-05T11:59:30Z", "just now"],
    ["2026-11-05T11:15:00Z", "45m ago"],
    ["2026-11-05T09:00:00Z", "3h ago"],
  ])("formats %s as %s", (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it("uses a date for entries older than a day", () => {
    expect(formatRelativeTime("2026-11-01T12:00:00Z", now)).toMatch(/Nov|11/);
  });
});

describe("ActivityPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists entries newest first and marks assistant changes", async () => {
    mockFetch({
      [url]: () => ({
        body: [
          {
            id: 2,
            source: "assistant",
            message: 'Moved card "A" from "To Do" to "Done"',
            createdAt: new Date().toISOString(),
          },
          {
            id: 1,
            source: "user",
            message: 'Created board "Roadmap"',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    render(<ActivityPanel boardId="board-1" version={0} />);

    const items = within(await screen.findByRole("list", { name: "Recent changes" }))
      .getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      'Moved card "A" from "To Do" to "Done"just nowAssistant',
      'Created board "Roadmap"just now',
    ]);
  });

  it("shows empty and error states", async () => {
    mockFetch({ [url]: () => ({ body: [] }) });
    const { unmount } = render(<ActivityPanel boardId="board-1" version={0} />);
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
    unmount();

    mockFetch({ [url]: () => ({ status: 500, body: { detail: "Database locked." } }) });
    render(<ActivityPanel boardId="board-1" version={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Database locked.");
  });

  it("refetches when the version changes", async () => {
    let calls = 0;
    const fetchMock = mockFetch({
      [url]: () => {
        calls += 1;
        return {
          body:
            calls === 1
              ? []
              : [{ id: 1, source: "user", message: "Renamed", createdAt: new Date().toISOString() }],
        };
      },
    });
    const { rerender } = render(<ActivityPanel boardId="board-1" version={0} />);
    await screen.findByText("No activity yet.");

    rerender(<ActivityPanel boardId="board-1" version={1} />);

    expect(await screen.findByText("Renamed")).toBeInTheDocument();
    expect(requestsTo(fetchMock, url)).toHaveLength(2);
  });
});
