import { describe, expect, it } from "vitest";
import { NS, THING } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { qualityInput, scanQuality } from "../../src/domain/ontology-quality";
import { QualityJobs } from "../../src/domain/quality-jobs";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
import { mutatocExecutable } from "../../src/main/mutatoc-client";
import {
  defaultQualityOptions,
  qualityExport,
  qualityRules,
  qualitySuppression,
  readQualityOptions,
  type QualityOptions,
  type QualityReport,
  type QualityStatus,
} from "../../src/shared/ontology-quality";
import { readPreferences } from "../../src/shared/preferences";
const base = "https://quality.test/#";
const prefix = `@prefix : <${base}>. @prefix owl: <${NS.owl}>. @prefix rdf: <${NS.rdf}>. @prefix rdfs: <${NS.rdfs}>. @prefix skos: <${NS.skos}>. @prefix xsd: <${NS.xsd}>. @prefix dct: <${NS.dcterms}>. `;
const fixture = async (body: string, format = "fixture.ttl") =>
  storeFromRdf(
    (await parseRdf(prefix + body, format, base)).triples,
    "Quality fixture",
  );
const enabled = (): QualityOptions => ({
  ...defaultQualityOptions(),
  rules: Object.fromEntries(qualityRules.map((r) => [r.id, r.severity])),
});
const scan = (
  store: Awaited<ReturnType<typeof fixture>>,
  options: Partial<QualityOptions> = {},
) => {
  const iterator = scanQuality(qualityInput(store, 7), {
    ...defaultQualityOptions(),
    ...options,
  });
  for (;;) {
    const next = iterator.next();
    if (next.done) return next.value;
  }
};
const findings = (r: QualityReport, rule: string, iri = base + "A") =>
  r.findings.filter((f) => f.rule === rule && f.iri === iri);
const finish = async (jobs: QualityJobs, id: number) => {
  for (let i = 0; i < 500; i++) {
    const j = jobs.status(id);
    if (j.state !== "running") return j;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw Error("Scan did not finish");
};

it("reports Industrial Safety from asserted statements without mistaking its display fallback for a label", async () => {
  const s = await fixture(
    ":Industrial_Safety a owl:Class; rdfs:subClassOf :Shop_Class. :Shop_Class a owl:Class; rdfs:label 'Shop Class'.",
  );
  const before = JSON.stringify([...s.scan()]),
    version = s.version;
  const r = scan(s),
    iri = base + "Industrial_Safety";
  expect(findings(r, "label.missing", iri)[0].label).toBe("Industrial Safety");
  expect(findings(r, "analysis.excluded", iri)).toHaveLength(1);
  expect(JSON.stringify([...s.scan()])).toBe(before);
  expect(s.version).toBe(version);
  expect(s.undoStack).toHaveLength(0);
});

const cases: [string, string, string?][] = [
  ["label.missing", ":A a owl:Class."],
  ["label.empty", ":A a owl:Class; rdfs:label '  '."],
  ["label.whitespace", ":A a owl:Class; rdfs:label ' name '."],
  ["label.placeholder", ":A a owl:Class; rdfs:label 'New Class'."],
  [
    "label.duplicate",
    ":A a owl:Class; rdfs:label 'same'@en. :B a owl:Class; rdfs:label 'Same'@EN.",
  ],
  ["label.multiple", ":A a owl:Class; rdfs:label 'one'@en, 'two'@en."],
  ["label.language", ":A a owl:Class; rdfs:label 'one'@en."],
  [
    "label.style",
    ":A a owl:Class; rdfs:label 'one_two'. :B a owl:Class; rdfs:label 'normal words'.",
  ],
  ["skos.multiple", ":A a owl:Class; skos:prefLabel 'one'@en, 'two'@en."],
  [
    "skos.disjoint",
    ":A a owl:Class; skos:prefLabel 'one'@en; skos:altLabel 'one'@en.",
  ],
  ["skos.literal", ":A a owl:Class; skos:altLabel :Name."],
  ["description.missing", ":A a owl:Class; rdfs:comment ' '."],
  [
    "definition.missing",
    ":A a owl:Class; rdfs:comment 'A comment alone is not a dedicated definition'.",
  ],
  [
    "description.repeated",
    ":A a owl:Class; rdfs:label 'Name'; rdfs:comment 'name'.",
  ],
  [
    "definition.duplicate",
    ":A a owl:Class; skos:definition 'Shared'. :B a owl:Class; skos:definition 'Shared'.",
  ],
  ["documentation.missing", ":A a owl:Class."],
  ["alias.missing", ":A a owl:Class."],
  ["alias.empty", ":A a owl:Class; skos:altLabel ' '."],
  ["alias.primary", ":A a owl:Class; rdfs:label 'Name'; skos:altLabel 'name'."],
  [
    "alias.shared",
    ":A a owl:Class; skos:altLabel 'name'. :B a owl:Class; rdfs:label 'Name'.",
  ],
  ["alias.legacy", ":A a owl:Class; rdfs:seeAlso 'legacy alias'."],
  ["structure.isolated", ":A a owl:Class."],
  [
    "structure.component",
    ":A a owl:Class. :B a owl:Class. :C a owl:Class; rdfs:subClassOf :B.",
  ],
  ["structure.parent", ":A a owl:Class."],
  [
    "structure.cycle",
    ":A a owl:Class; rdfs:subClassOf :B. :B a owl:Class; rdfs:subClassOf :A.",
  ],
  ["structure.declaration", ":A rdfs:subClassOf :B."],
  ["structure.type", ":A a owl:NamedIndividual."],
  [
    "structure.unresolved",
    ":A a owl:Class; rdfs:subClassOf <https://external.test/Unknown>.",
  ],
  ["property.domain", ":A a owl:ObjectProperty."],
  ["property.range", ":A a owl:DatatypeProperty."],
  ["property.multiple", ":A a owl:ObjectProperty; rdfs:domain :B, :C."],
  ["deprecated.boolean", ":A a owl:Class; owl:deprecated 'true'."],
  [
    "deprecated.reference",
    ":A a owl:Class; rdfs:subClassOf :B. :B a owl:Class; owl:deprecated true.",
  ],
  ["deprecated.guidance", ":A a owl:Class; owl:deprecated true."],
  ["metadata.missing", ":A a owl:Ontology; rdfs:label 'Vocabulary'."],
  ["analysis.excluded", ":A a owl:Class; skos:prefLabel 'SKOS label'."],
];
describe("check catalog", () => {
  it.each(cases)(
    "%s has evidence and actionable policy",
    async (rule, body) => {
      const report = scan(await fixture(body), {
        ...enabled(),
        languages: ["en", "es"],
      });
      const f = findings(report, rule)[0];
      expect(f, JSON.stringify(report.findings)).toBeDefined();
      expect(f.suggestion.length).toBeGreaterThan(10);
      expect(f.basis).toBeTruthy();
      expect(
        report.coverage.find((c) => c.rule === rule)?.affected,
      ).toBeGreaterThan(0);
    },
  );
});

// Cross-product of kinds, identifier forms, languages, and named graphs exercises
// RDF identity independently from display names and serialization boundaries.
for (const kind of [
  "owl:Class",
  "owl:ObjectProperty",
  "owl:DatatypeProperty",
  "owl:AnnotationProperty",
  "owl:NamedIndividual",
]) {
  for (const iri of [
    base + "Safe_Name",
    "https://quality.test/SlashCode",
    "urn:quality:OpaqueCode",
  ]) {
    for (const language of ["", "@en", "@es", "@en-US"]) {
      for (const graph of [false, true]) {
        it(`explicit names: ${kind} ${iri} ${language || "untagged"} ${graph ? "named graph" : "default graph"}`, async () => {
          const body = `<${iri}> a ${kind}; rdfs:label "A distinct human label"${language}; rdfs:comment "A useful description"${language}.`;
          const s = await fixture(
            graph ? `:Graph { ${body} }` : body,
            graph ? "fixture.trig" : "fixture.ttl",
          );
          const r = scan(s);
          expect(findings(r, "label.missing", iri)).toEqual([]);
          expect(findings(r, "description.missing", iri)).toEqual([]);
          expect(findings(r, "analysis.excluded", iri)).toEqual([]);
          expect(r.scanned).toBe(1);
        });
      }
    }
  }
}

it.each(["rdfs:seeAlso", "skos:altLabel", ":inflection"])(
  "%s without a label is analysis-eligible but still incomplete",
  async (predicate) => {
    const r = scan(
      await fixture(`:A a owl:Class; ${predicate} 'Another name'.`),
    );
    expect(findings(r, "label.missing")).toHaveLength(1);
    expect(findings(r, "analysis.excluded")).toHaveLength(0);
  },
);
it("does not confuse arbitrary label local names with accepted predicate IRIs", async () => {
  const r = scan(
    await fixture(":A a owl:Class; <https://other.test/label> 'A'."),
  );
  expect(findings(r, "label.missing")).toHaveLength(1);
});
it.each([
  "rdfs:comment",
  "skos:definition",
  "dct:description",
  "<http://purl.obolibrary.org/obo/IAO_0000115>",
])("recognizes descriptive predicate %s", async (p) => {
  expect(
    findings(
      scan(await fixture(`:A a owl:Class; ${p} 'A description'.`)),
      "description.missing",
    ),
  ).toHaveLength(0);
});
it("supports configured predicates without requiring redundant labels", async () => {
  const s = await fixture(":A a owl:Class; :name 'A'; :meaning 'Description'.");
  const r = scan(s, {
    labelPredicates: [base + "name"],
    descriptionPredicates: [base + "meaning"],
  });
  expect(findings(r, "label.missing")).toHaveLength(0);
  expect(findings(r, "description.missing")).toHaveLength(0);
});
it("allows multilingual preferred labels and disjoint exact terms that only resemble each other", async () => {
  const r = scan(
    await fixture(
      ":A a owl:Class; skos:prefLabel 'Name'@en, 'Nombre'@es; skos:altLabel 'name'@en, 'Name'@es.",
    ),
  );
  expect(findings(r, "skos.multiple")).toHaveLength(0);
  expect(findings(r, "skos.disjoint")).toHaveLength(0);
});
it("does not count duplicate graph assertions as multiple preferred labels", async () => {
  const s = await fixture(
    ":G1 { :A a owl:Class; skos:prefLabel 'A'. } :G2 { :A skos:prefLabel 'A'^^xsd:string. }",
    "fixture.trig",
  );
  expect(findings(scan(s), "skos.multiple")).toHaveLength(0);
});
it("keeps non-SKOS cardinality as a review warning", async () => {
  const r = scan(await fixture(":A a owl:Class; rdfs:label 'A', 'Other'."));
  expect(findings(r, "label.multiple")[0].severity).toBe("Warning");
  expect(findings(r, "skos.multiple")).toHaveLength(0);
});
it("does not flag resource-valued seeAlso as a legacy text alias", async () => {
  const r = scan(
    await fixture(":A a owl:Class; rdfs:seeAlso <https://example.org/info>."),
  );
  expect(findings(r, "alias.legacy")).toHaveLength(0);
});
it("respects local definitions across named graphs and does not demand labels on reference-only imports", async () => {
  const r = scan(
    await fixture(
      ":G1 { :O a owl:Ontology; owl:imports <https://external.test/vocab>. :A a owl:Class; rdfs:subClassOf <https://external.test/B>, <https://external.test/C>. } :G2 { <https://external.test/B> a owl:Class; rdfs:label 'B'. }",
      "fixture.trig",
    ),
  );
  const unresolved = findings(r, "structure.unresolved")[0];
  expect(unresolved.related).toEqual(["https://external.test/C"]);
  expect(r.findings.some((f) => f.iri === "https://external.test/C")).toBe(
    false,
  );
  expect(r.imports).toEqual(["https://external.test/vocab"]);
  expect(r.scanned).toBe(2);
});
it("scope, branch descendants, namespace boundaries, and kind filters have accurate denominators", async () => {
  const s = await fixture(
    ":Root a owl:Class. :A a owl:Class; rdfs:subClassOf :Root. :B a owl:Class; rdfs:subClassOf :A. :Else a owl:Class. <https://outside.test/#A> a owl:Class. :p a owl:AnnotationProperty.",
  );
  expect(scan(s, { scope: "branch", root: base + "A" }).scanned).toBe(2);
  expect(scan(s, { scope: "namespace", namespace: base }).scanned).toBe(5);
  expect(scan(s, { kinds: ["AnnotationProperty"] }).scanned).toBe(1);
  expect(scan(s, { scope: "branch", root: THING }).scanned).toBe(5);
  expect(() => scan(s, { scope: "branch", root: base + "Missing" })).toThrow(
    "branch root",
  );
  expect(() => scan(s, { scope: "namespace", namespace: "" })).toThrow(
    "namespace",
  );
});
it("excludes anonymous restrictions, built-ins, and the ontology record from entity denominators", async () => {
  const r = scan(
    await fixture(
      ":O a owl:Ontology. owl:Thing rdfs:label 'Thing'. :A a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom owl:Thing]. :p a owl:ObjectProperty.",
    ),
  );
  expect(r.scanned).toBe(2);
  expect(r.findings.some((f) => f.iri.startsWith("_:"))).toBe(false);
});
it("keeps optional enrichment, root-parent rules and publication metadata off by default", async () => {
  const r = scan(await fixture(":A a owl:Class."));
  for (const id of [
    "alias.missing",
    "structure.parent",
    "metadata.missing",
    "definition.missing",
    "documentation.missing",
  ]) {
    expect(r.findings.some((f) => f.rule === id)).toBe(false);
    expect(r.coverage.find((c) => c.rule === id)?.checked).toBe(false);
  }
});
it("annotation properties do not require a domain or range; individual types may be multiple", async () => {
  const r = scan(
    await fixture(
      ":A a owl:AnnotationProperty. :i a owl:NamedIndividual, :X, :Y. :X a owl:Class. :Y a owl:Class.",
    ),
  );
  expect(findings(r, "property.domain")).toHaveLength(0);
  expect(findings(r, "property.range")).toHaveLength(0);
  expect(findings(r, "structure.type", base + "i")).toHaveLength(0);
});
it("retirement guidance and references to deprecated predicates are covered", async () => {
  const r = scan(
    await fixture(
      ":A a owl:Class; :old :B. :old a owl:ObjectProperty; owl:deprecated true; dct:isReplacedBy :new. :new a owl:ObjectProperty.",
    ),
  );
  expect(findings(r, "deprecated.reference")).toHaveLength(1);
  expect(findings(r, "deprecated.guidance", base + "old")).toHaveLength(0);
});
it("findings retain named graph evidence and exact identity across equal local names", async () => {
  const r = scan(
    await fixture(
      ":G { :A a owl:Class; rdfs:label ' a '. <https://other.test/#A> a owl:Class; rdfs:label 'Other'. }",
      "fixture.trig",
    ),
  );
  expect(findings(r, "label.whitespace")[0].evidence[0].graph).toBe(base + "G");
  expect(new Set(r.findings.map((f) => f.iri))).toEqual(
    new Set([base + "A", "https://other.test/#A"]),
  );
});
it("profiles and explicit severity overrides name the project policy", async () => {
  const s = await fixture(
    ":A a owl:Class; rdfs:comment 'General description'.",
  );
  const r = scan(s, defaultQualityOptions("OBO-inspired"));
  expect(findings(r, "definition.missing")[0]).toMatchObject({
    severity: "Violation",
    basis: "OBO-inspired selected project constraint",
  });
  const off = scan(s, { groups: ["Naming"] });
  expect(off.findings.every((f) => f.group === "Naming")).toBe(true);
});
it("exceptions survive the same findings but not changes in evidence, identity or policy", async () => {
  const s = await fixture(":A a owl:Class; rdfs:label ' name '.");
  const r = scan(s),
    f = findings(r, "label.whitespace")[0];
  const ex = [
    {
      ontology: r.ontology,
      iri: f.iri,
      rule: f.rule,
      signature: f.signature,
      reason: "Intentional",
    },
  ];
  expect(qualitySuppression(scan(s), f, ex)?.reason).toBe("Intentional");
  expect(
    qualitySuppression({ ...r, ontology: "other" }, f, ex),
  ).toBeUndefined();
  const r2 = scan(await fixture(":A a owl:Class; rdfs:label ' changed '."));
  expect(
    qualitySuppression(r2, findings(r2, "label.whitespace")[0], ex),
  ).toBeUndefined();
  expect(qualitySuppression(r, { ...f, iri: base + "B" }, ex)).toBeUndefined();
  const p = readPreferences({
    version: 1,
    theme: "light",
    panelState: { "quality.exceptions": ex, "quality.options": r.options },
  });
  expect(p.panelState!["quality.exceptions"]).toEqual(ex);
});
it("exports every finding and revision/configuration including suppressed findings, with CSV escaping", async () => {
  const r = scan(
    await fixture(
      Array.from({ length: 137 }, (_, i) => `:A${i} a owl:Class.`).join(" "),
    ),
  );
  const data = JSON.parse(qualityExport(r, [], "json"));
  expect(data.findings.length).toBe(r.findings.length);
  expect(data.scanned).toBe(137);
  expect(data.version).toBe(r.version);
  expect(r.findings.filter((f) => f.rule === "label.missing")).toHaveLength(
    137,
  );
  const csv = qualityExport(
    { ...r, name: 'quotes " and\nnewlines' },
    [],
    "csv",
  );
  expect(csv).toContain('"scanConfiguration"');
  expect(csv).toContain(base + "A136");
  const zero = { ...r, findings: [] };
  expect(qualityExport(zero, [], "csv").split("\r\n")).toHaveLength(2);
});

describe("scan jobs and reviewed repairs", () => {
  async function prepared(
    body = ":NewClass a owl:Class. :B a owl:Class; skos:altLabel 'alias'.",
  ) {
    const store = await fixture(body),
      jobs = new QualityJobs();
    const { id } = jobs.start(store, 7, defaultQualityOptions());
    expect((await finish(jobs, id)).state).toBe("complete");
    return { store, jobs, id };
  }
  const proposal = (iri = base + "NewClass", label = "Useful class") => ({
    iri,
    label,
    predicate: NS.rdfs + "label",
    language: "en",
  });
  it("captures one immutable revision and supports cancellation, failure, and supersession", async () => {
    const s = await fixture(":A a owl:Class.");
    const jobs = new QualityJobs();
    const first = jobs.start(s, 7, {});
    jobs.cancel(first.id);
    expect((await finish(jobs, first.id)).state).toBe("canceled");
    const bad = jobs.start(s, 7, { scope: "branch", root: "missing" });
    expect((await finish(jobs, bad.id)).state).toBe("failed");
    const next = jobs.start(s, 7, {});
    s.rename(base + "A", "Added later");
    const result = (await finish(jobs, next.id)).report!;
    expect(result.version).toBeLessThan(s.version);
    expect(findings(result, "label.missing")).toHaveLength(1);
    expect(() => jobs.status(first.id)).toThrow("no longer");
  });
  it("adds more than 100 reviewed labels as one undoable edit, preserving every IRI and old statement", async () => {
    const { store, jobs, id } = await prepared(
      Array.from(
        { length: 137 },
        (_, i) => `:NewClass${i} a owl:Class; skos:altLabel 'alias${i}'.`,
      ).join(" "),
    );
    const before = [...store.scan()],
      version = store.version;
    const p = jobs.prepare(
      store,
      7,
      id,
      Array.from({ length: 137 }, (_, i) =>
        proposal(base + "NewClass" + i, "Label " + i),
      ),
    );
    expect([...store.scan()]).toEqual(before);
    expect(store.version).toBe(version);
    expect(jobs.apply(store, 7, p.version, p.token)).toBe(137);
    expect(store.version).toBe(version + 1);
    expect(store.exists(base + "NewClass0")).toBe(true);
    expect(
      store.tbox.filter((t) => t.predicate === NS.rdfs + "label"),
    ).toHaveLength(137);
    store.undo();
    expect([...store.scan()]).toEqual(before);
    store.redo();
    expect(store.label(base + "NewClass0")).toBe("Label 0");
  });
  it("retains named graphs and language/datatype in an exact preview", async () => {
    const s = await fixture(":G { :A a owl:Class. }", "fixture.trig"),
      jobs = new QualityJobs();
    const { id } = jobs.start(s, 7, {});
    await finish(jobs, id);
    const p = jobs.prepare(s, 7, id, [proposal(base + "A")]);
    expect(p.statements[0]).toMatchObject({
      graph: base + "G",
      object: { language: "en", datatype: NS.rdf + "langString" },
    });
  });
  it("rejects stale epochs, intervening edits, superseded previews, double apply and invalid batches", async () => {
    const { store, jobs, id } = await prepared();
    const p = jobs.prepare(store, 7, id, [proposal()]);
    const newer = jobs.prepare(store, 7, id, [proposal(base + "B")]);
    expect(() => jobs.apply(store, 7, p.version, p.token)).toThrow(
      "preview changed",
    );
    expect(() => jobs.apply(store, 8, newer.version, newer.token)).toThrow(
      "preview changed",
    );
    jobs.apply(store, 7, newer.version, newer.token);
    expect(() => jobs.apply(store, 7, newer.version, newer.token)).toThrow();
    expect(() => jobs.prepare(store, 7, id, [proposal()])).toThrow(
      "ontology changed",
    );
    const other = await prepared();
    for (const rows of [
      [proposal(), proposal()],
      [{ ...proposal(), label: " " }],
      [{ ...proposal(), predicate: NS.rdf + "type" }],
      [{ ...proposal(), language: "not a language" }],
    ])
      expect(() =>
        other.jobs.prepare(other.store, 7, other.id, rows),
      ).toThrow();
    const stale = other.jobs.prepare(other.store, 7, other.id, [proposal()]);
    other.store.rename(base + "B", "Changed");
    expect(() =>
      other.jobs.apply(other.store, 7, stale.version, stale.token),
    ).toThrow();
  });
});

let native = "";
try {
  native = mutatocExecutable(process.cwd(), "", false);
} catch {
  /* Native tests require the installed package. */
}
it.skipIf(!native)(
  "a reviewed label makes Industrial Safety match the unchanged native pipeline, and Undo removes it",
  async () => {
    const store = await fixture(":Industrial_Safety a owl:Class."),
      jobs = new QualityJobs();
    const service = new TextAnalysisService(
      () => native,
      () => textAnalysisContext(store, 7),
    );
    const parse = () =>
      service.parse({
        text: "Industrial Safety",
        datasetEpoch: 7,
        version: store.version,
      });
    try {
      expect(
        (await parse()).entities.filter((e) => e.source === "ontology"),
      ).toHaveLength(0);
      const { id } = jobs.start(store, 7, {});
      await finish(jobs, id);
      const preview = jobs.prepare(store, 7, id, [
        {
          iri: base + "Industrial_Safety",
          predicate: NS.rdfs + "label",
          label: "Industrial Safety",
          language: "",
        },
      ]);
      jobs.apply(store, 7, preview.version, preview.token);
      const matched = await parse();
      expect(
        matched.entities.filter((e) => e.source === "ontology"),
      ).toHaveLength(1);
      expect(matched.concepts?.industrial_safety.map((c) => c.iri)).toEqual([
        base + "Industrial_Safety",
      ]);
      store.undo();
      expect(
        (await parse()).entities.filter((e) => e.source === "ontology"),
      ).toHaveLength(0);
    } finally {
      service.close();
    }
  },
);
