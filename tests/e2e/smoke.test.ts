import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./fixtures";

const PINNED_EXTENSION_ID = "eicjdlcomdndfepnpfpgpjloecpnkkpj";

test("the tab page shows the product name", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/index.html`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Clay" }),
  ).toBeVisible();
});

// The manifest key pins the ID (D-12); a different ID would mean empty storage
test("the extension ID is pinned by the manifest key", async ({
  extensionId,
}) => {
  const manifest = JSON.parse(
    await readFile(
      path.resolve(import.meta.dirname, "../../dist/manifest.json"),
      "utf8",
    ),
  ) as { key: string };
  const hash = createHash("sha256")
    .update(Buffer.from(manifest.key, "base64"))
    .digest("hex");
  const idFromKey = [...hash.slice(0, 32)]
    .map((digit) => String.fromCharCode(97 + parseInt(digit, 16)))
    .join("");

  expect(idFromKey).toBe(PINNED_EXTENSION_ID);
  expect(extensionId).toBe(PINNED_EXTENSION_ID);
});

// scrollbar-width and scrollbar-color need Chrome 121 (D-24)
test("the manifest requires Chrome 121", async () => {
  const manifest = JSON.parse(
    await readFile(
      path.resolve(import.meta.dirname, "../../dist/manifest.json"),
      "utf8",
    ),
  ) as { minimum_chrome_version: string };

  expect(manifest.minimum_chrome_version).toBe("121");
});
