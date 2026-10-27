import type { BrowserContext, Page } from "@playwright/test";
import type { StoredCatalog } from "../../src/lib/model";
import type { EntryInput } from "../../src/lib/validation";
import type { TestHook } from "../../src/storage/repository";
import { expect, test } from "./fixtures";

// Page functions are serialized, so they reach the repository through the
// hook the tab page exposes
declare global {
  var useConfigTest: TestHook;
}

const ENTRY: EntryInput = {
  name: "Mail",
  url: "https://mail.example.com",
  description: "",
  username: "me",
  password: "secret",
  extraUrl: "",
  twoFactorNote: "",
};

async function openTab(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.waitForFunction(() => "useConfigTest" in globalThis);
  return page;
}

function storedValue(page: Page) {
  return page.evaluate(async () => {
    const items = await chrome.storage.local.get("catalog");
    return items.catalog;
  });
}

function createTopic(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      useConfigTest.repository.update((catalog, context) =>
        useConfigTest.operations.createTopic(catalog, name, context),
      ),
    name,
  );
}

function addEntry(page: Page, topicId: string, input: EntryInput) {
  return page.evaluate(
    ({ topicId, input }) =>
      useConfigTest.repository.update((catalog, context) =>
        useConfigTest.operations.addEntry(catalog, topicId, input, context),
      ),
    { topicId, input },
  );
}

function editEntry(page: Page, entryId: string, input: EntryInput) {
  return page.evaluate(
    ({ entryId, input }) =>
      useConfigTest.repository.update((catalog, context) =>
        useConfigTest.operations.editEntry(catalog, entryId, input, context),
      ),
    { entryId, input },
  );
}

function load(page: Page) {
  return page.evaluate(() => useConfigTest.repository.load());
}

function idOf(result: Awaited<ReturnType<typeof createTopic>>): string {
  if (!result.ok) {
    throw new Error(`Operation failed: ${JSON.stringify(result.error)}`);
  }
  return result.id;
}

test("a missing key loads as an empty catalog without writing", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);

  expect(await load(page)).toEqual({
    status: "ok",
    catalog: { schemaVersion: 1, topics: [], entries: [] },
  });
  expect(await storedValue(page)).toBeUndefined();
});

test("saved changes are visible to a newly opened tab", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const topicId = idOf(await createTopic(page, "Work"));
  const entryId = idOf(await addEntry(page, topicId, ENTRY));

  const other = await openTab(context, extensionId);
  const result = await load(other);

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.catalog.topics).toMatchObject([{ id: topicId, name: "Work" }]);
  expect(result.catalog.entries).toMatchObject([
    { id: entryId, topicId, ...ENTRY },
  ]);
});

test("a rejected operation leaves storage unchanged", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  idOf(await createTopic(page, "Work"));
  const before = await storedValue(page);

  const result = await createTopic(page, "work");

  expect(result).toMatchObject({ ok: false, error: { kind: "invalid-name" } });
  expect(await storedValue(page)).toEqual(before);
});

test("invalid stored data is reported and never overwritten", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const invalid = { schemaVersion: 2, topics: [], entries: [] };
  await page.evaluate(
    (value) => chrome.storage.local.set({ catalog: value }),
    invalid,
  );

  const loaded = await load(page);
  expect(loaded).toMatchObject({ status: "invalid", raw: invalid });
  expect(loaded.status === "invalid" && loaded.problems.length).toBeTruthy();

  const result = await createTopic(page, "Work");
  expect(result).toMatchObject({ ok: false, error: { kind: "invalid-state" } });
  expect(await storedValue(page)).toEqual(invalid);
});

test("a failed write returns an error and keeps the saved catalog", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  idOf(await createTopic(page, "Work"));
  const before = await storedValue(page);

  // Fill the quota so that the next change no longer fits
  await page.evaluate(async () => {
    const key = "filler";
    const used = await chrome.storage.local.getBytesInUse(null);
    const free = chrome.storage.local.QUOTA_BYTES - used;
    // The quota counts the key and the JSON of the value, quotes included
    const length = free - key.length - 2 - 10;
    await chrome.storage.local.set({ [key]: "x".repeat(length) });
  });

  const result = await createTopic(page, "Personal");

  expect(result).toMatchObject({ ok: false, error: { kind: "write-failed" } });
  expect(await storedValue(page)).toEqual(before);
});

test("replace writes a whole catalog over a valid or an invalid state", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  idOf(await createTopic(page, "Old"));
  const replacement: StoredCatalog = {
    schemaVersion: 1,
    topics: [
      {
        id: "t1",
        name: "New",
        createdAt: "2026-10-26T12:00:00.000Z",
        updatedAt: "2026-10-26T12:00:00.000Z",
      },
    ],
    entries: [],
  };

  const replaced = await page.evaluate(
    (catalog) => useConfigTest.repository.replace(catalog),
    replacement,
  );
  expect(replaced).toMatchObject({ ok: true });
  expect(await storedValue(page)).toEqual(replacement);

  await page.evaluate(() => chrome.storage.local.set({ catalog: 42 }));
  const recovered = await page.evaluate(
    (catalog) => useConfigTest.repository.replace(catalog),
    replacement,
  );
  expect(recovered).toMatchObject({ ok: true });
  expect(await storedValue(page)).toEqual(replacement);
});

test("replace rejects an invalid catalog and keeps the stored one", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  idOf(await createTopic(page, "Work"));
  const before = await storedValue(page);

  const result = await page.evaluate(() =>
    useConfigTest.repository.replace({
      schemaVersion: 1,
      topics: [],
      entries: [{ id: "e1" }],
    } as never),
  );

  expect(result).toMatchObject({
    ok: false,
    error: { kind: "invalid-result" },
  });
  expect(await storedValue(page)).toEqual(before);
});

test("concurrent changes in one tab are all kept", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const names = Array.from({ length: 10 }, (_, index) => `Topic ${index}`);

  const results = await page.evaluate(
    (names) =>
      Promise.all(
        names.map((name) =>
          useConfigTest.repository.update((catalog, context) =>
            useConfigTest.operations.createTopic(catalog, name, context),
          ),
        ),
      ),
    names,
  );

  expect(results.every((result) => result.ok)).toBe(true);
  const loaded = await load(page);
  expect(
    loaded.status === "ok" && loaded.catalog.topics.map((topic) => topic.name),
  ).toEqual(names);
});

test("changes from two tabs are merged; the last save of an entry wins", async ({
  context,
  extensionId,
}) => {
  const first = await openTab(context, extensionId);
  const second = await openTab(context, extensionId);
  const topicId = idOf(await createTopic(first, "Work"));
  const mailId = idOf(await addEntry(first, topicId, ENTRY));
  const bankId = idOf(
    await addEntry(first, topicId, { ...ENTRY, name: "Bank" }),
  );

  const tabNames = (tab: string) =>
    Array.from({ length: 10 }, (_, index) => `${tab} ${index}`);
  await Promise.all([
    editEntry(first, mailId, { ...ENTRY, username: "first" }),
    editEntry(second, bankId, { ...ENTRY, name: "Bank", username: "second" }),
    ...tabNames("First").map((name) => createTopic(first, name)),
    ...tabNames("Second").map((name) => createTopic(second, name)),
  ]);

  let loaded = await load(first);
  expect(loaded.status).toBe("ok");
  if (loaded.status !== "ok") return;
  expect(loaded.catalog.topics).toHaveLength(21);
  expect(
    Object.fromEntries(
      loaded.catalog.entries.map((entry) => [entry.id, entry.username]),
    ),
  ).toEqual({ [mailId]: "first", [bankId]: "second" });

  await editEntry(first, mailId, { ...ENTRY, description: "From first" });
  await editEntry(second, mailId, { ...ENTRY, description: "From second" });

  loaded = await load(first);
  expect(
    loaded.status === "ok" &&
      loaded.catalog.entries.find((entry) => entry.id === mailId)?.description,
  ).toBe("From second");
});

test("subscribers receive changes made in another tab", async ({
  context,
  extensionId,
}) => {
  const watcher = await openTab(context, extensionId);
  await watcher.evaluate(() => {
    const received: unknown[] = [];
    (globalThis as { received?: unknown[] }).received = received;
    useConfigTest.repository.subscribe((result) => received.push(result));
  });

  const editor = await openTab(context, extensionId);
  const topicId = idOf(await createTopic(editor, "Work"));

  await watcher.waitForFunction(
    () => (globalThis as { received?: unknown[] }).received?.length === 1,
  );
  const [result] = await watcher.evaluate(
    () => (globalThis as unknown as { received: unknown[] }).received,
  );
  expect(result).toMatchObject({
    status: "ok",
    catalog: { topics: [{ id: topicId, name: "Work" }] },
  });
});
