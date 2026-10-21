// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.E2E_PORT || 3002;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,          // fail CI if a test.only is left in
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Starts the app before tests, unless E2E_BASE_URL points at an already-deployed server
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm start",
        url: BASE_URL,                    // waits for the static index page, not /health
        env: { PORT: String(PORT) },
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
