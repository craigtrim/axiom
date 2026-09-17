import { DataFactory, Writer } from "n3";
import type * as RDF from "@rdfjs/types";
import { NS, TYPE, type Triple } from "./model";
const node = (id: string) =>
  id.startsWith("_:")
    ? DataFactory.blankNode(id.slice(2))
    : DataFactory.namedNode(id);
/** Inline only anonymous resources whose identities are private to this snippet. */
export async function writeTurtleSnippet(
  triples: Triple[],
  prefixes: Record<string, string>,
  root: string,
  protectedIds: Set<string>,
  format: "turtle" | "trig",
) {
  const writer = new Writer({
    prefixes,
    format: format === "trig" ? "TriG" : "Turtle",
  });
  const subjects = new Map<string, Triple[]>(),
    incoming = new Map<string, number>();
  for (const t of triples) {
    const list = subjects.get(t.subject) ?? [];
    list.push(t);
    subjects.set(t.subject, list);
    if (!t.object.literal)
      incoming.set(t.object.value, (incoming.get(t.object.value) ?? 0) + 1);
    if (t.graph) protectedIds.add(t.graph);
  }
  const consumed = new Set<string>();
  const inline = (id: string, graph: string) =>
    id !== root &&
    id.startsWith("_:") &&
    !protectedIds.has(id) &&
    incoming.get(id) === 1 &&
    !!subjects.get(id)?.length &&
    subjects.get(id)!.every((t) => (t.graph ?? "") === graph);
  const value = (t: Triple, path: Set<string>): RDF.Quad_Object => {
    if (t.object.literal)
      return DataFactory.literal(
        t.object.value,
        t.object.language ||
          (t.object.datatype
            ? DataFactory.namedNode(
                t.object.datatype.includes(":")
                  ? t.object.datatype
                  : NS.xsd + t.object.datatype,
              )
            : undefined),
      );
    const id = t.object.value,
      graph = t.graph ?? "";
    if (!inline(id, graph) || path.has(id) || path.size >= 96) return node(id);
    const next = new Set(path).add(id),
      cells: string[] = [],
      members: Triple[] = [];
    let cell = id,
      validList = true;
    while (cell !== NS.rdf + "nil") {
      if (
        !inline(cell, graph) ||
        cells.includes(cell) ||
        cells.length >= 4096
      ) {
        validList = false;
        break;
      }
      const rows = subjects.get(cell)!,
        first = rows.filter((r) => r.predicate === NS.rdf + "first"),
        rest = rows.filter((r) => r.predicate === NS.rdf + "rest");
      if (
        rows.length !== 2 ||
        first.length !== 1 ||
        rest.length !== 1 ||
        rest[0].object.literal
      ) {
        validList = false;
        break;
      }
      cells.push(cell);
      members.push(first[0]);
      cell = rest[0].object.value;
    }
    if (validList && cells.length) {
      for (const cell of cells) consumed.add(cell);
      return writer.list(
        members.map((m) => value(m, new Set([...next, ...cells]))),
      ) as unknown as RDF.Quad_Object;
    }
    consumed.add(id);
    const rows = [...subjects.get(id)!].sort(
      (a, b) =>
        Number(b.predicate === TYPE) - Number(a.predicate === TYPE) ||
        a.predicate.localeCompare(b.predicate),
    );
    return writer.blank(
      rows.map((r) => ({
        predicate: DataFactory.namedNode(r.predicate),
        object: value(r, next),
      })),
    );
  };
  // Start at the selected subject, then preserve any explicit shared structures.
  const ordered = [...subjects.keys()].sort(
    (a, b) =>
      Number(b === root) - Number(a === root) ||
      Number(a.startsWith("_:")) - Number(b.startsWith("_:")),
  );
  for (const id of ordered) {
    if (consumed.has(id)) continue;
    const rows = [...subjects.get(id)!].sort(
      (a, b) =>
        Number(b.predicate === TYPE) - Number(a.predicate === TYPE) ||
        a.predicate.localeCompare(b.predicate),
    );
    for (const t of rows)
      writer.addQuad(
        node(t.subject),
        DataFactory.namedNode(t.predicate),
        value(t, new Set([t.subject])),
        t.graph ? node(t.graph) : DataFactory.defaultGraph(),
      );
  }
  const text = await new Promise<string>((resolve, reject) =>
    writer.end((error, text) => (error ? reject(error) : resolve(text))),
  );
  let depth = 0,
    graphDepth = 0;
  return text
    .split("\n")
    .map((line) => {
      // N3 emits single-line escaped literals. Ignore their brackets, and brackets
      // inside IRIs, when indenting the generated anonymous property lists.
      const syntax = line.replace(/"(?:\\.|[^"\\])*"|<[^>]*>/g, "");
      const closing = syntax.trimStart().startsWith("]");
      const graphClosing = syntax.trimStart().startsWith("}");
      const indent = closing
        ? Math.max(0, depth) * 4
        : depth > 0
          ? (depth + 1) * 4
          : /^\s+\S/.test(line)
            ? 4
            : 0;
      depth +=
        (syntax.match(/\[/g)?.length ?? 0) - (syntax.match(/\]/g)?.length ?? 0);
      const extra = Math.max(0, graphDepth - Number(graphClosing)) * 4;
      graphDepth +=
        (syntax.match(/\{/g)?.length ?? 0) - (syntax.match(/\}/g)?.length ?? 0);
      const formatted = " ".repeat(indent + extra) + line.trimStart();
      return /[.}]\s*$/.test(syntax) &&
        depth === 0 &&
        !syntax.trimStart().startsWith("@")
        ? formatted + "\n"
        : formatted;
    })
    .join("\n");
}
