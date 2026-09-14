import { describe, it, expect } from "vitest";
import {
  parseRdf as parseInput,
  storeFromRdf,
  writeRdf,
} from "../../src/domain/rdf-io";
import { NS, TYPE, equivalent } from "../../src/domain/model";
import {
  evidenceTriples,
  ntriples,
  PROV,
  FS,
} from "../../src/domain/provenance";
import { reportDocument } from "../../src/main/report";
import { defaultExportOptions, type ReportData } from "../../src/shared/export";
import { executeQuery } from "../../src/domain/query";
const parseRdf = async (text: string, extension: string) =>
  (await parseInput(text, "fixture." + extension, "https://example.org/"))
    .triples;
const input =
  '@prefix ex:<https://example.org/>. @prefix owl:<http://www.w3.org/2002/07/owl#>. @prefix rdfs:<http://www.w3.org/2000/01/rdf-schema#>. ex:g { ex:Course a owl:Class; rdfs:label "Credit"@en, "Crédit"@fr. ex:student a ex:Course. }';
describe("RDF authoring and evidence preservation", () => {
  it("renames the preferred label in its named graph without losing other languages", async () => {
    const s = storeFromRdf(await parseRdf(input, "trig"), "Labels");
    s.rename("https://example.org/Course", "Course Credit");
    const labels = s.tbox.filter((t) => t.predicate === NS.rdfs + "label");
    expect(labels).toHaveLength(2);
    expect(labels.find((t) => t.object.language === "en")).toMatchObject({
      graph: "https://example.org/g",
      object: { value: "Course Credit" },
    });
    expect(labels.find((t) => t.object.language === "fr")?.object.value).toBe(
      "Crédit",
    );
    s.undo();
    expect(s.entities.get("https://example.org/Course")?.label).toBe("Credit");
  });
  it("IRI changes update incoming assertions and projected instance types, with undo", async () => {
    const s = storeFromRdf(await parseRdf(input, "trig"), "IRI");
    s.updateEntity(
      "https://example.org/Course",
      s.entityStatements("https://example.org/Course"),
      "https://example.org/Credit",
    );
    expect(s.entities.has("https://example.org/Course")).toBe(false);
    expect(s.entities.get("https://example.org/student")?.types).toContain(
      "https://example.org/Credit",
    );
    expect(
      s.tbox.find((t) => t.subject === "https://example.org/student")?.object
        .value,
    ).toBe("https://example.org/Credit");
    s.undo();
    expect(s.entities.has("https://example.org/Course")).toBe(true);
    expect(s.entities.get("https://example.org/student")?.types).toContain(
      "https://example.org/Course",
    );
  });
  it("does not synthesize RDF labels when opening imported entity details", async () => {
    const s = storeFromRdf(
      await parseRdf(
        "<https://example.org/C> a <http://www.w3.org/2002/07/owl#Class>.",
        "ttl",
      ),
      "Unlabelled",
    );
    expect(s.entityStatements("https://example.org/C")).toHaveLength(1);
  });
  it("literal identity preserves datatype and language distinctions", () => {
    expect(
      equivalent(
        { value: "1", literal: true, datatype: "integer" },
        { value: "1", literal: true, datatype: NS.xsd + "integer" },
      ),
    ).toBe(true);
    expect(
      equivalent(
        { value: "same", literal: true, language: "en" },
        { value: "same", literal: true, language: "fr" },
      ),
    ).toBe(false);
    expect(
      equivalent(
        { value: "1", literal: true, datatype: "integer" },
        { value: "1", literal: true },
      ),
    ).toBe(false);
  });
  it("retains raw evidence and never turns ownership into historical attribution", async () => {
    const evidence = {
      path: "D:\\files\\book.txt",
      parent: "D:\\files",
      observedAt: "2026-09-13T12:00:00.000Z",
      directory: false,
      reparse: false,
      metadata: {
        owner: "EXAMPLE\\bob",
        author: "A recorded author",
        text: 'A backslash: \\b; new line:\n; tab:\t; quote: "',
      },
      issues: ["Audit ACL unavailable"],
    };
    const triples = evidenceTriples(evidence, "test"),
      serialized = ntriples(triples),
      roundtrip = await parseRdf(serialized, "nt");
    expect(roundtrip).toHaveLength(triples.length);
    expect(
      roundtrip.some((t) => t.object.value === evidence.metadata.text),
    ).toBe(true);
    expect(triples.some((t) => t.predicate === PROV + "wasAttributedTo")).toBe(
      false,
    );
    expect(
      triples.filter((t) => t.predicate === PROV + "wasGeneratedBy"),
    ).toHaveLength(1);
    expect(
      triples.filter((t) => t.predicate === PROV + "generatedAtTime")[0]
        .subject,
    ).toContain(":observation:");
    expect(triples.some((t) => t.predicate === FS + "coverageIssue")).toBe(
      true,
    );
  });
  it("reports preserve values, language and named graphs in every structured format", async () => {
    const s = storeFromRdf(await parseRdf(input, "trig"), "Reports");
    const data = {
      ontology: s.ontology,
      entities: [...s.entities.values()],
      triples: s.tbox,
      graph: { nodes: [], edges: [] },
      generatedAt: "2026-09-13T00:00:00Z",
      datasetEpoch: 1,
      version: 1,
    } as unknown as ReportData;
    for (const format of ["html", "md", "csv", "json"]) {
      const text = reportDocument(data, {
        ...defaultExportOptions,
        content: "report",
        format,
        includeGraph: false,
        title: "Course *Credit*",
      });
      expect(text).toContain("https://example.org/g");
      expect(text).toContain("Crédit");
      expect(text).not.toContain("FILES");
      if (format === "json")
        expect(JSON.parse(text).statements).toHaveLength(s.tbox.length);
    }
  });
});
