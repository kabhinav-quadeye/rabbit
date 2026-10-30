import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:8082",
    channel: "chrome",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
  },
  reporter: "list",
  webServer: {
    command: "node scripts/test-web.mjs",
    url: "http://localhost:8082",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
