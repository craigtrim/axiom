import { describe, expect, it } from "vitest";
import { groupStatements } from "../../src/renderer/statement-groups";
import { NS, TYPE } from "../../src/domain/model";
import { parseRdf, writeRdf } from "../../src/domain/rdf-io";
import { fromTriples } from "../fixtures/search/fixture";

describe("statement table records", () => {
  it("groups interleaved predicates without sorting, parsing or losing value metadata", () => {
    const values = [
      "Zulu",
      "PE:PE",
      "Alpha, Beta",
      "x;y|z",
      '<tag>&"',
      "日本語",
    ];
    const input = values.flatMap((text, index) => [
      {
        predicate: NS.rdfs + "seeAlso",
        value: { text, language: "en", graph: "urn:graph:" + index },
      },
      {
        predicate: NS.skos + "altLabel",
        value: { text: "Alias " + index, language: "fr", graph: "" },
      },
    ]);
    const before = structuredClone(input);
    const groups = groupStatements(input);
    expect(groups.map((g) => g.predicate)).toEqual([
      NS.rdfs + "seeAlso",
      NS.skos + "altLabel",
    ]);
    expect(groups[0].values.map((v) => v.text)).toEqual(values);
    expect(groups[0].values[3]).toEqual(before[6].value);
    expect(input).toEqual(before);
    expect(groupStatements([])).toEqual([]);
  });

  it("retains value order across a store commit, readback and RDF/XML serialization", async () => {
    const subject = "https://group.test/PhysicalEducation";
    const predicate = NS.rdfs + "seeAlso";
    const values = ["Zulu", "PE:PE", "Alpha, Beta", "A&B <C>", "Second"];
    const triples = [
      {
        subject,
        predicate: TYPE,
        object: { literal: false, value: NS.owl + "Class" },
      },
      ...values.map((value) => ({
        subject,
        predicate,
        object: { literal: true, value },
      })),
    ];
    const store = fromTriples(triples);
    store.updateEntity(subject, [
      ...triples,
      { subject, predicate, object: { literal: true, value: "Appended" } },
    ]);
    const readback = store.entityStatements(subject);
    expect(
      readback
        .filter((t) => t.predicate === predicate)
        .map((t) => t.object.value),
    ).toEqual([...values, "Appended"]);
    const xml = await writeRdf(readback, "rdfxml");
    const parsed = await parseRdf(xml, "group.rdf", "https://group.test/");
    expect(
      parsed.triples
        .filter((t) => t.predicate === predicate)
        .map((t) => t.object.value),
    ).toEqual([...values, "Appended"]);
    const typed = groupStatements([
      { predicate: TYPE, value: NS.owl + "NamedIndividual" },
      { predicate: TYPE, value: subject },
    ]);
    expect(typed).toEqual([
      { predicate: TYPE, values: [NS.owl + "NamedIndividual", subject] },
    ]);
  });
});
