// #193: the dependency audit fails closed and accepts only listed build-tool advisories.
import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptedAdvisories,
  reviewAudit,
} from "../../scripts/check-dependency-audit.mjs";

// Shaped like npm audit --json (report version 2) from npm 10.
const advisory = (id, name, severity = "moderate") => ({
  source: 1244013,
  name,
  dependency: name,
  title: `${name} advisory`,
  url: `https://github.com/advisories/${id}`,
  severity,
  cwe: ["CWE-400"],
  cvss: { score: 0, vectorString: null },
  range: "<99.0.0",
});
function report(vulnerable = {}) {
  const vulnerabilities = {},
    counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const [name, via] of Object.entries(vulnerable)) {
    const severity =
      via.find((source) => typeof source === "object")?.severity ?? "moderate";
    vulnerabilities[name] = {
      name,
      severity,
      isDirect: false,
      via,
      effects: [],
      range: "*",
      nodes: [`node_modules/${name}`],
      fixAvailable: false,
    };
    counts[severity]++;
    counts.total++;
  }
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: counts, dependencies: {} },
  };
}
const glob = advisory("GHSA-3g3m-2fjr-6pw4", "glob"),
  minimatch = advisory("GHSA-g3hv-75wg-m249", "minimatch"),
  // The full-tree report for this repository on 2026-10-31, without the
  // entries that only repeat these advisories through other packages.
  today = {
    glob: [glob, "minimatch"],
    minimatch: [minimatch],
    "@electron/asar": ["glob", "glob", "minimatch"],
    "app-builder-lib": ["@electron/asar", "@electron/universal", "minimatch"],
  },
  clean = report();
const ids = (lines) => lines.map((line) => line.match(/GHSA-[\w-]+/)[0]);

test("accepts the two reviewed packaging advisories", () => {
  const result = reviewAudit(clean, report(today));
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(ids(result.accepted), Object.keys(acceptedAdvisories));
});

test("fails on a new advisory in a build tool", () => {
  const result = reviewAudit(
    clean,
    report({ ...today, ejs: [advisory("GHSA-aaaa-bbbb-cccc", "ejs")] }),
  );
  assert.deepEqual(ids(result.failures), ["GHSA-aaaa-bbbb-cccc"]);
  assert.match(result.failures[0], /^Not on the accepted list: .*\(ejs\)/);
});

test("fails on a production advisory even when its ID is accepted", () => {
  const shipped = report({
    minimatch: [advisory("GHSA-g3hv-75wg-m249", "minimatch", "high")],
  });
  const result = reviewAudit(shipped, report(today));
  assert.deepEqual(ids(result.failures), ["GHSA-g3hv-75wg-m249"]);
  assert.match(result.failures[0], /^Production dependency: /);
  assert.deepEqual(ids(result.accepted), ["GHSA-3g3m-2fjr-6pw4"]);
});

test("ignores low advisories, as --audit-level=moderate did", () => {
  const low = advisory("GHSA-dddd-eeee-ffff", "jake", "low");
  const result = reviewAudit(
    report({ jake: [low] }),
    report({ ...today, jake: [low] }),
  );
  assert.deepEqual(result.failures, []);
});

test("warns instead of failing when an accepted advisory stops matching", () => {
  const result = reviewAudit(clean, report({ minimatch: [minimatch] }));
  assert.deepEqual(result.failures, []);
  assert.deepEqual(ids(result.warnings), ["GHSA-3g3m-2fjr-6pw4"]);
  assert.match(result.warnings[0], /remove it from the accepted list/);
});

test("fails when npm cannot produce a report", () => {
  // npm 10 prints this when the registry does not answer.
  const timeout = {
    message:
      "network timeout at: http://127.0.0.1:9/-/npm/v1/security/audits/quick",
    error: { summary: "", detail: "" },
  };
  assert.throws(() => reviewAudit(timeout, report(today)), /network timeout/);
  assert.throws(() => reviewAudit(clean, timeout), /network timeout/);
  assert.throws(
    () => reviewAudit(clean, { auditReportVersion: 2 }),
    /no audit report/,
  );
  assert.throws(() => reviewAudit(clean, null), /no audit report/);
});
