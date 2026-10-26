import { defineConfig } from "@playwright/test";

export default defineConfig({
  forbidOnly: !!process.env.CI,
  reporter: "list",
  projects: [
    { name: "unit", testDir: "tests/unit" },
    // Runs against dist/; `npm run test:e2e` builds it first
    { name: "e2e", testDir: "tests/e2e" },
  ],
});
