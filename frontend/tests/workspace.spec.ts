import { expect, test } from "@playwright/test";
import { isBoardSave, mockApi, openBoard, signIn } from "./mockApi";

test("creates a board, switches boards, and keeps them separate", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/");
  await signIn(page);

  await page.getByLabel("New board name").fill("Hiring plan");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByTestId("current-board-name")).toHaveText("Hiring plan");
  await expect(page).toHaveURL(/\?board=board-2$/);
  await expect(page.getByLabel("Column title")).toHaveCount(2);

  const firstColumn = page.getByTestId("column-col-todo");
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Post the job");
  const saved = page.waitForResponse((response) =>
    response.url().endsWith("/api/boards/board-2") && response.request().method() === "PUT"
  );
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await saved;

  await page.getByRole("button", { name: "Boards", exact: true }).click();
  await page.getByRole("button", { name: "Product Roadmap", exact: true }).click();
  await expect(page.getByTestId("current-board-name")).toHaveText("Product Roadmap");
  await expect(page.getByText("Post the job")).toHaveCount(0);
  expect(Object.values(state.data["board-2"].cards).map((card) => card.title)).toEqual([
    "Post the job",
  ]);
});

test("reload keeps the session and the open board", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  await page.reload();

  await expect(page.getByTestId("current-board-name")).toHaveText("Product Roadmap");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds and deletes columns", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("New column title").fill("Blocked");
  await page.getByLabel("New column title").press("Enter");
  await expect(page.getByLabel("Column title")).toHaveCount(6);
  await expect(page.getByLabel("Column title").last()).toHaveValue("Blocked");

  const backlog = page.getByTestId("column-col-backlog");
  await backlog.getByRole("button", { name: "Column options for Backlog" }).click();
  await backlog.getByRole("button", { name: "Delete column Backlog" }).click();
  const saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await backlog.getByRole("button", { name: "Delete", exact: true }).click();
  await saved;

  await expect(page.getByTestId("column-col-backlog")).toHaveCount(0);
  await expect(page.getByText("Align roadmap themes")).toHaveCount(0);
  const titles = state.data["board-1"].columns.map((column) => column.title);
  expect(titles).toEqual(["Discovery", "In Progress", "Review", "Done", "Blocked"]);
});

test("opens account settings from the top bar", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await signIn(page);

  await page.getByRole("button", { name: "Account settings" }).click();

  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue("Demo User");
});

test("sets card priority, due date, and labels", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  const card = page.getByTestId("card-card-4");
  await expect(card.getByText("Low priority")).toBeVisible();
  await card.getByRole("button", { name: "Edit Refine status language" }).click();
  await card.getByLabel("Priority").selectOption("high");
  await card.getByLabel("Due date").fill("2020-01-15");
  await card.getByLabel("Labels").fill("Copy, UX, copy");
  const saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await card.getByRole("button", { name: "Save" }).click();
  await saved;

  await expect(card.getByText("High priority")).toBeVisible();
  await expect(card.getByText(/^Overdue /)).toHaveAttribute("data-due-status", "overdue");
  await expect(card.getByText("UX")).toBeVisible();
  expect(state.data["board-1"].cards["card-4"]).toMatchObject({
    priority: "high",
    dueDate: "2020-01-15",
    labels: ["Copy", "UX"],
  });
});

test("filters cards and still drags the visible ones", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(page.getByTestId("filter-summary")).toHaveText("Showing 2 of 8 cards");
  await expect(page.locator('[data-testid^="card-card-"]')).toHaveCount(2);

  const card = page.getByTestId("card-card-1");
  const target = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 200, {
    steps: 12,
  });
  const saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await page.mouse.up();
  await saved;

  await expect(target.getByTestId("card-card-1")).toBeVisible();
  // The hidden card-6 keeps its place; the moved card lands after it.
  expect(state.data["board-1"].columns[3].cardIds).toEqual(["card-6", "card-1"]);
  expect(Object.keys(state.data["board-1"].cards)).toHaveLength(8);

  // dnd-kit swallows clicks for 50ms after a drop (it removes its capture-phase
  // click listener in a setTimeout), so retry until the click lands.
  await expect(async () => {
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator('[data-testid^="card-card-"]')).toHaveCount(8, {
      timeout: 500,
    });
  }).toPass();
});

test("reorders columns and sets a WIP limit", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  const review = page.getByTestId("column-col-review");
  await review.getByRole("button", { name: "Column options for Review" }).click();
  await review.getByRole("button", { name: "Move left" }).click();
  const titles = page.getByLabel("Column title");
  await expect(titles.nth(2)).toHaveValue("Review");
  await expect(titles.nth(3)).toHaveValue("In Progress");

  await review.getByLabel("WIP limit", { exact: true }).fill("1");
  const saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await review.getByLabel("WIP limit", { exact: true }).press("Enter");
  await saved;
  const count = review.getByTestId("count-badge");
  await expect(count).toHaveText("1/1");
  await expect(count).not.toHaveClass(/bg-red-600/);

  // Dragging a second card into Review puts it over its limit.
  const card = page.getByTestId("card-card-3");
  const cardBox = await card.boundingBox();
  const lastReviewCard = await page.getByTestId("card-card-6").boundingBox();
  if (!cardBox || !lastReviewCard) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  // Drop below Review's last card so the new card lands at the end.
  await page.mouse.move(
    lastReviewCard.x + lastReviewCard.width / 2,
    lastReviewCard.y + lastReviewCard.height + 40,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(count).toHaveText("2/1");
  await expect(count).toHaveClass(/bg-red-600/);

  await expect
    .poll(() => state.data["board-1"].columns.map((column) => column.id))
    .toEqual(["col-backlog", "col-discovery", "col-review", "col-progress", "col-done"]);
  expect(state.data["board-1"].columns[2]).toMatchObject({
    wipLimit: 1,
    cardIds: ["card-6", "card-3"],
  });
});

test("five columns and their titles fit without scrolling at 1280px", async ({ page }) => {
  // Overflow lets dnd-kit auto-scroll the board mid-drag, which made drops land
  // in the wrong column.
  expect(page.viewportSize()?.width).toBe(1280);
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  const overflow = await page
    .getByTestId("column-col-backlog")
    .evaluate((column) => {
      const scroller = column.parentElement!.parentElement!;
      return scroller.scrollWidth - scroller.clientWidth;
    });
  expect(overflow).toBeLessThanOrEqual(0);

  // The seeded column titles are not cut off at this width.
  const clipped = await page
    .getByLabel("Column title")
    .evaluateAll((inputs) =>
      (inputs as HTMLInputElement[])
        .filter((input) => input.scrollWidth > input.clientWidth)
        .map((input) => input.value)
    );
  expect(clipped).toEqual([]);
});

test("the activity tab lists recent changes and keeps the chat", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await openBoard(page);
  const assistantInput = page.getByLabel("Message the assistant");
  await assistantInput.fill("Unsent question");

  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("No activity yet.")).toBeVisible();
  // Real CSS: the hidden assistant panel is not displayed.
  await expect(assistantInput).toBeHidden();

  const firstTitle = page.getByLabel("Column title").first();
  await firstTitle.fill("Ideas");
  await firstTitle.press("Enter");
  await expect(
    page.getByRole("list", { name: "Recent changes" }).getByText("Saved board 1")
  ).toBeVisible();

  await page.getByRole("tab", { name: "Assistant" }).click();
  await expect(assistantInput).toHaveValue("Unsent question");
});

test("checks off checklist items and edits the checklist", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  const card = page.getByTestId("card-card-5");
  const progress = card.getByTestId("checklist-progress");
  await expect(progress).toHaveText("Checklist 1/2");

  // A click toggles the item without starting a drag.
  let saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await card.getByLabel("Set spacing tokens").click();
  await saved;
  await expect(progress).toHaveText("Checklist 2/2");
  await expect(page.getByTestId("column-col-progress").getByTestId("card-card-5")).toBeVisible();

  // Space on a focused checkbox toggles it rather than picking up the card.
  saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await card.getByLabel("Pick a type scale").press("Space");
  await saved;
  await expect(progress).toHaveText("Checklist 1/2");
  await expect(card.getByLabel("Pick a type scale")).not.toBeChecked();

  await card.getByRole("button", { name: "Edit Design card layout" }).click();
  await card.getByLabel("New checklist item").fill("Review with design");
  await card.getByLabel("New checklist item").press("Enter");
  saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await card.getByRole("button", { name: "Save" }).click();
  await saved;

  await expect(progress).toHaveText("Checklist 1/3");
  expect(
    state.data["board-1"].cards["card-5"].checklist.map(({ text, done }) => [text, done])
  ).toEqual([
    ["Pick a type scale", false],
    ["Set spacing tokens", true],
    ["Review with design", false],
  ]);
});

test("archives a card and restores it to its place", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/");
  await openBoard(page);

  const backlog = page.getByTestId("column-col-backlog");
  let saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await page.getByTestId("card-card-1").hover();
  await page.getByRole("button", { name: "Archive Align roadmap themes", exact: true }).click();
  await saved;
  await expect(page.getByTestId("card-card-1")).toHaveCount(0);
  await expect(backlog.getByTestId("count-badge")).toHaveText("1");
  expect(state.data["board-1"].cards["card-1"].archived).toBe(true);
  expect(state.data["board-1"].columns[0].cardIds).toEqual(["card-1", "card-2"]);

  // The tab strip still fits beside the board with the count shown.
  const archivedTab = page.getByRole("tab", { name: "Archived (1)" });
  await archivedTab.click();
  await expect(page.getByRole("list", { name: "Archived cards" })).toContainText(
    "Align roadmap themesFrom Backlog"
  );

  saved = page.waitForResponse((response) =>
    isBoardSave(response.url(), response.request().method())
  );
  await page.getByRole("button", { name: "Restore Align roadmap themes" }).click();
  await saved;
  await expect(backlog.getByTestId("card-card-1")).toBeVisible();
  await expect(backlog.locator('[data-testid^="card-"]').first()).toHaveAttribute(
    "data-testid",
    "card-card-1"
  );
  await expect(page.getByText(/No archived cards/)).toBeVisible();
  expect(state.data["board-1"].cards["card-1"].archived).toBe(false);
});
