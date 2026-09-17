import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Parser, Writer, DataFactory } from "n3";
import canonize from "rdf-canonize";
const input = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw Error("Supply the ontology file path.");
const source = await fs.readFile(input, "utf8");
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const subclass = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const equivalent = "http://www.w3.org/2002/07/owl#equivalentClass";
const intersection = "http://www.w3.org/2002/07/owl#intersectionOf";
const before = new Parser({ format: "Turtle" }).parse(source);
const expressions = new Set(
  before
    .filter((q) => q.predicate.value === intersection)
    .map((q) => q.subject.value),
);
let count = 0;
const expected = before.map((q) => {
  if (q.predicate.value !== subclass || !expressions.has(q.object.value))
    return q;
  count++;
  return DataFactory.quad(
    q.subject,
    DataFactory.namedNode(equivalent),
    q.object,
    q.graph,
  );
});
let replacements = 0;
let text = source.replace(
  /rdfs:subClassOf(?=\s*\[\s*owl:intersectionOf\b)/g,
  () => {
    replacements++;
    return "owl:equivalentClass";
  },
);
text = text.replace(
  /(rdfs:subClassOf\s+:[A-Za-z0-9_]+\s*),(\s*)(?=\[\s*owl:intersectionOf\b)/g,
  (_, parent, spacing) => {
    replacements++;
    return parent + ";" + spacing + "owl:equivalentClass ";
  },
);
if (!count || replacements !== count)
  throw Error(
    `Expected ${count} subclass intersection references; matched ${replacements}. No file changed.`,
  );
const canonical = (quads) =>
  canonize.canonize(new Writer({ format: "N-Quads" }).quadsToString(quads), {
    algorithm: "RDFC-1.0",
    inputFormat: "application/n-quads",
  });
const actual = new Parser({ format: "Turtle" }).parse(text);
if ((await canonical(expected)) !== (await canonical(actual)))
  throw Error("Migration changed unrelated RDF. No file changed.");
const output = path.resolve("artifacts/testing/courses-equivalent.owl");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, text);
const record = {
  input,
  output,
  definitions: count,
  triples: actual.length,
  originalSha256: hash(source),
  migratedSha256: hash(text),
};
await fs.writeFile(
  "artifacts/testing/courses-equivalence-migration.json",
  JSON.stringify(record, null, 2),
);
console.log(JSON.stringify(record, null, 2));
