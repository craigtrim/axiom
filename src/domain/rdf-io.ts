import { Parser, Writer, DataFactory } from "n3";
import { sourcePrefixes } from "../shared/source";
import { RdfXmlParser } from "rdfxml-streaming-parser";
import { JsonLdParser } from "jsonld-streaming-parser";
import type { Quad, Term as RdfTerm } from "@rdfjs/types";
import { Store } from "./store";
import { NS, type Triple, type Term } from "./model";
import { projectEntities, statementKey, validateStatement } from "./rdf-model";
export type RdfFormat =
  "turtle" | "rdfxml" | "ntriples" | "nquads" | "trig" | "jsonld";
export function detectFormat(text: string, fileName: string): RdfFormat {
  const head = text.trimStart();
  if (
    /^<\?xml|^<!DOCTYPE|^<[A-Za-z_][^>]*\bxmlns[:=]/.test(head.slice(0, 2000))
  )
    return "rdfxml";
  if (/^[{\[]/.test(head)) return "jsonld";
  if (/\.(?:owl|rdf|xml)$/i.test(fileName) && /^(?:@prefix|@base|PREFIX|BASE)\b/i.test(head)) return "turtle";
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "nt"
    ? "ntriples"
    : ext === "nq"
      ? "nquads"
      : ext === "trig"
        ? "trig"
        : ext === "jsonld"
          ? "jsonld"
          : ext === "rdf" || ext === "xml" || ext === "owl"
            ? "rdfxml"
            : "turtle";
}
function xmlEntities(text: string) {
  const match = text.match(/<!DOCTYPE\s+[^\[>]*(?:\[[\s\S]*?\]\s*)?>/i);
  if (!match) return text;
  const dtd = match[0];
  if (/\b(?:SYSTEM|PUBLIC)\b|<!ENTITY\s+%/i.test(dtd))
    throw Error(
      "External XML entities are not loaded. Use a self-contained RDF/XML file.",
    );
  const defs = new Map(
    [...dtd.matchAll(/<!ENTITY\s+([\w.-]+)\s+["']([^"'<>]*)["']\s*>/g)].map(
      (m) => [m[1], m[2]],
    ),
  );
  if (defs.size > 100 || dtd.length > 65536)
    throw Error("The XML entity declarations exceed supported limits.");
  function resolve(key: string, seen = new Set<string>()): string {
    if (seen.has(key) || seen.size > 10)
      throw Error("Circular or deeply nested XML entities are not supported.");
    const value = defs.get(key);
    if (value === undefined) return "&" + key + ";";
    seen.add(key);
    let size = 0;
    const result = value.replace(/&([\w.-]+);/g, (_, child) => {
      const next = resolve(child, new Set(seen));
      size += next.length;
      if (size > 65536) throw Error("An XML entity is too large.");
      return next;
    });
    if (result.length > 65536) throw Error("An XML entity is too large.");
    return result;
  }
  let size = 0;
  return text.replace(dtd, "").replace(/&([\w.-]+);/g, (_, key) => {
    const value = resolve(key);
    size += value.length;
    if (size + text.length > 128 * 1024 * 1024)
      throw Error("The expanded XML file exceeds the import limit.");
    return value;
  });
}
const resource = (t: RdfTerm) =>
  t.termType === "BlankNode" ? "_:" + t.value : t.value;
function fromQuad(q: Quad): Triple {
  if (q.subject.termType === "Quad" || q.object.termType === "Quad")
    throw Error("RDF-star quoted triples are not supported.");
  const o = q.object;
  const object: Term =
    o.termType === "Literal"
      ? {
          value: o.value,
          literal: true,
          ...(o.language ? { language: o.language } : {}),
          ...(o.datatype ? { datatype: o.datatype.value } : {}),
        }
      : { value: resource(o), literal: false };
  return {
    subject: resource(q.subject),
    predicate: q.predicate.value,
    object,
    ...(q.graph.termType === "DefaultGraph"
      ? {}
      : { graph: resource(q.graph) }),
  };
}
export async function parseRdf(
  text: string,
  fileName: string,
  baseIRI: string,
  format = detectFormat(text, fileName),
  options: { allowEmpty?: boolean; preserveBlankNodes?: boolean } = {},
) {
  if (Buffer.byteLength(text) > 128 * 1024 * 1024)
    throw Error("Ontology files must be 128 MB or smaller.");
  const triples: Triple[] = [],
    seen = new Set<string>();
  const add = (q: Quad) => {
    const t = fromQuad(q);
    validateStatement(t);
    const key = statementKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      triples.push(t);
    }
    if (triples.length > 1000000)
      throw Error("The ontology exceeds one million statements.");
  };
  if (format === "rdfxml" || format === "jsonld") {
    const parser =
      format === "rdfxml"
        ? new RdfXmlParser({ baseIRI, trackPosition: true })
        : new JsonLdParser({
            baseIRI,
            documentLoader: {
              load: async () => {
                throw Error(
                  "Remote JSON-LD contexts are not loaded. Import a file with an embedded context.",
                );
              },
            },
          });
    await new Promise<void>((resolve, reject) => {
      parser.on("data", (q: Quad) => {
        try {
          add(q);
        } catch (e) {
          parser.destroy(e as Error);
        }
      });
      parser.on("error", reject);
      parser.on("end", resolve);
      parser.end(format === "rdfxml" ? xmlEntities(text) : text);
    });
  } else {
    const parser = new Parser({
      baseIRI,
      format: (
        {
          turtle: "Turtle",
          ntriples: "N-Triples",
          nquads: "N-Quads",
          trig: "TriG",
        } as Record<string, string>
      )[format],
      blankNodePrefix: options.preserveBlankNodes ? "" : "import",
    });
    await new Promise<void>((resolve, reject) =>
      parser.parse(text, (error, quad) => {
        if (error) reject(error);
        else if (quad) {
          try {
            add(quad);
          } catch (e) {
            reject(e);
          }
        } else resolve();
      }),
    );
  }
  if (!triples.length && !options.allowEmpty)
    throw Error(
      "No RDF statements were found. OWL files must use an RDF serialization.",
    );
  return { triples, format };
}
export function storeFromRdf(
  triples: Triple[],
  name: string,
  source?: {
    fileName: string;
    format: string;
    baseIRI: string;
    importedAt: string;
  },
) {
  const store = new Store();
  store.entities = projectEntities(triples);
  store.tbox = structuredClone(triples);
  const declared = triples.find(
    (t) =>
      t.predicate === NS.rdf + "type" && t.object.value === NS.owl + "Ontology",
  )?.subject;
  const base =
    declared && !declared.startsWith("_:") ? declared : source?.baseIRI;
  store.ontology = {
    name,
    namespace:
      base && /^https?:/.test(base)
        ? base.replace(/[#/]?$/, "#")
        : "http://example.org/ontology#",
    example: false,
    assertedOnly: true,
    ...(source ? { source } : {}),
  };
  store.rebuildSchema();
  return store;
}
const node = (value: string) =>
  value.startsWith("_:")
    ? DataFactory.blankNode(value.slice(2))
    : DataFactory.namedNode(value);
export async function writeRdf(
  triples: Triple[],
  format: "turtle" | "ntriples" | "nquads" | "trig" | "rdfxml" | "jsonld",
) {
  if (
    !["nquads", "trig", "jsonld"].includes(format) &&
    triples.some((t) => t.graph)
  )
    throw Error(
      "This dataset has named graphs. Choose TriG, N-Quads or JSON-LD to preserve them.",
    );
  if (format === "rdfxml") return writeXml(triples);
  if (format === "jsonld") {
    const graphs = new Map<string, Map<string, Record<string, unknown>>>();
    for (const t of triples) {
      const g = graphs.get(t.graph ?? "") ?? new Map();
      graphs.set(t.graph ?? "", g);
      const e = g.get(t.subject) ?? { "@id": t.subject };
      g.set(t.subject, e);
      const list = (e[t.predicate] ??= []) as unknown[];
      list.push(
        t.object.literal
          ? {
              "@value": t.object.value,
              ...(t.object.language
                ? { "@language": t.object.language }
                : t.object.datatype
                  ? {
                      "@type": t.object.datatype.includes(":")
                        ? t.object.datatype
                        : NS.xsd + t.object.datatype,
                    }
                  : {}),
            }
          : { "@id": t.object.value },
      );
    }
    return JSON.stringify(
      [...graphs].flatMap(([g, es]) =>
        g ? [{ "@id": g, "@graph": [...es.values()] }] : [...es.values()],
      ),
      null,
      2,
    );
  }
  const writer = new Writer({
    ...(["turtle", "trig"].includes(format) ? { prefixes: sourcePrefixes } : {}),
    format: {
      turtle: "Turtle",
      ntriples: "N-Triples",
      nquads: "N-Quads",
      trig: "TriG",
    }[format],
  });
  for (const t of triples) {
    const o = t.object.literal
      ? DataFactory.literal(
          t.object.value,
          t.object.language ||
            (t.object.datatype
              ? DataFactory.namedNode(
                  t.object.datatype.includes(":")
                    ? t.object.datatype
                    : NS.xsd + t.object.datatype,
                )
              : undefined),
        )
      : node(t.object.value);
    writer.addQuad(
      node(t.subject),
      DataFactory.namedNode(t.predicate),
      o,
      t.graph ? node(t.graph) : DataFactory.defaultGraph(),
    );
  }
  return await new Promise<string>((resolve, reject) =>
    writer.end((error, text) => (error ? reject(error) : resolve(text))),
  );
}
const xml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("\r", "&#13;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
function writeXml(triples: Triple[]) {
  const namespaces = new Map<string, string>(),
    props = new Map<string, string>(),
    blanks = new Map<string, string>();
  const blank = (s: string) => {
    if (!blanks.has(s)) blanks.set(s, "b" + blanks.size);
    return blanks.get(s)!;
  };
  for (const t of triples) {
    const m = t.predicate.match(/^(.*?)([\p{L}_][\p{L}\p{N}_.-]*)$/u);
    if (!m)
      throw Error(
        "A predicate cannot be represented as an XML element. Choose Turtle instead.",
      );
    if (!namespaces.has(m[1])) namespaces.set(m[1], "p" + namespaces.size);
    props.set(t.predicate, namespaces.get(m[1]) + ":" + m[2]);
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="' +
    NS.rdf +
    '" ' +
    [...namespaces]
      .map(([u, p]) => "xmlns:" + p + '="' + xml(u) + '"')
      .join(" ") +
    ">\n" +
    triples
      .map((t) => {
        const subject = t.subject.startsWith("_:")
            ? 'rdf:nodeID="' + blank(t.subject) + '"'
            : 'rdf:about="' + xml(t.subject) + '"',
          p = props.get(t.predicate)!,
          o = t.object;
        return (
          "<rdf:Description " +
          subject +
          "><" +
          p +
          (o.literal
            ? (o.language
                ? ' xml:lang="' + xml(o.language) + '"'
                : o.datatype
                  ? ' rdf:datatype="' +
                    xml(
                      o.datatype.includes(":")
                        ? o.datatype
                        : NS.xsd + o.datatype,
                    ) +
                    '"'
                  : "") +
              ">" +
              xml(o.value) +
              "</" +
              p +
              ">"
            : o.value.startsWith("_:")
              ? ' rdf:nodeID="' + blank(o.value) + '"/>'
              : ' rdf:resource="' + xml(o.value) + '"/>') +
          "</rdf:Description>"
        );
      })
      .join("\n") +
    "\n</rdf:RDF>"
  );
}
