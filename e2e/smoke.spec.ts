import { expect, test } from "@playwright/test";

// Boots the built app on the Blog sample, creates an entity, and undoes it.
// Recipes for driving more of the editor are in
// .agents/skills/verify-domain-modeler/features/.

test("the editor boots, creates an entity, and undoes it", async ({ page }) => {
  const errors: Array<string> = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  const mode = page.locator('[aria-label^="Mode:"]');
  await expect(mode).toHaveAttribute("aria-label", "Mode: NORMAL");
  for (const name of ["User", "Post", "Tag"]) {
    await expect(page.getByLabel(`Entity ${name}`, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Relationship writes 1:0..*" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await page.keyboard.press("c");
  await expect(mode).toHaveAttribute("aria-label", "Mode: NEW");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("New entity name")).toBeFocused();
  await page.keyboard.type("Comment");
  await page.keyboard.press("Enter");

  const comment = page.getByLabel("Entity Comment", { exact: true });
  await expect(mode).toHaveAttribute("aria-label", "Mode: NORMAL");
  await expect(comment).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(comment).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  expect(errors).toEqual([]);
});
