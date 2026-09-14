export const NS = {
  pizza: "http://www.co-ode.org/ontologies/pizza/pizza.owl#",
  demo: "http://example.org/pizzeria#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};
export const TYPE = NS.rdf + "type",
  SUBCLASS = NS.rdfs + "subClassOf",
  SUBPROPERTY = NS.rdfs + "subPropertyOf",
  THING = NS.owl + "Thing";
export const expand = (s: string): string => {
  const i = s.indexOf(":");
  return (NS as Record<string, string>)[s.slice(0, i)]
    ? (NS as Record<string, string>)[s.slice(0, i)] + s.slice(i + 1)
    : s;
};
export const local = (s: string) =>
  s.slice(Math.max(s.lastIndexOf("#"), s.lastIndexOf("/")) + 1);
export const humanise = (s: string) =>
  s.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
export const shorten = (s: string) => {
  for (const [p, n] of Object.entries(NS))
    if (s.startsWith(n)) return p + ":" + s.slice(n.length);
  return "<" + s + ">";
};
export type Kind =
  | "Class"
  | "Defined"
  | "Individual"
  | "ObjectProperty"
  | "DataProperty"
  | "AnnotationProperty"
  | "Resource"
  | "Datatype";
export const kindLabel = (k: Kind) =>
  ({
    Class: "Class",
    Defined: "Defined class",
    Individual: "Individual",
    ObjectProperty: "Object property",
    DataProperty: "Data property",
    AnnotationProperty: "Annotation property",
    Resource: "Resource",
    Datatype: "Datatype",
  })[k];
export interface Restriction {
  shape: string;
  property?: string;
  quantifier?: string;
  fillers: string[];
  cardinality?: number;
}
export function parseRestriction(s: string): Restriction {
  const p = s.trim().split(/\s+/);
  if (p[0] === "not") return { shape: "not", fillers: [expand(p[1])] };
  if (p.length === 1) return { shape: "class", fillers: [expand(p[0])] };
  const count = /^\d+$/.test(p[2] ?? "") ? +p[2] : undefined;
  return {
    shape: "restriction",
    property: expand(p[0]),
    quantifier: p[1],
    fillers: p.slice(count === undefined ? 2 : 3).map(expand),
    cardinality: count,
  };
}
export const restrictionText = (r: Restriction) =>
  r.shape === "class"
    ? shorten(r.fillers[0])
    : r.shape === "not"
      ? "not " + shorten(r.fillers[0])
      : shorten(r.property!) +
        " " +
        r.quantifier +
        (r.cardinality === undefined ? "" : " " + r.cardinality) +
        (r.fillers.length === 0
          ? ""
          : r.fillers.length === 1
            ? " " + shorten(r.fillers[0])
            : " (" + r.fillers.map(shorten).join(" or ") + ")");
export interface Entity {
  iri: string;
  name: string;
  label?: string;
  labelLanguage?: string;
  kind: Kind;
  parents: string[];
  children: string[];
  restrictions: Restriction[];
  equivalents: Restriction[];
  disjoint: string[];
  characteristics: string[];
  types: string[];
  comment: string;
  domain?: string;
  range?: string;
  inverse?: string;
  valuePartition?: boolean;
}
export const entity = (iri: string, kind: Kind): Entity => ({
  iri,
  name: local(iri),
  kind,
  parents: [],
  children: [],
  restrictions: [],
  equivalents: [],
  disjoint: [],
  characteristics: [],
  types: [],
  comment: "",
});
export interface Individual {
  index: number;
  iri: string;
  type: string;
  reference: string;
  branch: string;
  price: number;
  timestamp: number;
  rating: number;
  customerIndex: number;
}
export interface Customer {
  iri: string;
  name: string;
}
export interface Term {
  value: string;
  literal: boolean;
  datatype?: string;
  language?: string;
}
export const iriTerm = (value: string): Term => ({ value, literal: false });
export const literal = (value: unknown, datatype = "string"): Term => ({
  value: String(value),
  literal: true,
  datatype,
});
export const termDatatype = (t: Term) =>
  t.language
    ? NS.rdf + "langString"
    : t.datatype
      ? /^[a-z][a-z0-9+.-]*:/i.test(t.datatype)
        ? t.datatype
        : NS.xsd + t.datatype
      : NS.xsd + "string";
export const equivalent = (a: Term, b: Term) =>
  a.literal === b.literal &&
  a.value === b.value &&
  (!a.literal ||
    ((a.language ?? "").toLowerCase() === (b.language ?? "").toLowerCase() &&
      termDatatype(a) === termDatatype(b)));
export interface Triple {
  subject: string;
  predicate: string;
  object: Term;
  graph?: string;
}
export interface Neighbour {
  iri: string;
  predicate: string;
  outgoing: boolean;
}
export interface Adjacency {
  list: Neighbour[];
  total: number;
}
export const branches = [
  "Soho",
  "Shoreditch",
  "Camden",
  "Clerkenwell",
  "Borough",
  "Islington",
];
export const sizes = [1000, 12000, 50000, 100000];
export const compare = (a: string | number, b: string | number) =>
  a < b ? -1 : a > b ? 1 : 0;
export interface TableFilter {
  type: string;
  branch: string;
  query: string;
  sort: string;
  direction: number;
}
export const defaultFilter: TableFilter = {
  type: "",
  branch: "",
  query: "",
  sort: "iri",
  direction: 1,
};

export interface OntologyInfo {
  name: string;
  namespace: string;
  example: boolean;
  assertedOnly?: boolean;
  source?: {
    fileName: string;
    format: string;
    baseIRI: string;
    importedAt: string;
  };
}
