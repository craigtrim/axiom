export interface HierarchySelection {
  ids: string[];
  anchor: string | null;
  focus: string | null;
}
export const singleHierarchySelection = (
  iri: string | null,
): HierarchySelection => ({ ids: iri ? [iri] : [], anchor: iri, focus: iri });

/** Ranges follow visible rows, never edges or descendant relationships. */
export function selectHierarchyRow(
  previous: HierarchySelection,
  iri: string,
  visible: string[],
  modifiers: { toggle?: boolean; range?: boolean; focusOnly?: boolean } = {},
): HierarchySelection {
  if (modifiers.focusOnly) return { ...previous, focus: iri };
  if (modifiers.range && previous.anchor && visible.includes(previous.anchor)) {
    const a = visible.indexOf(previous.anchor),
      b = visible.indexOf(iri);
    if (b < 0) return previous;
    const range = visible.slice(Math.min(a, b), Math.max(a, b) + 1);
    return {
      ids: modifiers.toggle ? [...new Set([...previous.ids, ...range])] : range,
      anchor: previous.anchor,
      focus: iri,
    };
  }
  if (modifiers.toggle)
    return {
      ids: previous.ids.includes(iri)
        ? previous.ids.filter((id) => id !== iri)
        : [...previous.ids, iri],
      anchor: iri,
      focus: iri,
    };
  return singleHierarchySelection(iri);
}

export function pruneHierarchySelection(
  selection: HierarchySelection,
  visible: string[],
): HierarchySelection {
  const allowed = new Set(visible),
    ids = selection.ids.filter((id) => allowed.has(id));
  const focus =
    selection.focus && allowed.has(selection.focus)
      ? selection.focus
      : (ids[0] ?? visible[0] ?? null);
  const anchor =
    selection.anchor && allowed.has(selection.anchor)
      ? selection.anchor
      : focus;
  return ids.length === selection.ids.length &&
    focus === selection.focus &&
    anchor === selection.anchor
    ? selection
    : { ids, anchor, focus };
}
