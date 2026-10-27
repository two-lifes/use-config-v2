import { useState } from "react";

const ICON_SIZE = 20;

// Served by Chrome with the `favicon` permission (D-13); no network request
// from the extension itself
function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  // Twice the displayed size keeps the icon sharp on high-density screens
  url.searchParams.set("size", String(ICON_SIZE * 2));
  return url.toString();
}

function initial(name: string): string {
  const [first] = Array.from(name.trim());
  return first ? first.toLocaleUpperCase() : "?";
}

interface EntryIconProps {
  name: string;
  url: string;
}

// The parent keys this by URL so a changed URL tries the favicon again
export function EntryIcon({ name, url }: EntryIconProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="entry-icon entry-icon--letter" aria-hidden="true">
        {initial(name)}
      </span>
    );
  }
  return (
    <img
      className="entry-icon"
      src={faviconUrl(url)}
      alt=""
      width={ICON_SIZE}
      height={ICON_SIZE}
      onError={() => setFailed(true)}
    />
  );
}
