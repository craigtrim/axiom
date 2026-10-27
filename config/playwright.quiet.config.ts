// #165: only explicitly qualified cases can enter the local quiet suite.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import path from "node:path";

if (process.env.AXIOM_TEST_QUIET !== "1")
  throw Error(
    "Use npm run test:quiet to set the isolated quiet launch policy.",
  );

export default defineConfig(base, {
  testDir: path.resolve(import.meta.dirname, "../tests"),
  testMatch: ["e2e/state-updates.spec.ts", "quiet/window-policy.spec.ts"],
  grep: /(?:state-updates\.spec\.ts a label delta refreshes Hierarchy, Find, Individuals and Details|window-policy\.spec\.ts quiet windows remain hidden through rendering and activation)$/,
});
