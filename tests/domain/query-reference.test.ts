import { expect, it } from "vitest";
import { validateQueryProposal } from "../../src/main/query-assistant-service";
import {
  extractQueryProposal,
  QueryProposalError,
} from "../../src/shared/query-assistant";
import { queryContext, queryFields } from "../../src/domain/query-context";
import { buildEmptyStore } from "../../src/domain/workspace";
import { QueryGridView } from "../../src/domain/query-grid";
import { queryColumnReason } from "../../src/shared/query-grid";
import { writeQueryFields } from "../../src/shared/query-fields";
import { parseQuery } from "../../src/domain/query-parser";
import { NS, literal, type Term } from "../../src/domain/model";
import type { QueryResult } from "../../src/domain/query";

// craigtrim/axiom#88: exercise validation scope, full-result ordering, and deterministic authoring.
const context = queryContext(buildEmptyStore(), "", 0);
it.each([
  ["SELECT ?who WHERE { ?course rdfs:label ?name }", "who"],
  ["SELECT ?hidden WHERE { { SELECT ?s WHERE { ?s ?p ?hidden } } }", "hidden"],
  ["SELECT ?x WHERE { ?s ?p ?o FILTER EXISTS { ?s ?p ?x } }", "x"],
  ["SELECT ?x WHERE { ?s ?p ?o MINUS { ?s ?p ?x } }", "x"],
  ["SELECT ?x WHERE { ?s ?p ?o FILTER(?x = 1) }", "x"],
])(
  "rejects projected variables that the output pattern never binds: %s",
  (query, variable) => {
    expect(validateQueryProposal(query, context)).toBe(
      `The projection selects ?${variable}, which the pattern never binds.`,
    );
  },
);
it.each([
  "SELECT * WHERE { ?s ?p ?o }",
  "SELECT ?x WHERE { OPTIONAL { ?s ?p ?x } }",
  "SELECT ?x WHERE { { ?s ?p ?x } UNION { ?a ?b ?x } }",
  "SELECT ?x WHERE { BIND(42 AS ?x) }",
  "SELECT ?x WHERE {} VALUES ?x { 1 2 }",
  "SELECT ?x WHERE { VALUES ?x { 1 2 } }",
  "SELECT ?g WHERE { GRAPH ?g { ?s ?p ?o } }",
  "SELECT ?x WHERE { { SELECT (COUNT(*) AS ?x) WHERE { ?s ?p ?o } } }",
  "SELECT ?o WHERE { { SELECT * WHERE { ?s ?p ?o } } }",
  "SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }",
  "SELECT ?group WHERE { ?s ?p ?o } GROUP BY (STR(?s) AS ?group)",
])("retains supported binding constructs: %s", (query) => {
  expect(validateQueryProposal(query, context)).toBeNull();
});
it("names invented terms as written and preserves the standard-namespace exemptions", () => {
  expect(
    validateQueryProposal(
      "PREFIX ax: <urn:course:> SELECT ?s WHERE {?s a ax:Instructor}",
      context,
    ),
  ).toBe(
    "ax:Instructor is not in the context Axiom sent, so it was not checked against the ontology.",
  );
  expect(
    validateQueryProposal("SELECT ?s WHERE {?s <urn:missing> ?o}", context),
  ).toBe(
    "<urn:missing> is not in the context Axiom sent, so it was not checked against the ontology.",
  );
  expect(
    validateQueryProposal("SELECT ?s WHERE {?s a owl:Class}", context),
  ).toBeNull();
  expect(validateQueryProposal("DELETE WHERE {?s ?p ?o}", context)).toBe(
    "That is an update, not a query. This panel never writes to the ontology.",
  );
});
const proposal = {
  status: "query",
  sparql: "ASK {}",
  explanation: "Checks the store.",
  assumptions: [],
};
it.each([
  [
    "```sparql\nASK {}\n```\n```sparql\nASK {}\n```",
    "The response carried more than one code block.",
  ],
  ["No query here.", "No SPARQL query was found in the response."],
  [
    { ...proposal, status: "other" },
    "The status was not one of query or unsupported.",
  ],
  [
    { ...proposal, status: ["query"] },
    "The status was not one of query or unsupported.",
  ],
  [{ ...proposal, explanation: "" }, "No explanation was returned."],
  [
    { ...proposal, explanation: "x".repeat(12001) },
    "The explanation exceeded its length bound.",
  ],
  [
    { ...proposal, status: "unsupported" },
    "An unsupported response carried runnable query text.",
  ],
  [
    { ...proposal, sparql: "" },
    "The status was query but no SPARQL was returned.",
  ],
])(
  "returns a distinct, sentence-form refusal for malformed proposals %#",
  (input, message) => {
    expect(() => extractQueryProposal(input)).toThrow(QueryProposalError);
    expect(() => extractQueryProposal(input)).toThrow(message as string);
  },
);
it("counts omitted predicates and keeps the unbounded Fields catalogue separate", () => {
  const store = buildEmptyStore();
  store.tbox = Array.from({ length: 125 }, (_, i) => ({
    subject: "urn:s",
    predicate: `urn:p${i}`,
    object: literal("value"),
  }));
  const bounded = queryContext(store, "", 9),
    fields = queryFields(store, 9);
  expect(bounded.predicates).toHaveLength(120);
  expect(bounded.omittedPredicates).toBe(5);
  expect(fields.predicates).toHaveLength(125);
});
function result(rows: (Term | null)[][]): QueryResult {
  return {
    queryType: "SELECT",
    columns: ["?value", "?name", "?empty"],
    rows,
    total: rows.length,
    capped: false,
    iris: [],
    milliseconds: 1,
    storeVersion: 1,
  };
}
it("sorts the complete result numerically, with blanks last and stable ties across blocks", () => {
  const rows = Array.from({ length: 250 }, (_, i) => [
    literal(249 - i, "integer"),
    literal(String(i)),
    null,
  ]);
  rows.push(
    [null, literal("unbound"), null],
    [literal(1, "integer"), literal("tie"), null],
  );
  const view = new QueryGridView(
    result(rows),
    "SELECT ?value ?name ?empty WHERE {}",
  );
  expect(view.columns[0]).toMatchObject({ fill: 251, distinct: 250 });
  expect(
    view.page(0, 3, { column: 0, direction: "asc" }).map((r) => r[0]?.value),
  ).toEqual(["0", "1", "1"]);
  expect(
    view
      .page(100, 102, { column: 0, direction: "asc" })
      .map((r) => r[0]?.value),
  ).toEqual(["99", "100"]);
  expect(
    view
      .page(248, 252, { column: 0, direction: "desc" })
      .map((r) => r[1]?.value),
  ).toEqual(["248", "tie", "249", "unbound"]);
  expect(rows[0][0]?.value).toBe("249");
  expect(queryColumnReason(view.columns[2], 252)).toBe("empty");
});
it("keeps RDF identity in the census and quotes every retained CSV row in shown order", () => {
  const rows = [
    [literal("2", "integer"), literal('a,"b"\nc'), null],
    [literal("2"), { value: "urn:course:Marketing", literal: false }, null],
    [null, literal(""), null],
  ];
  const view = new QueryGridView(
    result(rows),
    "PREFIX ax: <urn:course:> SELECT * WHERE {?s ?p ?o}",
  );
  expect(view.columns[0]).toMatchObject({ fill: 2, distinct: 2 });
  expect(view.columns[1].fill).toBe(3);
  expect(view.csv([1, 0, 2])).toBe(
    '?name,?value,?empty\r\n"a,""b""\nc",2,\r\nax:Marketing,2,\r\n,,\r\n',
  );
  expect(() => view.csv([])).toThrow("at least one");
});
it("Fields writes a bounded query with escaped values and optional lines", () => {
  const fields = {
    datasetEpoch: 0,
    version: 1,
    namespace: "urn:course:",
    classes: [{ iri: "urn:course:Marketing", label: "Marketing" }],
    predicates: [{ iri: NS.rdfs + "label", count: 12 }],
  };
  const query = writeQueryFields(fields, {
    subject: "urn:course:Marketing",
    predicate: NS.rdfs + "label",
    value: 'Ad"vert\\line\nnext',
    limit: "50",
  });
  expect(query).toContain("?s rdfs:subClassOf :Marketing .");
  expect(query).toContain('FILTER(CONTAINS(?value, "Advert\\\\line\\nnext"))');
  expect(query).toMatch(/LIMIT 50$/);
  expect(() => parseQuery(query)).not.toThrow();
  const plain = writeQueryFields(fields, {
    subject: "",
    predicate: NS.rdfs + "label",
    value: "",
    limit: "1.5",
  });
  expect(plain).not.toMatch(/subClassOf|FILTER|LIMIT/);
});
