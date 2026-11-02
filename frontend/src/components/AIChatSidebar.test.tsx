import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import type { BoardData } from "@/lib/kanban";
import { initialData } from "@/test/fixtures";

const renderSidebar = (
  props: Partial<ComponentProps<typeof AIChatSidebar>> = {}
) =>
  render(
    <AIChatSidebar
      waitForSaves={() => Promise.resolve()}
      onBusyChange={vi.fn()}
      onBoardUpdate={vi.fn()}
      {...props}
    />
  );

describe("AIChatSidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends messages with history and displays conversation replies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reply: "There are five columns.",
            board: null,
            model: "test-model",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reply: "The board has eight cards.",
            board: null,
            model: "test-model",
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderSidebar();
    const input = screen.getByLabelText("Message the assistant");
    await user.type(input, "How many columns?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("There are five columns.")).toBeInTheDocument();

    await user.type(input, "How many cards?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The board has eight cards.")).toBeInTheDocument();

    const firstRequest = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(firstRequest).toEqual({
      message: "How many columns?",
      history: [],
    });
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(secondRequest.history).toEqual([
      { role: "user", content: "How many columns?" },
      { role: "assistant", content: "There are five columns." },
    ]);
  });

  it("applies a returned board update", async () => {
    const updatedBoard: BoardData = structuredClone(initialData);
    updatedBoard.columns[0].cardIds = ["card-2"];
    updatedBoard.columns[1].cardIds = ["card-1", "card-3"];
    const onBoardUpdate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            reply: "Moved the roadmap card to Discovery.",
            board: updatedBoard,
            model: "test-model",
          }),
          { status: 200 }
        )
      )
    );
    const user = userEvent.setup();

    renderSidebar({ onBoardUpdate });
    await user.type(
      screen.getByLabelText("Message the assistant"),
      "Move the roadmap card to Discovery."
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Moved the roadmap card to Discovery.")
    ).toBeInTheDocument();
    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard));
  });

  it("shows assistant request errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: "OpenRouter request timed out." }),
          { status: 504 }
        )
      )
    );
    const user = userEvent.setup();

    renderSidebar();
    await user.type(
      screen.getByLabelText("Message the assistant"),
      "Summarize the board."
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OpenRouter request timed out."
    );
  });

  it("waits for pending saves and reports when it is busy", async () => {
    let finishSaves = () => {};
    const waitForSaves = vi.fn(
      () => new Promise<void>((resolve) => (finishSaves = resolve))
    );
    const onBusyChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ reply: "Done.", board: null, model: "test-model" }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderSidebar({ waitForSaves, onBusyChange });
    await user.type(screen.getByLabelText("Message the assistant"), "Hi");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(fetchMock).not.toHaveBeenCalled();
    finishSaves();
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
});
