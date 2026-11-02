import { expect, test, type Page } from "@playwright/test";
import type { BoardData } from "../src/lib/kanban";

const signIn = async (page: Page) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
};

test("a moved card is persisted by the real backend", async ({
  page,
  request,
}) => {
  const original = (await (await request.get("/api/board")).json()) as BoardData;
  const source = original.columns.find((column) => column.cardIds.length > 0);
  const target = original.columns.find((column) => column !== source);
  if (!source || !target) {
    throw new Error("The board needs a card and a second column.");
  }
  const cardId = source.cardIds[0];

  try {
    await page.goto("/");
    await signIn(page);
    const card = page.getByTestId(`card-${cardId}`);
    const targetColumn = page.getByTestId(`column-${target.id}`);
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
    expect((await savedBoard).ok()).toBe(true);

    await page.reload();
    await signIn(page);
    await expect(targetColumn.getByTestId(`card-${cardId}`)).toBeVisible();
  } finally {
    await request.put("/api/board", { data: original });
  }
});
