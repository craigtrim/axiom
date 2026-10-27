// #165: a green runner must not hide omitted, skipped, failing or retried native cases.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  verifyNativeCoverage,
  type NativeReport,
} from "../../scripts/native-test-coverage";
function report(
  status = "passed",
  title = "a native journey",
  file = "example.spec.ts",
): NativeReport {
  return {
    suites: [
      {
        specs: [
          {
            id: title,
            title,
            file,
            tests: [
              {
                projectId: "",
                expectedStatus: status,
                status: status === "passed" ? "expected" : "skipped",
                results: [{ status }],
              },
            ],
          },
        ],
      },
    ],
  };
}
const benchmark = () =>
  report(
    "skipped",
    "large Source stays responsive while typing and scrolling",
    "syntax-large-source.spec.ts",
  );
describe("native CI coverage accounting", () => {
  it("refuses native execution outside GitHub Actions before launching tests", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/test-native-ci.mjs", "1"],
      {
        env: { ...process.env, GITHUB_ACTIONS: "false" },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Native UI coverage requires a GitHub-hosted Windows runner",
    );
  });
  it("accounts for every case and names the existing opt-in benchmark", () => {
    const inventory = { suites: [...report().suites, ...benchmark().suites] };
    expect(verifyNativeCoverage(inventory, inventory)).toEqual({
      listed: 2,
      passed: 1,
      skipped: [
        {
          file: "syntax-large-source.spec.ts",
          title: "large Source stays responsive while typing and scrolling",
        },
      ],
    });
  });
  it("rejects an omitted test even when every executed test passed", () => {
    const inventory = {
      suites: [
        ...report().suites,
        ...report("passed", "another journey").suites,
      ],
    };
    expect(() => verifyNativeCoverage(inventory, report())).toThrow(
      "complete enumerated inventory",
    );
  });
  it("rejects an unexpected extra test", () => {
    expect(() =>
      verifyNativeCoverage(report(), {
        suites: [
          ...report().suites,
          ...report("passed", "another journey").suites,
        ],
      }),
    ).toThrow("complete enumerated inventory");
  });
  it("rejects missing runtime skips and expected-failure annotations", () => {
    for (const status of ["skipped", "failed", "timedOut", "interrupted"])
      expect(() => verifyNativeCoverage(report(), report(status))).toThrow(
        "did not pass once",
      );
  });
  it("rejects a retry that eventually passes", () => {
    const results = report();
    results.suites[0].specs![0].tests[0].results.unshift({ status: "failed" });
    expect(() => verifyNativeCoverage(report(), results)).toThrow(
      "did not pass once",
    );
  });
  it("rejects empty and duplicated inventories", () => {
    expect(() => verifyNativeCoverage({ suites: [] }, report())).toThrow(
      "empty or duplicate",
    );
    const duplicate = { suites: [...report().suites, ...report().suites] };
    expect(() => verifyNativeCoverage(duplicate, duplicate)).toThrow(
      "empty or duplicate",
    );
  });
});
