"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type BoardSummary } from "@/lib/api";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";

type BoardsHomeProps = {
  onOpenBoard: (board: BoardSummary) => void;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export const BoardsHome = ({ onOpenBoard }: BoardsHomeProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const loadBoards = useCallback(
    () =>
      api.listBoards().then(setBoards, (loadError: unknown) =>
        setError(messageOf(loadError))
      ),
    []
  );

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      return;
    }
    setError(null);
    try {
      const board = await api.createBoard(name);
      setNewName("");
      onOpenBoard(board);
    } catch (createError) {
      setError(messageOf(createError));
    }
  };

  const handleRename = async (boardId: string, name: string) => {
    setError(null);
    try {
      const renamed = await api.renameBoard(boardId, name);
      setBoards((current) =>
        (current ?? []).map((board) => (board.id === boardId ? renamed : board))
      );
    } catch (renameError) {
      setError(messageOf(renameError));
    }
  };

  const handleDelete = async (boardId: string) => {
    setError(null);
    try {
      await api.deleteBoard(boardId);
      setBoards((current) => (current ?? []).filter((board) => board.id !== boardId));
    } catch (deleteError) {
      setError(messageOf(deleteError));
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Your boards
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-text)]">
            Each board has its own columns, cards, and assistant.
          </p>
        </div>
        <form onSubmit={handleCreate} className="flex gap-2">
          <label htmlFor="new-board-name" className="sr-only">
            New board name
          </label>
          <input
            id="new-board-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New board name"
            maxLength={100}
            className="w-56 rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <PlusIcon width={14} height={14} />
            Create board
          </button>
        </form>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-3">
          <p role="alert" className="text-sm font-semibold text-red-700">
            {error}
          </p>
          {!boards && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                void loadBoards();
              }}
              className="rounded-lg border border-[var(--stroke)] bg-white px-3 py-1 text-xs font-semibold text-[var(--navy-dark)]"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!boards && !error && (
        <p role="status" className="mt-8 text-sm font-semibold text-[var(--gray-text)]">
          Loading boards...
        </p>
      )}

      {boards && boards.length === 0 && (
        <p className="mt-8 rounded-2xl border border-dashed border-[rgba(3,33,71,0.15)] p-8 text-center text-sm text-[var(--gray-text)]">
          You have no boards yet. Create one to get started.
        </p>
      )}

      {boards && boards.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <BoardTile
              key={board.id}
              board={board}
              onOpen={() => onOpenBoard(board)}
              onRename={(name) => void handleRename(board.id, name)}
              onDelete={() => void handleDelete(board.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
};

type BoardTileProps = {
  board: BoardSummary;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
};

const BoardTile = ({ board, onOpen, onRename, onDelete }: BoardTileProps) => {
  const [mode, setMode] = useState<"view" | "rename" | "confirmDelete">("view");
  const [name, setName] = useState(board.name);

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== board.name) {
      onRename(trimmed);
    }
    setMode("view");
  };

  return (
    <li
      data-testid={`board-tile-${board.id}`}
      className="group relative flex flex-col rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[0_4px_12px_rgba(3,33,71,0.06)] transition hover:border-[rgba(32,157,215,0.35)]"
    >
      <span className="absolute inset-x-4 top-0 h-0.5 rounded-b bg-[var(--accent-yellow)]" />
      {mode === "rename" ? (
        <form onSubmit={handleRename} className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Board name"
            maxLength={100}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-[var(--stroke)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            Save
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="pr-14 text-left font-display text-base font-semibold text-[var(--navy-dark)] hover:text-[var(--primary-blue)]"
        >
          {board.name}
        </button>
      )}
      <p className="mt-2 text-xs text-[var(--gray-text)]">
        {board.cardCount} {board.cardCount === 1 ? "card" : "cards"} - Updated{" "}
        {formatDate(board.updatedAt)}
      </p>

      {mode === "confirmDelete" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs">
          <span className="flex-1 font-semibold text-red-700">
            Delete this board and its cards?
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="rounded-md px-2.5 py-1 font-semibold text-[var(--gray-text)]"
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "view" && (
        <div className="absolute right-3 top-3 flex gap-0.5">
          <button
            type="button"
            onClick={() => {
              setName(board.name);
              setMode("rename");
            }}
            aria-label={`Rename ${board.name}`}
            title="Rename"
            className="rounded-md p-1.5 text-[var(--gray-text)] hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
          >
            <PencilIcon width={14} height={14} />
          </button>
          <button
            type="button"
            onClick={() => setMode("confirmDelete")}
            aria-label={`Delete ${board.name}`}
            title="Delete"
            className="rounded-md p-1.5 text-[var(--gray-text)] hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon width={14} height={14} />
          </button>
        </div>
      )}
    </li>
  );
};
