// Run only the explicitly assigned desktop-sensitive cases on local Windows.
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readSource } from "./ci-build-gate.mjs";
import {
  localDesktopCases,
  localDesktopGrep,
  verifyLocalDesktopResults,
} from "./hybrid-test-policy.mjs";
const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (process.platform !== "win32" || process.env.GITHUB_ACTIONS === "true")
  throw Error("These required tests must run on the local Windows desktop.");
if (
  args.length &&
  (args.length !== 2 ||
    args[0] !== "--validation-id" ||
    !/^[a-f0-9-]{36}$/.test(args[1]))
)
  throw Error(
    "Use test:desktop:local, or --validation-id UUID for EXE delivery.",
  );
const validationId = args[1] ?? randomUUID();
const output = path.join(root, "artifacts/local-desktop");
mkdirSync(output, { recursive: true });
const receipt = path.join(output, "receipt.json"),
  results = path.join(output, "results.json"),
  inventory = path.join(output, "inventory.json");
rmSync(receipt, { force: true });
rmSync(results, { force: true });
const source = await readSource(root);
const env = { ...process.env, PLAYWRIGHT_HTML_OPEN: "never" };
for (const key of [
  "AXIOM_TEST_QUIET",
  "AXIOM_TEST_BACKGROUND",
  "AXIOM_TEST_EXE",
  "ELECTRON_RUN_AS_NODE",
])
  delete env[key];
function run(stepArgs, extra = {}) {
  const child = spawnSync(process.execPath, stepArgs, {
    cwd: root,
    env: { ...env, ...extra },
    windowsHide: true,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0)
    throw Error(
      "Local desktop validation failed; the previous executable is unchanged.",
    );
}
console.log(
  `Running ${localDesktopCases.length} required local desktop tests. Application windows may take focus.`,
);
// Validate/install the required native runtime before any visible test starts.
run(["scripts/setup-mutatoc.mjs"]);
run(["scripts/build.mjs"]);
const base = [
  "node_modules/@playwright/test/cli.js",
  "test",
  "--config=config/playwright.config.ts",
  "--grep",
  localDesktopGrep,
  "--forbid-only",
  "--retries=0",
  "--workers=1",
];
run([...base, "--list", "--reporter=json"], {
  PLAYWRIGHT_JSON_OUTPUT_FILE: inventory,
});
run([...base, "--reporter=list,json"], {
  PLAYWRIGHT_JSON_OUTPUT_FILE: results,
});
const reportBytes = readFileSync(results);
const coverage = verifyLocalDesktopResults(JSON.parse(reportBytes));
const current = await readSource(root);
if (JSON.stringify(current) !== JSON.stringify(source))
  throw Error("Source changed during local desktop validation.");
const proof = {
  schema: 1,
  validationId,
  source,
  ...coverage,
  completedAt: new Date().toISOString(),
  resultsSha256: createHash("sha256").update(reportBytes).digest("hex"),
};
writeFileSync(receipt, JSON.stringify(proof, null, 2) + "\n");
console.log(`Local desktop validation passed: ${coverage.passed} cases.`);
