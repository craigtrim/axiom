import { defineConfig } from "@playwright/test";
if (process.env.AXIOM_LIVE_CODEX !== "1")
  throw Error("Live Codex tests are opt-in. Run npm run test:codex.");
export default defineConfig({
  testDir: "tests/live-codex",
  testMatch: "**/*.spec.ts",
  timeout: 240000,
  expect: { timeout: 10000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "artifacts/codex-live-report" }],
    ["json", { outputFile: "artifacts/codex-live-results.json" }],
  ],
  outputDir: "artifacts/codex-live-results",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
