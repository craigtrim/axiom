import { parseRdf, writeRdf } from "./rdf-io";
import {
  sourceFormats,
  type SourceDocument,
  type SourceFormat,
  type LinkedFile,
} from "../shared/source";
import type { Store } from "./store";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function sourceFormat(value: unknown): SourceFormat {
  if (!sourceFormats.some((f) => f.id === value))
    throw Error("Choose a supported RDF format.");
  return value as SourceFormat;
}
export async function sourceDocument(
  store: Store,
  datasetEpoch: number,
  requested?: unknown,
): Promise<SourceDocument> {
  const triples = [...store.scan()];
  const namedGraphs = triples.some((t) => !!t.graph);
  const format =
    requested === undefined
      ? namedGraphs
        ? "trig"
        : "turtle"
      : sourceFormat(requested);
  const version = store.version;
  return {
    text: await writeRdf(triples, format),
    format,
    version,
    datasetEpoch,
    namedGraphs,
    statements: triples.length,
  };
}
export async function applySource(
  store: Store,
  datasetEpoch: number,
  input: SourceDocument,
  unchanged = () => true,
) {
  const check = () => {
    if (
      input.datasetEpoch !== datasetEpoch ||
      input.version !== store.version ||
      !unchanged()
    )
      throw Error(
        "The ontology changed in another view. Your source draft is preserved. Review it, then reload the current document before applying.",
      );
  };
  check();
  if (typeof input.text !== "string") throw Error("Invalid source text.");
  const parsed = await parseRdf(
    input.text,
    "source",
    store.ontology.source?.baseIRI ?? store.ontology.namespace,
    sourceFormat(input.format),
    { allowEmpty: true, preserveBlankNodes: true },
  );
  check();
  store.replaceRdf(parsed.triples);
  return {
    statements: parsed.triples.length,
    version: store.version,
    datasetEpoch,
  };
}
export function linkedFile(store: Store, iri: string): LinkedFile | null {
  if (typeof iri !== "string" || iri.length > 10000)
    throw Error("Invalid entity identifier.");
  if (!store.exists(iri)) return null;
  // Metadata observations resolve to the file they explicitly describe.
  const described = [...store.scan(iri)].find(
    (t) =>
      t.predicate === "urn:axiom:filesystem:describes" && !t.object.literal,
  );
  const target = described?.object.value ?? iri;
  if (!target.startsWith("file:")) return null;
  let file: string;
  try {
    file = fileURLToPath(target);
  } catch {
    return null;
  }
  if (!path.isAbsolute(file) || file.includes("\0")) return null;
  return {
    iri: target,
    path: file,
    name: path.basename(file),
    image: /\.(?:png|jpe?g|gif|webp|bmp|tiff?|ico|avif)$/i.test(file),
  };
}
