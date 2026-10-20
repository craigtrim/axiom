import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
if (process.env.AXIOM_LIVE_CODEX !== "1")
  throw Error("Live Codex tests are opt-in. Run npm run test:codex.");
export default defineConfig({
  testDir: path.join(projectRoot, "tests/live-codex"),
  testMatch: "**/*.spec.ts",
  timeout: 240000,
  expect: { timeout: 10000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.join(projectRoot, "artifacts/codex-live-report"),
      },
    ],
    [
      "json",
      {
        outputFile: path.join(
          projectRoot,
          "artifacts/reports/codex-live-results.json",
        ),
      },
    ],
  ],
  outputDir: path.join(projectRoot, "artifacts/codex-live-results"),
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
});
