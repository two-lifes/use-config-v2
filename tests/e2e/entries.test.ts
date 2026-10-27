import type { BrowserContext, Page } from "@playwright/test";
import type { Entry, StoredCatalog } from "../../src/lib/model";
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

function topicsPane(page: Page) {
  return page.getByRole("region", { name: "Topics" });
}

function details(page: Page) {
  return page.getByRole("region", { name: "Details" });
}

function entryNames(page: Page) {
  return page.locator(".entry-list__name");
}

function selectedEntry(page: Page) {
  return page.locator('.entry-list [aria-current="true"]');
}

function discardDialog(page: Page) {
  return page.getByRole("dialog", { name: "Discard unsaved changes?" });
}

async function storedCatalog(page: Page): Promise<StoredCatalog> {
  return page.evaluate(async () => {
    const items = await chrome.storage.local.get("catalog");
    return items.catalog as StoredCatalog;
  });
}

async function storedEntry(page: Page, name: string): Promise<Entry> {
  const catalog = await storedCatalog(page);
  const entry = catalog.entries.find((item) => item.name === name);
  if (!entry) throw new Error(`Entry ${name} is not stored`);
  return entry;
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

function field(page: Page, label: string) {
  return details(page).getByLabel(label, { exact: true });
}

async function beforeUnloadPrevented(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test("an added entry is sorted by name, selected and persists", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { "My VPS": [input("Zeta")] });

  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(
    details(page).getByRole("heading", { name: "New entry" }),
  ).toBeVisible();
  await field(page, "Name").fill("  alpha  ");
  await field(page, "URL").fill("https://alpha.example.com/login");
  await field(page, "Username").fill("root");
  await field(page, "Password").fill("s3cret");
  await details(page).getByRole("button", { name: "Save" }).click();

  await expect(entryNames(page)).toHaveText(["alpha", "Zeta"]);
  await expect(selectedEntry(page)).toContainText("alpha");
  await expect(selectedEntry(page)).toContainText("alpha.example.com");
  await expect(
    details(page).getByRole("heading", { name: "alpha" }),
  ).toBeVisible();
  // The password is masked as 8 dots regardless of its length
  await expect(details(page)).toContainText("••••••••");
  await expect(details(page)).not.toContainText("s3cret");

  await page.reload();
  await expect(entryNames(page)).toHaveText(["alpha", "Zeta"]);
  const stored = await storedEntry(page, "alpha");
  expect(stored).toMatchObject({
    url: "https://alpha.example.com/login",
    username: "root",
    password: "s3cret",
  });
});

test("an empty topic offers to add the first entry", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Empty: [] });

  await expect(page.getByText("This topic has no entries yet.")).toBeVisible();
  await page
    .locator(".empty-state")
    .getByRole("button", { name: "Add entry" })
    .click();
  await expect(field(page, "Name")).toBeFocused();
});

test("invalid fields are rejected inline and nothing is saved", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [] });
  await page.getByRole("button", { name: "Add entry" }).first().click();
  const save = details(page).getByRole("button", { name: "Save" });

  await save.click();
  await expect(field(page, "Name")).toHaveAccessibleDescription(
    "Enter a name.",
  );
  await expect(field(page, "URL")).toHaveAccessibleDescription("Enter a URL.");

  await field(page, "Name").fill("x".repeat(201));
  await field(page, "URL").fill("example.com");
  await field(page, "Additional URL").fill("ftp://files.example.com");
  await field(page, "Password").fill("p".repeat(1001));
  await save.click();
  await expect(field(page, "Name")).toHaveAccessibleDescription(
    "Use at most 200 characters.",
  );
  const urlMessage = "Enter a URL that starts with http:// or https://.";
  await expect(field(page, "URL")).toHaveAccessibleDescription(urlMessage);
  await expect(field(page, "Additional URL")).toHaveAccessibleDescription(
    urlMessage,
  );
  await expect(field(page, "Password")).toHaveAccessibleDescription(
    "Use at most 1000 characters.",
  );

  // Editing a field clears its message
  await field(page, "URL").fill("https://example.com");
  await expect(field(page, "URL")).not.toHaveAttribute("aria-invalid");

  expect((await storedCatalog(page)).entries).toEqual([]);
});

test("line breaks and non-Latin text are kept; Ctrl+S saves", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [] });
  await page.getByRole("button", { name: "Add entry" }).first().click();

  const description = "Сервер в Хельсинки\nsecond line ✓";
  const note = "Codes in the app\n\nBackup: 1234";
  await field(page, "Name").fill("Почта");
  await field(page, "URL").fill("https://mail.example.com");
  await field(page, "Description").fill(description);
  await field(page, "Username").fill(" 用户 ");
  await field(page, "2FA note").fill(note);
  await field(page, "2FA note").press("ControlOrMeta+s");

  await expect(
    details(page).getByRole("heading", { name: "Почта" }),
  ).toBeVisible();
  const stored = await storedEntry(page, "Почта");
  expect(stored).toMatchObject({
    description,
    username: " 用户 ",
    twoFactorNote: note,
  });
  // The details view shows the line breaks
  const shown = details(page).locator(".details__value--multiline");
  expect(
    await shown.evaluateAll((items) => items.map((i) => i.textContent)),
  ).toEqual([note, description]);
  await expect(shown.first()).toHaveCSS("white-space", "pre-wrap");
});

test("an entry is edited; Cancel restores the saved values", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("Grafana", { username: "admin" })] });
  await selectEntry(page, "Grafana");
  const before = await storedEntry(page, "Grafana");

  await details(page).getByRole("button", { name: "Edit" }).click();
  await expect(field(page, "Username")).toHaveValue("admin");
  await field(page, "Name").fill("Changed");
  await details(page).getByRole("button", { name: "Cancel" }).click();
  await expect(
    details(page).getByRole("heading", { name: "Grafana" }),
  ).toBeVisible();
  // Cancel is an explicit choice and does not ask
  await expect(discardDialog(page)).toBeHidden();
  expect(await storedEntry(page, "Grafana")).toEqual(before);

  await details(page).getByRole("button", { name: "Edit" }).click();
  await expect(field(page, "Name")).toHaveValue("Grafana");
  await field(page, "URL").fill("https://grafana.internal.example/");
  await details(page).getByRole("button", { name: "Save" }).click();
  await expect(selectedEntry(page)).toContainText("grafana.internal.example");
  const after = await storedEntry(page, "Grafana");
  expect(after).toMatchObject({
    id: before.id,
    url: "https://grafana.internal.example/",
    createdAt: before.createdAt,
  });
});

test("unsaved changes ask Discard changes / Keep editing", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, {
    Alpha: [input("First"), input("Second")],
    Beta: [input("Other")],
  });
  await selectEntry(page, "First");
  const before = await storedEntry(page, "First");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);

  await details(page).getByRole("button", { name: "Edit" }).click();
  // Opening a form without changes does not ask
  await selectEntry(page, "Second");
  await expect(discardDialog(page)).toBeHidden();
  await expect(
    details(page).getByRole("heading", { name: "Second" }),
  ).toBeVisible();

  await selectEntry(page, "First");
  await details(page).getByRole("button", { name: "Edit" }).click();
  await field(page, "Name").fill("First edited");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(true);

  // Another entry: Keep editing returns to the form with the input
  await selectEntry(page, "Second");
  await expect(discardDialog(page)).toBeVisible();
  await discardDialog(page)
    .getByRole("button", { name: "Keep editing" })
    .click();
  await expect(discardDialog(page)).toBeHidden();
  await expect(field(page, "Name")).toHaveValue("First edited");

  // Adding a new entry asks too
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(discardDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(field(page, "Name")).toHaveValue("First edited");

  // Another topic: Discard continues and leaves the saved entry unchanged
  await selectTopic(page, "Beta");
  await discardDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();
  await expect(entryNames(page)).toHaveText(["Other"]);
  await expect(
    details(page).getByText("Select an entry to see its details."),
  ).toBeVisible();
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
  expect(await storedEntry(page, "First")).toEqual(before);

  // Discard before adding opens an empty form
  await selectTopic(page, "Alpha");
  await selectEntry(page, "First");
  await details(page).getByRole("button", { name: "Edit" }).click();
  await field(page, "Name").fill("Edited again");
  await page.getByRole("button", { name: "Add entry" }).click();
  await discardDialog(page)
    .getByRole("button", { name: "Discard changes" })
    .click();
  await expect(
    details(page).getByRole("heading", { name: "New entry" }),
  ).toBeVisible();
  await expect(field(page, "Name")).toHaveValue("");
  expect(await storedEntry(page, "First")).toEqual(before);
});

test("deleting an entry asks for confirmation", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("Keep"), input("Remove")] });
  await selectEntry(page, "Remove");
  const dialog = page.getByRole("dialog", { name: "Delete entry “Remove”?" });

  await details(page).getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(entryNames(page)).toHaveText(["Keep", "Remove"]);
  expect((await storedCatalog(page)).entries).toHaveLength(2);

  await details(page).getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await expect(entryNames(page)).toHaveText(["Keep"]);
  await expect(
    details(page).getByText("Select an entry to see its details."),
  ).toBeVisible();
  const stored = await storedCatalog(page);
  expect(stored.entries.map((entry) => entry.name)).toEqual(["Keep"]);
});

test("an entry moves to another topic and stays there after reload", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, {
    Alpha: [input("Mover"), input("Stay")],
    Beta: [],
    Gamma: [],
  });
  await selectEntry(page, "Mover");
  const dialog = page.getByRole("dialog", { name: "Move entry “Mover”" });

  await details(page).getByRole("button", { name: "Move" }).click();
  const target = dialog.getByLabel("Topic");
  await expect(target.locator("option")).toHaveText(["Beta", "Gamma"]);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(entryNames(page)).toHaveText(["Mover", "Stay"]);

  await details(page).getByRole("button", { name: "Move" }).click();
  await target.selectOption({ label: "Gamma" });
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect(dialog).toBeHidden();
  await expect(entryNames(page)).toHaveText(["Stay"]);

  await page.reload();
  await expect(entryNames(page)).toHaveText(["Stay"]);
  await selectTopic(page, "Gamma");
  await expect(entryNames(page)).toHaveText(["Mover"]);
  const catalog = await storedCatalog(page);
  const gamma = catalog.topics.find((topic) => topic.name === "Gamma");
  expect((await storedEntry(page, "Mover")).topicId).toBe(gamma?.id);
});

// Where the text is drawn inside a box of the page: the first column and the
// vertical middle of the pixels that differ from the box's background
async function textInk(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} is not rendered`);
  // The inset skips the border and the focus ring
  const clip = {
    x: box.x + 3,
    y: box.y + 3,
    width: 80,
    height: box.height - 6,
  };
  const image = (await page.screenshot({ clip })).toString("base64");
  const ink = await page.evaluate(async (image) => {
    const element = new Image();
    element.src = `data:image/png;base64,${image}`;
    await element.decode();
    const canvas = document.createElement("canvas");
    canvas.width = element.width;
    canvas.height = element.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(element, 0, 0);
    const { data, width, height } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const sum = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return data[i] + data[i + 1] + data[i + 2];
    };
    // The middle of the left edge is padding; the corners may be rounded border
    const background = sum(0, Math.floor(height / 2));
    let left = width;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (Math.abs(sum(x, y) - background) > 150) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    return { left, middle: (top + bottom) / 2 };
  }, image);
  return {
    left: clip.x + ink.left,
    middle: clip.y + ink.middle - box.y,
  };
}

test("the Move dialog shows the current topic aligned with the select", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  // Names with the same first letter make the text edges comparable
  await seed(page, { Beta: [], Bravo: [input("Mover")] });
  await selectTopic(page, "Bravo");
  await selectEntry(page, "Mover");
  await details(page).getByRole("button", { name: "Move" }).click();
  const dialog = page.getByRole("dialog", { name: "Move entry “Mover”" });

  await expect(dialog.getByRole("term")).toHaveText("Current topic");
  await expect(dialog.getByRole("definition")).toHaveText("Bravo");
  await expect(dialog.getByLabel("Topic")).toHaveValue(/.+/);
  for (const colorScheme of ["light", "dark"] as const) {
    // Without the opening animation the boxes do not move between measurements
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const current = await textInk(page, "dialog .field__value");
    const select = await textInk(page, "dialog select");
    expect(Math.abs(current.left - select.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.middle - select.middle)).toBeLessThanOrEqual(1);
  }
});

test("the entry form is a left-aligned column at most 560 px wide", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await page.setViewportSize({ width: 1440, height: 800 });
  await seed(page, { Work: [input("Wide")] });
  await selectEntry(page, "Wide");
  await details(page).getByRole("button", { name: "Edit" }).click();

  const pane = await details(page).boundingBox();
  const form = await details(page).locator(".entry-form").boundingBox();
  const name = await field(page, "Name").boundingBox();
  if (!pane || !form || !name) throw new Error("The form is not rendered");
  expect(pane.width).toBeGreaterThan(600);
  expect(form.width).toBe(560);
  expect(form.x).toBe(pane.x + 1);
  expect(name.width).toBe(560 - 2 * 16);
});

test("Move is disabled when there is no other topic", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Only: [input("Entry")] });
  await selectEntry(page, "Entry");
  await expect(
    details(page).getByRole("button", { name: "Move" }),
  ).toBeDisabled();
});

test("entries show a favicon, or a letter avatar if it fails", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("bitbucket")] });
  const item = page.locator(".entry-list__select", { hasText: "bitbucket" });

  const icon = item.locator("img.entry-icon");
  const src = new URL((await icon.getAttribute("src")) ?? "");
  expect(src.pathname).toBe("/_favicon/");
  expect(src.searchParams.get("pageUrl")).toBe(
    "https://bitbucket.example.com/",
  );
  // Chrome serves a default icon for unknown sites, so a failure is simulated
  await icon.dispatchEvent("error");
  await expect(item.locator(".entry-icon--letter")).toHaveText("B");
});

test("arrow keys move between entries and Enter selects", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: [input("One"), input("Two")] });
  await page.locator(".entry-list__select", { hasText: "One" }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(selectedEntry(page)).toContainText("Two");
  await expect(
    details(page).getByRole("heading", { name: "Two" }),
  ).toBeVisible();
});
