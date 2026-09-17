import { describe, it, expect, vi } from "vitest";
import { buildStore } from "../../src/domain/fixture";
import { buildEmptyStore, readWorkspace } from "../../src/domain/workspace";
import { Viewport, nodeRadius } from "../../src/domain/viewport";
import {
  graphStyleAnalysis,
  applyGraphAppearance,
} from "../../src/domain/graph-appearance";
import {
  parseGraphStyle,
  nodeStyle,
  nodeDiameter,
  styledRadius,
  updateGraphStyle,
} from "../../src/domain/graph-style";
import { NS, THING } from "../../src/domain/model";

describe("graph appearance", () => {
  it("analyzes the whole dataset and includes generated individuals and connections beyond the display cap", () => {
    const store = buildStore(5000),
      { catalog, metrics } = graphStyleAnalysis(store);
    expect(catalog.nodes).toBe(
      [
        ...store.entities.keys(),
        ...store.individualIndex.keys(),
        ...store.customerIndex.keys(),
      ].filter((x) => store.graphVisible(x)).length,
    );
    expect(catalog.classes.find((c) => c.id === NS.demo + "Order")?.count).toBe(
      5000,
    );
    expect(metrics.get(NS.demo + "Order")!.connections).toBe(
      store.neighbours(NS.demo + "Order").total,
    );
    expect(
      catalog.predicates.find((x) => x.id === NS.demo + "orderedBy")?.count,
    ).toBe(5000);
    expect(catalog.kinds.find((x) => x.id === "Individual")!.count).toBe(
      store.individualCount,
    );
    expect(graphStyleAnalysis(store).catalog).toBe(catalog);
    store.createClass("New category", THING);
    expect(graphStyleAnalysis(store).catalog.nodes).toBe(catalog.nodes + 1);
  });
  it("keeps numeric styles stable when graph membership changes and restores default geometry", () => {
    const store = buildStore(1000),
      v = new Viewport(store),
      iri = NS.pizza + "American";
    v.admit([iri]);
    const text = "node {size-by:instances;size-min:20;size-max:60}";
    applyGraphAppearance(v, text);
    const radius = v.nodes.get(iri)!.radius;
    v.expand(iri);
    applyGraphAppearance(v, text);
    expect(v.nodes.get(iri)!.radius).toBe(radius);
    expect(radius).toBeGreaterThan(10);
    expect(radius).toBeLessThanOrEqual(30);
    applyGraphAppearance(v, "node {size:100}");
    expect(v.nodes.get(iri)!.radius).toBe(50);
    applyGraphAppearance(v, "");
    expect(v.nodes.get(iri)!.radius).toBe(
      nodeRadius(v.nodes.get(iri)!.degree, "Class"),
    );
  });
  it("normalizes differently scaled metrics before weighting and interpolates area", () => {
    const v = new Viewport(buildEmptyStore());
    v.admit([THING]);
    const n = v.nodes.get(THING)!;
    n.styleMetrics = {
      connections: 2,
      maxConnections: 4,
      instances: 10000,
      maxInstances: 20000,
      count: 0,
      maxCount: 0,
    };
    const values = nodeStyle(
      parseGraphStyle(
        "node {size-by:weighted;size-min:20;size-max:60;connections-weight:25;instances-weight:75}",
      ),
      n,
    );
    expect(nodeDiameter(values, n)).toBeCloseTo(Math.sqrt(400 + 0.5 * 3200));
    n.styleMetrics.instances = 0;
    expect(nodeDiameter(values, n)).toBeCloseTo(Math.sqrt(400 + 0.125 * 3200));
    n.styleMetrics.connections = 0;
    expect(nodeDiameter(values, n)).toBe(20);
  });
  it("handles missing metrics, all-zero maxima, count sizing and outliers", () => {
    const v = new Viewport(buildEmptyStore());
    v.admit([THING]);
    const n = v.nodes.get(THING)!;
    expect(styledRadius(n, "node {size-by:instances}")).toBe(8);
    n.styleMetrics = {
      connections: 0,
      maxConnections: 0,
      instances: 1,
      maxInstances: 100000,
      count: 100,
      maxCount: 100,
    };
    expect(styledRadius(n, "node {size-by:count}")).toBe(32);
    expect(
      styledRadius(n, "node {size-by:instances;size-scale:log}"),
    ).toBeGreaterThan(styledRadius(n, "node {size-by:instances}"));
  });
  it("applies individual type selectors independently of class nodes with deterministic precedence", () => {
    const store = buildStore(1000),
      v = new Viewport(store),
      order = store.individuals[0];
    v.admit([order.iri, order.type]);
    const text =
      'node {size-by:instances} node[type="' +
      order.type +
      '"] {fill:#abc;size:50} node[iri="' +
      order.type +
      '"] {fill:#123456;size:30}';
    applyGraphAppearance(v, text);
    expect(
      nodeStyle(parseGraphStyle(text), v.nodes.get(order.iri)!),
    ).toMatchObject({ fill: "#aabbcc", "size-by": "fixed" });
    expect(v.nodes.get(order.iri)!.radius).toBe(25);
    expect(v.nodes.get(order.type)!.radius).toBe(15);
    v.nodes.get(order.iri)!.types!.push("urn:second");
    expect(
      nodeStyle(
        parseGraphStyle(text + ' node[type="urn:second"]{fill:#def}'),
        v.nodes.get(order.iri)!,
      ).fill,
    ).toBe("#ddeeff");
  });
  it.each([
    "node {size-by:random}",
    "node {size-min:70;size-max:20}",
    "node {size-by:weighted;connections-weight:0;instances-weight:0;count-weight:0}",
    "edge {size-by:instances}",
    "node {instances-weight:101}",
  ])("rejects invalid sizing %s", (text) =>
    expect(() => parseGraphStyle(text)).toThrow(),
  );
  it("visual edits preserve unrelated rules, comments, comma peers, and repeated edits", () => {
    const original =
      "\n/* Keep this comment */\nnode.Class, node.Defined { fill:#abc;size:40 }\nnode {fill:#def}\n/* tail */";
    const changed = updateGraphStyle(original, "node.Class", {
      fill: "#123456",
    });
    expect(changed).toContain("/* Keep this comment */");
    expect(changed).toContain("/* tail */");
    expect(
      parseGraphStyle(changed).find((r) => r.kind === "Defined")?.values.fill,
    ).toBe("#aabbcc");
    const again = updateGraphStyle(changed, "node.Class", { fill: "#456789" });
    expect(
      parseGraphStyle(again).filter((r) => r.kind === "Class"),
    ).toHaveLength(1);
    const reset = updateGraphStyle(again, "node.Class", {
      fill: undefined,
      size: undefined,
    });
    expect(parseGraphStyle(reset).some((r) => r.kind === "Class")).toBe(false);
  });
  it("restores effective node radii from saved styles before laying out a workspace", () => {
    const store = buildStore(1000);
    const next = readWorkspace({
      format: "axiom-workspace",
      version: 1,
      entities: [...store.entities.values()],
      tbox: store.tbox,
      individuals: store.individuals,
      customers: store.customers,
      graph: {
        iris: [NS.pizza + "Pizza"],
        focus: [],
        pins: [],
        budget: 1000,
        layout: "grid",
        stylesheet: "node {size:100}",
      },
    });
    expect(next.view.nodes.get(NS.pizza + "Pizza")!.radius).toBe(50);
  });
});

it("exports styled legend glyphs and identifies mixed styles", async () => {
  const { exportScene } = await import("../../src/renderer/scene");
  const store = buildEmptyStore(),
    child = store.createClass("Child", THING),
    view = new Viewport(store);
  view.admit([THING, child]);
  const g = {
    nodes: [...view.nodes.values()],
    edges: [...view.edges.values()],
    focus: [],
    budget: 100,
    hidden: 0,
    revision: 0,
    mode: "force" as const,
    choice: "force" as const,
    groups: [],
    rings: [],
    ringOrigin: { x: 0, y: 0 },
    frozen: true,
    stylesheet: "node.Class {fill:#123456;shape:hexagon}",
  };
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        measureText: (text: string) => ({ width: text.length * 7 }),
      }),
    }),
  });
  try {
    const svg = exportScene(g, false, "svg", null, { caption: false }).data;
    // Two class glyphs plus their legend glyph all use the custom color.
    expect(svg.split("#123456").length - 1).toBe(3);
    const mixed = exportScene(
      {
        ...g,
        stylesheet: g.stylesheet + ' node[iri="' + child + '"]{fill:#abcdef}',
      },
      false,
      "svg",
      null,
      { caption: false },
    ).data;
    expect(mixed).toContain("Class (varied styles)");
  } finally {
    vi.unstubAllGlobals();
  }
});
