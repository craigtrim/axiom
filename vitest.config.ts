import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/domain/**/*.test.ts"],
    testTimeout: 30000,
    pool: "forks",
    maxWorkers: 2,
  },
});
