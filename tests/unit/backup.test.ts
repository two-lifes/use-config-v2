import { expect, test } from "@playwright/test";
import {
  checkImportSize,
  exportFileName,
  IMPORT_SIZE_LIMIT,
  parseImport,
  rawExportFileName,
  serializeExport,
  serializeRaw,
} from "../../src/lib/backup";
import type { Entry, StoredCatalog, Topic } from "../../src/lib/model";

const TIME = "2026-10-26T12:00:00.000Z";
const EXPORTED_AT = "2026-10-27T08:30:00.000Z";

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

function exportFile(overrides: Record<string, unknown> = {}) {
  return {
    format: "use-config-export",
    schemaVersion: 1,
    exportedAt: EXPORTED_AT,
    topics: [topic()],
    entries: [entry()],
    ...overrides,
  };
}

function parse(value: unknown) {
  return parseImport(JSON.stringify(value));
}

const sample: StoredCatalog = {
  schemaVersion: 1,
  topics: [topic(), topic({ id: "t2", name: "Домашние 😀" })],
  entries: [
    entry({
      username: "  user@example.com ",
      password: ' p@ss "word"\\ ',
      description: "Line one\nLine two",
      twoFactorNote: "Codes in the drawer\r\n",
      extraUrl: "https://example.com/help",
    }),
    entry({ id: "e2", topicId: "t2", name: "Почта", url: "http://local.test" }),
  ],
};

test.describe("serializeExport", () => {
  test("writes the export fields in order with two-space indentation", () => {
    const text = serializeExport(sample, EXPORTED_AT);
    expect(Object.keys(JSON.parse(text))).toEqual([
      "format",
      "schemaVersion",
      "exportedAt",
      "topics",
      "entries",
    ]);
    expect(text).toBe(
      JSON.stringify(
        {
          format: "use-config-export",
          schemaVersion: 1,
          exportedAt: EXPORTED_AT,
          topics: sample.topics,
          entries: sample.entries,
        },
        null,
        2,
      ),
    );
    expect(text.split("\n")[1]).toBe('  "format": "use-config-export",');
  });

  test("includes passwords as they are", () => {
    const text = serializeExport(sample, EXPORTED_AT);
    expect(JSON.parse(text).entries[0].password).toBe(' p@ss "word"\\ ');
  });
});

test.describe("exportFileName", () => {
  test("uses the local date with leading zeros", () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 59))).toBe(
      "clay-2026-01-05.json",
    );
    expect(exportFileName(new Date(2026, 11, 31, 0, 0))).toBe(
      "clay-2026-12-31.json",
    );
  });
});

test.describe("raw data export", () => {
  test("keeps the stored value as it is, under its own file name", () => {
    const raw = { schemaVersion: 2, topics: "broken" };
    expect(JSON.parse(serializeRaw(raw))).toEqual(raw);
    expect(serializeRaw(42)).toBe("42");
    expect(rawExportFileName(new Date(2026, 0, 5, 23, 59))).toBe(
      "clay-raw-2026-01-05.json",
    );
  });

  test("is rejected by import", () => {
    const raw = { schemaVersion: 1, topics: [], entries: [] };
    expect(parseImport(serializeRaw(raw))).toMatchObject({
      ok: false,
      error: "wrong-format",
    });
  });
});

test.describe("parseImport", () => {
  test("restores identical data after an export", () => {
    expect(parseImport(serializeExport(sample, EXPORTED_AT))).toEqual({
      ok: true,
      catalog: sample,
      exportedAt: EXPORTED_AT,
    });
  });

  test("restores an empty catalog", () => {
    const empty: StoredCatalog = { schemaVersion: 1, topics: [], entries: [] };
    expect(parseImport(serializeExport(empty, EXPORTED_AT))).toEqual({
      ok: true,
      catalog: empty,
      exportedAt: EXPORTED_AT,
    });
  });

  test("drops unknown properties", () => {
    const result = parse(
      exportFile({
        extra: true,
        topics: [{ ...topic(), color: "red" }],
        entries: [{ ...entry(), notes: "x" }],
      }),
    );
    expect(result).toEqual({
      ok: true,
      catalog: { schemaVersion: 1, topics: [topic()], entries: [entry()] },
      exportedAt: EXPORTED_AT,
    });
  });

  test("rejects text that is not JSON", () => {
    for (const text of ["", "{", "not json", '{"format": }']) {
      expect(parseImport(text)).toEqual({
        ok: false,
        error: "not-json",
        message: "The file is not valid JSON.",
        problems: [],
      });
    }
  });

  test("rejects JSON of another format", () => {
    const others: unknown[] = [
      null,
      [],
      "use-config-export",
      42,
      { schemaVersion: 1, topics: [], entries: [] },
      exportFile({ format: "other-export" }),
      exportFile({ format: "USE-CONFIG-EXPORT" }),
    ];
    for (const value of others) {
      expect(parse(value)).toEqual({
        ok: false,
        error: "wrong-format",
        message: "The file is not a Clay export.",
        problems: [],
      });
    }
  });

  test("rejects a newer schema version with its own message", () => {
    for (const schemaVersion of [2, 10]) {
      expect(parse(exportFile({ schemaVersion, topics: "changed" }))).toEqual({
        ok: false,
        error: "newer-version",
        message:
          "The file was created by a newer version of Clay. Update the extension to import it.",
        problems: [],
      });
    }
  });

  test("treats another invalid schema version as an invalid field", () => {
    for (const schemaVersion of [0, 1.5, "1", null, undefined]) {
      expect(parse(exportFile({ schemaVersion }))).toEqual({
        ok: false,
        error: "invalid",
        message: "The file has 1 problem.",
        problems: ["schemaVersion: Must be 1."],
      });
    }
  });

  test("rejects a missing or malformed export time", () => {
    for (const exportedAt of [undefined, "", "2026-10-27", 1_700_000_000]) {
      expect(parse(exportFile({ exportedAt }))).toEqual({
        ok: false,
        error: "invalid",
        message: "The file has 1 problem.",
        problems: ["exportedAt: Must be an ISO 8601 UTC timestamp."],
      });
    }
  });

  test("rejects invalid fields, repeated IDs and names, broken references", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ entries: [entry({ url: "ftp://x" })] }, "entries[0].url"],
      [{ entries: [entry({ name: " Mail" })] }, "entries[0].name"],
      [{ topics: "none", entries: [] }, "topics"],
      [{ topics: [topic(), topic({ name: "Other" })] }, "topics[1].id"],
      [
        { topics: [topic(), topic({ id: "t2", name: "WORK" })] },
        "topics[1].name",
      ],
      [{ entries: [entry(), entry()] }, "entries[1].id"],
      [{ entries: [entry({ topicId: "t9" })] }, "entries[0].topicId"],
    ];
    for (const [overrides, path] of cases) {
      const result = parse(exportFile(overrides));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("invalid");
        expect(result.problems).toHaveLength(1);
        expect(result.problems[0].split(": ")[0]).toBe(path);
      }
    }
  });

  test("lists at most five problems and counts all of them", () => {
    const entries = Array.from({ length: 7 }, (_, index) =>
      entry({ id: `e${index}`, url: "" }),
    );
    const result = parse(exportFile({ entries }));
    expect(result).toEqual({
      ok: false,
      error: "invalid",
      message: "The file has 7 problems.",
      problems: Array.from(
        { length: 5 },
        (_, index) => `entries[${index}].url: Enter a URL.`,
      ),
    });
  });
});

test.describe("import size limit", () => {
  test("checkImportSize accepts the limit and rejects one byte more", () => {
    expect(checkImportSize(0)).toBeUndefined();
    expect(checkImportSize(IMPORT_SIZE_LIMIT)).toBeUndefined();
    expect(checkImportSize(IMPORT_SIZE_LIMIT + 1)).toEqual({
      ok: false,
      error: "too-large",
      message: "The file is larger than 10 MB.",
      problems: [],
    });
  });

  test("parseImport counts the text in UTF-8 bytes", () => {
    const valid = serializeExport(sample, EXPORTED_AT);
    const padding = IMPORT_SIZE_LIMIT - new TextEncoder().encode(valid).length;
    expect(parseImport(valid + " ".repeat(padding)).ok).toBe(true);
    expect(parseImport(valid + " ".repeat(padding + 1))).toMatchObject({
      ok: false,
      error: "too-large",
    });

    // Fewer UTF-16 units than the limit, but three bytes per character.
    const wide = "€".repeat(Math.floor(IMPORT_SIZE_LIMIT / 3) + 1);
    expect(wide.length).toBeLessThan(IMPORT_SIZE_LIMIT);
    expect(parseImport(wide)).toMatchObject({ ok: false, error: "too-large" });
  });
});
