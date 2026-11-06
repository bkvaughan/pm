import { expect, test, type Page } from "@playwright/test";
import type { BoardData } from "../src/lib/kanban";
import type { BoardSummary } from "../src/lib/api";

// These tests run against the real Docker app (scripts/start.sh), so they
// create their own data and clean it up afterwards.

const signIn = async (page: Page, username: string, password: string) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Your boards" }),
  ).toBeVisible();
};

test("a new user registers, manages boards, and deletes their account", async ({
  page,
}) => {
  const username = `e2e-${Date.now()}`;
  const password = "e2e-password";

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Display name").fill("E2E Tester");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("user-display-name")).toHaveText(
      "E2E Tester",
    );

    // The starter board is empty; add a card and confirm it survives a reload.
    await page
      .getByRole("button", { name: "My First Board", exact: true })
      .click();
    const todo = page.locator('[data-testid^="column-"]').first();
    await todo.getByRole("button", { name: /add a card/i }).click();
    await todo.getByPlaceholder("Card title").fill("Persisted card");
    const saved = page.waitForResponse(
      (response) =>
        /\/api\/boards\/[^/]+$/.test(response.url()) &&
        response.request().method() === "PUT",
    );
    await todo.getByRole("button", { name: /add card/i }).click();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(page.getByText("Persisted card")).toBeVisible();

    // Card details are validated and stored by the backend.
    // Resolve the card's ID first: in edit mode its title is an input value,
    // so a hasText locator would stop matching.
    const cardTestId = await page
      .locator('[data-testid^="card-card-"]', { hasText: "Persisted card" })
      .getAttribute("data-testid");
    const card = page.getByTestId(cardTestId!);
    await card.getByRole("button", { name: "Edit Persisted card" }).click();
    await card.getByLabel("Priority").selectOption("high");
    await card.getByLabel("Due date").fill("2030-06-01");
    await card.getByLabel("Labels").fill("Docker, docker, E2E");
    await card.getByLabel("New checklist item").fill("Docker step");
    await card.getByLabel("New checklist item").press("Enter");
    const savedDetails = page.waitForResponse(
      (response) =>
        /\/api\/boards\/[^/]+$/.test(response.url()) &&
        response.request().method() === "PUT",
    );
    await card.getByRole("button", { name: "Save" }).click();
    expect((await savedDetails).ok()).toBe(true);
    await page.reload();
    await expect(card.getByText("High priority")).toBeVisible();
    await expect(card.getByText("Docker", { exact: true })).toBeVisible();
    await expect(card.getByText("E2E")).toBeVisible();
    await expect(card.locator("[data-due-status]")).toHaveAttribute("title", "2030-06-01");

    // Checking off an item from the card is saved too.
    const savedCheck = page.waitForResponse(
      (response) =>
        /\/api\/boards\/[^/]+$/.test(response.url()) &&
        response.request().method() === "PUT",
    );
    await card.getByLabel("Docker step").check();
    expect((await savedCheck).ok()).toBe(true);
    await page.reload();
    await expect(card.getByLabel("Docker step")).toBeChecked();
    await expect(card.getByTestId("checklist-progress")).toHaveText("Checklist 1/1");

    // Column order and WIP limits are stored by the backend.
    // Resolve the column by ID: a positional locator would follow the move.
    const todoTestId = await page
      .locator('[data-testid^="column-col-"]')
      .first()
      .getAttribute("data-testid");
    const todoColumn = page.getByTestId(todoTestId!);
    await todoColumn.getByRole("button", { name: "Column options for To Do" }).click();
    await todoColumn.getByRole("button", { name: "Move right" }).click();
    await todoColumn.getByLabel("WIP limit", { exact: true }).fill("1");
    const savedColumns = page.waitForResponse(
      (response) =>
        /\/api\/boards\/[^/]+$/.test(response.url()) &&
        response.request().method() === "PUT",
    );
    await todoColumn.getByLabel("WIP limit", { exact: true }).press("Enter");
    expect((await savedColumns).ok()).toBe(true);
    await page.reload();
    await expect(page.getByLabel("Column title").nth(1)).toHaveValue("To Do");
    await expect(card.getByText("High priority")).toBeVisible();
    await expect(
      page
        .locator('[data-testid^="column-col-"]', { has: card })
        .getByTestId("count-badge"),
    ).toHaveText("1/1");

    // The backend recorded each change in the board's activity log.
    await page.getByRole("tab", { name: "Activity" }).click();
    const recent = page.getByRole("list", { name: "Recent changes" });
    for (const message of [
      'Set the WIP limit of "To Do" to 1',
      "Reordered columns",
      'Checked off "Docker step" on "Persisted card"',
      'Edited card "Persisted card" (priority, due date, labels, checklist)',
      'Created card "Persisted card" in "To Do"',
      'Created board "My First Board"',
    ]) {
      await expect(recent.getByText(message, { exact: true })).toBeVisible();
    }

    // A second board starts empty and is listed alongside the first.
    await page.getByRole("button", { name: "Boards", exact: true }).click();
    await page.getByLabel("New board name").fill("Second board");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByTestId("current-board-name")).toHaveText(
      "Second board",
    );
    await expect(page.getByText("Persisted card")).toHaveCount(0);

    // Logging out ends the session; signing back in shows both boards.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in to Kanban Studio" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Sign in to Kanban Studio" }),
    ).toBeVisible();
    await signIn(page, username, password);
    await expect(page.getByText("1 card -")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Second board", exact: true }),
    ).toBeVisible();

    // An archived card is kept but no longer shown or counted.
    await page
      .getByRole("button", { name: "My First Board", exact: true })
      .click();
    const savedArchive = page.waitForResponse(
      (response) =>
        /\/api\/boards\/[^/]+$/.test(response.url()) &&
        response.request().method() === "PUT",
    );
    await card.hover();
    await card
      .getByRole("button", { name: "Archive Persisted card", exact: true })
      .click();
    expect((await savedArchive).ok()).toBe(true);
    await page.reload();
    await expect(page.getByText("Persisted card")).toHaveCount(0);
    await page.getByRole("tab", { name: "Archived (1)" }).click();
    await expect(
      page.getByRole("list", { name: "Archived cards" }).getByText("Persisted card"),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByText('Archived card "Persisted card"', { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Boards", exact: true }).click();
    await expect(
      page
        .locator('[data-testid^="board-tile-"]', { hasText: "My First Board" })
        .getByText(/^0 cards -/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Account settings" }).click();
    await page.getByLabel("Confirm with your password").fill(password);
    await page.getByRole("button", { name: "Delete account" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in to Kanban Studio" }),
    ).toBeVisible();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("Incorrect username or password."),
    ).toBeVisible();
  } finally {
    // Remove the account even if a step above failed.
    const login = await page.request.post("/api/auth/login", {
      data: { username, password },
    });
    if (login.ok()) {
      await page.request.post("/api/account/delete", { data: { password } });
    }
  }
});

test("users cannot read each other's boards", async ({
  playwright,
  baseURL,
}) => {
  const owner = await playwright.request.newContext({ baseURL });
  const intruder = await playwright.request.newContext({ baseURL });
  const register = (context: typeof owner, username: string) =>
    context.post("/api/auth/register", {
      data: { username, password: "e2e-password", displayName: username },
    });
  const stamp = Date.now();

  try {
    expect((await register(owner, `owner-${stamp}`)).status()).toBe(201);
    expect((await register(intruder, `intruder-${stamp}`)).status()).toBe(201);
    const [board] = (await (
      await owner.get("/api/boards")
    ).json()) as BoardSummary[];

    expect((await intruder.get(`/api/boards/${board.id}`)).status()).toBe(404);
    expect((await intruder.delete(`/api/boards/${board.id}`)).status()).toBe(
      404,
    );
    expect((await owner.get(`/api/boards/${board.id}`)).status()).toBe(200);
  } finally {
    for (const context of [owner, intruder]) {
      await context.post("/api/account/delete", {
        data: { password: "e2e-password" },
      });
      await context.dispose();
    }
  }
});

test("a moved card is persisted by the real backend", async ({
  page,
  request,
}) => {
  await request.post("/api/auth/login", {
    data: { username: "user", password: "password" },
  });
  const [summary] = (await (
    await request.get("/api/boards")
  ).json()) as BoardSummary[];
  const boardUrl = `/api/boards/${summary.id}`;
  const original = (await (await request.get(boardUrl)).json()) as BoardData;
  const source = original.columns.find((column) => column.cardIds.length > 0);
  const target = original.columns.find((column) => column !== source);
  if (!source || !target) {
    throw new Error("The board needs a card and a second column.");
  }
  const cardId = source.cardIds[0];

  try {
    await page.goto("/");
    await signIn(page, "user", "password");
    await page.getByRole("button", { name: summary.name, exact: true }).click();
    const card = page.getByTestId(`card-${cardId}`);
    const targetColumn = page.getByTestId(`column-${target.id}`);
    const cardBox = await card.boundingBox();
    const columnBox = await targetColumn.boundingBox();
    if (!cardBox || !columnBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }

    await page.mouse.move(
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      columnBox.x + columnBox.width / 2,
      columnBox.y + 120,
      {
        steps: 12,
      },
    );
    const savedBoard = page.waitForResponse(
      (response) =>
        response.url().endsWith(boardUrl) &&
        response.request().method() === "PUT",
    );
    await page.mouse.up();
    expect((await savedBoard).ok()).toBe(true);

    await page.reload();
    await expect(targetColumn.getByTestId(`card-${cardId}`)).toBeVisible();
  } finally {
    await request.put(boardUrl, { data: original });
  }
});
