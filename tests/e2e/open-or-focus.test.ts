import type { BrowserContext, Worker } from "@playwright/test";
import { expect, test } from "./fixtures";

// The toolbar click cannot be simulated; the service worker exposes the
// handler it runs on click
function openOrFocus(serviceWorker: Worker) {
  return serviceWorker.evaluate(() =>
    (
      globalThis as unknown as { openOrFocus: () => Promise<void> }
    ).openOrFocus(),
  );
}

// The tab appears in getContexts only once its document loads
async function openNewTab(context: BrowserContext, serviceWorker: Worker) {
  const [page] = await Promise.all([
    context.waitForEvent("page"),
    openOrFocus(serviceWorker),
  ]);
  await page.waitForLoadState();
}

function tabState(serviceWorker: Worker) {
  return serviceWorker.evaluate(async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.TAB],
      documentUrls: [chrome.runtime.getURL("index.html")],
    });
    const [active] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    return {
      extensionTabIds: contexts.map((context) => context.tabId),
      activeTabId: active?.id,
    };
  });
}

test("opens the extension tab when none is open", async ({
  context,
  serviceWorker,
}) => {
  await openNewTab(context, serviceWorker);

  const state = await tabState(serviceWorker);
  expect(state.extensionTabIds).toHaveLength(1);
  expect(state.activeTabId).toBe(state.extensionTabIds[0]);
});

test("focuses the existing tab instead of opening another", async ({
  context,
  serviceWorker,
}) => {
  await openNewTab(context, serviceWorker);
  const [extensionTabId] = (await tabState(serviceWorker)).extensionTabIds;

  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  expect((await tabState(serviceWorker)).activeTabId).not.toBe(extensionTabId);

  await openOrFocus(serviceWorker);

  const state = await tabState(serviceWorker);
  expect(state.extensionTabIds).toEqual([extensionTabId]);
  expect(state.activeTabId).toBe(extensionTabId);
});
