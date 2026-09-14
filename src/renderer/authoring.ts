import { command, state } from "./client";
import { THING } from "../domain/model";
export type CreationKind =
  | "Class"
  | "Individual"
  | "ObjectProperty"
  | "DataProperty"
  | "AnnotationProperty";
export interface Creation {
  kind: CreationKind;
  parent: string;
  position?: { x: number; y: number };
  epoch: number;
}
let pending: Creation | undefined;
export function creationDraft(
  kind: CreationKind = "Class",
  position?: { x: number; y: number },
): Creation {
  const selected = state?.entities.find((e) => e.iri === state?.selected);
  return {
    kind,
    parent:
      selected && ["Class", "Defined"].includes(selected.kind)
        ? selected.iri
        : THING,
    position,
    epoch: state!.datasetEpoch,
  };
}
export function beginCreation(
  kind: CreationKind = "Class",
  position?: { x: number; y: number },
) {
  pending = creationDraft(kind, position);
  command("view.hierarchy");
  command("authoring.create");
}
export const takeCreation = () => {
  const result = pending;
  pending = undefined;
  return result;
};
let editorIri: string | undefined;
export function editEntity(iri: string) {
  editorIri = iri;
  command("entity.edit");
}
export function takeEditorIri() {
  const iri = editorIri;
  editorIri = undefined;
  return iri ?? state?.selected;
}
export const entityDragType = "application/x-axiom-entity";
