import { Store } from "./store";
import { isLayoutMode } from "../shared/layout-options";
import { parseGraphStyle } from "./graph-style";
import { Viewport } from "./viewport";
import { Layouts, type LayoutMode } from "./layouts";
import {
  NS,
  branches,
  THING,
  type Entity,
  type Individual,
  type Customer,
  type Triple,
  type Restriction,
  type OntologyInfo,
  iriTerm,
  TYPE,
} from "./model";
export interface Workspace {
  format: "axiom-workspace";
  version: 1;
  ontology?: OntologyInfo;
  entities: Entity[];
  tbox: Triple[];
  individuals: Individual[];
  customers: Customer[];
  graph: {
    iris: string[];
    focus: string[];
    pins: { iri: string; x: number; y: number }[];
    budget: number;
    layout: LayoutMode;
    stylesheet?: string;
  };
  selected: string | null;
}
const text = (v: unknown, max = 10000): v is string =>
  typeof v === "string" && v.length <= max;
const strings = (v: unknown, max = 10000): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((s) => text(s));
const restriction = (r: Restriction) =>
  r &&
  ["class", "not", "restriction"].includes(r.shape) &&
  strings(r.fillers) &&
  (!r.property || text(r.property)) &&
  (!r.quantifier ||
    ["some", "only", "value", "min", "max", "exactly"].includes(
      r.quantifier,
    )) &&
  (r.cardinality === undefined ||
    (Number.isInteger(r.cardinality) && r.cardinality >= 0)) &&
  (r.shape === "restriction"
    ? !!r.property && !!r.quantifier
    : r.fillers.length === 1);
export function readWorkspace(input: unknown) {
  const doc = input as Workspace;
  if (!doc || doc.format !== "axiom-workspace" || doc.version !== 1)
    throw Error("Choose an Axiom workspace file.");
  const { entities, tbox, individuals, customers } = doc;
  if (
    !Array.isArray(entities) ||
    entities.length > 200000 ||
    !Array.isArray(tbox) ||
    tbox.length > 1000000 ||
    !Array.isArray(individuals) ||
    individuals.length > 1000000 ||
    !Array.isArray(customers) ||
    customers.length > 20000
  )
    throw Error("Workspace data is invalid or exceeds supported limits.");
  for (const e of entities)
    if (
      !e ||
      !text(e.iri) ||
      !text(e.name, 1000000) ||
      (e.label !== undefined && !text(e.label, 1000000)) ||
      (e.labelLanguage !== undefined && !text(e.labelLanguage, 100)) ||
      ![
        "Class",
        "Defined",
        "Individual",
        "ObjectProperty",
        "DataProperty",
        "AnnotationProperty",
        "Resource",
        "Datatype",
      ].includes(e.kind) ||
      !strings(e.parents) ||
      !strings(e.children) ||
      !strings(e.disjoint) ||
      !strings(e.types) ||
      !strings(e.characteristics) ||
      !text(e.comment, 1000000) ||
      !Array.isArray(e.restrictions) ||
      !e.restrictions.every(restriction) ||
      !Array.isArray(e.equivalents) ||
      !e.equivalents.every(restriction) ||
      [e.domain, e.range, e.inverse].some((v) => v !== undefined && !text(v))
    )
      throw Error("Invalid ontology entity.");
  if (!entities.some((e) => e.iri === THING))
    throw Error("The ontology root is missing.");
  for (const c of customers)
    if (!c || !text(c.iri) || !text(c.name, 256))
      throw Error("Invalid customer.");
  for (const i of individuals)
    if (
      !i ||
      !text(i.iri) ||
      !text(i.type) ||
      !text(i.reference, 256) ||
      !branches.includes(i.branch) ||
      !Number.isFinite(i.price) ||
      i.price < 0 ||
      i.price > 500 ||
      !Number.isInteger(i.rating) ||
      i.rating < 1 ||
      i.rating > 5 ||
      !Number.isFinite(i.timestamp) ||
      Math.abs(i.timestamp) > 8.64e15 ||
      !Number.isInteger(i.customerIndex) ||
      i.customerIndex < 0 ||
      i.customerIndex >= customers.length
    )
      throw Error("Invalid individual.");
  for (const t of tbox)
    if (
      !t ||
      !text(t.subject) ||
      !text(t.predicate) ||
      !t.object ||
      !text(t.object.value, 1000000) ||
      typeof t.object.literal !== "boolean" ||
      (t.object.datatype !== undefined && !text(t.object.datatype)) ||
      (t.object.language !== undefined && !text(t.object.language, 100)) ||
      (t.graph !== undefined && !text(t.graph))
    )
      throw Error("Invalid triple.");
  const all = [...entities, ...individuals, ...customers];
  if (new Set(all.map((e) => e.iri)).size !== all.length)
    throw Error("Duplicate entity IRI.");
  const g = doc.graph;
  if (
    !g ||
    !strings(g.iris, 3000) ||
    !strings(g.focus, 3000) ||
    !Array.isArray(g.pins) ||
    g.pins.length > 3000 ||
    !Number.isInteger(g.budget) ||
    g.budget < 100 ||
    g.budget > 3000 ||
    !isLayoutMode(g.layout)
  )
    throw Error("Invalid graph settings.");
  for (const p of g.pins)
    if (
      !p ||
      !text(p.iri) ||
      ![p.x, p.y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e8)
    )
      throw Error("Invalid pinned node.");
  if (g.stylesheet !== undefined) parseGraphStyle(g.stylesheet);
  const store = new Store();
  if (doc.ontology) {
    const o = doc.ontology;
    if (
      !text(o.name, 256) ||
      !o.name.trim() ||
      !text(o.namespace, 10000) ||
      !/^https?:\/\/[^\s]+[#/]$/.test(o.namespace) ||
      typeof o.example !== "boolean" ||
      (o.assertedOnly !== undefined && typeof o.assertedOnly !== "boolean") ||
      (o.source !== undefined &&
        (!o.source ||
          !text(o.source.fileName, 10000) ||
          !text(o.source.format, 100) ||
          !text(o.source.baseIRI, 10000) ||
          !text(o.source.importedAt, 100)))
    )
      throw Error("Invalid ontology metadata.");
    store.ontology = { ...o };
  }
  store.entities = new Map(structuredClone(entities).map((e) => [e.iri, e]));
  store.tbox = structuredClone(tbox);
  store.rebuildSchema();
  store.loadGenerated(
    individuals.map((i, index) => ({ ...i, index })),
    customers.map((c) => ({ ...c })),
  );
  const view = new Viewport(store),
    layouts = new Layouts(view, store);
  view.setBudget(g.budget);
  view.seed(g.iris, true, false);
  view.focus = new Set(g.focus.filter((i) => view.nodes.has(i)));
  for (const p of g.pins) {
    const n = view.nodes.get(p.iri);
    if (n) {
      n.pinned = true;
      n.x = p.x;
      n.y = p.y;
    }
  }
  layouts.choice = g.layout;
  layouts.run();
  return {
    stylesheet: g.stylesheet ?? "",
    store,
    view,
    layouts,
    selected:
      doc.selected && store.exists(doc.selected)
        ? doc.selected
        : store.exists(NS.pizza + "Pizza")
          ? NS.pizza + "Pizza"
          : THING,
  };
}

export function buildEmptyStore() {
  const s = new Store();
  s.ontology = {
    name: "Untitled ontology",
    namespace: "http://example.org/ontology#",
    example: false,
  };
  s.addEntity(THING, "Class").comment =
    "The universal class. Create your classes beneath Thing.";
  s.tbox.push({
    subject: THING,
    predicate: TYPE,
    object: iriTerm(NS.owl + "Class"),
  });
  s.rebuildSchema();
  return s;
}
