import { useEffect, useState } from "react";
import { tabOrigin } from "../lib/tabs";

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

// Origins of the open browser tabs, kept up to date from tab events (US-15).
// Tab addresses stay in memory only; they are never stored or sent.
export function useOpenOrigins(): ReadonlySet<string> {
  const [origins, setOrigins] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    const byTab = new Map<number, string>();
    // Tabs changed by an event are newer than the initial query
    const touched = new Set<number>();

    const publish = () => {
      if (!active) return;
      const next = new Set(byTab.values());
      setOrigins((current) => (sameSet(current, next) ? current : next));
    };
    const setTab = (tabId: number, url: string | undefined) => {
      touched.add(tabId);
      const origin = tabOrigin(url);
      if (origin) byTab.set(tabId, origin);
      else byTab.delete(tabId);
      publish();
    };
    const removeTab = (tabId: number) => {
      touched.add(tabId);
      byTab.delete(tabId);
      publish();
    };

    const onCreated = (tab: chrome.tabs.Tab) => {
      if (tab.id !== undefined) setTab(tab.id, tab.url ?? tab.pendingUrl);
    };
    const onUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
    ) => {
      if (changeInfo.url !== undefined) setTab(tabId, changeInfo.url);
    };
    // Prerendering swaps a tab for another one with a new ID
    const onReplaced = (addedTabId: number, removedTabId: number) => {
      removeTab(removedTabId);
      chrome.tabs.get(addedTabId).then(
        (tab) => {
          if (active) setTab(addedTabId, tab.url);
        },
        (error: unknown) =>
          console.error("Failed to read a replaced tab", error),
      );
    };

    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(removeTab);
    chrome.tabs.onReplaced.addListener(onReplaced);

    chrome.tabs.query({}).then(
      (tabs) => {
        for (const tab of tabs) {
          if (tab.id === undefined || touched.has(tab.id)) continue;
          const origin = tabOrigin(tab.url);
          if (origin) byTab.set(tab.id, origin);
        }
        publish();
      },
      (error: unknown) => console.error("Failed to read the open tabs", error),
    );

    return () => {
      active = false;
      chrome.tabs.onCreated.removeListener(onCreated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(removeTab);
      chrome.tabs.onReplaced.removeListener(onReplaced);
    };
  }, []);

  return origins;
}
