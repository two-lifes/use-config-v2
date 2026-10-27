import type { BrowserContext, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { StoredCatalog } from "../../src/lib/model";
import type { TestHook } from "../../src/storage/repository";
import { expect, test } from "./fixtures";

declare global {
  var useConfigTest: TestHook;
}

const TIME = "2026-10-26T12:00:00.000Z";

// A catalog in the stored form, with fixed IDs and times
const BACKUP: StoredCatalog = {
  schemaVersion: 1,
  topics: [
    { id: "t-bank", name: "Banking", createdAt: TIME, updatedAt: TIME },
    { id: "t-vps", name: "My VPS", createdAt: TIME, updatedAt: TIME },
  ],
  entries: [
    {
      id: "e-console",
      topicId: "t-vps",
      name: "Hetzner Console",
      url: "https://console.example.com/",
      description: "Line one\nЛиния два",
      username: "root",
      password: "p@ss wörd",
      extraUrl: "",
      twoFactorNote: "TOTP app",
      createdAt: TIME,
      updatedAt: TIME,
    },
    {
      id: "e-grafana",
      topicId: "t-vps",
      name: "Grafana",
      url: "https://grafana.example.com/",
      description: "",
      username: "",
      password: "",
      extraUrl: "https://grafana.example.com/alerts",
      twoFactorNote: "",
      createdAt: TIME,
      updatedAt: TIME,
    },
    {
      id: "e-bank",
      topicId: "t-bank",
      name: "Bank",
      url: "https://bank.example.com/",
      description: "",
      username: "me",
      password: "secret",
      extraUrl: "",
      twoFactorNote: "",
      createdAt: TIME,
      updatedAt: TIME,
    },
  ],
};

function exportFile(catalog: StoredCatalog, fields: object = {}): string {
  return JSON.stringify({
    format: "use-config-export",
    schemaVersion: 1,
    exportedAt: TIME,
    topics: catalog.topics,
    entries: catalog.entries,
    ...fields,
  });
}

async function openTab(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.waitForFunction(() => "useConfigTest" in globalThis);
  return page;
}

function storedValue(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const items = await chrome.storage.local.get("catalog");
    return items.catalog;
  });
}

async function store(page: Page, value: unknown) {
  await page.evaluate(
    (value) => chrome.storage.local.set({ catalog: value }),
    value,
  );
  await page.reload();
}

function menuButton(page: Page) {
  return page.getByRole("button", { name: "Menu" });
}

async function choose(page: Page, item: "Export" | "Import" | "About") {
  await menuButton(page).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function importFile(
  page: Page,
  contents: string | Buffer,
  name = "backup.json",
  start = () => choose(page, "Import"),
) {
  const chooser = page.waitForEvent("filechooser");
  await start();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: "application/json",
    buffer: typeof contents === "string" ? Buffer.from(contents) : contents,
  });
}

function topicNames(page: Page) {
  return page
    .getByRole("region", { name: "Topics" })
    .locator(".topic-list__name");
}

function replaceDialog(page: Page) {
  return page.getByRole("dialog", { name: "Replace catalog?" });
}

function errorDialog(page: Page) {
  return page.getByRole("dialog", { name: "Import failed" });
}

test("the menu opens with the keyboard, moves with arrows and closes with Escape", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await menuButton(page).focus();
  await page.keyboard.press("Enter");

  const menu = page.getByRole("menu", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem")).toHaveText([
    "Export",
    "Import",
    "About",
  ]);
  await expect(page.getByRole("menuitem", { name: "Export" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Import" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "About" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("About shows the version and the plaintext storage note", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const version = await page.evaluate(
    () => chrome.runtime.getManifest().version,
  );

  await choose(page, "About");
  const about = page.getByRole("dialog", { name: "About Clay" });
  await expect(about).toContainText(`Version ${version}`);
  await expect(about).toContainText(
    "Your data is stored unencrypted in this browser profile.",
  );
  await about.getByRole("button", { name: "Close" }).click();
  await expect(about).toBeHidden();
});

test("Export warns about readable passwords and downloads the whole catalog", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await store(page, BACKUP);

  await choose(page, "Export");
  const dialog = page.getByRole("dialog", { name: "Export catalog" });
  await expect(dialog).toContainText("including passwords, as readable text");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await choose(page, "Export");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export" }).click();
  const file = await download;

  const today = await page.evaluate(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  expect(file.suggestedFilename()).toBe(`clay-${today}.json`);
  const text = await readFile(await file.path(), "utf8");
  // Indented with two spaces (technical.md)
  expect(text).toContain('\n  "format": "use-config-export"');
  const parsed = JSON.parse(text);
  expect(parsed).toMatchObject({
    format: "use-config-export",
    schemaVersion: 1,
    topics: BACKUP.topics,
    entries: BACKUP.entries,
  });
  expect(new Date(parsed.exportedAt).toISOString()).toBe(parsed.exportedAt);
  await expect(page.getByRole("status")).toHaveText("Catalog exported.");
});

test("export followed by import into an empty catalog restores identical data", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await store(page, BACKUP);
  await choose(page, "Export");
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog", { name: "Export catalog" })
    .getByRole("button", { name: "Export" })
    .click();
  const exported = await readFile(await (await download).path());

  await page.evaluate(() => chrome.storage.local.remove("catalog"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome to Clay" }),
  ).toBeVisible();

  await importFile(page, exported);
  await expect(replaceDialog(page)).toContainText(
    "The file has 2 topics and 3 entries.",
  );
  await expect(replaceDialog(page)).toContainText(
    "The current catalog has 0 topics and 0 entries.",
  );
  await replaceDialog(page).getByRole("button", { name: "Replace" }).click();

  await expect(replaceDialog(page)).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Catalog imported.");
  await expect(topicNames(page)).toHaveText(["Banking", "My VPS"]);
  expect(await storedValue(page)).toEqual(BACKUP);
});

test("import shows both counts; Cancel keeps the catalog and Replace swaps it completely", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const current: StoredCatalog = {
    schemaVersion: 1,
    topics: [{ id: "t-old", name: "Old", createdAt: TIME, updatedAt: TIME }],
    entries: [{ ...BACKUP.entries[2]!, id: "e-old", topicId: "t-old" }],
  };
  await store(page, current);

  await importFile(page, exportFile(BACKUP));
  await expect(replaceDialog(page)).toContainText(
    "The file has 2 topics and 3 entries.",
  );
  await expect(replaceDialog(page)).toContainText(
    "The current catalog has 1 topic and 1 entry. It will be replaced completely.",
  );
  await replaceDialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(replaceDialog(page)).toBeHidden();
  await expect(topicNames(page)).toHaveText(["Old"]);
  expect(await storedValue(page)).toEqual(current);

  await importFile(page, exportFile(BACKUP));
  await replaceDialog(page).getByRole("button", { name: "Replace" }).click();
  await expect(topicNames(page)).toHaveText(["Banking", "My VPS"]);
  expect(await storedValue(page)).toEqual(BACKUP);
});

const REJECTED: {
  title: string;
  contents: () => string | Buffer;
  text: string[];
}[] = [
  {
    title: "invalid JSON",
    contents: () => "{ not json",
    text: ["The file is not valid JSON."],
  },
  {
    title: "a file of another format",
    contents: () => JSON.stringify({ topics: [], entries: [] }),
    text: ["The file is not a Clay export."],
  },
  {
    title: "a newer format version",
    contents: () => exportFile(BACKUP, { schemaVersion: 2 }),
    text: ["created by a newer version of Clay"],
  },
  {
    title: "a broken reference and an invalid field",
    contents: () =>
      exportFile({
        ...BACKUP,
        entries: [
          { ...BACKUP.entries[0]!, topicId: "missing" },
          { ...BACKUP.entries[1]!, url: "ftp://grafana.example.com/" },
        ],
      }),
    text: ["The file has 2 problems.", "missing"],
  },
  {
    title: "a file larger than 10 MB",
    contents: () => Buffer.alloc(10 * 1024 * 1024 + 1, " "),
    text: ["The file is larger than 10 MB."],
  },
];

for (const { title, contents, text } of REJECTED) {
  test(`import rejects ${title} and keeps the catalog`, async ({
    context,
    extensionId,
  }) => {
    const page = await openTab(context, extensionId);
    await store(page, BACKUP);

    await importFile(page, contents());
    for (const part of text)
      await expect(errorDialog(page)).toContainText(part);
    await expect(errorDialog(page)).toContainText(
      "The catalog was not changed.",
    );
    await expect(replaceDialog(page)).toHaveCount(0);
    await errorDialog(page).getByRole("button", { name: "OK" }).click();
    await expect(errorDialog(page)).toBeHidden();
    expect(await storedValue(page)).toEqual(BACKUP);
  });
}

test("import asks before leaving unsaved changes in the entry form", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await store(page, BACKUP);
  await page.getByRole("button", { name: "Add entry" }).click();
  await page
    .getByRole("region", { name: "Details" })
    .getByLabel("Name", { exact: true })
    .fill("Draft");

  await choose(page, "Import");
  const discard = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
  });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(
    page
      .getByRole("region", { name: "Details" })
      .getByLabel("Name", { exact: true }),
  ).toHaveValue("Draft");

  await importFile(page, exportFile(BACKUP), "backup.json", async () => {
    await choose(page, "Import");
    await discard.getByRole("button", { name: "Discard changes" }).click();
  });
  await expect(replaceDialog(page)).toBeVisible();
});

test("a failed save keeps the form input and shows an error", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await store(page, BACKUP);
  await page.evaluate(async () => {
    const key = "filler";
    const used = await chrome.storage.local.getBytesInUse(null);
    const free = chrome.storage.local.QUOTA_BYTES - used;
    // The quota counts the key and the JSON of the value, quotes included
    const length = free - key.length - 2 - 10;
    await chrome.storage.local.set({ [key]: "x".repeat(length) });
  });

  const details = page.getByRole("region", { name: "Details" });
  await page.getByRole("button", { name: "Add entry" }).click();
  await details.getByLabel("Name", { exact: true }).fill("Grafana backup");
  await details
    .getByLabel("URL", { exact: true })
    .fill("https://backup.example.com/");
  await details.getByRole("button", { name: "Save" }).click();

  await expect(details.getByRole("alert")).toContainText(
    "Changes could not be saved:",
  );
  await expect(details.getByLabel("Name", { exact: true })).toHaveValue(
    "Grafana backup",
  );
  await expect(details.getByLabel("URL", { exact: true })).toHaveValue(
    "https://backup.example.com/",
  );
  expect(await storedValue(page)).toEqual(BACKUP);
});

test("invalid stored data offers the raw data and is never overwritten", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const invalid = { schemaVersion: 1, topics: "broken", entries: [] };
  await store(page, invalid);

  await expect(
    page.getByRole("heading", { name: "Stored data is invalid" }),
  ).toBeVisible();
  await expect(page.getByText("It has not been changed.")).toBeVisible();
  await expect(page.locator(".problem-list li")).not.toHaveCount(0);
  await expect(page.getByRole("searchbox")).toBeDisabled();
  await menuButton(page).click();
  await expect(page.getByRole("menuitem", { name: "Export" })).toBeDisabled();
  await page.keyboard.press("Escape");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download raw data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^clay-raw-\d{4}-\d{2}-\d{2}\.json$/,
  );
  expect(JSON.parse(await readFile(await file.path(), "utf8"))).toEqual(
    invalid,
  );
  expect(await storedValue(page)).toEqual(invalid);
});

test("a backup replaces invalid stored data only after confirmation", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await store(page, 42);
  const importBackup = () =>
    page.getByRole("button", { name: "Import backup" }).click();

  await importFile(page, exportFile(BACKUP), "backup.json", importBackup);
  await expect(replaceDialog(page)).toContainText(
    "The stored data is invalid and will be replaced.",
  );
  await replaceDialog(page).getByRole("button", { name: "Cancel" }).click();
  expect(await storedValue(page)).toBe(42);

  await importFile(page, exportFile(BACKUP), "backup.json", importBackup);
  await replaceDialog(page).getByRole("button", { name: "Replace" }).click();
  await expect(topicNames(page)).toHaveText(["Banking", "My VPS"]);
  expect(await storedValue(page)).toEqual(BACKUP);
});
