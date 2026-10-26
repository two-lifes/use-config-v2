import { expect, test } from "./fixtures";

test("the tab page shows the product name", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/index.html`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Use Config" }),
  ).toBeVisible();
});
