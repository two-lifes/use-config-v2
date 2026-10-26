import { expect, test } from "@playwright/test";
import {
  addEntry,
  countEntries,
  createTopic,
  deleteEntry,
  deleteTopic,
  editEntry,
  entriesOfTopic,
  moveEntry,
  renameTopic,
  searchEntries,
  sortTopics,
  type OperationContext,
  type OperationResult,
} from "../../src/lib/catalog";
import type { Entry, StoredCatalog, Topic } from "../../src/lib/model";
import { validateCatalog, type EntryInput } from "../../src/lib/validation";

const TIME = "2026-10-26T12:00:00.000Z";
const LATER = "2026-10-27T08:30:00.000Z";

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "t1",
    name: "Work",
    createdAt: TIME,
    updatedAt: TIME,
    ...overrides,
  };
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    topicId: "t1",
    name: "Mail",
    url: "https://mail.example.com",
    description: "",
    username: "",
    password: "",
    extraUrl: "",
    twoFactorNote: "",
    createdAt: TIME,
    updatedAt: TIME,
    ...overrides,
  };
}

function input(overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    name: "Mail",
    url: "https://mail.example.com",
    description: "",
    username: "",
    password: "",
    extraUrl: "",
    twoFactorNote: "",
    ...overrides,
  };
}

function catalog(topics: Topic[] = [], entries: Entry[] = []): StoredCatalog {
  return { schemaVersion: 1, topics, entries };
}

function context(ids: string[] = ["new"]): OperationContext {
  const queue = [...ids];
  return {
    newId: () => {
      const id = queue.shift();
      if (id === undefined) {
        throw new Error("No more test IDs.");
      }
      return id;
    },
    now: LATER,
  };
}

function success(result: OperationResult) {
  if (!result.ok) {
    throw new Error(`Operation failed: ${JSON.stringify(result.error)}`);
  }
  expect(validateCatalog(result.catalog)).toEqual({
    ok: true,
    catalog: result.catalog,
  });
  return result;
}

function sample(): StoredCatalog {
  return catalog(
    [topic(), topic({ id: "t2", name: "Home" })],
    [
      entry(),
      entry({ id: "e2", name: "Wiki", url: "https://wiki.example.com" }),
      entry({ id: "e3", topicId: "t2", name: "Bank" }),
    ],
  );
}

test.describe("topics", () => {
  test("createTopic adds a trimmed topic with new ID and time", () => {
    const before = catalog();
    const result = success(createTopic(before, "  Work  ", context(["t9"])));
    expect(result.id).toBe("t9");
    expect(result.catalog.topics).toEqual([
      { id: "t9", name: "Work", createdAt: LATER, updatedAt: LATER },
    ]);
    expect(before.topics).toEqual([]);
  });

  test("createTopic rejects empty and duplicate names", () => {
    expect(createTopic(catalog(), "  ", context())).toEqual({
      ok: false,
      error: { kind: "invalid-name", message: "Enter a topic name." },
    });
    expect(createTopic(sample(), " work ", context())).toEqual({
      ok: false,
      error: {
        kind: "invalid-name",
        message: "A topic with this name already exists.",
      },
    });
  });

  test("renameTopic changes the name and updatedAt only", () => {
    const result = success(renameTopic(sample(), "t1", " Office ", context()));
    expect(result.id).toBe("t1");
    expect(result.catalog.topics[0]).toEqual(
      topic({ name: "Office", updatedAt: LATER }),
    );
    expect(result.catalog.topics[1]).toEqual(sample().topics[1]);
  });

  test("renameTopic allows changing the case of its own name", () => {
    const result = success(renameTopic(sample(), "t1", "WORK", context()));
    expect(result.catalog.topics[0].name).toBe("WORK");
  });

  test("renameTopic rejects another topic's name and missing topics", () => {
    expect(renameTopic(sample(), "t1", "home", context())).toEqual({
      ok: false,
      error: {
        kind: "invalid-name",
        message: "A topic with this name already exists.",
      },
    });
    expect(renameTopic(sample(), "nope", "New", context())).toEqual({
      ok: false,
      error: { kind: "not-found", target: "topic" },
    });
  });

  test("deleteTopic removes the topic and its entries", () => {
    const before = sample();
    const result = success(deleteTopic(before, "t1"));
    expect(result.id).toBe("t1");
    expect(result.catalog.topics.map((t) => t.id)).toEqual(["t2"]);
    expect(result.catalog.entries.map((e) => e.id)).toEqual(["e3"]);
    expect(before).toEqual(sample());
  });

  test("deleteTopic reports a missing topic", () => {
    expect(deleteTopic(sample(), "nope")).toEqual({
      ok: false,
      error: { kind: "not-found", target: "topic" },
    });
  });

  test("countEntries counts the entries of one topic", () => {
    expect(countEntries(sample(), "t1")).toBe(2);
    expect(countEntries(sample(), "t2")).toBe(1);
    expect(countEntries(sample(), "nope")).toBe(0);
  });
});

test.describe("entries", () => {
  test("addEntry stores the normalized input in the topic", () => {
    const before = sample();
    const result = success(
      addEntry(
        before,
        "t2",
        input({
          name: " Shop ",
          url: " https://shop.example.com ",
          password: " secret ",
          description: "Line 1\nLine 2",
        }),
        context(["e9"]),
      ),
    );
    expect(result.id).toBe("e9");
    expect(result.catalog.entries.at(-1)).toEqual(
      entry({
        id: "e9",
        topicId: "t2",
        name: "Shop",
        url: "https://shop.example.com",
        password: " secret ",
        description: "Line 1\nLine 2",
        createdAt: LATER,
        updatedAt: LATER,
      }),
    );
    expect(before).toEqual(sample());
  });

  test("addEntry reports invalid fields and a missing topic", () => {
    expect(
      addEntry(sample(), "t1", input({ name: "", url: "ftp://x" }), context()),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid-entry",
        errors: {
          name: "Enter a name.",
          url: "Enter a URL that starts with http:// or https://.",
        },
      },
    });
    expect(addEntry(sample(), "nope", input(), context())).toEqual({
      ok: false,
      error: { kind: "not-found", target: "topic" },
    });
  });

  test("editEntry replaces fields and keeps ID, topic and createdAt", () => {
    const result = success(
      editEntry(
        sample(),
        "e2",
        input({ name: "Docs", url: "https://docs.example.com" }),
        context(),
      ),
    );
    expect(result.id).toBe("e2");
    expect(result.catalog.entries[1]).toEqual(
      entry({
        id: "e2",
        name: "Docs",
        url: "https://docs.example.com",
        updatedAt: LATER,
      }),
    );
    expect(result.catalog.entries[0]).toEqual(sample().entries[0]);
  });

  test("editEntry reports invalid fields and a missing entry", () => {
    expect(
      editEntry(sample(), "e1", input({ extraUrl: "mail" }), context()),
    ).toEqual({
      ok: false,
      error: {
        kind: "invalid-entry",
        errors: {
          extraUrl: "Enter a URL that starts with http:// or https://.",
        },
      },
    });
    expect(editEntry(sample(), "nope", input(), context())).toEqual({
      ok: false,
      error: { kind: "not-found", target: "entry" },
    });
  });

  test("deleteEntry removes only that entry", () => {
    const result = success(deleteEntry(sample(), "e2"));
    expect(result.id).toBe("e2");
    expect(result.catalog.entries.map((e) => e.id)).toEqual(["e1", "e3"]);
    expect(result.catalog.topics).toEqual(sample().topics);
    expect(deleteEntry(sample(), "nope")).toEqual({
      ok: false,
      error: { kind: "not-found", target: "entry" },
    });
  });

  test("moveEntry changes the topic and updatedAt", () => {
    const before = sample();
    const result = success(moveEntry(before, "e1", "t2", context()));
    expect(result.id).toBe("e1");
    expect(result.catalog.entries[0]).toEqual(
      entry({ topicId: "t2", updatedAt: LATER }),
    );
    expect(before).toEqual(sample());
  });

  test("moveEntry to the same topic changes nothing", () => {
    const before = sample();
    const result = success(moveEntry(before, "e1", "t1", context()));
    expect(result.catalog).toBe(before);
  });

  test("moveEntry reports a missing entry or target topic", () => {
    expect(moveEntry(sample(), "nope", "t2", context())).toEqual({
      ok: false,
      error: { kind: "not-found", target: "entry" },
    });
    expect(moveEntry(sample(), "e1", "nope", context())).toEqual({
      ok: false,
      error: { kind: "not-found", target: "topic" },
    });
  });
});

test.describe("sorting", () => {
  test("sortTopics orders by name ignoring case and numbers naturally", () => {
    const topics = [
      topic({ id: "a", name: "item 10" }),
      topic({ id: "b", name: "Beta" }),
      topic({ id: "c", name: "alpha" }),
      topic({ id: "d", name: "Item 2" }),
    ];
    expect(sortTopics(topics).map((t) => t.name)).toEqual([
      "alpha",
      "Beta",
      "Item 2",
      "item 10",
    ]);
    expect(topics[0].id).toBe("a");
  });

  test("entriesOfTopic returns one topic's entries sorted by name", () => {
    const data = catalog(
      [topic(), topic({ id: "t2", name: "Home" })],
      [
        entry({ id: "e1", name: "zeta" }),
        entry({ id: "e2", name: "Alpha" }),
        entry({ id: "e3", topicId: "t2", name: "Beta" }),
        entry({ id: "e4", name: "Ärger" }),
      ],
    );
    expect(entriesOfTopic(data, "t1").map((e) => e.name)).toEqual([
      "Alpha",
      "Ärger",
      "zeta",
    ]);
  });

  test("equal names are ordered by ID", () => {
    const data = catalog(
      [topic()],
      [
        entry({ id: "b", name: "Mail" }),
        entry({ id: "a", name: "mail" }),
        entry({ id: "c", name: "Mail" }),
      ],
    );
    expect(entriesOfTopic(data, "t1").map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

test.describe("search", () => {
  const data = catalog(
    [topic(), topic({ id: "t2", name: "Home" })],
    [
      entry({ id: "name", name: "Grafana Dashboard" }),
      entry({ id: "url", name: "A", url: "https://grafana.example.com" }),
      entry({ id: "extra", name: "B", extraUrl: "https://x.example/grafana" }),
      entry({ id: "desc", name: "C", description: "Line\nGRAFANA metrics" }),
      entry({ id: "user", topicId: "t2", name: "D", username: "grafana-bot" }),
      entry({ id: "pass", name: "E", password: "grafana" }),
      entry({ id: "2fa", name: "F", twoFactorNote: "grafana app" }),
    ],
  );

  function ids(query: string) {
    return searchEntries(data, query).map((result) => result.entry.id);
  }

  test("matches partial text in searchable fields ignoring case", () => {
    expect(ids("GraFan")).toEqual(["url", "extra", "desc", "user", "name"]);
  });

  test("never matches passwords or 2FA notes", () => {
    expect(ids("grafana")).not.toContain("pass");
    expect(ids("grafana")).not.toContain("2fa");
    expect(ids("app")).toEqual([]);
  });

  test("an empty or blank query returns no results", () => {
    expect(ids("")).toEqual([]);
    expect(ids("   ")).toEqual([]);
  });

  test("the query is trimmed", () => {
    expect(ids("  dashboard ")).toEqual(["name"]);
  });

  test("results include the topic and are sorted by entry, then topic", () => {
    const sameName = catalog(
      [topic({ id: "t1", name: "Work" }), topic({ id: "t2", name: "Home" })],
      [
        entry({ id: "w", topicId: "t1", name: "Mail" }),
        entry({ id: "h", topicId: "t2", name: "Mail" }),
        entry({ id: "a", topicId: "t1", name: "Admin mail" }),
      ],
    );
    expect(
      searchEntries(sameName, "mail").map(
        (r) => `${r.entry.name} / ${r.topic.name}`,
      ),
    ).toEqual(["Admin mail / Work", "Mail / Home", "Mail / Work"]);
  });
});
