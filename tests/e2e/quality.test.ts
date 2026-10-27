import type { BrowserContext, Page } from "@playwright/test";
import type { TestHook } from "../../src/storage/repository";
import { expect, test } from "./fixtures";

declare global {
  var useConfigTest: TestHook;
}

async function openTab(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await page.waitForFunction(() => "useConfigTest" in globalThis);
  return page;
}

// Topics are created in the given order, each with entries that have every
// field filled, so the details pane shows all its actions
async function seed(page: Page, topics: Record<string, string[]>) {
  await page.evaluate(async (topics) => {
    const { repository, operations } = useConfigTest;
    for (const [name, entries] of Object.entries(topics)) {
      const topic = await repository.update((catalog, context) =>
        operations.createTopic(catalog, name, context),
      );
      if (!topic.ok) throw new Error(`Topic ${name} was not created`);
      for (const entry of entries) {
        await repository.update((catalog, context) =>
          operations.addEntry(
            catalog,
            topic.id,
            {
              name: entry,
              url: `https://${entry.toLowerCase()}.example.com/`,
              description: "Notes",
              username: "admin",
              password: "secret",
              extraUrl: "https://status.example.com/",
              twoFactorNote: "App",
            },
            context,
          ),
        );
      }
    }
  }, topics);
  await expect(page.locator(".topic-list__name")).toHaveCount(
    Object.keys(topics).length,
  );
}

async function selectEntry(page: Page, topic: string, entry: string) {
  await page.locator(".topic-list__select", { hasText: topic }).click();
  await page.locator(".entry-list__select", { hasText: entry }).click();
  await expect(
    page
      .getByRole("region", { name: "Details" })
      .getByRole("heading", { name: entry }),
  ).toBeVisible();
}

interface FocusStop {
  // 0 for the header, then 1, 2, 3 for the panes in document order
  area: number;
  name: string;
  indicated: boolean;
}

function focusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const pane = element.closest("section");
    const style = getComputedStyle(element);
    return {
      area: element.closest("header")
        ? 0
        : [...document.querySelectorAll("section")].indexOf(pane!) + 1,
      name: element.getAttribute("aria-label") ?? element.innerText,
      // The global focus outline, or the accent ring of text fields
      indicated:
        (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
        style.boxShadow !== "none",
    };
  });
}

function luminance([r, g, b]: number[]): number {
  const [lr, lg, lb] = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [a, b]
    .map((color) => luminance(color.match(/\d+/g)!.map(Number)))
    .sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("Tab moves through the header, topics, entries and details with a visible focus", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: ["One", "Two"], Home: ["Three"] });
  await selectEntry(page, "Work", "One");
  await page.getByRole("searchbox", { name: "Search all entries" }).focus();

  const stops = [await focusStop(page)];
  // The bound only stops a runaway loop if focus never leaves the page
  while (stops.length < 50) {
    await page.keyboard.press("Tab");
    const stop = await focusStop(page);
    if (stop.area < stops[stops.length - 1].area) break;
    stops.push(stop);
  }

  expect(stops.map((stop) => stop.name).slice(0, 2)).toEqual([
    "Search all entries",
    "Menu",
  ]);
  expect([...new Set(stops.map((stop) => stop.area))]).toEqual([0, 1, 2, 3]);
  expect(stops.at(-1)?.name).toBe("Delete");
  for (const stop of stops) {
    expect(stop.indicated, `focus on "${stop.name}" is visible`).toBe(true);
  }
});

test("arrow keys move between topics and Enter selects", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Alpha: ["One"], Beta: ["Two"] });
  await page.locator(".topic-list__select", { hasText: "Alpha" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.locator(".topic-list__select", { hasText: "Beta" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Beta" })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.locator(".topic-list__select", { hasText: "Alpha" }),
  ).toBeFocused();
});

test("a dialog takes focus and returns it to its button on Escape", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: ["One"], Home: ["Two"] });
  await selectEntry(page, "Work", "One");
  const details = page.getByRole("region", { name: "Details" });

  for (const name of ["Move", "Delete"]) {
    const button = details.getByRole("button", { name, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  }
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the search placeholder meets 4.5:1 in the ${colorScheme} theme`, async ({
    context,
    extensionId,
  }) => {
    const page = await openTab(context, extensionId);
    await seed(page, { Work: [] });
    await page.emulateMedia({ colorScheme });
    const [placeholder, background] = await page.evaluate(() => {
      const input = document.querySelector(".search__input")!;
      return [
        getComputedStyle(input, "::placeholder").color,
        getComputedStyle(input).backgroundColor,
      ];
    });
    expect(contrast(placeholder, background)).toBeGreaterThanOrEqual(4.5);
  });
}

test("reduced motion turns off transitions and animations", async ({
  context,
  extensionId,
}) => {
  const page = await openTab(context, extensionId);
  await seed(page, { Work: ["One"] });
  await selectEntry(page, "Work", "One");
  const details = page.getByRole("region", { name: "Details" });

  const durations = async () => {
    await details.getByRole("button", { name: "Delete", exact: true }).click();
    const result = await page.evaluate(() => ({
      dialog: getComputedStyle(document.querySelector("dialog[open]")!)
        .animationDuration,
      button: getComputedStyle(document.querySelector(".button")!)
        .transitionDuration,
      listItem: getComputedStyle(document.querySelector(".topic-list__item")!)
        .transitionDuration,
    }));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return Object.values(result);
  };

  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const duration of await durations()) {
    expect(duration).toMatch(/^0\.14s/);
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const duration of await durations()) {
    expect(duration).toMatch(/^0s(, 0s)*$/);
  }
});
