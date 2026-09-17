import { writeTurtleSnippet } from "./turtle-snippet";
import { randomUUID } from "node:crypto";
import { parseRdf, writeRdf } from "./rdf-io";
import { statementKey } from "./rdf-model";
import type { Store } from "./store";
import type { Triple } from "./model";
import {
  sourceFormats,
  sourcePrefixes,
  type EntitySourceDocument,
  type SourceFormat,
} from "../shared/source";

export function entitySourceStatements(store: Store, iri: string) {
  if (!store.entities.has(iri))
    throw Error("This entity is no longer available.");
  const result: Triple[] = [],
    seen = new Set<string>(),
    pending = [iri];
  while (pending.length) {
    const subject = pending.shift()!;
    if (seen.has(subject)) continue;
    seen.add(subject);
    const triples =
      subject === iri ? store.entityStatements(iri) : [...store.scan(subject)];
    result.push(...triples);
    if (result.length > 100000)
      throw Error(
        "This entity is too large for the Details source editor. Use the Source view.",
      );
    for (const t of triples)
      if (!t.object.literal && t.object.value.startsWith("_:"))
        pending.push(t.object.value);
  }
  return result;
}
const fingerprint = (triples: Triple[]) =>
  triples.map(statementKey).sort().join("\n");
export async function entitySource(
  store: Store,
  datasetEpoch: number,
  iri: string,
): Promise<EntitySourceDocument> {
  const original = entitySourceStatements(store, iri);
  const namedGraphs = original.some((t) => !!t.graph);
  const native = store.ontology.source?.format;
  const format: SourceFormat = sourceFormats.some((f) => f.id === native)
    ? (native as SourceFormat)
    : namedGraphs
      ? "trig"
      : "turtle";
  const chosen =
    namedGraphs && !sourceFormats.find((f) => f.id === format)!.graphs
      ? "trig"
      : format;
  const contextIri = iri.startsWith("_:")
    ? (store.tbox.find(
        (t) =>
          !t.subject.startsWith("_:") &&
          !t.object.literal &&
          t.object.value === iri,
      )?.subject ??
      original.find(
        (t) =>
          t.predicate === sourcePrefixes.rdf + "first" &&
          !t.object.literal &&
          !t.object.value.startsWith("_:"),
      )?.object.value ??
      iri)
    : iri;
  const cut = Math.max(
    contextIri.lastIndexOf("#"),
    contextIri.lastIndexOf("/"),
  );
  const namespace =
    cut >= 0 ? contextIri.slice(0, cut + 1) : store.ontology.namespace;
  const prefixes = { "": namespace, ...sourcePrefixes };
  const used = Object.fromEntries(
    Object.entries(prefixes).filter(([_, base]) =>
      original.some((t) =>
        [
          t.subject,
          t.predicate,
          t.object.literal ? (t.object.datatype ?? "") : t.object.value,
        ].some((v) => v.startsWith(base)),
      ),
    ),
  );
  const scope = new Set(original.map((t) => t.subject));
  const protectedIds = new Set(
    store.tbox
      .filter((t) => !scope.has(t.subject) && !t.object.literal)
      .map((t) => t.object.value),
  );
  for (const t of store.tbox) if (t.graph) protectedIds.add(t.graph);
  protectedIds.add(iri);
  let text =
    chosen === "turtle" || chosen === "trig"
      ? await writeTurtleSnippet(original, used, iri, protectedIds, chosen)
      : await writeRdf(original, chosen, {
          prefixes: used,
          preserveBlankNodes: true,
        });
  return {
    iri,
    text,
    original,
    format: chosen,
    datasetEpoch,
    version: store.version,
    namedGraphs,
    statements: original.length,
  };
}
export async function applyEntitySource(
  store: Store,
  datasetEpoch: number,
  input: EntitySourceDocument,
  unchanged = () => true,
) {
  const check = () => {
    if (
      input.datasetEpoch !== datasetEpoch ||
      !unchanged() ||
      !Array.isArray(input.original) ||
      fingerprint(entitySourceStatements(store, input.iri)) !==
        fingerprint(input.original)
    )
      throw Error(
        "This entity changed. Your source draft is preserved. Reload Source before saving.",
      );
  };
  check();
  if (
    !sourceFormats.some((f) => f.id === input.format) ||
    typeof input.text !== "string" ||
    input.text.length > 8000000
  )
    throw Error("Invalid entity source.");
  const parsed = await parseRdf(
    input.text,
    "entity",
    store.ontology.source?.baseIRI ?? store.ontology.namespace,
    input.format,
    { preserveBlankNodes: true },
  );
  check();
  const originalBlanks = new Set(
    input.original
      .flatMap((t) => [
        t.subject,
        ...(!t.object.literal ? [t.object.value] : []),
        ...(t.graph ? [t.graph] : []),
      ])
      .filter((v) => v.startsWith("_:")),
  );
  const xmlBlanks = new Map(
    [...originalBlanks].map((id) => [
      "_:axiom" + Buffer.from(id.slice(2)).toString("hex"),
      id,
    ]),
  );
  const allocated = new Map<string, string>();
  const remap = (id: string) => {
    if (!id.startsWith("_:")) return id;
    if (input.format === "rdfxml" && xmlBlanks.has(id))
      return xmlBlanks.get(id)!;
    if (input.format !== "rdfxml" && originalBlanks.has(id)) return id;
    if (!allocated.has(id))
      allocated.set(id, "_:snippet" + randomUUID().replaceAll("-", ""));
    return allocated.get(id)!;
  };
  const triples = parsed.triples.map((t) => ({
    ...t,
    subject: remap(t.subject),
    object: t.object.literal
      ? t.object
      : { ...t.object, value: remap(t.object.value) },
    ...(t.graph ? { graph: remap(t.graph) } : {}),
  }));
  const subjects = new Set(
    triples.filter((t) => !t.subject.startsWith("_:")).map((t) => t.subject),
  );
  const nextIri = input.iri.startsWith("_:")
    ? input.iri
    : subjects.size === 1
      ? [...subjects][0]
      : null;
  if (!nextIri || (!input.iri.startsWith("_:") && subjects.size !== 1))
    throw Error(
      "Keep this snippet scoped to one entity and its anonymous structures. Use the Source view to edit other entities.",
    );
  const roots = triples
    .filter((t) => t.subject === nextIri)
    .map((t) => ({ ...t, subject: input.iri }));
  const related = triples.filter((t) => t.subject !== nextIri);
  const reachable = new Set([nextIri]);
  for (let changed = true; changed;) {
    changed = false;
    for (const t of triples)
      if (
        reachable.has(t.subject) &&
        !t.object.literal &&
        t.object.value.startsWith("_:") &&
        !reachable.has(t.object.value)
      ) {
        reachable.add(t.object.value);
        changed = true;
      }
  }
  if (related.some((t) => !reachable.has(t.subject)))
    throw Error("Remove disconnected statements from this entity snippet.");
  // Preserve removed structures still referenced by entities outside this snippet.
  const scope = new Set(input.original.map((t) => t.subject));
  const retained = new Set<string>();
  for (const t of store.tbox)
    if (
      !scope.has(t.subject) &&
      !t.object.literal &&
      originalBlanks.has(t.object.value) &&
      !reachable.has(t.object.value)
    )
      retained.add(t.object.value);
  for (let changed = true; changed;) {
    changed = false;
    for (const t of input.original)
      if (
        retained.has(t.subject) &&
        !t.object.literal &&
        originalBlanks.has(t.object.value) &&
        !retained.has(t.object.value)
      ) {
        retained.add(t.object.value);
        changed = true;
      }
  }
  const removed = new Set([...scope].filter((id) => id.startsWith("_:")));
  return store.updateEntity(input.iri, roots, nextIri, {
    subjects: removed,
    statements: [
      ...related,
      ...input.original.filter(
        (t) => retained.has(t.subject) && !reachable.has(t.subject),
      ),
    ],
  });
}
