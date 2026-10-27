import type { BrowserContext, Page } from "@playwright/test";
import type { StoredCatalog } from "../../src/lib/model";
import type { EntryInput } from "../../src/lib/validation";
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

function searchField(page: Page) {
  return page.getByRole("searchbox", { name: "Search all entries" });
}

function topicsPane(page: Page) {
  return page.getByRole("region", { name: "Topics" });
}

function resultsPane(page: Page) {
  return page.getByRole("region", { name: "Search results" });
}

function details(page: Page) {
  return page.getByRole("region", { name: "Details" });
}

function entryNames(page: Page) {
  return page.locator(".entry-list__name");
}

function entryDetails(page: Page) {
  return page.locator(".entry-list__host");
}

function selectedTopic(page: Page) {
  return topicsPane(page).locator('[aria-current="true"] .topic-list__name');
}

function discardDialog(page: Page) {
  return page.getByRole("dialog", { name: "Discard unsaved changes?" });
}

function field(page: Page, label: string) {
  return details(page).getByLabel(label, { exact: true });
}

function input(name: string, fields: Partial<EntryInput> = {}): EntryInput {
  return {
    name,
    url: `https://${name.toLowerCase().replace(/\W+/g, "-")}.example.com/`,
    description: "",
    username: "",
    password: "",
    extraUrl: "",
    twoFactorNote: "",
    ...fields,
  };
}

// Topics are created in the given order, each with its entries
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
  await expect(topicsPane(page).locator(".topic-list__name")).toHaveCount(
    Object.keys(topics).length,
  );
}

async function selectTopic(page: Page, name: string) {
  // An unselected topic's button also contains its entry count
  await topicsPane(page)
    .locator(".topic-list__select", { hasText: name })
    .click();
}

async function selectEntry(page: Page, name: string) {
  await page.locator(".entry-list__select", { hasText: name }).click();
}

async function storedCatalog(page: Page): Promise<StoredCatalog> {
  return page.evaluate(async () => {
    const items = await chrome.storage.local.get("catalog");
    return items.catalog as StoredCatalog;
  });
}

test("results from all topics show their topic and update while typing", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, {
    Work: [input("Mail server"), input("Firmament")],
    Home: [input("Mail"), input("Router")],
  });
  await expect(selectedTopic(page)).toHaveText("Home");

  await searchField(page).fill("ma");
  await expect(resultsPane(page)).toBeVisible();
  await expect(entryNames(page)).toHaveText([
    "Firmament",
    "Mail",
    "Mail server",
  ]);
  await expect(entryDetails(page)).toHaveText([
    "Work · firmament.example.com",
    "Home · mail.example.com",
    "Work · mail-server.example.com",
  ]);

  await searchField(page).pressSequentially("i");
  await expect(entryNames(page)).toHaveText(["Mail", "Mail server"]);
  // Results have no Add action; the selected topic is unchanged
  await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);
  await expect(selectedTopic(page)).toHaveText("Home");

  // Whitespace only is an empty query
  await searchField(page).fill("   ");
  await expect(resultsPane(page)).toBeHidden();
  await expect(entryNames(page)).toHaveText(["Mail", "Router"]);
});

test("matching ignores case and never uses passwords or 2FA notes", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, {
    Fields: [
      input("ByName Alpha"),
      input("Url", { url: "https://alpha-url.test/" }),
      input("Extra", { extraUrl: "https://ALPHA-extra.test/" }),
      input("Described", { description: "Line one\nthe alphabet" }),
      input("User", { username: "alphauser" }),
      input("Secret", { password: "alpha-password" }),
      input("TwoFactor", { twoFactorNote: "alpha codes" }),
    ],
  });

  await searchField(page).fill("ALPHA");
  await expect(entryNames(page)).toHaveText([
    "ByName Alpha",
    "Described",
    "Extra",
    "Url",
    "User",
  ]);

  await searchField(page).fill("password");
  await expect(
    resultsPane(page).getByText("No entries match your search."),
  ).toBeVisible();
});

test("Ctrl+F focuses search and Escape clears it", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("Mail")], Home: [input("Router")] });
  await selectTopic(page, "Work");
  await selectEntry(page, "Mail");

  await page.keyboard.press("ControlOrMeta+f");
  await expect(searchField(page)).toBeFocused();
  await page.keyboard.type("rout");
  await expect(entryNames(page)).toHaveText(["Router"]);

  // Ctrl+F again selects the query so typing replaces it
  await page.getByRole("heading", { name: "Clay" }).click();
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.type("mai");
  await expect(searchField(page)).toHaveValue("mai");

  await page.keyboard.press("Escape");
  await expect(searchField(page)).toHaveValue("");
  await expect(searchField(page)).toBeFocused();
  await expect(selectedTopic(page)).toHaveText("Work");
  await expect(entryNames(page)).toHaveText(["Mail"]);
  // A result from the selected topic stays selected
  await expect(
    details(page).getByRole("heading", { name: "Mail" }),
  ).toBeVisible();
});

test("no matches shows Clear search, which returns to the topic", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("Mail")] });

  await searchField(page).fill("nothing like this");
  const clear = resultsPane(page).getByRole("button", { name: "Clear search" });
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(searchField(page)).toHaveValue("");
  await expect(resultsPane(page)).toBeHidden();
  await expect(entryNames(page)).toHaveText(["Mail"]);
});

test("a result from another topic shows its details and can be edited and moved", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, {
    Work: [input("Mail", { username: "admin" })],
    Home: [input("Router")],
    Archive: [],
  });
  await expect(selectedTopic(page)).toHaveText("Archive");

  await searchField(page).fill("mail");
  await selectEntry(page, "Mail");
  await expect(
    details(page).getByRole("heading", { name: "Mail" }),
  ).toBeVisible();
  await expect(details(page).getByText("admin")).toBeVisible();
  await expect(selectedTopic(page)).toHaveText("Archive");

  await details(page).getByRole("button", { name: "Edit" }).click();
  await field(page, "Name").fill("Mail edited");
  await details(page).getByRole("button", { name: "Save" }).click();
  await expect(
    details(page).getByRole("heading", { name: "Mail edited" }),
  ).toBeVisible();
  await expect(entryNames(page)).toHaveText(["Mail edited"]);

  await details(page).getByRole("button", { name: "Move" }).click();
  const dialog = page.getByRole("dialog", { name: "Move entry “Mail edited”" });
  await dialog.getByLabel("Topic").selectOption({ label: "Home" });
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect(dialog).toBeHidden();
  // The moved entry stays among the results and selected
  await expect(entryDetails(page)).toHaveText(["Home · mail.example.com"]);
  await expect(
    details(page).getByRole("heading", { name: "Mail edited" }),
  ).toBeVisible();
  const catalog = await storedCatalog(page);
  const home = catalog.topics.find((topic) => topic.name === "Home");
  expect(catalog.entries.find((e) => e.name === "Mail edited")?.topicId).toBe(
    home?.id,
  );

  // Clearing returns to the selected topic, where the entry is not
  await searchField(page).press("Escape");
  await expect(selectedTopic(page)).toHaveText("Archive");
  await expect(
    details(page).getByText("Select an entry to see its details."),
  ).toBeVisible();
});

test("selecting a topic clears the search", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("Mail")], Home: [input("Router")] });
  await expect(selectedTopic(page)).toHaveText("Home");

  await searchField(page).fill("mail");
  await selectTopic(page, "Work");
  await expect(searchField(page)).toHaveValue("");
  await expect(selectedTopic(page)).toHaveText("Work");
  await expect(entryNames(page)).toHaveText(["Mail"]);

  // The selected topic too
  await searchField(page).fill("router");
  await selectTopic(page, "Work");
  await expect(searchField(page)).toHaveValue("");
  await expect(entryNames(page)).toHaveText(["Mail"]);
});

test("starting a search asks before leaving unsaved changes", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("Mail"), input("Router")] });
  await selectEntry(page, "Mail");

  // A form without changes closes
  await details(page).getByRole("button", { name: "Edit" }).click();
  await searchField(page).fill("rout");
  await expect(discardDialog(page)).toBeHidden();
  await expect(entryNames(page)).toHaveText(["Router"]);
  await searchField(page).press("Escape");

  await selectEntry(page, "Mail");
  await details(page).getByRole("button", { name: "Edit" }).click();
  await field(page, "Name").fill("Mail edited");

  await searchField(page).fill("rout");
  await expect(discardDialog(page)).toBeVisible();
  await discardDialog(page)
    .getByRole("button", { name: "Keep editing" })
    .click();
  await expect(searchField(page)).toHaveValue("");
  await expect(field(page, "Name")).toHaveValue("Mail edited");

  await searchField(page).fill("rout");
  await discardDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();
  await expect(searchField(page)).toHaveValue("rout");
  await expect(entryNames(page)).toHaveText(["Router"]);
  await expect(
    details(page).getByText("Select an entry to see its details."),
  ).toBeVisible();
});

test("search is disabled while there are no topics", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await expect(page.getByText("Welcome to Clay")).toBeVisible();
  await expect(searchField(page)).toBeDisabled();
});
