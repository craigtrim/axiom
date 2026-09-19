import type { Entity, Triple } from "../domain/model";
import {
  sourceFormats,
  type SourceDocument,
  type EntitySourceDocument,
} from "./source";
export interface DocumentData {
  parentExpressions?: Record<string, string[]>;
  entity: Entity;
  statements: Triple[];
  version: number;
  datasetEpoch: number;
}
export interface EditorDraft {
  iri: string;
  nextIri: string;
  automaticIri?: boolean;
  statements: Triple[];
  loaded: DocumentData;
}
export interface SourceDraft {
  loaded: SourceDocument;
  text: string;
}
export interface EntitySourceDraft {
  loaded: EntitySourceDocument;
  text: string;
}
export interface SavedEditorDrafts {
  version: 1;
  storeVersion: number;
  entities: EditorDraft[];
  source?: SourceDraft;
  entitySources: EntitySourceDraft[];
}
const object = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const triples = (v: any): boolean =>
  Array.isArray(v) &&
  v.every(
    (t: any) =>
      object(t) &&
      text(t.subject) &&
      text(t.predicate) &&
      object(t.object) &&
      text(t.object.value),
  );
const source = (v: any): boolean =>
  object(v) &&
  text(v.text) &&
  object(v.loaded) &&
  text(v.loaded.text) &&
  Number.isFinite(v.loaded.version) &&
  Number.isFinite(v.loaded.datasetEpoch) &&
  sourceFormats.some((f) => f.id === v.loaded.format);
export function readEditorDrafts(
  value: unknown,
): SavedEditorDrafts | undefined {
  if (value === undefined) return undefined;
  const d = value as SavedEditorDrafts;
  if (
    !object(d) ||
    d.version !== 1 ||
    !Number.isFinite(d.storeVersion) ||
    !Array.isArray(d.entities) ||
    d.entities.length > 1000 ||
    !d.entities.every(
      (e) =>
        object(e) &&
        text(e.iri) &&
        text(e.nextIri) &&
        triples(e.statements) &&
        object(e.loaded) &&
        object(e.loaded.entity) &&
        text(e.loaded.entity.iri) &&
        triples(e.loaded.statements),
    ) ||
    (d.source !== undefined && !source(d.source)) ||
    !Array.isArray(d.entitySources) ||
    d.entitySources.length > 1000 ||
    !d.entitySources.every(
      (e) => source(e) && text(e.loaded.iri) && triples(e.loaded.original),
    ) ||
    JSON.stringify(d).length > 128 * 1024 * 1024
  )
    throw Error("Invalid saved editor drafts.");
  return structuredClone(d);
}
