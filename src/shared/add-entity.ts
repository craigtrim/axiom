import { NS, THING, shorten, type Term } from "../domain/model";
import { entityIdentifier, normalizeEntityName } from "./entity-names";
import { nameSynonymStatements } from "../domain/entity-creation-names";

// craigtrim/axiom#93: the form, preview and transaction share one nested draft.
export interface AddEntityNode {
  manualParents?: boolean;
  pickerText?: string;
  label: string;
  comment: string;
  parents: ({ iri: string } | { create: AddEntityNode })[];
  statements?: { predicate: string; object: Term }[];
}
export interface SavedAddEntity {
  phrase: string;
  origin: "selection" | "find" | "blank";
  kind: AddEntityInput["kind"];
  root: AddEntityNode;
  created?: string[];
  // #177: persist the root separately so reopening the draft cannot rename a parent.
  createdRootIris?: string[];
  error?: string;
}
export function readSavedAddEntity(value: unknown): SavedAddEntity {
  const saved = value as SavedAddEntity;
  if (
    !saved ||
    typeof saved.phrase !== "string" ||
    saved.phrase.length > 256 ||
    !["selection", "find", "blank"].includes(saved.origin) ||
    (saved.error !== undefined &&
      (typeof saved.error !== "string" || saved.error.length > 10000)) ||
    (saved.createdRootIris !== undefined &&
      (!Array.isArray(saved.createdRootIris) ||
        saved.createdRootIris.length > 1000 ||
        saved.createdRootIris.some(
          (i) => typeof i !== "string" || !i || i.length > 10000,
        ))) ||
    (saved.created !== undefined &&
      (!Array.isArray(saved.created) ||
        saved.created.length > 1000 ||
        saved.created.some((i) => typeof i !== "string" || i.length > 10000)))
  )
    throw Error("Invalid saved Add entity draft.");
  readAddEntityInput(saved);
  return structuredClone(saved);
}
export interface AddEntityInput {
  kind: "class" | "individual";
  root: AddEntityNode;
}
export interface AddEntityFinding {
  kind: "bad2" | "wrn2";
  message: string;
  reveal?: { iri: string; label: string };
}
export interface AddEntityCheck {
  findings: AddEntityFinding[];
  defaultParent: string;
  entityCount: number;
  version: number;
  datasetEpoch: number;
}
export const addEntityPredicates = [
  NS.skos + "altLabel",
  NS.skos + "prefLabel",
  NS.rdfs + "seeAlso",
  NS.skos + "definition",
  NS.dc + "source",
];
// Issue 157: the live authoring preview uses the same name and synonym as its transaction.
export const cleanEntityName = (s: string) =>
  normalizeEntityName(s.replace(/\s+/gu, " ").trim());
export const addEntityIri = (name: string, namespace: string) =>
  namespace + (name.trim() ? entityIdentifier(name) : "Unnamed");

export function readAddEntityInput(value: unknown): AddEntityInput {
  const input = value as AddEntityInput;
  if (!input || !["class", "individual"].includes(input.kind))
    throw Error("Choose Class or Individual.");
  const queue = [input.root],
    seen = new Set<object>();
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (queue.length > 1000)
      throw Error("Add no more than 1,000 entities at a time.");
    if (
      !node ||
      typeof node !== "object" ||
      seen.has(node) ||
      typeof node.label !== "string" ||
      node.label.length > 256 ||
      typeof node.comment !== "string" ||
      node.comment.length > 10000 ||
      !Array.isArray(node.parents) ||
      node.parents.length > 1000
    )
      throw Error("Invalid entity draft.");
    seen.add(node);
    if (
      (node.pickerText !== undefined &&
        (typeof node.pickerText !== "string" ||
          node.pickerText.length > 256)) ||
      (node.manualParents !== undefined &&
        typeof node.manualParents !== "boolean")
    )
      throw Error("Invalid parent picker state.");
    for (const parent of node.parents) {
      if (!parent || typeof parent !== "object")
        throw Error("Invalid parent choice.");
      if ("create" in parent && !("iri" in parent)) queue.push(parent.create);
      else if (
        !("iri" in parent) ||
        "create" in parent ||
        typeof parent.iri !== "string" ||
        parent.iri.length > 10000
      )
        throw Error("Choose an existing class or draft a parent.");
    }
    if (
      node.statements !== undefined &&
      (!Array.isArray(node.statements) ||
        node.statements.length > 1000 ||
        node.statements.some(
          (s) =>
            !s ||
            typeof s.predicate !== "string" ||
            !s.object ||
            typeof s.object.literal !== "boolean" ||
            typeof s.object.value !== "string" ||
            s.object.value.length > 10000 ||
            (s.object.language !== undefined &&
              (typeof s.object.language !== "string" ||
                s.object.language.length > 1000)) ||
            (s.object.datatype !== undefined &&
              (typeof s.object.datatype !== "string" ||
                s.object.datatype.length > 10000)),
        ))
    )
      throw Error("Invalid additional statements.");
  }
  return input;
}

const xml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function plannedEntitySource(input: AddEntityInput, namespace: string) {
  const blocks: string[] = [];
  const visit = (node: AddEntityNode, kind: AddEntityInput["kind"]) => {
    for (const parent of node.parents)
      if ("create" in parent) visit(parent.create, "class");
    const tag = kind === "class" ? "owl:Class" : "owl:NamedIndividual";
    const lines = [
      `<${tag} rdf:about="${xml(addEntityIri(node.label, namespace))}">`,
      `  <rdfs:label xml:lang="en">${xml(cleanEntityName(node.label) || "Unnamed")}</rdfs:label>`,
    ];
    if (node.comment.trim())
      lines.push(
        `  <rdfs:comment xml:lang="en">${xml(node.comment.trim())}</rdfs:comment>`,
      );
    const parents = new Set(
      node.parents.map((p) =>
        "iri" in p ? p.iri : addEntityIri(p.create.label, namespace),
      ),
    );
    if (!parents.size && kind === "class") parents.add(THING);
    if (parents.size > 1 && kind === "class") parents.delete(THING);
    for (const iri of parents)
      lines.push(
        `  <${kind === "class" ? "rdfs:subClassOf" : "rdf:type"} rdf:resource="${xml(iri)}"/>`,
      );
    const statements = (node.statements ?? []).map((s) => ({
      ...s,
      object: { ...s.object, value: s.object.value.trim() },
    }));
    for (const s of [
      ...statements,
      ...nameSynonymStatements(
        addEntityIri(node.label, namespace),
        cleanEntityName(node.label),
        statements,
      ),
    ]) {
      if (!s.object.value.trim()) continue;
      const predicate = shorten(s.predicate);
      if (predicate.startsWith("<")) continue;
      lines.push(
        s.object.literal
          ? `  <${predicate}${s.object.language ? ` xml:lang="${xml(s.object.language)}"` : s.object.datatype && s.object.datatype !== NS.xsd + "string" ? ` rdf:datatype="${xml(s.object.datatype)}"` : ""}>${xml(s.object.value.trim())}</${predicate}>`
          : `  <${predicate} rdf:resource="${xml(s.object.value.trim())}"/>`,
      );
    }
    lines.push(`</${tag}>`);
    blocks.push(lines.join("\n"));
  };
  visit(input.root, input.kind);
  return blocks.join("\n\n");
}
