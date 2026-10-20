import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  test: {
    include: ["tests/domain/**/*.test.ts"],
    testTimeout: 30000,
    pool: "forks",
    maxWorkers: 2,
    setupFiles: ["tests/domain/cache-test-setup.ts"],
  },
});
