import { describe, it, expect } from "vitest";
import { parseRdf, storeFromRdf, writeRdf } from "../../src/domain/rdf-io";
import {
  entitySource,
  applyEntitySource,
} from "../../src/domain/entity-source";
import { NS } from "../../src/domain/model";
import { sourceFormats } from "../../src/shared/source";
const base = "https://example.test/";
const ttl = `@prefix : <${base}> . @prefix owl: <${NS.owl}> . @prefix rdfs: <${NS.rdfs}> .
:A a owl:Class; rdfs:label "Alpha"@en; owl:equivalentClass [ a owl:Class; owl:intersectionOf (:B :C) ] .
:B a owl:Class; rdfs:label "Beta" . :C a owl:Class . :Other a owl:Class; rdfs:label "Unrelated" .`;
const make = async () =>
  storeFromRdf((await parseRdf(ttl, "source.ttl", base)).triples, "Source");
describe("entity source snippets", () => {
  it.each(sourceFormats)(
    "edits $id snippets without changing unrelated entities or blank-node references",
    async ({ id }) => {
      const store = await make();
      store.ontology.source = {
        fileName: "ontology",
        format: id,
        baseIRI: base,
        importedAt: "test",
      };
      const original = structuredClone(store.tbox);
      const doc = await entitySource(store, 3, base + "A");
      expect(doc.format).toBe(id);
      expect(doc.original.some((t) => t.subject === base + "Other")).toBe(
        false,
      );
      await applyEntitySource(store, 3, {
        ...doc,
        text: doc.text.replace("Alpha", "Updated"),
      });
      expect(store.resolve(base + "A")?.label).toBe("Updated");
      const expression = store.resolve(base + "A")?.classExpressions?.[0].iri;
      expect(store.resolve(expression!)?.intersection?.members).toEqual([
        base + "B",
        base + "C",
      ]);
      if (!["turtle", "trig"].includes(id))
        expect(expression).toBe(
          doc.original.find((t) => t.predicate === NS.owl + "equivalentClass")!
            .object.value,
        );
      expect(store.tbox.filter((t) => t.subject === base + "Other")).toEqual(
        original.filter((t) => t.subject === base + "Other"),
      );
      store.undo();
      expect(store.tbox).toEqual(original);
    },
  );
  it("rejects invalid source, unrelated named subjects and conflicting edits atomically", async () => {
    const store = await make();
    const doc = await entitySource(store, 2, base + "A");
    const before = JSON.stringify(store.tbox);
    await expect(
      applyEntitySource(store, 2, { ...doc, text: "not rdf" }),
    ).rejects.toThrow();
    await expect(
      applyEntitySource(store, 2, {
        ...doc,
        text: doc.text + `\n<${base}Other> <${NS.rdfs}label> "Oops" .`,
      }),
    ).rejects.toThrow("one entity");
    expect(JSON.stringify(store.tbox)).toBe(before);
    store.updateEntity(
      base + "A",
      store
        .entityStatements(base + "A")
        .map((t) =>
          t.predicate === NS.rdfs + "label"
            ? { ...t, object: { ...t.object, value: "Elsewhere" } }
            : t,
        ),
    );
    await expect(
      applyEntitySource(store, 2, {
        ...doc,
        text: doc.text.replace("Alpha", "Stale"),
      }),
    ).rejects.toThrow("changed");
    expect(store.resolve(base + "A")?.label).toBe("Elsewhere");
  });
  it("allows unrelated changes and source renames while retaining inbound references", async () => {
    const store = await make();
    const doc = await entitySource(store, 2, base + "B");
    store.updateEntity(
      base + "Other",
      store
        .entityStatements(base + "Other")
        .map((t) =>
          t.predicate === NS.rdfs + "label"
            ? { ...t, object: { ...t.object, value: "Other edit" } }
            : t,
        ),
    );
    const next = await applyEntitySource(store, 2, {
      ...doc,
      text: doc.text.replaceAll(":B", ":Renamed"),
    });
    expect(next).toBe(base + "Renamed");
    expect(
      store.tbox.some(
        (t) => !t.object.literal && t.object.value === base + "Renamed",
      ),
    ).toBe(true);
    expect(store.resolve(base + "Other")?.label).toBe("Other edit");
  });
  it("retains a shared anonymous expression when this entity removes its reference", async () => {
    const store = await make();
    const expression = store
      .entityStatements(base + "A")
      .find((t) => t.predicate === NS.owl + "equivalentClass")!.object.value;
    store.updateEntity(base + "Other", [
      ...store.entityStatements(base + "Other"),
      {
        subject: base + "Other",
        predicate: NS.owl + "equivalentClass",
        object: { literal: false, value: expression },
      },
    ]);
    const doc = await entitySource(store, 2, base + "A");
    const text = await writeRdf(
      doc.original.filter(
        (t) =>
          t.subject === base + "A" && t.predicate !== NS.owl + "equivalentClass",
      ),
      "turtle",
    );
    await applyEntitySource(store, 2, { ...doc, text });
    expect(store.resolve(base + "A")?.classExpressions ?? []).toHaveLength(0);
    expect(store.resolve(base + "Other")?.classExpressions).toHaveLength(1);
    expect([...store.scan(expression)].length).toBeGreaterThan(0);
  });
});
