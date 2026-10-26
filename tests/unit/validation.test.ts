import { expect, test } from "@playwright/test";
import { LIMITS, type Entry, type Topic } from "../../src/lib/model";
import {
  isHttpUrl,
  textLength,
  validateCatalog,
  validateEntryInput,
  validateEntryName,
  validateLongText,
  validateSecret,
  validateTopicName,
  validateUrl,
  type EntryInput,
} from "../../src/lib/validation";

const TIME = "2026-10-26T12:00:00.000Z";

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

function catalog(topics: unknown[], entries: unknown[]) {
  return { schemaVersion: 1, topics, entries };
}

function problemsOf(value: unknown): string[] {
  const result = validateCatalog(value);
  return result.ok ? [] : result.problems;
}

test.describe("textLength", () => {
  test("counts code points, not UTF-16 units", () => {
    expect(textLength("abc")).toBe(3);
    expect(textLength("Почта")).toBe(5);
    expect(textLength("😀😀")).toBe(2);
  });
});

test.describe("validateTopicName", () => {
  test("trims the name", () => {
    expect(validateTopicName("  Work  ", [])).toEqual({
      ok: true,
      value: "Work",
    });
  });

  test("rejects an empty or blank name", () => {
    expect(validateTopicName("", []).ok).toBe(false);
    expect(validateTopicName(" \t\n", []).ok).toBe(false);
  });

  test("accepts the length limit and rejects one character more", () => {
    expect(validateTopicName("a".repeat(LIMITS.topicName), []).ok).toBe(true);
    expect(validateTopicName("a".repeat(LIMITS.topicName + 1), []).ok).toBe(
      false,
    );
  });

  test("counts an emoji as one character", () => {
    expect(validateTopicName("😀".repeat(LIMITS.topicName), []).ok).toBe(true);
  });

  test("rejects a name that repeats another ignoring case and spaces", () => {
    const topics = [topic({ name: "Работа" })];
    expect(validateTopicName(" работа ", topics)).toEqual({
      ok: false,
      message: "A topic with this name already exists.",
    });
  });

  test("allows renaming a topic to its own name in another case", () => {
    const topics = [topic({ id: "t1", name: "Work" })];
    expect(validateTopicName("WORK", topics, "t1")).toEqual({
      ok: true,
      value: "WORK",
    });
    expect(validateTopicName("WORK", topics, "t2").ok).toBe(false);
  });
});

test.describe("validateEntryName", () => {
  test("trims and requires the name", () => {
    expect(validateEntryName("  Mail ")).toEqual({ ok: true, value: "Mail" });
    expect(validateEntryName("   ").ok).toBe(false);
  });

  test("applies the length limit", () => {
    expect(validateEntryName("a".repeat(LIMITS.entryName)).ok).toBe(true);
    expect(validateEntryName("a".repeat(LIMITS.entryName + 1)).ok).toBe(false);
  });
});

test.describe("validateUrl", () => {
  test("accepts http and https URLs and trims them", () => {
    expect(
      validateUrl(" https://example.com/a?b=1 ", { required: true }),
    ).toEqual({ ok: true, value: "https://example.com/a?b=1" });
    expect(validateUrl("http://localhost:8080", { required: true }).ok).toBe(
      true,
    );
  });

  test("rejects other protocols, missing schemes and invalid URLs", () => {
    for (const value of [
      "ftp://example.com",
      "javascript:alert(1)",
      "file:///etc/hosts",
      "example.com",
      "http://",
      "not a url",
    ]) {
      expect(validateUrl(value, { required: true }), value).toEqual({
        ok: false,
        message: "Enter a URL that starts with http:// or https://.",
      });
    }
  });

  test("requires a value only when required", () => {
    expect(validateUrl("  ", { required: true })).toEqual({
      ok: false,
      message: "Enter a URL.",
    });
    expect(validateUrl("  ", { required: false })).toEqual({
      ok: true,
      value: "",
    });
  });

  test("applies the length limit", () => {
    const base = "https://example.com/";
    const atLimit = base + "a".repeat(LIMITS.url - base.length);
    expect(validateUrl(atLimit, { required: true }).ok).toBe(true);
    expect(validateUrl(atLimit + "a", { required: true }).ok).toBe(false);
  });

  test("isHttpUrl checks the protocol of a parsed URL", () => {
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

test.describe("secrets and long text", () => {
  test("keeps username and password exactly as entered", () => {
    expect(validateSecret("  p@ss word  ")).toEqual({
      ok: true,
      value: "  p@ss word  ",
    });
    expect(validateSecret("a".repeat(LIMITS.secret)).ok).toBe(true);
    expect(validateSecret("a".repeat(LIMITS.secret + 1)).ok).toBe(false);
  });

  test("keeps line breaks and non-Latin text", () => {
    const text = "Первая строка\nвторая\r\n\nтретья";
    expect(validateLongText(text)).toEqual({ ok: true, value: text });
    expect(validateLongText("a".repeat(LIMITS.longText)).ok).toBe(true);
    expect(validateLongText("a".repeat(LIMITS.longText + 1)).ok).toBe(false);
  });
});

test.describe("validateEntryInput", () => {
  test("returns normalized values", () => {
    const result = validateEntryInput(
      input({
        name: " Mail ",
        url: " https://mail.example.com ",
        extraUrl: " ",
        password: " secret ",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: input({ password: " secret " }),
    });
  });

  test("reports an error for every invalid field", () => {
    const result = validateEntryInput(
      input({ name: "", url: "example.com", extraUrl: "ftp://x" }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? {} : Object.keys(result.errors).sort()).toEqual([
      "extraUrl",
      "name",
      "url",
    ]);
  });
});

test.describe("validateCatalog", () => {
  test("accepts an empty catalog", () => {
    expect(validateCatalog(catalog([], []))).toEqual({
      ok: true,
      catalog: { schemaVersion: 1, topics: [], entries: [] },
    });
  });

  test("accepts a valid catalog and drops unknown properties", () => {
    const result = validateCatalog({
      ...catalog(
        [{ ...topic(), extra: true }],
        [entry({ description: "a\nb", password: " x " })],
      ),
      extra: 1,
    });
    expect(result).toEqual({
      ok: true,
      catalog: {
        schemaVersion: 1,
        topics: [topic()],
        entries: [entry({ description: "a\nb", password: " x " })],
      },
    });
  });

  test("rejects values that are not catalog objects", () => {
    for (const value of [null, undefined, "x", 1, []]) {
      expect(problemsOf(value)).toEqual(["catalog: Must be an object."]);
    }
  });

  test("rejects a missing or different schema version", () => {
    expect(problemsOf({ topics: [], entries: [] })).toEqual([
      "schemaVersion: Must be 1.",
    ]);
    expect(problemsOf({ schemaVersion: 2, topics: [], entries: [] })).toEqual([
      "schemaVersion: Must be 1.",
    ]);
  });

  test("rejects missing collections and non-object items", () => {
    expect(problemsOf({ schemaVersion: 1 })).toEqual([
      "topics: Must be an array.",
      "entries: Must be an array.",
    ]);
    expect(problemsOf(catalog([null], ["x"]))).toEqual([
      "topics[0]: Must be an object.",
      "entries[0]: Must be an object.",
    ]);
  });

  test("rejects fields with wrong types, empty IDs and bad timestamps", () => {
    expect(
      problemsOf(
        catalog(
          [{ id: "", name: 5, createdAt: "2026-10-26", updatedAt: TIME }],
          [],
        ),
      ),
    ).toEqual([
      "topics[0].id: Must not be empty.",
      "topics[0].name: Must be a string.",
      "topics[0].createdAt: Must be an ISO 8601 UTC timestamp.",
    ]);
    expect(
      problemsOf(
        catalog([topic({ updatedAt: "2026-02-30T12:00:00.000Z" })], []),
      ),
    ).toEqual(["topics[0].updatedAt: Must be an ISO 8601 UTC timestamp."]);
  });

  test("rejects a missing entry field", () => {
    const rest: Partial<Entry> = entry();
    delete rest.password;
    expect(problemsOf(catalog([topic()], [rest]))).toEqual([
      "entries[0].password: Must be a string.",
    ]);
  });

  test("rejects stored values that break field rules", () => {
    expect(
      problemsOf(
        catalog(
          [topic({ name: " Work" })],
          [
            entry({
              url: "ftp://example.com",
              username: "a".repeat(LIMITS.secret + 1),
            }),
          ],
        ),
      ),
    ).toEqual([
      "topics[0].name: Must not start or end with spaces.",
      "entries[0].url: Enter a URL that starts with http:// or https://.",
      `entries[0].username: Use at most ${LIMITS.secret} characters.`,
    ]);
  });

  test("rejects repeated IDs and topic names", () => {
    expect(
      problemsOf(
        catalog(
          [
            topic({ id: "t1", name: "Work" }),
            topic({ id: "t1", name: "Home" }),
            topic({ id: "t3", name: "WORK" }),
          ],
          [entry({ id: "e1" }), entry({ id: "e1" })],
        ),
      ),
    ).toEqual([
      "topics[1].id: Repeats another ID.",
      "entries[1].id: Repeats another ID.",
      "topics[2].name: Repeats another topic name.",
    ]);
  });

  test("rejects an entry that refers to a missing topic", () => {
    expect(
      problemsOf(catalog([topic()], [entry({ topicId: "missing" })])),
    ).toEqual(["entries[0].topicId: Refers to a missing topic."]);
  });

  test("does not report a missing topic for an invalid topic", () => {
    expect(problemsOf(catalog([topic({ name: "" })], [entry()]))).toEqual([
      "topics[0].name: Enter a topic name.",
    ]);
  });
});
