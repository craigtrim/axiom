// craigtrim/axiom#207: context work yields to requests and rejects mixed revisions.
import { expect, it } from "vitest";
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { entity, NS, type Triple } from "../../src/domain/model";
import { Store } from "../../src/domain/store";
import {
  StaleTextAnalysisContext,
  textAnalysisContext,
} from "../../src/domain/text-analysis-context";
import {
  textAnalysisConcepts,
  textAnalysisConceptsAsync,
} from "../../src/domain/text-analysis-concepts";
import { writeRdf } from "../../src/domain/rdf-io";

function fixture() {
  const store = new Store();
  store.ontology = {
    name: "capture",
    namespace: "https://example.test/capture#",
    example: false,
    assertedOnly: true,
  };
  for (let index = 0; index < 2050; index++) {
    const iri = store.ontology.namespace + "Entry" + index;
    store.entities.set(iri, {
      ...entity(iri, "Class"),
      label: "Entry " + index,
    });
    store.tbox.push(
      {
        subject: iri,
        predicate: NS.rdf + "type",
        object: { value: NS.owl + "Class", literal: false },
      },
      {
        subject: iri,
        predicate: NS.rdfs + "label",
        object: { value: "Entry " + index, literal: true },
      },
    );
  }
  return store;
}

it("lets another request run before a large capture finishes", async () => {
  const store = fixture();
  let answered = false;
  let finished = false;
  const request = yieldImmediate().then(() => {
    answered = store.exists(store.ontology.namespace + "Entry0");
  });
  const pending = textAnalysisContext(store, 7).then((context) => {
    finished = true;
    return context;
  });
  await request;
  expect(answered).toBe(true);
  expect(finished).toBe(false);
  const context = await pending;
  expect(context.datasetEpoch).toBe(7);
  expect(context.statements).toHaveLength(store.tbox.length);
  expect(context.concepts!.entry0[0].iri).toBe(
    store.ontology.namespace + "Entry0",
  );
});

it("rejects a capture if an ontology edit occurs while it yields", async () => {
  const store = fixture();
  const edit = yieldImmediate().then(() => {
    store.version++;
  });
  await expect(textAnalysisContext(store, 1)).rejects.toBeInstanceOf(
    StaleTextAnalysisContext,
  );
  await edit;
});

it("rejects a replaced dataset even when the old store version is unchanged", async () => {
  const store = fixture();
  let current = true;
  const replacement = yieldImmediate().then(() => {
    current = false;
  });
  await expect(
    textAnalysisContext(store, 1, () => current),
  ).rejects.toBeInstanceOf(StaleTextAnalysisContext);
  await replacement;
});

it("keeps Turtle bytes and concept metadata identical in cooperative mode", async () => {
  const store = fixture();
  const subject = store.ontology.namespace + "Entry0";
  const triples: Triple[] = [
    ...store.tbox,
    {
      subject,
      predicate: NS.rdfs + "comment",
      object: {
        value: 'Unicode: 漢字, quotes " and [brackets]\nnext line',
        literal: true,
      },
    },
    {
      subject,
      predicate: NS.owl + "equivalentClass",
      object: { value: "_:restriction", literal: false },
    },
    {
      subject: "_:restriction",
      predicate: NS.rdf + "type",
      object: { value: NS.owl + "Restriction", literal: false },
    },
    {
      subject: "_:restriction",
      predicate: NS.owl + "onProperty",
      object: { value: "urn:property", literal: false },
    },
  ];
  let yields = 0;
  const yieldControl = async () => {
    yields++;
    await yieldImmediate();
  };
  expect(await writeRdf(triples, "turtle", { yieldControl })).toBe(
    await writeRdf(triples, "turtle"),
  );
  expect(yields).toBeGreaterThan(3);
  expect(await textAnalysisConceptsAsync(store, triples, yieldControl)).toEqual(
    textAnalysisConcepts(store, triples),
  );
});
