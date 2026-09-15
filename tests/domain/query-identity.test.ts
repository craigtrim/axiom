import { expect, it } from "vitest";
import { formatQuery, sameQueryContent } from "../../src/domain/query-format";

it.each([
  "select ?s where { ?s ?p ?o . } limit 10",
  'prefix ex: <https://example.test/#> select ?s where { ?s ex:name "Alpha Beta"@en . }',
  "select (count(*) as ?count) where { ?s ?p ?o } group by ?s order by desc(?count)",
  'select ?s where { ?s ?p ?o optional { ?s ?q ?v } filter(contains(lcase(str(?o)), "WHERE #  x")) }',
  'select ?value where { values ?value { """first\n  second""" 1.25 -3e2 true } }',
  "# heading\nselect ?s where { ?s a owl:Class . # keep comment\n} limit 5",
  String.raw`select ?s where { ?s ?p "\u0041" }`,
])("formatting preserves query identity: %s", (query) => {
  expect(sameQueryContent(query, formatQuery(query))).toBe(true);
});

it.each([
  [
    "select ?s where{?s ?p ?o}limit 10",
    "SELECT ?s\nWHERE { ?s ?p ?o }\nLIMIT 10",
  ],
  [
    "SELECT ?s WHERE {?s ?p ?o}",
    "# introduction\nSELECT ?s # projection\nWHERE {?s ?p ?o} # note",
  ],
  [
    "SELECT ?s WHERE {?s ?p ?o} # old note",
    "SELECT ?s WHERE {?s ?p ?o} # rewritten note",
  ],
  ["SELECT ?s\r\nWHERE {?s ?p ?o}", "SELECT\t?s\nWHERE {\t?s ?p ?o\t}"],
  [
    "SELECT ?s WHERE {?s ?p ?o} GROUP BY ?s ORDER BY ?s",
    "select ?s where { ?s ?p ?o } group\nby ?s order\tby ?s",
  ],
  [
    'SELECT ?s WHERE {?s ?p ?o FILTER(CONTAINS(STR(?o),"word"))}',
    'select ?s where { ?s ?p ?o filter(contains(str(?o),"word")) }',
  ],
])("ignores presentation-only changes: %s", (left, right) => {
  expect(sameQueryContent(left, right)).toBe(true);
  expect(sameQueryContent(right, left)).toBe(true);
});

it.each([
  ['SELECT ?s WHERE {?s ?p "Alpha"}', 'SELECT ?s WHERE {?s ?p "alpha"}'],
  ['SELECT ?s WHERE {?s ?p "a b"}', 'SELECT ?s WHERE {?s ?p "a  b"}'],
  ['SELECT ?s WHERE {?s ?p "a # b"}', 'SELECT ?s WHERE {?s ?p "a # c"}'],
  ['SELECT ?s WHERE {?s ?p """a\nb"""}', 'SELECT ?s WHERE {?s ?p """a\n b"""}'],
  ['SELECT ?s WHERE {?s ?p "1"}', "SELECT ?s WHERE {?s ?p 1}"],
  ['SELECT ?s WHERE {?s ?p "one"@en}', 'SELECT ?s WHERE {?s ?p "one"@fr}'],
  [
    'SELECT ?s WHERE {?s ?p "1"^^xsd:integer}',
    'SELECT ?s WHERE {?s ?p "1"^^xsd:decimal}',
  ],
  [
    "SELECT ?s WHERE {?s <https://example.test/Name> ?o}",
    "SELECT ?s WHERE {?s <https://example.test/name> ?o}",
  ],
  [
    "PREFIX ex: <https://a.test/> SELECT ?s WHERE {?s ex:p ?o}",
    "PREFIX ex: <https://b.test/> SELECT ?s WHERE {?s ex:p ?o}",
  ],
  ["SELECT ?s WHERE {?s ?p ?o}", "SELECT ?S WHERE {?S ?p ?o}"],
  ["SELECT ?s WHERE {?s ?p ?o} LIMIT 1", "SELECT ?s WHERE {?s ?p ?o} LIMIT 10"],
  [
    "SELECT ?s WHERE {?s ?p ?o} OFFSET 1",
    "SELECT ?s WHERE {?s ?p ?o} OFFSET 2",
  ],
  [
    "SELECT ?s WHERE {?s ?p ?o FILTER(?o > 1)}",
    "SELECT ?s WHERE {?s ?p ?o FILTER(?o >= 1)}",
  ],
  ["SELECT ?s WHERE {?s ?p ?o}", "SELECT DISTINCT ?s WHERE {?s ?p ?o}"],
  [
    "SELECT ?s WHERE {?s ?p ?o} ORDER BY ASC(?s)",
    "SELECT ?s WHERE {?s ?p ?o} ORDER BY DESC(?s)",
  ],
  ["SELECT ?s WHERE {?s ?p ?o}", "SELECT ?s WHERE {OPTIONAL {?s ?p ?o}}"],
  [
    "SELECT ?s WHERE {?s ?p ?o}",
    "SELECT ?s WHERE {?s ?p ?o # closing brace is commented out }",
  ],
  ["SELECT ?s WHERE {?s ?p ?o}", "SELECT ?s WHERE {"],
  ["SELECT ?s WHERE {?s ?p ?o}", "SELECT ?s WHERE {?s ?p ?o} ???"],
])("preserves meaningful edits and invalid drafts: %s", (left, right) => {
  expect(sameQueryContent(left, right)).toBe(false);
  expect(sameQueryContent(right, left)).toBe(false);
});
