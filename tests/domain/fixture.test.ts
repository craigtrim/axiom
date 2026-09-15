import { describe, it, expect } from "vitest";
import { buildStore, generate } from "../../src/domain/fixture";
import { NS, TYPE } from "../../src/domain/model";
import { Viewport } from "../../src/domain/viewport";
import { Layouts } from "../../src/domain/layouts";
import { executeQuery, parseQuery } from "../../src/domain/query";
import examples from "../../src/domain/data/examples.json";
describe("deterministic fixture", () => {
  it.each([
    [
      1000,
      7629,
      12206.53,
      3830,
      "FruttiDiMare",
      14.71,
      "Siciliana",
      13.18,
      "Quinn Esposito",
    ],
    [
      12000,
      87379,
      146475.15,
      45015,
      "Rosa",
      10.86,
      "Margherita",
      8.14,
      "Jonna Ueda",
    ],
    [
      50000,
      362879,
      609160.42,
      188150,
      "Caprina",
      11.41,
      "QuattroFormaggi",
      12.71,
      "Elif Ionescu",
    ],
    [
      100000,
      725379,
      1217990.26,
      375866,
      "Veneziana",
      11.67,
      "American",
      9.65,
      "Sami Lombardi",
    ],
  ])(
    "matches golden dataset %s",
    (
      n,
      triples,
      prices,
      ratings,
      first,
      firstPrice,
      last,
      lastPrice,
      customer,
    ) => {
      const s = buildStore(+n);
      expect(s.entities.size).toBe(114);
      expect(s.classCount).toBe(95);
      expect(s.propertyCount).toBe(14);
      expect(s.tbox).toHaveLength(239);
      expect(s.rbox).toHaveLength(140);
      expect(s.tripleCount).toBe(triples);
      expect(s.individualCount).toBe(+n + +n / 8 + 5);
      expect(
        s.individuals.reduce((sum, i) => sum + Math.round(i.price * 100), 0) /
          100,
      ).toBe(prices);
      expect(s.individuals.reduce((sum, i) => sum + i.rating, 0)).toBe(ratings);
      expect(s.individuals[0].type).toBe(NS.pizza + first);
      expect(s.individuals[0].price).toBe(firstPrice);
      expect(s.individuals.at(-1)!.type).toBe(NS.pizza + last);
      expect(s.individuals.at(-1)!.price).toBe(lastPrice);
      expect(s.customers.at(-1)!.name).toBe(customer);
    },
  );
  it("streams the actual counted triples", () => {
    const s = buildStore(1000);
    expect([...s.scan()]).toHaveLength(s.tripleCount);
  });
  it("reports full adjacency and retains capped members", () => {
    const s = buildStore(100000),
      a = s.neighbours(NS.demo + "Order");
    expect(a.total).toBe(100007);
    expect(a.list).toHaveLength(4000);
    const last = s.individuals.at(-1)!.iri;
    expect(
      s
        .neighbours(NS.demo + "Order", new Set([last]))
        .list.some((n) => n.iri === last),
    ).toBe(true);
  });
});
describe("query parity", () => {
  it.each([
    [0, 103, 103],
    [1, 5, 5],
    [2, 21, 21],
    [3, 100, 100],
    [4, 150, 150],
    [5, 5, 5],
    [6, 500, 500],
  ])("matches worked example %s", async (i, rows, total) => {
    const s = buildStore();
    const r = await executeQuery(s, examples[i].Text);
    expect(r.rows).toHaveLength(rows);
    expect(r.total).toBe(total);
    expect(r.capped).toBe(false);
  });
  it.each([
    "SELECT ?s WHERE { ?s A pizza:Pizza }",
    "SELECT ?s WHERE { ?s ?p }",
    "SELECT ?s WHERE { ?s ?p ?o } LIMIT 3.7",
  ])("rejects invalid grammar %s", (q) =>
    expect(() => parseQuery(q)).toThrow(),
  );
  it("unifies repeated variables and filters unbound terms", async () => {
    const s = buildStore(1000);
    expect(
      (await executeQuery(s, "SELECT ?x WHERE { ?x ?p ?x }")).rows,
    ).toHaveLength(0);
    expect(
      (
        await executeQuery(
          s,
          "SELECT ?s WHERE { ?s demo:rating 5 FILTER (?missing != 1) }",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("honors LIMIT zero and rejects non-integer LIMIT values", async () => {
    const s = buildStore(1000),
      q = "SELECT ?s WHERE { ?s demo:rating 5 }";
    const r = await executeQuery(s, q + " LIMIT 0");
    expect(r.total).toBe(0);
    expect(r.rows).toHaveLength(0);
    await expect(executeQuery(s, q + " LIMIT 3.7")).rejects.toThrow();
    expect(() => parseQuery(q + " LIMIT -5")).toThrow();
  });
  it("keeps snapshots stable across edits and regeneration", () => {
    const s = buildStore(1000),
      snapshot = s.querySnapshot(),
      before = snapshot.individuals[0].price;
    s.editCell(s.individuals[0].iri, "price", "400");
    const d = generate(12000);
    s.loadGenerated(d.individuals, d.customers);
    expect(snapshot.individuals).toHaveLength(1000);
    expect(snapshot.individuals[0].price).toBe(before);
  });
  it("cancels large work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeQuery(
        buildStore(1000),
        "SELECT * WHERE { ?s ?p ?o }",
        controller.signal,
      ),
    ).rejects.toThrow("cancelled");
  });
  it("caps final solutions after every join has been evaluated", async () => {
    const r = await executeQuery(
      buildStore(100000),
      "SELECT ?s ?o ?r WHERE { ?s ?p ?o . ?s demo:rating ?r }",
    );
    expect(r.capped).toBe(true);
    expect(r.rows).toHaveLength(200000);
    expect(r.rows.every((row) => row[2]?.literal)).toBe(true);
  });
});
describe("mutations and viewport", () => {
  it("validates and undoes/ redoes a schema edit", () => {
    const s = buildStore(),
      n = s.tbox.length,
      iri = s.createClass("TestPizza", NS.pizza + "Pizza");
    expect(s.tbox.length).toBe(n + 3);
    s.undo();
    expect(s.exists(iri)).toBe(false);
    s.redo();
    expect(s.exists(iri)).toBe(true);
    s.rename(iri, "RenamedPizza");
    expect(s.resolve(iri)!.name).toBe("RenamedPizza");
    s.undo();
    expect(s.resolve(iri)!.name).toBe("TestPizza");
  });
  it("does not mutate invalid values", () => {
    const s = buildStore(1000),
      i = s.individuals[0],
      old = i.price;
    for (const p of ["", "-1", "501", "NaN", "Infinity"])
      expect(() => s.editCell(i.iri, "price", p)).toThrow();
    expect(s.individualIndex.get(i.iri)!.price).toBe(old);
    s.editCell(i.iri, "price", "£12.345");
    expect(s.individualIndex.get(i.iri)!.price).toBe(12.35);
    s.undo();
    expect(s.individualIndex.get(i.iri)!.price).toBe(old);
  });
  it("preserves protected nodes under budget and expansion", () => {
    const s = buildStore(1000),
      v = new Viewport(s);
    v.setBudget(100);
    v.seed([NS.demo + "Order"]);
    for (const n of v.nodes.values()) n.pinned = true;
    expect(v.nodes.size).toBeLessThanOrEqual(100);
    v.expand(NS.demo + "Order");
    expect(v.nodes.size).toBeLessThanOrEqual(100);
    expect(v.focus.has(NS.demo + "Order")).toBe(true);
    v.setBudget(200);
    v.admit(s.individuals.slice(500, 650).map((i) => i.iri));
    for (const n of v.nodes.values()) n.pinned = true;
    expect(() => v.setBudget(100)).toThrow();
    expect(v.budget).toBe(200);
  });
  it.each(["force", "hierarchy", "radial", "grid"] as const)(
    "computes finite %s geometry",
    (mode) => {
      const s = buildStore(1000),
        v = new Viewport(s);
      v.seed([NS.pizza + "Margherita"]);
      const l = new Layouts(v, s);
      l.choice = mode;
      l.run();
      if (mode === "force") for (let i = 0; i < 10; i++) l.force.step();
      for (const n of v.nodes.values()) {
        expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      }
      for (const e of v.edges.values()) {
        expect(v.nodes.has(e.source) && v.nodes.has(e.target)).toBe(true);
      }
    },
  );
});
