// craigtrim/axiom#205: check visual membership against an independent all-pairs oracle.
import { describe, expect, it } from "vitest";
import { assignClusters, graphClusters } from "../../src/domain/graph-clusters";
import type { GraphEdge, GraphNode } from "../../src/domain/viewport";

const node = (iri: string, x: number, y: number) =>
  ({ iri, x, y }) as GraphNode;
const edge = (source: string, target: string) =>
  ({ source, target, predicate: "p" }) as GraphEdge;
const canonical = (groups: GraphNode[][]) =>
  groups
    .map((g) => g.map((n) => n.iri).sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
const square = (prefix: string, x = 0, y = 0) => [
  node(prefix + "0", x, y),
  node(prefix + "1", x + 1, y),
  node(prefix + "2", x, y + 1),
  node(prefix + "3", x + 1, y + 1),
];

/** Deliberately quadratic, with explicit adjacency lists and a graph walk. */
function bruteForce(nodes: GraphNode[], edges: GraphEdge[], s: number) {
  if (nodes.length < 2) return [];
  const lengths = nodes.map((a, i) =>
      nodes
        .flatMap((b, j) => (i === j ? [] : [Math.hypot(a.x - b.x, a.y - b.y)]))
        .sort((a, b) => a - b),
    ),
    nearest = lengths.map((d) => d[0]).sort((a, b) => a - b),
    core = lengths.map((d) => d[Math.min(2, d.length - 1)]),
    middle = Math.floor(nearest.length / 2),
    u =
      nearest.length % 2
        ? nearest[middle]
        : (nearest[middle - 1] + nearest[middle]) / 2,
    links = nodes.map(() => new Set<number>()),
    lookup = new Map(nodes.map((n, i) => [n.iri, i])),
    relationships = nodes.map(() => new Set<number>());
  let longest = 0;
  for (const e of edges) {
    const a = lookup.get(e.source),
      b = lookup.get(e.target);
    if (a === undefined || b === undefined) continue;
    relationships[a].add(b);
    relationships[b].add(a);
    longest = Math.max(
      longest,
      Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y),
    );
  }
  const d = 3 * u * s,
    c = longest === 0 || u === 0 ? 0 : longest ** (1 - s) * (3 * u) ** s;
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) {
      const separation = Math.hypot(
          nodes[a].x - nodes[b].x,
          nodes[a].y - nodes[b].y,
        ),
        linked =
          s === 0
            ? relationships[a].has(b)
            : (s < 1 &&
                relationships[a].has(b) &&
                Math.max(separation, s * core[a], s * core[b]) <= c) ||
              Math.max(separation, core[a], core[b]) <= d;
      if (linked) {
        links[a].add(b);
        links[b].add(a);
      }
    }
  const seen = new Set<number>(),
    groups: GraphNode[][] = [];
  for (let start = 0; start < nodes.length; start++) {
    if (seen.has(start)) continue;
    const pending = [start],
      members: GraphNode[] = [];
    seen.add(start);
    while (pending.length) {
      const i = pending.pop()!;
      members.push(nodes[i]);
      for (const next of links[i])
        if (!seen.has(next)) {
          seen.add(next);
          pending.push(next);
        }
    }
    if (members.length > 1) groups.push(members);
  }
  return canonical(groups);
}

describe("visual graph clusters", () => {
  it("keeps Strict equal to explicit components even when unrelated nodes coincide", () => {
    const nodes = square("a").map((n) => ({ ...n, x: 0, y: 0 })),
      edges = [edge("a1", "a0"), edge("absent", "a2"), edge("a0", "a0")];
    expect(canonical(graphClusters(nodes, edges, 0))).toEqual([["a0", "a1"]]);
    expect(graphClusters(nodes, [], 0)).toEqual([]);
    expect(canonical(graphClusters(nodes, edges, 1))).toEqual([
      ["a0", "a1", "a2", "a3"],
    ]);
  });

  it("defaults to Loose and ignores relationships, including a short sparse-pair edge", () => {
    const nodes = [
        ...square("a"),
        node("sparse-a", 100, 0),
        node("sparse-b", 101, 0),
      ],
      expected = [["a0", "a1", "a2", "a3"]],
      edges = [edge("sparse-a", "sparse-b"), edge("a0", "sparse-a")];
    expect(canonical(graphClusters(nodes, []))).toEqual(expected);
    expect(canonical(graphClusters(nodes, edges))).toEqual(expected);
    expect(canonical(graphClusters(nodes, edges, 1))).toEqual(expected);
    expect(assignClusters(nodes, edges, true)).toBe(1);
    expect(nodes.slice(4).every((n) => n.cluster === undefined)).toBe(true);
  });

  it("requires growing edge density before Loose rather than dropping a special rule at the endpoint", () => {
    const nodes = [
        ...square("a"),
        node("sparse-a", 100, 0),
        node("sparse-b", 101, 0),
      ],
      edges = [edge("sparse-a", "sparse-b")];
    expect(canonical(graphClusters(nodes, edges, 0.005))).toEqual([
      ["sparse-a", "sparse-b"],
    ]);
    expect(canonical(graphClusters(nodes, edges, 0.5))).toEqual([
      ["a0", "a1", "a2", "a3"],
    ]);
    expect(canonical(graphClusters(nodes, edges, 0.99))).toEqual([
      ["a0", "a1", "a2", "a3"],
    ]);
  });

  it("keeps a packed group separate from a nearby sparse scatter", () => {
    const packed = Array.from({ length: 9 }, (_, i) =>
        node("p" + i, i % 3, Math.floor(i / 3)),
      ),
      scattered = [
        node("s0", 20, 0),
        node("s1", 22, 0),
        node("s2", 30, 7),
        node("s3", 50, 50),
      ],
      nodes = [...packed, ...scattered];
    expect(canonical(graphClusters(nodes, []))).toEqual([
      packed.map((n) => n.iri),
    ]);
    expect(
      graphClusters(nodes, [])
        .flat()
        .some((n) => n.iri.startsWith("s")),
    ).toBe(false);
  });

  it("lets a pair cluster without an edge and uses the farthest available neighbour below four nodes", () => {
    expect(
      canonical(graphClusters([node("a", 0, 0), node("b", 1, 0)], [])),
    ).toEqual([["a", "b"]]);
    // With only two nodes their separation also fixes u, regardless of scale.
    expect(
      canonical(graphClusters([node("a", 0, 0), node("b", 1e12, 0)], [])),
    ).toEqual([["a", "b"]]);
    const three = [node("a", 0, 0), node("b", 1, 0), node("c", 100, 0)];
    expect(graphClusters(three, [])).toEqual([]);
    for (const s of [0, 0.2, 0.65, 1])
      expect(canonical(graphClusters(three, [edge("b", "c")], s))).toEqual(
        bruteForce(three, [edge("b", "c")], s),
      );
    expect(graphClusters([], [])).toEqual([]);
    expect(graphClusters([node("a", 0, 0)], [edge("a", "a")])).toEqual([]);
  });

  it("handles a zero median and zero-length edges without a distance floor or NaN", () => {
    const nodes = [0, 0, 0, 0, 10, 10, 10, 10].map((x, i) =>
        node("n" + i, x, 0),
      ),
      edges = [edge("n0", "n4"), edge("n1", "n2")],
      expected = [
        ["n0", "n1", "n2", "n3"],
        ["n4", "n5", "n6", "n7"],
      ];
    for (const s of [Number.EPSILON, 0.1, 0.5, 1]) {
      expect(canonical(graphClusters(nodes, edges, s))).toEqual(expected);
      expect(canonical(graphClusters(nodes, [], s))).toEqual(expected);
    }
    const triples = [0, 0, 0, 10, 10, 10].map((x, i) => node("n" + i, x, 0));
    expect(graphClusters(triples, [])).toEqual([]);
    const nonzero = square("a");
    expect(graphClusters(nonzero, [edge("a0", "a0")], 0.25)).toEqual([]);
    expect(canonical(graphClusters(nonzero, [], 0.5))).toEqual([
      ["a0", "a1", "a2", "a3"],
    ]);
  });

  it("uses the arithmetic median for an even population", () => {
    // NN distances are 1,1,5,5,9,9: the median is 5 and Loose radius is 15.
    const nodes = [0, 1, 30, 35, 100, 109].map((x, i) => node("n" + i, x, 0));
    expect(canonical(graphClusters(nodes, []))).toEqual(
      bruteForce(nodes, [], 1),
    );
    const even = [
      node("a", 0, 0),
      node("b", 2, 0),
      node("c", 6, 0),
      node("d", 9.5, 0),
    ];
    // NN distances 2,2,3.5,3.5 have median 2.75. At Loose only b and c
    // have their farthest other node within the resulting radius 8.25.
    expect(canonical(graphClusters(even, []))).toEqual([["b", "c"]]);
  });

  it("retains exact normalized values instead of rounding the domain rule to slider steps", () => {
    const nodes = [...square("a"), ...square("b", 10), node("far", 1000, 0)],
      edges = [edge("a0", "b0"), edge("a0", "far")],
      crossing = Math.log(100) / Math.log(1000 / 3);
    expect(
      graphClusters(nodes, edges, crossing - 0.0001).map((g) => g.length),
    ).toEqual([8]);
    expect(
      graphClusters(nodes, edges, crossing + 0.0001).map((g) => g.length),
    ).toEqual([4, 4]);
    for (const invalid of [-0.01, 1.01, NaN, Infinity, -Infinity])
      expect(() => graphClusters(nodes, edges, invalid)).toThrow(
        "Cluster looseness must be between 0 and 1.",
      );
  });

  it("keeps an edge exactly on the cutoff when both endpoint scales are equal", () => {
    const nodes = [...square("a"), node("b", 3, 0)],
      edges = [edge("a0", "b")];
    // u=1 and Lmax=3, so C(s) is exactly 3 throughout the slider.
    for (const s of [0.05, 0.1, 0.25, 0.5, 0.75, 0.95])
      expect(
        graphClusters(nodes, edges, s).some(
          (g) => g.some((n) => n.iri === "a0") && g.some((n) => n.iri === "b"),
        ),
      ).toBe(true);
  });

  it("matches a brute-force oracle over ties, negative coordinates, outliers and every slider step", () => {
    let seed = 205;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let sample = 0; sample < 8; sample++) {
      const nodes = Array.from({ length: 25 + sample * 5 }, (_, i) => {
        const scale = i % 4 ? 20 : 2000;
        return node(
          "n" + i,
          (random() - 0.5) * scale,
          (random() - 0.5) * scale,
        );
      });
      // Distinct identities at equal coordinates exercise exact tie pruning.
      nodes.push(...[0, 1, 2, 3].map((i) => node("tie" + i, -6, 4)));
      const edges = nodes.flatMap((n, i) =>
        i % 3
          ? []
          : [edge(n.iri, nodes[Math.floor(random() * nodes.length)].iri)],
      );
      edges.push(edge("absent", nodes[0].iri));
      for (let step = 0; step <= 20; step++) {
        const s = step / 20;
        expect(
          canonical(graphClusters(nodes, edges, s)),
          `sample ${sample}, s=${s}`,
        ).toEqual(bruteForce(nodes, edges, s));
      }
    }
  });

  it("is invariant under input order, translation, rotation and uniform coordinate scale", () => {
    const nodes = [
        ...square("a"),
        ...square("b", 16, 7),
        node("far", 500, -300),
      ],
      edges = [edge("a0", "b0"), edge("b3", "far")];
    for (const s of [0, 0.17, 0.42, 0.73, 0.96, 1]) {
      const expected = canonical(graphClusters(nodes, edges, s));
      expect(
        canonical(graphClusters([...nodes].reverse(), [...edges].reverse(), s)),
      ).toEqual(expected);
      expect(
        canonical(
          graphClusters(
            nodes.map((n) => ({ ...n, x: n.x + 817, y: n.y - 203 })),
            edges,
            s,
          ),
        ),
      ).toEqual(expected);
      expect(
        canonical(
          graphClusters(
            nodes.map((n) => ({ ...n, x: -n.y, y: n.x })),
            edges,
            s,
          ),
        ),
      ).toEqual(expected);
      for (const scale of [1e-150, 1e-8, 7, 1e150])
        expect(
          canonical(
            graphClusters(
              nodes.map((n) => ({ ...n, x: n.x * scale, y: n.y * scale })),
              edges,
              s,
            ),
          ),
        ).toEqual(expected);
    }
  });

  it("finds exact neighbours across large empty coordinate ranges", () => {
    const nodes = [
        ...square("a", -1e12, -1e12),
        ...square("b", 1e12, 1e12),
        ...square("c", 1e12, -1e12),
      ],
      edges = [edge("a0", "b0"), edge("a1", "c1")];
    for (const s of [0, 0.05, 0.5, 0.95, 1])
      expect(canonical(graphClusters(nodes, edges, s))).toEqual(
        bruteForce(nodes, edges, s),
      );
  });

  it("does not mutate input positions, edges or existing palette assignments while detecting membership", () => {
    const nodes = square("a").map((n) => ({
        ...n,
        cluster: 4,
        clusterColor: [4, 4] as [number, number],
      })),
      edges = [edge("a0", "a1")],
      before = structuredClone({ nodes, edges });
    graphClusters(nodes, edges, 0.65);
    expect({ nodes, edges }).toEqual(before);
  });

  it("groups 15,000 nodes into separated visual islands without a quadratic scan", () => {
    const nodes = Array.from({ length: 15000 }, (_, i) => {
        const island = Math.floor(i / 6),
          member = i % 6;
        return node(
          "n" + i,
          (island % 50) * 20 + (member % 3),
          Math.floor(island / 50) * 20 + Math.floor(member / 3),
        );
      }),
      started = performance.now(),
      groups = graphClusters(nodes, []);
    expect(groups).toHaveLength(2500);
    expect(groups.every((g) => g.length === 6)).toBe(true);
    expect(performance.now() - started).toBeLessThan(2500);
  });

  it("handles 15,000 coincident nodes without enumerating every proximity pair", () => {
    const nodes = Array.from({ length: 15000 }, (_, i) => node("n" + i, 4, -7)),
      started = performance.now(),
      groups = graphClusters(nodes, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(nodes.length);
    expect(performance.now() - started).toBeLessThan(2500);
  });
});
