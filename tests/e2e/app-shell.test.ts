import type { BrowserContext } from "@playwright/test";
import type { TestHook } from "../../src/storage/repository";
import { expect, test } from "./fixtures";

declare global {
  var useConfigTest: TestHook;
}

async function openTab(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.waitForFunction(() => "useConfigTest" in globalThis);
  return page;
}

test("first run shows the welcome state with the plaintext note", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);

  await expect(
    page.getByRole("heading", { name: "Welcome to Use Config" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create topic" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Your data is stored unencrypted in this browser profile."),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Topics" })).toHaveCount(0);
});

test("a catalog with topics shows the three panes", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await expect(
    page.getByRole("heading", { name: "Welcome to Use Config" }),
  ).toBeVisible();

  await page.evaluate(() =>
    useConfigTest.repository.update((catalog, context) =>
      useConfigTest.operations.createTopic(catalog, "Work", context),
    ),
  );

  // The page follows storage changes without a reload; the entries pane is
  // titled with the selected topic
  for (const name of ["Topics", "Work", "Details"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Welcome to Use Config" }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("region", { name: "Topics" })).toBeVisible();
});

test("invalid stored data shows an error and is not overwritten", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await page.evaluate(() => chrome.storage.local.set({ catalog: 42 }));
  await page.reload();

  await expect(
    page.getByText("Stored data could not be loaded."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome to Use Config" }),
  ).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const items = await chrome.storage.local.get("catalog");
    return items.catalog;
  });
  expect(stored).toBe(42);
});

test("the page follows the light and dark color scheme", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const background = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: "light" });
  expect(await background()).toBe("rgb(247, 247, 248)");

  await page.emulateMedia({ colorScheme: "dark" });
  expect(await background()).toBe("rgb(17, 17, 19)");
});
