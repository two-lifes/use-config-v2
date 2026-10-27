import {
  DEFAULT_SETTINGS,
  parseSettings,
  validateSettings,
  type StoredSettings,
} from "../lib/settings";

// A key of its own keeps settings out of the catalog and the export (D-20)
const STORAGE_KEY = "settings";

export type SaveSettingsResult = { ok: true } | { ok: false; message: string };

export interface SettingsRepository {
  load(): Promise<StoredSettings>;
  // Writes the whole object; an invalid stored value is replaced only here
  save(settings: StoredSettings): Promise<SaveSettingsResult>;
  subscribe(listener: (settings: StoredSettings) => void): () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function load(): Promise<StoredSettings> {
  let items: Record<string, unknown>;
  try {
    items = await chrome.storage.local.get(STORAGE_KEY);
  } catch (error) {
    // The catalog read shows the storage error; Open all keeps working with
    // the defaults meanwhile
    console.error("Failed to read the settings", error);
    return DEFAULT_SETTINGS;
  }
  return parseSettings(items[STORAGE_KEY]);
}

async function save(settings: StoredSettings): Promise<SaveSettingsResult> {
  const checked = validateSettings(settings);
  if (!checked.ok) {
    return { ok: false, message: checked.problems.join(" ") };
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: checked.settings });
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
  return { ok: true };
}

export function createSettingsRepository(): SettingsRepository {
  return {
    load,
    save,
    subscribe(listener) {
      const onChanged = (changes: {
        [key: string]: chrome.storage.StorageChange;
      }) => {
        const change = changes[STORAGE_KEY];
        if (change) {
          listener(parseSettings(change.newValue));
        }
      };
      chrome.storage.local.onChanged.addListener(onChanged);
      return () => chrome.storage.local.onChanged.removeListener(onChanged);
    },
  };
}
