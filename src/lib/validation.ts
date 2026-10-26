import {
  LIMITS,
  SCHEMA_VERSION,
  type Entry,
  type StoredCatalog,
  type Topic,
} from "./model";

export type FieldResult =
  { ok: true; value: string } | { ok: false; message: string };

export type EntryInput = Pick<
  Entry,
  | "name"
  | "url"
  | "description"
  | "username"
  | "password"
  | "extraUrl"
  | "twoFactorNote"
>;

export type EntryInputResult =
  | { ok: true; value: EntryInput }
  | { ok: false; errors: Partial<Record<keyof EntryInput, string>> };

export type CatalogResult =
  { ok: true; catalog: StoredCatalog } | { ok: false; problems: string[] };

export function textLength(value: string): number {
  return [...value].length;
}

// toLowerCase rather than toLocaleLowerCase, so uniqueness does not depend on
// the browser locale.
function nameKey(name: string): string {
  return name.toLowerCase();
}

function valid(value: string): FieldResult {
  return { ok: true, value };
}

function invalid(message: string): FieldResult {
  return { ok: false, message };
}

function validateRequiredText(
  value: string,
  label: string,
  limit: number,
): FieldResult {
  const trimmed = value.trim();
  if (trimmed === "") {
    return invalid(`Enter ${label}.`);
  }
  if (textLength(trimmed) > limit) {
    return invalid(`Use at most ${limit} characters.`);
  }
  return valid(trimmed);
}

export function validateTopicName(
  name: string,
  topics: readonly Topic[],
  exceptId?: string,
): FieldResult {
  const result = validateRequiredText(name, "a topic name", LIMITS.topicName);
  if (!result.ok) {
    return result;
  }
  const key = nameKey(result.value);
  const taken = topics.some(
    (topic) => topic.id !== exceptId && nameKey(topic.name) === key,
  );
  return taken ? invalid("A topic with this name already exists.") : result;
}

export function validateEntryName(name: string): FieldResult {
  return validateRequiredText(name, "a name", LIMITS.entryName);
}

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function validateUrl(
  value: string,
  { required }: { required: boolean },
): FieldResult {
  const trimmed = value.trim();
  if (trimmed === "") {
    return required ? invalid("Enter a URL.") : valid("");
  }
  if (textLength(trimmed) > LIMITS.url) {
    return invalid(`Use at most ${LIMITS.url} characters.`);
  }
  if (!isHttpUrl(trimmed)) {
    return invalid("Enter a URL that starts with http:// or https://.");
  }
  return valid(trimmed);
}

function validateUntrimmed(value: string, limit: number): FieldResult {
  return textLength(value) > limit
    ? invalid(`Use at most ${limit} characters.`)
    : valid(value);
}

export function validateSecret(value: string): FieldResult {
  return validateUntrimmed(value, LIMITS.secret);
}

export function validateLongText(value: string): FieldResult {
  return validateUntrimmed(value, LIMITS.longText);
}

const entryFieldValidators: Record<
  keyof EntryInput,
  (value: string) => FieldResult
> = {
  name: validateEntryName,
  url: (value) => validateUrl(value, { required: true }),
  description: validateLongText,
  username: validateSecret,
  password: validateSecret,
  extraUrl: (value) => validateUrl(value, { required: false }),
  twoFactorNote: validateLongText,
};

const entryFields = Object.keys(entryFieldValidators) as (keyof EntryInput)[];

export function validateEntryInput(input: EntryInput): EntryInputResult {
  const value = { ...input };
  const errors: Partial<Record<keyof EntryInput, string>> = {};
  for (const field of entryFields) {
    const result = entryFieldValidators[field](input[field]);
    if (result.ok) {
      value[field] = result.value;
    } else {
      errors[field] = result.message;
    }
  }
  return Object.keys(errors).length === 0
    ? { ok: true, value }
    : { ok: false, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTimestamp(value: string): boolean {
  return (
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
  );
}

class CatalogChecker {
  readonly problems: string[] = [];

  report(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  string(record: Record<string, unknown>, key: string, path: string) {
    const value = record[key];
    if (typeof value !== "string") {
      this.report(`${path}.${key}`, "Must be a string.");
      return undefined;
    }
    return value;
  }

  id(record: Record<string, unknown>, key: string, path: string) {
    const value = this.string(record, key, path);
    if (value === "") {
      this.report(`${path}.${key}`, "Must not be empty.");
      return undefined;
    }
    return value;
  }

  timestamp(record: Record<string, unknown>, key: string, path: string) {
    const value = this.string(record, key, path);
    if (value !== undefined && !isTimestamp(value)) {
      this.report(`${path}.${key}`, "Must be an ISO 8601 UTC timestamp.");
      return undefined;
    }
    return value;
  }

  // Stored values must already be in the form the validator produces, so a
  // value with untrimmed spaces is a problem rather than silently fixed.
  field(
    record: Record<string, unknown>,
    key: string,
    path: string,
    validate: (value: string) => FieldResult,
  ) {
    const value = this.string(record, key, path);
    if (value === undefined) {
      return undefined;
    }
    const result = validate(value);
    if (!result.ok) {
      this.report(`${path}.${key}`, result.message);
      return undefined;
    }
    if (result.value !== value) {
      this.report(`${path}.${key}`, "Must not start or end with spaces.");
      return undefined;
    }
    return value;
  }

  array(record: Record<string, unknown>, key: string): unknown[] {
    const value = record[key];
    if (!Array.isArray(value)) {
      this.report(key, "Must be an array.");
      return [];
    }
    return value;
  }

  record(value: unknown, path: string) {
    if (!isRecord(value)) {
      this.report(path, "Must be an object.");
      return undefined;
    }
    return value;
  }

  topic(value: unknown, path: string): Topic | undefined {
    const record = this.record(value, path);
    if (!record) {
      return undefined;
    }
    const topic = {
      id: this.id(record, "id", path),
      name: this.field(record, "name", path, (name) =>
        validateRequiredText(name, "a topic name", LIMITS.topicName),
      ),
      createdAt: this.timestamp(record, "createdAt", path),
      updatedAt: this.timestamp(record, "updatedAt", path),
    };
    return isComplete(topic) ? topic : undefined;
  }

  entry(value: unknown, path: string): Entry | undefined {
    const record = this.record(value, path);
    if (!record) {
      return undefined;
    }
    const fields: Partial<Record<keyof EntryInput, string>> = {};
    for (const field of entryFields) {
      fields[field] = this.field(
        record,
        field,
        path,
        entryFieldValidators[field],
      );
    }
    const entry = {
      id: this.id(record, "id", path),
      topicId: this.id(record, "topicId", path),
      ...fields,
      createdAt: this.timestamp(record, "createdAt", path),
      updatedAt: this.timestamp(record, "updatedAt", path),
    };
    return isComplete(entry) ? entry : undefined;
  }

  uniqueIds(
    items: readonly ({ id: string } | undefined)[],
    collection: string,
  ): void {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (!item) {
        return;
      }
      if (seen.has(item.id)) {
        this.report(`${collection}[${index}].id`, "Repeats another ID.");
      }
      seen.add(item.id);
    });
  }
}

function isComplete<T extends object>(
  value: T,
): value is { [K in keyof T]-?: Exclude<T[K], undefined> } {
  return Object.values(value).every((field) => field !== undefined);
}

export function validateCatalog(value: unknown): CatalogResult {
  const check = new CatalogChecker();
  if (!isRecord(value)) {
    return { ok: false, problems: ["catalog: Must be an object."] };
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    check.report("schemaVersion", `Must be ${SCHEMA_VERSION}.`);
  }

  const topics = check
    .array(value, "topics")
    .map((item, index) => check.topic(item, `topics[${index}]`));
  const entries = check
    .array(value, "entries")
    .map((item, index) => check.entry(item, `entries[${index}]`));

  check.uniqueIds(topics, "topics");
  check.uniqueIds(entries, "entries");

  const names = new Set<string>();
  topics.forEach((topic, index) => {
    if (!topic) {
      return;
    }
    const key = nameKey(topic.name);
    if (names.has(key)) {
      check.report(`topics[${index}].name`, "Repeats another topic name.");
    }
    names.add(key);
  });

  // Raw IDs are used so that an entry of an otherwise invalid topic does not
  // get a second, misleading problem.
  const rawTopics: unknown[] = Array.isArray(value.topics) ? value.topics : [];
  const topicIds = new Set(
    rawTopics.map((topic) => (isRecord(topic) ? topic.id : undefined)),
  );
  entries.forEach((entry, index) => {
    if (entry && !topicIds.has(entry.topicId)) {
      check.report(`entries[${index}].topicId`, "Refers to a missing topic.");
    }
  });

  if (check.problems.length > 0) {
    return { ok: false, problems: check.problems };
  }
  return {
    ok: true,
    catalog: {
      schemaVersion: SCHEMA_VERSION,
      topics: topics.filter((topic) => topic !== undefined),
      entries: entries.filter((entry) => entry !== undefined),
    },
  };
}
