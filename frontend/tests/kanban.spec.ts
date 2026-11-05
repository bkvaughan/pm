import { expect, test } from "@playwright/test";
import type { BoardData } from "../src/lib/kanban";
import { initialData } from "../src/test/fixtures";
import { BOARD_URL, isBoardSave, mockApi, openBoard } from "./mockApi";

test("requires valid credentials and supports logout", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("incorrect");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Incorrect username or password.", { exact: true })
  ).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);

  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Kanban Studio" })).toBeVisible();
});

test("loads the kanban board", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  const savedBoard = page.waitForResponse(
    (response) =>
      isBoardSave(response.url(), response.request().method())
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await savedBoard;
  await expect(page.getByTestId("board-save-status")).toHaveText("Saved");
  // dnd-kit swallows clicks for 50ms after a drop, so retry until it lands.
  await expect(async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in to Kanban Studio" })
    ).toBeVisible({ timeout: 500 });
  }).toPass();
  await openBoard(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("drops a card into the column directly under the pointer", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  const card = page.getByTestId("card-card-1");
  const targetCard = page.getByTestId("card-card-3");
  const targetColumn = page.getByTestId("column-col-discovery");
  const cardBox = await card.boundingBox();
  const targetBox = await targetCard.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 16 }
  );
  await expect(targetColumn).toHaveCSS("border-top-color", "rgb(236, 173, 10)");
  await page.mouse.up();

  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  const orderedCards = await targetColumn
    .locator('[data-testid^="card-"]')
    .evaluateAll((cards) => cards.map((element) => element.getAttribute("data-testid")));
  expect(orderedCards).toEqual(["card-card-1", "card-card-3"]);
});

test("highlights a target column across its header and blank interior", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  const sourceCard = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  const targetCard = page.getByTestId("card-card-3");
  const sourceBox = await sourceCard.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  const targetCardBox = await targetCard.boundingBox();
  if (!sourceBox || !columnBox || !targetCardBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();

  const targetPoints = [
    { x: columnBox.x + columnBox.width / 2, y: columnBox.y + 20 },
    {
      x: columnBox.x + columnBox.width - 24,
      y: targetCardBox.y + targetCardBox.height / 2,
    },
    { x: columnBox.x + columnBox.width / 2, y: targetCardBox.y - 6 },
  ];

  for (const point of targetPoints) {
    await page.mouse.move(point.x, point.y, { steps: 8 });
    await expect(targetColumn).toHaveCSS(
      "border-top-color",
      "rgb(236, 173, 10)"
    );
  }

  await page.mouse.up();
});

test("drops a card into an empty column without targeting a card", async ({
  page,
}) => {
  const board = structuredClone(initialData);
  board.columns[1].cardIds = [];
  delete board.cards["card-3"];
  await mockApi(page, board);
  await page.goto("/");
  await openBoard(page);

  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  const emptyDropZone = targetColumn.getByText("Drop a card here");
  await emptyDropZone.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const dropZoneBox = await emptyDropZone.boundingBox();
  if (!cardBox || !dropZoneBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    dropZoneBox.x + dropZoneBox.width / 2,
    dropZoneBox.y + dropZoneBox.height / 2,
    { steps: 20 }
  );
  await expect(targetColumn).toHaveClass(/border-\[var\(--accent-yellow\)\]/);
  await page.mouse.up();

  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("drops near the visible edge of an empty column", async ({ page }) => {
  const board = structuredClone(initialData);
  board.columns[1].cardIds = [];
  delete board.cards["card-3"];
  await mockApi(page, board);
  await page.goto("/");
  await openBoard(page);

  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  const dropX = columnBox.x - 6;
  const dropY = columnBox.y + 145;
  const viewport = page.viewportSize();
  if (!viewport || dropY >= viewport.height) {
    throw new Error("The empty-column drop target should be visible.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 20 });
  await expect(targetColumn).toHaveClass(/border-\[var\(--accent-yellow\)\]/);
  await page.mouse.up();

  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("moves a card from a full Review column into empty Done", async ({
  page,
}) => {
  const board = structuredClone(initialData);
  board.columns[3].cardIds = ["card-6", "card-7", "card-8"];
  board.columns[4].cardIds = [];
  await mockApi(page, board);
  await page.goto("/");
  await openBoard(page);

  const sourceCard = page.getByTestId("card-card-6");
  const targetColumn = page.getByTestId("column-col-done");
  const emptyDropZone = targetColumn.getByText("Drop a card here");
  await emptyDropZone.scrollIntoViewIfNeeded();
  const sourceBox = await sourceCard.boundingBox();
  const dropZoneBox = await emptyDropZone.boundingBox();
  const viewport = page.viewportSize();
  if (!sourceBox || !dropZoneBox || !viewport) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  const dropX = dropZoneBox.x + dropZoneBox.width / 2;
  const dropY = Math.min(dropZoneBox.y + 50, viewport.height - 40);

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(dropX, dropY, { steps: 24 });
  await expect(targetColumn).toHaveClass(/border-\[var\(--accent-yellow\)\]/);
  await expect(targetColumn).toHaveCSS("border-top-color", "rgb(236, 173, 10)");

  const savedBoard = page.waitForResponse(
    (response) =>
      isBoardSave(response.url(), response.request().method())
  );
  await page.mouse.up();
  await savedBoard;
  await expect(targetColumn.getByTestId("card-card-6")).toBeVisible();
});

test("AI chat locks the board and applies the saved board update", async ({
  page,
}) => {
  await mockApi(page);
  let finishAssistant = () => {};
  const assistantCalled = new Promise<void>((resolve) => {
    void page.route(`**${BOARD_URL}/assistant`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        message: "Move the roadmap card to Discovery.",
        history: [],
      });
      resolve();
      await new Promise<void>((done) => (finishAssistant = done));

      const updatedBoard = structuredClone(initialData);
      updatedBoard.columns[0].cardIds = ["card-2"];
      updatedBoard.columns[1].cardIds.push("card-1");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reply: "Moved the roadmap card to Discovery.",
          board: updatedBoard,
          model: "test-model",
        }),
      });
    });
  });
  let boardSaves = 0;
  page.on("request", (request) => {
    if (isBoardSave(request.url(), request.method())) {
      boardSaves += 1;
    }
  });

  await page.goto("/");
  await openBoard(page);
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await page.getByLabel("Message the assistant").fill(
    "Move the roadmap card to Discovery."
  );
  await page.getByRole("button", { name: "Send" }).click();

  await assistantCalled;
  await expect(page.getByTestId("board-save-status")).toHaveText(
    "Board is locked while the assistant works..."
  );
  await expect(page.getByRole("main")).toHaveAttribute("inert");

  finishAssistant();
  await expect(
    page.getByText("Moved the roadmap card to Discovery.")
  ).toBeVisible();
  await expect(
    page.getByTestId("column-col-discovery").getByTestId("card-card-1")
  ).toBeVisible();
  await expect(page.getByTestId("board-save-status")).toHaveText("Saved");
  await expect(page.getByRole("main")).not.toHaveAttribute("inert");
  expect(boardSaves).toBe(0);
});

test("edits a card and persists the change", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: "Edit Align roadmap themes" }).click();
  await card.getByLabel("Card title").fill("Edited in e2e");
  await card.getByLabel("Card details").fill("New details.");
  const savedBoard = page.waitForResponse(
    (response) =>
      isBoardSave(response.url(), response.request().method())
  );
  await card.getByRole("button", { name: "Save" }).click();
  const saved = (await savedBoard).request().postDataJSON() as BoardData;
  expect(saved.cards["card-1"]).toEqual({
    ...initialData.cards["card-1"],
    title: "Edited in e2e",
    details: "New details.",
  });
  await expect(card.getByText("Edited in e2e")).toBeVisible();
});

test("moves a card between columns with the keyboard", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);
  const card = page.getByTestId("card-card-3");
  const targetColumn = page.getByTestId("column-col-progress");
  await card.focus();
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(targetColumn).toHaveClass(/border-\[var\(--accent-yellow\)\]/);
  await page.keyboard.press("Space");
  await expect(targetColumn.getByTestId("card-card-3")).toBeVisible();
});
