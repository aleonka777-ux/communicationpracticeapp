import { defineConfig, devices } from "@playwright/test";

/**
 * Requires a real (test) Supabase project — URL/anon key in .env.local or the environment —
 * with migrations and supabase/seed.sql applied, so the app can actually sign up a user and
 * load the seeded communication tools/scenarios. The AI provider is mocked automatically
 * (no OPENAI_API_KEY needed — see /docs/DECISIONS.md), so this never makes a live model call.
 * See README.md "Running tests" for setup.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Uses the Chromium already installed at $PLAYWRIGHT_BROWSERS_PATH — see /docs/DECISIONS.md.
      // In an environment without that pre-install, run `npx playwright install chromium` first.
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
