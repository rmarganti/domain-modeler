import { defineConfig, devices } from "@playwright/test";

// A smoke test of the built frontend in a real browser, where vitest's
// happy-dom can't reach: layout, measured cards, SVG edges, and focus.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
  },
});
