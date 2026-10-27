import type { BrowserContext, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { EntryInput } from "../../src/lib/validation";
import type { TestHook } from "../../src/storage/repository";
import { expect, test } from "./fixtures";

declare global {
  var useConfigTest: TestHook;
}

// Opened sites are served locally, as in actions.test.ts
let server: Server;
let origin: string;

test.beforeAll(async () => {
  server = createServer((_, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end("<title>Site</title>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function openTab(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.waitForFunction(() => "useConfigTest" in globalThis);
  return page;
}

function sites(count: number): EntryInput[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Site ${index + 1}`,
    url: `${origin}/site-${index + 1}`,
    description: "",
    username: "",
    password: "",
    extraUrl: "",
    twoFactorNote: "",
  }));
}

async function seed(page: Page, topics: Record<string, EntryInput[]>) {
  await page.evaluate(async (topics) => {
    const { repository, operations } = useConfigTest;
    for (const [name, entries] of Object.entries(topics)) {
      const topic = await repository.update((catalog, context) =>
        operations.createTopic(catalog, name, context),
      );
      if (!topic.ok) throw new Error(`Topic ${name} was not created`);
      for (const entry of entries) {
        await repository.update((catalog, context) =>
          operations.addEntry(catalog, topic.id, entry, context),
        );
      }
    }
  }, topics);
  await expect(page.locator(".topic-list__name")).toHaveCount(
    Object.keys(topics).length,
  );
}

function storedSettings(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const items = await chrome.storage.local.get("settings");
    return items.settings;
  });
}

function siteUrls(context: BrowserContext): string[] {
  return context
    .pages()
    .map((page) => page.url())
    .filter((url) => url.startsWith(origin))
    .sort();
}

async function choose(page: Page, item: "Settings" | "Export" | "Import") {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

function settingsDialog(page: Page) {
  return page.getByRole("dialog", { name: "Settings" });
}

function thresholdField(page: Page) {
  return settingsDialog(page).getByRole("textbox", {
    name: "Open all confirmation threshold",
  });
}

async function saveThreshold(page: Page, value: string) {
  await choose(page, "Settings");
  await thresholdField(page).fill(value);
  await settingsDialog(page).getByRole("button", { name: "Save" }).click();
}

async function selectTopic(page: Page, name: string) {
  await page.locator(".topic-list__select", { hasText: name }).click();
}

test("Settings opens from the menu with the default threshold 10", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);

  await choose(page, "Settings");
  await expect(settingsDialog(page)).toBeVisible();
  await expect(thresholdField(page)).toHaveValue("10");
  await expect(thresholdField(page)).toBeFocused();
  expect(await storedSettings(page)).toBeUndefined();
});

test("an invalid threshold shows an inline error and is not saved", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);

  for (const value of ["0", "501", "1.5", "abc", ""]) {
    await saveThreshold(page, value);
    await expect(settingsDialog(page)).toBeVisible();
    await expect(thresholdField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(settingsDialog(page)).toContainText(
      "Enter a whole number from 1 to 500.",
    );
    await settingsDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(settingsDialog(page)).toBeHidden();
  }
  expect(await storedSettings(page)).toBeUndefined();
});

test("Cancel changes nothing", async ({ context, extensionId }) => {
  const page = await openTab(context, extensionId);
  await saveThreshold(page, "25");
  await expect(settingsDialog(page)).toBeHidden();

  await choose(page, "Settings");
  await thresholdField(page).fill("3");
  await settingsDialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(settingsDialog(page)).toBeHidden();
  expect(await storedSettings(page)).toEqual({
    schemaVersion: 1,
    openAllConfirmThreshold: 25,
  });

  await choose(page, "Settings");
  await expect(thresholdField(page)).toHaveValue("25");
});

test("Open all follows the saved threshold at once", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Three: sites(3), Four: sites(4) });
  await saveThreshold(page, "3");
  await expect(settingsDialog(page)).toBeHidden();

  await selectTopic(page, "Four");
  await page.getByRole("button", { name: "Open all" }).click();
  const confirm = page.getByRole("dialog", { name: "Open 4 tabs?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(siteUrls(context)).toEqual([]);

  await selectTopic(page, "Three");
  await page.getByRole("button", { name: "Open all" }).click();
  await expect.poll(() => siteUrls(context)).toHaveLength(3);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a saved threshold persists after reload and reaches another tab", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const other = await openTab(context, extensionId);
  await seed(page, { Work: sites(2) });

  await saveThreshold(page, "1");
  await expect(settingsDialog(page)).toBeHidden();

  // The other tab was open before the save and is not reloaded
  await other.getByRole("button", { name: "Open all" }).click();
  await expect(
    other.getByRole("dialog", { name: "Open 2 tabs?" }),
  ).toBeVisible();
  await other.keyboard.press("Escape");
  await choose(other, "Settings");
  await expect(thresholdField(other)).toHaveValue("1");

  await page.reload();
  await choose(page, "Settings");
  await expect(thresholdField(page)).toHaveValue("1");
});

test("an invalid stored value falls back to the defaults and is kept until Save", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const invalid = { schemaVersion: 1, openAllConfirmThreshold: 0 };
  await page.evaluate(
    (value) => chrome.storage.local.set({ settings: value }),
    invalid,
  );
  await page.reload();
  await seed(page, { Work: sites(10) });

  // The catalog works normally; no error state for settings
  await page.getByRole("button", { name: "Open all" }).click();
  await expect.poll(() => siteUrls(context)).toHaveLength(10);
  expect(await storedSettings(page)).toEqual(invalid);

  await choose(page, "Settings");
  await expect(thresholdField(page)).toHaveValue("10");
  await settingsDialog(page).getByRole("button", { name: "Save" }).click();
  await expect(settingsDialog(page)).toBeHidden();
  expect(await storedSettings(page)).toEqual({
    schemaVersion: 1,
    openAllConfirmThreshold: 10,
  });
});

test("export leaves the settings out and import keeps them", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: sites(1) });
  await saveThreshold(page, "42");
  await expect(settingsDialog(page)).toBeHidden();

  await choose(page, "Export");
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog", { name: "Export catalog" })
    .getByRole("button", { name: "Export" })
    .click();
  const exported = await readFile(await (await download).path());
  expect(Object.keys(JSON.parse(exported.toString("utf8"))).sort()).toEqual([
    "entries",
    "exportedAt",
    "format",
    "schemaVersion",
    "topics",
  ]);

  const chooser = page.waitForEvent("filechooser");
  await choose(page, "Import");
  await (
    await chooser
  ).setFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: exported,
  });
  await page
    .getByRole("dialog", { name: "Replace catalog?" })
    .getByRole("button", { name: "Replace" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Catalog imported.");
  expect(await storedSettings(page)).toEqual({
    schemaVersion: 1,
    openAllConfirmThreshold: 42,
  });
});
