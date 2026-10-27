// #165: native CI must execute its enumerated inventory, with one existing opt-in benchmark exception.
type Result = { status: string };
type Case = {
  projectId: string;
  expectedStatus: string;
  status: string;
  results: Result[];
};
type Spec = { id: string; file: string; title: string; tests: Case[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };
export type NativeReport = { suites: Suite[] };
function cases(report: NativeReport) {
  const found: (Case & { key: string; file: string; title: string })[] = [];
  function visit(suites: Suite[]) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests)
          found.push({
            ...test,
            key: spec.id + ":" + test.projectId,
            file: spec.file,
            title: spec.title,
          });
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  if (
    !found.length ||
    new Set(found.map((test) => test.key)).size !== found.length
  )
    throw Error("Native report has an empty or duplicate inventory.");
  return found;
}
export function verifyNativeCoverage(
  inventory: NativeReport,
  results: NativeReport,
) {
  const planned = cases(inventory),
    actual = cases(results);
  const identities = (tests: typeof planned) =>
    tests
      .map(({ key, file, title }) => JSON.stringify([key, file, title]))
      .sort();
  if (
    JSON.stringify(identities(planned)) !== JSON.stringify(identities(actual))
  )
    throw Error(
      "Native execution did not account for the complete enumerated inventory.",
    );
  const skipped: { file: string; title: string }[] = [];
  for (const test of actual) {
    if (
      test.file === "syntax-large-source.spec.ts" &&
      test.title ===
        "large Source stays responsive while typing and scrolling" &&
      test.expectedStatus === "skipped" &&
      test.status === "skipped" &&
      test.results.length === 1 &&
      test.results[0].status === "skipped"
    ) {
      skipped.push({ file: test.file, title: test.title });
      continue;
    }
    if (
      test.expectedStatus !== "passed" ||
      test.status !== "expected" ||
      test.results.length !== 1 ||
      test.results[0].status !== "passed"
    )
      throw Error(
        "Native test did not pass once without retries or skips: " +
          test.file +
          " > " +
          test.title,
      );
  }
  return {
    listed: planned.length,
    passed: actual.length - skipped.length,
    skipped,
  };
}
