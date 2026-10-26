import type { Entry, StoredCatalog, Topic } from "./model";
import {
  validateEntryInput,
  validateTopicName,
  type EntryInput,
} from "./validation";

// IDs and the time come from the caller so that operations stay pure and
// deterministic in tests.
export interface OperationContext {
  newId(): string;
  now: string;
}

export type OperationError =
  | { kind: "not-found"; target: "topic" | "entry" }
  | { kind: "invalid-name"; message: string }
  | {
      kind: "invalid-entry";
      errors: Partial<Record<keyof EntryInput, string>>;
    };

export type OperationResult =
  | { ok: true; catalog: StoredCatalog; id: string }
  | { ok: false; error: OperationError };

export interface SearchResult {
  entry: Entry;
  topic: Topic;
}

function done(catalog: StoredCatalog, id: string): OperationResult {
  return { ok: true, catalog, id };
}

function failed(error: OperationError): OperationResult {
  return { ok: false, error };
}

function hasTopic(catalog: StoredCatalog, topicId: string): boolean {
  return catalog.topics.some((topic) => topic.id === topicId);
}

function findEntry(catalog: StoredCatalog, entryId: string) {
  return catalog.entries.find((entry) => entry.id === entryId);
}

function replaceEntry(catalog: StoredCatalog, updated: Entry): StoredCatalog {
  return {
    ...catalog,
    entries: catalog.entries.map((entry) =>
      entry.id === updated.id ? updated : entry,
    ),
  };
}

export function createTopic(
  catalog: StoredCatalog,
  name: string,
  context: OperationContext,
): OperationResult {
  const result = validateTopicName(name, catalog.topics);
  if (!result.ok) {
    return failed({ kind: "invalid-name", message: result.message });
  }
  const topic: Topic = {
    id: context.newId(),
    name: result.value,
    createdAt: context.now,
    updatedAt: context.now,
  };
  return done({ ...catalog, topics: [...catalog.topics, topic] }, topic.id);
}

export function renameTopic(
  catalog: StoredCatalog,
  topicId: string,
  name: string,
  context: OperationContext,
): OperationResult {
  if (!hasTopic(catalog, topicId)) {
    return failed({ kind: "not-found", target: "topic" });
  }
  const result = validateTopicName(name, catalog.topics, topicId);
  if (!result.ok) {
    return failed({ kind: "invalid-name", message: result.message });
  }
  const topics = catalog.topics.map((topic) =>
    topic.id === topicId
      ? { ...topic, name: result.value, updatedAt: context.now }
      : topic,
  );
  return done({ ...catalog, topics }, topicId);
}

export function deleteTopic(
  catalog: StoredCatalog,
  topicId: string,
): OperationResult {
  if (!hasTopic(catalog, topicId)) {
    return failed({ kind: "not-found", target: "topic" });
  }
  return done(
    {
      ...catalog,
      topics: catalog.topics.filter((topic) => topic.id !== topicId),
      entries: catalog.entries.filter((entry) => entry.topicId !== topicId),
    },
    topicId,
  );
}

export function countEntries(catalog: StoredCatalog, topicId: string): number {
  return catalog.entries.filter((entry) => entry.topicId === topicId).length;
}

export function addEntry(
  catalog: StoredCatalog,
  topicId: string,
  input: EntryInput,
  context: OperationContext,
): OperationResult {
  if (!hasTopic(catalog, topicId)) {
    return failed({ kind: "not-found", target: "topic" });
  }
  const result = validateEntryInput(input);
  if (!result.ok) {
    return failed({ kind: "invalid-entry", errors: result.errors });
  }
  const entry: Entry = {
    id: context.newId(),
    topicId,
    ...result.value,
    createdAt: context.now,
    updatedAt: context.now,
  };
  return done({ ...catalog, entries: [...catalog.entries, entry] }, entry.id);
}

export function editEntry(
  catalog: StoredCatalog,
  entryId: string,
  input: EntryInput,
  context: OperationContext,
): OperationResult {
  const entry = findEntry(catalog, entryId);
  if (!entry) {
    return failed({ kind: "not-found", target: "entry" });
  }
  const result = validateEntryInput(input);
  if (!result.ok) {
    return failed({ kind: "invalid-entry", errors: result.errors });
  }
  return done(
    replaceEntry(catalog, {
      ...entry,
      ...result.value,
      updatedAt: context.now,
    }),
    entryId,
  );
}

export function deleteEntry(
  catalog: StoredCatalog,
  entryId: string,
): OperationResult {
  if (!findEntry(catalog, entryId)) {
    return failed({ kind: "not-found", target: "entry" });
  }
  return done(
    {
      ...catalog,
      entries: catalog.entries.filter((entry) => entry.id !== entryId),
    },
    entryId,
  );
}

export function moveEntry(
  catalog: StoredCatalog,
  entryId: string,
  topicId: string,
  context: OperationContext,
): OperationResult {
  const entry = findEntry(catalog, entryId);
  if (!entry) {
    return failed({ kind: "not-found", target: "entry" });
  }
  if (!hasTopic(catalog, topicId)) {
    return failed({ kind: "not-found", target: "topic" });
  }
  if (entry.topicId === topicId) {
    return done(catalog, entryId);
  }
  return done(
    replaceEntry(catalog, { ...entry, topicId, updatedAt: context.now }),
    entryId,
  );
}

// A fixed locale keeps the order independent of the browser language; numeric
// collation puts "Item 2" before "Item 10".
const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function compareNamed(
  a: { name: string; id: string },
  b: { name: string; id: string },
): number {
  if (a.id === b.id) {
    return collator.compare(a.name, b.name);
  }
  return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1);
}

export function sortTopics(topics: readonly Topic[]): Topic[] {
  return [...topics].sort(compareNamed);
}

export function entriesOfTopic(
  catalog: StoredCatalog,
  topicId: string,
): Entry[] {
  return catalog.entries
    .filter((entry) => entry.topicId === topicId)
    .sort(compareNamed);
}

// Passwords and 2FA notes are never searched (D-10).
const searchFields = [
  "name",
  "url",
  "extraUrl",
  "description",
  "username",
] as const satisfies readonly (keyof Entry)[];

export function searchEntries(
  catalog: StoredCatalog,
  query: string,
): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [];
  }
  const topics = new Map(catalog.topics.map((topic) => [topic.id, topic]));
  const results: SearchResult[] = [];
  for (const entry of catalog.entries) {
    const topic = topics.get(entry.topicId);
    const matches = searchFields.some((field) =>
      entry[field].toLowerCase().includes(needle),
    );
    if (topic && matches) {
      results.push({ entry, topic });
    }
  }
  return results.sort(
    (a, b) =>
      collator.compare(a.entry.name, b.entry.name) ||
      collator.compare(a.topic.name, b.topic.name) ||
      compareNamed(a.entry, b.entry),
  );
}
