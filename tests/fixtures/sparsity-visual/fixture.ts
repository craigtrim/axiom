// craigtrim/axiom#90: the published seed and computation are an independent oracle.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { THING } from "../../../src/domain/model";

export const sparsityReference = path.resolve(
  "tests/fixtures/sparsity-visual/visual-reference.html",
);
export const sparsityReferenceHash =
  "42e0347a12409a68857d44911f9e8e963c066ed4d5f553fa3dd3549688b18f6c";
export const sparsityBase = "https://axiom.test/sparsity#";
type SeedNode = { name: string; kids: string[]; parents: string[] };
type SeedRow = {
  name: string;
  c: number;
  d: number;
  mc: number;
  md: number;
  peers: number;
  score: number;
};
export function sparsityFixture() {
  const bytes = readFileSync(sparsityReference);
  if (
    createHash("sha256").update(bytes).digest("hex") !== sparsityReferenceHash
  )
    throw Error("The pinned Sparsity reference changed.");
  const html = bytes.toString("utf8"),
    start = html.indexOf("  var PAGE =");
  const reference = runInNewContext(
    html.slice(start, html.indexOf("  function cls(s)", start)) +
      ";({N,TOP,S,compute})",
  ) as {
    N: Record<string, SeedNode>;
    TOP: string[];
    S: {
      scope: string;
      infl: number;
      report: {
        groups: {
          parent: string;
          rows: SeedRow[];
          all: unknown[];
          mc: number;
        }[];
        lone: number;
        cyc: number;
        scanned: number;
        measured: number;
      };
    };
    compute(): void;
  };
  const nodes = reference.N;
  const names = Object.keys(nodes);
  const iris = new Map(
    names.map((name, index) => [
      name,
      name === "owl:Thing"
        ? THING
        : sparsityBase + "C" + String(index).padStart(4, "0"),
    ]),
  );
  const iri = (name: string) => {
    const value = iris.get(name);
    if (!value) throw Error("Unknown fixture class: " + name);
    return value;
  };
  const turtle = names
    .filter((name) => name !== "owl:Thing")
    .map(
      (name) =>
        `<${iri(name)}> a <http://www.w3.org/2002/07/owl#Class>; <http://www.w3.org/2000/01/rdf-schema#label> ${JSON.stringify(name)}${nodes[name].parents.length ? "; <http://www.w3.org/2000/01/rdf-schema#subClassOf> " + nodes[name].parents.map((p) => `<${iri(p)}>`).join(", ") : ""} .`,
    )
    .join("\n");
  const compute = (scope = "owl:Thing", influence = 20) => {
    reference.S.scope = scope;
    reference.S.infl = influence;
    reference.compute();
    return reference.S.report;
  };
  return { nodes, names, iris, iri, turtle, compute, top: reference.TOP };
}
