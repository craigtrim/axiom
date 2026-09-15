import fs from "node:fs";
import { describe, it, expect } from "vitest";
import {
  cases,
  queryText,
  queryFile,
  checkEvaluation,
  checkSyntax,
  checkUpdate,
  checkCsv,
} from "../conformance/w3c-harness";
import { formatQuery } from "../../src/domain/query-format";
const corpus = cases();
const excluded = new Set([
  "entailment",
  "service",
  "service-description",
  "protocol",
  "graph-store-protocol",
  "http-rdf-update",
]);
const reason = (c: (typeof corpus)[number]) =>
  c.suite.split("/").find((part) => excluded.has(part)) ??
  (["LOAD SILENT", "LOAD SILENT INTO"].includes(c.name)
    ? "remote LOAD"
    : undefined);
const local = corpus.filter((c) => !reason(c));
const types = [
  "QueryEvaluationTest",
  "UpdateEvaluationTest",
  "PositiveSyntaxTest",
  "NegativeSyntaxTest",
  "PositiveSyntaxTest11",
  "NegativeSyntaxTest11",
  "PositiveUpdateSyntaxTest11",
  "NegativeUpdateSyntaxTest11",
  "CSVResultFormatTest",
];
it("inventories every W3C manifest entry with an explicit scope", () => {
  expect(corpus.length).toBeGreaterThan(1000);
  for (const c of local) expect(types).toContain(c.type);
  const inventory = corpus.map((c) => ({
    id: c.id.replace(/^file:.*?\/w3c\//, ""),
    suite: c.suite,
    name: c.name,
    type: c.type,
    scope: reason(c) ?? "local",
  }));
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(
    "artifacts/sparql-coverage.json",
    JSON.stringify(
      {
        source: "https://github.com/w3c/rdf-tests",
        commit: "369a90d1a60c021b746df2e411da0ff36258a758",
        total: corpus.length,
        local: local.length,
        byType: Object.fromEntries(
          types.map((t) => [t, local.filter((c) => c.type === t).length]),
        ),
        excluded: corpus.length - local.length,
        inventory,
      },
      null,
      2,
    ),
  );
});
for (const suite of [...new Set(local.map((c) => c.suite))])
  describe(suite, () => {
    for (const c of local.filter((c) => c.suite === suite)) {
      if (
        c.type === "QueryEvaluationTest" ||
        c.type === "CSVResultFormatTest"
      ) {
        const check =
          c.type === "CSVResultFormatTest" ? checkCsv : checkEvaluation;
        it(c.name, () => check(c));
        it(c.name + " after formatting", () =>
          check(c, formatQuery(queryText(c), queryFile(c))),
        );
      } else if (c.type.includes("Syntax")) it(c.name, () => checkSyntax(c));
      else if (c.type === "UpdateEvaluationTest")
        it(c.name, () => checkUpdate(c));
    }
  });
