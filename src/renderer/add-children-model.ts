import type {
  TaxonomyHistoryEntry,
  TaxonomySuggestion,
} from "../shared/taxonomy-assistant";

import type {
  SuggestionItem,
  SuggestionStatus,
} from "./suggestion-workbench-model";
export interface ChildSuggestion extends TaxonomySuggestion, SuggestionItem {}
export { entityNameKey as normalizedSuggestionName } from "../shared/entity-names";
import { entityNameKey as normalizedSuggestionName } from "../shared/entity-names";

export function childSuggestions(
  entry?: TaxonomyHistoryEntry,
): ChildSuggestion[] {
  const seen = new Set<string>();
  return (entry?.response?.result.suggestions ?? []).flatMap(
    (suggestion, index) => {
      // Keep Unicode-only labels distinct; the Store remains the authority on identifiers.
      const id =
        normalizedSuggestionName(suggestion.label) ||
        suggestion.label.normalize("NFKC").toLowerCase();
      if (seen.has(id)) return [];
      seen.add(id);
      const issue = entry!.response!.issues[index] ?? null;
      const status: SuggestionStatus = entry!.applied.includes(index)
        ? "added"
        : issue?.startsWith(
              "An entity with this label or normalized name already exists.",
            )
          ? "exists"
          : issue
            ? "unavailable"
            : "available";
      return [{ ...suggestion, id, index, status, issue }];
    },
  );
}
