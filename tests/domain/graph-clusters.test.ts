// craigtrim/axiom#185: cluster detection, stable numbering and the palette's rules.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignClusters,
  clusterFills,
  clusterPalette,
  graphClusters,
} from "../../src/domain/graph-clusters";
import {
  buildEmptyStore,
  readWorkspace,
  type Workspace,
} from "../../src/domain/workspace";
import { THING } from "../../src/domain/model";
import {
  Viewport,
  type GraphEdge,
  type GraphNode,
} from "../../src/domain/viewport";
import tokens from "../../src/domain/data/tokens.json";
import { exportScene } from "../../src/renderer/scene";
import type { GraphSnapshot } from "../../src/shared/protocol";

const node = (iri: string, x = 0, y = 0) => ({ iri, x, y }) as GraphNode;
const edge = (source: string, target: string) =>
  ({ source, target, predicate: "p" }) as GraphEdge;
// Each group becomes a chain a0-a1-a2..., so removing a middle node splits it.
function graph(groups: string[][], lone: string[] = []) {
  const nodes = [...groups.flat(), ...lone].map((iri) => node(iri));
  const edges = groups.flatMap((g) =>
    g.slice(1).map((iri, i) => edge(g[i], iri)),
  );
  return { nodes, edges };
}
const positions = (nodes: GraphNode[]) =>
  Object.fromEntries(nodes.map((n) => [n.iri, n.cluster]));
const without = (
  g: { nodes: GraphNode[]; edges: GraphEdge[] },
  iri: string,
) => ({
  nodes: g.nodes.filter((n) => n.iri !== iri),
  edges: g.edges.filter((e) => e.source !== iri && e.target !== iri),
});

describe("clusters", () => {
  it("joins nodes across edges in either direction and leaves lone nodes out", () => {
    const nodes = ["a", "b", "c", "d", "e", "f"].map((iri) => node(iri));
    const clusters = graphClusters(nodes, [
      edge("a", "b"),
      edge("c", "b"),
      edge("e", "d"),
    ]);
    expect(clusters.map((c) => c.map((n) => n.iri).sort())).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });

  it("numbers clusters largest first and clears the numbers when turned off", () => {
    const g = graph(
      [
        ["s1", "s2"],
        ["b1", "b2", "b3", "b4"],
        ["m1", "m2", "m3"],
      ],
      ["x"],
    );
    expect(assignClusters(g.nodes, g.edges, true)).toBe(3);
    expect(positions(g.nodes)).toMatchObject({ b1: 0, m1: 1, s1: 2 });
    expect(g.nodes.find((n) => n.iri === "x")!.cluster).toBeUndefined();
    expect(assignClusters(g.nodes, g.edges, false)).toBe(3);
    expect(g.nodes.every((n) => n.cluster === undefined)).toBe(true);
  });

  it("keeps every other cluster's number when a node is hidden", () => {
    let g = graph([
      ["a1", "a2", "a3", "a4"],
      ["b1", "b2", "b3"],
      ["c1", "c2"],
    ]);
    assignClusters(g.nodes, g.edges, true);
    const before = positions(g.nodes);
    g = without(g, "b3");
    assignClusters(g.nodes, g.edges, true);
    const after = positions(g.nodes);
    for (const iri of Object.keys(after)) expect(after[iri]).toBe(before[iri]);
  });

  it("leaves a split cluster's number on its larger part and gives the other part the lowest free number", () => {
    let g = graph([
      ["a1", "a2", "a3", "a4", "a5", "a6"],
      ["b1", "b2", "b3"],
    ]);
    assignClusters(g.nodes, g.edges, true);
    expect(positions(g.nodes)).toMatchObject({ a1: 0, b1: 1 });
    g = without(g, "a3");
    expect(assignClusters(g.nodes, g.edges, true)).toBe(3);
    expect(positions(g.nodes)).toMatchObject({
      a4: 0,
      a5: 0,
      a6: 0,
      b1: 1,
      a1: 2,
      a2: 2,
    });
  });

  it("gives merged clusters the number of the part that held more nodes", () => {
    const g = graph([
      ["a1", "a2", "a3"],
      ["b1", "b2"],
      ["c1", "c2"],
    ]);
    assignClusters(g.nodes, g.edges, true);
    expect(positions(g.nodes)).toMatchObject({ a1: 0, b1: 1, c1: 2 });
    g.edges.push(edge("b2", "a1"));
    assignClusters(g.nodes, g.edges, true);
    expect(positions(g.nodes)).toMatchObject({ a1: 0, b1: 0, c1: 2 });
    g.nodes.push(node("d1"), node("d2"));
    g.edges.push(edge("d1", "d2"));
    assignClusters(g.nodes, g.edges, true);
    expect(positions(g.nodes)).toMatchObject({ a1: 0, c1: 2, d1: 1 });
  });
});

describe("cluster fills", () => {
  it("colors clusters only while turned on with two or more clusters", () => {
    const g = graph(
      [
        ["a1", "a2"],
        ["b1", "b2"],
      ],
      ["x"],
    );
    const clusterCount = assignClusters(g.nodes, g.edges, true);
    expect(
      clusterFills({ nodes: g.nodes, clusterCount }, false),
    ).toBeUndefined();
    expect(
      clusterFills(
        { nodes: g.nodes, clusterColors: true, clusterCount: 1 },
        false,
      ),
    ).toBeUndefined();
    const light = clusterFills(
      { nodes: g.nodes, clusterColors: true, clusterCount },
      false,
    )!;
    expect(light.get("a1")).toBe(clusterPalette.light[0]);
    expect(light.get("b2")).toBe(clusterPalette.light[1]);
    expect(light.has("x")).toBe(false);
    const dark = clusterFills(
      { nodes: g.nodes, clusterColors: true, clusterCount },
      true,
    )!;
    expect(dark.get("b1")).toBe(clusterPalette.dark[1]);
  });

  // Two-node clusters c00, c01 and so on, numbered in name order. Cluster 7
  // sits far to the right and the last cluster far to the left.
  function spread(count: number) {
    const nodes: GraphNode[] = [],
      edges: GraphEdge[] = [];
    for (let k = 0; k < count; k++) {
      const id = "c" + String(k).padStart(2, "0"),
        x = k === 7 ? 10000 : k === count - 1 ? -10000 : k * 10;
      nodes.push(node(id + "a", x, 0), node(id + "b", x, 5));
      edges.push(edge(id + "a", id + "b"));
    }
    return { nodes, edges };
  }

  it("reuses the color whose clusters are farthest away once the sequence runs out", () => {
    const length = clusterPalette.light.length,
      g = spread(length + 1),
      clusterCount = assignClusters(g.nodes, g.edges, true),
      last = "c" + length + "a";
    const light = clusterFills(
      { nodes: g.nodes, clusterColors: true, clusterCount },
      false,
    )!;
    expect(light.get(last)).toBe(clusterPalette.light[7]);
    expect(light.get("c03a")).toBe(clusterPalette.light[3]);
    const dark = clusterFills(
      { nodes: g.nodes, clusterColors: true, clusterCount },
      true,
    )!;
    expect(dark.get(last)).toBe(clusterPalette.dark[length]);
  });

  it("keeps a repeated color when another cluster is hidden", () => {
    let g = spread(clusterPalette.light.length + 2);
    assignClusters(g.nodes, g.edges, true);
    const before = Object.fromEntries(
      g.nodes.map((n) => [n.iri, n.clusterColor]),
    );
    g = without(g, "c07a");
    assignClusters(g.nodes, g.edges, true);
    for (const n of g.nodes)
      if (!n.iri.startsWith("c07"))
        expect(n.clusterColor).toEqual(before[n.iri]);
  });

  it("numbers 15,000 nodes in one cluster quickly", () => {
    const chain = graph([Array.from({ length: 15000 }, (_, i) => "n" + i)]);
    const started = performance.now();
    expect(assignClusters(chain.nodes, chain.edges, true)).toBe(1);
    // Measured near 30 ms; the quadratic grouping this replaced took 0.5 s.
    expect(performance.now() - started).toBeLessThan(300);
  });

  // Checks each repeat against a brute-force search over the clusters numbered
  // before it: its color's nearest earlier use must be as far as any color's.
  function expectFarthestRepeats(nodes: GraphNode[], upTo: number) {
    const centres = new Map<number, { x: number; y: number; n: number }>(),
      colors = new Map<number, [number, number]>();
    for (const n of nodes) {
      const c = centres.get(n.cluster!) ?? { x: 0, y: 0, n: 0 };
      c.x += n.x;
      c.y += n.y;
      c.n++;
      centres.set(n.cluster!, c);
      colors.set(n.cluster!, n.clusterColor!);
    }
    for (const [t, sequence] of [
      clusterPalette.light,
      clusterPalette.dark,
    ].entries())
      for (let p = sequence.length; p < upTo; p++) {
        const here = centres.get(p)!,
          nearest = new Array<number>(sequence.length).fill(Infinity);
        for (let q = 0; q < p; q++) {
          const c = centres.get(q)!,
            d = Math.hypot(
              c.x / c.n - here.x / here.n,
              c.y / c.n - here.y / here.n,
            ),
            color = colors.get(q)![t];
          nearest[color] = Math.min(nearest[color], d);
        }
        expect(nearest[colors.get(p)![t]]).toBeCloseTo(Math.max(...nearest), 9);
      }
  }

  // 7,500 two-node clusters: a regular grid, the same grid with one cluster
  // dragged far away, and most clusters packed into a tiny clump.
  const grid = (k: number) => [(k % 100) * 50, Math.floor(k / 100) * 50];
  for (const [layout, place] of [
    ["a regular grid", grid],
    ["one far outlier", (k: number) => (k === 7499 ? [10000, 10000] : grid(k))],
    [
      "a dense clump",
      (k: number) =>
        k < 7000
          ? [(k % 7) * 0.01, Math.floor(k / 7) * 0.001]
          : [(k % 25) * 400, Math.floor(k / 25) * 400],
    ],
  ] as const)
    it(`colors 7,500 clusters quickly in ${layout}`, () => {
      const nodes: GraphNode[] = [],
        edges: GraphEdge[] = [];
      for (let k = 0; k < 7500; k++) {
        const [x, y] = place(k);
        nodes.push(node("a" + k, x, y), node("b" + k, x + 10, y));
        edges.push(edge("a" + k, "b" + k));
      }
      const started = performance.now();
      const clusterCount = assignClusters(nodes, edges, true);
      clusterFills({ nodes, clusterColors: true, clusterCount }, false);
      const elapsed = performance.now() - started;
      expect(clusterCount).toBe(7500);
      // Measured from 160 to 540 ms; the versions this replaced took 1.1 to 1.9 s.
      expect(elapsed).toBeLessThan(1000);
      expectFarthestRepeats(nodes, 550);
    });
});

describe("cluster rendering", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("draws each cluster in its own color in an exported image", () => {
    const store = buildEmptyStore(),
      a = store.createClass("Alpha", THING),
      b = store.createClass("Beta", a),
      c = store.createClass("Gamma", THING),
      d = store.createClass("Delta", c);
    const view = new Viewport(store);
    view.seed([a, b, c, d], true, false);
    const nodes = [...view.nodes.values()],
      edges = [...view.edges.values()];
    const graph: GraphSnapshot = {
      nodes,
      edges,
      focus: [],
      budget: 1000,
      hidden: 0,
      revision: 0,
      mode: "circle",
      choice: "circle",
      groups: [],
      rings: [],
      ringOrigin: { x: 0, y: 0 },
      frozen: true,
      clusterColors: true,
      clusterCount: assignClusters(nodes, edges, true),
    };
    nodes.forEach((n, i) => {
      n.x = i * 80;
      n.y = 0;
    });
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({
          measureText: (text: string) => ({ width: text.length * 7 }),
        }),
      }),
    });
    const svg = (g: GraphSnapshot) =>
      exportScene(g, false, "svg", null, { caption: false, legend: false })
        .data;
    expect(graph.clusterCount).toBe(2);
    const colored = svg(graph);
    for (const color of clusterPalette.light.slice(0, 2))
      expect(colored).toMatch(new RegExp(color, "i"));
    const plain = svg({ ...graph, clusterColors: false, nodes: [...nodes] });
    expect(plain).not.toMatch(new RegExp(clusterPalette.light[1], "i"));
    expect(plain).toMatch(new RegExp(tokens.light["e-class"], "i"));
  });
});

describe("workspace", () => {
  it("defaults old workspaces to plain colors and restores a saved Color clusters", () => {
    const store = buildEmptyStore(),
      a = store.createClass("Alpha", THING);
    const view = new Viewport(store);
    view.seed([a], true, false);
    const doc: Workspace = {
      format: "axiom-workspace",
      version: 1,
      ontology: store.ontology,
      entities: [...store.entities.values()],
      tbox: store.tbox,
      individuals: [],
      customers: [],
      selected: null,
      graph: {
        iris: [...view.nodes.keys()],
        focus: [],
        pins: [],
        budget: 1000,
        layout: "circle",
      },
    };
    expect(readWorkspace(doc).view.clusterColors).toBe(false);
    doc.graph.clusterColors = true;
    expect(readWorkspace(doc).view.clusterColors).toBe(true);
    doc.graph.clusterColors = "true" as unknown as boolean;
    expect(() => readWorkspace(doc)).toThrow("Invalid graph settings");
  });
});

// Color math for the palette rules in #185: WCAG contrast, CIELAB under D65,
// CIEDE2000 (Sharma, Wu & Dalal 2005), Machado et al. (2009) severity 1.0 in
// linear RGB, and CAM02-UCS J' under the sRGB viewing conditions.
type RGB = [number, number, number];
const rgb = (hex: string): RGB =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const enc = (v: number) => {
  v = Math.min(1, Math.max(0, v));
  return Math.round(
    255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055),
  );
};
const luminance = (c: RGB) =>
  0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const XYZ = (c: RGB) => {
  const [r, g, b] = c.map(lin);
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
};
function lab(c: RGB) {
  const [x, y, z] = XYZ(c);
  const f = (t: number) =>
    t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
  const fx = f(x / 0.95047),
    fy = f(y),
    fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const rad = (d: number) => (d * Math.PI) / 180;
function de2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]) {
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2,
    G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))),
    a1p = (1 + G) * a1,
    a2p = (1 + G) * a2,
    C1p = Math.hypot(a1p, b1),
    C2p = Math.hypot(a2p, b2),
    h = (b: number, a: number) =>
      ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
    h1p = C1p ? h(b1, a1p) : 0,
    h2p = C2p ? h(b2, a2p) : 0;
  const dhp =
    C1p * C2p === 0
      ? 0
      : Math.abs(h2p - h1p) <= 180
        ? h2p - h1p
        : h2p - h1p > 180
          ? h2p - h1p - 360
          : h2p - h1p + 360;
  const dLp = L2 - L1,
    dCp = C2p - C1p,
    dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2)),
    Lbp = (L1 + L2) / 2,
    Cbp = (C1p + C2p) / 2;
  const hbp =
    C1p * C2p === 0
      ? h1p + h2p
      : Math.abs(h1p - h2p) <= 180
        ? (h1p + h2p) / 2
        : h1p + h2p < 360
          ? (h1p + h2p + 360) / 2
          : (h1p + h2p - 360) / 2;
  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)),
    Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2),
    Sc = 1 + 0.045 * Cbp,
    Sh = 1 + 0.015 * Cbp * T,
    Rt = -Math.sin(rad(60 * Math.exp(-(((hbp - 275) / 25) ** 2)))) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 +
      (dCp / Sc) ** 2 +
      (dHp / Sh) ** 2 +
      Rt * (dCp / Sc) * (dHp / Sh),
  );
}
const MACHADO = [
  [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
];
const views = (c: RGB) => {
  const l = c.map(lin);
  return [
    lab(c),
    ...MACHADO.map((m) =>
      lab(
        m.map((row) =>
          enc(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]),
        ) as RGB,
      ),
    ),
  ];
};
const distance = (a: RGB, b: RGB, colorBlind: boolean) => {
  const va = views(a),
    vb = views(b);
  return Math.min(
    ...(colorBlind ? va : [va[0]]).map((v, i) => de2000(v, vb[i])),
  );
};
function camJ(c: RGB) {
  const mul = (m: number[][], v: number[]) =>
    m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const inv = (m: number[][]) => {
    const [[a, b, c], [d, e, f], [g, h, i]] = m,
      det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    return [
      [e * i - f * h, c * h - b * i, b * f - c * e],
      [f * g - d * i, a * i - c * g, c * d - a * f],
      [d * h - e * g, b * g - a * h, a * e - b * d],
    ].map((r) => r.map((v) => v / det));
  };
  const CAT02 = [
      [0.7328, 0.4296, -0.1624],
      [-0.7036, 1.6975, 0.0061],
      [0.003, 0.0136, 0.9834],
    ],
    HPE = [
      [0.38971, 0.68898, -0.07868],
      [-0.22981, 1.1834, 0.04641],
      [0, 0, 1],
    ],
    white = [95.047, 100, 108.883],
    LA = 64 / Math.PI / 5,
    D = Math.min(1, Math.max(0, 1 - (1 / 3.6) * Math.exp((-LA - 42) / 92))),
    k = 1 / (5 * LA + 1),
    FL = 0.2 * k ** 4 * 5 * LA + 0.1 * (1 - k ** 4) ** 2 * Math.cbrt(5 * LA),
    n = 20 / 100,
    z = 1.48 + Math.sqrt(n),
    Nbb = 0.725 * (1 / n) ** 0.2,
    RGBw = mul(CAT02, white),
    DRGB = RGBw.map((v) => (D * 100) / v + 1 - D),
    toHPE = (xyz: number[]) =>
      mul(
        HPE,
        mul(
          inv(CAT02),
          mul(CAT02, xyz).map((v, i) => v * DRGB[i]),
        ),
      ),
    adapt = (v: number) => {
      const p = (FL * Math.abs(v)) / 100;
      return (Math.sign(v) * 400 * p ** 0.42) / (p ** 0.42 + 27.13) + 0.1;
    },
    A = (xyz: number[]) => {
      const [r, g, b] = toHPE(xyz).map(adapt);
      return (2 * r + g + b / 20 - 0.305) * Nbb;
    };
  const J = 100 * (A(XYZ(c).map((v) => v * 100)) / A(white)) ** (0.69 * z);
  return (1.7 * J) / (1 + 0.007 * J);
}

describe("cluster palette", () => {
  it("implements the color math it checks against", () => {
    expect(de2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(
      2.0425,
      4,
    );
    // Reference values from colorspacious 1.1.2's CAM02-UCS.
    for (const [hex, J] of [
      ["#3F90DA", 59.376],
      ["#92DADD", 83.704],
      ["#832DB6", 41.328],
      ["#1144FF", 40.209],
      ["#FFAAAA", 81.832],
    ] as const)
      expect(Math.abs(camJ(rgb(hex)) - J)).toBeLessThan(0.05);
  });

  for (const [theme, base, colorBlindSafe] of [
    ["light", ["#3F90DA", "#C68101", "#BD1F01", "#832DB6"], 9],
    [
      "dark",
      [
        "#3F90DA",
        "#FFA90E",
        "#C22505",
        "#8F39C1",
        "#A96B59",
        "#E76300",
        "#B9AC70",
      ],
      12,
    ],
  ] as const)
    it(`keeps the ${theme} sequence apart, readable on its canvas and inside its rules`, () => {
      const t = tokens[theme],
        sequence = clusterPalette[theme].map(rgb),
        fixed = [t.canvas, t["e-literal"], t.text].map(rgb);
      expect(clusterPalette[theme].slice(0, base.length)).toEqual(base);
      for (const [i, c] of sequence.entries()) {
        expect(contrast(c, rgb(t.canvas))).toBeGreaterThanOrEqual(3);
        const colorBlind = i < colorBlindSafe;
        for (const f of fixed)
          expect(distance(c, f, colorBlind)).toBeGreaterThanOrEqual(10);
        for (const other of sequence.slice(0, i))
          expect(
            distance(
              c,
              other,
              colorBlind && sequence.indexOf(other) < colorBlindSafe,
            ),
          ).toBeGreaterThanOrEqual(10);
        if (i >= base.length) {
          expect(camJ(c)).toBeGreaterThanOrEqual(40);
          expect(camJ(c)).toBeLessThanOrEqual(84);
        }
      }
    });
});
