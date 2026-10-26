import type { BrowserContext, Page } from "@playwright/test";
import type { StoredCatalog } from "../../src/lib/model";
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

function topicsPane(page: Page) {
  return page.getByRole("region", { name: "Topics" });
}

function topicNames(page: Page) {
  return topicsPane(page).locator(".topic-list__name");
}

function selectedTopic(page: Page) {
  return topicsPane(page).locator('[aria-current="true"]');
}

async function storedCatalog(page: Page): Promise<StoredCatalog> {
  return page.evaluate(async () => {
    const items = await chrome.storage.local.get("catalog");
    return items.catalog as StoredCatalog;
  });
}

async function seedTopics(page: Page, names: string[]) {
  await page.evaluate(async (names) => {
    for (const name of names) {
      await useConfigTest.repository.update((catalog, context) =>
        useConfigTest.operations.createTopic(catalog, name, context),
      );
    }
  }, names);
  await expect(topicNames(page)).toHaveCount(names.length);
}

async function createTopic(page: Page, name: string) {
  await topicsPane(page).getByRole("button", { name: "New topic" }).click();
  const dialog = page.getByRole("dialog", { name: "New topic" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  return dialog;
}

test("the welcome state creates the first topic and selects it", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await page.getByRole("button", { name: "Create topic" }).click();

  const dialog = page.getByRole("dialog", { name: "New topic" });
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await dialog.getByLabel("Name").fill("  Work  ");
  await dialog.getByLabel("Name").press("Enter");

  await expect(dialog).toBeHidden();
  await expect(topicNames(page)).toHaveText(["Work"]);
  await expect(selectedTopic(page)).toHaveText("Work");
  expect((await storedCatalog(page)).topics.map((t) => t.name)).toEqual([
    "Work",
  ]);
});

test("new topics are sorted by name and the newest is selected", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seedTopics(page, ["b"]);

  for (const name of ["A", "c", "Ä2"]) {
    const dialog = await createTopic(page, name);
    await expect(dialog).toBeHidden();
    await expect(selectedTopic(page)).toHaveText(name);
  }
  await expect(topicNames(page)).toHaveText(["A", "Ä2", "b", "c"]);

  // Topics and their order persist after a reload
  await page.reload();
  await expect(topicNames(page)).toHaveText(["A", "Ä2", "b", "c"]);
});

test("an empty or duplicate name is rejected inline", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seedTopics(page, ["Work"]);

  const dialog = await createTopic(page, "   ");
  await expect(dialog.getByText("Enter a topic name.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await dialog.getByLabel("Name").fill(" wORK ");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(
    dialog.getByText("A topic with this name already exists."),
  ).toBeVisible();

  // Editing the name clears the message
  await dialog.getByLabel("Name").fill("Home");
  await expect(dialog.locator(".field__error")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect((await storedCatalog(page)).topics.map((t) => t.name)).toEqual([
    "Work",
  ]);
});

test("Escape closes the dialog without saving", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seedTopics(page, ["Work"]);

  await topicsPane(page).getByRole("button", { name: "New topic" }).click();
  const dialog = page.getByRole("dialog", { name: "New topic" });
  await dialog.getByLabel("Name").fill("Home");
  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
  await expect(topicNames(page)).toHaveText(["Work"]);

  // Opening again starts with an empty form
  await topicsPane(page).getByRole("button", { name: "New topic" }).click();
  await expect(dialog.getByLabel("Name")).toHaveValue("");
});

test("a topic is renamed under the same rules", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seedTopics(page, ["Banking", "Work"]);

  await topicNames(page).filter({ hasText: "Work" }).click();
  await topicsPane(page).getByRole("button", { name: "Rename topic" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename topic" });
  await expect(dialog.getByLabel("Name")).toHaveValue("Work");

  await dialog.getByLabel("Name").fill("banking");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(
    dialog.getByText("A topic with this name already exists."),
  ).toBeVisible();

  await dialog.getByLabel("Name").fill("");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog.getByText("Enter a topic name.")).toBeVisible();

  // Changing only the case of its own name is allowed
  await dialog.getByLabel("Name").fill("WORK");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog).toBeHidden();
  await expect(topicNames(page)).toHaveText(["Banking", "WORK"]);

  await topicsPane(page).getByRole("button", { name: "Rename topic" }).click();
  await dialog.getByLabel("Name").fill("Accounts");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(dialog).toBeHidden();
  await expect(topicNames(page)).toHaveText(["Accounts", "Banking"]);
  await expect(selectedTopic(page)).toHaveText("Accounts");
});

test("deleting a topic states its entry count and removes its entries", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await page.evaluate(async () => {
    const { repository, operations } = useConfigTest;
    const created = await repository.update((catalog, context) =>
      operations.createTopic(catalog, "Work", context),
    );
    if (!created.ok) throw new Error("Topic was not created");
    for (const name of ["Mail", "Wiki", "Chat"]) {
      await repository.update((catalog, context) =>
        operations.addEntry(
          catalog,
          created.id,
          {
            name,
            url: "https://example.com",
            description: "",
            username: "",
            password: "",
            extraUrl: "",
            twoFactorNote: "",
          },
          context,
        ),
      );
    }
    await repository.update((catalog, context) =>
      operations.createTopic(catalog, "Home", context),
    );
  });
  await expect(topicNames(page)).toHaveText(["Home", "Work"]);
  await expect(
    topicsPane(page)
      .locator(".topic-list__item", { hasText: "Work" })
      .locator(".topic-list__count"),
  ).toHaveText("3");

  await topicNames(page).filter({ hasText: "Work" }).click();
  await topicsPane(page).getByRole("button", { name: "Delete topic" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete topic “Work”?" });
  await expect(dialog).toContainText("Its 3 entries will also be deleted.");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(topicNames(page)).toHaveText(["Home", "Work"]);
  expect((await storedCatalog(page)).entries).toHaveLength(3);

  await topicsPane(page).getByRole("button", { name: "Delete topic" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await expect(topicNames(page)).toHaveText(["Home"]);
  await expect(selectedTopic(page)).toHaveText("Home");
  const stored = await storedCatalog(page);
  expect(stored.topics.map((t) => t.name)).toEqual(["Home"]);
  expect(stored.entries).toHaveLength(0);
});

test("deleting an empty topic asks a simple confirmation", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seedTopics(page, ["Home"]);

  await topicsPane(page).getByRole("button", { name: "Delete topic" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete topic “Home”?" });
  await expect(dialog).toContainText("This topic has no entries.");
  await dialog.getByRole("button", { name: "Delete" }).click();

  // The last topic is gone, so the welcome state returns
  await expect(
    page.getByRole("heading", { name: "Welcome to Use Config" }),
  ).toBeVisible();
  expect((await storedCatalog(page)).topics).toEqual([]);
});

test("arrow keys move between topics and Enter selects", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seedTopics(page, ["A", "B", "C"]);
  await expect(selectedTopic(page)).toHaveText("A");

  await selectedTopic(page).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(
    topicsPane(page).locator(".topic-list__select", { hasText: "C" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  await expect(selectedTopic(page)).toHaveText("B");
});
