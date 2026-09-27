import { NS, shorten, type Triple } from "./model";
import { statementKey } from "./rdf-model";

const single = new Set([
  NS.rdfs + "label",
  NS.rdfs + "comment",
  NS.skos + "prefLabel",
  NS.dc + "description",
  NS.dcterms + "description",
  ...["first", "rest"].map((n) => NS.rdf + n),
  ...[
    "onProperty",
    "onClass",
    "onDataRange",
    "someValuesFrom",
    "allValuesFrom",
    "hasValue",
    "hasSelf",
    "cardinality",
    "minCardinality",
    "maxCardinality",
    "qualifiedCardinality",
    "minQualifiedCardinality",
    "maxQualifiedCardinality",
    "intersectionOf",
    "unionOf",
    "oneOf",
    "complementOf",
  ].map((n) => NS.owl + n),
]);
const prose = new Set([
  NS.rdfs + "comment",
  NS.dc + "description",
  NS.dcterms + "description",
]);
const keys = (ts: Triple[]) => new Map(ts.map((t) => [statementKey(t), t]));
const equal = (a: Map<string, Triple>, b: Map<string, Triple>) =>
  a.size === b.size && [...a.keys()].every((k) => b.has(k));
const slot = (t: Triple, functional: Set<string>) =>
  JSON.stringify([
    t.subject,
    t.predicate,
    t.graph ?? "",
    // Language variants can be edited independently. Changing the datatype of
    // one value still competes with another edit to that value.
    t.object.literal && !functional.has(t.predicate)
      ? (t.object.language ?? "").toLowerCase()
      : "",
  ]);
function conflict(t: Triple): never {
  throw Error(
    "This entity changed in " +
      shorten(t.predicate) +
      ". Both edits change the same value differently. Your draft is preserved; review this field before saving.",
  );
}

/** Merge two non-overlapping edits to a comment. Overlap remains a conflict. */
function mergeText(
  base: string,
  local: string,
  current: string,
): string | undefined {
  const edit = (next: string) => {
    let start = 0,
      end = base.length,
      nextEnd = next.length;
    while (start < end && start < nextEnd && base[start] === next[start])
      start++;
    while (
      end > start &&
      nextEnd > start &&
      base[end - 1] === next[nextEnd - 1]
    ) {
      end--;
      nextEnd--;
    }
    return { start, end, text: next.slice(start, nextEnd) };
  };
  const edits = [edit(local), edit(current)].sort((a, b) => a.start - b.start);
  const [a, b] = edits;
  if (a.end > b.start || a.start === b.start) return;
  return (
    base.slice(0, a.start) +
    a.text +
    base.slice(a.end, b.start) +
    b.text +
    base.slice(b.end)
  );
}

/** Three-way RDF merge. Assertions are sets; a changed value is not an addition. */
export function mergeEntityStatements(
  base: Triple[],
  local: Triple[],
  current: Triple[],
  functional = new Set<string>(),
): Triple[] {
  if (
    ![base, local, current].every(
      (ts) => Array.isArray(ts) && ts.length <= 100000,
    )
  )
    throw Error("Invalid entity merge statements.");
  const b = keys(base),
    l = keys(local),
    c = keys(current);
  if (equal(b, c)) return [...l.values()];
  if (equal(b, l) || equal(l, c)) return [...c.values()];
  const groups = new Map<string, [Triple[], Triple[], Triple[]]>();
  for (const [i, ts] of [base, local, current].entries())
    for (const t of ts) {
      const k = slot(t, functional);
      if (!groups.has(k)) groups.set(k, [[], [], []]);
      groups.get(k)![i].push(t);
    }
  const result = new Map(c);
  for (const [bs, ls, cs] of groups.values()) {
    const bg = keys(bs),
      lg = keys(ls),
      cg = keys(cs);
    if (equal(bg, lg) || equal(lg, cg)) continue;
    const removedLocal = [...bg.keys()].filter((k) => !lg.has(k));
    const removedCurrent = new Set([...bg.keys()].filter((k) => !cg.has(k)));
    const addedLocal = new Map([...lg].filter(([k]) => !bg.has(k)));
    const addedCurrent = new Map([...cg].filter(([k]) => !bg.has(k)));
    const t = ls[0] ?? cs[0] ?? bs[0];
    const bothChanged = !equal(bg, cg);
    const competing =
      removedLocal.some((k) => removedCurrent.has(k)) &&
      !equal(addedLocal, addedCurrent) &&
      // The same replacement plus additional assertions is compatible.
      !(
        addedLocal.size > 0 &&
        addedCurrent.size > 0 &&
        ([...addedLocal.keys()].every((k) => addedCurrent.has(k)) ||
          [...addedCurrent.keys()].every((k) => addedLocal.has(k)))
      );
    const singleValue =
      (single.has(t.predicate) || functional.has(t.predicate)) &&
      addedLocal.size > 0 &&
      addedCurrent.size > 0 &&
      !equal(addedLocal, addedCurrent);
    if (bothChanged && (competing || singleValue)) {
      if (
        prose.has(t.predicate) &&
        bg.size === 1 &&
        lg.size === 1 &&
        cg.size === 1 &&
        bs[0].object.literal &&
        ls[0].object.literal &&
        cs[0].object.literal &&
        bs[0].object.datatype === ls[0].object.datatype &&
        bs[0].object.datatype === cs[0].object.datatype
      ) {
        const value = mergeText(
          bs[0].object.value,
          ls[0].object.value,
          cs[0].object.value,
        );
        if (value !== undefined) {
          for (const k of cg.keys()) result.delete(k);
          const merged = { ...cs[0], object: { ...cs[0].object, value } };
          result.set(statementKey(merged), merged);
          continue;
        }
      }
      conflict(t);
    }
    for (const k of removedLocal) result.delete(k);
    for (const [k, t] of addedLocal) result.set(k, t);
  }
  // Removing an anonymous expression must not discard concurrent edits inside
  // it. Named resources are independently editable entities, not owned children.
  const owners = new Map<string, Set<string>>();
  for (const t of base)
    if (!t.object.literal && t.object.value.startsWith("_:")) {
      if (!owners.has(t.object.value)) owners.set(t.object.value, new Set());
      owners.get(t.object.value)!.add(t.subject);
    }
  for (const [side, other] of [
    [l, c],
    [c, l],
  ]) {
    const changed = new Set<string>();
    for (const [k, t] of b) if (!other.has(k)) changed.add(t.subject);
    for (const [k, t] of other) if (!b.has(k)) changed.add(t.subject);
    const queue = [...changed];
    while (queue.length) {
      for (const owner of owners.get(queue.pop()!) ?? [])
        if (!changed.has(owner)) {
          changed.add(owner);
          queue.push(owner);
        }
    }
    for (const [k, t] of b)
      if (
        !side.has(k) &&
        other.has(k) &&
        !t.object.literal &&
        t.object.value.startsWith("_:") &&
        changed.has(t.object.value)
      )
        conflict(t);
  }
  return [...result.values()];
}

/** Reconnect inline blank nodes to their original structural slots after parsing. */
export function alignAnonymousStatements(
  base: Triple[],
  local: Triple[],
  root: string,
): Triple[] {
  const index = (ts: Triple[]) => {
    const out = new Map<string, Map<string, string[]>>();
    for (const t of ts)
      if (!t.object.literal && t.object.value.startsWith("_:")) {
        if (!out.has(t.subject)) out.set(t.subject, new Map());
        const group = out.get(t.subject)!,
          key = JSON.stringify([t.predicate, t.graph ?? ""]);
        if (!group.has(key)) group.set(key, []);
        group.get(key)!.push(t.object.value);
      }
    return out;
  };
  const before = index(base),
    after = index(local),
    mapping = new Map<string, string>();
  const originalIds = new Set(
    base.flatMap((t) => [
      t.subject,
      ...(!t.object.literal ? [t.object.value] : []),
      ...(t.graph ? [t.graph] : []),
    ]),
  );
  const used = new Set<string>(),
    queue: Array<[string, string]> = [[root, root]];
  const visited = new Set<string>();
  while (queue.length) {
    const [oldId, newId] = queue.pop()!,
      visit = JSON.stringify([oldId, newId]);
    if (visited.has(visit)) continue;
    visited.add(visit);
    for (const [key, newIds] of after.get(newId) ?? []) {
      const oldIds = before.get(oldId)?.get(key) ?? [];
      for (const id of newIds) if (oldIds.includes(id)) queue.push([id, id]);
      const available = oldIds.filter(
        (id) => !used.has(id) && !newIds.includes(id),
      );
      const fresh = newIds.filter(
        (id) => !originalIds.has(id) && !mapping.has(id),
      );
      if (available.length === 1 && fresh.length === 1) {
        mapping.set(fresh[0], available[0]);
        used.add(available[0]);
        queue.push([available[0], fresh[0]]);
      }
    }
  }
  const remap = (id: string) => mapping.get(id) ?? id;
  return local.map((t) => ({
    ...t,
    subject: remap(t.subject),
    object: t.object.literal
      ? t.object
      : { ...t.object, value: remap(t.object.value) },
    ...(t.graph ? { graph: remap(t.graph) } : {}),
  }));
}
