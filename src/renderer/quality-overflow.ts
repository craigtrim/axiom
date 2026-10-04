/** Lower priorities stay in the toolbar longer. Order on the bar never changes. */
export function qualityOverflow(
  available: number,
  fixed: number,
  gap: number,
  items: readonly { id: string; width: number; priority: number }[],
): Set<string> {
  const hidden = new Set<string>();
  let required = fixed + items.reduce((n, item) => n + item.width + gap, 0);
  for (const item of [...items].sort((a, b) => b.priority - a.priority)) {
    if (required <= available) break;
    hidden.add(item.id);
    required -= item.width + gap;
  }
  return hidden;
}
