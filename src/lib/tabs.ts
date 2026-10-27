// An entry is open when some tab has the origin of its URL (D-22). Only
// http(s) tabs count, which also leaves out the extension's own tabs.
export function tabOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return undefined;
  return parsed.origin;
}

// The additional URL is not considered (D-22)
export function isOpen(
  entryUrl: string,
  openOrigins: ReadonlySet<string>,
): boolean {
  const origin = tabOrigin(entryUrl);
  return origin !== undefined && openOrigins.has(origin);
}
