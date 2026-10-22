// craigtrim/axiom#148: use frozen row counts, never the rendered table height.
export const runSetGap = 16;
export function suggestionRunLayout(
  width: number,
  height: number,
  runs: number,
  labelWidth: number,
  previousCapacity = 1,
) {
  // Target padding plus the reference's Status, Results, and action columns.
  const minWidth = Math.max(470, Math.ceil(labelWidth) + 16 + 150 + 80 + 120);
  let capacity = 1;
  for (let count = 2; count <= Math.min(3, runs); count++) {
    const required = count * minWidth + (count - 1) * runSetGap;
    if (width >= required + (count > previousCapacity ? 16 : 0))
      capacity = count;
  }
  let columns = capacity;
  for (let count = 1; count <= capacity; count++) {
    if ((1 + Math.ceil(runs / count)) * 26 <= height) {
      columns = count;
      break;
    }
  }
  return { columns, capacity, minWidth };
}
