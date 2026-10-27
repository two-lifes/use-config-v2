import { isHttpUrl } from "../lib/validation";

// Open all asks first above this number of tabs (US-06)
export const OPEN_ALL_CONFIRM_LIMIT = 10;

// Stored URLs are validated, but they are checked again right before opening
// so that no other scheme ever reaches a tab (technical.md)
export async function openUrl(url: string, active: boolean): Promise<void> {
  if (!isHttpUrl(url)) throw new Error(`Not an http(s) URL: ${url}`);
  await chrome.tabs.create({ url, active });
}

// Background tabs keep the extension tab in front
export async function openUrls(urls: string[]): Promise<void> {
  for (const url of urls) await openUrl(url, false);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
