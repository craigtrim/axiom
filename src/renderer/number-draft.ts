export interface NumberRange {
  min: number;
  max: number;
  integer?: boolean;
}

export function parseNumberDraft(
  text: string,
  range: NumberRange,
): number | undefined {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()))
    return;
  const value = Number(text);
  if (
    !Number.isFinite(value) ||
    value < range.min ||
    value > range.max ||
    (range.integer && !Number.isInteger(value))
  )
    return;
  return value;
}
