/** Node-centre spacing, independent of glyph size and camera zoom. */
export const MIN_GRAPH_SPACING = 0.5;
export const MAX_GRAPH_SPACING = 3;
export const DEFAULT_GRAPH_SPACING = 1;
export function validGraphSpacing(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_GRAPH_SPACING &&
    value <= MAX_GRAPH_SPACING
  );
}
