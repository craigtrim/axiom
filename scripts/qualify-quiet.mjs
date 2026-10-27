// #165: demonstrate that the unchanged regression test still detects a real bug.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";

if (process.env.GITHUB_ACTIONS !== "true" || process.platform !== "win32")
  throw Error(
    "This qualification opens native windows. Run it on a GitHub-hosted Windows runner.",
  );
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "artifacts/quiet-qualification");
mkdirSync(output, { recursive: true });
const evidence = [];
function run(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, AXIOM_TEST_QUIET: "", ...env },
  });
  if (result.error) throw result.error;
  return result.status;
}
function build() {
  if (run(["scripts/build.mjs"]) !== 0)
    throw Error("Qualification build failed.");
}
function scenario(mode, regression) {
  const report = path.join(
    output,
    `${mode}-${regression ? "regression" : "baseline"}.json`,
  );
  const status = run(
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "config/playwright.config.ts",
      "tests/e2e/state-updates.spec.ts",
      "--reporter=list,json",
    ],
    {
      AXIOM_TEST_QUIET: mode === "quiet" ? "1" : "",
      PLAYWRIGHT_JSON_OUTPUT_FILE: report,
    },
  );
  const results = JSON.parse(readFileSync(report, "utf8"));
  const cases = [];
  function collect(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) cases.push(...spec.tests);
      collect(suite.suites || []);
    }
  }
  collect(results.suites);
  if (cases.length !== 1 || results.stats.skipped || results.stats.flaky)
    throw Error(
      "Qualification must execute exactly the existing state-update scenario without skips or retries.",
    );
  const errors = cases.flatMap((test) =>
    test.results.flatMap((result) => result.errors || []),
  );
  // Find queries fresh domain results; Hierarchy consumes the damaged entity
  // cache. Require that specific stale-label failure, with no other errors.
  const staleLabelDetected =
    errors.length === 1 &&
    errors.every((error) => {
      const message = (error.message || "").replace(/\u001b\[[0-9;]*m/g, "");
      return (
        /state-updates\.spec\.ts$/.test(error.location?.file || "") &&
        /toHaveText/.test(message) &&
        /tree-name/.test(message) &&
        /School Revised/.test(message) &&
        /Received:\s*"School"/.test(message)
      );
    });
  if (
    regression
      ? status !== 1 || results.stats.unexpected !== 1 || !staleLabelDetected
      : status !== 0 || results.stats.expected !== 1 || results.stats.unexpected
  )
    throw Error(
      `${mode} ${regression ? "regression was not detected by the expected assertion" : "baseline failed"}; read ${report}`,
    );
  evidence.push({
    mode,
    regression,
    status,
    staleLabelDetected,
    report: path.basename(report),
  });
}

scenario("normal", false);
scenario("quiet", false);
if (run(["scripts/test-quiet.mjs"]) !== 0)
  throw Error("Quiet window-policy verification failed.");
copyFileSync(
  path.join(root, "artifacts/quiet/results.json"),
  path.join(output, "window-policy.json"),
);
const source = path.join(root, "src/shared/state-update.ts");
const original = readFileSync(source, "utf8");
const line =
  "for (const entity of patch.changed) records.set(entity.iri, entity);";
if (original.split(line).length !== 2)
  throw Error(
    "Entity-patch mutation target changed; update the qualification deliberately.",
  );
try {
  writeFileSync(
    source,
    original.replace(
      line,
      "// #165 qualification: deliberately omit changed entity propagation.",
    ),
  );
  build();
  scenario("normal", true);
  scenario("quiet", true);
} finally {
  writeFileSync(source, original);
  build();
}
writeFileSync(
  path.join(output, "evidence.json"),
  JSON.stringify({ commit: process.env.GITHUB_SHA, evidence }, null, 2),
);
console.log(
  "Both modes passed unchanged assertions and detected the deliberately broken entity update.",
);
