// #165: enumerate each complete shard and fail closed on missing or skipped native coverage.
// #166: include the completed-close/reopen journey in the early regression batch.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { verifyNativeCoverage } from "./native-test-coverage.ts";

const [shard, ...extra] = process.argv.slice(2);
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.platform !== "win32" ||
  !/^(?:[1-4]|regression)$/.test(shard ?? "") ||
  extra.length
)
  throw Error(
    "Native UI coverage requires a GitHub-hosted Windows runner and one shard number (1 to 4) or the regression batch.",
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
  ...(shard === "regression"
    ? [
        "tests/e2e/individuals-visual.spec.ts",
        "tests/e2e/authoring.spec.ts",
        "tests/e2e/find.spec.ts",
        "tests/e2e/add-entity-reference.spec.ts",
        "tests/e2e/edge-creation.spec.ts",
        "tests/e2e/ontology-lifecycle.spec.ts",
        "tests/e2e/workspace-autosave.spec.ts",
        "--grep",
        String.raw`(?:individuals-visual\.spec\.ts|natural labels create in the taxonomy and full entity details open beside the graph$|Find filters, sorts and pages every match with useful result actions$|quick Find focuses type-ahead and sends results to a pane without changing the graph$|a failed check stays visible until a successful check and stale replies cannot commit$|Escape, right-click, stale data and pane closure cancel drawing without edits$|DOAP: import, view, edit, create, save, close and reopen$|an unnamed workspace saves on File Close and remains accessible as a complete recovery workspace$)`,
      ]
    : [`--shard=${shard}/4`]),
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
if (shard === "regression" && coverage.listed !== 15)
  throw Error(
    "The focused native regression inventory must contain all fifteen cases.",
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
