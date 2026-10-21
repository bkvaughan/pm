import { expect, test, type Page } from "@playwright/test";
import { initialData, type BoardData } from "../src/lib/kanban";

const signIn = async (page: Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
};

const mockBoardApi = async (
  page: Page,
  initialBoard: BoardData = initialData
) => {
  let board: BoardData = structuredClone(initialBoard);
  await page.route("**/api/board", async (route) => {
    if (route.request().method() === "PUT") {
      board = route.request().postDataJSON() as BoardData;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(board),
    });
  });
};

test("requires valid credentials and supports logout", async ({ page }) => {
  await mockBoardApi(page);
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
  await mockBoardApi(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await mockBoardApi(page);
  await page.goto("/");
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await mockBoardApi(page);
  await page.goto("/");
  await signIn(page);
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
      response.url().endsWith("/api/board") &&
      response.request().method() === "PUT"
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await savedBoard;
  await expect(page.getByTestId("board-save-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Kanban Studio" })
  ).toBeVisible();
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("drops a card into the column directly under the pointer", async ({ page }) => {
  await mockBoardApi(page);
  await page.goto("/");
  await signIn(page);

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
  await mockBoardApi(page);
  await page.goto("/");
  await signIn(page);

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
    await expect(targetColumn).toHaveCSS(
      "outline-color",
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
  await mockBoardApi(page, board);
  await page.goto("/");
  await signIn(page);

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
  await expect(targetColumn).toHaveClass(/ring-2/);
  await expect(targetColumn).toHaveClass(/border-\[var\(--accent-yellow\)\]/);
  await page.mouse.up();

  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("drops near the visible edge of an empty column", async ({ page }) => {
  const board = structuredClone(initialData);
  board.columns[1].cardIds = [];
  delete board.cards["card-3"];
  await mockBoardApi(page, board);
  await page.goto("/");
  await signIn(page);

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
  await expect(targetColumn).toHaveClass(/ring-2/);
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
  await mockBoardApi(page, board);
  await page.goto("/");
  await signIn(page);

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
      response.url().endsWith("/api/board") &&
      response.request().method() === "PUT"
  );
  await page.mouse.up();
  await savedBoard;
  await expect(targetColumn.getByTestId("card-card-6")).toBeVisible();
});
