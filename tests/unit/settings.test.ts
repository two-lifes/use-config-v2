import { expect, test } from "@playwright/test";
import {
  DEFAULT_SETTINGS,
  needsOpenAllConfirmation,
  parseSettings,
  validateOpenAllThreshold,
  validateSettings,
} from "../../src/lib/settings";

test.describe("validateSettings", () => {
  test("accepts the boundaries of the threshold", () => {
    for (const threshold of [1, 10, 500]) {
      expect(
        validateSettings({
          schemaVersion: 1,
          openAllConfirmThreshold: threshold,
        }),
      ).toEqual({
        ok: true,
        settings: { schemaVersion: 1, openAllConfirmThreshold: threshold },
      });
    }
  });

  test("rejects a threshold outside 1–500 or not a whole number", () => {
    for (const threshold of [0, 501, 1.5, -1, "10", null, undefined]) {
      const result = validateSettings({
        schemaVersion: 1,
        openAllConfirmThreshold: threshold,
      });
      expect(result.ok).toBe(false);
    }
  });

  test("reports a wrong schema version, unknown fields and non-objects", () => {
    expect(
      validateSettings({
        schemaVersion: 2,
        openAllConfirmThreshold: 10,
        theme: "dark",
      }),
    ).toEqual({
      ok: false,
      problems: ["schemaVersion: Must be 1.", "theme: Unknown field."],
    });
    for (const value of [null, [], "settings", 10]) {
      expect(validateSettings(value)).toEqual({
        ok: false,
        problems: ["settings: Must be an object."],
      });
    }
  });
});

test.describe("parseSettings", () => {
  test("gives the defaults for a missing value", () => {
    expect(parseSettings(undefined)).toEqual({
      schemaVersion: 1,
      openAllConfirmThreshold: 10,
    });
  });

  test("gives the defaults for an invalid value", () => {
    expect(
      parseSettings({ schemaVersion: 1, openAllConfirmThreshold: 0 }),
    ).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("broken")).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps a valid value", () => {
    expect(
      parseSettings({ schemaVersion: 1, openAllConfirmThreshold: 3 }),
    ).toEqual({ schemaVersion: 1, openAllConfirmThreshold: 3 });
  });
});

test.describe("validateOpenAllThreshold", () => {
  test("accepts whole numbers from 1 to 500, ignoring surrounding spaces", () => {
    expect(validateOpenAllThreshold("1")).toEqual({ ok: true, value: 1 });
    expect(validateOpenAllThreshold("500")).toEqual({ ok: true, value: 500 });
    expect(validateOpenAllThreshold(" 12 ")).toEqual({ ok: true, value: 12 });
    expect(validateOpenAllThreshold("007")).toEqual({ ok: true, value: 7 });
  });

  test("rejects anything else with one message", () => {
    for (const text of [
      "",
      " ",
      "0",
      "501",
      "1.5",
      "1e2",
      "-3",
      "+3",
      "abc",
      "1 0",
    ]) {
      expect(validateOpenAllThreshold(text)).toEqual({
        ok: false,
        message: "Enter a whole number from 1 to 500.",
      });
    }
  });
});

test("Open all asks only above the threshold", () => {
  const settings = { schemaVersion: 1, openAllConfirmThreshold: 3 } as const;
  expect(needsOpenAllConfirmation(3, settings)).toBe(false);
  expect(needsOpenAllConfirmation(4, settings)).toBe(true);
  expect(needsOpenAllConfirmation(10, DEFAULT_SETTINGS)).toBe(false);
  expect(needsOpenAllConfirmation(11, DEFAULT_SETTINGS)).toBe(true);
});
