import { SCHEMA_VERSION, type StoredCatalog } from "./model";
import { isTimestamp, validateCatalog } from "./validation";

export const EXPORT_FORMAT = "use-config-export";

// Bytes; the same 10 MB as the chrome.storage.local quota.
export const IMPORT_SIZE_LIMIT = 10 * 1024 * 1024;

const MAX_LISTED_PROBLEMS = 5;

export type ImportError =
  "too-large" | "not-json" | "wrong-format" | "newer-version" | "invalid";

export type ImportResult =
  | { ok: true; catalog: StoredCatalog; exportedAt: string }
  | { ok: false; error: ImportError; message: string; problems: string[] };

export function serializeExport(
  catalog: StoredCatalog,
  exportedAt: string,
): string {
  const file = {
    format: EXPORT_FORMAT,
    schemaVersion: catalog.schemaVersion,
    exportedAt,
    topics: catalog.topics,
    entries: catalog.entries,
  };
  return JSON.stringify(file, null, 2);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function localDay(date: Date): string {
  return [
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
  ].join("-");
}

export function exportFileName(date: Date): string {
  return `clay-${localDay(date)}.json`;
}

// The raw stored value is kept as it is for diagnostics (D-11); it is not an
// export file and cannot be imported.
export function serializeRaw(raw: unknown): string {
  return JSON.stringify(raw, null, 2);
}

export function rawExportFileName(date: Date): string {
  return `clay-raw-${localDay(date)}.json`;
}

function failure(
  error: ImportError,
  message: string,
  problems: string[] = [],
): ImportResult {
  return { ok: false, error, message, problems };
}

// Lets the caller reject a file by its size before reading it.
export function checkImportSize(bytes: number): ImportResult | undefined {
  return bytes > IMPORT_SIZE_LIMIT
    ? failure("too-large", "The file is larger than 10 MB.")
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseImport(text: string): ImportResult {
  const sizeProblem = checkImportSize(new TextEncoder().encode(text).length);
  if (sizeProblem) {
    return sizeProblem;
  }

  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return failure("not-json", "The file is not valid JSON.");
  }

  if (!isRecord(file) || file.format !== EXPORT_FORMAT) {
    return failure("wrong-format", "The file is not a Clay export.");
  }

  const { schemaVersion, exportedAt } = file;
  if (
    Number.isInteger(schemaVersion) &&
    Number(schemaVersion) > SCHEMA_VERSION
  ) {
    return failure(
      "newer-version",
      "The file was created by a newer version of Clay. Update the extension to import it.",
    );
  }

  const problems: string[] = [];
  const timestamp =
    typeof exportedAt === "string" && isTimestamp(exportedAt)
      ? exportedAt
      : undefined;
  if (timestamp === undefined) {
    problems.push("exportedAt: Must be an ISO 8601 UTC timestamp.");
  }
  const result = validateCatalog({
    schemaVersion,
    topics: file.topics,
    entries: file.entries,
  });
  if (!result.ok) {
    problems.push(...result.problems);
  }

  if (!result.ok || timestamp === undefined) {
    const count = problems.length;
    return failure(
      "invalid",
      count === 1
        ? "The file has 1 problem."
        : `The file has ${count} problems.`,
      problems.slice(0, MAX_LISTED_PROBLEMS),
    );
  }
  return { ok: true, catalog: result.catalog, exportedAt: timestamp };
}
