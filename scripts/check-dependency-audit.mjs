// #193: audit production dependencies with no exceptions and accept only reviewed build-tool advisories.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
// Each entry names the package and why the advisory cannot reach a user.
export const acceptedAdvisories = {
  "GHSA-3g3m-2fjr-6pw4":
    "glob, installed only by electron-builder and @electron/packager; no caller passes the abort signal the advisory depends on.",
  "GHSA-g3hv-75wg-m249":
    "minimatch, installed only by electron-builder and @electron/packager, which match patterns from this repository.",
};
// The same threshold as npm audit --audit-level=moderate.
const blocking = new Set(["moderate", "high", "critical"]);

export function findings(report) {
  if (
    !report?.vulnerabilities ||
    !report.metadata?.vulnerabilities ||
    report.error
  )
    throw Error(
      `npm could not audit the dependencies: ${report?.message || report?.error?.summary || "no audit report"}`,
    );
  const found = new Map();
  for (const { via } of Object.values(report.vulnerabilities))
    for (const source of via)
      if (typeof source === "object" && blocking.has(source.severity)) {
        const id = String(source.url ?? source.source)
          .split("/")
          .at(-1);
        const advisory = found.get(id) ?? {
          id,
          title: source.title,
          packages: new Set(),
        };
        advisory.packages.add(source.name);
        found.set(id, advisory);
      }
  return [...found.values()];
}

export function reviewAudit(production, full, accepted = acceptedAdvisories) {
  const describe = ({ id, packages, title }) =>
    `${id} (${[...packages].join(", ")}): ${title}`;
  const failures = [],
    warnings = [],
    allowed = [],
    shipped = new Set();
  for (const advisory of findings(production)) {
    shipped.add(advisory.id);
    failures.push(`Production dependency: ${describe(advisory)}`);
  }
  const current = findings(full);
  for (const advisory of current)
    if (shipped.has(advisory.id)) continue;
    else if (Object.hasOwn(accepted, advisory.id))
      allowed.push(`${describe(advisory)}. ${accepted[advisory.id]}`);
    else failures.push(`Not on the accepted list: ${describe(advisory)}`);
  for (const id of Object.keys(accepted))
    if (!current.some((advisory) => advisory.id === id))
      warnings.push(
        `${id} no longer fails npm audit; remove it from the accepted list in scripts/check-dependency-audit.mjs.`,
      );
  return { failures, warnings, accepted: allowed };
}

function audit(...flags) {
  const { stdout, stderr } = spawnSync(
    ["npm audit --json", ...flags].join(" "),
    {
      cwd: root,
      shell: true,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    },
  );
  try {
    return JSON.parse(stdout);
  } catch {
    throw Error(`npm audit returned no report. ${stderr?.trim() ?? ""}`);
  }
}

function main() {
  const { failures, warnings, accepted } = reviewAudit(
    audit("--omit=dev"),
    audit(),
  );
  for (const line of accepted) console.log(`Accepted ${line}`);
  for (const line of warnings)
    console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : ""}${line}`);
  if (failures.length)
    throw Error(
      ["Advisories of moderate severity or higher:", ...failures].join("\n"),
    );
  console.log("Dependency audit passed.");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  try {
    main();
  } catch (error) {
    console.error(`\nDEPENDENCY AUDIT FAILED: ${error.message}`);
    process.exitCode = 1;
  }
