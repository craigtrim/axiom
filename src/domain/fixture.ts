import data from "./data/pizza.json";
import { Store } from "./store";
import {
  NS,
  TYPE,
  SUBCLASS,
  SUBPROPERTY,
  THING,
  expand,
  local,
  parseRestriction,
  iriTerm,
  literal,
  type Kind,
  type Individual,
  type Customer,
} from "./model";
export const pizzaNames = data.pizzas.map((p) => local(expand(p.iri)));
export function buildTBox(store: Store) {
  if (store.entities.size) throw Error("The TBox has already been built.");
  const t = (s: string, p: string, o: string) =>
    store.tbox.push({ subject: s, predicate: p, object: iriTerm(o) });
  store.addEntity(THING, "Class").comment =
    "The universal class. Everything is a Thing.";
  for (const row of data.classes) {
    const iri = expand(row.iri),
      e = store.addEntity(iri, row.kind as Kind);
    e.parents = row.parents.map(expand);
    e.comment = row.comment;
    e.disjoint = row.disjoint.map(expand);
    for (const p of e.parents) t(iri, SUBCLASS, p);
    t(iri, TYPE, NS.owl + "Class");
    if (e.comment)
      store.tbox.push({
        subject: iri,
        predicate: NS.rdfs + "comment",
        object: literal(e.comment),
      });
    for (const d of e.disjoint) t(iri, NS.owl + "disjointWith", d);
    if (row.axioms.startsWith("EquivalentTo: "))
      e.equivalents = row.axioms.slice(14).split(" and ").map(parseRestriction);
    else if (row.axioms)
      e.restrictions = row.axioms
        .split("<br>")
        .map((s) => parseRestriction(s.replace("SubClassOf: ", "")));
    if (row.spiciness)
      e.restrictions.push(
        parseRestriction(row.spiciness.replace("SubClassOf: ", "")),
      );
  }
  for (const row of data.pizzas) {
    const iri = expand(row.iri),
      e = store.addEntity(iri, "Class"),
      tops = row.toppings.map(expand);
    e.parents = [NS.pizza + "NamedPizza"];
    e.comment = "A named pizza from the menu.";
    e.restrictions = tops.map((f) => ({
      shape: "restriction",
      property: NS.pizza + "hasTopping",
      quantifier: "some",
      fillers: [f],
    }));
    e.restrictions.push(
      {
        shape: "restriction",
        property: NS.pizza + "hasTopping",
        quantifier: "only",
        fillers: tops,
      },
      {
        shape: "restriction",
        property: NS.pizza + "hasCountryOfOrigin",
        quantifier: "value",
        fillers: [NS.pizza + "Italy"],
      },
    );
    t(iri, SUBCLASS, e.parents[0]);
    t(iri, TYPE, NS.owl + "Class");
  }
  for (const row of data.properties) {
    const iri = expand(row.iri),
      e = store.addEntity(iri, "ObjectProperty");
    if (row.parent) {
      e.parents = [expand(row.parent)];
      t(iri, SUBPROPERTY, e.parents[0]);
    }
    e.domain = row.domain ? expand(row.domain) : undefined;
    e.range = row.range ? expand(row.range) : undefined;
    e.inverse = row.inverse ? expand(row.inverse) : undefined;
    e.characteristics = row.characteristics;
    t(iri, TYPE, NS.owl + "ObjectProperty");
    if (e.domain) t(iri, NS.rdfs + "domain", e.domain);
    if (e.range) t(iri, NS.rdfs + "range", e.range);
  }
  for (const country of ["America", "England", "France", "Germany", "Italy"]) {
    const e = store.addEntity(NS.pizza + country, "Individual");
    e.types = [NS.pizza + "Country"];
    e.comment = "Named individual of pizza:Country.";
    t(e.iri, TYPE, e.types[0]);
  }
  for (const name of ["Hot", "Medium", "Mild"])
    store.entities.get(NS.pizza + name)!.valuePartition = true;
  for (const row of data.demoClasses) {
    const e = store.addEntity(expand(row.iri), "Class");
    e.parents = [THING];
    e.comment = row.comment;
    t(e.iri, SUBCLASS, THING);
  }
  for (const row of data.dataProperties) {
    const e = store.addEntity(expand(row.iri), "DataProperty");
    e.domain = expand(row.domain);
    e.range = expand(row.range);
    e.comment = row.comment;
    t(e.iri, TYPE, NS.owl + "DatatypeProperty");
  }
  const orderedBy = store.addEntity(NS.demo + "orderedBy", "ObjectProperty");
  orderedBy.domain = NS.demo + "Order";
  orderedBy.range = NS.demo + "Customer";
  orderedBy.comment =
    "Generated demo data. Links a produced pizza to its customer.";
  t(orderedBy.iri, TYPE, NS.owl + "ObjectProperty");
  store.rebuildSchema();
}
export function generate(n: number) {
  if (!Number.isInteger(n) || n < 0 || n > 1000000)
    throw Error("Invalid dataset size.");
  let state = 20250911;
  const rng = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const customers: Customer[] = [],
    individuals: Individual[] = [];
  for (let c = 0; c < Math.max(24, Math.floor(n / 8 + 0.5)); c++)
    customers.push({
      iri: NS.demo + "Customer_" + String(c + 1).padStart(6, "0"),
      name: pick(data.firstNames) + " " + pick(data.lastNames),
    });
  const pad = Math.max(6, String(n).length);
  for (let i = 0; i < n; i++) {
    const type = pick(pizzaNames),
      branch = pick(data.branches),
      price = (data.prices as Record<string, number>)[type] ?? 11;
    individuals.push({
      index: i,
      iri: NS.demo + "Pizza_" + String(i + 1).padStart(pad, "0"),
      type: NS.pizza + type,
      reference: "AX-" + String((100000 + i) % 1000000).padStart(6, "0"),
      branch,
      price: Math.floor((price + (rng() * 3 - 1)) * 100 + 0.5) / 100,
      timestamp: (1785542400 + Math.floor(rng() * 2592000)) * 1000,
      rating: Math.min(
        5,
        Math.max(1, 3 + Math.floor(rng() * 3) - (rng() < 0.12 ? 2 : 0)),
      ),
      customerIndex: Math.floor(rng() * customers.length),
    });
  }
  return { individuals, customers };
}
export function buildStore(n = 12000) {
  const store = new Store();
  buildTBox(store);
  const d = generate(n);
  store.loadGenerated(d.individuals, d.customers);
  return store;
}
