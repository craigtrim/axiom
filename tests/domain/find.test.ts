import { describe, it, expect } from "vitest";
import { entity, NS } from "../../src/domain/model";
import { Store } from "../../src/domain/store";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  findEntities,
  ResourceSearchIndex,
} from "../../src/domain/resource-search";
import { readFindOptions } from "../../src/shared/find";
import { readPreferences } from "../../src/shared/preferences";
const base = "https://example.test/find#";
async function fixture() {
  return storeFromRdf(
    (
      await parseRdf(
        "@prefix : <" +
          base +
          ">. @prefix owl: <" +
          NS.owl +
          ">. @prefix rdfs: <" +
          NS.rdfs +
          ">. @prefix skos: <" +
          NS.skos +
          ">. " +
          ':A a owl:Class; rdfs:label "Café English"; skos:altLabel "Preparatory Language"; rdfs:comment "Language course". ' +
          ':English a owl:Class; rdfs:label "English". :Basic a owl:Class; rdfs:label "Basic English". ' +
          ':attends a owl:ObjectProperty; rdfs:label "English enrollment". :alice a owl:NamedIndividual, :English; rdfs:label "English learner".',
        "find.ttl",
        base,
      )
    ).triples,
    "Find test",
  );
}
describe("Find entity results", () => {
  it("ranks exact names, matches token prefixes and aliases, and separates names from IRIs", async () => {
    const store = await fixture();
    expect(findEntities(store, { text: "English" }).rows[0].iri).toBe(
      base + "English",
    );
    expect(findEntities(store, { text: "english cafe" }).rows[0].name).toBe(
      "Café English",
    );
    expect(findEntities(store, { text: "prep lang" }).rows[0].iri).toBe(
      base + "A",
    );
    expect(
      findEntities(store, {
        text: base + "Basic",
        field: "iri",
        match: "exact",
      }).rows[0].name,
    ).toBe("Basic English");
    expect(
      findEntities(store, { text: base + "Basic", field: "name" }).total,
    ).toBe(0);
    expect(
      findEntities(store, { text: "English", kind: "classes" }).total,
    ).toBe(3);
    expect(
      findEntities(store, { text: "English", kind: "individuals" }).rows.map(
        (r) => r.iri,
      ),
    ).toEqual([base + "alice"]);
    expect(
      findEntities(store, { text: "English", kind: "properties" }).rows.map(
        (r) => r.iri,
      ),
    ).toEqual([base + "attends"]);
    expect(
      findEntities(store, { text: "asic eng", match: "phrase", field: "name" })
        .rows[0].iri,
    ).toBe(base + "Basic");
    expect(
      findEntities(store, { text: "English", match: "exact", field: "name" })
        .total,
    ).toBe(1);
    expect(findEntities(store, { text: "zzzzz" }).total).toBe(0);
  });
  it("pages all results beyond suggestion limits, with stable ordering and bounded offsets", () => {
    const store = new Store();
    store.entities.clear();
    for (let i = 0; i < 15025; i++) {
      const iri = base + "Node" + i;
      store.entities.set(iri, {
        ...entity(iri, "Class"),
        label: "Course " + String(i).padStart(5, "0"),
      });
    }
    const index = new ResourceSearchIndex(store);
    const first = index.find({ text: "Course", limit: 100, sort: "name" });
    expect(first.total).toBe(15025);
    expect(first.rows).toHaveLength(100);
    expect(first.rows[0].name).toBe("Course 00000");
    const last = index.find({
      text: "Course",
      limit: 100,
      offset: 999999,
      sort: "name",
    });
    expect(last.offset).toBe(15000);
    expect(last.rows).toHaveLength(25);
    expect(last.rows.at(-1)?.name).toBe("Course 15024");
    expect(index.find({ text: "Course", sort: "name-desc" }).rows[0].name).toBe(
      "Course 15024",
    );
    expect(
      index
        .find({ text: "Course", offset: 100, limit: 100, sort: "name" })
        .rows.some((r) => first.rows.some((f) => f.iri === r.iri)),
    ).toBe(false);
  });
  it("rebuilds cached results after edits and undo", async () => {
    const store = await fixture();
    expect(findEntities(store, { text: "English" }).total).toBe(5);
    store.updateEntity(
      base + "Basic",
      store
        .entityStatements(base + "Basic")
        .map((t) =>
          t.predicate === NS.rdfs + "label"
            ? { ...t, object: { literal: true, value: "Revised language" } }
            : t,
        ),
    );
    expect(
      findEntities(store, { text: "revised", field: "name" }).rows[0].iri,
    ).toBe(base + "Basic");
    expect(findEntities(store, { text: "English", field: "name" }).total).toBe(
      4,
    );
    store.undo();
    expect(findEntities(store, { text: "revised", field: "name" }).total).toBe(
      0,
    );
    expect(findEntities(store, { text: "English", field: "name" }).total).toBe(
      5,
    );
  });
  it("validates options and restores filters without arbitrary settings", () => {
    const options = readFindOptions({
      text: "x".repeat(1000),
      kind: "injected",
      limit: 900,
      offset: -4,
    });
    expect(options.text).toHaveLength(256);
    expect(options.kind).toBe("all");
    expect(options.limit).toBe(100);
    expect(options.offset).toBe(0);
    const p = readPreferences({
      version: 1,
      panelState: {
        "find.view": { text: "English", kind: "classes", sort: "name-desc" },
        "find.recent": ["English", {}, "Basic"],
      },
    });
    expect(p.panelState?.["find.view"]).toMatchObject({
      text: "English",
      kind: "classes",
      sort: "name-desc",
    });
    expect(p.panelState?.["find.recent"]).toEqual(["English", "Basic"]);
  });
});
