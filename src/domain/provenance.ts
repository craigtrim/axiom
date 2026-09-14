import { Writer, DataFactory } from "n3";
import { pathToFileURL } from "node:url";
import { type Triple, NS } from "./model";
import type {
  FileEvidence,
  ProvenanceOptions,
  ProvenanceStatus,
} from "../shared/provenance";
const RDF = NS.rdf,
  RDFS = NS.rdfs,
  OWL = NS.owl;
export const PROV = "http://www.w3.org/ns/prov#",
  FS = "urn:axiom:filesystem:",
  XSD = "http://www.w3.org/2001/XMLSchema#";
const resource = (
  subject: string,
  predicate: string,
  value: string,
): Triple => ({ subject, predicate, object: { value, literal: false } });
const literal = (
  subject: string,
  predicate: string,
  value: unknown,
): Triple => ({
  subject,
  predicate,
  object: {
    value: typeof value === "string" ? value : JSON.stringify(value),
    literal: true,
    datatype:
      typeof value === "boolean"
        ? XSD + "boolean"
        : typeof value === "number" && Number.isInteger(value)
          ? XSD + "integer"
          : undefined,
  },
});
export function scanTriples(
  s: ProvenanceStatus,
  options: ProvenanceOptions,
): Triple[] {
  const id = "urn:uuid:" + s.id,
    software = FS + "Axiom";
  return [
    resource(id, RDF + "type", PROV + "Activity"),
    literal(id, RDFS + "label", "Filesystem observation: " + s.root),
    resource(id, PROV + "wasAssociatedWith", software),
    resource(software, RDF + "type", PROV + "SoftwareAgent"),
    literal(software, RDFS + "label", "Axiom metadata collector"),
    {
      ...literal(id, PROV + "startedAtTime", s.startedAt!),
      object: {
        value: s.startedAt!,
        literal: true,
        datatype: XSD + "dateTime",
      },
    },
    literal(id, FS + "selectedRoot", s.root),
    literal(id, FS + "collectionOptions", options),
    literal(
      id,
      RDFS + "comment",
      "An observation of available filesystem and embedded metadata. File timestamps, owners and authors in metadata are recorded claims; they do not prove historical creation, attribution or derivation.",
    ),
    ...[
      PROV + "Entity",
      PROV + "Activity",
      PROV + "Agent",
      PROV + "SoftwareAgent",
      PROV + "Collection",
    ].flatMap((c) => [
      resource(c, RDF + "type", OWL + "Class"),
      literal(c, RDFS + "label", c.slice(PROV.length)),
    ]),
    resource(PROV + "SoftwareAgent", RDFS + "subClassOf", PROV + "Agent"),
    resource(PROV + "Collection", RDFS + "subClassOf", PROV + "Entity"),
  ];
}
export function evidenceTriples(e: FileEvidence, scanId: string): Triple[] {
  const file = pathToFileURL(e.path).href,
    observation =
      "urn:uuid:" +
      scanId +
      ":observation:" +
      encodeURIComponent(e.path) +
      ":" +
      encodeURIComponent(e.observedAt),
    activity = "urn:uuid:" + scanId;
  const triples = [
    resource(file, RDF + "type", PROV + "Entity"),
    literal(file, RDFS + "label", e.path.split(/[\\/]/).pop() || e.path),
    literal(file, FS + "path", e.path),
    resource(observation, RDF + "type", PROV + "Entity"),
    literal(
      observation,
      RDFS + "label",
      "Metadata: " + e.path.split(/[\\/]/).pop(),
    ),
    resource(observation, PROV + "wasGeneratedBy", activity),
    resource(observation, PROV + "wasDerivedFrom", file),
    resource(observation, FS + "describes", file),
    {
      ...literal(observation, PROV + "generatedAtTime", e.observedAt),
      object: {
        value: e.observedAt,
        literal: true,
        datatype: XSD + "dateTime",
      },
    },
    literal(observation, FS + "isReparsePoint", e.reparse),
  ];
  if (e.directory)
    triples.push(resource(file, RDF + "type", PROV + "Collection"));
  if (e.parent)
    triples.push(
      resource(pathToFileURL(e.parent).href, PROV + "hadMember", file),
    );
  // Preserve every returned field and error exactly, with queryable leaf properties.
  for (const [family, data] of Object.entries(e.metadata)) {
    const json = JSON.stringify(data);
    for (let i = 0; i < json.length; i += 500000)
      triples.push(
        literal(
          observation,
          FS +
            "raw:" +
            encodeURIComponent(family) +
            (json.length > 500000 ? ":part" + i : ""),
          json.slice(i, i + 500000),
        ),
      );
    flatten(data, [family], (key, value) => {
      if (typeof value === "string" && value.length > 500000) return;
      triples.push(
        literal(observation, FS + "metadata:" + encodeURIComponent(key), value),
      );
    });
  }
  for (const issue of e.issues)
    triples.push(literal(observation, FS + "coverageIssue", issue));
  return triples;
}
function flatten(
  value: unknown,
  parts: string[],
  emit: (key: string, value: unknown) => void,
) {
  if (value === null || typeof value !== "object") {
    emit(parts.join("/"), value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, [...parts, String(i)], emit));
    return;
  }
  Object.entries(value).forEach(([k, v]) => flatten(v, [...parts, k], emit));
}
export function completionTriples(s: ProvenanceStatus): Triple[] {
  const id = "urn:uuid:" + s.id;
  return [
    {
      ...literal(id, PROV + "endedAtTime", s.endedAt!),
      object: { value: s.endedAt!, literal: true, datatype: XSD + "dateTime" },
    },
    literal(id, FS + "completionStatus", s.status),
    literal(id, FS + "entriesObserved", s.entries),
    literal(id, FS + "coverageIssues", s.issues),
    literal(id, FS + "collectionSummary", s),
  ];
}
export function ntriples(ts: Triple[]): string {
  const { namedNode, literal, quad } = DataFactory;
  return new Writer({ format: "N-Triples" }).quadsToString(
    ts.map((t) =>
      quad(
        namedNode(t.subject),
        namedNode(t.predicate),
        t.object.literal
          ? literal(
              t.object.value,
              t.object.datatype ? namedNode(t.object.datatype) : undefined,
            )
          : namedNode(t.object.value),
      ),
    ),
  );
}
