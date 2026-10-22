// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.E2E_PORT || 3002;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Same test-DB defaults as tests/setup-env.js (Jest-only). Inherited by the app that
// webServer starts and by the test workers, which reset/seed through tests/helpers/db.js.
process.env.DB_HOST ??= "localhost";
process.env.DB_PORT ??= "5433";
process.env.DB_NAME ??= "library_db_test";
process.env.DB_USER ??= "postgres";
process.env.DB_PASSWORD ??= "postgres";
process.env.DOTENV_CONFIG_QUIET ??= "true";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  // Serial: every test resets and seeds the one shared test database
  fullyParallel: false,
  forbidOnly: !!process.env.CI,          // fail CI if a test.only is left in
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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
