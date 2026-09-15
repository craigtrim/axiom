export const sourcePrefixes: Record<string, string> = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  prov: "http://www.w3.org/ns/prov#",
  fs: "urn:axiom:filesystem:",
  skos: "http://www.w3.org/2004/02/skos/core#",
};
export const sourceFormats = [
  { id: "turtle", label: "Turtle (.ttl)", graphs: false },
  { id: "rdfxml", label: "RDF/XML / OWL (.rdf, .owl)", graphs: false },
  { id: "jsonld", label: "JSON-LD (.jsonld)", graphs: true },
  { id: "ntriples", label: "N-Triples (.nt)", graphs: false },
  { id: "nquads", label: "N-Quads (.nq)", graphs: true },
  { id: "trig", label: "TriG (.trig)", graphs: true },
] as const;
export type SourceFormat = (typeof sourceFormats)[number]["id"];
export interface SourceDocument {
  text: string;
  format: SourceFormat;
  datasetEpoch: number;
  version: number;
  namedGraphs: boolean;
  statements: number;
}
export interface LinkedFile {
  iri: string;
  path: string;
  name: string;
  image: boolean;
}
export interface FilePreview {
  dataUrl: string;
  width: number;
  height: number;
}
