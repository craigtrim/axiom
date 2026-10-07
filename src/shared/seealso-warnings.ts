import type { Term } from "../domain/model";
import { synonymKey } from "./synonyms";

export const seeAlsoValueKey = (term: Pick<Term, "literal" | "value">) =>
  JSON.stringify([
    term.literal,
    term.literal ? synonymKey(term.value) : term.value,
  ]);

export const seeAlsoOccurrence = (
  ontology: string,
  subject: string,
  term: Pick<Term, "literal" | "value">,
) => JSON.stringify([ontology, subject, seeAlsoValueKey(term)]);

export interface SeeAlsoMatches {
  total: number;
  entities: { iri: string; label: string }[];
}
export interface SeeAlsoWarningSettings {
  enabled: boolean;
  dismissed: string[];
}
export const defaultSeeAlsoWarnings: SeeAlsoWarningSettings = {
  enabled: true,
  dismissed: [],
};
export function readSeeAlsoWarnings(value: unknown): SeeAlsoWarningSettings {
  const input =
    value && typeof value === "object"
      ? (value as Partial<SeeAlsoWarningSettings>)
      : {};
  const dismissed: string[] = [];
  let size = 0;
  // Bound the serialized preference size as well as the number of entries.
  // Long annotation values must still be dismissible without exceeding the
  // overall workbench settings limit.
  const candidates = Array.isArray(input.dismissed)
    ? [
        ...new Set(
          input.dismissed.filter((v): v is string => typeof v === "string"),
        ),
      ]
    : [];
  for (const key of candidates.reverse()) {
    const length = JSON.stringify(key).length;
    if (size + length > 1000000) continue;
    dismissed.push(key);
    size += length;
    if (dismissed.length === 1000) break;
  }
  return {
    enabled: input.enabled !== false,
    dismissed: dismissed.reverse(),
  };
}
