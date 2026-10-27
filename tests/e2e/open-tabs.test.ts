import type { BrowserContext, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { EntryInput } from "../../src/lib/validation";
import type { TestHook } from "../../src/storage/repository";
import { expect, test } from "./fixtures";

declare global {
  var useConfigTest: TestHook;
}

// Two local servers give two origins that differ only by port (D-22)
const servers: Server[] = [];
let originA: string;
let originB: string;

async function startServer(): Promise<string> {
  const server = createServer((_, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end("<title>Site</title>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test.beforeAll(async () => {
  originA = await startServer();
  originB = await startServer();
});

test.afterAll(async () => {
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function openTab(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.waitForFunction(() => "useConfigTest" in globalThis);
  return page;
}

function input(name: string, fields: Partial<EntryInput> = {}): EntryInput {
  return {
    name,
    url: `${originA}/${name.toLowerCase()}`,
    description: "",
    username: "",
    password: "",
    extraUrl: "",
    twoFactorNote: "",
    ...fields,
  };
}

async function seed(page: Page, topic: string, entries: EntryInput[]) {
  await page.evaluate(
    async ({ topic, entries }) => {
      const { repository, operations } = useConfigTest;
      const created = await repository.update((catalog, context) =>
        operations.createTopic(catalog, topic, context),
      );
      if (!created.ok) throw new Error(`Topic ${topic} was not created`);
      for (const entry of entries) {
        await repository.update((catalog, context) =>
          operations.addEntry(catalog, created.id, entry, context),
        );
      }
    },
    { topic, entries },
  );
  await page.locator(".topic-list__select", { hasText: topic }).click();
}

function row(page: Page, name: string) {
  return page.locator(".entry-list__item", { hasText: name });
}

function mark(page: Page, name: string) {
  return row(page, name).getByRole("img", { name: "Open in a tab" });
}

test("the mark follows opening, navigating and closing a tab (US-15)", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, "Servers", [
    input("Alpha"),
    input("Beta", { url: `${originB}/beta` }),
  ]);
  await expect(row(page, "Alpha")).toBeVisible();
  await expect(mark(page, "Alpha")).toHaveCount(0);
  await expect(mark(page, "Beta")).toHaveCount(0);

  // Another path of the same origin counts
  const site = await context.newPage();
  await site.goto(`${originA}/other/path`);
  await expect(mark(page, "Alpha")).toBeVisible();
  await expect(mark(page, "Alpha")).toHaveAttribute("title", "Open in a tab");
  await expect(mark(page, "Beta")).toHaveCount(0);

  await site.goto(`${originB}/`);
  await expect(mark(page, "Beta")).toBeVisible();
  await expect(mark(page, "Alpha")).toHaveCount(0);

  await site.close();
  await expect(mark(page, "Beta")).toHaveCount(0);
});

test("an open entry row has the open bar (D-25)", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, "Servers", [
    input("Alpha"),
    input("Beta", { url: `${originB}/beta` }),
  ]);
  await expect(row(page, "Alpha")).toBeVisible();
  await expect(row(page, "Alpha")).not.toHaveClass(/entry-list__item--open/);

  const site = await context.newPage();
  await site.goto(`${originA}/`);
  await expect(row(page, "Alpha")).toHaveClass(/entry-list__item--open/);
  await expect(row(page, "Beta")).not.toHaveClass(/entry-list__item--open/);

  await site.close();
  await expect(row(page, "Alpha")).not.toHaveClass(/entry-list__item--open/);
});

test("topics show how many entries are open (D-25)", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, "Servers", [
    input("Alpha"),
    input("Alpha copy"),
    input("Beta", { url: `${originB}/beta` }),
  ]);
  await seed(page, "Other", [input("Gamma", { url: `${originB}/` })]);
  const servers = page.locator(".topic-list__item", { hasText: "Servers" });
  const other = page.locator(".topic-list__item", { hasText: "Other" });
  const openCount = (topic: typeof servers) =>
    topic.getByRole("img", { name: /open in tabs/ });
  await expect(openCount(servers)).toHaveCount(0);

  const site = await context.newPage();
  await site.goto(`${originA}/`);
  await expect(openCount(servers)).toHaveAccessibleName("2 open in tabs");
  await expect(openCount(servers)).toHaveAttribute("title", "2 open in tabs");
  await expect(openCount(servers)).toHaveText("2");
  await expect(servers.locator(".topic-list__count")).toHaveText("3");
  // "Other" is selected, so it shows its actions instead of the counts
  await expect(openCount(other)).toHaveCount(0);

  await site.goto(`${originB}/`);
  await expect(openCount(servers)).toHaveAccessibleName("1 open in tabs");
  await expect(openCount(other)).toHaveCount(0);

  await site.close();
  await expect(openCount(servers)).toHaveCount(0);
});

test("a tab open before the extension tab is marked", async ({
  context,
  extensionId,
}) => {
  const setup = await openTab(context, extensionId);
  await seed(setup, "Servers", [input("Alpha")]);
  await setup.close();

  const site = await context.newPage();
  await site.goto(`${originA}/`);
  const page = await openTab(context, extensionId);
  await page.locator(".topic-list__select", { hasText: "Servers" }).click();
  await expect(mark(page, "Alpha")).toBeVisible();
});

test("search results show the mark", async ({ context, extensionId }) => {
  const page = await openTab(context, extensionId);
  await seed(page, "Servers", [
    input("Alpha one"),
    input("Alpha two", { url: `${originB}/` }),
  ]);
  const site = await context.newPage();
  await site.goto(`${originB}/x`);

  await page
    .getByRole("searchbox", { name: "Search all entries" })
    .fill("alpha");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.locator(".entry-list__item")).toHaveCount(2);
  await expect(mark(page, "Alpha two")).toBeVisible();
  await expect(mark(page, "Alpha one")).toHaveCount(0);
});

test("the additional URL is not considered (D-22)", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, "Servers", [
    input("Alpha", { extraUrl: `${originB}/extra` }),
  ]);
  const site = await context.newPage();
  await site.goto(`${originB}/extra`);
  // A tab of the main origin proves the tracking has caught up
  const other = await context.newPage();
  await other.goto(`${originA}/`);
  await expect(mark(page, "Alpha")).toBeVisible();
  await other.close();
  await expect(mark(page, "Alpha")).toHaveCount(0);
});
