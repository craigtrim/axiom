import {
  DEFAULT_GRAPH_SPACING,
  validGraphSpacing,
} from "../shared/graph-spacing";
import { Viewport, type GraphNode } from "./viewport";
import { Store } from "./store";
import { ForceLayout, collisions, isHierarchy } from "./force";
import { NS, TYPE, local, humanise, kindLabel } from "./model";
import { isExternalLayout, type LayoutMode } from "../shared/layout-options";
export type { LayoutMode } from "../shared/layout-options";
export interface GroupBlock {
  label: string;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export class Layouts {
  choice: LayoutMode = "auto";
  resolved: LayoutMode = "force";
  force: ForceLayout;
  spacing = DEFAULT_GRAPH_SPACING;
  groups: GroupBlock[] = [];
  rings: number[] = [];
  ringOrigin = { x: 0, y: 0 };
  constructor(
    public view: Viewport,
    public store: Store,
  ) {
    this.force = new ForceLayout(view);
  }
  choose(): LayoutMode {
    if (this.choice !== "auto") return this.choice;
    const n = this.view.nodes.size,
      es = [...this.view.edges.values()],
      m = es.length;
    if (!n) return "force";
    if (
      (n > 300 &&
        m &&
        es.filter((e) => e.predicate === TYPE).length / m > 0.55) ||
      n > 500
    )
      return "grid";
    if (
      m >= n * 0.5 &&
      m &&
      es.filter((e) => isHierarchy(e.predicate)).length / m > 0.78 &&
      n <= 400
    )
      return "hierarchy";
    if (this.view.focus.size <= 2 && n > 14) return "radial";
    return "force";
  }
  run(fresh = true) {
    if (fresh)
      for (const node of this.view.nodes.values()) node.layoutFixed = false;
    this.resolved = this.choose();
    this.groups = [];
    this.rings = [];
    this.view.indexParallel();
    if (!this.view.nodes.size) {
      this.view.alpha = 0;
      return;
    }
    this.force.spacing = this.spacing;
    if (this.resolved === "force") this.force.reset(fresh);
    else {
      this.view.alpha = 0;
      if (this.resolved === "hierarchy") this.hierarchy();
      if (this.resolved === "radial") this.radial();
      if (this.resolved === "grid") this.grid();
      if (this.resolved === "circle") this.circular();
      if (!isExternalLayout(this.resolved)) this.scaleGeometry(this.spacing);
    }
  }
  /** Change density in place, including ELK layouts, without restarting or fitting. */
  setSpacing(value: number) {
    if (!validGraphSpacing(value))
      throw Error("Node spacing must be between 50% and 300%.");
    if (value === this.spacing) return;
    const ratio = value / this.spacing;
    for (const node of this.view.nodes.values()) node.layoutFixed = false;
    this.scaleGeometry(ratio);
    // Manually routed bends belong to graph coordinates too.
    for (const route of this.view.routes.values()) {
      route.x *= ratio;
      route.y *= ratio;
      for (const point of route.points ?? []) {
        point.x *= ratio;
        point.y *= ratio;
      }
    }
    this.spacing = value;
    this.force.spacing = value;
    if (this.resolved === "force") this.force.reset(false);
  }
  private scaleGeometry(factor: number) {
    const ringAnchor = this.rings.length
      ? [...this.view.nodes.values()].find(
          (node) =>
            node.x === this.ringOrigin.x && node.y === this.ringOrigin.y,
        )
      : undefined;
    for (const node of this.view.nodes.values()) {
      if (!node.pinned && !node.layoutFixed && !node.dragging) {
        node.x *= factor;
        node.y *= factor;
      }
      node.vx = node.vy = 0;
    }
    this.groups = this.groups.map((group) => ({
      ...group,
      x: group.x * factor,
      y: group.y * factor,
      width: group.width * factor,
      height: group.height * factor,
    }));
    this.rings = this.rings.map((radius) => radius * factor);
    this.ringOrigin = ringAnchor
      ? { x: ringAnchor.x, y: ringAnchor.y }
      : { x: this.ringOrigin.x * factor, y: this.ringOrigin.y * factor };
  }
  circular() {
    const ns = [...this.view.nodes.values()].sort((a, b) =>
        a.label.localeCompare(b.label, "en-GB"),
      ),
      r = Math.max(
        90,
        ns.reduce((s, n) => s + n.radius * 2 + 36, 0) / (2 * Math.PI),
      );
    ns.forEach((n, i) => {
      if (!n.pinned && !n.layoutFixed) {
        const a = (2 * Math.PI * i) / ns.length - Math.PI / 2;
        n.x = r * Math.cos(a);
        n.y = r * Math.sin(a);
      }
      n.vx = n.vy = 0;
    });
  }
  centre() {
    const ns = [...this.view.nodes.values()];
    if (!ns.length) return;
    const x =
        (Math.min(...ns.map((n) => n.x)) + Math.max(...ns.map((n) => n.x))) / 2,
      y =
        (Math.min(...ns.map((n) => n.y)) + Math.max(...ns.map((n) => n.y))) / 2;
    for (const n of ns)
      if (!n.pinned && !n.layoutFixed) {
        n.x -= x;
        n.y -= y;
        n.vx = n.vy = 0;
      }
  }
  hierarchy() {
    const ns = [...this.view.nodes.values()],
      kids = new Map(ns.map((n) => [n.iri, [] as string[]])),
      pars = new Map(ns.map((n) => [n.iri, [] as string[]])),
      nbr = new Map(ns.map((n) => [n.iri, [] as string[]]));
    for (const e of this.view.edges.values()) {
      nbr.get(e.source)!.push(e.target);
      nbr.get(e.target)!.push(e.source);
      if (isHierarchy(e.predicate)) {
        pars.get(e.source)!.push(e.target);
        kids.get(e.target)!.push(e.source);
      }
    }
    const layers = new Map<string, number>(),
      marked = new Set<string>();
    const depth = (u: string): number => {
      if (layers.has(u)) return layers.get(u)!;
      if (marked.has(u)) return 0;
      marked.add(u);
      let d = 0;
      for (const p of pars.get(u)!) d = Math.max(d, depth(p) + 1);
      layers.set(u, d);
      return d;
    };
    for (const n of ns) depth(n.iri);
    for (const n of ns)
      if (
        !pars.get(n.iri)!.length &&
        !kids.get(n.iri)!.length &&
        nbr.get(n.iri)!.length
      )
        layers.set(
          n.iri,
          Math.max(...nbr.get(n.iri)!.map((i) => layers.get(i)!)) + 1,
        );
    const rows = Array.from(
      { length: Math.max(...layers.values()) + 1 },
      () => [] as GraphNode[],
    );
    for (const n of ns) rows[layers.get(n.iri)!].push(n);
    const stack = [...ns.map((n) => n.iri), ...rows[0].map((n) => n.iri)],
      ord = new Map<string, number>();
    while (stack.length) {
      const u = stack.pop()!;
      if (ord.has(u)) continue;
      ord.set(u, ord.size);
      for (const c of [...kids.get(u)!].sort((a, b) =>
        local(b).localeCompare(local(a), "en-GB"),
      ))
        if (!ord.has(c)) stack.push(c);
    }
    for (const row of rows)
      row.sort((a, b) => ord.get(a.iri)! - ord.get(b.iri)!);
    const pos = new Map<string, number>();
    const index = () => {
      for (const row of rows) row.forEach((n, i) => pos.set(n.iri, i));
    };
    index();
    if (rows.every((r) => r.length <= 260))
      for (let pass = 0; pass < 8; pass++) {
        const up = pass % 2 === 0;
        for (const row of up ? rows : [...rows].reverse()) {
          const median = (n: GraphNode) => {
            const points = (up ? pars : kids)
                .get(n.iri)!
                .map((v) => pos.get(v)!)
                .sort((a, b) => a - b),
              m = Math.floor(points.length / 2);
            return !points.length
              ? pos.get(n.iri)!
              : points.length % 2
                ? points[m]
                : (points[m - 1] + points[m]) / 2;
          };
          row.sort(
            (a, b) =>
              median(a) - median(b) || pos.get(a.iri)! - pos.get(b.iri)!,
          );
          index();
        }
      }
    const widths = new Map(
      ns.map((n) => [
        n.iri,
        Math.min(200, Math.max(2 * n.radius + 18, n.label.length * 6.8 + 16)),
      ]),
    );
    for (const row of rows) {
      let x = 0;
      for (const n of row) {
        if (!n.pinned && !n.layoutFixed) n.x = x + widths.get(n.iri)! / 2;
        x += widths.get(n.iri)! + 20;
      }
      for (const n of row)
        if (!n.pinned && !n.layoutFixed) n.x -= Math.max(0, x - 20) / 2;
    }
    for (let pass = 0; pass < 12; pass++)
      for (const row of rows)
        for (const { n, i } of row
          .map((n, i) => ({ n, i }))
          .sort((a, b) => b.n.shownDegree - a.n.shownDegree)) {
          if (n.pinned || n.layoutFixed) continue;
          const refs = (pass % 2 === 0 ? pars : kids)
            .get(n.iri)!
            .map((u) => this.view.nodes.get(u)!.x);
          if (!refs.length) continue;
          const lo = i
              ? row[i - 1].x +
                widths.get(row[i - 1].iri)! / 2 +
                20 +
                widths.get(n.iri)! / 2
              : -Infinity,
            hi =
              i + 1 < row.length
                ? row[i + 1].x -
                  widths.get(row[i + 1].iri)! / 2 -
                  20 -
                  widths.get(n.iri)! / 2
                : Infinity;
          if (lo <= hi)
            n.x +=
              (Math.max(
                lo,
                Math.min(hi, refs.reduce((a, b) => a + b, 0) / refs.length),
              ) -
                n.x) *
              0.55;
        }
    rows.forEach((row, r) =>
      row.forEach((n) => {
        if (!n.pinned && !n.layoutFixed) n.y = r * 124;
        n.vx = n.vy = 0;
      }),
    );
    this.centre();
  }
  radial() {
    const ns = [...this.view.nodes.values()];
    let roots = [...this.view.focus].filter((i) => this.view.nodes.has(i));
    if (!roots.length)
      roots = [ns.slice().sort((a, b) => b.shownDegree - a.shownDegree)[0].iri];
    const nbr = new Map(ns.map((n) => [n.iri, [] as string[]])),
      children = new Map(ns.map((n) => [n.iri, [] as string[]]));
    for (const e of this.view.edges.values()) {
      nbr.get(e.source)!.push(e.target);
      nbr.get(e.target)!.push(e.source);
    }
    const depth = new Map(roots.map((r) => [r, 0])),
      queue = roots.slice();
    for (let i = 0; i < queue.length; i++)
      for (const v of nbr.get(queue[i])!)
        if (!depth.has(v)) {
          depth.set(v, depth.get(queue[i])! + 1);
          children.get(queue[i])!.push(v);
          queue.push(v);
        }
    let max = Math.max(...depth.values());
    const orphans = ns.filter((n) => !depth.has(n.iri));
    if (orphans.length) {
      max++;
      for (const n of orphans) depth.set(n.iri, max);
    }
    const leaves = new Map<string, number>();
    for (let i = queue.length - 1; i >= 0; i--) {
      const u = queue[i],
        cs = children.get(u)!;
      leaves.set(
        u,
        cs.length ? cs.reduce((s, c) => s + (leaves.get(c) ?? 1), 0) : 1,
      );
    }
    const radii = Array(max + 1).fill(0) as number[],
      pop = Array(max + 1).fill(0) as number[];
    for (const d of depth.values()) pop[d]++;
    if (roots.length > 1)
      radii[0] = Math.max(
        52,
        (roots.reduce((s, r) => s + (leaves.get(r) ?? 1), 0) * 52) /
          (2 * Math.PI),
      );
    for (let d = 1; d <= max; d++)
      radii[d] = Math.max(radii[d - 1] + 118, (pop[d] * 52) / (2 * Math.PI));
    const pending: { u: string; start: number; end: number }[] = [];
    let angle = -Math.PI / 2;
    const total = roots.reduce((s, r) => s + (leaves.get(r) ?? 1), 0);
    for (const r of roots) {
      const span = (2 * Math.PI * (leaves.get(r) ?? 1)) / Math.max(1, total);
      pending.push({ u: r, start: angle, end: angle + span });
      angle += span;
    }
    while (pending.length) {
      const { u, start, end } = pending.pop()!,
        n = this.view.nodes.get(u)!,
        mid = (start + end) / 2;
      if (!n.pinned && !n.layoutFixed) {
        n.x = Math.cos(mid) * radii[depth.get(u)!];
        n.y = Math.sin(mid) * radii[depth.get(u)!];
      }
      n.vx = n.vy = 0;
      const cs = children.get(u)!,
        count = cs.reduce((s, c) => s + (leaves.get(c) ?? 1), 0);
      let a = start;
      for (const c of cs) {
        const span =
          ((end - start) * (leaves.get(c) ?? 1)) / Math.max(1, count);
        pending.push({ u: c, start: a, end: a + span });
        a += span;
      }
    }
    orphans.forEach((n, i) => {
      const a = (i / Math.max(1, orphans.length)) * 2 * Math.PI;
      if (!n.pinned && !n.layoutFixed) {
        n.x = Math.cos(a) * radii[max];
        n.y = Math.sin(a) * radii[max];
      }
      n.vx = n.vy = 0;
    });
    collisions(ns, 3);
    this.centre();
    if (roots.length === 1) this.rings = radii.slice(1);
    const root = this.view.nodes.get(roots[0])!;
    this.ringOrigin = { x: root.x, y: root.y };
  }
  grid() {
    const ns = [...this.view.nodes.values()],
      map = new Map<string, GraphNode[]>();
    for (const n of ns) {
      const key =
          this.store.individualIndex.get(n.iri)?.type ??
          (n.kind === "Individual"
            ? NS.demo + "Customer"
            : (this.store.entities.get(n.iri)?.parents[0] ?? "kind:" + n.kind)),
        b = map.get(key) ?? [];
      b.push(n);
      map.set(key, b);
    }
    const blocks = [...map]
      .map(([key, nodes]) => {
        nodes.sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
        const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.8)));
        return {
          key,
          nodes,
          cols,
          width: cols * 36 + 24,
          height: Math.ceil(nodes.length / cols) * 36 + 46,
        };
      })
      .sort((a, b) => b.nodes.length - a.nodes.length);
    const target = Math.max(
      700,
      Math.sqrt(blocks.reduce((s, b) => s + b.width * b.height, 0)) * 1.6,
    );
    let x = 0,
      y = 0,
      rowH = 0;
    const frames: GroupBlock[] = [];
    for (const b of blocks) {
      if (x > 0 && x + b.width > target) {
        x = 0;
        y += rowH + 48;
        rowH = 0;
      }
      b.nodes.forEach((n, i) => {
        if (!n.pinned && !n.layoutFixed) {
          n.x = x + 30 + (i % b.cols) * 36;
          n.y = y + 54 + Math.floor(i / b.cols) * 36;
        }
        n.vx = n.vy = 0;
      });
      frames.push({
        label: b.key.startsWith("kind:")
          ? kindLabel(b.nodes[0].kind)
          : humanise(local(b.key)),
        count: b.nodes.length,
        x,
        y,
        width: b.width,
        height: b.height,
      });
      x += b.width + 40;
      rowH = Math.max(rowH, b.height);
    }
    const dx =
        (Math.min(...ns.map((n) => n.x)) + Math.max(...ns.map((n) => n.x))) / 2,
      dy =
        (Math.min(...ns.map((n) => n.y)) + Math.max(...ns.map((n) => n.y))) / 2;
    this.centre();
    this.groups = frames.map((b) => ({ ...b, x: b.x - dx, y: b.y - dy }));
  }
}
