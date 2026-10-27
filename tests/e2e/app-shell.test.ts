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
    page.getByRole("heading", { name: "Welcome to Clay" }),
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
    page.getByRole("heading", { name: "Welcome to Clay" }),
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
    page.getByRole("heading", { name: "Welcome to Clay" }),
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
    page.getByRole("heading", { name: "Stored data is invalid" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome to Clay" }),
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

test("the header has the logo and name on the left, search after them and the menu at the right", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await page.setViewportSize({ width: 1440, height: 800 });
  const box = async (selector: string) => {
    const result = await page.locator(selector).boundingBox();
    if (!result) throw new Error(`${selector} is not rendered`);
    return result;
  };

  const logo = await box(".header__logo");
  const title = await box(".header__title");
  const search = await box(".search");
  const menu = await box(".header__menu");
  // The toolbar icon file is loaded, not a broken image
  await expect
    .poll(() =>
      page
        .locator(".header__logo")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(48);
  expect([logo.width, logo.height]).toEqual([24, 24]);
  expect(logo.x).toBeLessThan(title.x);
  // The search field follows the name with the header gap; it is not centered
  expect(search.x - (title.x + title.width)).toBeCloseTo(16, 0);
  expect(search.width).toBe(360);
  expect(1440 - (menu.x + menu.width)).toBeCloseTo(16, 0);
});

test("a change made in another tab appears without reloading", async ({
  context,
  extensionId,
}) => {
  const watcher = await openTab(context, extensionId);
  await expect(
    watcher.getByRole("heading", { name: "Welcome to Clay" }),
  ).toBeVisible();

  const editor = await openTab(context, extensionId);
  await editor.getByRole("button", { name: "Create topic" }).click();
  const dialog = editor.getByRole("dialog", { name: "New topic" });
  await dialog.getByLabel("Name").fill("Shared");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(
    watcher
      .getByRole("region", { name: "Topics" })
      .locator(".topic-list__name"),
  ).toHaveText(["Shared"]);
});
