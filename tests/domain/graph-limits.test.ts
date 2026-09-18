import { test, expect } from "vitest";
import { storeFromRdf } from "../../src/domain/rdf-io";
import { NS, TYPE, iriTerm, type Triple } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
import { readWorkspace, type Workspace } from "../../src/domain/workspace";
import { readPreferences } from "../../src/shared/preferences";
import { validateExport, defaultExportOptions } from "../../src/shared/export";

test("expands to 15000 nodes, round-trips every saved graph collection, and accepts export", () => {
  const base = "http://limit.test/#",
    root = base + "Root";
  const triples: Triple[] = [
    { subject: root, predicate: TYPE, object: iriTerm(NS.owl + "Class") },
  ];
  for (let i = 0; i < 15010; i++) {
    const iri = base + "Node" + i;
    triples.push(
      { subject: iri, predicate: TYPE, object: iriTerm(NS.owl + "Class") },
      { subject: root, predicate: base + "related", object: iriTerm(iri) },
    );
  }
  const store = storeFromRdf(triples, "Large graph"),
    view = new Viewport(store);
  expect(view.budget).toBe(1000);
  view.setBudget(15000);
  view.seed([root], true, false);
  expect(view.expandMax()).toEqual({ added: 14999, limitReached: true });
  expect(view.nodes.size).toBe(15000);
  expect(view.expandMax()).toEqual({ added: 0, limitReached: true });
  const iris = [...view.nodes.keys()],
    positions = [...view.nodes.values()].map((n) => ({
      iri: n.iri,
      x: n.x,
      y: n.y,
    }));
  const doc: Workspace = {
    format: "axiom-workspace",
    version: 1,
    ontology: store.ontology,
    entities: [...store.entities.values()],
    tbox: store.tbox,
    individuals: [],
    customers: [],
    selected: root,
    graph: {
      iris,
      focus: iris,
      pins: positions,
      positions,
      expanded: iris,
      budget: 15000,
      layout: "grid",
    },
  };
  const loaded = readWorkspace(doc);
  expect(loaded.view.budget).toBe(15000);
  expect(loaded.view.nodes.size).toBe(15000);
  expect(loaded.view.focus.size).toBe(15000);
  expect(
    [...loaded.view.nodes.values()].every((n) => n.pinned && n.expanded),
  ).toBe(true);
  const request = {
    options: defaultExportOptions,
    iris,
    datasetEpoch: 1,
    version: 1,
  };
  expect(validateExport(request)).toBe(request);
  expect(() =>
    validateExport({ ...request, iris: [...iris, base + "extra"] }),
  ).toThrow(/Invalid export/);
}, 30000);
test("retains 15000 in preferences and rejects values beyond the maximum", () => {
  expect(
    readPreferences({ version: 1, panelState: { "graph.limit": 15000 } })
      .panelState?.["graph.limit"],
  ).toBe(15000);
  expect(
    readPreferences({ version: 1, panelState: { "graph.limit": 15001 } })
      .panelState?.["graph.limit"],
  ).toBeUndefined();
});
