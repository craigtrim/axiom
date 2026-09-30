import { NS, SUBCLASS, THING, TYPE, type Triple } from "./model";
import type { Store } from "./store";
import { identifier, validLabel, validResource, validateStatement } from "./rdf-model";
import { expandIri } from "../shared/terms";
import { entityNameCollisions } from "./entity-name-index";
import { textAnalysisDraft, createTextAnalysisHierarchy } from "./text-analysis-authoring";
import { fixedFindPredicates, resourcePredicates, type FindCreationPreview } from "../shared/find-create";
import type { TextAnalysisClassInput } from "../shared/text-analysis";
import { namedClass } from "./class-expressions";
import { writeRdf } from "./rdf-io";
import { entityPath } from "./entity-path";

function prepare(store: Store, input: unknown, epoch: number) {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const errors: FindCreationPreview["errors"] = [];
  const label = typeof value.label === "string" ? value.label.replace(/\s+/gu, " ").trim() : "";
  try { validLabel(label); if (typeof value.label === "string" && value.label.length > 256) throw Error("Use a label of 256 characters or fewer."); } catch (error) { errors.push({ field: "label", message: (error as Error).message }); }
  const comment = typeof value.comment === "string" ? value.comment.trim() : "";
  if (typeof value.comment !== "string" || value.comment.length > 10000) errors.push({ field: "comment", message: "Use a comment of 10,000 characters or fewer." });
  const iri = value.iri === undefined ? store.ontology.namespace + identifier(label) : typeof value.iri === "string" ? expandIri(value.iri, store.ontology.namespace) : "";
  if (!validResource(iri, false) || (typeof value.iri === "string" && !value.iri.trim())) errors.push({ field: "iri", message: "Enter a valid subject IRI." });
  const parents = Array.isArray(value.parents) && value.parents.every(p => typeof p === "string") ? [...new Set(value.parents as string[])] : [];
  if (!Array.isArray(value.parents) || value.parents.length > 1000 || value.parents.some(p => typeof p !== "string")) errors.push({ field: "parents", message: "Choose existing parent classes." });
  for (const parent of parents) {
    if (parent === iri) errors.push({ field: "parents", message: "A class cannot be its own ancestor. Choose a different parent name." });
    else if (!store.entities.get(parent) || !namedClass(store.entities.get(parent)! ) || parent.startsWith("_:")) errors.push({ field: "parents", message: "Choose an existing superclass." });
  }
  const writtenParents = parents.length ? parents.filter(p => parents.length === 1 || p !== THING) : [THING];
  const statements: NonNullable<TextAnalysisClassInput["statements"]> = [];
  if (!Array.isArray(value.statements) || value.statements.length > 100) errors.push({ field: "statements", message: "Add no more than 100 extra statements." });
  else for (const [i, row] of value.statements.entries()) {
    const field = `statement-${i}`;
    if (!row || typeof row.predicate !== "string" || typeof row.value !== "string" || row.value.length > 10000) { errors.push({ field, message: "Provide a predicate and a value of 10,000 characters or fewer." }); continue; }
    const predicate = expandIri(row.predicate, store.ontology.namespace);
    if (fixedFindPredicates.includes(predicate) || !validResource(predicate, false)) { errors.push({ field, message: "Choose a valid additional predicate." }); continue; }
    if (!row.value.trim()) continue;
    const resource = resourcePredicates.has(predicate) || store.resolve(predicate)?.kind === "ObjectProperty";
    const object = resource ? { literal: false, value: expandIri(row.value, store.ontology.namespace) } : { literal: true, value: row.value, datatype: NS.xsd + "string" };
    try { validateStatement({ subject: iri, predicate, object }); statements.push({ predicate, object }); }
    catch { errors.push({ field, message: "Enter a valid RDF value." }); }
  }
  const names = entityNameCollisions(store, label, iri);
  let suggested: ReturnType<typeof textAnalysisDraft> | undefined;
  if (label && !errors.some(e => e.field === "label")) suggested = textAnalysisDraft(store, label, epoch);
  for (const existing of suggested?.existing ?? []) if (!names.collisions.some(c => c.iri === existing.iri)) names.collisions.push({ ...existing, path: entityPath(store, existing.iri), kind: "normalized" });
  const creation: TextAnalysisClassInput = { label, comment, iri, parents: writtenParents.map(iri => ({ iri })), statements, checkAllEntities: true };
  const triples: Triple[] = [
    { subject: iri, predicate: TYPE, object: { literal: false, value: NS.owl + "Class" } },
    { subject: iri, predicate: NS.rdfs + "label", object: { literal: true, value: label, datatype: NS.xsd + "string" } },
    ...writtenParents.map(parent => ({ subject: iri, predicate: SUBCLASS, object: { literal: false, value: parent } })),
    ...(comment ? [{ subject: iri, predicate: NS.rdfs + "comment", object: { literal: true, value: comment, datatype: NS.xsd + "string" } }] : []),
    ...statements.map(statement => ({ subject: iri, ...statement })),
  ];
  const preview: FindCreationPreview = { label, iri, source: "", creation, statementCount: triples.length, parents: suggested?.parents ?? [], defaultParent: THING, existing: names.collisions.map(c => ({ iri: c.iri, label: c.label })), collisions: names.collisions, storeTotal: names.total, errors, version: store.version, datasetEpoch: epoch };
  return { creation, preview, triples };
}
export async function previewFindCreation(store: Store, input: unknown, epoch: number): Promise<FindCreationPreview> {
  const { preview, triples } = prepare(store, input, epoch);
  if (!preview.errors.length) {
    try { preview.source = await writeRdf(triples, "rdfxml"); }
    catch (error) { preview.errors.push({ field: "statements", message: (error as Error).message }); }
  }
  return preview;
}
export function createFindEntity(store: Store, input: unknown, epoch: number) {
  const { creation, preview } = prepare(store, input, epoch);
  if (preview.errors.length) throw Error(preview.errors[0].message);
  if (preview.collisions.length) throw Error(`${preview.collisions[0].label} already exists. Open the existing entity or change the label and IRI.`);
  return createTextAnalysisHierarchy(store, creation, true);
}
