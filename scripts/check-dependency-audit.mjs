// #193: run the dependency audit for CI; dependency-audit.mjs holds the rule and the accepted list.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { reviewAudit } from "./dependency-audit.mjs";

const root = path.resolve(import.meta.dirname, "..");
// GitHub Actions shows these prefixes as annotations on the run.
const annotate = (kind, line) =>
  console.log(process.env.GITHUB_ACTIONS ? `::${kind}::${line}` : line);
function audit(...flags) {
  const { stdout, stderr, error, signal } = spawnSync(
    ["npm audit --json", ...flags].join(" "),
    {
      cwd: root,
      shell: true,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (error || signal)
    throw Error(`npm audit did not finish: ${error?.message ?? signal}`);
  try {
    return JSON.parse(stdout);
  } catch {
    throw Error(`npm audit returned no report. ${stderr.trim()}`);
  }
}
try {
  const { failures, warnings, accepted } = reviewAudit(
    audit("--omit=dev"),
    audit(),
    JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8")),
  );
  for (const line of accepted) console.log(`Accepted ${line}`);
  for (const line of warnings) annotate("warning", line);
  for (const line of failures) annotate("error", line);
  if (failures.length)
    throw Error(
      `${failures.length} of the advisories above must be fixed or reviewed.`,
    );
  console.log("Dependency audit passed.");
} catch (error) {
  annotate("error", `DEPENDENCY AUDIT FAILED: ${error.message}`);
  process.exitCode = 1;
}
