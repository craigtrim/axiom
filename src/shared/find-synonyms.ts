export type FindSynonymStatus = "available" | "label" | "exists";
export interface FindSynonymResult {
  added: boolean;
  value: string;
}

/** #127: Find text is literal synonym text, including punctuation. */
export function findSynonymText(input: string): string | undefined {
  return input.trim() || undefined;
}
