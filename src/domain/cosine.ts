/** Text normalization for literal and prefix search. Semantic search uses MPNet. */
export function normalizeSearchText(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
