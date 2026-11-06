"use client";

import { useEffect, useState } from "react";
import { api, type BoardSummary, type User } from "@/lib/api";
import { AuthScreen } from "@/components/AuthScreen";
import { BoardsHome } from "@/components/BoardsHome";
import { KanbanBoard } from "@/components/KanbanBoard";
import { AccountSettings } from "@/components/AccountSettings";
import { LogOutIcon, UserIcon } from "@/components/icons";

type View =
  | { kind: "boards" }
  | { kind: "board"; board: BoardSummary }
  | { kind: "account" };

const BOARD_PARAM = "board";

const setBoardParam = (boardId: string | null) => {
  const url = new URL(window.location.href);
  if (boardId) {
    url.searchParams.set(BOARD_PARAM, boardId);
  } else {
    url.searchParams.delete(BOARD_PARAM);
  }
  window.history.replaceState(null, "", url);
};

// Reopen the board named in the URL so a reload keeps the user in place.
const initialView = async (): Promise<View> => {
  const boardId = new URLSearchParams(window.location.search).get(BOARD_PARAM);
  if (boardId) {
    const board = (await api.listBoards()).find(({ id }) => id === boardId);
    if (board) {
      return { kind: "board", board };
    }
    setBoardParam(null);
  }
  return { kind: "boards" };
};

export const AppShell = () => {
  // undefined while the session is being checked; null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [view, setView] = useState<View>({ kind: "boards" });

  const enter = async (signedInUser: User) => {
    setView(await initialView().catch((): View => ({ kind: "boards" })));
    setUser(signedInUser);
  };

  useEffect(() => {
    api.me().then(enter, () => setUser(null));
  }, []);

  const navigate = (next: View) => {
    setBoardParam(next.kind === "board" ? next.board.id : null);
    setView(next);
  };

  const signOut = () => {
    setBoardParam(null);
    setView({ kind: "boards" });
    setUser(null);
  };

  const handleLogout = async () => {
    await api.logout().catch(() => undefined);
    signOut();
  };

  if (user === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="status" className="text-sm font-semibold text-[var(--gray-text)]">
          Loading...
        </p>
      </main>
    );
  }

  if (user === null) {
    return <AuthScreen onAuthenticated={(signedIn) => void enter(signedIn)} />;
  }

  return (
    <div className="flex min-h-screen flex-col xl:h-screen">
      <nav className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke)] bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ kind: "boards" })}
            className="flex items-center gap-3"
            aria-label="All boards"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--navy-dark)]">
              <span className="h-3 w-3 rounded-sm bg-[var(--accent-yellow)]" />
            </span>
            <h1 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
          </button>
          {view.kind === "board" && (
            <>
              <span className="text-[var(--gray-text)]">/</span>
              <h2
                className="truncate font-display text-base font-semibold text-[var(--primary-blue)]"
                data-testid="current-board-name"
              >
                {view.board.name}
              </h2>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate({ kind: "boards" })}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
          >
            Boards
          </button>
          <button
            type="button"
            onClick={() => navigate({ kind: "account" })}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            aria-label="Account settings"
          >
            <UserIcon />
            <span data-testid="user-display-name">{user.displayName}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
          >
            <LogOutIcon />
            Log out
          </button>
        </div>
      </nav>
      {view.kind === "boards" && (
        <BoardsHome onOpenBoard={(board) => navigate({ kind: "board", board })} />
      )}
      {view.kind === "board" && (
        <KanbanBoard key={view.board.id} boardId={view.board.id} />
      )}
      {view.kind === "account" && (
        <AccountSettings
          user={user}
          onUserChange={setUser}
          onAccountDeleted={signOut}
        />
      )}
    </div>
  );
};
