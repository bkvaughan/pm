import { expect, type Page } from "@playwright/test";
import type { BoardData } from "../src/lib/kanban";
import type { BoardSummary } from "../src/lib/api";
import { initialData } from "../src/test/fixtures";

export const BOARD_ID = "board-1";
export const BOARD_URL = `/api/boards/${BOARD_ID}`;
const demoUser = { id: "user-1", username: "user", displayName: "Demo User" };

/**
 * Stateful in-browser mock of the backend: auth, a board list, and one board's
 * data. Returns accessors so tests can inspect what was saved.
 */
export const mockApi = async (page: Page, initialBoard: BoardData = initialData) => {
  const state = {
    signedIn: false,
    data: { [BOARD_ID]: structuredClone(initialBoard) } as Record<string, BoardData>,
    // Newest first, like the backend. The mock records one entry per save.
    activity: [] as { id: number; source: string; message: string; createdAt: string }[],
    boards: [
      {
        id: BOARD_ID,
        name: "Product Roadmap",
        cardCount: Object.keys(initialBoard.cards).length,
        createdAt: "2026-11-01T10:00:00+00:00",
        updatedAt: "2026-11-01T10:00:00+00:00",
      },
    ] as BoardSummary[],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const key = `${request.method()} ${new URL(request.url()).pathname}`;
    const reply = (status: number, body?: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: body === undefined ? "" : JSON.stringify(body),
      });

    switch (key) {
      case "GET /api/auth/me":
        return state.signedIn ? reply(200, demoUser) : reply(401, { detail: "Not signed in." });
      case "POST /api/auth/login": {
        const { username, password } = request.postDataJSON();
        if (username !== "user" || password !== "password") {
          return reply(401, { detail: "Incorrect username or password." });
        }
        state.signedIn = true;
        return reply(200, demoUser);
      }
      case "POST /api/auth/logout":
        state.signedIn = false;
        return reply(204);
      case "GET /api/boards":
        return reply(200, state.boards);
      case "POST /api/boards": {
        const created = {
          ...state.boards[0],
          id: `board-${state.boards.length + 1}`,
          name: request.postDataJSON().name,
          cardCount: 0,
        };
        state.boards.push(created);
        state.data[created.id] = {
          columns: [
            { id: "col-todo", title: "To Do", cardIds: [], wipLimit: null },
            { id: "col-done", title: "Done", cardIds: [], wipLimit: null },
          ],
          cards: {},
        };
        return reply(201, created);
      }
    }
    if (/^GET \/api\/boards\/[^/]+\/activity$/.test(key)) {
      return reply(200, state.activity);
    }
    const boardMatch = key.match(/^(GET|PUT) \/api\/boards\/([^/]+)$/);
    if (boardMatch && state.data[boardMatch[2]]) {
      if (boardMatch[1] === "PUT") {
        state.data[boardMatch[2]] = request.postDataJSON();
        state.activity.unshift({
          id: state.activity.length + 1,
          source: "user",
          message: `Saved board ${state.activity.length + 1}`,
          createdAt: new Date().toISOString(),
        });
      }
      return reply(200, state.data[boardMatch[2]]);
    }
    // Leave unmatched routes (e.g. the assistant) to more specific handlers.
    return route.fallback();
  });

  return state;
};

export const signIn = async (page: Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible();
};

export const openBoard = async (page: Page) => {
  await signIn(page);
  await page.getByRole("button", { name: "Product Roadmap", exact: true }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
};

export const isBoardSave = (url: string, method: string) =>
  url.endsWith(BOARD_URL) && method === "PUT";
