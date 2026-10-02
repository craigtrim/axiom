/** Editor records retain insertion order, without assigning RDF meaning to it. */
export interface StatementGroup<Value> {
  predicate: string;
  values: [Value, ...Value[]];
}

/** Adapt existing RDF and draft contracts at the table boundary. */
export function groupStatements<Value>(
  statements: { predicate: string; value: Value }[],
): StatementGroup<Value>[] {
  const groups = new Map<string, StatementGroup<Value>>();
  for (const { predicate, value } of statements) {
    const group = groups.get(predicate);
    if (group) group.values.push(value);
    else groups.set(predicate, { predicate, values: [value] });
  }
  return [...groups.values()];
}
