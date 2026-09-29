import type { Entity } from "../domain/model";
import type { SuggestionRun } from "../shared/suggestions";
import type { SuggestionItem } from "./suggestion-workbench-model";
import { levenshteinDistance } from "../shared/text-distance";
import { synonymDefinition, synonymKey } from "../shared/synonyms";

export interface SavedSuggestionItem extends SuggestionItem {
  value: string;
}

export function savedSuggestions(
  entry: SuggestionRun | undefined,
  entities: Entity[],
): SavedSuggestionItem[] {
  if (!entry) return [];
  const parents = entry.mode === "parents";
  const target = entities.find((e) => e.iri === entry.iri);
  const recorded = new Set(
    (entry.document?.statements ?? [])
      .filter(
        (t) => t.predicate === synonymDefinition.predicate && t.object.literal,
      )
      .map((t) => synonymKey(t.object.value)),
  );
  const rows = entry.values.map((value, index): SavedSuggestionItem => {
    const parent = parents
      ? entities.find((e) => e.iri === value.value)
      : undefined;
    const added = entry.applied.includes(index);
    const exists = parents
      ? target?.parents.includes(value.value)
      : recorded.has(synonymKey(value.value));
    const missing = parents && !parent;
    return {
      ...value,
      id: "value:" + (parents ? value.value : synonymKey(value.value)),
      index,
      definition: parents
        ? parent?.comment || "No definition recorded."
        : value.reason || "No explanation saved.",
      ...(!parents && {
        distance: levenshteinDistance(target?.name ?? entry.label, value.label),
      }),
      status: added
        ? "added"
        : exists
          ? "exists"
          : missing
            ? "unavailable"
            : "available",
      issue: exists
        ? parents
          ? "This class is already a direct parent."
          : "Already recorded for this entity."
        : missing
          ? "This parent class is no longer in the ontology."
          : null,
    };
  });
  const all = rows.concat(
    (entry.excluded ?? []).map((value, index) => ({
      id: "excluded:" + index,
      index: entry.values.length + index,
      value: value.value,
      label: value.value,
      definition: value.reason,
      reason: value.reason,
      reasonTitle: "Existing synonym",
      ...(!parents && {
        distance: levenshteinDistance(target?.name ?? entry.label, value.value),
      }),
      status: "exists",
      issue: value.reason,
    })),
  );
  if (parents) return all;
  const unique = new Map<string, SavedSuggestionItem>();
  const priority = { added: 3, exists: 2, available: 1, unavailable: 0 };
  for (const row of all) {
    if (row.distance === 0) continue;
    const key = synonymKey(row.value);
    const previous = unique.get(key);
    if (!previous || priority[row.status] > priority[previous.status])
      unique.set(key, row);
  }
  return [...unique.values()];
}
