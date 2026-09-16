import { instancePage } from "../domain/instances";
import { parseRdf, storeFromRdf, writeRdf } from "../domain/rdf-io";
import { sourceDocument, applySource, linkedFile } from "../domain/source";
import type { SourceDocument } from "../shared/source";
import { validateStatement } from "../domain/rdf-model";
import { queryContext } from "../domain/query-context";
import { researchContext, applySuggestions } from "../domain/research";
import {
  taxonomyContext,
  validateTaxonomySuggestions,
  applyTaxonomySuggestions,
} from "../domain/taxonomy-assistant";
import { taxonomyMode } from "../shared/taxonomy-assistant";
import { readWorkspace, buildEmptyStore } from "../domain/workspace";
import { parentPort, Worker } from "node:worker_threads";
import path from "node:path";
import { History } from "../domain/history";
import { parseGraphStyle } from "../domain/graph-style";
import { isLayoutMode, isExternalLayout } from "../shared/layout-options";
import { buildStore, generate } from "../domain/fixture";
import { Store } from "../domain/store";
import { Viewport, admissionText, edgeKey } from "../domain/viewport";
import { Layouts, type LayoutMode } from "../domain/layouts";
import {
  NS,
  TYPE,
  THING,
  defaultFilter,
  sizes,
  branches,
  type TableFilter,
  type Individual,
  type Entity,
  type Triple,
  type Customer,
} from "../domain/model";
import type { QueryResult } from "../domain/query";
import { QueryRunner } from "./query-runner";
const queryRunner = new QueryRunner();
import { QueryResultCache } from "./query-result-cache";
const queryResults = new QueryResultCache();
let activeQueryKey = "";
const querySummary = (id: number, r: QueryResult): QuerySummary => ({
  id,
  queryType: r.queryType,
  columns: r.columns,
  rowCount: r.rows.length,
  total: r.total,
  capped: r.capped,
  milliseconds: r.milliseconds,
  storeVersion: r.storeVersion,
});
import type {
  Snapshot,
  DomainMethod,
  InspectorData,
  QuerySummary,
} from "../shared/protocol";
let store = buildStore(),
  view = new Viewport(store),
  layouts = new Layouts(view, store),
  frozen = false,
  reducedMotion = false,
  selected: string | null = NS.pizza + "Pizza",
  message = "Ready",
  dirty = false,
  queryId = 0,
  resultId = 0;
let datasetEpoch = 0;
let activeQuery: AbortController | undefined,
  result: QueryResult | undefined,
  tableCache: { key: string; rows: Individual[] } | undefined;
const emit = (type: string, data: unknown) =>
  parentPort!.postMessage({ event: { type, data } });
view.seed([NS.pizza + "Pizza"]);
layouts.run();

const history = new History();
let stylesheet = "",
  documentRevision = 0,
  savedRevision = 0,
  nextRevision = 0;
type Frame = ReturnType<typeof captureFrame>;
function captureFrame() {
  return {
    nodes: structuredClone([...view.nodes]),
    edges: structuredClone([...view.edges]),
    routes: structuredClone([...view.routes]),
    selectedEdge: view.selectedEdge,
    focus: [...view.focus],
    budget: view.budget,
    eviction: view.evictionMode,
    clock: view.clock,
    selected,
    frozen,
    choice: layouts.choice,
    resolved: layouts.resolved,
    groups: structuredClone(layouts.groups),
    rings: [...layouts.rings],
    ringOrigin: { ...layouts.ringOrigin },
    stylesheet,
    documentRevision,
  };
}
function restoreFrame(frame: Frame) {
  stopExternal();
  view.nodes = new Map(structuredClone(frame.nodes));
  view.edges = new Map(structuredClone(frame.edges));
  view.routes = new Map(structuredClone(frame.routes));
  view.selectedEdge = frame.selectedEdge;
  view.focus = new Set(frame.focus);
  view.budget = frame.budget;
  view.evictionMode = frame.eviction;
  view.clock = frame.clock;
  view.selected = selected = frame.selected;
  view.alpha = 0;
  view.revision++;
  frozen = frame.frozen;
  layouts.choice = frame.choice;
  layouts.resolved = frame.resolved;
  layouts.groups = structuredClone(frame.groups);
  layouts.rings = [...frame.rings];
  layouts.ringOrigin = { ...frame.ringOrigin };
  stylesheet = frame.stylesheet;
  documentRevision = frame.documentRevision;
  dirty = documentRevision !== savedRevision;
  tableCache = undefined;
}
let external:
  | {
      worker: Worker;
      timer: ReturnType<typeof setTimeout>;
      capture?: () => void;
    }
  | undefined;
function stopExternal() {
  if (external) {
    clearTimeout(external.timer);
    void external.worker.terminate();
    external = undefined;
  }
}
function runLayout(fresh = true) {
  layouts.run(fresh);
  if (!isExternalLayout(layouts.choice) || !view.nodes.size) return;
  stopExternal();
  const revision = view.revision,
    epoch = datasetEpoch;
  const worker = new Worker(path.join(__dirname, "layout-worker.cjs"), {
    workerData: {
      mode: layouts.choice,
      nodes: [...view.nodes.values()],
      edges: [...view.edges.values()],
    },
  });
  const task = {
    worker,
    timer: setTimeout(
      () =>
        finish(
          "Layout timed out. Try a smaller visible graph or another layout.",
        ),
      30000,
    ),
    capture: undefined as (() => void) | undefined,
  };
  external = task;
  function finish(
    error?: string,
    positions?: { iri: string; x: number; y: number }[],
  ) {
    if (external !== task) return;
    clearTimeout(task.timer);
    // Keep an in-flight layout from moving the endpoints during a connection.
    if (!error && graphInteractions.size) {
      task.timer = setTimeout(() => finish(undefined, positions), 25);
      return;
    }
    void worker.terminate();
    external = undefined;
    if (epoch !== datasetEpoch || revision !== view.revision) return;
    if (error) {
      message = error;
      emit("layout-error", { message: error });
    } else {
      for (const p of positions ?? []) {
        const n = view.nodes.get(p.iri);
        if (n && !n.pinned && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          n.x = p.x;
          n.y = p.y;
          n.vx = n.vy = 0;
        }
      }
      view.alpha = 0;
      message = "Layout complete: " + layouts.choice + ".";
      task.capture?.();
    }
    publish();
    emit("layout-finished", {});
  }
  worker.on("message", (r) => finish(r.error, r.positions));
  worker.on("error", (e) => finish(e.message));
  message = "Computing " + layouts.choice + " layout...";
}
const tracked = new Set<DomainMethod>([
  "seed",
  "expand",
  "collapse",
  "remove",
  "pin",
  "drag",
  "budget",
  "eviction",
  "layout",
  "freeze",
  "clear",
  "rename",
  "createClass",
  "createProperty",
  "updateEntity",
  "applySource",
  "editEdge",
  "createEdge",
  "routeEdge",
  "deleteClass",
  "editCell",
  "createIndividual",
  "tableGraph",
  "queryGraph",
  "stylesheet",
  "regenerate",
  "applySuggestions",
  "applyTaxonomySuggestions",
]);
const graphInteractions = new Set<string>();
let dragBefore: Frame | undefined;
async function operate(method: DomainMethod, args: Record<string, unknown>) {
  if (["new", "example", "load", "importRdf"].includes(method)) {
    if (method !== "load") stopExternal();
    const value = await dispatch(method, args);
    history.clear();
    graphInteractions.clear();
    dragBefore = undefined;
    documentRevision = savedRevision = 0;
    publish();
    return value;
  }
  if (
    !tracked.has(method) ||
    (args.record === false && ["budget", "stylesheet"].includes(method))
  )
    return dispatch(method, args);
  if (method !== "drag" || !args.dragging) stopExternal();
  const before =
      method === "drag" ? (dragBefore ?? captureFrame()) : captureFrame(),
    initialVersion = store.version,
    oldCommands = store.undoStack.length;
  const generated =
    method === "regenerate"
      ? { individuals: store.individuals, customers: store.customers }
      : undefined;
  const value = await dispatch(method, args);
  if (method === "drag" && args.dragging) {
    dragBefore ??= before;
    return value;
  }
  if (method === "drag") dragBefore = undefined;
  const commands = store.undoStack.splice(oldCommands);
  store.redoStack = [];
  let after = captureFrame();
  if (
    JSON.stringify(before) !== JSON.stringify(after) ||
    store.version !== initialVersion
  ) {
    documentRevision = ++nextRevision;
    after.documentRevision = documentRevision;
    dirty = documentRevision !== savedRevision;
    const replacement = generated
      ? { individuals: store.individuals, customers: store.customers }
      : undefined;
    const dataChanged = commands.length > 0 || !!generated;
    history.push({
      label:
        commands.length === 1
          ? commands[0].label
          : ((
              {
                seed: "Show nodes",
                expand: "Expand node",
                collapse: "Collapse node",
                remove: "Remove node from view",
                pin: "Pin node",
                drag: "Move node",
                routeEdge: "Reroute edge",
                budget: "Change node limit",
                eviction: "Change eviction policy",
                layout: "Change graph layout",
                freeze: "Freeze or resume layout",
                clear: "Clear graph",
                tableGraph: "Show filtered individuals",
                queryGraph: "Show query results",
                stylesheet: "Change graph styles",
                regenerate: "Regenerate dataset",
                applySuggestions: "Apply research suggestions",
                applyTaxonomySuggestions:
                  args.mode === "children"
                    ? "Add child classes"
                    : "Add named instances",
              } as Record<string, string>
            )[method] ?? method),
      bytes:
        JSON.stringify(before).length +
        JSON.stringify(after).length +
        (generated
          ? (generated.individuals.length +
              (replacement?.individuals.length ?? 0)) *
            240
          : commands.length * store.entities.size * 350),
      undo: () => {
        for (const c of [...commands].reverse()) c.undo();
        if (generated)
          store.loadGenerated(generated.individuals, generated.customers);
        if (dataChanged) store.version++;
        restoreFrame(before);
      },
      redo: () => {
        for (const c of commands) c.redo();
        if (replacement)
          store.loadGenerated(replacement.individuals, replacement.customers);
        if (dataChanged) store.version++;
        restoreFrame(after);
      },
    });
    if (external)
      external.capture = () => {
        after = captureFrame();
      };
  }
  publish();
  return value;
}

function graph() {
  return {
    title: store.ontology.name,
    stylesheet,
    layoutPending: !!external,
    evictionMode: view.evictionMode,
    nodes: [...view.nodes.values()],
    edges: [...view.edges.values()],
    selectedEdge: view.selectedEdge,
    focus: [...view.focus],
    budget: view.budget,
    hidden: view.hidden,
    revision: view.revision,
    mode: layouts.resolved,
    choice: layouts.choice,
    groups: layouts.groups,
    rings: layouts.rings,
    ringOrigin: layouts.ringOrigin,
    frozen,
  };
}
function snapshot(): Snapshot {
  return {
    ontology: store.ontology,
    datasetEpoch,
    version: store.version,
    classCount: store.classCount,
    propertyCount: store.propertyCount,
    individualCount: store.individualCount,
    orderCount: store.individuals.length,
    customerCount: store.customers.length,
    tripleCount: store.tripleCount,
    entities: [...store.entities.values()].map((e) => ({
      ...e,
      instances: store.instanceCount(e.iri),
      descendants: store.descendantCount(e.iri),
    })),
    customers: store.customers,
    types: store.ontology.example
      ? [...store.byType.keys()]
      : [...store.entities.values()]
          .filter((e) => ["Class", "Defined"].includes(e.kind))
          .map((e) => e.iri),
    canUndo: !!history.undoStack.length,
    canRedo: !!history.redoStack.length,
    undoLabel: history.undoStack.at(-1)?.label,
    redoLabel: history.redoStack.at(-1)?.label,
    graph: graph(),
    selected,
    message,
    dirty,
  };
}
function publish() {
  if (view.selectedEdge && !view.edges.has(view.selectedEdge))
    view.selectedEdge = null;
  emit("state", snapshot());
}
function changed(text: string, layout = false) {
  message = text;
  if (layout) runLayout(false);
  publish();
}
function mutate(text: string) {
  if (selected) view.selectedEdge = null;
  if (selected && !store.exists(selected)) selected = THING;
  dirty = true;
  tableCache = undefined;
  view.refresh();
  changed(text, true);
}
function getTable(args: Record<string, unknown>) {
  const f = { ...defaultFilter, ...(args.filter as Partial<TableFilter>) };
  if (
    !["iri", "type", "ref", "branch", "price", "rating", "ts", "cust"].includes(
      f.sort,
    )
  )
    throw Error("Unknown table column.");
  if (f.direction !== 1 && f.direction !== -1)
    throw Error("Invalid sort direction.");
  const key = JSON.stringify([store.version, f]);
  if (tableCache?.key !== key) tableCache = { key, rows: store.table(f) };
  return tableCache.rows;
}
const string = (a: Record<string, unknown>, key: string, max = 200000) => {
  if (typeof a[key] !== "string" || (a[key] as string).length > max)
    throw Error("Invalid " + key + ".");
  return a[key] as string;
};
const number = (
  a: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
) => {
  const n = a[key];
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
    throw Error("Invalid " + key + ".");
  return n;
};
function retargetGraph(iri: string, next: string) {
  if (next !== iri) {
    const node = view.nodes.get(iri);
    if (node) {
      view.nodes.delete(iri);
      view.nodes.set(next, { ...node, iri: next });
    }
    view.routes = new Map(
      [...view.routes].map(([key, point]) => [
        JSON.stringify(
          (JSON.parse(key) as string[]).map((value) =>
            value === iri ? next : value,
          ),
        ),
        point,
      ]),
    );
    if (view.focus.delete(iri)) view.focus.add(next);
    if (view.selected === iri) view.selected = next;
  }
}
async function dispatch(method: DomainMethod, a: Record<string, unknown>) {
  switch (method) {
    case "entityDocument": {
      const iri = string(a, "iri");
      return {
        entity: store.resolve(iri),
        statements: store.entityStatements(iri),
        version: store.version,
        datasetEpoch,
      };
    }
    case "updateEntity": {
      if (a.datasetEpoch !== datasetEpoch || a.version !== store.version)
        throw Error("The ontology changed. Reload this editor before saving.");
      const iri = string(a, "iri"),
        next = typeof a.nextIri === "string" ? a.nextIri : iri;
      validateStatement({
        subject: next,
        predicate: TYPE,
        object: { literal: false, value: THING },
      });
      selected = store.updateEntity(iri, a.statements as Triple[], next);
      retargetGraph(iri, selected);
      mutate("Entity updated.");
      return selected;
    }
    case "createProperty": {
      validateCreation(a);
      if (
        !["ObjectProperty", "DataProperty", "AnnotationProperty"].includes(
          String(a.kind),
        )
      )
        throw Error("Choose a property kind.");
      selected = store.createProperty(
        string(a, "name", 256),
        a.kind as "ObjectProperty",
      );
      mutate("Property created.");
      placeCreated(a);
      return selected;
    }
    case "importRdf": {
      const initialEpoch = datasetEpoch,
        initialVersion = store.version;
      const parsed = await parseRdf(
        string(a, "text", 134217728),
        string(a, "fileName", 10000),
        string(a, "baseIRI", 10000),
      );
      if (datasetEpoch !== initialEpoch || store.version !== initialVersion)
        throw Error(
          "The workspace changed during import. Import the file again.",
        );
      const next = storeFromRdf(parsed.triples, string(a, "fileName", 10000), {
        fileName: string(a, "fileName", 10000),
        format: parsed.format,
        baseIRI: string(a, "baseIRI", 10000),
        importedAt: new Date().toISOString(),
      });
      stopExternal();
      activeQuery?.abort();
      activeQuery = undefined;
      queryId++;
      result = undefined;
      queryResults.clear();
      activeQueryKey = "";
      emit("query-state", { running: false, hasResults: false });
      const budget = view.budget;
      store = next;
      view = new Viewport(store);
      view.setBudget(budget);
      layouts = new Layouts(view, store);
      const roots = [...store.entities.values()]
        .filter(
          (e) =>
            ["Class", "Defined"].includes(e.kind) &&
            !e.parents.length &&
            e.iri !== THING,
        )
        .slice(0, Math.min(40, budget));
      const iris = roots.length
        ? roots.map((e) => e.iri)
        : [...store.entities.keys()]
            .filter((i) => !i.startsWith("_:"))
            .slice(0, Math.min(40, budget));
      view.seed(iris, true, false);
      selected = iris[0] ?? THING;
      datasetEpoch++;
      dirty = true;
      frozen = false;
      tableCache = undefined;
      stylesheet = "";
      changed(
        "Imported " +
          parsed.triples.length.toLocaleString() +
          " RDF statements.",
        true,
      );
      return {
        format: parsed.format,
        triples: parsed.triples.length,
        entities: store.entities.size,
      };
    }
    case "sourceDocument":
      return sourceDocument(store, datasetEpoch, a.format);
    case "linkedFile":
      return linkedFile(store, string(a, "iri"));
    case "applySource": {
      const epoch = datasetEpoch,
        revision = documentRevision;
      const existing = new Set(store.entities.keys());
      const result = await applySource(
        store,
        datasetEpoch,
        a as unknown as SourceDocument,
        () => datasetEpoch === epoch && documentRevision === revision,
      );
      const added = [...store.entities.keys()].filter(
        (iri) => !existing.has(iri) && !iri.startsWith("_:"),
      );
      view.refresh();
      view.admit(
        added.slice(
          0,
          Math.max(0, Math.min(40, view.budget - view.nodes.size)),
        ),
      );
      mutate("Source changes applied to all views.");
      return result;
    }
    case "rdfExport":
      return writeRdf([...store.scan()], a.format as "turtle");
    case "reportData": {
      const ids =
        a.scope === "ontology"
          ? undefined
          : new Set(
              Array.isArray(a.iris) ? (a.iris as string[]) : view.nodes.keys(),
            );
      return {
        ontology: store.ontology,
        datasetEpoch,
        version: store.version,
        entities: [
          ...store.entities.values(),
          ...store.individuals.map((i) => store.resolve(i.iri)!),
          ...store.customers.map((i) => store.resolve(i.iri)!),
        ].filter((e) => !ids || ids.has(e.iri)),
        triples: [...store.scan()].filter((t) => !ids || ids.has(t.subject)),
        graph: graph(),
        generatedAt: new Date().toISOString(),
      };
    }
    case "queryContext":
      return queryContext(
        store,
        string(a, "instructions", 12000),
        datasetEpoch,
      );
    case "taxonomyContext":
      return taxonomyContext(
        store,
        string(a, "iri", 10000),
        taxonomyMode(a.mode),
        datasetEpoch,
      );
    case "validateTaxonomySuggestions":
    case "applyTaxonomySuggestions": {
      if (a.datasetEpoch !== datasetEpoch || a.version !== store.version)
        throw Error(
          "The ontology changed. Find suggestions again before adding them.",
        );
      const iri = string(a, "iri", 10000),
        mode = taxonomyMode(a.mode);
      if (method === "validateTaxonomySuggestions")
        return validateTaxonomySuggestions(store, iri, mode, a.suggestions);
      const created = applyTaxonomySuggestions(
        store,
        iri,
        mode,
        a.suggestions as import("../shared/taxonomy-assistant").TaxonomySuggestion[],
      );
      selected = iri;
      mutate(
        "Added " +
          created.length +
          (mode === "children" ? " child classes." : " named instances.") +
          " Undo restores the previous ontology.",
      );
      return created;
    }
    case "researchContext":
      return researchContext(store, string(a, "iri", 10000), datasetEpoch);
    case "applySuggestions": {
      if (a.datasetEpoch !== datasetEpoch || a.version !== store.version)
        throw Error(
          "The ontology changed since this research. Run it again before applying suggestions.",
        );
      const created = applySuggestions(
        store,
        string(a, "iri", 10000),
        a.suggestions as import("../shared/research").Suggestion[],
      );
      mutate(
        "Applied " +
          created.length +
          " researched entities. Undo restores the previous ontology.",
      );
      return created;
    }
    case "state":
      return snapshot();
    case "example":
    case "new": {
      const budget = view.budget;
      store = method === "example" ? buildStore() : buildEmptyStore();
      frozen = false;
      view = new Viewport(store);
      view.setBudget(budget);
      layouts = new Layouts(view, store);
      view.seed([store.ontology.example ? NS.pizza + "Pizza" : THING]);
      runLayout();
      selected = store.ontology.example ? NS.pizza + "Pizza" : THING;
      dirty = false;
      tableCache = undefined;
      activeQuery?.abort();
      activeQuery = undefined;
      queryId++;
      result = undefined;
      queryResults.clear();
      activeQueryKey = "";
      emit("query-state", { running: false, hasResults: false });
      datasetEpoch++;
      changed(
        store.ontology.example
          ? "Pizza example opened."
          : "New ontology created. Add a class to begin.",
      );
      return true;
    }
    case "search": {
      const q = string(a, "text", 256).trim().toLowerCase();
      if (!q) return [];
      const matches: { iri: string; name: string; kind: string }[] = [];
      const add = (iri: string, name: string, kind: string) => {
        if (matches.length < 80 && (iri + " " + name).toLowerCase().includes(q))
          matches.push({ iri, name, kind });
      };
      for (const e of store.entities.values()) add(e.iri, e.name, e.kind);
      for (const c of store.customers) {
        add(c.iri, c.name, "Individual");
        if (matches.length >= 80) break;
      }
      for (const i of store.individuals) {
        add(i.iri, i.reference + " · " + store.label(i.type), "Individual");
        if (matches.length >= 80) break;
      }
      return matches;
    }
    case "regenerate": {
      if (!store.ontology.example)
        throw Error("Open the Pizza example to generate demo orders.");
      const size = number(a, "size", 1000, 100000);
      if (!sizes.includes(size)) throw Error("Unsupported dataset size.");
      activeQuery?.abort();
      activeQuery = undefined;
      queryId++;
      result = undefined;
      queryResults.clear();
      activeQueryKey = "";
      emit("query-state", { running: false, hasResults: false });
      datasetEpoch++;
      const d = generate(size);
      store.loadGenerated(d.individuals, d.customers);
      view.clear();
      view.seed([NS.pizza + "Pizza"]);
      runLayout();
      selected = NS.pizza + "Pizza";
      dirty = true;
      tableCache = undefined;
      changed(
        "Dataset regenerated: " + size.toLocaleString("en-GB") + " orders.",
      );
      return true;
    }
    case "selectEdge": {
      const key = a.key === null ? null : string(a, "key", 40000);
      if (key && !view.edges.has(key))
        throw Error("This edge is no longer visible.");
      view.selectedEdge = key;
      selected = view.selected = null;
      publish();
      return true;
    }
    case "edgeDocument": {
      const edge = view.edges.get(string(a, "key", 40000));
      if (!edge) throw Error("This edge is no longer visible.");
      const statements = store.tbox.filter(
        (t) =>
          t.subject === edge.source &&
          t.predicate === edge.predicate &&
          !t.object.literal &&
          t.object.value === edge.target,
      );
      return {
        edge,
        statements,
        datasetEpoch,
        version: store.version,
        reason: statements.length
          ? undefined
          : store.individualIndex.has(edge.source) ||
              store.customerIndex.has(edge.source)
            ? "This relationship belongs to generated sample data. Export and reimport the ontology to edit it."
            : "This edge summarizes an ontology axiom. Its underlying axiom must be edited as a whole; the line can still be rerouted here.",
      };
    }
    case "graphInteraction": {
      if (a.datasetEpoch !== datasetEpoch) return false;
      const token = string(a, "token", 128);
      if (a.active === true) graphInteractions.add(token);
      else graphInteractions.delete(token);
      return true;
    }
    case "createEdge": {
      if (a.datasetEpoch !== datasetEpoch || a.version !== store.version)
        throw Error("The ontology changed. Start the connection again.");
      const statement = a.statement as Triple;
      validateStatement(statement);
      if (statement.object.literal)
        throw Error("Choose a resource as the edge target.");
      const endpoints = [statement.subject, statement.object.value];
      const needed = new Set(endpoints.filter((iri) => !view.nodes.has(iri)))
        .size;
      const room =
        view.budget -
        view.nodes.size +
        (view.evictionMode === "refuse"
          ? 0
          : view.evictionOrder().filter((n) => !endpoints.includes(n.iri))
              .length);
      if (needed > room)
        throw Error("The graph is full. Make room for the endpoints first.");
      store.createEdge(statement);
      view.refresh();
      // Reserve both endpoints before admitting a node into a full graph.
      for (const node of view
        .evictionOrder()
        .filter((n) => !endpoints.includes(n.iri))
        .slice(0, Math.max(0, needed - (view.budget - view.nodes.size))))
        view.remove(node.iri);
      view.admit(endpoints);
      const key = edgeKey({
        source: statement.subject,
        predicate: statement.predicate,
        target: statement.object.value,
      });
      selected = view.selected = null;
      view.selectedEdge = view.edges.has(key) ? key : null;
      dirty = true;
      tableCache = undefined;
      changed("Relationship added. Use Undo to remove it.");
      return key;
    }
    case "editEdge": {
      if (a.datasetEpoch !== datasetEpoch || a.version !== store.version)
        throw Error("The ontology changed. Reload the edge before saving.");
      const key = string(a, "key", 40000),
        edge = view.edges.get(key);
      if (!edge) throw Error("This edge is no longer visible.");
      const original = a.original as Triple,
        replacement = a.replacement as Triple | undefined;
      validateStatement(original);
      if (
        original.subject !== edge.source ||
        original.predicate !== edge.predicate ||
        original.object.literal ||
        original.object.value !== edge.target
      )
        throw Error("Choose a statement belonging to this edge.");
      const endpoints = replacement
        ? [replacement.subject, replacement.object?.value]
        : [];
      if (replacement) {
        validateStatement(replacement);
        const needed = new Set(endpoints.filter((iri) => !view.nodes.has(iri)))
          .size;
        const room =
          view.budget -
          view.nodes.size +
          (view.evictionMode === "refuse"
            ? 0
            : view.evictionOrder().filter((n) => !endpoints.includes(n.iri))
                .length);
        if (needed > room)
          throw Error(
            "The graph is full. Make room for the new endpoint first.",
          );
      }
      store.editEdge(original, replacement);
      view.refresh();
      if (replacement) view.admit(endpoints);
      const next = replacement
        ? edgeKey({
            source: replacement.subject,
            predicate: replacement.predicate,
            target: replacement.object.value,
          })
        : null;
      if (!view.edges.has(key)) {
        const bend = view.routes.get(key);
        view.routes.delete(key);
        if (next && bend && !view.routes.has(next)) {
          view.routes.set(next, bend);
          const e = view.edges.get(next);
          if (e) e.bend = bend;
        }
      }
      selected = view.selected = null;
      view.selectedEdge =
        next && view.edges.has(next) ? next : view.edges.has(key) ? key : null;
      dirty = true;
      tableCache = undefined;
      changed(replacement ? "Edge updated." : "Edge removed.");
      return next;
    }
    case "routeEdge": {
      if (a.datasetEpoch !== datasetEpoch)
        throw Error("The workspace changed. Select the edge again.");
      const key = string(a, "key", 40000),
        edge = view.edges.get(key);
      if (!edge) throw Error("This edge is no longer visible.");
      const bend =
        a.bend === null
          ? undefined
          : {
              x: number(a.bend as Record<string, unknown>, "x", -1e8, 1e8),
              y: number(a.bend as Record<string, unknown>, "y", -1e8, 1e8),
            };
      if (bend) view.routes.set(key, bend);
      else view.routes.delete(key);
      edge.bend = bend;
      view.revision++;
      changed(bend ? "Edge rerouted." : "Automatic edge route restored.");
      return true;
    }
    case "select":
      selected = string(a, "iri");
      if (!store.exists(selected))
        throw Error("This entity is no longer in the Store.");
      view.selected = selected;
      view.selectedEdge = null;
      emit("selection", { iri: selected });
      return true;
    case "inspector": {
      const iri = string(a, "iri"),
        e = store.resolve(iri);
      if (!e) return null;
      const order = store.individualIndex.get(iri);
      const data: InspectorData = {
        entity: e,
        instances: store.instanceCount(iri),
        descendants: store.descendantCount(iri),
        order,
        customer: order
          ? store.customers[order.customerIndex]
          : store.customerIndex.get(iri),
        values: [...store.scan(iri)].map((t) => ({
          predicate: t.predicate,
          term: t.object,
        })),
      };
      return data;
    }
    case "instances": {
      if (a.datasetEpoch !== datasetEpoch)
        throw Error("The workspace changed. Open the instance report again.");
      return instancePage(
        store,
        string(a, "iri"),
        string(a, "query", 512),
        number(a, "start", 0, 1000000),
      );
    }
    case "table": {
      const rows = getTable(a),
        start = Math.floor(number(a, "start", 0, 1000000)),
        end = Math.floor(number(a, "end", start, start + 1000));
      return {
        rows: rows.slice(start, end).map((i) => ({
          ...i,
          customerName: store.customers[i.customerIndex]?.name ?? "",
        })),
        total: rows.length,
        version: store.version,
      };
    }
    case "tableGraph": {
      const rows = getTable(a);
      if (!rows.length) {
        changed("No rows to send. The filter matches nothing.");
        return true;
      }
      view.seed(
        rows.slice(0, view.budget).map((i) => i.iri),
        true,
        false,
      );
      runLayout();
      changed(
        "Showing " +
          view.nodes.size +
          " of " +
          rows.length +
          " filtered individuals.",
      );
      return true;
    }
    case "seed": {
      const iris = a.iris;
      if (
        !Array.isArray(iris) ||
        iris.length > 200000 ||
        iris.some((i) => typeof i !== "string")
      )
        throw Error("Invalid graph selection.");
      const r = view.seed(iris, a.replace !== false, a.expand !== false);
      runLayout();
      changed(admissionText(r));
      return true;
    }
    case "expand":
      changed(admissionText(view.expand(string(a, "iri"))), true);
      return true;
    case "collapse":
      changed(
        "Removed " + view.collapse(string(a, "iri")) + " unshared leaf nodes.",
        true,
      );
      return true;
    case "remove":
      view.remove(string(a, "iri"));
      changed("Removed from the graph.", true);
      return true;
    case "pin": {
      const n = view.nodes.get(string(a, "iri"));
      if (n) {
        n.pinned = !n.pinned;
        changed(
          n.pinned ? "Pinned " + n.label + "." : "Unpinned " + n.label + ".",
        );
      }
      return true;
    }
    case "drag": {
      const n = view.nodes.get(string(a, "iri"));
      if (n) {
        n.x = number(a, "x", -1e8, 1e8);
        n.y = number(a, "y", -1e8, 1e8);
        n.dragging = !!a.dragging;
        n.vx = n.vy = 0;
        view.alpha = Math.max(view.alpha, 0.2);
        emit("positions", {
          revision: view.revision,
          positions: Float64Array.from(
            [...view.nodes.values()].flatMap((n) => [n.x, n.y]),
          ),
          alpha: view.alpha,
        });
      }
      return true;
    }
    case "budget":
      changed(view.setBudget(number(a, "value", 100, 3000)), true);
      return true;
    case "eviction": {
      const mode = string(a, "mode");
      if (!["degree", "lru", "refuse"].includes(mode))
        throw Error("Unknown eviction policy.");
      view.evictionMode = mode;
      changed("Eviction policy changed.");
      return true;
    }
    case "layout": {
      const mode = string(a, "mode");
      if (!isLayoutMode(mode)) throw Error("Unknown layout.");
      layouts.choice = mode as LayoutMode;
      runLayout();
      changed("Layout: " + layouts.resolved + ".");
      return true;
    }
    case "freeze":
      frozen = !frozen;
      changed(frozen ? "Layout frozen." : "Layout resumed.");
      return true;
    case "stylesheet": {
      const text = string(a, "text", 50000);
      parseGraphStyle(text);
      stylesheet = text;
      changed("Graph styles applied.");
      return true;
    }
    case "cancelLayout":
      stopExternal();
      changed("Layout cancelled.");
      return true;
    case "uiHistory": {
      const key = string(a, "key", 64),
        label = string(a, "label", 100);
      if (
        ![
          "graph.camera",
          "hierarchy.open",
          "hierarchy.tab",
          "table.filter",
          "layout",
          "theme",
          "arrangement",
          "research.templates",
        ].includes(key) ||
        JSON.stringify([a.before, a.after]).length > 300000
      )
        throw Error("Invalid history change.");
      const before = structuredClone(a.before),
        after = structuredClone(a.after);
      if (JSON.stringify(before) !== JSON.stringify(after))
        history.push({
          label,
          bytes: JSON.stringify([before, after]).length,
          undo: () => emit("restore-ui", { key, value: before }),
          redo: () => emit("restore-ui", { key, value: after }),
        });
      publish();
      return true;
    }
    case "motion":
      reducedMotion = !!a.reduced;
      return true;
    case "clear":
      view.clear();
      changed("Graph cleared.");
      return true;
    case "rename": {
      if (a.datasetEpoch !== undefined && a.datasetEpoch !== datasetEpoch)
        throw Error("The workspace changed. Rename the entity again.");
      const iri = string(a, "iri"),
        next = store.rename(iri, string(a, "name", 256));
      if (selected === iri) selected = next;
      retargetGraph(iri, next);
      mutate("Entity renamed.");
      return next;
    }
    case "createClass":
      validateCreation(a);
      selected = store.createClass(
        string(a, "name", 256),
        string(a, "parent"),
        typeof a.comment === "string" ? a.comment : "",
      );
      mutate("Class created.");
      placeCreated(a);
      return selected;
    case "deleteClass": {
      const iri = string(a, "iri");
      store.deleteClass(iri);
      if (selected === iri) selected = THING;
      mutate("Class deleted.");
      return true;
    }
    case "editCell":
      store.editCell(
        string(a, "iri"),
        string(a, "column", 32),
        string(a, "value", 256),
      );
      mutate("Value updated.");
      return true;
    case "createIndividual":
      validateCreation(a);
      selected =
        !store.ontology.example || typeof a.name === "string"
          ? store.createNamedIndividual(
              string(a, "name", 256),
              string(a, "type"),
              typeof a.comment === "string" ? a.comment : "",
            )
          : store.createIndividual(
              string(a, "type"),
              string(a, "branch", 64),
              string(a, "price", 64),
              number(a, "rating", 1, 5),
              number(a, "customerIndex", 0, store.customers.length - 1),
            );
      mutate("Individual created.");
      placeCreated(a);
      return selected;
    case "undo":
      stopExternal();
      if (history.undo()) changed("Change undone.");
      return true;
    case "redo":
      stopExternal();
      if (history.redo()) changed("Change redone.");
      return true;
    case "query": {
      activeQuery?.abort();
      const controller = new AbortController();
      activeQuery = controller;
      const id = ++queryId;
      const text = string(a, "text");
      const key = typeof a.queryKey === "string" ? a.queryKey : activeQueryKey;
      activeQueryKey = key;
      emit("query-state", { running: true, hasResults: !!result });
      try {
        const r = await queryRunner.run(
          store,
          datasetEpoch,
          text,
          controller.signal,
        );
        if (id !== queryId) throw Error("Query superseded.");
        queryResults.add(id, key, text, r);
        if (activeQueryKey === key) {
          result = r;
          resultId = id;
        }
        return querySummary(id, r);
      } finally {
        if (id === queryId) {
          activeQuery = undefined;
          emit("query-state", { running: false, hasResults: !!result });
        }
      }
    }
    case "cancelQuery":
      activeQuery?.abort();
      return true;
    case "queryActivate": {
      activeQueryKey = string(a, "key", 100);
      const cached =
        typeof a.id === "number"
          ? queryResults.get(a.id, activeQueryKey)
          : undefined;
      result = cached?.result;
      resultId = result && typeof a.id === "number" ? a.id : 0;
      emit("query-state", { running: !!activeQuery, hasResults: !!result });
      return result ? querySummary(resultId, result) : null;
    }
    case "queryResult": {
      const cached =
        typeof a.id === "number" && a.epoch === datasetEpoch
          ? queryResults.peek(a.id, string(a, "key", 100))
          : undefined;
      return cached ? querySummary(a.id as number, cached.result) : null;
    }
    case "queryPage": {
      const pageResult =
        typeof a.id === "number" &&
        (a.epoch === undefined || a.epoch === datasetEpoch)
          ? queryResults.get(
              a.id,
              typeof a.key === "string" ? a.key : undefined,
            )?.result
          : undefined;
      if (!pageResult) return { rows: [], total: 0, retained: false };
      const start = Math.floor(number(a, "start", 0, 200000)),
        end = Math.floor(number(a, "end", start, start + 1000));
      return {
        retained: true,
        rows: pageResult.rows.slice(start, end),
        total: pageResult.rows.length,
      };
    }
    case "queryGraph": {
      const chosen =
        a.id === undefined
          ? result
          : a.epoch === datasetEpoch && typeof a.id === "number"
            ? queryResults.get(a.id, string(a, "key", 100))?.result
            : undefined;
      if (a.id !== undefined && !chosen)
        throw Error(
          "These results are no longer retained. Open the query and run it again.",
        );
      if (chosen) {
        view.seed(
          chosen.iris.filter((i) => store.exists(i)).slice(0, view.budget),
          true,
          false,
        );
        runLayout();
        changed("Query results sent to graph.");
      }
      return true;
    }
    case "serialize":
      return {
        format: "axiom-workspace",
        ontology: store.ontology,
        storeVersion: store.version,
        workspaceRevision: documentRevision,
        datasetEpoch,
        version: 1,
        entities: [...store.entities.values()],
        tbox: store.tbox,
        individuals: store.individuals,
        customers: store.customers,
        graph: {
          iris: [...view.nodes.keys()],
          focus: [...view.focus],
          pins: [...view.nodes.values()]
            .filter((n) => n.pinned)
            .map((n) => ({ iri: n.iri, x: n.x, y: n.y })),
          budget: view.budget,
          layout: layouts.choice,
          routes: [...view.routes].map(([key, bend]) => ({ key, ...bend })),
          stylesheet,
        },
        selected,
      };
    case "markSaved":
      if (
        a.version === store.version &&
        a.epoch === datasetEpoch &&
        (a.revision === undefined || a.revision === documentRevision)
      ) {
        savedRevision = documentRevision;
        dirty = false;
      }
      publish();
      return true;
    case "load": {
      const next = readWorkspace(a.document);
      stopExternal();
      stylesheet = next.stylesheet;
      activeQuery?.abort();
      activeQuery = undefined;
      queryId++;
      result = undefined;
      queryResults.clear();
      activeQueryKey = "";
      emit("query-state", { running: false, hasResults: false });
      store = next.store;
      view = next.view;
      layouts = next.layouts;
      selected = next.selected;
      frozen = false;
      dirty = false;
      tableCache = undefined;
      datasetEpoch++;
      changed("Workspace opened.");
      return true;
    }
    default:
      throw Error("Unknown operation.");
  }
}
parentPort!.on(
  "message",
  async ({
    id,
    method,
    args,
  }: {
    id: number;
    method: DomainMethod;
    args?: Record<string, unknown>;
  }) => {
    try {
      const value = await operate(method, args ?? {});
      parentPort!.postMessage({ id, value });
    } catch (e) {
      parentPort!.postMessage({
        id,
        error: e instanceof Error ? e.message : String(e),
        hint: (e as { hint?: string }).hint,
      });
    }
  },
);
let lastPositions = 0;
function simulate() {
  if (
    frozen ||
    graphInteractions.size ||
    layouts.resolved !== "force" ||
    view.alpha < 0.004
  ) {
    setTimeout(simulate, 25);
    return;
  }
  const start = performance.now();
  do {
    layouts.force.step(true);
  } while (view.alpha >= 0.004 && performance.now() - start < 8);
  const now = performance.now();
  if ((!reducedMotion && now - lastPositions >= 16) || view.alpha < 0.004) {
    lastPositions = now;
    emit("positions", {
      revision: view.revision,
      positions: Float64Array.from(
        [...view.nodes.values()].flatMap((n) => [n.x, n.y]),
      ),
      alpha: view.alpha,
    });
  }
  setImmediate(simulate);
}
simulate();

function validateCreation(a: Record<string, unknown>) {
  if (a.datasetEpoch !== undefined && a.datasetEpoch !== datasetEpoch)
    throw Error("The workspace changed. Create the entity again.");
  if (a.position) {
    const p = a.position as { x: number; y: number };
    if (![p.x, p.y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e8))
      throw Error("Invalid graph position.");
    if (
      view.nodes.size >= view.budget &&
      (view.evictionMode === "refuse" || !view.evictionOrder().length)
    )
      throw Error(
        "The graph is full. Raise the visible node limit or remove an unpinned node before creating here.",
      );
  }
}
function placeCreated(a: Record<string, unknown>) {
  if (!selected || !a.position) return;
  const p = a.position as { x: number; y: number };
  if (![p.x, p.y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1e8))
    return;
  view.seed([selected], false, false);
  const node = view.nodes.get(selected);
  if (node) {
    node.x = p.x;
    node.y = p.y;
    node.pinned = true;
    changed("Created " + store.label(selected) + ".");
  }
}
