import { describe, expect, it } from "vitest";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { findEntities } from "../../src/domain/resource-search";
import { NS } from "../../src/domain/model";
import {
  addFindSynonym,
  findSynonymStatus,
} from "../../src/domain/find-synonyms";
import { findSynonymText } from "../../src/shared/find-synonyms";
const iri = "https://example.org/courses#Developmental_Psychology";
const predicate = NS.rdfs + "seeAlso";
async function fixture() {
  return storeFromRdf(
    (
      await parseRdf(
        `
    <${iri}> a <${NS.owl}Class>; <${NS.rdfs}label> "Developmental Psychology";
      <${predicate}> "Developmental Psyc", <https://example.org/related>;
      <${NS.rdfs}comment> "A course in human development.".
  `,
        "courses.ttl",
        iri,
      )
    ).triples,
    "Courses",
  );
}

describe("synonyms from Find", () => {
  it("adds the trimmed query as a seeAlso literal, refreshes Find and supports one Undo and Redo", async () => {
    const store = await fixture(),
      before = structuredClone(store.tbox),
      history = store.undoStack.length;
    const query = { text: "Developmental Psycho" };
    expect(findEntities(store, query).rows[0].synonym).toBe("available");
    expect(addFindSynonym(store, iri, "  Developmental Psycho  ")).toEqual({
      added: true,
      value: query.text,
    });
    expect(store.tbox).toEqual([
      ...before,
      { subject: iri, predicate, object: { literal: true, value: query.text } },
    ]);
    expect(store.undoStack).toHaveLength(history + 1);
    expect(findEntities(store, query).rows[0].synonym).toBe("exists");
    store.undo();
    expect(store.tbox).toEqual(before);
    expect(findEntities(store, query).rows[0].synonym).toBe("available");
    store.redo();
    expect(findSynonymStatus(store, iri, query.text)).toBe("exists");
  });
  it.each(["DEVELOPMENTAL PSYCHOLOGY", "developmental psyc"])(
    "does not duplicate the existing name or synonym %s",
    async (text) => {
      const store = await fixture(),
        before = structuredClone(store.tbox),
        version = store.version;
      expect(addFindSynonym(store, iri, text).added).toBe(false);
      expect(store.tbox).toEqual(before);
      expect(store.version).toBe(version);
      expect(store.undoStack).toHaveLength(0);
    },
  );
  it("rechecks current RDF when an already displayed result is clicked twice", async () => {
    const store = await fixture();
    expect(addFindSynonym(store, iri, "Developmental Psycho").added).toBe(true);
    const version = store.version;
    expect(addFindSynonym(store, iri, "developmental psycho").added).toBe(
      false,
    );
    expect(store.version).toBe(version);
    expect(store.undoStack).toHaveLength(1);
  });
  it.each([
    "",
    "  ",
    "label:Developmental",
    'rdfs:label:"Developmental Psycho"',
    "/Developmental.*/i",
    "^Developmental.*$",
    "Developmental [Pp]sycho",
    "https://example.org/term",
    "x".repeat(257),
  ])("rejects non-plain queries without writing: %s", async (text) => {
    const store = await fixture(),
      before = structuredClone(store.tbox);
    expect(findSynonymText(text)).toBeUndefined();
    expect(() => addFindSynonym(store, iri, text)).toThrow("plain text");
    expect(store.tbox).toEqual(before);
  });
  it.each([
    "C++",
    "I/O",
    "R&D",
    "U.S. History",
    "History (to 1877)",
    "Children's Literature",
  ])("keeps ordinary punctuation in %s", (text) => {
    expect(findSynonymText(text)).toBe(text);
  });
  it("does not offer edits for vanished or anonymous entries", async () => {
    const store = await fixture();
    expect(
      findSynonymStatus(store, "urn:missing", "Developmental Psycho"),
    ).toBeUndefined();
    expect(() =>
      addFindSynonym(store, "urn:missing", "Developmental Psycho"),
    ).toThrow("no longer available");
    expect(
      findSynonymStatus(store, "_:anonymous", "Developmental Psycho"),
    ).toBeUndefined();
  });
});
