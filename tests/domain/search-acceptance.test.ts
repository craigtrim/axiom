import { beforeAll, expect, it } from "vitest";
import { EntitySearchIndex } from "../../src/domain/entity-search";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { NS } from "../../src/domain/model";
const base = "https://example.test/courses#";
let index: EntitySearchIndex;
beforeAll(async () => {
  const rdf = await parseRdf(
    `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdfs: <${NS.rdfs}>.
    :Reading_Comprehension a owl:Class; rdfs:label "Reading Comprehension".
    :German a owl:Class; rdfs:label "German Reading Comprehension".
    :Theory a owl:Class; rdfs:label "Theory of Computation".
    :Arts a owl:Class; rdfs:label "Arts and Crafts".
    :Phlebotomy a owl:Class; rdfs:label "Blood Collection"; rdfs:seeAlso "phlebotomy".
    :Course122 a owl:Class; rdfs:label "English Course 122".
    :OtherEnglish a owl:Class; rdfs:label "English Course 123".
    :ReadingComp a owl:Class; rdfs:label "Literacy".`,
    "courses.ttl",
    base,
  );
  index = new EntitySearchIndex(storeFromRdf(rdf.triples, "Courses"));
});
it.each([
  ["reading and comp", "Reading_Comprehension"],
  ["reading comp", "Reading_Comprehension"],
  ["reading comprehension", "Reading_Comprehension"],
  ["comp reading", "Reading_Comprehension"],
  ["reding comp", "Reading_Comprehension"],
  ["theory of comp", "Theory"],
  ["and", "Arts"],
  ["reading comprehension skills", "Reading_Comprehension"],
  ["phleb", "Phlebotomy"],
  ["english course 122", "Course122"],
])("ranks %s consistently in Find and resource inputs", (text, expected) => {
  expect(index.find({ text }).rows[0].iri).toBe(base + expected);
  expect(index.search(text, true)[0].iri).toBe(base + expected);
});
it("tokenizes both underscore and camel-case local IRIs", () => {
  const rows = index.find({ text: "reading comp", fields: ["iri"] }).rows;
  expect(rows.map((r) => r.iri)).toEqual(
    expect.arrayContaining([
      base + "Reading_Comprehension",
      base + "ReadingComp",
    ]),
  );
});
it("does not invent matches for nonsense without eligible semantic evidence", () => {
  expect(index.find({ text: "zzqx" }).total).toBe(0);
  expect(index.search("zzqx")).toEqual([]);
});
it("never displaces exact and preferred-prefix labels with semantic scores", () => {
  const scores = new Map([
    ["German Reading Comprehension", 1],
    ["Literacy", 0.9],
  ]);
  expect(
    index.find({ text: "reading comprehension" }, scores).rows[0].name,
  ).toBe("Reading Comprehension");
  expect(index.find({ text: "reading comp" }, scores).rows[0].name).toBe(
    "Reading Comprehension",
  );
});
