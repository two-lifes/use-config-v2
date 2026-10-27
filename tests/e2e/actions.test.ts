import type { BrowserContext, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { EntryInput } from "../../src/lib/validation";
import type { TestHook } from "../../src/storage/repository";
import { expect, test } from "./fixtures";

declare global {
  var useConfigTest: TestHook;
}

// Opened sites are served locally, so the tests need no network. Playwright's
// request routing cannot be used: a tab created by chrome.tabs.create starts
// loading before Playwright attaches to it.
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

function site(path: string): string {
  return `${origin}/${path}`;
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

function toast(page: Page) {
  return page.locator(".toast");
}

function input(name: string, fields: Partial<EntryInput> = {}): EntryInput {
  return {
    name,
    url: site(name.toLowerCase().replace(/\W+/g, "-")),
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
  await topicsPane(page)
    .locator(".topic-list__select", { hasText: name })
    .click();
}

async function selectEntry(page: Page, name: string) {
  await page.locator(".entry-list__select", { hasText: name }).click();
}

// URLs of the open website tabs, sorted; the extension tab and the initial
// blank tab of the profile are left out
function siteUrls(context: BrowserContext): string[] {
  return context
    .pages()
    .map((page) => page.url())
    .filter((url) => url.startsWith(origin))
    .sort();
}

// Headless pages always report "visible", so the active tab is asked from
// Chrome; tab IDs need no "tabs" permission
async function extensionTabActive(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const [active] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const current = await chrome.tabs.getCurrent();
    return active !== undefined && active.id === current?.id;
  });
}

function sites(count: number): EntryInput[] {
  return Array.from({ length: count }, (_, index) =>
    input(`Site ${String(index + 1).padStart(2, "0")}`),
  );
}

function siteUrlsOf(entries: EntryInput[]): string[] {
  return entries.map((entry) => entry.url).sort();
}

test("Open URL and Open additional URL each open one tab in front", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, {
    "My VPS": [input("Proxmox", { extraUrl: site("docs/proxmox") })],
  });
  await selectEntry(page, "Proxmox");

  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    details(page).getByRole("button", { name: "Open URL" }).click(),
  ]);
  await expect(tab).toHaveURL(site("proxmox"));
  await expect.poll(() => extensionTabActive(page)).toBe(false);

  const [extraTab] = await Promise.all([
    context.waitForEvent("page"),
    details(page).getByRole("button", { name: "Open additional URL" }).click(),
  ]);
  await expect(extraTab).toHaveURL(site("docs/proxmox"));
  expect(siteUrls(context)).toEqual([site("docs/proxmox"), site("proxmox")]);
});

test("the selected list item opens its URL", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { "My VPS": [input("Grafana"), input("Proxmox")] });
  const list = page.locator(".entry-list");
  await expect(list.getByRole("button", { name: "Open URL" })).toHaveCount(0);

  await selectEntry(page, "Grafana");
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    list.getByRole("button", { name: "Open URL" }).click(),
  ]);
  await expect(tab).toHaveURL(site("grafana"));
  expect(siteUrls(context)).toEqual([site("grafana")]);
});

test("Open all is disabled for an empty topic", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Empty: [], "My VPS": [input("Proxmox")] });

  await selectTopic(page, "Empty");
  await expect(page.getByRole("button", { name: "Open all" })).toBeDisabled();
  await selectTopic(page, "My VPS");
  await expect(page.getByRole("button", { name: "Open all" })).toBeEnabled();
});

test("Open all with 10 entries opens them in background tabs without asking", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const entries = sites(10);
  await seed(page, { Work: entries });

  await page.getByRole("button", { name: "Open all" }).click();
  await expect.poll(() => siteUrls(context)).toEqual(siteUrlsOf(entries));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The extension tab stays in front
  expect(await extensionTabActive(page)).toBe(true);
});

test("Open all with 11 entries asks first; Cancel opens nothing", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  const entries = sites(11);
  await seed(page, { Work: entries });
  const dialog = page.getByRole("dialog", { name: "Open 11 tabs?" });

  await page.getByRole("button", { name: "Open all" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(siteUrls(context)).toEqual([]);

  await page.getByRole("button", { name: "Open all" }).click();
  await dialog.getByRole("button", { name: "Open all" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => siteUrls(context)).toEqual(siteUrlsOf(entries));
});

test("Copy username and Copy password put the exact text in the clipboard", async ({
  context,
  extensionId,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await openTab(context, extensionId);
  await seed(page, {
    "My VPS": [
      input("Proxmox", { username: " root@pam ", password: "p@ss word\t1" }),
    ],
  });
  await selectEntry(page, "Proxmox");

  await details(page).getByRole("button", { name: "Copy username" }).click();
  await expect(toast(page)).toHaveText("Username copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    " root@pam ",
  );

  await details(page).getByRole("button", { name: "Copy password" }).click();
  await expect(toast(page)).toHaveText("Password copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "p@ss word\t1",
  );
  // Copying does not reveal the password
  await expect(details(page)).toContainText("••••••••");
});

test("copy and reveal buttons are disabled for empty fields", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { "My VPS": [input("Grafana")] });
  await selectEntry(page, "Grafana");

  for (const name of ["Copy username", "Copy password", "Show password"]) {
    await expect(details(page).getByRole("button", { name })).toBeDisabled();
  }
  await expect(details(page)).not.toContainText("••••••••");
});

test("the password toggle shows and hides it; another entry masks it again", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, {
    "My VPS": [
      input("Grafana", { password: "grafana-pass" }),
      input("Proxmox", { password: "proxmox-pass" }),
    ],
  });
  await selectEntry(page, "Proxmox");
  await expect(details(page)).toContainText("••••••••");
  await expect(details(page)).not.toContainText("proxmox-pass");

  await details(page).getByRole("button", { name: "Show password" }).click();
  await expect(details(page)).toContainText("proxmox-pass");
  await details(page).getByRole("button", { name: "Hide password" }).click();
  await expect(details(page)).not.toContainText("proxmox-pass");
  await expect(details(page)).toContainText("••••••••");

  await details(page).getByRole("button", { name: "Show password" }).click();
  await selectEntry(page, "Grafana");
  await expect(details(page)).not.toContainText("grafana-pass");
  await expect(details(page)).toContainText("••••••••");
  await selectEntry(page, "Proxmox");
  await expect(details(page)).not.toContainText("proxmox-pass");
});

test("nothing masks the password or clears the clipboard after a delay", async ({
  context,
  extensionId,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await openTab(context, extensionId);
  await seed(page, { "My VPS": [input("Proxmox", { password: "s3cret" })] });
  await selectEntry(page, "Proxmox");

  await details(page).getByRole("button", { name: "Show password" }).click();
  await details(page).getByRole("button", { name: "Copy password" }).click();
  await expect(toast(page)).toHaveText("Password copied");
  // The toast hides after 2.5 s; the password and the clipboard stay
  await expect(toast(page)).toHaveCount(0, { timeout: 5000 });
  await page.waitForTimeout(1000);
  await expect(details(page)).toContainText("s3cret");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "s3cret",
  );
});
