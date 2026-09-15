import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Parser, Store, DataFactory, Writer } from "n3";
import type { Term, Quad } from "@rdfjs/types";
import { SaxesParser } from "saxes";
import { canonize } from "rdf-canonize";
import { RdfXmlParser } from "rdfxml-streaming-parser";
import { expect } from "vitest";
import {
  evaluateQuery,
  queryEngine,
  localQueryContext,
} from "../../src/domain/query";
import { parseQuery, parseSparql } from "../../src/domain/query-parser";
import type { Term as AxiomTerm } from "../../src/domain/model";
const { namedNode: nn, blankNode: bn, literal: lit, quad } = DataFactory;
export const MF = "http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RS = "http://www.w3.org/2001/sw/DataAccess/tests/result-set#";
const QT = "http://www.w3.org/2001/sw/DataAccess/tests/test-query#";
const UT = "http://www.w3.org/2009/sparql/tests/test-update#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const root = path.resolve("tests/conformance/w3c");
const read = (url: string) => fs.readFileSync(fileURLToPath(url), "utf8");
const all = (s: Store, node: Term, predicate: string) =>
  s.getObjects(node, nn(predicate), null);
const one = (s: Store, node: Term, predicate: string) =>
  all(s, node, predicate)[0];
export interface Case {
  id: string;
  name: string;
  suite: string;
  type: string;
  manifest: Store;
  action: Term;
  result?: Term;
  url: string;
}
export function cases(): Case[] {
  const found: Case[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === "manifest.ttl") {
        const url = pathToFileURL(file).href;
        const manifest = new Store(
          new Parser({ baseIRI: url }).parse(fs.readFileSync(file, "utf8")),
        );
        for (const list of manifest.getObjects(
          null,
          nn(MF + "entries"),
          null,
        )) {
          let at = list;
          while (at && at.value !== RDF + "nil") {
            const node = one(manifest, at, RDF + "first");
            if (!node) throw Error("Malformed manifest list: " + url);
            const type = one(manifest, node, RDF + "type")
              ?.value.split("#")
              .at(-1);
            if (!type) throw Error("Missing test type: " + node.value);
            found.push({
              id: node.value,
              name: one(manifest, node, MF + "name")?.value ?? node.value,
              suite: path.relative(root, dir).replaceAll("\\", "/"),
              type,
              manifest,
              action: one(manifest, node, MF + "action"),
              result: one(manifest, node, MF + "result"),
              url,
            });
            at = one(manifest, at, RDF + "rest");
          }
        }
      }
    }
  }
  walk(root);
  return found;
}
export function queryFile(c: Case) {
  return c.action.termType === "NamedNode"
    ? c.action.value
    : (one(c.manifest, c.action, QT + "query")?.value ??
        one(c.manifest, c.action, UT + "request")?.value);
}
export const queryText = (c: Case) => read(queryFile(c));
async function rdfFile(url: string): Promise<Quad[]> {
  const text = read(url);
  if (/^\s*<\?xml|^\s*<rdf:RDF/.test(text)) {
    return new Promise((resolve, reject) => {
      const parser = new RdfXmlParser({ baseIRI: url }),
        quads: Quad[] = [];
      parser.on("data", (q: Quad) => quads.push(q));
      parser.on("error", reject);
      parser.on("end", () => resolve(quads));
      parser.end(text);
    });
  }
  return new Parser({ baseIRI: url }).parse(text);
}
const loaded = new WeakMap<Store, Set<string>>();
async function loadFile(store: Store, url: string, graph?: string) {
  const keys = loaded.get(store) ?? new Set<string>();
  loaded.set(store, keys);
  const key = url + "|" + (graph ?? "");
  if (keys.has(key)) return;
  keys.add(key);
  const quads = await rdfFile(url);
  store.addQuads(
    graph
      ? quads.map((q) => quad(q.subject, q.predicate, q.object, nn(graph)))
      : quads,
  );
}
export async function dataset(c: Case, action = c.action) {
  const store = new Store();
  for (const ns of [QT, UT]) {
    for (const data of all(c.manifest, action, ns + "data"))
      await loadFile(store, data.value);
    for (const g of all(c.manifest, action, ns + "graphData")) {
      if (g.termType === "NamedNode") await loadFile(store, g.value, g.value);
      else {
        const file = one(c.manifest, g, ns + "graph").value;
        const name = one(c.manifest, g, RDFS + "label").value;
        await loadFile(store, file, name);
      }
    }
  }
  // FROM clauses in the test corpus refer to fixture files. Axiom itself never fetches them.
  if (action === c.action && c.type === "QueryEvaluationTest") {
    const parsed = parseQuery(queryText(c), queryFile(c));
    for (const g of parsed.datasets.clauses) {
      const url = new URL(g.value.value, queryFile(c)).href;
      if (url.startsWith("file:") && fs.existsSync(fileURLToPath(url)))
        await loadFile(store, url, url);
    }
  }
  return store;
}
type Results = {
  vars: string[];
  rows: Record<string, Term>[];
  boolean?: boolean;
  ordered?: boolean;
  graph?: Quad[];
};
function resultTerm(t: {
  type: string;
  value: string;
  datatype?: string;
  "xml:lang"?: string;
}): Term {
  return t.type === "uri"
    ? nn(t.value)
    : t.type === "bnode"
      ? bn(t.value)
      : lit(t.value, t["xml:lang"] || nn(t.datatype ?? XSD + "string"));
}
export async function expected(c: Case): Promise<Results> {
  const url = c.result!.value,
    text = read(url),
    ext = path.extname(fileURLToPath(url));
  if (ext === ".srj") {
    const j = JSON.parse(text);
    return {
      vars: j.head.vars ?? [],
      rows: (j.results?.bindings ?? []).map(
        (r: Record<string, Parameters<typeof resultTerm>[0]>) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [k, resultTerm(v)]),
          ),
      ),
      boolean: j.boolean,
    };
  }
  if (ext === ".srx" || ext === ".xml") {
    const r: Results = { vars: [], rows: [] };
    const parser = new SaxesParser({ xmlns: false });
    let binding = "",
      term: Parameters<typeof resultTerm>[0] | undefined,
      row: Record<string, Term> = {},
      bool = false,
      value = "";
    parser.on("opentag", (node) => {
      const a = node.attributes as Record<string, string>;
      if (node.name === "variable") r.vars.push(a.name);
      if (node.name === "results") r.ordered = a.ordered === "true";
      if (node.name === "result") row = {};
      if (node.name === "binding") binding = a.name;
      if (["uri", "bnode", "literal"].includes(node.name)) {
        term = {
          type: node.name,
          value: "",
          datatype: a.datatype,
          "xml:lang": a["xml:lang"],
        };
        value = "";
      }
      if (node.name === "boolean") {
        bool = true;
        value = "";
      }
    });
    parser.on("text", (t) => {
      if (term || bool) value += t;
    });
    parser.on("cdata", (t) => {
      if (term || bool) value += t;
    });
    parser.on("closetag", (node) => {
      if (["uri", "bnode", "literal"].includes(node.name)) {
        term!.value = value;
        row[binding] = resultTerm(term!);
        term = undefined;
      }
      if (node.name === "boolean") {
        r.boolean = value.trim() === "true";
        bool = false;
      }
      if (node.name === "result") r.rows.push(row);
    });
    parser.write(text).close();
    return r;
  }
  if (ext === ".tsv") {
    const lines = text.replaceAll("\r\n", "\n").trimEnd().split("\n");
    const vars = lines
      .shift()!
      .split("\t")
      .map((v) => v.slice(1));
    return {
      vars,
      rows: lines.map((line) =>
        Object.fromEntries(
          line.split("\t").flatMap((v, i) => {
            if (!v) return [];
            const term = new Parser().parse("<urn:s> <urn:p> " + v + " .")[0]
              .object;
            return [[vars[i], term]];
          }),
        ),
      ),
    };
  }
  const rdf = new Store(await rdfFile(url));
  const node = rdf.getSubjects(nn(RDF + "type"), nn(RS + "ResultSet"), null)[0];
  if (!node)
    return { vars: [], rows: [], graph: rdf.getQuads(null, null, null, null) };
  const bool = one(rdf, node, RS + "boolean");
  const solutions = all(rdf, node, RS + "solution");
  const ordered = solutions.some((s) => one(rdf, s, RS + "index"));
  if (ordered)
    solutions.sort(
      (a, b) =>
        Number(one(rdf, a, RS + "index").value) -
        Number(one(rdf, b, RS + "index").value),
    );
  return {
    vars: all(rdf, node, RS + "resultVariable").map((v) => v.value),
    boolean: bool ? bool.value === "true" : undefined,
    ordered,
    rows: solutions.map((s) =>
      Object.fromEntries(
        all(rdf, s, RS + "binding").map((b) => [
          one(rdf, b, RS + "variable").value,
          one(rdf, b, RS + "value"),
        ]),
      ),
    ),
  };
}
function normal(t: Term): Term {
  if (t.termType !== "Literal") return t;
  // Result equality permits alternate lexical spellings of the same XSD value.
  const datatype = t.datatype.value;
  const value = t.value.trim();
  const localType = datatype.startsWith(XSD) ? datatype.slice(XSD.length) : "";
  if (
    /^(?:integer|int|long|short|byte|nonNegativeInteger|positiveInteger|negativeInteger|nonPositiveInteger|unsignedLong|unsignedInt|unsignedShort|unsignedByte)$/.test(
      localType,
    ) &&
    /^[+-]?\d+$/.test(value)
  )
    return lit(BigInt(value).toString(), nn(datatype));
  if (localType === "decimal") {
    const m = value.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
    if (m && (m[2] || m[3])) {
      const integer = m[2].replace(/^0+/, "") || "0",
        fraction = (m[3] ?? "").replace(/0+$/, "");
      const nonzero = integer !== "0" || fraction.length > 0;
      return lit(
        (m[1] === "-" && nonzero ? "-" : "") +
          integer +
          (fraction ? "." + fraction : ""),
        nn(datatype),
      );
    }
  }
  if (
    (localType === "double" || localType === "float") &&
    value &&
    Number.isFinite(Number(value))
  )
    return lit(String(Number(value)), nn(datatype));
  if (datatype === XSD + "boolean")
    return lit(
      t.value === "1" ? "true" : t.value === "0" ? "false" : t.value,
      nn(datatype),
    );
  return lit(t.value, t.language ? t.language.toLowerCase() : nn(datatype));
}
async function canonical(quads: Quad[]) {
  const writer = new Writer({ format: "N-Quads" });
  writer.addQuads(quads);
  const nquads = await new Promise<string>((resolve, reject) =>
    writer.end((error, text) => (error ? reject(error) : resolve(text))),
  );
  return canonize(nquads, {
    algorithm: "RDFC-1.0",
    inputFormat: "application/n-quads",
    maxDeepIterations: 1000000,
  });
}
async function table(rows: Record<string, Term>[], ordered: boolean) {
  const quads: Quad[] = [];
  rows.forEach((row, i) => {
    const node = bn("row" + i);
    quads.push(
      quad(node, nn("urn:result:row"), ordered ? lit(String(i)) : lit("row")),
    );
    for (const [key, t] of Object.entries(row))
      if (t) {
        const value =
          t.termType === "BlankNode" ? bn("value" + t.value) : normal(t);
        quads.push(
          quad(
            node,
            nn("urn:result:variable:" + encodeURIComponent(key)),
            value as Quad["object"],
          ),
        );
      }
  });
  return canonical(quads);
}
const rdfTerm = (t: AxiomTerm): Term =>
  !t.literal
    ? t.value.startsWith("_:")
      ? bn(t.value.slice(2))
      : nn(t.value)
    : lit(
        t.value,
        t.language ||
          nn(
            t.datatype?.includes(":")
              ? t.datatype
              : XSD + (t.datatype ?? "string"),
          ),
      );
export async function checkEvaluation(c: Case, text = queryText(c)) {
  const store = await dataset(c),
    want = await expected(c);
  const result = await evaluateQuery(store, text, 0, { baseIRI: queryFile(c) });
  if (want.boolean !== undefined) {
    expect(result.queryType).toBe("ASK");
    expect(result.rows[0][0]?.value).toBe(String(want.boolean));
    return;
  }
  if (want.graph) {
    const actual = result.rows.map((row) =>
      quad(
        rdfTerm(row[0]!) as Quad["subject"],
        rdfTerm(row[1]!) as Quad["predicate"],
        rdfTerm(row[2]!) as Quad["object"],
      ),
    );
    expect(await canonical(actual)).toBe(await canonical(want.graph));
    return;
  }
  const vars = result.columns.map((v) => v.slice(1));
  expect(vars.slice().sort()).toEqual(want.vars.slice().sort());
  const actual = result.rows.map((row) =>
    Object.fromEntries(
      row.flatMap((v, i) => (v ? [[vars[i], rdfTerm(v)]] : [])),
    ),
  );
  const parsed = parseQuery(text, queryFile(c));
  const ordered =
    want.ordered ||
    (parsed.subType === "select" && !!parsed.solutionModifiers.order);
  const lax =
    one(c.manifest, nn(c.id), MF + "resultCardinality")?.value ===
    MF + "LaxCardinality";
  const unique = (rows: Record<string, Term>[]) => {
    const keys = new Map<string, Record<string, Term>>();
    for (const row of rows)
      keys.set(
        JSON.stringify(
          Object.entries(row)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, normal(v)]),
        ),
        row,
      );
    return [...keys.values()];
  };
  const got = await table(lax ? unique(actual) : actual, ordered),
    wanted = await table(lax ? unique(want.rows) : want.rows, ordered);
  if (got !== wanted) {
    fs.mkdirSync("artifacts/conformance-differences", { recursive: true });
    fs.writeFileSync(
      path.join(
        "artifacts/conformance-differences",
        c.suite.replaceAll("/", "-") +
          "-" +
          encodeURIComponent(c.name).replaceAll("*", "%2A") +
          ".json",
      ),
      JSON.stringify(
        {
          id: c.id,
          query: text,
          got,
          expected: wanted,
          actual: actual.map((r) =>
            Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v])),
          ),
          wanted: want.rows,
        },
        null,
        2,
      ),
    );
  }
  expect(got).toBe(wanted);
}
export async function checkUpdate(c: Case) {
  const store = await dataset(c);
  await queryEngine().queryVoid(queryText(c), {
    ...localQueryContext(store, queryFile(c)),
    destination: store,
  });
  const want = await dataset(c, c.result!);
  expect(await canonical(store.getQuads(null, null, null, null))).toBe(
    await canonical(want.getQuads(null, null, null, null)),
  );
}
export function checkSyntax(c: Case) {
  const run = () => parseSparql(queryText(c), queryFile(c));
  if (c.type.startsWith("Negative")) expect(run).toThrow();
  else expect(run).not.toThrow();
}

/** CSV carries lexical values, without RDF datatype or language metadata. */
export async function checkCsv(c: Case, text = queryText(c)) {
  const records: string[][] = [],
    source = read(c.result!.value).replaceAll("\r\n", "\n");
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(field);
      field = "";
      if (char === "\n") {
        records.push(row);
        row = [];
      }
    } else field += char;
  }
  if (field || row.length) records.push([...row, field]);
  expect(quoted).toBe(false);
  const vars = records.shift()!,
    result = await evaluateQuery(await dataset(c), text, 0, {
      baseIRI: queryFile(c),
    });
  expect(result.columns.map((v) => v.slice(1)).sort()).toEqual(
    vars.slice().sort(),
  );
  const csvTerm = (value: string) =>
    value.startsWith("_:") ? bn(value.slice(2)) : lit(value);
  const want = records.map((values) =>
    Object.fromEntries(values.map((value, i) => [vars[i], csvTerm(value)])),
  );
  const actual = result.rows.map((values) =>
    Object.fromEntries(
      values.map((term, i) => [
        result.columns[i].slice(1),
        csvTerm(term?.value ?? ""),
      ]),
    ),
  );
  expect(await table(actual, false)).toBe(await table(want, false));
}
