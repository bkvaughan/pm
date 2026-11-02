import { defineConfig, devices } from "@playwright/test";

// Runs against the Docker app started with scripts/start.sh.
export default defineConfig({
  testDir: "./tests-docker",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
