import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.resolve(import.meta.dirname, "../../src/app/styles.css"),
  "utf8",
);

function colorTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(
    /--([\w-]+):\s*(#[0-9a-f]{6});/g,
  )) {
    tokens[name] = value;
  }
  return tokens;
}

function themeBlock(start: string): string {
  const from = css.indexOf(start);
  expect(from, `${start} is missing`).toBeGreaterThanOrEqual(0);
  return css.slice(from, css.indexOf("}", from));
}

const light = colorTokens(themeBlock(":root {"));
const dark = {
  ...light,
  ...colorTokens(themeBlock("@media (prefers-color-scheme: dark)")),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg", "surface", "surface-hover", "surface-selected"];

// WCAG 2.2 AA: 4.5:1 for text (1.4.3), 3:1 for UI components (1.4.11)
const PAIRS: [foreground: string, backgrounds: string[], minimum: number][] = [
  ["text", SURFACES, 4.5],
  ["text-muted", SURFACES, 4.5],
  ["accent", ["bg", "surface"], 4.5],
  // The focus ring and the selection bar also sit on list item backgrounds
  ["accent", ["surface-hover", "surface-selected"], 3],
  ["danger", ["bg", "surface"], 4.5],
  ["accent-text", ["accent", "danger"], 4.5],
  ["success", ["surface"], 3],
  ["border-input", ["bg", "surface"], 3],
];

for (const [theme, tokens] of [
  ["light", light],
  ["dark", dark],
] as const) {
  test.describe(`${theme} theme`, () => {
    for (const [foreground, backgrounds, minimum] of PAIRS) {
      for (const background of backgrounds) {
        test(`--${foreground} on --${background} meets ${minimum}:1`, () => {
          const ratio = contrast(tokens[foreground], tokens[background]);
          expect(ratio).toBeGreaterThanOrEqual(minimum);
        });
      }
    }
  });
}
