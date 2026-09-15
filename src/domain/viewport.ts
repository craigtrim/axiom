import { Store } from "./store";
import { type Kind, compare } from "./model";
export interface GraphNode {
  iri: string;
  kind: Kind;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  charge: number;
  degree: number;
  shownDegree: number;
  distance: number;
  radius: number;
  touched: number;
  pinned: boolean;
  expanded: boolean;
  dragging: boolean;
}
export interface GraphEdge {
  source: string;
  predicate: string;
  target: string;
  parallelIndex: number;
  parallelCount: number;
  bend?: { x: number; y: number };
}
export interface Admission {
  added: number;
  evicted: number;
  refused: number;
  evictedNames: string[];
}
export const edgeKey = (
  e: Pick<GraphEdge, "source" | "predicate" | "target">,
) => JSON.stringify([e.source, e.predicate, e.target]);
export const hidden = (n: GraphNode) => Math.max(0, n.degree - n.shownDegree);
export const nodeRadius = (degree: number, kind: Kind) =>
  (kind === "Individual" ? 5.5 : kind.endsWith("Property") ? 7 : 8.5) +
  Math.min(9, Math.log2(1 + degree) * 1.6);
export class Viewport {
  nodes = new Map<string, GraphNode>();
  edges = new Map<string, GraphEdge>();
  routes = new Map<string, { x: number; y: number }>();
  selectedEdge: string | null = null;
  focus = new Set<string>();
  budget = 1000;
  evictionMode = "degree";
  revision = 0;
  clock = 0;
  alpha = 0;
  selected: string | null = null;
  constructor(public store: Store) {}
  get hidden() {
    return [...this.nodes.values()].reduce((s, n) => s + hidden(n), 0);
  }
  evictionOrder() {
    const ns = [...this.nodes.values()].filter(
      (n) => !n.pinned && !this.focus.has(n.iri),
    );
    return ns.sort((a, b) =>
      this.evictionMode === "lru"
        ? a.touched - b.touched
        : b.distance - a.distance ||
          a.shownDegree - b.shownDegree ||
          a.touched - b.touched,
    );
  }
  admit(iris: string[], distance = 0, seed?: GraphNode): Admission {
    let fresh: string[] = [];
    for (const iri of new Set(iris)) {
      if (!this.store.exists(iri)) continue;
      const n = this.nodes.get(iri);
      if (n) {
        n.touched = ++this.clock;
        n.distance = Math.min(n.distance, distance);
      } else fresh.push(iri);
    }
    const evictedNames: string[] = [];
    const room = this.budget - this.nodes.size;
    if (fresh.length > room && this.evictionMode !== "refuse")
      for (const v of this.evictionOrder().slice(0, fresh.length - room)) {
        evictedNames.push(v.label);
        this.remove(v.iri);
      }
    const available = this.budget - this.nodes.size,
      refused = Math.max(0, fresh.length - available);
    fresh = fresh.slice(0, available);
    for (const iri of fresh) {
      const degree = this.store.neighbours(iri).total,
        kind = this.store.kind(iri),
        t = ++this.clock,
        a = t * 2.399963229728653,
        r = 34 * Math.sqrt((t % 240) + 1);
      this.nodes.set(iri, {
        iri,
        kind,
        label: this.store.label(iri),
        degree,
        radius: nodeRadius(degree, kind),
        distance,
        touched: t,
        x: (seed?.x ?? 0) + Math.cos(a) * r,
        y: (seed?.y ?? 0) + Math.sin(a) * r,
        vx: 0,
        vy: 0,
        charge: 0,
        shownDegree: 0,
        pinned: false,
        expanded: false,
        dragging: false,
      });
    }
    if (fresh.length) {
      this.link(fresh);
      this.alpha = Math.max(this.alpha, 0.9);
      this.revision++;
    }
    return {
      added: fresh.length,
      evicted: evictedNames.length,
      refused,
      evictedNames: evictedNames.slice(0, 3),
    };
  }
  link(added: string[]) {
    const all = new Set(this.nodes.keys()),
      fresh = new Set(added);
    for (const n of this.nodes.values()) {
      if (!fresh.has(n.iri) && !this.store.entities.has(n.iri)) continue;
      for (const a of this.store.neighbours(
        n.iri,
        fresh.has(n.iri) ? all : fresh,
      ).list) {
        if (!all.has(a.iri)) continue;
        const e: GraphEdge = {
            source: a.outgoing ? n.iri : a.iri,
            target: a.outgoing ? a.iri : n.iri,
            predicate: a.predicate,
            parallelIndex: 0,
            parallelCount: 1,
          },
          key = edgeKey(e);
        if (!this.edges.has(key)) {
          e.bend = this.routes.get(key);
          this.edges.set(key, e);
          this.nodes.get(e.source)!.shownDegree++;
          this.nodes.get(e.target)!.shownDegree++;
        }
      }
    }
    this.indexParallel();
  }
  indexParallel() {
    const groups = new Map<string, GraphEdge[]>();
    for (const e of this.edges.values()) {
      const key = JSON.stringify(
          e.source < e.target ? [e.source, e.target] : [e.target, e.source],
        ),
        g = groups.get(key) ?? [];
      g.push(e);
      groups.set(key, g);
    }
    for (const g of groups.values())
      g.forEach((e, i) => {
        e.parallelIndex = i;
        e.parallelCount = g.length;
      });
  }
  remove(iri: string) {
    if (!this.nodes.has(iri)) return false;
    for (const [key, e] of this.edges)
      if (e.source === iri || e.target === iri) {
        this.nodes.get(e.source)!.shownDegree--;
        this.nodes.get(e.target)!.shownDegree--;
        this.edges.delete(key);
      }
    this.nodes.delete(iri);
    this.focus.delete(iri);
    if (this.selected === iri) this.selected = null;
    this.alpha = Math.max(this.alpha, 0.4);
    this.revision++;
    return true;
  }
  expand(iri: string, limit = this.budget) {
    const n = this.nodes.get(iri);
    if (!n) return { added: 0, evicted: 0, refused: 0, evictedNames: [] };
    const adj = this.store.neighbours(iri);
    const wanted = [
      ...new Set(adj.list.map((a) => a.iri).filter((i) => !this.nodes.has(i))),
    ];
    const report = this.admit(wanted.slice(0, limit), n.distance + 1, n);
    n.expanded = adj.total <= 4000 && hidden(n) === 0;
    n.touched = ++this.clock;
    return report;
  }
  collapse(iri: string) {
    const n = this.nodes.get(iri);
    if (!n) return 0;
    const neighbours = new Set<string>();
    for (const e of this.edges.values())
      if (e.source === iri) neighbours.add(e.target);
      else if (e.target === iri) neighbours.add(e.source);
    let count = 0;
    for (const i of neighbours) {
      const v = this.nodes.get(i);
      if (
        v &&
        v.iri !== iri &&
        v.shownDegree <= 1 &&
        !v.pinned &&
        !this.focus.has(i)
      ) {
        this.remove(i);
        count++;
      }
    }
    n.expanded = false;
    return count;
  }
  seed(iris: string[], replace = true, expand = true) {
    if (replace) this.clear();
    for (const i of iris) if (this.nodes.has(i)) this.focus.add(i);
    const report = this.admit(iris);
    for (const i of iris) if (this.nodes.has(i)) this.focus.add(i);
    if (expand)
      for (const i of iris.slice(0, 12)) {
        const r = this.expand(
          i,
          Math.max(1, Math.floor(this.budget / Math.max(1, iris.length))),
        );
        report.added += r.added;
        report.evicted += r.evicted;
        report.refused += r.refused;
      }
    return report;
  }
  setBudget(value: number) {
    if (!Number.isFinite(value)) throw Error("Choose a numeric budget.");
    value = Math.min(3000, Math.max(100, Math.round(value)));
    const protectedCount = [...this.nodes.values()].filter(
      (n) => n.pinned || this.focus.has(n.iri),
    ).length;
    if (value < protectedCount)
      throw Error(
        protectedCount +
          " pinned or focused nodes require a budget of at least " +
          protectedCount +
          ".",
      );
    const remove = Math.max(0, this.nodes.size - value);
    for (const n of this.evictionOrder().slice(0, remove)) this.remove(n.iri);
    this.budget = value;
    this.revision++;
    return (
      "Budget set to " +
      value.toLocaleString("en-GB") +
      ". Paged out " +
      remove +
      " nodes."
    );
  }
  clear() {
    this.nodes.clear();
    this.edges.clear();
    this.focus.clear();
    this.selected = null;
    this.selectedEdge = null;
    this.alpha = 0;
    this.revision++;
  }
  refresh() {
    for (const n of [...this.nodes.values()]) {
      if (!this.store.exists(n.iri)) {
        this.remove(n.iri);
        continue;
      }
      n.label = this.store.label(n.iri);
      n.kind = this.store.kind(n.iri);
      n.degree = this.store.neighbours(n.iri).total;
      n.radius = nodeRadius(n.degree, n.kind);
      n.shownDegree = 0;
    }
    this.edges.clear();
    this.link([...this.nodes.keys()]);
    this.revision++;
  }
}
export function admissionText(r: Admission) {
  return (
    "Added " +
    r.added +
    " nodes." +
    (r.evicted ? " Paged out " + r.evicted + " to hold the budget." : "") +
    (r.refused
      ? " " + r.refused + " were left out. Raise the budget or unpin nodes."
      : "")
  );
}
