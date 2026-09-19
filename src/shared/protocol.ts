import type {
  Entity,
  Individual,
  Customer,
  TableFilter,
  Term,
} from "../domain/model";
import type { GraphNode, GraphEdge } from "../domain/viewport";
import type { LayoutMode, GroupBlock } from "../domain/layouts";
export interface GraphSnapshot {
  id?: string;
  selected?: string | null;
  title?: string;
  stylesheet?: string;
  evictionMode?: string;
  layoutPending?: boolean;
  spacing?: number;
  edgesVisible?: boolean;
  countsVisible?: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  focus: string[];
  budget: number;
  hidden: number;
  revision: number;
  mode: LayoutMode;
  choice: LayoutMode;
  groups: GroupBlock[];
  rings: number[];
  ringOrigin: { x: number; y: number };
  frozen: boolean;
  selectedEdge?: string | null;
}
export interface Snapshot {
  ontology: import("../domain/model").OntologyInfo;
  datasetEpoch: number;
  version: number;
  classCount: number;
  propertyCount: number;
  individualCount: number;
  orderCount: number;
  customerCount: number;
  tripleCount: number;
  entities: (Entity & { instances: number; descendants: number })[];
  customers: Customer[];
  types: string[];
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  graph: GraphSnapshot;
  graphs?: Record<string, GraphSnapshot>;
  activeGraphId?: string;
  selected: string | null;
  message: string;
  dirty: boolean;
}
export interface EdgeDocument {
  graphId?: string;
  edge: GraphEdge;
  statements: import("../domain/model").Triple[];
  reason?: string;
  datasetEpoch: number;
  version: number;
}
export interface InspectorData {
  entity: Entity;
  instances: number;
  descendants: number;
  order?: Individual;
  customer?: Customer;
  values: { predicate: string; term: Term }[];
}
export interface TablePage {
  rows: (Individual & { customerName: string })[];
  total: number;
  version: number;
}
export interface QuerySummary {
  queryType?: "SELECT" | "ASK" | "CONSTRUCT" | "DESCRIBE";
  columns: string[];
  rowCount: number;
  total: number;
  capped: boolean;
  milliseconds: number;
  storeVersion: number;
  id: number;
}
export type DomainMethod =
  | "intersectionSuggestions"
  | "subclassSuggestions"
  | "applySubclassSuggestions"
  | "applyIntersection"
  | "graphCreate"
  | "graphActivate"
  | "new"
  | "importRdf"
  | "rdfExport"
  | "sourceDocument"
  | "applySource"
  | "linkedFile"
  | "resourceSuggestions"
  | "predicateOptions"
  | "entitySource"
  | "applyEntitySource"
  | "entityDocument"
  | "updateEntity"
  | "createProperty"
  | "reportData"
  | "example"
  | "search"
  | "find"
  | "state"
  | "regenerate"
  | "select"
  | "selectEdge"
  | "edgeDocument"
  | "editEdge"
  | "createEdge"
  | "graphInteraction"
  | "routeEdge"
  | "inspector"
  | "instances"
  | "table"
  | "tableGraph"
  | "seed"
  | "expand"
  | "expandMax"
  | "collapse"
  | "remove"
  | "pin"
  | "drag"
  | "budget"
  | "eviction"
  | "layout"
  | "spacing"
  | "edgeVisibility"
  | "countVisibility"
  | "freeze"
  | "clear"
  | "rename"
  | "createClass"
  | "deleteClass"
  | "editCell"
  | "createIndividual"
  | "undo"
  | "redo"
  | "query"
  | "cancelQuery"
  | "queryPage"
  | "queryActivate"
  | "queryResult"
  | "queryGraph"
  | "serialize"
  | "load"
  | "markSaved"
  | "motion"
  | "graphStyleCatalog"
  | "stylesheet"
  | "uiHistory"
  | "cancelLayout"
  | "queryContext"
  | "taxonomyContext"
  | "validateTaxonomySuggestions"
  | "applyTaxonomySuggestions"
  | "researchContext"
  | "applySuggestions";
export interface Preferences {
  keyboard?: import("./shortcuts").KeyboardSettings;
  version: 1;
  theme: "system" | "light" | "dark";
  layout?: unknown;
  panelState?: Record<string, unknown>;
  bounds?: { x: number; y: number; width: number; height: number };
  maximized?: boolean;
  arrangement?: "auto" | "standard" | "wide" | "custom";
}
export interface AxiomBridge {
  maximizeWindow(url: string): Promise<void>;
  editors: { dirty(count: number): void; flushed(error?: string): void };
  files: {
    open(iri: string): Promise<void>;
    reveal(iri: string): Promise<void>;
    thumbnail(iri: string): Promise<import("./source").FilePreview>;
  };
  provenance: {
    choose(): Promise<string | null>;
    start(
      options: import("./provenance").ProvenanceOptions,
    ): Promise<import("./provenance").ProvenanceStatus>;
    status(): Promise<import("./provenance").ProvenanceStatus>;
    cancel(): Promise<void>;
    open(): Promise<boolean>;
    reveal(): Promise<void>;
  };
  keyboard: {
    modal(active: boolean): void;
    menu(): void;
    save(
      settings: import("./shortcuts").KeyboardSettings,
    ): Promise<import("./shortcuts").KeyboardSettings>;
    import(): Promise<import("./shortcuts").KeyboardSettings | null>;
    export(
      settings: import("./shortcuts").KeyboardSettings,
    ): Promise<string | null>;
  };
  queryHistory: {
    result(
      id: string,
    ): Promise<import("./query-history").QueryResultDocument | null>;
    load(): Promise<import("./query-history").QueryHistoryView>;
    apply(
      action: import("./query-history").QueryHistoryAction,
    ): Promise<import("./query-history").QueryHistoryView>;
    search(
      text: string,
    ): Promise<import("./query-history").QueryEntrySummary[]>;
  };
  queryAssistant: {
    assistants(): Promise<import("./research").AssistantInfo[]>;
    run(
      request: import("./query-assistant").QueryAssistantRequest,
    ): Promise<import("./query-assistant").QueryAssistantResponse>;
    cancel(): Promise<void>;
    status(): Promise<import("./query-assistant").QueryAssistantStatus>;
  };
  taxonomyAssistant: {
    run(
      input: import("./taxonomy-assistant").TaxonomyRequest,
    ): Promise<import("./taxonomy-assistant").TaxonomyResponse>;
    status(): Promise<import("./taxonomy-assistant").TaxonomyStatus>;
    cancel(id: string): Promise<void>;
    apply(id: string, indices: number[]): Promise<string[]>;
  };
  research: {
    assistants(): Promise<import("./research").AssistantInfo[]>;
    run(
      request: import("./research").ResearchRequest,
    ): Promise<import("./research").ResearchResponse>;
    cancel(): Promise<void>;
    status(): Promise<{
      running: boolean;
      response?: import("./research").ResearchResponse;
      activeEntity?: string;
      startedAt?: number;
      provider?: import("./research").AssistantId;
      cancelling?: boolean;
      error?: string;
    }>;
    open(url: string): Promise<void>;
  };
  request<T = unknown>(
    method: DomainMethod,
    args?: Record<string, unknown>,
  ): Promise<T>;
  preferences: {
    load(): Promise<Preferences>;
    save(p: Preferences, captured?: boolean): Promise<void>;
  };
  onEvent(fn: (event: { type: string; data: any }) => void): () => void;
  onCommand(fn: (command: string) => void): () => void;
  command(command: string): void;
  menuState(state: Record<string, boolean>): void;
  exportFile(
    format: "svg" | "png" | "clipboard",
    data: string,
  ): Promise<string | null>;
  exportDocument(
    input: import("./export").ExportRequest,
  ): Promise<string | null>;
  copy(text: string): Promise<void>;
}
declare global {
  interface Window {
    axiom: AxiomBridge;
    MonacoEnvironment?: { getWorker: () => Worker };
    __axiom?: unknown;
  }
}
