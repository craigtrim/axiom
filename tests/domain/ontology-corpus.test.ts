import { test, expect } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseRdf, storeFromRdf, writeRdf } from "../../src/domain/rdf-io";
import { readWorkspace, type Workspace } from "../../src/domain/workspace";
import { Viewport } from "../../src/domain/viewport";
import { THING, NS } from "../../src/domain/model";
import { statementKey } from "../../src/domain/rdf-model";
const root = "tests/fixtures/ontologies";
const manifest: {
  id: string;
  file: string;
  title: string;
  url: string;
  resolvedUrl: string;
  sha256: string;
}[] = JSON.parse(await readFile(root + "/manifest.json", "utf8"));
test("the corpus contains at least 25 independently published ontologies", () => {
  expect(manifest.length).toBeGreaterThanOrEqual(25);
  expect(new Set(manifest.map((m) => m.id)).size).toBe(manifest.length);
  expect(new Set(manifest.map((m) => m.sha256)).size).toBe(manifest.length);
});
for (const source of manifest)
  test(
    source.title +
      ": import, bounded view, label edit, workspace close/reopen and RDF export",
    async () => {
      const data = await readFile(root + "/" + source.file);
      expect(createHash("sha256").update(data).digest("hex")).toBe(
        source.sha256,
      );
      const parsed = await parseRdf(
        data.toString("utf8"),
        source.file,
        source.resolvedUrl,
      );
      const store = storeFromRdf(parsed.triples, source.title);
      expect(store.tbox.length).toBeGreaterThan(0);
      expect(store.entities.size).toBeGreaterThan(1);
      const view = new Viewport(store);
      view.setBudget(100);
      view.seed([...store.entities.keys()].slice(0, 30), true, false);
      expect(view.nodes.size).toBeGreaterThan(0);
      expect(view.nodes.size).toBeLessThanOrEqual(100);
      const target = [...store.entities.values()].find(
        (e) => e.iri !== THING && !e.iri.startsWith("_:"),
      )!;
      const before = store.tbox.map(statementKey).sort();
      store.rename(target.iri, "A readable label with spaces");
      expect(store.label(target.iri)).toBe("A readable label with spaces");
      expect(store.exists(target.iri)).toBe(true);
      store.undo();
      expect(store.tbox.map(statementKey).sort()).toEqual(before);
      store.redo();
      const created = store.createClass(
        "Course Credit",
        THING,
        "A course credit.",
      );
      expect(created).toContain("CourseCredit");
      expect(store.label(created)).toBe("Course Credit");
      const document: Workspace = {
        format: "axiom-workspace",
        version: 1,
        ontology: store.ontology,
        entities: [...store.entities.values()],
        tbox: store.tbox,
        individuals: [],
        customers: [],
        graph: {
          iris: [created, target.iri],
          focus: [],
          pins: [],
          budget: 100,
          layout: "grid",
        },
        selected: created,
      };
      await mkdir("artifacts/testing/corpus", { recursive: true });
      const file = "artifacts/testing/corpus/" + source.id + ".axiom";
      await writeFile(file, JSON.stringify(document));
      const reopened = readWorkspace(JSON.parse(await readFile(file, "utf8")));
      expect(reopened.store.label(created)).toBe("Course Credit");
      expect(reopened.store.label(target.iri)).toBe(
        "A readable label with spaces",
      );
      expect(reopened.store.tbox.map(statementKey).sort()).toEqual(
        store.tbox.map(statementKey).sort(),
      );
      const exported = await writeRdf(reopened.store.tbox, "nquads");
      const roundtrip = await parseRdf(
        exported,
        "roundtrip.nq",
        source.resolvedUrl,
      );
      expect(roundtrip.triples.length).toBe(reopened.store.tbox.length);
    },
    30000,
  );
test("language tags, datatypes, named graphs and blank nodes survive workspace and JSON-LD export", async () => {
  const text =
    '@prefix x: <http://example.org/> . x:g { x:a x:label "Bonjour"@fr; x:count "2"^^<http://www.w3.org/2001/XMLSchema#integer>; x:other [ x:name "Nested" ] . }';
  const parsed = await parseRdf(text, "test.trig", "http://example.org/");
  expect(parsed.triples.some((t) => t.object.language === "fr")).toBe(true);
  expect(parsed.triples.every((t) => t.graph === "http://example.org/g")).toBe(
    true,
  );
  const output = await writeRdf(parsed.triples, "jsonld");
  const back = await parseRdf(output, "test.jsonld", "http://example.org/");
  expect(back.triples.length).toBe(parsed.triples.length);
  expect(back.triples.find((t) => t.object.language)?.object.value).toBe(
    "Bonjour",
  );
  await expect(writeRdf(parsed.triples, "turtle")).rejects.toThrow(
    "named graphs",
  );
});
test("malformed documents fail before replacement and external resources are not fetched", async () => {
  await expect(
    parseRdf(
      '<rdf:RDF xmlns:rdf="' + NS.rdf + '"><rdf:Description>',
      "bad.rdf",
      "http://example.org/",
    ),
  ).rejects.toThrow();
  await expect(
    parseRdf(
      '<!DOCTYPE rdf:RDF SYSTEM "file:///private"><rdf:RDF xmlns:rdf="' +
        NS.rdf +
        '"/>',
      "external.rdf",
      "http://example.org/",
    ),
  ).rejects.toThrow("External XML");
  await expect(
    parseRdf(
      '{"@context":"https://example.org/context","@id":"https://example.org/a","name":"Hello"}',
      "remote.jsonld",
      "http://example.org/",
    ),
  ).rejects.toThrow("Remote JSON-LD");
});
