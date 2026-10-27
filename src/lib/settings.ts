export const SETTINGS_SCHEMA_VERSION = 1;

export interface StoredSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  openAllConfirmThreshold: number;
}

// Open all asks first when a topic has more entries than the threshold (D-21)
export const OPEN_ALL_THRESHOLD = { min: 1, max: 500 } as const;

export const DEFAULT_SETTINGS: StoredSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  openAllConfirmThreshold: 10,
};

export type SettingsResult =
  { ok: true; settings: StoredSettings } | { ok: false; problems: string[] };

export type ThresholdResult =
  { ok: true; value: number } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThreshold(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= OPEN_ALL_THRESHOLD.min &&
    (value as number) <= OPEN_ALL_THRESHOLD.max
  );
}

export function validateSettings(value: unknown): SettingsResult {
  if (!isRecord(value)) {
    return { ok: false, problems: ["settings: Must be an object."] };
  }
  const problems: string[] = [];
  if (value.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    problems.push(`schemaVersion: Must be ${SETTINGS_SCHEMA_VERSION}.`);
  }
  if (!isThreshold(value.openAllConfirmThreshold)) {
    problems.push(
      `openAllConfirmThreshold: Must be a whole number from ${OPEN_ALL_THRESHOLD.min} to ${OPEN_ALL_THRESHOLD.max}.`,
    );
  }
  for (const key of Object.keys(value)) {
    if (key !== "schemaVersion" && key !== "openAllConfirmThreshold") {
      problems.push(`${key}: Unknown field.`);
    }
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    settings: {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      openAllConfirmThreshold: value.openAllConfirmThreshold as number,
    },
  };
}

// Settings are not worth an error state (D-11 covers the catalog only): a
// missing or invalid stored value means the defaults
export function parseSettings(raw: unknown): StoredSettings {
  if (raw === undefined) {
    return DEFAULT_SETTINGS;
  }
  const result = validateSettings(raw);
  return result.ok ? result.settings : DEFAULT_SETTINGS;
}

// Text from the Settings dialog; only plain digits, so "1.5" or "1e2" is not
// silently rounded or expanded
export function validateOpenAllThreshold(text: string): ThresholdResult {
  const trimmed = text.trim();
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  return isThreshold(value)
    ? { ok: true, value }
    : {
        ok: false,
        message: `Enter a whole number from ${OPEN_ALL_THRESHOLD.min} to ${OPEN_ALL_THRESHOLD.max}.`,
      };
}

export function needsOpenAllConfirmation(
  count: number,
  settings: StoredSettings,
): boolean {
  return count > settings.openAllConfirmThreshold;
}
