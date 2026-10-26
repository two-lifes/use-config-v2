import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import path from "node:path";

const extensionPath = path.resolve(import.meta.dirname, "../../dist");

export const test = base.extend<{
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}>({
  // An empty userDataDir gives every test a fresh temporary profile
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern here
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      // Only the "chromium" channel runs extensions in headless mode
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const [existing] = context.serviceWorkers();
    await use(existing ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
