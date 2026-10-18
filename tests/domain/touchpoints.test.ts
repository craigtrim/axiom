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
  // craigtrim/axiom#92: capture the context in the same mutation turn.
  const insert = vi.fn(async (_c: unknown, statements: Triple[]) => ({
    count: applyTouchpoints(store, iri, statements),
    context: touchpointContext(store, iri, epoch),
  }));
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
    compare = vi.fn(async () =>
      candidates.map((_, i) => i / candidates.length),
    );
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
  await expect(f.service.apply(r.token, [selection(c.id)])).resolves.toBe(1);
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

it("keeps the same result usable for successive batches but refuses edits after its own captured version", async () => {
  const f = setup(),
    result = await f.service.search({ iri: f.iri, query: "Mercury" });
  const rows = result.candidates.filter((c) => !c.disambiguation);
  expect(await f.service.apply(result.token, [selection(rows[0].id)])).toBe(1);
  expect(await f.service.apply(result.token, [selection(rows[1].id)])).toBe(1);
  f.store.createClass("Outside edit", f.parent);
  await expect(
    f.service.apply(result.token, [selection(rows[2].id)]),
  ).rejects.toThrow(/changed since/);
  expect(f.insert).toHaveBeenCalledTimes(2);
});

it("does not absorb an outside edit that arrives between applying and reading display context", async () => {
  const f = setup();
  const service = new TouchpointService(
    f.provider,
    f.context,
    async (context, statements) => {
      const applied = await f.insert(context, statements);
      f.store.createClass("Concurrent edit", f.parent);
      return applied;
    },
  );
  const result = await service.search({ iri: f.iri, query: "Mercury" });
  const rows = result.candidates.filter((c) => !c.disambiguation);
  await service.apply(result.token, [selection(rows[0].id)]);
  await expect(
    service.apply(result.token, [selection(rows[1].id)]),
  ).rejects.toThrow(/changed since/);
});

it("rejects an exact duplicate before adding another selected statement", async () => {
  const f = setup(),
    result = await f.service.search({ iri: f.iri, query: "Mercury" });
  const rows = result.candidates.filter((c) => !c.disambiguation);
  await f.service.apply(result.token, [selection(rows[0].id)]);
  const before = f.store.version;
  await expect(
    f.service.apply(result.token, [
      selection(rows[1].id),
      selection(rows[0].id),
    ]),
  ).rejects.toThrow(/already has that statement/);
  expect(f.store.version).toBe(before);
  expect(f.insert).toHaveBeenCalledTimes(1);
});

it("refuses a partial domain batch containing an existing resource statement", () => {
  const f = setup(),
    rows = candidates.filter((c) => !c.disambiguation);
  const statements = rows
    .slice(0, 2)
    .map((c) => ({
      subject: f.iri,
      predicate: NS.skos + "closeMatch",
      object: { literal: false as const, value: c.iri },
    }));
  applyTouchpoints(f.store, f.iri, statements.slice(0, 1));
  const before = f.store.version;
  expect(() => applyTouchpoints(f.store, f.iri, statements)).toThrow(
    /already exists/,
  );
  expect(f.store.version).toBe(before);
});

it("reads saved candidates without searching and preserves raw model scores and tie order", async () => {
  const f = setup();
  const provider = {
    ...f.provider,
    readSaved: vi.fn(async () => ({
      candidates: candidates.slice(0, 3),
      cached: true,
      stale: false,
    })),
  };
  const service = new TouchpointService(
    provider,
    f.context,
    f.insert,
    async () => [0.75, 0.75, -0.2],
  );
  const saved = await service.saved({ iri: f.iri, query: "Mercury" });
  expect(f.provider.search).not.toHaveBeenCalled();
  expect(saved?.candidates.map((c) => [c.id, c.similarity])).toEqual(
    candidates.slice(0, 3).map((c, i) => [c.id, [0.75, 0.75, -0.2][i]]),
  );
  expect(saved?.ranking).toBe("model");
});

it("treats anyURI literals as links while allowing a distinct resource statement", async () => {
  const f = setup(),
    candidate = candidates.find((c) => !c.disambiguation)!;
  f.store.updateEntity(f.iri, [
    ...f.store.entityStatements(f.iri),
    {
      subject: f.iri,
      predicate: NS.skos + "closeMatch",
      object: {
        literal: true,
        value: candidate.iri,
        datatype: NS.xsd + "anyURI",
      },
    },
  ]);
  const result = await f.service.search({ iri: f.iri, query: "Mercury" });
  expect(result.context.links).toContainEqual({
    predicate: NS.skos + "closeMatch",
    iri: candidate.iri,
    literal: true,
  });
  expect(await f.service.apply(result.token, [selection(candidate.id)])).toBe(
    1,
  );
});
