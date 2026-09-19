import type { AssistantId } from "./research";
import type { Entity, Triple } from "../domain/model";
export interface SuggestionDefinition {
  id: string;
  name: string;
  instructions: string;
  examples: string;
  predicate: string;
  valueType: "text" | "resource";
}
export interface SuggestionDocument {
  entity: Entity;
  statements: Triple[];
  version: number;
  datasetEpoch: number;
}
export interface SuggestionValue {
  value: string;
  label: string;
  reason: string;
}
import type { SynonymContext, SynonymValidation } from "./synonyms";
export interface SuggestionRun {
  id: string;
  mode: string;
  namespace: string;
  iri: string;
  label: string;
  startedAt: number;
  state: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  provider?: AssistantId;
  definition?: SuggestionDefinition;
  document: SuggestionDocument;
  prompt: string;
  synonymContext?: SynonymContext;
  excluded?: SynonymValidation["excluded"];
  values: SuggestionValue[];
  applied: number[];
  error?: string;
  auditId?: string;
  session: string;
}
export function readSuggestionDefinition(value: unknown): SuggestionDefinition {
  const v = value as SuggestionDefinition;
  if (
    !v ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(v.id) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 100 ||
    typeof v.instructions !== "string" ||
    !v.instructions.trim() ||
    v.instructions.length > 20000 ||
    typeof v.examples !== "string" ||
    v.examples.length > 20000 ||
    typeof v.predicate !== "string" ||
    !/^[a-z][a-z0-9+.-]*:\S+$/i.test(v.predicate) ||
    v.predicate.startsWith("_:") ||
    v.predicate.length > 10000 ||
    !["text", "resource"].includes(v.valueType)
  )
    throw Error(
      "Give the suggestion a name, instructions and a valid predicate.",
    );
  return {
    id: v.id,
    name: v.name.trim(),
    instructions: v.instructions.trim(),
    examples: v.examples.trim(),
    predicate: v.predicate,
    valueType: v.valueType,
  };
}
export function parseSuggestionValues(
  raw: unknown,
  definition: SuggestionDefinition,
): SuggestionValue[] {
  if (typeof raw === "string") {
    const text = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      raw = JSON.parse(text);
    } catch {
      throw Error(
        "The assistant did not return a valid list of suggested values. Open Error details to inspect the response.",
      );
    }
  }
  const values = (raw as { suggestions?: unknown[] })?.suggestions;
  if (!Array.isArray(values) || values.length > 100)
    throw Error("Expected a list of at most 100 suggested values.");
  const seen = new Set<string>();
  return values
    .map((raw) => {
      const v = raw as SuggestionValue;
      if (
        !v ||
        typeof v.value !== "string" ||
        !v.value.trim() ||
        v.value.length > 10000 ||
        typeof v.reason !== "string" ||
        !v.reason.trim() ||
        v.reason.length > 4000
      )
        throw Error("Each suggestion needs a value and a reason.");
      if (
        definition.valueType === "resource" &&
        !/^[a-z][a-z0-9+.-]*:\S+$/i.test(v.value)
      )
        throw Error("A suggested resource must be a full IRI.");
      return {
        value: v.value.trim(),
        label: v.value.trim(),
        reason: v.reason.trim(),
      };
    })
    .filter((v) => {
      if (seen.has(v.value)) return false;
      seen.add(v.value);
      return true;
    });
}
