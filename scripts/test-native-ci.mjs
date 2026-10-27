// #165: enumerate each complete shard and fail closed on missing or skipped native coverage.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { verifyNativeCoverage } from "./native-test-coverage.ts";

const [shard, ...extra] = process.argv.slice(2);
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.platform !== "win32" ||
  !/^[1-4]$/.test(shard ?? "") ||
  extra.length
)
  throw Error(
    "Native UI coverage requires a GitHub-hosted Windows runner and one shard number (1 to 4).",
  );
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "artifacts/native");
mkdirSync(output, { recursive: true });
const inventory = path.join(output, `inventory-${shard}.json`);
const results = path.join(output, `results-${shard}.json`);
const args = [
  "node_modules/@playwright/test/cli.js",
  "test",
  "--config=config/playwright.config.ts",
  `--shard=${shard}/4`,
  "--forbid-only",
];
function run(report, listing) {
  rmSync(report, { force: true });
  const result = spawnSync(
    process.execPath,
    [
      ...args,
      ...(listing
        ? ["--list", "--reporter=json"]
        : ["--reporter=list,html,json"]),
    ],
    {
      cwd: root,
      stdio: listing ? "pipe" : "inherit",
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        AXIOM_TEST_QUIET: "",
        PLAYWRIGHT_JSON_OUTPUT_FILE: report,
        PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(
          root,
          "artifacts/playwright-report",
        ),
        PLAYWRIGHT_HTML_OPEN: "never",
      },
    },
  );
  if (result.error) throw result.error;
  if (listing && result.status !== 0) {
    process.stderr.write((result.stdout ?? "") + (result.stderr ?? ""));
    throw Error("Native inventory could not be enumerated.");
  }
  return result.status;
}
run(inventory, true);
const status = run(results, false);
const coverage = verifyNativeCoverage(
  JSON.parse(readFileSync(inventory, "utf8")),
  JSON.parse(readFileSync(results, "utf8")),
);
writeFileSync(
  path.join(output, `coverage-${shard}.json`),
  JSON.stringify(
    { commit: process.env.GITHUB_SHA, shard, ...coverage },
    null,
    2,
  ) + "\n",
);
if (status !== 0) throw Error("Native Playwright execution failed.");
console.log(
  `Native shard ${shard}: ${coverage.passed} passed; ${coverage.skipped.length} declared opt-in benchmark excluded; ${coverage.listed} cases accounted for.`,
);
