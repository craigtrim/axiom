import { describe, it, expect } from "vitest";
import { canonize } from "rdf-canonize";
import {
  parseRdf,
  storeFromRdf,
  writeRdf,
  detectFormat,
} from "../../src/domain/rdf-io";
import {
  sourceDocument,
  applySource,
  linkedFile,
} from "../../src/domain/source";
import { sourceFormats } from "../../src/shared/source";
import { Viewport } from "../../src/domain/viewport";
import { NS, type Triple } from "../../src/domain/model";
import { pathToFileURL } from "node:url";
import path from "node:path";
const ttl = `@prefix ex: <https://example.org/>. @prefix owl: <http://www.w3.org/2002/07/owl#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
ex:Course a owl:Class; rdfs:label "Course"@en; rdfs:comment "line 1\\r\\nline 2".
ex:Lab a owl:Class; rdfs:subClassOf ex:Course; rdfs:label "Lab".
ex:student a ex:Lab; ex:credits "003"^^<http://www.w3.org/2001/XMLSchema#integer>;
ex:detail [ ex:note "A & B < C"; ex:next [ ex:note "nested" ] ].`;
const make = async () =>
  storeFromRdf(
    (await parseRdf(ttl, "test.ttl", "https://example.org/")).triples,
    "Test",
  );
const canonical = async (ts: Triple[]) =>
  canonize(await writeRdf(ts, "nquads"), {
    algorithm: "RDFC-1.0",
    inputFormat: "application/n-quads",
  });
describe("shared source authoring", () => {
  it.each(sourceFormats)(
    "round trips $id without losing RDF semantics or changing the live store",
    async ({ id }) => {
      const store = await make();
      const before = await canonical([...store.scan()]);
      const doc = await sourceDocument(store, 4, id);
      const parsed = await parseRdf(
        doc.text,
        "source",
        store.ontology.namespace,
        id,
      );
      expect(await canonical(parsed.triples)).toBe(before);
      expect(store.version).toBe(0);
      expect(store.undoStack).toHaveLength(0);
    },
  );
  it("updates taxonomy, instances, graph labels and undo/redo from source", async () => {
    const store = await make(),
      view = new Viewport(store);
    view.seed(["https://example.org/Lab"], true, false);
    const doc = await sourceDocument(store, 2);
    await applySource(store, 2, {
      ...doc,
      text: doc.text.replace('"Lab"', '"Laboratory"'),
    });
    view.refresh();
    expect(store.label("https://example.org/Lab")).toBe("Laboratory");
    expect(store.entities.get("https://example.org/student")!.types).toContain(
      "https://example.org/Lab",
    );
    expect(JSON.stringify([...view.nodes.values()])).toContain("Laboratory");
    store.undo();
    view.refresh();
    expect(store.label("https://example.org/Lab")).toBe("Lab");
    store.redo();
    expect(store.label("https://example.org/Lab")).toBe("Laboratory");
    store.rename("https://example.org/Lab", "Practical work");
    expect((await sourceDocument(store, 2)).text).toContain("Practical work");
  });
  it("preserves data and history when source is invalid or stale", async () => {
    const store = await make(),
      doc = await sourceDocument(store, 9);
    await expect(
      applySource(store, 9, { ...doc, text: "<broken" }),
    ).rejects.toThrow();
    expect(store.version).toBe(0);
    expect(store.undoStack).toHaveLength(0);
    store.rename("https://example.org/Lab", "Changed elsewhere");
    await expect(applySource(store, 9, doc)).rejects.toThrow("another view");
    await expect(
      applySource(store, 10, { ...doc, version: store.version }),
    ).rejects.toThrow("another view");
    expect(store.label("https://example.org/Lab")).toBe("Changed elsewhere");
  });
  it("rejects changes that race parsing and permits an undoable empty document", async () => {
    const store = await make(),
      doc = await sourceDocument(store, 1);
    let checks = 0;
    await expect(
      applySource(store, 1, doc, () => ++checks === 1),
    ).rejects.toThrow("another view");
    expect(store.version).toBe(0);
    await applySource(store, 1, { ...doc, text: "# empty ontology" });
    expect([...store.scan()]).toHaveLength(0);
    store.undo();
    expect([...store.scan()].length).toBeGreaterThan(0);
  });
  it("defaults named datasets to TriG and never flattens them for incompatible formats", async () => {
    const ts = (
      await parseRdf(ttl, "test.ttl", "https://example.org/")
    ).triples.map((t) => ({ ...t, graph: "urn:graph:one" }));
    const store = storeFromRdf(ts, "Graphs");
    expect((await sourceDocument(store, 1)).format).toBe("trig");
    for (const f of sourceFormats.filter((f) => !f.graphs))
      await expect(sourceDocument(store, 1, f.id)).rejects.toThrow(
        "named graphs",
      );
    for (const f of sourceFormats.filter((f) => f.graphs)) {
      const doc = await sourceDocument(store, 1, f.id);
      const round = await parseRdf(
        doc.text,
        "source",
        store.ontology.namespace,
        f.id,
      );
      expect(await canonical(round.triples)).toBe(await canonical(ts));
    }
  });
  it("recognizes Turtle in an OWL file and resolves observations to actual files", async () => {
    expect(detectFormat(ttl, "courses.owl")).toBe("turtle");
    const file = path.resolve("artifacts/example image.png"),
      iri = pathToFileURL(file).href;
    const store = storeFromRdf(
      [
        {
          subject: iri,
          predicate: NS.rdf + "type",
          object: { value: "http://www.w3.org/ns/prov#Entity", literal: false },
        },
        {
          subject: "urn:observation",
          predicate: "urn:axiom:filesystem:describes",
          object: { value: iri, literal: false },
        },
      ],
      "Files",
    );
    expect(linkedFile(store, iri)).toMatchObject({ path: file, image: true });
    expect(linkedFile(store, "urn:observation")).toMatchObject({
      iri,
      path: file,
      image: true,
    });
    expect(linkedFile(store, "https://example.org/missing")).toBeNull();
  });
});
