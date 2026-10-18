// craigtrim/axiom#91: build actual RDF from the hash-pinned class and property seed.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { NS, THING } from "../../../src/domain/model";
export const hierarchyReference = path.resolve(
  "tests/fixtures/hierarchy-visual/visual-reference.html",
);
export const hierarchyReferenceHash =
  "4d900c2e638462c79a917bf0ba43ad85302ff98cadaa2d5f072b305f66abdbb7";
type Seed = [string, string | null, number, string, string[]?];
export function hierarchyFixture() {
  const bytes = readFileSync(hierarchyReference);
  if (
    createHash("sha256").update(bytes).digest("hex") !== hierarchyReferenceHash
  )
    throw Error("The pinned Hierarchy reference changed.");
  const html = bytes.toString("utf8"),
    start = html.indexOf("  var CLASSES =");
  const { CLASSES, PROPS } = runInNewContext(
    html.slice(start, html.indexOf("  function build(rows)", start)) +
      ";({CLASSES, PROPS})",
  ) as { CLASSES: Seed[]; PROPS: Seed[] };
  const base = "https://axiom.test/hierarchy#";
  const nodes = [...CLASSES, ...PROPS];
  const ids = new Map(
    nodes.map((r, i) => [
      r[0],
      r[0] === "owl:Thing" ? THING : base + "N" + String(i).padStart(3, "0"),
    ]),
  );
  const iri = (name: string) => {
    const id = ids.get(name);
    if (!id) throw Error("Unknown fixture node " + name);
    return id;
  };
  const turtle = [`@prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.`];
  let individual = 0;
  for (const [name, parent, count, kind, extra] of nodes) {
    const id = iri(name);
    turtle.push(
      `<${id}> a owl:${kind === "cls" ? "Class" : kind === "obj" ? "ObjectProperty" : "DatatypeProperty"}; rdfs:label ${JSON.stringify(name)}.`,
    );
    for (const p of [parent, ...(extra ?? [])].filter((p): p is string => !!p))
      turtle.push(
        `<${id}> rdfs:${kind === "cls" ? "subClassOf" : "subPropertyOf"} <${iri(p)}>.`,
      );
    for (let i = 0; i < count; i++) {
      if (kind === "cls") turtle.push(`<${base}I${individual++}> a <${id}>.`);
      else
        turtle.push(
          `<${base}I${i}> <${id}> ${kind === "obj" ? `<${THING}>` : JSON.stringify(String(i))}.`,
        );
    }
  }
  return {
    iri,
    nodes,
    classes: CLASSES,
    properties: PROPS,
    turtle: turtle.join("\n"),
    initialOpen: [
      "owl:Thing",
      "Agent",
      "Artifact",
      "owl:topObjectProperty",
      "owl:topDataProperty",
    ].map(iri),
  };
}
