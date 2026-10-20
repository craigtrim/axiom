import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export default defineConfig({
  testDir: path.join(projectRoot, "tests/e2e"),
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.join(projectRoot, "artifacts/playwright-report"),
      },
    ],
  ],
  outputDir: path.join(projectRoot, "artifacts/test-results"),
  use: { trace: "retain-on-failure" },
});
