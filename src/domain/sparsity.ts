import type { Store } from "./store";
import { THING } from "./model";
import { namedClass, taxonomyChildren } from "./class-expressions";
import { displayName } from "./rdf-model";
import {
  readSparsityOptions,
  scoreSparsityRows,
  type SparsityReport,
  type SparsityRow,
} from "../shared/sparsity";

const cache = new WeakMap<
  Store,
  { version: number; reports: Map<string, SparsityReport> }
>();

/** Iterative Kosaraju traversal. Cycles are reported, never unrolled into counts. */
function cyclicNodes(
  children: Map<string, string[]>,
  parents: Map<string, string[]>,
) {
  const visited = new Set<string>(),
    order: string[] = [];
  for (const root of children.keys()) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ iri: root, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1],
        edges = children.get(frame.iri)!;
      if (frame.next < edges.length) {
        const child = edges[frame.next++];
        if (!visited.has(child)) {
          visited.add(child);
          stack.push({ iri: child, next: 0 });
        }
      } else {
        order.push(frame.iri);
        stack.pop();
      }
    }
  }
  visited.clear();
  const cyclic = new Set<string>();
  for (const root of order.reverse()) {
    if (visited.has(root)) continue;
    const component: string[] = [],
      pending = [root];
    visited.add(root);
    while (pending.length) {
      const iri = pending.pop()!;
      component.push(iri);
      for (const p of parents.get(iri) ?? []) {
        if (visited.has(p)) continue;
        visited.add(p);
        pending.push(p);
      }
    }
    if (component.length > 1 || children.get(root)!.includes(root))
      for (const iri of component) cyclic.add(iri);
  }
  return cyclic;
}

function measure(store: Store, root: string): SparsityReport {
  const started = performance.now(),
    entity = store.entities.get(root);
  if (!entity || !namedClass(entity))
    throw Error("Choose an ontology class to analyze.");
  const whole = root === THING;
  const scope = new Map<string, number>();
  const eligible = (iri: string) => {
    const e = store.entities.get(iri);
    return !!e && namedClass(e);
  };
  const pending = [root];
  scope.set(root, 0);
  if (whole)
    for (const e of store.entities.values()) {
      if (namedClass(e) && e.iri !== root) {
        scope.set(e.iri, 1);
        pending.push(e.iri);
      }
    }
  for (let i = 0; i < pending.length; i++) {
    const iri = pending[i];
    for (const child of taxonomyChildren(store.entities.get(iri))) {
      if (!eligible(child) || scope.has(child)) continue;
      scope.set(child, scope.get(iri)! + 1);
      pending.push(child);
    }
  }
  const children = new Map<string, string[]>(),
    parents = new Map<string, string[]>();
  for (const iri of scope.keys()) {
    children.set(
      iri,
      [...new Set(taxonomyChildren(store.entities.get(iri)))].filter((c) =>
        scope.has(c),
      ),
    );
    parents.set(iri, []);
  }
  for (const [iri, ids] of children)
    for (const child of ids) parents.get(child)!.push(iri);
  const cyclic = cyclicNodes(children, parents),
    affected = new Set(cyclic),
    ancestry = [...cyclic];
  // A branch containing a cycle has no reliable descendant comparison. Its
  // unaffected sub-branches can still be compared with one another.
  for (let i = 0; i < ancestry.length; i++)
    for (const p of parents.get(ancestry[i])!) {
      if (!affected.has(p)) {
        affected.add(p);
        ancestry.push(p);
      }
    }
  if (whole && !cyclic.has(root)) {
    const roots = [...scope.keys()].filter(
      (iri) =>
        iri !== root &&
        !cyclic.has(iri) &&
        !parents.get(iri)!.some((p) => p !== root),
    );
    children.set(root, [...new Set([...children.get(root)!, ...roots])]);
    // Depth is the shortest path from the visual whole-taxonomy root.
    scope.clear();
    scope.set(root, 0);
    const queue = [root];
    for (let i = 0; i < queue.length; i++)
      for (const child of children.get(queue[i])!) {
        if (!scope.has(child)) {
          scope.set(child, scope.get(queue[i])! + 1);
          queue.push(child);
        }
      }
  }
  const metrics = new Map<
    string,
    { children: number; nearby: number; discounted: number }
  >();
  for (const iri of children.keys()) {
    if (affected.has(iri)) continue;
    const seen = new Set([iri]),
      queue = [{ iri, depth: 0 }];
    let nearby = 0,
      discounted = 0;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      if (node.depth === 4) continue;
      for (const child of children.get(node.iri)!) {
        if (seen.has(child)) continue;
        seen.add(child);
        const depth = node.depth + 1;
        queue.push({ iri: child, depth });
        if (depth >= 2) {
          nearby++;
          discounted += 0.5 ** (depth - 2);
        }
      }
    }
    metrics.set(iri, {
      children: children.get(iri)!.length,
      nearby,
      discounted,
    });
  }
  const rows: SparsityRow[] = [];
  let groups = 0,
    unpaired = 0;
  const deficit = (count: number, reference: number) =>
    reference > 0 ? Math.max(0, 1 - count / reference) : 0;
  for (const [parent, ids] of children) {
    if (cyclic.has(parent)) continue;
    const peers = ids.filter((iri) => metrics.has(iri));
    if (peers.length < 2) {
      if (peers.length === 1) unpaired++;
      continue;
    }
    groups++;
    let totalChildren = 0,
      totalDiscounted = 0;
    for (const iri of peers) {
      const m = metrics.get(iri)!;
      totalChildren += m.children;
      totalDiscounted += m.discounted;
    }
    for (const iri of peers) {
      const m = metrics.get(iri)!,
        n = peers.length - 1;
      const peerChildren = (totalChildren - m.children) / n,
        peerDiscounted = (totalDiscounted - m.discounted) / n;
      rows.push({
        iri,
        name: displayName(store.entities.get(iri)!),
        parent,
        parentName:
          parent === THING
            ? "Whole taxonomy"
            : displayName(store.entities.get(parent)!),
        ...m,
        peerChildren,
        peerDiscounted,
        peers: n,
        depth: scope.get(iri) ?? 0,
        directDeficit: deficit(m.children, peerChildren),
        descendantDeficit: deficit(m.discounted, peerDiscounted),
        score: 0,
      });
    }
  }
  return {
    iri: root,
    name: whole ? "Whole taxonomy" : displayName(entity),
    version: store.version,
    classes: children.size - (whole ? 1 : 0),
    groups,
    unpaired,
    cycleClasses: cyclic.size,
    excludedBranches: affected.size,
    sharedClasses: [...parents.values()].filter((p) => p.length > 1).length,
    elapsedMs: performance.now() - started,
    rows,
  };
}

export function analyzeSparsity(store: Store, input: unknown): SparsityReport {
  const options = readSparsityOptions(input);
  let saved = cache.get(store);
  if (!saved || saved.version !== store.version) {
    saved = { version: store.version, reports: new Map() };
    cache.set(store, saved);
  }
  let report = saved.reports.get(options.iri);
  if (!report) {
    report = measure(store, options.iri);
    if (saved.reports.size >= 4)
      saved.reports.delete(saved.reports.keys().next().value!);
    saved.reports.set(options.iri, report);
  }
  const rows = scoreSparsityRows(report.rows, options.descendantWeight);
  return { ...report, rows };
}
