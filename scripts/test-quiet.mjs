// #165: no arbitrary spec selection or fallback to visible Electron windows.
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (args.length && !(args.length === 1 && args[0] === "--list"))
  throw Error(
    "Quiet coverage has an explicit allowlist. Use node scripts/test-quiet.mjs --list; other tests require Windows CI.",
  );
if (process.env.AXIOM_TEST_EXE)
  throw Error(
    "Packaged executable tests have not been qualified for quiet rendering; use Windows CI.",
  );
// An older dist/main bundle may ignore the quiet flag and open a normal window.
// Rebuild before launching so a fresh checkout or stale build cannot do that.
if (!args.length) {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status || 1);
}
mkdirSync(path.join(root, "artifacts/quiet"), { recursive: true });
const report = path.join(root, "artifacts/quiet/results.json");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "config/playwright.quiet.config.ts",
    ...(args.length ? args : ["--reporter=list,json"]),
  ],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      AXIOM_TEST_QUIET: "1",
      PLAYWRIGHT_JSON_OUTPUT_FILE: report,
    },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
if (!args.length) {
  const { stats } = JSON.parse(readFileSync(report, "utf8"));
  if (stats.expected !== 2 || stats.unexpected || stats.flaky || stats.skipped)
    throw Error(
      "Expected both qualified quiet tests to pass without retries or skips.",
    );
}
