import { writeTurtleSnippet } from "./turtle-snippet";
// craigtrim/axiom#208: files enter the plain Node service as streams, not strings.
import { StreamParser, Writer, DataFactory } from "n3";
import { createReadStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { rdfTextChunks, rdfXmlChunks, type RdfChunks } from "./rdf-stream";
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
  if (
    /\.(?:owl|rdf|xml)$/i.test(fileName) &&
    /^(?:@prefix|@base|PREFIX|BASE)\b/i.test(head)
  )
    return "turtle";
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
  return parseRdfStream([text], fileName, baseIRI, format, options);
}

export async function parseRdfFile(
  file: string,
  fileName: string,
  baseIRI: string,
) {
  let head = "";
  // A separate bounded sniff preserves content detection even after arbitrary
  // leading whitespace. Reopen the file so parser positions retain that prefix.
  for await (const chunk of createReadStream(file, { encoding: "utf8" })) {
    const text = head ? chunk : chunk.trimStart();
    head = (head + text).slice(0, 2000);
    if (head.length === 2000) break;
  }
  return parseRdfStream(
    createReadStream(file),
    fileName,
    baseIRI,
    detectFormat(head, fileName),
  );
}

export async function parseRdfStream(
  input: RdfChunks,
  fileName: string,
  baseIRI: string,
  format: RdfFormat,
  options: { allowEmpty?: boolean; preserveBlankNodes?: boolean } = {},
) {
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
  };
  const parser =
    format === "rdfxml"
      ? new RdfXmlParser({ baseIRI, trackPosition: true })
      : format === "jsonld"
        ? new JsonLdParser({
            baseIRI,
            documentLoader: {
              load: async () => {
                throw Error(
                  "Remote JSON-LD contexts are not loaded. Import a file with an embedded context.",
                );
              },
            },
          })
        : new StreamParser({
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
  const text = rdfTextChunks(input);
  await pipeline(
    Readable.from(format === "rdfxml" ? rdfXmlChunks(text) : text, {
      objectMode: false,
      encoding: "utf8",
    }),
    parser,
    new Writable({
      objectMode: true,
      write(quad: Quad, _encoding, callback) {
        try {
          add(quad);
          callback();
        } catch (e) {
          callback(e instanceof Error ? e : Error(String(e)));
        }
      },
    }),
  );
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
  options: { takeOwnership?: boolean } = {},
) {
  const store = new Store();
  store.entities = projectEntities(triples);
  store.tbox = options.takeOwnership ? triples : structuredClone(triples);
  const declared = triples.find(
    (t) =>
      t.predicate === NS.rdf + "type" && t.object.value === NS.owl + "Ontology",
  )?.subject;
  const base =
    declared && !declared.startsWith("_:") ? declared : source?.baseIRI;
  store.ontology = {
    name,
    ...(declared && !declared.startsWith("_:") ? { iri: declared } : {}),
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
  options: {
    prefixes?: Record<string, string>;
    preserveBlankNodes?: boolean;
    // craigtrim/axiom#207: analysis serialization must leave time for selections.
    yieldControl?: () => Promise<void>;
  } = {},
) {
  if (
    !["nquads", "trig", "jsonld"].includes(format) &&
    triples.some((t) => t.graph)
  )
    throw Error(
      "This dataset has named graphs. Choose TriG, N-Quads or JSON-LD to preserve them.",
    );
  if (format === "rdfxml") return writeXml(triples, options);
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
  if (format === "turtle" || format === "trig")
    return writeTurtleSnippet(
      triples,
      options.prefixes ?? sourcePrefixes,
      "",
      new Set(),
      format,
      options.yieldControl,
    );
  const writer = new Writer({
    ...(["turtle", "trig"].includes(format)
      ? { prefixes: options.prefixes ?? sourcePrefixes }
      : {}),
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
function writeXml(
  triples: Triple[],
  options: {
    prefixes?: Record<string, string>;
    preserveBlankNodes?: boolean;
  } = {},
) {
  const namespaces = new Map<string, string>(),
    props = new Map<string, string>(),
    blanks = new Map<string, string>();
  const blank = (s: string) => {
    if (!blanks.has(s))
      blanks.set(
        s,
        options.preserveBlankNodes
          ? "axiom" + Buffer.from(s.slice(2)).toString("hex")
          : "b" + blanks.size,
      );
    return blanks.get(s)!;
  };
  for (const t of triples) {
    const m = t.predicate.match(/^(.*?)([\p{L}_][\p{L}\p{N}_.-]*)$/u);
    if (!m)
      throw Error(
        "A predicate cannot be represented as an XML element. Choose Turtle instead.",
      );
    if (!namespaces.has(m[1]))
      namespaces.set(
        m[1],
        Object.entries(options.prefixes ?? {}).find(
          ([prefix, base]) => base === m[1] && !!prefix,
        )?.[0] ?? "p" + namespaces.size,
      );
    props.set(t.predicate, namespaces.get(m[1]) + ":" + m[2]);
  }
  const subjects = new Map<string, Triple[]>();
  for (const t of triples) {
    const rows = subjects.get(t.subject) ?? [];
    rows.push(t);
    subjects.set(t.subject, rows);
  }
  const namespacesText = [...namespaces]
    .filter(([, p]) => p !== "rdf")
    .map(([u, p]) => "    xmlns:" + p + '="' + xml(u) + '"')
    .join("\n");
  const blocks = [...subjects].map(([id, rows]) => {
    const subject = id.startsWith("_:")
      ? 'rdf:nodeID="' + blank(id) + '"'
      : 'rdf:about="' + xml(id) + '"';
    const properties = rows
      .map((t) => {
        const p = props.get(t.predicate)!,
          o = t.object;
        return (
          "        <" +
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
              : ' rdf:resource="' + xml(o.value) + '"/>')
        );
      })
      .join("\n");
    return (
      "    <rdf:Description " +
      subject +
      ">\n" +
      properties +
      "\n    </rdf:Description>"
    );
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="' +
    NS.rdf +
    '"' +
    (namespacesText ? "\n" + namespacesText : "") +
    ">\n\n" +
    blocks.join("\n\n") +
    "\n\n</rdf:RDF>\n"
  );
}
