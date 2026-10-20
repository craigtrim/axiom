import type { TextEntity } from "../shared/text-analysis";
// craigtrim/axiom#40: Mutatoc 0.4.0 reports x/y as code point offsets into the
// unchanged input, so highlights come from the engine rather than a replay of
// its tokenizer.
export interface MutatocToken {
  text: string;
  x: number;
  y: number;
  ner?: string | null;
  normal?: string;
  swaps?: { canon: string; type: string; tokens: MutatocToken[] };
}
// craigtrim/axiom#136: swap history includes gaps, so only generated rule terms
// can identify the words used. Ambiguous histories retain the generic explanation.
export interface MutatocSpanRule {
  canon: string;
  content: string[];
  distance: number;
  forward: boolean;
  reverse: boolean;
  context?: string[];
}
export type SpanRuleIndex = Map<string, (MutatocSpanRule & { key: string })[]>;
export function indexSpanRules(
  spans: Record<string, MutatocSpanRule[]>,
): SpanRuleIndex {
  const index: SpanRuleIndex = new Map();
  for (const [key, rules] of Object.entries(spans)) {
    for (const rule of rules) {
      const entries = index.get(rule.canon) ?? [];
      entries.push({ ...rule, key });
      index.set(rule.canon, entries);
    }
  }
  return index;
}
function spanWords(
  token: MutatocToken,
  rules: SpanRuleIndex,
): string[] | undefined {
  if (token.swaps?.type !== "spans") return;
  const children = token.swaps.tokens.filter((child) => child.normal !== "");
  if (
    !children.length ||
    children.some((child) => typeof child.normal !== "string")
  )
    return;
  const candidates = new Map<string, string[]>();
  for (const rule of rules.get(token.swaps.canon) ?? []) {
    // Axiom loads generated rules, which allow either order and have no context.
    // Do not reconstruct custom rule behavior if the runtime ever supplies it.
    if (!rule.forward || !rule.reverse || rule.context?.length) return;
    const terms = new Set([rule.key, ...rule.content]);
    if (
      children.length - 1 > rule.distance ||
      !terms.has(children[0].normal!) ||
      !terms.has(children.at(-1)!.normal!) ||
      [...terms].some(
        (term) => !children.some((child) => child.normal === term),
      )
    )
      continue;
    const selected = children.filter((child) => terms.has(child.normal!));
    // The history names no chosen occurrence or rule. A repeated term may be a gap.
    if (selected.length !== terms.size) return;
    const words = selected.map((child) => child.text.trim());
    candidates.set(JSON.stringify(words), words);
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}
function coveredMatches(token: MutatocToken): string[] {
  const names = new Set<string>();
  const pending = [...(token.swaps?.tokens ?? [])].reverse();
  while (pending.length) {
    const child = pending.pop()!;
    if (!child.swaps) continue;
    if (child.swaps.canon !== token.swaps?.canon) names.add(child.swaps.canon);
    for (let i = child.swaps.tokens.length - 1; i >= 0; i--)
      pending.push(child.swaps.tokens[i]);
  }
  return [...names];
}
/** Convert each top-level match's code point x/y to UTF-16 offsets into the
 * editor text. A match whose range does not slice exactly its own text is
 * rejected rather than highlighted somewhere it was not found.
 */
export function textEntities(
  text: string,
  tokens: MutatocToken[],
  rules: SpanRuleIndex = new Map(),
): TextEntity[] {
  const offsets = [0];
  for (const ch of text) offsets.push(offsets.at(-1)! + ch.length);
  const entities: TextEntity[] = [];
  for (const token of tokens) {
    if (!token.swaps) continue;
    const start = offsets[token.x],
      end = offsets[token.y];
    if (
      !Number.isInteger(token.x) ||
      !Number.isInteger(token.y) ||
      start === undefined ||
      end === undefined ||
      start >= end ||
      text.slice(start, end) !== token.text
    )
      throw Error(
        "The parser changed text that could not be mapped to the original. Highlights have been cleared to avoid marking the wrong words.",
      );
    const label = token.swaps.canon;
    const matchedWords = spanWords(token, rules);
    const covered = coveredMatches(token);
    entities.push({
      start,
      end,
      key: "ontology:" + label,
      label,
      source: "ontology",
      method: token.swaps.type,
      ...(matchedWords?.length ? { matchedWords } : {}),
      ...(covered.length ? { covered } : {}),
    });
  }
  return entities.sort((a, b) => a.start - b.start || b.end - a.end);
}
