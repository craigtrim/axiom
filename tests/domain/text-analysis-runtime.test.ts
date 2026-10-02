import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { buildStore } from "../../src/domain/fixture";
import { textAnalysisContext } from "../../src/domain/text-analysis-context";
import { NS } from "../../src/domain/model";
import { expect, it } from "vitest";
import path from "node:path";
import { TextAnalysisService } from "../../src/main/text-analysis-service";
import {
  MUTATOC_VERSION,
  mutatocExecutable,
  MutatocClient,
} from "../../src/main/mutatoc-client";
import {
  textEntities,
  type MutatocToken,
} from "../../src/main/text-analysis-spans";
let executable = "";
try {
  executable = mutatocExecutable(process.cwd(), "", false);
} catch {
  // The dedicated test:text-analysis command requires a runtime up front.
}
const available = !!executable;
it.skipIf(!available)(
  "matches a newly added seeAlso literal in every case and removes the match on Undo",
  async () => {
    const iri = "https://example.org/text#Phlebotomy";
    const store = storeFromRdf(
      (
        await parseRdf(
          `<${iri}> a <${NS.owl}Class>; <${NS.rdfs}label> "Phlebotomy".`,
          "phlebotomy.ttl",
          iri,
        )
      ).triples,
      "Phlebotomy",
    );
    const service = new TextAnalysisService(
      () => executable,
      () => textAnalysisContext(store, 1),
    );
    const parse = (text: string) =>
      service.parse({ text, datasetEpoch: 1, version: store.version });
    try {
      expect(
        (await parse("Phleb")).entities.filter((e) => e.source === "ontology"),
      ).toEqual([]);
      store.updateEntity(iri, [
        ...store.entityStatements(iri),
        {
          subject: iri,
          predicate: NS.rdfs + "seeAlso",
          object: { literal: true, value: "phleb" },
        },
      ]);
      for (const text of [
        "phleb",
        "Phleb",
        "PHLEB",
        "Principles & Practice of Phleb",
      ]) {
        const result = await parse(text);
        const matches = result.entities.filter((e) => e.source === "ontology");
        expect(matches).toHaveLength(1);
        expect(text.slice(matches[0].start, matches[0].end).toLowerCase()).toBe(
          "phleb",
        );
        expect(result.concepts?.[matches[0].label]?.map((c) => c.iri)).toEqual([
          iri,
        ]);
      }
      store.undo();
      expect(
        (await parse("Phleb")).entities.filter((e) => e.source === "ontology"),
      ).toEqual([]);
      store.redo();
      expect(
        (await parse("Phleb")).entities.some(
          (e) => e.source === "ontology" && e.label === "phlebotomy",
        ),
      ).toBe(true);
    } finally {
      service.close();
    }
  },
);
const turtle = `@prefix : <https://example.org/text#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
:Animal a owl:Class; rdfs:label "Animal" .
:Dog a owl:Class; rdfs:subClassOf :Animal; rdfs:label "Dog"; skos:altLabel "canine" .
:Cat a owl:Class; rdfs:subClassOf :Animal; rdfs:label "Cat" .
:Lion a owl:Class; rdfs:subClassOf :Animal; rdfs:label "Lion"; skos:altLabel "big cat" .`;
it.skipIf(!available)(
  "parses with the real packaged C engine, refreshes ontology edits and recovers after errors",
  async () => {
    let version = 1;
    let content = turtle;
    let contexts = 0;
    const service = new TextAnalysisService(
      () => executable,
      async () => {
        contexts++;
        return { turtle: content, name: "test", datasetEpoch: 1, version };
      },
    );
    try {
      const text = "😀 Dog\n\tcanine and a big cat.";
      const first = await service.parse({ text, datasetEpoch: 1, version });
      expect(
        first.entities
          .filter((e) => e.source === "ontology")
          .map((e) => [text.slice(e.start, e.end), e.label]),
      ).toEqual([
        ["Dog", "dog"],
        ["canine", "dog"],
        ["big cat", "lion"],
      ]);
      const second = await service.parse({
        text: "Cat",
        datasetEpoch: 1,
        version,
      });
      expect(second.entities[0].label).toBe("cat");
      expect(contexts).toBe(1);
      version++;
      content = turtle.replace(
        ":Cat a owl:Class;",
        ':Cat a owl:Class; skos:altLabel "kitty";',
      );
      expect(
        (await service.parse({ text: "kitty", datasetEpoch: 1, version }))
          .entities[0].label,
      ).toBe("cat");
      expect(contexts).toBe(2);
      await expect(
        service.parse({ text: "a".repeat(100001), datasetEpoch: 1, version }),
      ).rejects.toThrow(/100,000/);
      expect(
        (await service.parse({ text: "Dog", datasetEpoch: 1, version }))
          .entities[0].label,
      ).toBe("dog");
      console.log(
        `mutatoc cold parse ${first.milliseconds} ms; warm parse ${second.milliseconds} ms`,
      );
    } finally {
      service.close();
    }
  },
);
// craigtrim/axiom#40: Mutatoc 0.3.1 rewrote these words when they ended the
// input, and Axiom's old position replay cleared every highlight on 0.4.0.
const formerSubstitutions = [
  ..."can't could've everyone's he'd he'll he's here's how've i'll i'm it's let's she'd she's should've that's the're there's they'd they'll they're they've wander'd we'd we'll we're what're what's where's who's why're won't would've y'all you'd you're you've".split(
    " ",
  ),
  ..."abbr. abr. acad. adj. adm. aka. approx. appt. apt. assoc. ave. bibliog. biol. blvd. bot. cap. chap. chem. co. colloq. com. conf. cont. cp. cr. crit. cyn. def. dept. diff. dr. e.g. ea. est. etc. gen. impt. ln. min. misc. mr. mrs. nec. no. rd. re. sim. st. tel. temp. vet. vs.".split(
    " ",
  ),
];
it.skipIf(!available)(
  "keeps exact highlights around spacing, quotes and every word the 0.3.1 tokenizer rewrote",
  async () => {
    const client = new MutatocClient(executable);
    try {
      expect(await client.request({ op: "version" })).toBe(MUTATOC_VERSION);
      await client.request({
        op: "load",
        turtle,
        name: "offsets",
        class_based: true,
        interface: "data",
      });
      const texts = [
        "Dog  Cat",
        "Dog\r\nCat",
        "😀 Dog café Cat",
        "'Dog' cat",
        '"Dog" cat',
        "‘Dog’ cat",
        "Dog... Cat",
        "Dog\tCat",
        "  Dog Cat  ",
        "Dog — Cat",
        "Dog\n\nCat",
        "😀😀 Dog\u00a0\u2003Cat",
        ...formerSubstitutions.flatMap((word) => [
          `😀 Dog ${word} Cat`,
          `😀 Dog and Cat ${word}`,
          `😀 Dog and Cat\n${word}`,
        ]),
      ];
      for (const text of texts) {
        const parsed = await client.request<{ tokens: MutatocToken[] }>({
          op: "parse",
          text,
        });
        expect(
          textEntities(text, parsed.tokens).map(({ start, end, label }) => [
            start,
            end,
            label,
          ]),
          text,
        ).toEqual(
          [...text.matchAll(/Dog|Cat|cat/g)].map((m) => [
            m.index!,
            m.index! + 3,
            m[0].toLowerCase(),
          ]),
        );
      }
    } finally {
      client.close();
    }
  },
);
it("reports missing runtime configuration instead of approximating NLP", () => {
  const previous = process.env.AXIOM_MUTATOC_HOME;
  process.env.AXIOM_MUTATOC_HOME = path.resolve(
    "artifacts/nonexistent-mutatoc",
  );
  try {
    expect(() => mutatocExecutable(process.cwd(), "", false)).toThrow(
      /runtime is missing/,
    );
  } finally {
    if (previous === undefined) delete process.env.AXIOM_MUTATOC_HOME;
    else process.env.AXIOM_MUTATOC_HOME = previous;
  }
});

it.skipIf(!available)(
  "returns no matches for empty ontologies and restores matching on the next ontology version",
  async () => {
    let version = 1;
    let content =
      "<http://www.w3.org/2002/07/owl#Thing> a <http://www.w3.org/2002/07/owl#Class> .";
    const service = new TextAnalysisService(
      () => executable,
      async () => ({
        turtle: content,
        name: "empty",
        datasetEpoch: 1,
        version,
      }),
    );
    try {
      const empty = await service.parse({
        text: "Dog in London",
        datasetEpoch: 1,
        version,
      });
      expect(empty.entities).toEqual([]);
      version++;
      content = turtle;
      const populated = await service.parse({
        text: "Dog in London",
        datasetEpoch: 1,
        version,
      });
      expect(populated.entities.map((e) => [e.source, e.label])).toEqual([
        ["ontology", "dog"],
      ]);
    } finally {
      service.close();
    }
  },
);

it("does not start a native process when closed during context capture", async () => {
  let ready!: (
    context: import("../../src/shared/text-analysis").TextAnalysisContext,
  ) => void;
  const service = new TextAnalysisService(
    () => "missing-executable",
    () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  );
  const pending = service.parse({ text: "Dog", datasetEpoch: 1, version: 1 });
  service.close();
  ready({ turtle, name: "test", datasetEpoch: 1, version: 1 });
  expect((await pending).superseded).toBe(true);
});

it.skipIf(!available)(
  "matches the built-in Pizza vocabulary without serializing generated order rows",
  async () => {
    const store = buildStore(12000);
    const context = await textAnalysisContext(store, 1);
    expect(context.turtle).toContain('"Margherita"');
    expect(context.turtle).not.toContain("Pizza_000001");
    expect(context.turtle).not.toContain("Customer_000001");
    const service = new TextAnalysisService(
      () => executable,
      async () => context,
    );
    try {
      const result = await service.parse({
        text: "Margherita",
        datasetEpoch: 1,
        version: context.version,
      });
      expect(result.entities[0]).toMatchObject({
        source: "ontology",
        label: "margherita",
        start: 0,
        end: 10,
      });
    } finally {
      service.close();
    }
  },
);

it.skipIf(!available)(
  "links real native canonical names to exact ontology IDs including collisions and non-fragment IRIs",
  async () => {
    const content = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<https://one.test/#Dog> a owl:Class; rdfs:label "Dog"; skos:altLabel "canine" .
<https://two.test/#Dog> a owl:Class; rdfs:label "Hound" .
<https://one.test/#ΟΣ> a owl:Class; rdfs:label "cedar" .
<https://one.test/SlashDog> a owl:Class; rdfs:label "birch" .
<urn:Maple> a owl:Class; rdfs:label "maple" .`;
    const store = storeFromRdf(
      (await parseRdf(content, "identity.ttl", "https://one.test/")).triples,
      "identity",
    );
    const service = new TextAnalysisService(
      () => executable,
      () => textAnalysisContext(store, 1),
    );
    try {
      const result = await service.parse({
        text: "canine cedar birch maple",
        datasetEpoch: 1,
        version: store.version,
      });
      expect(
        result.entities
          .filter((entity) => entity.source === "ontology")
          .map((entity) => entity.label),
      ).toEqual(["dog", "ος", "https://one.test/slashdog", "urn:maple"]);
      expect(result.concepts!.dog.map((concept) => concept.iri)).toEqual([
        "https://one.test/#Dog",
        "https://two.test/#Dog",
      ]);
      expect(result.concepts!["ος"][0].iri).toBe("https://one.test/#ΟΣ");
      expect(result.concepts!["https://one.test/slashdog"][0].iri).toBe(
        "https://one.test/SlashDog",
      );
      expect(result.concepts!["urn:maple"][0].iri).toBe("urn:Maple");
    } finally {
      service.close();
    }
  },
);

it.skipIf(!available)(
  "preserves every match and source offset through edits to a long document",
  async () => {
    const parsed = await parseRdf(
      turtle,
      "animals.ttl",
      "https://example.org/text#",
    );
    const store = storeFromRdf(parsed.triples, "animals");
    const service = new TextAnalysisService(
      () => executable,
      () => textAnalysisContext(store, 1),
    );
    const paragraph = "😀 Dog and a big cat. Cat lives in London.\n";
    const original = paragraph.repeat(100);
    try {
      for (const text of [
        original,
        "canine " + original,
        original + "big cat",
      ]) {
        const result = await service.parse({
          text,
          datasetEpoch: 1,
          version: store.version,
        });
        const matches = result.entities.filter(
          (entity) => entity.source === "ontology",
        );
        const expected = [...text.matchAll(/canine|Dog|big cat|Cat/g)].map(
          (match) => ({
            start: match.index!,
            end: match.index! + match[0].length,
            label:
              match[0] === "big cat"
                ? "lion"
                : match[0] === "Cat"
                  ? "cat"
                  : "dog",
          }),
        );
        expect(
          matches.map(({ start, end, label }) => ({ start, end, label })),
        ).toEqual(expected);
        expect(
          result.entities.some(
            (entity) =>
              entity.source !== "ontology" &&
              text.slice(entity.start, entity.end) === "London",
          ),
        ).toBe(false);
        for (const entity of matches)
          expect(result.concepts?.[entity.label]?.length).toBeGreaterThan(0);
      }
    } finally {
      service.close();
    }
  },
);
