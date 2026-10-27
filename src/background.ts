const PAGE_PATH = "index.html";

export async function openOrFocus(): Promise<void> {
  const pageUrl = chrome.runtime.getURL(PAGE_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.TAB],
    documentUrls: [pageUrl],
  });
  const existing = contexts.find((context) => context.tabId !== -1);

  if (existing) {
    await chrome.tabs.update(existing.tabId, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }

  await chrome.tabs.create({ url: pageUrl });
}

chrome.action.onClicked.addListener(() => {
  openOrFocus().catch((error: unknown) => {
    console.error("Failed to open the Clay tab", error);
  });
});

// End-to-end tests cannot click the toolbar icon and call this instead.
(globalThis as { openOrFocus?: typeof openOrFocus }).openOrFocus = openOrFocus;
