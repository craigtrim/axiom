// #193: the dependency audit fails closed and accepts only listed advisories reached through the packaging tools.
import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptedAdvisories,
  dependencyRoots,
  reviewAudit,
} from "../../scripts/dependency-audit.mjs";

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
  for (const [name, [via, nodes = [`node_modules/${name}`]]] of Object.entries(
    vulnerable,
  )) {
    const severity =
      via.find((source) => typeof source === "object")?.severity ?? "moderate";
    vulnerabilities[name] = {
      name,
      severity,
      isDirect: false,
      via,
      effects: [],
      range: "*",
      nodes,
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
// The package-lock.json paths behind the 2026-10-31 advisories, with their dependents.
const tree = {
  "": {
    devDependencies: {
      "@electron/packager": "20.3.0",
      electron: "44.10.0",
      "electron-builder": "^26.15.3",
    },
  },
  "node_modules/@electron/packager": {
    dependencies: { "@electron/asar": "^4" },
  },
  "node_modules/@electron/asar": {
    dependencies: { glob: "^13", minimatch: "^10" },
  },
  "node_modules/glob": { dependencies: { minimatch: "^10" } },
  "node_modules/minimatch": {},
  "node_modules/electron": { dependencies: { "extract-zip": "^2" } },
  "node_modules/extract-zip": {},
  "node_modules/electron-builder": {
    dependencies: { "app-builder-lib": "26" },
  },
  "node_modules/app-builder-lib": {
    dependencies: { "@electron/asar": "3.4.1", minimatch: "^10" },
  },
  "node_modules/app-builder-lib/node_modules/@electron/asar": {
    dependencies: { glob: "^7", minimatch: "^3" },
  },
  "node_modules/app-builder-lib/node_modules/@electron/asar/node_modules/minimatch":
    {},
  "node_modules/app-builder-lib/node_modules/glob": {
    dependencies: { minimatch: "^3" },
  },
  "node_modules/app-builder-lib/node_modules/glob/node_modules/minimatch": {},
};
const lock = { lockfileVersion: 3, packages: tree };
const glob = advisory("GHSA-3g3m-2fjr-6pw4", "glob"),
  minimatch = advisory("GHSA-g3hv-75wg-m249", "minimatch"),
  // Today's full-tree report, without the entries that only repeat these
  // advisories through other packages.
  today = {
    glob: [
      [glob, "minimatch"],
      ["node_modules/app-builder-lib/node_modules/glob", "node_modules/glob"],
    ],
    minimatch: [
      [minimatch],
      [
        "node_modules/app-builder-lib/node_modules/@electron/asar/node_modules/minimatch",
        "node_modules/app-builder-lib/node_modules/glob/node_modules/minimatch",
        "node_modules/minimatch",
      ],
    ],
    "@electron/asar": [
      ["glob", "glob", "minimatch"],
      [
        "node_modules/@electron/asar",
        "node_modules/app-builder-lib/node_modules/@electron/asar",
      ],
    ],
  },
  clean = report();
const ids = (lines) => lines.map((line) => line.match(/GHSA-[\w-]+/)[0]).sort();

test("accepts the two reviewed advisories through the packaging tools", () => {
  const result = reviewAudit(clean, report(today), lock);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    ids(result.accepted),
    Object.keys(acceptedAdvisories).sort(),
  );
  for (const line of result.accepted)
    assert.match(line, /Through (electron-builder|@electron\/packager) and /);
});

test("traces hoisted and nested copies to the direct dependencies", () => {
  assert.deepEqual(
    [...dependencyRoots(lock, ["node_modules/minimatch"])].sort(),
    ["@electron/packager", "electron-builder"],
  );
  assert.deepEqual(
    [
      ...dependencyRoots(lock, [
        "node_modules/app-builder-lib/node_modules/glob/node_modules/minimatch",
      ]),
    ],
    ["electron-builder"],
  );
});

test("fails on a new advisory in a build tool", () => {
  const result = reviewAudit(
    clean,
    report({
      ...today,
      "app-builder-lib": [[advisory("GHSA-aaaa-bbbb-cccc", "app-builder-lib")]],
    }),
    lock,
  );
  assert.deepEqual(ids(result.failures), ["GHSA-aaaa-bbbb-cccc"]);
  assert.match(result.failures[0], /^Not on the accepted list: /);
});

test("fails when an accepted advisory also reaches another dependency", () => {
  const widened = {
    ...lock,
    packages: {
      ...tree,
      "": {
        devDependencies: { ...tree[""].devDependencies, vitest: "^4" },
      },
      "node_modules/vitest": { dependencies: { minimatch: "^10" } },
    },
  };
  const result = reviewAudit(clean, report(today), widened);
  assert.deepEqual(ids(result.failures), ["GHSA-g3hv-75wg-m249"]);
  assert.match(result.failures[0], /reached through vitest: /);
  assert.deepEqual(ids(result.accepted), ["GHSA-3g3m-2fjr-6pw4"]);
});

test("fails when an accepted copy has no path to a direct dependency", () => {
  const stray = "node_modules/stray/node_modules/minimatch";
  const result = reviewAudit(
    clean,
    report({ ...today, minimatch: [[minimatch], [stray]] }),
    { ...lock, packages: { ...tree, [stray]: {} } },
  );
  assert.deepEqual(ids(result.failures), ["GHSA-g3hv-75wg-m249"]);
  assert.match(result.failures[0], /reached through no direct dependency: /);
});

test("never accepts an advisory that reaches Electron, which ships", () => {
  const result = reviewAudit(
    clean,
    report({
      "extract-zip": [[advisory("GHSA-eeee-ffff-gggg", "extract-zip")]],
    }),
    lock,
    { "GHSA-eeee-ffff-gggg": "Listed to test the packaging-tool limit." },
  );
  assert.deepEqual(ids(result.failures), ["GHSA-eeee-ffff-gggg"]);
  assert.match(result.failures[0], /reached through electron: /);
});

test("fails on a production advisory even when its ID is accepted", () => {
  const shipped = report({
    minimatch: [[advisory("GHSA-g3hv-75wg-m249", "minimatch", "high")]],
  });
  const result = reviewAudit(shipped, report(today), lock);
  assert.deepEqual(ids(result.failures), ["GHSA-g3hv-75wg-m249"]);
  assert.match(result.failures[0], /^Production dependency: /);
  assert.deepEqual(ids(result.accepted), ["GHSA-3g3m-2fjr-6pw4"]);
});

test("ignores low advisories, as --audit-level=moderate did", () => {
  const low = { jake: [[advisory("GHSA-dddd-eeee-ffff", "jake", "low")]] };
  const result = reviewAudit(report(low), report({ ...today, ...low }), lock);
  assert.deepEqual(result.failures, []);
});

test("warns instead of failing when an accepted advisory stops matching", () => {
  const result = reviewAudit(
    clean,
    report({ minimatch: today.minimatch }),
    lock,
  );
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
  assert.throws(
    () => reviewAudit(timeout, report(today), lock),
    /network timeout/,
  );
  assert.throws(() => reviewAudit(clean, timeout, lock), /network timeout/);
  assert.throws(
    () => reviewAudit(clean, { auditReportVersion: 2 }, lock),
    /no audit report/,
  );
  assert.throws(() => reviewAudit(clean, null, lock), /no audit report/);
});

test("fails when package-lock.json cannot trace a vulnerable copy", () => {
  const stale = {
    ...today,
    minimatch: [[minimatch], ["node_modules/filelist/node_modules/minimatch"]],
  };
  assert.throws(
    () => reviewAudit(clean, report(stale), lock),
    /package-lock\.json does not list node_modules\/filelist/,
  );
  assert.throws(
    () => reviewAudit(clean, report(today), {}),
    /package-lock\.json has no package tree/,
  );
});
