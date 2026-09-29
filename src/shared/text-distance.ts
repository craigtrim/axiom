export const normalizeDistanceText = (text: string) =>
  text.normalize("NFC").toLowerCase();

/** Case-insensitive Levenshtein distance over Unicode characters. */
export function levenshteinDistance(left: string, right: string): number {
  let a = Array.from(normalizeDistanceText(left));
  let b = Array.from(normalizeDistanceText(right));
  if (a.length > b.length) [a, b] = [b, a];
  const row = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let diagonal = row[0];
    row[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const above = row[i];
      row[i] = Math.min(
        above + 1,
        row[i - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[a.length];
}
