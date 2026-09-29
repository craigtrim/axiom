export type FindSynonymStatus = "available" | "label" | "exists";
export interface FindSynonymResult {
  added: boolean;
  value: string;
}

/** Keep the user's spelling; query syntax and IRIs are not synonym text. */
export function findSynonymText(input: string): string | undefined {
  const text = input.trim();
  if (!text || text.length > 256) return;
  if (
    /(?:^|\s)[\p{L}_][\p{L}\p{N}_-]*(?::[\p{L}_][\p{L}\p{N}_-]*)?:/u.test(
      text,
    ) ||
    /^<[^>]+>$|^\/.*\/[a-z]*$/iu.test(text) ||
    /[\\^$*|]|\[[^\]]*\]|\(\?|\.\+|\{\d+(?:,\d*)?\}/u.test(text)
  )
    return;
  return text;
}
