import { it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { buildEmptyStore } from "../../src/domain/workspace";
import { NS, THING, type Triple } from "../../src/domain/model";
import {
  touchpointContext,
  applyTouchpoints,
} from "../../src/domain/touchpoints";
import { parseWikipediaResponse } from "../../src/main/wikipedia-client";
import { TouchpointService } from "../../src/main/touchpoint-service";
import {
  suggestedTouchpointPredicate,
  touchpointObject,
  touchpointPredicates,
  type TouchpointSelection,
} from "../../src/shared/touchpoints";
const candidates = parseWikipediaResponse(
  JSON.parse(
    await readFile(
      new URL("../fixtures/wikipedia/mercury.json", import.meta.url),
      "utf8",
    ),
  ),
);
function setup(kind: "Class" | "Individual" = "Class") {
  const store = buildEmptyStore(),
    parent = store.createClass("Planet", THING),
    iri =
      kind === "Class"
        ? store.createClass("Mercury", parent)
        : store.createNamedIndividual("Mercury", parent);
  let epoch = 1;
  const context = async () => touchpointContext(store, iri, epoch);
  const provider = {
    id: "fixture",
    search: vi.fn(async () => ({
      candidates: structuredClone(candidates),
      cached: false,
      stale: false,
    })),
  };
  const insert = vi.fn(async (_c: unknown, statements: Triple[]) =>
    applyTouchpoints(store, iri, statements),
  );
  return {
    store,
    iri,
    parent,
    context,
    provider,
    insert,
    setEpoch: (value: number) => (epoch = value),
    service: new TouchpointService(provider, context, insert),
  };
}
const selection = (
  id: string,
  predicate = NS.skos + "closeMatch",
): TouchpointSelection => ({ id, predicate, object: "dbpedia" });
it("captures preferred label, parent context, aliases and resource links separately", async () => {
  const f = setup();
  f.store.updateEntity(f.iri, [
    ...f.store.entityStatements(f.iri),
    {
      subject: f.iri,
      predicate: NS.skos + "altLabel",
      object: { literal: true, value: "Hermes" },
    },
    {
      subject: f.iri,
      predicate: NS.rdfs + "seeAlso",
      object: { literal: true, value: "Quicksilver" },
    },
  ]);
  expect(await f.context()).toMatchObject({
    label: "Mercury",
    parents: ["Planet"],
    aliases: expect.arrayContaining(["Hermes", "Quicksilver"]),
  });
  expect((await f.context()).links.some((l) => l.iri === "Quicksilver")).toBe(
    false,
  );
});
it.each(["mercury", " MERCURY ", "Ｍｅｒｃｕｒｙ"])(
  "suggests exactMatch for normalized label %s",
  async (label) => {
    const f = setup();
    expect(
      suggestedTouchpointPredicate(await f.context(), {
        ...candidates[0],
        label,
      }),
    ).toBe(NS.skos + "exactMatch");
  },
);
it("suggests exactMatch for an alias or redirect and closeMatch for a broader title", async () => {
  const c = await setup().context();
  c.aliases = ["Quicksilver"];
  expect(
    suggestedTouchpointPredicate(c, { ...candidates[0], label: "Quicksilver" }),
  ).toBe(NS.skos + "exactMatch");
  expect(
    suggestedTouchpointPredicate(c, {
      ...candidates[0],
      label: "Other",
      redirects: ["Mercury"],
    }),
  ).toBe(NS.skos + "exactMatch");
  expect(
    suggestedTouchpointPredicate(c, {
      ...candidates[0],
      label: "Mercury (planet)",
      redirects: [],
    }),
  ).toBe(NS.skos + "closeMatch");
});
it("uses local semantic scores with full entity context and keeps original order when unavailable", async () => {
  const f = setup(),
    compare = vi.fn(async () => candidates.map((_, i) => i));
  const service = new TouchpointService(
    f.provider,
    f.context,
    f.insert,
    compare,
  );
  expect(
    (await service.search({ iri: f.iri, query: "Mercury" })).candidates[0].id,
  ).toBe(candidates.at(-1)!.id);
  expect(compare.mock.calls[0]).toEqual([
    "Mercury. Planet",
    candidates.map((c) => [c.label, c.description].filter(Boolean).join(". ")),
  ]);
  compare.mockRejectedValueOnce(Error("Model absent"));
  expect(
    (await service.search({ iri: f.iri, query: "Mercury" })).candidates,
  ).toEqual(candidates);
});
it("applies selected resource relationships as one undoable batch", async () => {
  const f = setup(),
    response = await f.service.search({ iri: f.iri, query: "Mercury" }),
    rows = response.candidates.filter((c) => !c.disambiguation).slice(0, 2);
  const before = [...f.store.scan(f.iri)];
  expect(
    await f.service.apply(
      response.token,
      rows.map((c) => selection(c.id)),
    ),
  ).toBe(2);
  expect(f.insert).toHaveBeenCalledTimes(1);
  expect(
    [...f.store.scan(f.iri)].filter(
      (t) => t.predicate === NS.skos + "closeMatch",
    ),
  ).toHaveLength(2);
  f.store.undo();
  expect([...f.store.scan(f.iri)]).toEqual(before);
  await expect(
    f.service.apply(response.token, [selection(rows[0].id)]),
  ).rejects.toThrow(/Search again/);
});
it.each(["version", "epoch"])(
  "rejects the entire batch after a %s change",
  async (change) => {
    const f = setup(),
      r = await f.service.search({ iri: f.iri, query: "Mercury" });
    if (change === "version") f.store.createClass("Venus", f.parent);
    else f.setEpoch(2);
    await expect(
      f.service.apply(
        r.token,
        r.candidates
          .filter((c) => !c.disambiguation)
          .slice(0, 2)
          .map((c) => selection(c.id)),
      ),
    ).rejects.toThrow(/changed since/);
    expect(f.insert).not.toHaveBeenCalled();
  },
);
it.each([
  "unknown",
  "disambiguation",
  "duplicate",
  "literal predicate",
  "sameAs on class",
  "missing Wikidata",
  "invalid object",
])("rejects %s without a partial write", async (bad) => {
  const f = setup();
  f.provider.search.mockResolvedValueOnce({
    candidates: [
      { ...candidates[0], id: "1", disambiguation: false },
      {
        ...candidates[1],
        id: "2",
        disambiguation: bad === "disambiguation",
        wikidataIri: undefined,
      },
    ],
    cached: false,
    stale: false,
  });
  const r = await f.service.search({ iri: f.iri, query: "Mercury" }),
    s = [selection("1"), selection("2")];
  if (bad === "unknown") s[1].id = "404";
  if (bad === "duplicate") s[1].id = "1";
  if (bad === "literal predicate") s[1].predicate = NS.skos + "altLabel";
  if (bad === "sameAs on class") s[1].predicate = NS.owl + "sameAs";
  if (bad === "missing Wikidata") s[1].object = "wikidata";
  if (bad === "invalid object") s[1].object = "evil" as any;
  await expect(f.service.apply(r.token, s)).rejects.toThrow();
  expect(f.insert).not.toHaveBeenCalled();
});
it("marks links through any candidate identity as already linked", async () => {
  const f = setup(),
    c = candidates.find((c) => !c.disambiguation)!;
  applyTouchpoints(f.store, f.iri, [
    {
      subject: f.iri,
      predicate: NS.rdfs + "seeAlso",
      object: { literal: false, value: c.url },
    },
  ]);
  const r = await f.service.search({ iri: f.iri, query: "Mercury" });
  await expect(f.service.apply(r.token, [selection(c.id)])).rejects.toThrow(
    /already links/,
  );
});
it.each([...touchpointPredicates, NS.rdfs + "seeAlso", NS.owl + "sameAs"])(
  "persists %s as a resource for an individual",
  async (predicate) => {
    const f = setup("Individual"),
      r = await f.service.search({ iri: f.iri, query: "Mercury" }),
      c = r.candidates.find((c) => !c.disambiguation)!;
    await f.service.apply(r.token, [
      {
        id: c.id,
        predicate,
        object: predicate === NS.rdfs + "seeAlso" ? "wikipedia" : "dbpedia",
      },
    ]);
    expect([...f.store.scan(f.iri)]).toContainEqual({
      subject: f.iri,
      predicate,
      object: {
        literal: false,
        value: predicate === NS.rdfs + "seeAlso" ? c.url : c.iri,
      },
    });
  },
);
it("returns the requested object identity and excludes absent Wikidata", () => {
  const c = {
    ...candidates[0],
    wikidataIri: "http://www.wikidata.org/entity/Q1",
  };
  expect(touchpointObject(c, "dbpedia")).toBe(c.iri);
  expect(touchpointObject(c, "wikipedia")).toBe(c.url);
  expect(touchpointObject(c, "wikidata")).toBe(c.wikidataIri);
  expect(
    touchpointObject({ ...c, wikidataIri: undefined }, "wikidata"),
  ).toBeUndefined();
});
it("validates a complete domain batch before modifying the entity", () => {
  const f = setup(),
    version = f.store.version;
  expect(() =>
    applyTouchpoints(f.store, f.iri, [
      {
        subject: f.iri,
        predicate: NS.skos + "exactMatch",
        object: { literal: false, value: candidates[0].iri },
      },
      {
        subject: f.iri,
        predicate: NS.rdfs + "seeAlso",
        object: { literal: true, value: "invalid literal" },
      },
    ]),
  ).toThrow();
  expect(f.store.version).toBe(version);
});
