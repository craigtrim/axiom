import { describe, it, expect } from "vitest";
import { Store as RdfStore, Parser, DataFactory } from "n3";
import { evaluateQuery, queryStore } from "../../src/domain/query";
import { parseRdf } from "../../src/domain/rdf-io";
import { formatQuery } from "../../src/domain/query-format";
import { NS, termDatatype } from "../../src/domain/model";
const xsd = NS.xsd;
const typed: [string, string][] = [
  ["string", ""],
  ["string", "SELECT # WHERE { ?x }"],
  ["string", "中文 العربية café 🧀"],
  ["boolean", "true"],
  ["boolean", "false"],
  ["boolean", "1"],
  ["boolean", "0"],
  ["integer", "0"],
  ["integer", "+001"],
  ["integer", "-0007"],
  ["integer", "9007199254740993"],
  ["integer", "1234567890123456789012345678901234567890"],
  ["nonPositiveInteger", "0"],
  ["negativeInteger", "-1"],
  ["long", "9223372036854775807"],
  ["int", "2147483647"],
  ["short", "32767"],
  ["byte", "127"],
  ["nonNegativeInteger", "0"],
  ["unsignedLong", "18446744073709551615"],
  ["unsignedInt", "4294967295"],
  ["unsignedShort", "65535"],
  ["unsignedByte", "255"],
  ["positiveInteger", "1"],
  ["decimal", "+0001.2300"],
  ["decimal", "-0.000"],
  ["decimal", "12345678901234567890.12345678901234567890"],
  ["float", "1.0E-3"],
  ["float", "INF"],
  ["float", "-INF"],
  ["float", "NaN"],
  ["double", "-0.0E0"],
  ["double", "1.7976931348623157E308"],
  ["double", "INF"],
  ["double", "-INF"],
  ["double", "NaN"],
  ["dateTime", "2024-02-29T23:59:59.123456Z"],
  ["dateTime", "2024-01-01T00:00:00+05:30"],
  ["dateTime", "2024-01-01T00:00:00-08:00"],
  ["dateTime", "2024-01-01T00:00:00"],
  ["dateTimeStamp", "2024-01-01T00:00:00Z"],
  ["date", "2024-02-29"],
  ["date", "2024-02-29Z"],
  ["time", "12:34:56.1200+05:30"],
  ["duration", "P1Y2M3DT4H5M6S"],
  ["dayTimeDuration", "PT3600S"],
  ["yearMonthDuration", "P12M"],
  ["gYearMonth", "2024-02"],
  ["gYear", "2024"],
  ["gMonthDay", "--02-29"],
  ["gDay", "---31"],
  ["gMonth", "--12"],
  ["hexBinary", "aB00ff"],
  ["base64Binary", "YWJj"],
  ["anyURI", "https://example.test/a%20b"],
  ["normalizedString", "a b"],
  ["token", "alpha beta"],
  ["language", "en-GB"],
  ["Name", "Alpha:Beta"],
  ["NCName", "Alpha_Beta"],
  ["NMTOKEN", "Alpha-Beta"],
  ["ID", "node1"],
  ["IDREF", "node1"],
  // RDF permits ill-typed literals; importing and displaying them must not silently coerce them.
  ["integer", "not-an-integer"],
  ["boolean", "not-a-boolean"],
  ["dateTime", "not-a-date"],
  ["double", "not-a-number"],
];
const samples = typed.map(([type, value]) => ({
  name: type + " " + JSON.stringify(value),
  value,
  datatype: xsd + type,
  language: undefined as string | undefined,
}));
for (const language of [
  "en",
  "EN",
  "en-GB",
  "fr",
  "zh-Hant-TW",
  "es-419",
  "de-CH-1901",
])
  samples.push({
    name: "language " + language,
    value: "café 🧀",
    datatype: NS.rdf + "langString",
    language,
  });
for (const [datatype, value] of [
  [
    NS.rdf + "XMLLiteral",
    '<p xmlns="http://www.w3.org/1999/xhtml">Hello &amp; goodbye</p>',
  ],
  [NS.rdf + "HTML", "<strong>hello</strong>"],
  [NS.rdf + "JSON", '{"x":1,"y":null}'],
  ["urn:datatype:custom", "not a number 001"],
  ["https://example.test/type", "é"],
])
  samples.push({ name: datatype, value, datatype, language: undefined });
describe("RDF literal fidelity through import, query and formatting", () => {
  it.each(samples)("$name", async ({ value, datatype, language }) => {
    const term =
      JSON.stringify(value) +
      (language ? "@" + language : "^^<" + datatype + ">");
    const imported = await parseRdf(
      "<urn:s> <urn:p> " + term + " .",
      "literals.ttl",
      "urn:fixture:",
    );
    const store = queryStore(imported.triples);
    const query =
      "select ?value (str(?value) as ?lexical) (datatype(?value) as ?datatype) (lang(?value) as ?language) where { <urn:s> <urn:p> ?value }";
    const result = await evaluateQuery(store, formatQuery(query));
    expect(result.rows).toHaveLength(1);
    const [raw, lex, dt, lang] = result.rows[0];
    expect(raw?.value).toBe(value);
    expect(raw?.literal).toBe(true);
    expect(termDatatype(raw!)).toBe(datatype);
    expect(raw?.language ?? "").toBe(language?.toLowerCase() ?? "");
    expect(lex?.value).toBe(value);
    expect(dt?.value).toBe(datatype);
    expect(lang?.value).toBe(language?.toLowerCase() ?? "");
  });
});
const queryLiterals: [string, string][] = [
  ['"plain"', "plain"],
  ["'single'", "single"],
  ['"""line\none"""', "line\none"],
  ["'''line\none'''", "line\none"],
  ['"\\t\\b\\n\\r\\f"', "\t\b\n\r\f"],
  ['"\\\"quoted\\\" \\\\ path"', '"quoted" \\ path'],
  ['"\\u00E9"', "é"],
  ['"\\U0001F355"', "🍕"],
  ['"e\\u0301"', "é"],
  ['"日本語"', "日本語"],
  ['"WHERE SELECT # < > { }"', "WHERE SELECT # < > { }"],
  ['"leading and trailing  "', "leading and trailing  "],
  ['""', ""],
];
describe("SPARQL literal lexical syntax", () => {
  it.each(queryLiterals)("%s", async (syntax, value) => {
    const query = "select (" + syntax + " as ?value) where {}";
    const formatted = formatQuery(query);
    expect(
      (await evaluateQuery(new RdfStore(), formatted)).rows[0][0]?.value,
    ).toBe(value);
    expect(formatQuery(formatted)).toBe(formatted);
  });
});
const expressions: [string, string | null][] = [
  ['STRSTARTS("AmericanHot", "American")', "true"],
  ['STRENDS("AmericanHot", "Hot")', "true"],
  ['CONTAINS("Course Credit", "Credit")', "true"],
  ['STRLEN("A🧀é")', "3"],
  ['SUBSTR("A🧀é", 2, 1)', "🧀"],
  ['UCASE("alpha")', "ALPHA"],
  ['LCASE("AMERICAN")', "american"],
  ['STRBEFORE("alpha:beta", ":")', "alpha"],
  ['STRAFTER("alpha:beta", ":")', "beta"],
  ['CONCAT("alpha", " ", "beta")', "alpha beta"],
  ['ENCODE_FOR_URI("a b/é")', "a%20b%2F%C3%A9"],
  ['REGEX("AmericanHot", "^american", "i")', "true"],
  ['REPLACE("Alpha Beta !! Gamma", "[^A-Za-z]", "")', "AlphaBetaGamma"],
  ['LANGMATCHES("en-GB", "en")', "true"],
  ['STR(STRLANG("hello", "en"))', "hello"],
  ['DATATYPE(STRDT("001", xsd:integer))', xsd + "integer"],
  ['sameTerm("01"^^xsd:integer, "1"^^xsd:integer)', "false"],
  ['"01"^^xsd:integer = "1"^^xsd:integer', "true"],
  ["ISIRI(<urn:x>)", "true"],
  ["ISBLANK(BNODE())", "true"],
  ["ISLITERAL(3)", "true"],
  ["ISNUMERIC(3.5)", "true"],
  ['STR(IRI("urn:example"))', "urn:example"],
  ['COALESCE(?missing, "fallback")', "fallback"],
  ['IF(true, "yes", 1/0)', "yes"],
  ["BOUND(?missing)", "false"],
  ["2 IN (1,2,3)", "true"],
  ["2 NOT IN (1,3)", "true"],
  ["ABS(-7)", "7"],
  ["CEIL(1.2)", "2.0"],
  ["FLOOR(1.8)", "1.0"],
  ["ROUND(-1.5)", "-1.0"],
  ["1 + 2 * 3", "7"],
  ["(1 + 2) * 3", "9"],
  ['xsd:integer("42")', "42"],
  ['xsd:boolean("true")', "true"],
  ["xsd:string(42)", "42"],
  ['YEAR("2024-02-29T12:34:56Z"^^xsd:dateTime)', "2024"],
  ['MONTH("2024-02-29T12:34:56Z"^^xsd:dateTime)', "2"],
  ['DAY("2024-02-29T12:34:56Z"^^xsd:dateTime)', "29"],
  ['HOURS("2024-02-29T12:34:56Z"^^xsd:dateTime)', "12"],
  ['MINUTES("2024-02-29T12:34:56Z"^^xsd:dateTime)', "34"],
  ['SECONDS("2024-02-29T12:34:56Z"^^xsd:dateTime)', "56.0"],
  ['TZ("2024-02-29T12:34:56+05:30"^^xsd:dateTime)', "+05:30"],
  ['MD5("abc")', "900150983cd24fb0d6963f7d28e17f72"],
  ['SHA1("abc")', "a9993e364706816aba3e25717850c26c9cd0d89d"],
  [
    'SHA256("abc")',
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  ],
  ["1/0", null],
  ['xsd:integer("bad")', null],
  ["STR(?missing)", null],
];
describe("standard functions and expression errors", () => {
  it.each(expressions)("%s", async (expression, want) => {
    const result = await evaluateQuery(
      new RdfStore(),
      formatQuery("select (" + expression + " as ?value) where {}"),
    );
    expect(result.columns).toEqual(["?value"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][0]?.value ?? null).toBe(want);
  });
});
it("keeps distinct language tags and datatypes through REDUCED", async () => {
  const result = await evaluateQuery(
    new RdfStore(),
    'SELECT REDUCED ?v WHERE { VALUES ?v { "x" "x"@en "x"@fr "x"^^<urn:custom> "x" } }',
  );
  expect(result.rows).toHaveLength(4);
});
it("preserves unbound OPTIONAL values and empty-result columns", async () => {
  const store = new RdfStore(new Parser().parse('<urn:s> <urn:p> "x".'));
  const query =
    "SELECT ?s ?label WHERE {?s <urn:p> ?v OPTIONAL {?s <urn:label> ?label}}";
  expect((await evaluateQuery(store, query)).rows[0][1]).toBeNull();
  expect((await evaluateQuery(store, query + " LIMIT 0")).columns).toEqual([
    "?s",
    "?label",
  ]);
});
it("caps final solutions without truncating aggregate input", async () => {
  const store = new RdfStore(
    Array.from({ length: 30 }, (_, i) =>
      DataFactory.quad(
        DataFactory.namedNode("urn:s:" + i),
        DataFactory.namedNode("urn:p"),
        DataFactory.literal(String(i)),
      ),
    ),
  );
  expect(
    (
      await evaluateQuery(
        store,
        "SELECT (COUNT(*) AS ?n) WHERE {?s ?p ?o}",
        0,
        { cap: 5 },
      )
    ).rows[0][0]?.value,
  ).toBe("30");
  const page = await evaluateQuery(
    store,
    "SELECT ?s WHERE {?s ?p ?o} ORDER BY ?s",
    0,
    { cap: 5 },
  );
  expect(page.rows).toHaveLength(5);
  expect(page.capped).toBe(true);
});
