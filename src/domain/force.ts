import { Viewport, type GraphNode } from "./viewport";
import { TYPE, SUBCLASS, SUBPROPERTY } from "./model";
export const isHierarchy = (p: string) =>
  p === TYPE || p === SUBCLASS || p === SUBPROPERTY;
interface Quad {
  x: number;
  y: number;
  size: number;
  mass: number;
  cx: number;
  cy: number;
  body?: GraphNode;
  extra: GraphNode[];
  children?: Quad[];
  childPool: Quad[];
}
export function collisions(nodes: GraphNode[], iterations: number) {
  const cellSize = 72,
    stride = 67108864;
  for (let pass = 0; pass < iterations; pass++) {
    const grid = new Map<number, number[]>();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i],
        key = Math.floor(n.x / cellSize) * stride + Math.floor(n.y / cellSize);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i],
        gx = Math.floor(n.x / cellSize),
        gy = Math.floor(n.y / cellSize);
      for (let x = -1; x <= 1; x++)
        for (let y = -1; y <= 1; y++) {
          const bucket = grid.get((gx + x) * stride + gy + y);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const m = nodes[j];
            let dx = m.x - n.x,
              dy = m.y - n.y,
              d2 = dx * dx + dy * dy;
            const min = n.radius + m.radius + 11;
            if (d2 >= min * min) continue;
            if (d2 < 0.0001) {
              dx = 0.7;
              dy = 0.3;
              d2 = 0.5776;
            }
            const distance = Math.sqrt(d2),
              push = ((min - distance) / distance) * 0.5;
            if (!n.pinned && !n.dragging) {
              n.x -= dx * push;
              n.y -= dy * push;
            }
            if (!m.pinned && !m.dragging) {
              m.x += dx * push;
              m.y += dy * push;
            }
          }
        }
    }
  }
}
export class ForceLayout {
  nodes: GraphNode[] = [];
  edges: { a: GraphNode; b: GraphNode; predicate: string }[] = [];
  pool: Quad[] = [];
  used = 0;
  constructor(public view: Viewport) {}
  cell(x: number, y: number, size: number): Quad {
    const q = this.pool[this.used] ?? {
      x: 0,
      y: 0,
      size: 0,
      mass: 0,
      cx: 0,
      cy: 0,
      extra: [],
      childPool: [],
    };
    this.pool[this.used++] = q;
    q.x = x;
    q.y = y;
    q.size = size;
    q.mass = q.cx = q.cy = 0;
    q.body = undefined;
    q.extra.length = 0;
    q.children = undefined;
    return q;
  }
  reset(fresh: boolean) {
    this.nodes = [...this.view.nodes.values()];
    this.edges = [...this.view.edges.values()].map((e) => ({
      a: this.view.nodes.get(e.source)!,
      b: this.view.nodes.get(e.target)!,
      predicate: e.predicate,
    }));
    this.nodes.forEach((n, i) => {
      n.charge = 210 + n.radius * 16;
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) n.x = n.y = 0;
      if (fresh && !n.pinned) {
        const r = 30 * Math.sqrt(i + 0.5),
          a = i * 2.399963229728653;
        n.x = Math.cos(a) * r;
        n.y = Math.sin(a) * r;
        n.vx = n.vy = 0;
      }
    });
    this.view.alpha = fresh ? 1 : Math.max(this.view.alpha, 0.5);
  }
  insert(q: Quad, n: GraphNode, depth: number) {
    if (depth > 22 || q.size < 0.5) {
      q.extra.push(n);
      return;
    }
    if (!q.children && !q.body) {
      q.body = n;
      return;
    }
    if (!q.children) {
      const h = q.size / 2,
        old = q.body!;
      q.body = undefined;
      q.children = q.childPool;
      q.children[0] = this.cell(q.x, q.y, h);
      q.children[1] = this.cell(q.x + h, q.y, h);
      q.children[2] = this.cell(q.x, q.y + h, h);
      q.children[3] = this.cell(q.x + h, q.y + h, h);
      this.put(q, old, depth);
    }
    this.put(q, n, depth);
  }
  put(q: Quad, n: GraphNode, depth: number) {
    this.insert(
      q.children![
        (n.x >= q.x + q.size / 2 ? 1 : 0) + (n.y >= q.y + q.size / 2 ? 2 : 0)
      ],
      n,
      depth + 1,
    );
  }
  accumulate(q: Quad) {
    let mass = 0,
      x = 0,
      y = 0;
    const add = (n: GraphNode) => {
      mass += n.charge;
      x += n.x * n.charge;
      y += n.y * n.charge;
    };
    if (q.body) add(q.body);
    for (const n of q.extra) add(n);
    for (const c of q.children ?? []) {
      this.accumulate(c);
      mass += c.mass;
      x += c.cx * c.mass;
      y += c.cy * c.mass;
    }
    q.mass = mass;
    if (mass) {
      q.cx = x / mass;
      q.cy = y / mass;
    }
  }
  repel(q: Quad, n: GraphNode) {
    if (!q.mass) return;
    const dx = n.x - q.cx,
      dy = n.y - q.cy,
      d2 = dx * dx + dy * dy;
    if (!q.children || q.size * q.size < 0.66 * d2) {
      if (!q.children && q.body === n && !q.extra.length) return;
      const f = (q.mass * this.view.alpha) / Math.max(9, d2);
      n.vx += dx * f;
      n.vy += dy * f;
      return;
    }
    for (const c of q.children) this.repel(c, n);
    for (const b of q.extra) {
      if (b === n) continue;
      const dx = n.x - b.x,
        dy = n.y - b.y,
        f = (b.charge * this.view.alpha) / Math.max(9, dx * dx + dy * dy);
      n.vx += dx * f;
      n.vy += dy * f;
    }
  }
  step(sync = false) {
    if (!this.nodes.length || (!sync && this.view.alpha < 0.004)) return;
    this.used = 0;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of this.nodes) {
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x);
      y1 = Math.max(y1, n.y);
    }
    const root = this.cell(x0 - 4, y0 - 4, Math.max(2, x1 - x0, y1 - y0) + 8);
    for (const n of this.nodes) this.insert(root, n, 0);
    this.accumulate(root);
    for (const n of this.nodes) this.repel(root, n);
    for (const { a, b, predicate } of this.edges) {
      const dx = b.x - a.x + 1e-6,
        dy = b.y - a.y + 1e-6,
        d = Math.sqrt(dx * dx + dy * dy),
        target = 48 + a.radius + b.radius + (isHierarchy(predicate) ? 0 : 26),
        stiff =
          0.6 /
          Math.min(7, Math.max(1, Math.min(a.shownDegree, b.shownDegree))),
        f = ((d - target) / d) * this.view.alpha * stiff,
        bias = b.shownDegree / Math.max(1, a.shownDegree + b.shownDegree);
      a.vx += dx * f * bias;
      a.vy += dy * f * bias;
      b.vx -= dx * f * (1 - bias);
      b.vy -= dy * f * (1 - bias);
    }
    for (const n of this.nodes) {
      n.vx -= n.x * 0.024 * this.view.alpha;
      n.vy -= n.y * 0.024 * this.view.alpha;
      if (n.pinned || n.dragging) {
        n.vx = n.vy = 0;
        continue;
      }
      n.vx *= 0.62;
      n.vy *= 0.62;
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > 45) {
        n.vx = (n.vx / speed) * 45;
        n.vy = (n.vy / speed) * 45;
      }
      n.x += n.vx;
      n.y += n.vy;
    }
    collisions(this.nodes, sync ? 1 : 2);
    this.view.alpha *= 0.9772;
  }
}
