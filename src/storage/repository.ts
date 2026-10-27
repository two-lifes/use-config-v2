import type * as catalogOperations from "../lib/catalog";
import type {
  OperationContext,
  OperationError,
  OperationResult,
} from "../lib/catalog";
import { SCHEMA_VERSION, type StoredCatalog } from "../lib/model";
import { validateCatalog } from "../lib/validation";
import type { SettingsRepository } from "./settings";

const STORAGE_KEY = "catalog";

// Web Locks are shared by all pages of the extension origin, so changes from
// several tabs are applied one after another and none is lost (US-12).
const LOCK_NAME = "use-config-catalog";

export type LoadResult =
  | { status: "ok"; catalog: StoredCatalog }
  // The raw value is kept for the raw data export and never overwritten (D-11)
  | { status: "invalid"; raw: unknown; problems: string[] }
  | { status: "error"; message: string };

export type UpdateError =
  | OperationError
  | { kind: "invalid-state"; problems: string[] }
  | { kind: "invalid-result"; problems: string[] }
  | { kind: "read-failed"; message: string }
  | { kind: "write-failed"; message: string };

export type UpdateResult =
  | { ok: true; catalog: StoredCatalog; id: string }
  | { ok: false; error: UpdateError };

export type ReplaceError =
  | { kind: "invalid-result"; problems: string[] }
  | { kind: "write-failed"; message: string };

export type ReplaceResult =
  { ok: true; catalog: StoredCatalog } | { ok: false; error: ReplaceError };

export type CatalogOperation = (
  catalog: StoredCatalog,
  context: OperationContext,
) => OperationResult;

export interface CatalogRepository {
  load(): Promise<LoadResult>;
  update(operation: CatalogOperation): Promise<UpdateResult>;
  // Import: replaces whatever is stored, also an invalid state, because the
  // user confirms it explicitly (D-11 forbids only automatic overwrites)
  replace(catalog: StoredCatalog): Promise<ReplaceResult>;
  subscribe(listener: (result: LoadResult) => void): () => void;
}

// Exposed on the tab page for end-to-end tests, which cannot import modules
// into the page
export interface TestHook {
  repository: CatalogRepository;
  operations: typeof catalogOperations;
  settings: SettingsRepository;
}

function emptyCatalog(): StoredCatalog {
  return { schemaVersion: SCHEMA_VERSION, topics: [], entries: [] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parse(raw: unknown): LoadResult {
  if (raw === undefined) {
    return { status: "ok", catalog: emptyCatalog() };
  }
  const result = validateCatalog(raw);
  return result.ok
    ? { status: "ok", catalog: result.catalog }
    : { status: "invalid", raw, problems: result.problems };
}

async function read(): Promise<LoadResult> {
  let items: Record<string, unknown>;
  try {
    items = await chrome.storage.local.get(STORAGE_KEY);
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
  return parse(items[STORAGE_KEY]);
}

async function readModifyWrite(
  operation: CatalogOperation,
): Promise<UpdateResult> {
  const current = await read();
  if (current.status === "invalid") {
    return {
      ok: false,
      error: { kind: "invalid-state", problems: current.problems },
    };
  }
  if (current.status === "error") {
    return {
      ok: false,
      error: { kind: "read-failed", message: current.message },
    };
  }

  const applied = operation(current.catalog, {
    newId: () => crypto.randomUUID(),
    now: new Date().toISOString(),
  });
  if (!applied.ok) {
    return applied;
  }
  const checked = validateCatalog(applied.catalog);
  if (!checked.ok) {
    return {
      ok: false,
      error: { kind: "invalid-result", problems: checked.problems },
    };
  }

  const written = await write(checked.catalog);
  return written.ok ? { ...written, id: applied.id } : written;
}

async function write(catalog: StoredCatalog): Promise<ReplaceResult> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: catalog });
  } catch (error) {
    // For example the 10 MB quota; the stored catalog stays as it was
    return {
      ok: false,
      error: { kind: "write-failed", message: errorMessage(error) },
    };
  }
  return { ok: true, catalog };
}

function replace(catalog: StoredCatalog): Promise<ReplaceResult> {
  const checked = validateCatalog(catalog);
  if (!checked.ok) {
    return Promise.resolve({
      ok: false,
      error: { kind: "invalid-result", problems: checked.problems },
    });
  }
  return write(checked.catalog);
}

export function createCatalogRepository(): CatalogRepository {
  return {
    load: read,
    update: (operation) =>
      navigator.locks.request(LOCK_NAME, () => readModifyWrite(operation)),
    // The lock keeps a replace from interleaving with an update in progress
    replace: (catalog) =>
      navigator.locks.request(LOCK_NAME, () => replace(catalog)),
    subscribe(listener) {
      const onChanged = (changes: {
        [key: string]: chrome.storage.StorageChange;
      }) => {
        const change = changes[STORAGE_KEY];
        if (change) {
          listener(parse(change.newValue));
        }
      };
      chrome.storage.local.onChanged.addListener(onChanged);
      return () => chrome.storage.local.onChanged.removeListener(onChanged);
    },
  };
}
