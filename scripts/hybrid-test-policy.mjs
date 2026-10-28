// Required native cases assigned to Craig's local Windows desktop.
// CI runs the exact complement; neither group is optional for delivery.
export const localDesktopCases = [
  {
    file: "hierarchy-visual.spec.ts",
    title: "light frame 27 matches raw reference pixels",
  },
  {
    file: "hierarchy-visual.spec.ts",
    title: "dark frame 27 matches raw reference pixels",
  },
  {
    file: "quality-visual.spec.ts",
    title: "light a2-running-bar",
  },
  {
    file: "quality-visual.spec.ts",
    title: "dark a2-running-bar",
  },
  {
    file: "text-analysis.spec.ts",
    title: "#128 plain highlight clicks keep the caret and focus with Auto on",
  },
  {
    file: "text-analysis.spec.ts",
    title: "#128 plain highlight clicks keep the caret and focus with Auto off",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "light frame 14 matches raw reference pixels",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "light frame 15 matches raw reference pixels",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "dark frame 14 matches raw reference pixels",
  },
  {
    file: "touchpoints-visual.spec.ts",
    title: "dark frame 15 matches raw reference pixels",
  },
  {
    file: "window-chrome.spec.ts",
    title:
      "menus share native state and support keyboard navigation, compact folds, scrolling and the palette",
  },
];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const localDesktopGrep = localDesktopCases
  .map(({ file, title }) => escape(file) + ".*" + escape(title) + "$")
  .join("|");
export function verifyLocalDesktopResults(report) {
  const actual = [];
  function walk(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          if (
            test.expectedStatus !== "passed" ||
            test.status !== "expected" ||
            test.results?.length !== 1 ||
            test.results[0].status !== "passed"
          )
            throw Error(
              "Local desktop test must pass once without retries or skips: " +
                spec.file +
                " > " +
                spec.title,
            );
          actual.push(JSON.stringify([spec.file, spec.title]));
        }
      walk(suite.suites);
    }
  }
  walk(report.suites);
  const expected = localDesktopCases.map(({ file, title }) =>
    JSON.stringify([file, title]),
  );
  if (
    JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort()) ||
    report.errors?.length
  )
    throw Error(
      "Local desktop results do not contain the complete required inventory.",
    );
  return { listed: actual.length, passed: actual.length, skipped: [] };
}
