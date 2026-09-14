# Axiom — Data Model and Store

Purpose: specify the identity scheme, Entity and Individual record shapes, the three-tier data strategy, restriction encoding, adjacency, deterministic generation, mutation operations and scale characteristics of the Axiom Store.

**Status:** Normative

Requirement ID prefix owned by this document: `STORE`.

Related documents: [Architecture](10-architecture.md), [Viewport and Budget](20-graph-viewport-and-budget.md), [Class tree and inspector](30-class-tree-and-inspector.md), [Individuals table](31-individuals-table.md), [SPARQL console](32-sparql-console.md), [Pizza ontology fixture](62-pizza-ontology-fixture.md), [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md).

---

## 1. Scope and identity

**STORE-1** The **Store** is the single owner of all ontology content. No other module MUST hold ontology data, derive a second copy of it, or cache a projection of it that outlives a single operation.

**STORE-2** The Store holds two bodies of content, which MUST remain distinguishable at all times:

| Body | Namespace | Provenance | Mutability |
|------|-----------|-----------|------------|
| **TBox** | `pizza:` (with `owl:`, `rdf:`, `rdfs:` for the schema vocabulary) | The real Pizza ontology from co-ode.org. Class names, property names and axioms are taken from that ontology verbatim `[src: CLASS_SPEC]`. | Editable by the user: add class, rename, delete. |
| **ABox** and demo vocabulary | `demo:` | Generated demonstration data: a pizzeria order dataset, produced deterministically at a chosen size. Not part of the Pizza ontology. | Regenerated wholesale; individual records editable field by field. |

**STORE-3** Every Surface MUST label `demo:` content as generated demonstration data wherever it appears, and MUST NOT present it as part of the Pizza ontology `[src: renderInspector()]`. The reference build marks any Entity whose namespace is `demo` with a `generated demo data` chip in the inspector, and comments every generated record with `Generated demo individual.` `[src: resolve()]`.

**STORE-4** The identity of an **Entity** is its IRI, and only its IRI. Two records with the same IRI are the same Entity. Two records with different IRIs are different Entities even if their display labels are identical.

**STORE-5** A display label MUST NEVER be used as an identity. Labels are derived, mutable, non-unique and locale-facing. Every lookup, index key, edge endpoint, selection value and query binding MUST carry the full IRI.

**STORE-6** Renaming an Entity MUST change only its display name and MUST NOT change its IRI `[src: commitRename()]`. This is the practical consequence of STORE-4 and STORE-5, and it MUST be visible to the user: the inspector shows the full IRI beneath the display name at all times `[src: renderInspector()]`.

---

## 2. Namespaces and IRIs

### 2.1 The namespace table

**STORE-7** Exactly six namespaces MUST be defined, with exactly these IRIs `[src: NS]`:

| Key | Namespace IRI |
|-----|---------------|
| `pizza` | `http://www.co-ode.org/ontologies/pizza/pizza.owl#` |
| `demo` | `http://example.org/pizzeria#` |
| `rdf` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs` | `http://www.w3.org/2000/01/rdf-schema#` |
| `owl` | `http://www.w3.org/2002/07/owl#` |
| `xsd` | `http://www.w3.org/2001/XMLSchema#` |

**STORE-8** Exactly six display prefixes MUST be defined, in exactly this order `[src: PFX]`: `pizza:`, `demo:`, `rdf:`, `rdfs:`, `owl:`, `xsd:`. The order is significant to `shorten()` (STORE-11).

**STORE-9** Two predicate IRIs MUST be held as named constants because they are tested on hot paths `[src: RDF_TYPE, RDFS_SUBCLASS]`:

| Constant | Value |
|----------|-------|
| `RDF_TYPE` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` |
| `RDFS_SUBCLASS` | `http://www.w3.org/2000/01/rdf-schema#subClassOf` |

**STORE-10** IRI construction MUST go through namespace-specific helpers rather than string concatenation at call sites `[src: pz(), dm()]`. The reference build provides one helper per authoring namespace: `pz(name)` yields `pizza:` + name, `dm(name)` yields `demo:` + name.

### 2.2 Shortening

**STORE-11** `shorten(iri)` MUST produce a display form by the following algorithm `[src: shorten()]`:

```
1. shorten(u):
2.   if u is not a string: return the string form of u
3.   for each prefix p in PFX, in declaration order:
4.       if u starts with the namespace IRI of p:
5.           return p + (u with that namespace IRI removed)
6.   return "<" + u + ">"
```

**STORE-12** The fallback form for an unrecognised namespace MUST be the full IRI wrapped in angle brackets, never a bare IRI and never an elision `[src: shorten()]`. A user must be able to tell at a glance that a term is outside the known namespaces.

**STORE-13** Declaration order MUST be preserved because the algorithm returns on the first match. With the namespaces of STORE-7 no prefix is a proper prefix of another, so the order is not currently load-bearing; an implementation that adds a namespace MUST either preserve the no-overlap property or match longest-first.

Worked examples:

| Input IRI | `shorten()` output |
|-----------|--------------------|
| `http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita` | `pizza:Margherita` |
| `http://example.org/pizzeria#Pizza_000001` | `demo:Pizza_000001` |
| `http://www.w3.org/2002/07/owl#Thing` | `owl:Thing` |
| `http://www.w3.org/2001/XMLSchema#decimal` | `xsd:decimal` |
| `http://example.com/other#Foo` | `<http://example.com/other#Foo>` |

### 2.3 Local names

**STORE-14** `localName(iri)` MUST return the substring after the last `#` or `/`, whichever occurs later, and MUST return the whole input when neither is present `[src: localName()]`:

```
1. localName(u):
2.   i <- max(last index of "#" in u, last index of "/" in u)
3.   if i < 0: return u
4.   return u from index i+1 to the end
```

**STORE-15** `localName()` MUST NOT depend on the namespace table. It MUST work for an IRI in an unknown namespace, because it is used on generated identifiers and on query results that may bind arbitrary terms.

### 2.4 Label humanisation

**STORE-16** `humanise(name)` MUST convert a compact local name into readable text by exactly two substitutions, applied in this order `[src: humanise()]`:

```
1. humanise(n):
2.   insert a space between every lowercase letter or digit that is
3.     immediately followed by an uppercase letter
4.   replace every underscore with a space
5.   return the result
```

**STORE-17** Humanisation MUST be applied only for display, and MUST NOT be applied to values used for lookup, filtering keys, sorting keys that must match stored values, or export identifiers. The individuals table applies it to the type column only `[src: COLS]`.

Worked examples:

| Input | Output | Note |
|-------|--------|------|
| `PizzaTopping` | `Pizza Topping` | the common case |
| `AmericanHot` | `American Hot` | |
| `QuattroFormaggi` | `Quattro Formaggi` | |
| `PolloAdAstra` | `Pollo Ad Astra` | |
| `Pizza_000001` | `Pizza 000001` | underscore rule |
| `IRIValue` | `IRIValue` | a run of capitals is NOT split; the rule requires a lowercase or digit before the capital |
| `hasCountryOfOrigin` | `has Country Of Origin` | |

**STORE-18** The reference build's rule does not split runs of capitals. An implementation MUST either keep this behaviour or document the change; it MUST NOT silently alter labels that appear in [the fixture](62-pizza-ontology-fixture.md).

---

## 3. Entity kinds

**STORE-19** There MUST be exactly five Entity kinds, with exactly these identifiers `[src: KIND]`:

`class`, `defined`, `individual`, `objectProperty`, `dataProperty`.

**STORE-20** Each kind MUST carry exactly four pieces of presentation metadata: a display label, an icon identifier, a colour **Design token** name and a node shape `[src: KIND_META]`:

| Kind | Display label | Icon identifier | Colour token | Shape |
|------|---------------|-----------------|--------------|-------|
| `class` | Class | `i-class` | `--e-class` | rect |
| `defined` | Defined class | `i-defined` | `--e-defined` | rect |
| `individual` | Individual | `i-individual` | `--e-individual` | circle |
| `objectProperty` | Object property | `i-objprop` | `--e-objprop` | diamond |
| `dataProperty` | Data property | `i-dataprop` | `--e-dataprop` | hex |

**STORE-21** The kind metadata table MUST be the single source for every kind-indexed presentation decision: the graph legend, the node shape and fill in the Viewport, the tree row icon, the inspector heading chip, the status-bar selection read-out, the global search result badge and the export legend `[src: renderLegend(), nodePath(), renderTree(), renderInspector(), selectEntity(), wireGlobalSearch(), legendEntries()]`. No Surface MUST hard-code a kind label, icon or colour.

**STORE-22** A `defined` Entity is a class whose membership is stated by an equivalence axiom rather than only by assertion. It MUST be distinguished from `class` in every Surface, because the distinction is the point of the ontology `[src: buildTBox()]`. The reference build marks a class as `defined` exactly when its authoring row carries the `defined` flag.

**STORE-23** Colour tokens MUST resolve differently under the light and dark themes; see [Architecture](10-architecture.md#10-theme-system) for the token values.

**STORE-24** For the reference fixture, the kind census MUST be: 84 `class`, 11 `defined`, 9 `objectProperty`, 5 `dataProperty`, 5 `individual` — 114 Entities in total `[src: buildTBox()]`. See [the fixture document](62-pizza-ontology-fixture.md) for the full enumeration.

---

## 4. The Entity record

**STORE-25** An Entity record MUST have exactly the following fields. Fields marked *always present* MUST be initialised at creation `[src: addEntity()]`; fields marked *conditional* are attached only for the kinds that need them.

| Field | Type | Default | Presence | Meaning | Invariants |
|-------|------|---------|----------|---------|-----------|
| `iri` | IRI string | the creating argument | always | The identity. | MUST be non-empty. MUST equal the key under which the record is stored in the Entity map. MUST NEVER change after creation. |
| `name` | string | `localName(iri)` | always | Display name. | MUST be unique across all Entities as a matter of validation on rename and creation `[src: validateName()]`, but uniqueness is NOT enforced for names minted at build time. |
| `kind` | one of the five kinds | the creating argument | always | Entity kind. | MUST be one of STORE-19. MAY be overwritten by a later creation call carrying a non-empty kind, which is how the reference build upgrades a placeholder `[src: addEntity()]`. |
| `parents` | array of IRI | `[]` | always | Direct superclasses, or direct superproperties for a property. | Every member SHOULD resolve to an Entity. A class with no parents other than the universal class MUST carry exactly `owl:Thing`. The reference build permits multiple parents and uses one everywhere. |
| `children` | array of IRI | `[]` | always | Inverse of `parents`, maintained explicitly. | MUST contain exactly the IRIs of Entities that name this Entity in their `parents`. MUST be sorted ascending by local name `[src: buildTBox()]`. MUST NOT contain duplicates. |
| `restrictions` | array of normalised restriction records | `[]` | always | Asserted necessary conditions — the `rdfs:subClassOf` side. | Shapes fixed by [section 8](#8-restriction-encoding). |
| `equivalents` | array of normalised restriction records | `[]` | always | Asserted necessary and sufficient conditions — the `owl:equivalentClass` side. | Non-empty only for Entities of kind `defined`. |
| `disjointWith` | array of IRI | `[]` | always | Classes asserted disjoint from this one. | Disjointness is symmetric in OWL; the reference build materialises it in both directions only where the authoring table states both `[src: CLASS_SPEC]`. |
| `domainOf` | array | `[]` | always | Reserved. | **Never written and never read in the reference build** `[src: addEntity()]`. An implementation MUST either populate and use it or omit it; it MUST NOT ship as dead weight on every record. |
| `rangeOf` | array | `[]` | always | Reserved. | Same status as `domainOf`. |
| `chars` | array of string | `[]` | always | Property characteristics. | Members MUST be drawn from `Transitive`, `Functional`, `InverseFunctional` for the reference fixture `[src: OBJ_PROPS]`. Empty for classes. |
| `comment` | string | `''` | always | The `rdfs:comment` annotation. | Rendered verbatim in the inspector's Annotations section `[src: renderInspector()]`. |
| `ns` | `'demo'` or `'pizza'` | derived: `'demo'` when the IRI begins with the `demo:` namespace, otherwise `'pizza'` | always | Provenance band, used to mark generated content. | MUST be recomputed if the IRI ever changes, which STORE-25 forbids. Note that `owl:`, `rdf:`, `rdfs:` and `xsd:` Entities are classified `'pizza'` by this rule `[src: addEntity()]`. |
| `domain` | IRI or `null` | absent | conditional: properties | `rdfs:domain`. | Present only on object and data properties. |
| `range` | IRI or `null` | absent | conditional: properties | `rdfs:range`. For a data property this is an `xsd:` datatype IRI, not a class IRI `[src: buildTBox()]`. | The inspector MUST render an `xsd:` range as plain text and a class range as a link `[src: renderInspector()]`. |
| `inverse` | IRI or `null` | absent | conditional: object properties | `owl:inverseOf`. | Where present on both sides, the two records MUST name each other. |
| `types` | array of IRI | absent | conditional: named individuals | `rdf:type` assertions for a TBox-level named individual. | Present on the five country individuals `[src: buildTBox()]`. |
| `isValuePartition` | boolean | absent | conditional | Marks the three spiciness individuals. | **Written but never read in the reference build** `[src: buildTBox()]`. |

**STORE-26** `addEntity(iri, kind, extra)` MUST be get-or-create, not create-only `[src: addEntity()]`:

```
1. addEntity(u, kind, extra):
2.   e <- entity map lookup of u
3.   if e is absent:
4.       e <- a new record with all "always present" fields at their defaults
5.       store e in the entity map under key u
6.   if kind is provided and non-empty: e.kind <- kind
7.   if extra is provided: copy every field of extra onto e, overwriting
8.   return e
```

**STORE-27** Get-or-create semantics are required because the build order names some Entities before it defines them — a class is referenced as a disjointness target or a restriction filler before its own authoring row is reached `[src: buildTBox()]`. An implementation MUST NOT replace this with create-only plus a forward-declaration pass unless it can show the result is identical.

**STORE-28** Child links MUST be derived from parent lists in a single pass after every Entity exists, and MUST then be sorted by local name `[src: buildTBox()]`. They MUST NOT be maintained incrementally during construction, because a parent may not yet exist when a child declares it.

**STORE-29** After construction, the child-link invariant MUST hold: for every Entity `e` and every `p` in `e.parents`, the Entity at `p` has `e.iri` in its `children`, exactly once. Every mutation in [section 12](#12-store-mutation-operations) MUST restore this invariant before returning.

---

## 5. The Store object

**STORE-30** The Store MUST have exactly the following fields `[src: store]`. The field named `rbox` is created by `buildRBox()` rather than declared in the initial literal `[src: store, buildRBox()]`; an implementation MUST declare it up front so that the Store has one fixed shape.

| Field | Exact shape | Initial value | Meaning |
|-------|-------------|---------------|---------|
| `ent` | Map from IRI string to Entity record | empty map | Every Entity in the TBox and the `demo:` vocabulary. Does NOT contain generated Individuals or generated customers. |
| `tbox` | Array of triples `[subject, predicate, object]`, where `subject` and `predicate` are IRI strings and `object` is either an IRI string or a literal record | empty array | The materialised schema triples. |
| `rbox` | Array of triples `[subject, predicate, object]`, all three IRI strings | empty array | Flattened existential and value restrictions. Derived from `ent`; never authored. |
| `inds` | Array of Individual records | empty array | The compact ABox. Ordered by generation index. |
| `indIndex` | Map from IRI string to Individual record | empty map | IRI lookup over `inds`. |
| `byType` | Map from class IRI string to array of Individual records | empty map | Type lookup over `inds`. |
| `customers` | Array of customer records `{ iri, name }` | empty array | Generated customers. Positional: a record's `cust` field is an index into this array. |
| `generatedCount` | integer | `0` | The Individual count last requested from the generator. |
| `version` | integer | `0` | Monotonic counter bumped on every ABox mutation; the invalidation key for version-stamped caches. |

**STORE-31** A literal object MUST have exactly two fields `[src: lit()]`:

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `lit` | string, number or boolean | required | The lexical or native value. |
| `dt` | string | `'string'` | The datatype local name: one of `string`, `decimal`, `dateTime`, `integer` in the reference fixture. |

**STORE-32** A term MUST be recognisable as a literal by structural test, not by type inspection: a term is a literal exactly when it is a non-null object carrying a `lit` field `[src: isLit()]`.

**STORE-33** An Individual record MUST have exactly the following fields `[src: generateIndividuals()]`:

| Field | Type | Meaning | Invariants |
|-------|------|---------|-----------|
| `i` | integer | Generation index. | MUST equal the record's position in `inds`. |
| `iri` | IRI string | Identity, in the `demo:` namespace. | MUST be `demo:Pizza_` followed by `i + 1` zero-padded to the padding width (STORE-126). MUST be unique. |
| `type` | IRI string | The `rdf:type` object: a `pizza:` named-pizza class IRI. | MUST be a key of `ent`. |
| `typeName` | string | Local name of `type`. | MUST equal `localName(type)`. Held denormalised because the table sorts and filters on it. |
| `ref` | string | Human-readable order reference. | Form `AX-` followed by six digits (STORE-128). |
| `branch` | string | Branch that produced the pizza. | MUST be a member of the branch table `[src: BRANCHES]`. |
| `price` | number | Price in pounds sterling. | MUST be non-negative and MUST be rounded to two decimal places. |
| `ts` | integer | Preparation timestamp, in milliseconds since the Unix epoch. | |
| `rating` | integer | Customer rating. | MUST lie in the closed range 1 to 5. |
| `cust` | integer | Index into `customers`. | MUST satisfy `0 ≤ cust < customers.length`. |

**STORE-34** A customer record MUST have exactly two fields: `iri` (an IRI in the `demo:` namespace of the form `demo:Customer_` plus a six-digit zero-padded ordinal) and `name` (a display name) `[src: generateIndividuals()]`.

### 5.1 Invariants between Store fields

**STORE-35** The following invariants MUST hold at every point at which control returns to the frame loop. Each is checkable in linear time and SHOULD be asserted in a debug build.

| # | Invariant | Rationale |
|---|-----------|-----------|
| 1 | `indIndex.size == inds.length` | Every Individual is reachable by IRI. |
| 2 | For every `rec` in `inds`: `indIndex[rec.iri] === rec` — identity, not equality | The index holds references, not copies; a cell edit through the table must be visible through the index. |
| 3 | For every `rec` in `inds`: `byType[rec.type]` contains `rec` exactly once | The by-type bucket is the instance list the tree, inspector and Viewport all read. |
| 4 | The sum of all `byType` bucket lengths equals `inds.length` | No Individual is orphaned or double-counted. |
| 5 | For every `k`: `inds[k].i == k` | The table's default sort key is the generation index, and it is used as an array position. |
| 6 | For every `rec`: `0 ≤ rec.cust < customers.length` | Dereferencing `customers[rec.cust]` must not fail. |
| 7 | Every key of `byType` is a key of `ent` | A type with no Entity would render with no label, icon or colour. |
| 8 | Every `iri` in `inds` is absent from `ent` | Generated Individuals are deliberately not Entities; `resolve()` depends on the disjointness (see [section 10](#10-entity-resolution)). |
| 9 | Every customer `iri` is absent from both `ent` and `indIndex` | Same reason. |
| 10 | `rbox` contains no triple whose subject is absent from `ent` | `rbox` is derived from `ent` and MUST be rebuilt whenever `ent` changes structurally. |
| 11 | `version` strictly increases across every ABox mutation | Version-stamped caches (STORE-64) rely on it. |

**STORE-36** `generatedCount` MUST equal `inds.length`. The reference build sets `generatedCount` only inside the generator, so adding an Individual through the dialog leaves the two out of step `[src: generateIndividuals(), newIndividualDialog()]`. An implementation MUST either maintain the invariant or remove the field. **Status:** specified, not implemented in the reference build.

**STORE-37** The Store MUST hold an IRI index over `customers`, symmetrical with `indIndex`. The reference build has none: every customer lookup is a linear scan of the customer array, performed inside `resolve()`, `labelOf()`, `neighboursOf()` and `scan()` `[src: resolve(), labelOf(), neighboursOf(), scan()]`. At 12,500 customers this is up to 12,500 string comparisons per call, and `scan()` performs it per matching triple. **Status:** specified, not implemented in the reference build.

---

## 6. The three-tier data strategy

This section is the central idea of the product. It states why the workbench can hold 100,000 Individuals and still answer a query and draw a frame without hesitation: the three bodies of content have different sizes and different access patterns, and are therefore stored in three different ways.

**STORE-38** Ontology content MUST be stored in exactly three tiers. A single uniform triple store MUST NOT be used, because doing so would make the smallest body of content and the largest body of content pay the same per-statement cost.

| Tier | Content | Representation | Size for the reference fixture |
|------|---------|----------------|--------------------------------|
| 1 | TBox: the schema | Materialised as triples in an array | 239 triples over 114 Entities `[src: buildTBox()]` |
| 2 | Flattened restrictions | Materialised as triples in a derived array | 140 triples `[src: buildRBox()]` |
| 3 | ABox: the generated Individuals | **Never materialised as triples.** A compact record array with indexes, plus a virtual triple source | 0 triples stored; 12,000 records plus 1,500 customer records at the default size |

### 6.1 Tier 1 — the TBox is materialised because it is small

**STORE-39** The TBox MUST be materialised as an array of triples at build time `[src: buildTBox(), T()]`.

**STORE-40** The following triples MUST be emitted, and only these `[src: buildTBox()]`:

| Source | Triples emitted |
|--------|-----------------|
| Each authored class row | `<class> rdfs:subClassOf <parent>`; `<class> rdf:type owl:Class`; and, when a comment is authored, `<class> rdfs:comment "<comment>"` |
| Each authored disjointness | `<class> owl:disjointWith <other>` |
| Each named pizza | `<pizza> rdfs:subClassOf pizza:NamedPizza`; `<pizza> rdf:type owl:Class` |
| Each object property | when a superproperty is authored, `<prop> rdfs:subPropertyOf <super>`; `<prop> rdf:type owl:ObjectProperty`; when a domain is authored, `<prop> rdfs:domain <class>`; when a range is authored, `<prop> rdfs:range <class>` |
| Each country individual | `<country> rdf:type pizza:Country` |
| Each demo class | `<class> rdfs:subClassOf owl:Thing` |
| Each demo data property | `<prop> rdf:type owl:DatatypeProperty` |
| The demo object property | `demo:orderedBy rdf:type owl:ObjectProperty` |

**STORE-41** Restrictions, equivalences and property characteristics MUST NOT be emitted as TBox triples. They live only on the Entity record (`restrictions`, `equivalents`, `chars`), because expressing them as triples would require blank nodes, and blank-node paths are exactly what tier 2 exists to avoid `[src: buildTBox(), buildRBox()]`.

**STORE-42** The materialisation is affordable because the TBox is 239 triples and does not grow with the dataset. Its memory cost is under 100 KB and its build cost is under 5 ms, both constant regardless of the chosen Individual count.

**Consequences of tier 1:**

| Property | Figure |
|----------|--------|
| Triple count | 239, fixed `[src: buildTBox()]` |
| Entity count | 114, fixed |
| Memory | approximately 3.7 MB in the reference runtime, for the Entity map, the TBox array and the authoring tables together — measured after construction with the ABox empty |
| Build time | under 5 ms |
| Scan cost, bound subject | linear in 239 — the reference build performs no subject index over the TBox array `[src: scan()]` |

**STORE-43** An implementation SHOULD index the TBox array by subject and by predicate. At 239 triples a linear scan is acceptable, but `scan()` walks the whole array once per triple pattern per solution, so the cost multiplies with query complexity `[src: scan(), evaluate()]`.

### 6.2 Tier 2 — restrictions are flattened so queries need no blank-node walking

**STORE-44** Existential (`some`) and value (`value`) restrictions MUST be flattened into direct triples, held in a derived array separate from the TBox array `[src: buildRBox()]`:

```
1. buildRBox():
2.   rbox <- empty array
3.   for each Entity e in the entity map:
4.       for each restriction r in (e.restrictions concatenated with e.equivalents):
5.           if r.kind is not "restriction": skip
6.           if r has no property: skip
7.           if r.q is neither "some" nor "value": skip
8.           for each target t in restrictionTargets(r):
9.               append [e.iri, r.prop, t] to rbox
```

**STORE-45** The purpose is exact and MUST be preserved: a query MUST be able to match `pizza:Margherita pizza:hasTopping pizza:MozzarellaTopping` as a single triple pattern, without walking an `owl:Restriction` blank node through `owl:onProperty` and `owl:someValuesFrom` `[src: buildRBox()]`. Blank-node path walking would make every topping query a three-pattern join, and would make the console's example queries unreadable.

**STORE-46** Universal (`only`), cardinality (`min`, `max`) and negation (`not`) restrictions MUST NOT be flattened. Flattening them would assert something the ontology does not say: `only` is a closure axiom, not an assertion of membership, and flattening it would make `pizza:Margherita pizza:hasTopping pizza:TomatoTopping` indistinguishable from a claim that no other topping is possible `[src: buildRBox()]`.

**STORE-47** `rbox` MUST be rebuilt, never patched, after any change to any Entity's restrictions or equivalents `[src: deleteSelected()]`. It is derived state.

**Consequences of tier 2:**

| Property | Figure |
|----------|--------|
| Triple count | 140 for the reference fixture `[src: buildRBox()]` |
| Composition | 103 `hasTopping some <topping>` triples across the 22 named pizzas; 22 `hasCountryOfOrigin value pizza:Italy` triples on the named pizzas; 2 on the Italian cheese toppings; 6 `hasSpiciness some <spiciness>` triples; 1 `hasBase some pizza:PizzaBase`; 6 from the defined classes' equivalence axioms |
| Memory | under 30 KB |
| Build time | under 2 ms |
| Growth | none with dataset size; grows only with the TBox |

### 6.3 Tier 3 — the ABox is never materialised

**STORE-48** The ABox MUST NOT be materialised as triples, at any dataset size, for any purpose. Individuals MUST live in a compact record array with three indexes, and triples MUST be produced on demand by a virtual triple source `[src: store, scan()]`.

**STORE-49** The virtual triple source MUST be a generator: it MUST yield matching triples one at a time and MUST NOT build an intermediate collection `[src: scan()]`. This is what allows the solution cap to stop a runaway query without having paid for the triples beyond the cap.

**STORE-50** `scan(subject, predicate, object)` MUST accept a null in any position meaning "unbound", and MUST yield every matching triple from four sources, in exactly this order `[src: scan()]`:

```
1.  scan(s, p, o):
2.    // Source 1: static triples — TBox then flattened restrictions
3.    for each array A in [tbox, rbox]:
4.        for each triple t in A:
5.            if s is bound and t.subject   != s: skip
6.            if p is bound and t.predicate != p: skip
7.            if o is bound and not termEq(t.object, o): skip
8.            yield t
9.
10.   // Source 2: rdf:type over generated content
11.   if p is rdf:type or p is unbound:
12.       if s is bound:
13.           rec <- indIndex[s];  if rec exists and (o unbound or o == rec.type):
14.               yield [s, rdf:type, rec.type]
15.           c <- customer with iri s;  if c exists and (o unbound or o == demo:Customer):
16.               yield [s, rdf:type, demo:Customer]
17.       else if o is bound:
18.           bucket <- byType[o];  for each rec in bucket: yield [rec.iri, rdf:type, o]
19.           if o == demo:Customer: for each c in customers: yield [c.iri, rdf:type, demo:Customer]
20.           if o == demo:Order:    for each rec in inds:   yield [rec.iri, rdf:type, demo:Order]
21.       else:
22.           for each rec in inds:  yield [rec.iri, rdf:type, rec.type]
23.           for each c in customers: yield [c.iri, rdf:type, demo:Customer]
24.
25.   // Source 3: demo data and object properties, via the predicate function table
26.   preds <- if p bound then (p in DEMO_PRED ? [p] : []) else all keys of DEMO_PRED
27.   for each pred in preds:
28.       fn <- DEMO_PRED[pred]
29.       if s is bound:
30.           rec <- indIndex[s];  if absent: continue
31.           v <- fn(rec);  if v is not null and (o unbound or termEq(v, o)): yield [s, pred, v]
32.       else:
33.           for each rec in inds:
34.               v <- fn(rec);  if v is null: continue
35.               if o is bound and not termEq(v, o): continue
36.               yield [rec.iri, pred, v]
37.
38.   // Source 4: customer labels
39.   if p is rdfs:label or p is unbound:
40.       if s is bound:
41.           c <- customer with iri s;  if c exists and (o unbound or termEq(lit(c.name), o)):
42.               yield [s, rdfs:label, lit(c.name)]
43.       else:
44.           for each c in customers:
45.               v <- lit(c.name)
46.               if o is bound and not termEq(v, o): continue
47.               yield [c.iri, rdfs:label, v]
```

**STORE-51** The predicate function table MUST map each `demo:` predicate IRI to a pure function from an Individual record to a term `[src: DEMO_PRED]`:

| Predicate | Function of the record | Result term |
|-----------|------------------------|-------------|
| `demo:orderRef` | `ref` | literal, datatype `string` |
| `demo:branch` | `branch` | literal, datatype `string` |
| `demo:priceGBP` | `price` | literal, datatype `decimal` |
| `demo:preparedAt` | `ts`, converted to an ISO 8601 instant in UTC | literal, datatype `dateTime` |
| `demo:rating` | `rating` | literal, datatype `integer` |
| `demo:orderedBy` | `customers[cust].iri`, or null when the index does not resolve | IRI, or no triple |

**STORE-52** The predicate function table MUST be the single place a `demo:` predicate is defined. Adding a generated field is then one table row, and every consumer — the console, the inspector, the triple count — follows `[src: DEMO_PRED]`.

**STORE-53** A function that returns null MUST yield no triple. Absence is modelled by omission, never by a null object `[src: scan()]`.

**STORE-54** Term equality MUST be reference equality for IRIs and lexical-form equality for literals, comparing the string form of the values and ignoring the datatype `[src: termEq()]`:

```
1. termEq(a, b):
2.   if a === b: return true
3.   if a is a literal and b is a literal: return stringOf(a.lit) == stringOf(b.lit)
4.   return false
```

**STORE-55** Ignoring the datatype in literal comparison is a deliberate simplification of the reference build and MUST be documented as such: `"5"^^xsd:integer` and `"5"^^xsd:string` compare equal `[src: termEq()]`. An implementation that tightens this MUST re-verify the console's example queries.

**Consequences of tier 3, measured on the reference runtime:**

| Individuals | Records + indexes in memory | Same content materialised as triples | Saving |
|-------------|-----------------------------|--------------------------------------|--------|
| 1,000 | 0.42 MB | approximately 1.1 MB | 2.6× |
| 12,000 | 4.87 MB | approximately 12.6 MB | 2.6× |
| 50,000 | 20.19 MB | approximately 52.5 MB | 2.6× |
| 100,000 | 40.00 MB | 100.4 MB, measured | 2.5× |

Measurement method: heap in use after a forced collection, with the TBox and flattened restrictions already built, minus the 3.72 MB baseline. The materialised figure is the measured cost of building the same 725,000 triples as three-element arrays with literal objects, and excludes any triple index. A conventional subject–predicate–object plus predicate–object–subject index pair would roughly triple that figure again.

**STORE-56** Time consequences of tier 3 MUST be understood as follows, and an implementation MUST preserve the asymptotic shape even if constants differ.

| Access pattern | Complexity | Measured at 100,000 Individuals |
|----------------|-----------|--------------------------------|
| Bound subject, any predicate | O(1) index lookup plus the fixed seven predicate functions | under 0.5 ms `[src: scan()]` |
| Unbound subject, `rdf:type` bound object | O(size of the type bucket) | 0.6 ms for 4,550 matches `[src: scan()]` |
| Unbound subject, bound `demo:` predicate | O(number of Individuals) | 8.9 ms for 100,000 yields `[src: scan()]` |
| Fully unbound | O(number of Individuals × 7) | proportional; bounded by the solution cap |
| Type bucket size lookup | O(1) | under 0.01 ms |

**STORE-57** The cost of the ABox MUST be linear in the number of Individuals for a full scan and constant for an indexed lookup. It MUST NEVER be linear in the triple count, because the triple count is seven times larger and does not exist.

---

## 7. Triple count accounting

**STORE-58** The reported triple count MUST be computed arithmetically from array lengths. Triples MUST NOT be enumerated to count them `[src: tripleCount()]`:

```
1. tripleCount():
2.   return |tbox| + 7 * |inds| + 2 * |customers|
```

**STORE-59** The per-Individual count MUST be exactly 7, being one triple for each of `[src: scan(), DEMO_PRED]`:

| # | Triple |
|---|--------|
| 1 | `<individual> rdf:type <its named-pizza class>` |
| 2 | `<individual> demo:orderRef "<ref>"` |
| 3 | `<individual> demo:branch "<branch>"` |
| 4 | `<individual> demo:priceGBP "<price>"^^decimal` |
| 5 | `<individual> demo:preparedAt "<instant>"^^dateTime` |
| 6 | `<individual> demo:rating "<rating>"^^integer` |
| 7 | `<individual> demo:orderedBy <customer>` |

**STORE-60** The per-customer count MUST be exactly 2 `[src: scan()]`:

| # | Triple |
|---|--------|
| 1 | `<customer> rdf:type demo:Customer` |
| 2 | `<customer> rdfs:label "<name>"` |

**STORE-61** These triples are counted rather than stored because they are fully determined by the record. Every one of the nine is a pure function of a record field plus a constant predicate; storing them would store the same information a second time in a form that is 2.5 times larger and no faster to read. The count is the honest size of the graph the console can query; the records are the honest cost of holding it.

**STORE-62** The reported count MUST include the flattened restriction array. The reference build omits it, so the reported figure understates the queryable graph by exactly 140 triples at every dataset size `[src: tripleCount(), buildRBox()]`. **Status:** specified, not implemented in the reference build.

**STORE-63** The three Store census functions MUST be:

| Function | Definition | Value for the reference fixture |
|----------|-----------|--------------------------------|
| `classCount()` | count of Entities whose kind is `class` or `defined` `[src: classCount()]` | 95 |
| `propCount()` | count of Entities whose kind is `objectProperty` or `dataProperty` `[src: propCount()]` | 14 |
| `individualCount()` | `|inds| + |customers| + 5`, where 5 is the fixed size of the country table `[src: individualCount()]` | 13,505 at the default size |

**STORE-64** `individualCount()` MUST count Entities of kind `individual` rather than adding the fixed size of the country table. The reference build hard-codes the constant, so a named individual added to the TBox would not be counted `[src: individualCount()]`. **Status:** specified, not implemented in the reference build.

**STORE-65** The dataset menu's triple-count labels are hand-authored approximations and MUST NOT be treated as computed values. They overstate by between 5 % and 10 % `[src: scaleMenu]`:

| Menu label | Menu's stated triple count | Computed triple count | Overstatement |
|------------|---------------------------|----------------------|---------------|
| 1,000 pizzas | ~8K | 7,489 | +6.8 % |
| 12,000 pizzas | ~92K | 87,239 | +5.5 % |
| 50,000 pizzas | ~383K | 362,739 | +5.6 % |
| 100,000 pizzas | ~766K | 725,239 | +5.6 % |

**STORE-66** Menu labels MUST be derived from the same arithmetic as the read-out, so the two can never disagree. **Status:** specified, not implemented in the reference build.

---

## 8. Restriction encoding

### 8.1 The normalised restriction record

**STORE-67** Every restriction and every equivalence component MUST be normalised into exactly one of three record shapes at build time `[src: normRestriction()]`:

| Record kind | Fields | Meaning |
|-------------|--------|---------|
| `class` | `kind = 'class'`, `filler` (IRI) | A bare named class used as a conjunct of an equivalence axiom. |
| `not` | `kind = 'not'`, `filler` (IRI) | The complement of a named class. |
| `restriction` | `kind = 'restriction'`, `prop` (IRI), `q` (quantifier), `filler` (IRI, array of IRI, or null), `n` (integer or null) | A property restriction. |

**STORE-68** Normalisation MUST accept exactly three authoring forms and MUST map them as follows `[src: normRestriction()]`:

```
1. normRestriction(r):
2.   if r has one element:            return { kind: 'class', filler: pizza:(r[0]) }
3.   if r[0] == 'not':                return { kind: 'not',   filler: pizza:(r[1]) }
4.   let [p, q, f, n] = r
5.   return { kind:   'restriction',
6.            prop:   pizza:(p),
7.            q:      q,
8.            filler: f is null       ? null
9.                  : f is an array   ? each element mapped to pizza:
10.                                   : pizza:(f),
11.           n:      n is null ? null : n }
```

**STORE-69** Normalisation MUST be total: every authoring row MUST produce a record, and no row MUST produce a partially populated record. Absence MUST be represented by an explicit null, never by a missing field, so that the rendering and target-extraction rules can test for it.

**STORE-70** Every name in an authoring row is resolved into the `pizza:` namespace unconditionally `[src: normRestriction()]`. A restriction over a `demo:` property or filler is therefore inexpressible in the reference build. An implementation MUST accept a namespace-qualified authoring form. **Status:** specified, not implemented in the reference build.

### 8.2 Quantifiers

**STORE-71** Exactly five quantifiers MUST be supported `[src: CLASS_SPEC, restrictionText()]`:

| Quantifier | OWL construct | `filler` | `n` | Example from the fixture |
|-----------|---------------|----------|-----|--------------------------|
| `some` | `owl:someValuesFrom` — existential | a single IRI | null | `pizza:Pizza ⊑ pizza:hasBase some pizza:PizzaBase` |
| `only` | `owl:allValuesFrom` — universal | a single IRI, or an array of IRIs meaning their union | null | `pizza:Margherita ⊑ pizza:hasTopping only (pizza:MozzarellaTopping or pizza:TomatoTopping)` |
| `value` | `owl:hasValue` — a named individual filler | a single IRI naming an individual | null | `pizza:MozzarellaTopping ⊑ pizza:hasCountryOfOrigin value pizza:Italy` |
| `min` | `owl:minQualifiedCardinality` | a single IRI | the cardinality | `pizza:InterestingPizza ≡ pizza:Pizza ⊓ pizza:hasTopping min 3 pizza:PizzaTopping` |
| `max` | `owl:maxCardinality`, unqualified | null | the cardinality | `pizza:Pizza ⊑ pizza:hasCountryOfOrigin max 1` |

**STORE-72** The `max` quantifier in the reference fixture is unqualified: it carries a null filler and a cardinality only `[src: CLASS_SPEC]`. The rendering rule depends on this and MUST be preserved.

### 8.3 Rendering to text

**STORE-73** `restrictionText(r)` MUST produce Manchester-syntax-like text by exactly the following ordered rules. The first matching rule wins `[src: restrictionText()]`:

| # | Condition | Output |
|---|-----------|--------|
| 1 | `kind == 'class'` | `shorten(filler)` |
| 2 | `kind == 'not'` | `not ` followed by `shorten(filler)` |
| 3 | `q == 'value'` | `shorten(prop)` + ` value ` + `shorten(filler)` |
| 4 | `q == 'max'` and `filler` is null | `shorten(prop)` + ` max ` + `n` |
| 5 | `filler` is an array | `shorten(prop)` + ` only (` + each filler shortened, joined by ` or ` + `)` |
| 6 | `n` is not null | `shorten(prop)` + ` ` + `q` + ` ` + `n` + ` ` + `shorten(filler)` |
| 7 | otherwise | `shorten(prop)` + ` ` + `q` + ` ` + `shorten(filler)` |

**STORE-74** Rule 5 hard-codes the word `only` irrespective of the quantifier, because in the reference fixture an array filler occurs only with `only` `[src: restrictionText()]`. An implementation MUST emit the actual quantifier. **Status:** specified, not implemented in the reference build.

Worked examples, verified against the fixture `[src: restrictionText()]`:

| Entity and side | Rendered text |
|-----------------|---------------|
| `pizza:Pizza`, subclass | `pizza:hasBase some pizza:PizzaBase` and `pizza:hasCountryOfOrigin max 1` |
| `pizza:MozzarellaTopping`, subclass | `pizza:hasCountryOfOrigin value pizza:Italy` |
| `pizza:Margherita`, subclass | `pizza:hasTopping some pizza:MozzarellaTopping`; `pizza:hasTopping some pizza:TomatoTopping`; `pizza:hasTopping only (pizza:MozzarellaTopping or pizza:TomatoTopping)`; `pizza:hasCountryOfOrigin value pizza:Italy` |
| `pizza:VegetarianPizza`, equivalent | `pizza:Pizza`; `pizza:hasTopping only pizza:VegetarianTopping` |
| `pizza:InterestingPizza`, equivalent | `pizza:Pizza`; `pizza:hasTopping min 3 pizza:PizzaTopping` |
| `pizza:RealItalianPizza`, equivalent | `pizza:Pizza`; `pizza:hasCountryOfOrigin value pizza:Italy`; `pizza:hasBase only pizza:ThinAndCrispyBase` |
| `pizza:NonVegetarianPizza`, equivalent | `pizza:Pizza`; `not pizza:VegetarianPizza` |
| `pizza:CheeseyVegetableTopping`, equivalent | `pizza:CheeseTopping`; `pizza:VegetableTopping` |

**STORE-75** Rendered restriction text MUST be presented with every IRI it names turned into an activatable link back into the selection bus. The inspector achieves this by substituting each shortened target, and then the shortened property, with a link `[src: renderInspector()]`. Because the substitution is textual, an implementation SHOULD render from the record rather than post-processing the string.

### 8.4 Target extraction

**STORE-76** `restrictionTargets(r)` MUST return the IRIs a restriction record points at, as a list `[src: restrictionTargets()]`:

```
1. restrictionTargets(r):
2.   if r.filler is absent or null: return empty list
3.   if r.filler is an array:       return r.filler
4.   return [ r.filler ]
```

**STORE-77** Target extraction MUST work uniformly for all three record kinds. A `class` record yields its named class; a `not` record yields the complemented class; a `restriction` record yields its filler or fillers, and yields nothing for an unqualified `max` `[src: restrictionTargets()]`.

**STORE-78** Target extraction MUST be the single source of restriction-derived edges. It is consumed by the reverse restriction index, by adjacency, by the flattened restriction builder and by the inspector's link substitution `[src: buildReverseIndex(), neighboursOf(), buildRBox(), renderInspector()]`. A fifth consumer MUST NOT re-derive the same set.

---

## 9. Adjacency

**STORE-79** `neighboursOf(iri)` MUST be the single source of graph adjacency for the entire product `[src: neighboursOf()]`. No module MUST derive an edge from the Store by any other route.

**STORE-80** Adjacency MUST be computed on demand. There MUST NOT be a materialised adjacency list, because the degree of a class is the size of its instance bucket, and that can be 100,000.

**STORE-81** `neighboursOf(iri)` MUST return a record with exactly two fields `[src: neighboursOf()]`:

| Field | Type | Meaning |
|-------|------|---------|
| `list` | array of `{ iri, pred, dir }` | The neighbours, **capped**. |
| `total` | integer | The **true degree**, uncapped. |

**STORE-82** The cap MUST be 4,000 neighbours `[src: NEIGHBOUR_CAP]`.

**STORE-83** The accumulator MUST increment `total` for every neighbour it finds, and MUST append to `list` only while the list is below the cap `[src: neighboursOf()]`:

```
1. add(target, predicate, direction):
2.   total <- total + 1
3.   if |list| < NEIGHBOUR_CAP:
4.       append { iri: target, pred: predicate, dir: direction } to list
```

**STORE-84** `total` MUST be the true degree even when `list` is capped. This is not a nicety: the **Hidden neighbour** count shown on every node in the Viewport is `true degree minus shown degree` `[src: hiddenNeighbours()]`, the node radius is a function of the true degree `[src: nodeRadius()]`, and the context menu offers to expand only when the hidden count is positive `[src: wireCanvas()]`. A capped total would silently understate all three and would tell the user a node has no more neighbours when it has 96,000.

**STORE-85** `dir` MUST be `'out'` when the queried IRI is the subject of the relationship and `'in'` when it is the object. The Viewport uses this to orient the edge when it creates one `[src: linkNode()]`.

### 9.1 Dispatch

**STORE-86** `neighboursOf()` MUST dispatch on the nature of the IRI, in exactly this order, returning early in the first two cases `[src: neighboursOf()]`:

| Order | Test | Behaviour |
|-------|------|-----------|
| 1 | The IRI is a key of the Individual IRI index | Emit the generated-Individual edge set and return. |
| 2 | The IRI names a generated customer | Emit the generated-customer edge set and return. |
| 3 | The IRI is a key of the Entity map | Emit the full Entity edge set. |
| 4 | None of the above | Return an empty list and a total of zero. |

**STORE-87** Cases 1 and 2 MUST return early. A generated Individual has no Entity record, so falling through would produce an empty result and lose its type and customer edges.

### 9.2 Edge sources for a generated Individual

**STORE-88** A generated Individual MUST contribute exactly these edges `[src: neighboursOf()]`:

| # | Target | Predicate | Direction | Condition |
|---|--------|-----------|-----------|-----------|
| 1 | the record's type | `rdf:type` | out | always |
| 2 | `customers[cust].iri` | `demo:orderedBy` | out | when the index resolves |

True degree is therefore 2 for every generated Individual in a well-formed Store.

### 9.3 Edge sources for a generated customer

**STORE-89** A generated customer MUST contribute exactly these edges `[src: neighboursOf()]`:

| # | Target | Predicate | Direction | Condition |
|---|--------|-----------|-----------|-----------|
| 1 | `demo:Customer` | `rdf:type` | out | always |
| 2 | each order that names this customer | `demo:orderedBy` | in | one per owned order, obtained from the customer index |

At the default dataset size a customer owns 8 orders on average, so the measured true degree of the first customer is 10.

### 9.4 Edge sources for an Entity

**STORE-90** An Entity MUST contribute exactly the following edge sources, in exactly this order. The order determines which neighbours survive the cap, and MUST be preserved so that structural edges are never lost to a large instance bucket `[src: neighboursOf()]`.

| # | Source | Predicate | Direction | Notes |
|---|--------|-----------|-----------|-------|
| 1 | each entry of `parents` | `rdfs:subPropertyOf` when the Entity's kind is `objectProperty` or `dataProperty`, otherwise `rdfs:subClassOf` | out | |
| 2 | each entry of `children` | same predicate rule as row 1 | in | |
| 3 | each target of each record in `restrictions` concatenated with `equivalents` | the record's `prop`, or `owl:equivalentClass` when the record has no property — that is, for `class` and `not` records | out | uses [target extraction](#84-target-extraction) |
| 4 | each entry of `disjointWith` | `owl:disjointWith` | out | |
| 5 | `domain`, when present | `rdfs:domain` | out | properties only |
| 6 | `range`, when present | `rdfs:range` | out | properties only; may be an `xsd:` datatype IRI |
| 7 | `inverse`, when present | `owl:inverseOf` | out | object properties only |
| 8 | each entry of `types`, when present | `rdf:type` | out | named individuals only |
| 9 | each entry of the reverse restriction index for this IRI | the predicate stored in the index entry | in | see [section 9.5](#95-the-reverse-restriction-index) |
| 10 | each record in `byType[iri]` | `rdf:type` | in | the instance direction — **the expensive one** |
| 11 | each customer, when the IRI is exactly `demo:Customer` | `rdf:type` | in | |
| 12 | each Individual record, when the IRI is exactly `demo:Order` | `rdf:type` | in | |

**STORE-91** Sources 10, 11 and 12 are the reason the **Budget** exists `[src: neighboursOf()]`. They are the only sources whose size grows with the dataset, and at 100,000 Individuals source 12 alone contributes 100,000 edges from a single node.

**STORE-92** The reverse restriction index MUST be built lazily on first use if it is absent, so that adjacency is correct even if a caller forgot to build it `[src: neighboursOf()]`.

Measured true degrees for the reference fixture at the default dataset size `[src: neighboursOf()]`:

| IRI | List length | True degree | Composition |
|-----|-------------|-------------|-------------|
| `owl:Thing` | 3 | 3 | 3 children |
| `pizza:DomainConcept` | 4 | 4 | 1 parent, 3 children |
| `pizza:Pizza` | 25 | 25 | 1 parent, 12 children, 2 restriction targets, 2 disjoint, 8 incoming |
| `pizza:PizzaTopping` | 19 | 19 | |
| `pizza:NamedPizza` | 23 | 23 | 1 parent, 22 children |
| `pizza:Margherita` | 549 | 549 | 1 parent, 5 restriction targets, 543 instances |
| `pizza:MozzarellaTopping` | 40 | 40 | |
| `pizza:SpicyTopping` | 4 | 4 | |
| `pizza:Country` | 2 | 2 | |
| `pizza:hasTopping` | 4 | 4 | |
| `demo:Customer` | 1,502 | 1,502 | 1 parent, 1 incoming range, 1,500 customers |
| `demo:Order` | **4,000 — capped** | **12,007** | 1 parent, 6 incoming domain, 12,000 Individuals |
| any generated Individual | 2 | 2 | |
| the first generated customer | 10 | 10 | 1 type, 9 owned orders |

`demo:Order` is the case the cap exists for: the list stops at 4,000 while the total reports 12,007, so the node is drawn at the right size and reports 12,007 minus the shown degree as **Hidden neighbours**.

### 9.5 The reverse restriction index

**STORE-93** A reverse restriction index MUST map a filler IRI to the list of Entities that point at it `[src: buildReverseIndex()]`:

```
1. buildReverseIndex():
2.   index <- empty map from IRI to list
3.   for each Entity e in the entity map:
4.       for each record r in (e.restrictions concatenated with e.equivalents):
5.           for each target t in restrictionTargets(r):
6.               append { from: e.iri, prop: r.prop or rdfs:subClassOf } to index[t]
7.       if e.domain exists: append { from: e.iri, prop: rdfs:domain } to index[e.domain]
8.       if e.range  exists: append { from: e.iri, prop: rdfs:range  } to index[e.range]
```

**STORE-94** The index MUST be rebuilt, never patched, after any change to the set of Entities or to any Entity's restrictions, equivalents, domain or range `[src: newClassDialog(), deleteSelected()]`.

**STORE-95** The fallback predicate for a record with no property is `rdfs:subClassOf` in the index but `owl:equivalentClass` in the forward direction `[src: buildReverseIndex(), neighboursOf()]`. The two MUST agree, because an edge added from one side and an edge added from the other produce different edge keys and therefore a duplicate edge in the Viewport `[src: edgeKey()]`. **Status:** specified, not implemented in the reference build.

**STORE-96** For the reference fixture the index MUST have 56 keys, drawn from 157 restriction records and 24 equivalence records `[src: buildReverseIndex()]`.

### 9.6 The customer index

**STORE-97** The customer-to-orders index MUST be built lazily and MUST be stamped with the Store version `[src: customerIndex()]`:

```
1. customerIndex():
2.   if an index exists and its stamp equals store.version: return it
3.   index <- empty map from customer IRI to list of Individual records
4.   index.version <- store.version
5.   for each rec in inds:
6.       c <- customers[rec.cust];  if absent: skip
7.       append rec to index[c.iri]
8.   return index
```

**STORE-98** The index MUST NOT be built during generation. A user who never inspects a customer never pays for it. Building it costs 20 ms at 100,000 Individuals and 5 ms at 12,000 `[src: customerIndex()]`.

**STORE-99** The version stamp MUST be compared, not merely tested for presence. Any ABox mutation bumps `store.version`, which invalidates the index on the next read without requiring the mutating code to know the index exists `[src: customerIndex(), commitCell(), newIndividualDialog()]`.

**STORE-100** Regeneration MUST additionally clear the index explicitly, because the stamp comparison alone would leave a large stale map alive until the next read `[src: regenerate()]`.

**STORE-101** Storing the version stamp as a property of the map object is an implementation detail of the reference build `[src: customerIndex()]`. An implementation MUST hold the stamp alongside the map, not on it.

---

## 10. Entity resolution

**STORE-102** `resolve(iri)` MUST return a displayable record for any IRI the application can select, including generated Individuals and generated customers, which have no Entity record `[src: resolve()]`.

**STORE-103** `resolve(iri)` MUST dispatch in exactly this order and MUST return the first match `[src: resolve()]`:

```
1. resolve(u):
2.   e <- entity map lookup of u;  if present: return e
3.   rec <- individual index lookup of u
4.   if present: return a synthetic record:
5.       { iri: u, name: localName(u), kind: 'individual', generated: true, rec: rec,
6.         parents: [], children: [], restrictions: [], equivalents: [], disjointWith: [],
7.         types: [rec.type], comment: 'Generated demo individual.', ns: 'demo' }
8.   c <- customer with iri u
9.   if present: return a synthetic record:
10.      { iri: u, name: localName(u), kind: 'individual', generated: true, customer: c,
11.        parents: [], children: [], restrictions: [], equivalents: [], disjointWith: [],
12.        types: [demo:Customer], comment: 'Generated demo individual.', ns: 'demo' }
13.  return null
```

**STORE-104** A synthetic record MUST present the same field surface as an Entity record, with empty collections where the concept does not apply, so that every consumer can read it without a type test `[src: resolve(), renderInspector()]`.

**STORE-105** A synthetic record MUST carry a discriminator: `generated` set true, plus exactly one of `rec` (an Individual record) or `customer` (a customer record) `[src: resolve()]`. The inspector branches on these two fields to choose which property-assertion block to render `[src: renderInspector()]`.

**STORE-106** A synthetic record MUST NOT be cached or stored. It is constructed per call and discarded. Mutating it MUST have no effect on the Store; the only shared state is the `rec` or `customer` reference it carries, which is the real record.

**STORE-107** `resolve()` MUST return null for an unknown IRI, and every caller MUST handle null `[src: resolve(), renderInspector(), selectEntity()]`. The inspector falls back to its empty state; the status bar falls back to `No selection`.

**STORE-108** `labelOf(iri)` MUST return the display label by exactly this precedence `[src: labelOf()]`:

| Order | Test | Label |
|-------|------|-------|
| 1 | the IRI is a generated Individual | the record's order reference, for example `AX-100000` |
| 2 | the IRI is a generated customer | the customer's name, for example `Nadia Duarte` |
| 3 | the IRI is an Entity | the Entity's `name` |
| 4 | otherwise | `localName(iri)` |

**STORE-109** `labelOf()` MUST NOT return the IRI itself as a fallback. Falling back to the local name keeps the Viewport readable when a query binds a term the Store does not know `[src: labelOf()]`.

**STORE-110** `kindOf(iri)` MUST return the Entity kind by exactly this precedence `[src: kindOf()]`:

| Order | Test | Kind |
|-------|------|------|
| 1 | the IRI is a generated Individual | `individual` |
| 2 | the IRI is an Entity | the Entity's kind |
| 3 | the IRI begins with the `demo:` namespace followed by `Customer_` | `individual` |
| 4 | otherwise | `class` |

**STORE-111** Rule 3 is a string-prefix test rather than a lookup, deliberately: it answers in constant time for generated customers, which have no index `[src: kindOf()]`. If STORE-37 is implemented, rule 3 MUST become an index lookup.

**STORE-112** Rule 4 defaults to `class` rather than returning nothing, so that an unrecognised IRI still draws with a shape and a colour `[src: kindOf(), makeNode()]`.

---

## 11. Deterministic generation

**STORE-113** Generation MUST be reproducible. The same requested Individual count MUST produce byte-identical records on every run, on every machine, in every session `[src: generateIndividuals()]`. The dataset appears in screenshots, in exported images, in query results and in acceptance tests; none of those are meaningful if the data moves.

### 11.1 The generator

**STORE-114** The pseudo-random source MUST be a linear congruential generator with exactly these constants `[src: rnd()]`:

| Parameter | Value |
|-----------|-------|
| Multiplier | 1,664,525 |
| Increment | 1,013,904,223 |
| Modulus | 2³² = 4,294,967,296 |
| Seed | 20,250,911 |
| Output | the new state divided by 2³², giving a value in the half-open interval [0, 1) |

```
1. rnd():
2.   rngState <- (rngState * 1664525 + 1013904223) modulo 2^32
3.   return rngState / 4294967296
```

**STORE-115** The state MUST be held as an unsigned 32-bit value, and the modulo MUST be exact. The reference build achieves this with an unsigned right shift of zero, which forces the result to an unsigned 32-bit integer `[src: rnd()]`. An implementation in a language with 64-bit integers MUST mask explicitly.

**STORE-116** The seed MUST be reset to 20,250,911 at the start of every generation, not only at module load `[src: generateIndividuals()]`. Without the reset, generating 1,000 Individuals and then 1,000 again would produce different data.

**STORE-117** Uniform selection from a table MUST be `table[floor(rnd() × table.length)]` `[src: pick()]`. The reference build truncates toward zero, which is equivalent for a non-negative product.

**STORE-118** The generator MUST be consumed in exactly the order specified in [section 11.3](#113-individual-generation). Determinism is a property of the draw sequence, not only of the seed: re-ordering two field computations changes every subsequent record.

**STORE-119** Exactly two draws MUST be consumed per customer and exactly seven per Individual `[src: generateIndividuals()]`. Total draws for a dataset of `n` Individuals with `c` customers is `2c + 7n`.

### 11.2 Customer generation

**STORE-120** The customer count MUST be derived from the requested Individual count `[src: generateIndividuals()]`:

```
customerCount = max(24, round(n / 8))
```

**STORE-121** The floor of 24 MUST be preserved so that a very small dataset still has a plausible spread of customers.

| Requested Individuals | Customers |
|----------------------|-----------|
| 1,000 | 125 |
| 12,000 | 1,500 |
| 50,000 | 6,250 |
| 100,000 | 12,500 |

**STORE-122** Each customer MUST be generated as `[src: generateIndividuals()]`:

```
1. for i from 0 to customerCount - 1:
2.     name <- pick(FIRST_NAMES) + " " + pick(LAST_NAMES)     // two draws, in this order
3.     iri  <- demo:Customer_ + (i + 1) padded with leading zeros to width 6
4.     append { iri, name } to customers
```

**STORE-123** The customer identifier padding width MUST be exactly 6, a fixed constant, and MUST NOT vary with the dataset size `[src: generateIndividuals()]`. At 12,500 customers the widest identifier is `demo:Customer_012500`.

**STORE-124** Customer names are drawn from a 26-entry first-name table and a 25-entry surname table `[src: FIRST_NAMES, LAST_NAMES]`, giving 650 distinct combinations. Names are NOT guaranteed unique; the IRI is the identity, in accordance with STORE-4.

The first three customers at every dataset size MUST be, verified against the fixture `[src: generateIndividuals()]`: `demo:Customer_000001` — Nadia Duarte; `demo:Customer_000002` — Chidi Tremblay; `demo:Customer_000003` — Greta Varga.

### 11.3 Individual generation

**STORE-125** The timestamp origin MUST be exactly 2026-08-01T00:00:00Z, expressed in seconds `[src: generateIndividuals()]`.

**STORE-126** The identifier padding width MUST be derived from the requested count `[src: generateIndividuals()]`:

```
pad = (number of digits in n) < 6 ? 6 : (number of digits in n)
```

For all four offered dataset sizes the number of digits is at most 6, so `pad` is 6 in every case. Only a dataset above 999,999 would widen it.

**STORE-127** Each Individual MUST be generated by exactly this procedure, consuming draws in exactly this order `[src: generateIndividuals()]`:

```
1.  for i from 0 to n - 1:
2.      type   <- pick(PIZZA_NAMES)                  // draw 1 — the 22 named-pizza local names
3.      branch <- pick(BRANCHES)                     // draw 2 — the 6 branches
4.      base   <- BASE_PRICE[type], or 11 when absent
5.      rec.i        <- i
6.      rec.iri      <- demo:Pizza_ + (i + 1) padded with leading zeros to width pad
7.      rec.type     <- pizza:(type)
8.      rec.typeName <- type
9.      rec.ref      <- "AX-" + the last six characters of the decimal form of (100000 + i)
10.     rec.branch   <- branch
11.     rec.price    <- round( (base + (rnd() * 3 - 1)) * 100 ) / 100      // draw 3
12.     rec.ts       <- (start + floor(rnd() * 3600 * 24 * 30)) * 1000     // draw 4
13.     rec.rating   <- 3 + floor(rnd() * 3) - (rnd() < 0.12 ? 2 : 0)      // draws 5 and 6
14.     rec.cust     <- floor(rnd() * customerCount)                       // draw 7
15.     if rec.rating < 1: rec.rating <- 1
16.     if rec.rating > 5: rec.rating <- 5
17.     append rec to inds
18.     indIndex[rec.iri] <- rec
19.     bucket <- byType[rec.type];  if absent: create an empty bucket and store it
20.     append rec to bucket
```

**STORE-128** The order reference MUST be `AX-` followed by the last six characters of the decimal form of `100000 + i` `[src: generateIndividuals()]`. For `i` from 0 this yields `AX-100000`, `AX-100001`, and so on.

**STORE-129** Order references are unique only for `i` below 900,000, at which point the six-character truncation wraps to `AX-000000` `[src: generateIndividuals()]`. All four offered dataset sizes are well below that bound. An implementation that offers a larger size MUST widen the reference. **Status:** specified, not implemented in the reference build.

**STORE-130** The price MUST be the type's base price perturbed by a uniform value in the half-open interval [−1.00, +2.00), rounded to two decimal places `[src: generateIndividuals()]`. Base prices are in [the fixture](62-pizza-ontology-fixture.md#base-prices); the fallback for a type with no base price is 11.00.

**STORE-131** The timestamp MUST be the origin plus a uniform whole number of seconds in [0, 2,592,000) — a 30-day window — converted to milliseconds `[src: generateIndividuals()]`. The whole dataset therefore falls in August 2026.

**STORE-132** The rating MUST be computed as a base of 3 plus a uniform integer in {0, 1, 2}, minus 2 when a second independent draw falls below 0.12 `[src: generateIndividuals()]`. This yields a right-leaning distribution with a small unhappy tail.

**STORE-133** The rating MUST then be clamped to the closed range 1 to 5 `[src: generateIndividuals()]`. With the constants of STORE-132 the unclamped value already lies in [1, 5], so the clamp never fires; it MUST be retained as a defence against a change to the constants, and it is the only place the range 1 to 5 is enforced on generated data.

Measured rating distribution at the default dataset size of 12,000 `[src: generateIndividuals()]`:

| Rating | Count | Share |
|--------|-------|-------|
| 1 | 485 | 4.0 % |
| 2 | 492 | 4.1 % |
| 3 | 4,001 | 33.3 % |
| 4 | 3,567 | 29.7 % |
| 5 | 3,455 | 28.8 % |

**STORE-134** The customer assignment MUST be a uniform index into the customer array `[src: generateIndividuals()]`. It MUST NOT be a modulo of the Individual index, which would produce a perfectly even and obviously synthetic distribution.

**STORE-135** Index construction MUST happen inside the same loop as record construction, with no second pass `[src: generateIndividuals()]`. See [Architecture](10-architecture.md#134-per-dataset-change-work-and-its-budget) for the timing envelope.

**STORE-136** After the loop, generation MUST set `generatedCount` to the requested count and MUST increment `version` exactly once `[src: generateIndividuals()]`.

**STORE-137** Generation MUST replace the record array, the Individual IRI index, the by-type index and the customer array with fresh empty collections before the loop, never clear and reuse them `[src: generateIndividuals()]`. A caller holding a reference to the old collection then sees a consistent old dataset rather than a half-cleared one.

The first five Individual records at the default dataset size MUST be, verified against the fixture `[src: generateIndividuals()]`:

| `i` | `iri` | `type` | `ref` | `branch` | `price` | `rating` | `cust` |
|-----|-------|--------|-------|----------|---------|----------|--------|
| 0 | `demo:Pizza_000001` | `pizza:Rosa` | `AX-100000` | Shoreditch | 10.86 | 3 | 640 |
| 1 | `demo:Pizza_000002` | `pizza:Giardiniera` | `AX-100001` | Islington | 11.86 | 4 | 1205 |
| 2 | `demo:Pizza_000003` | `pizza:QuattroFormaggi` | `AX-100002` | Islington | 12.40 | 4 | 816 |
| 3 | `demo:Pizza_000004` | `pizza:AmericanHot` | `AX-100003` | Clerkenwell | 12.55 | 5 | 232 |
| 4 | `demo:Pizza_000005` | `pizza:QuattroFormaggi` | `AX-100004` | Borough | 12.75 | 3 | 757 |

**STORE-138** The full source tables — the 70 authored class rows, the 22 named pizzas with their topping lists, the 8 object properties, the 5 countries, the 5 demo data properties, the 6 branches, the 26 first names, the 25 surnames and the 22 base prices — are given in [the fixture document](62-pizza-ontology-fixture.md) and MUST NOT be duplicated here.

---

## 12. Store mutation operations

**STORE-139** Every Store mutation MUST satisfy all of the following before returning, or MUST make no change at all:

1. Its stated postconditions.
2. Every invariant in [section 5.1](#51-invariants-between-store-fields) and STORE-29.
3. Its index maintenance obligations.
4. Its counter obligations.
5. Notification of every Surface whose content it changed, through the routes permitted by [Architecture](10-architecture.md#22-dependency-graph).

### 12.1 Add class

**STORE-140** Adding a class MUST follow this procedure `[src: newClassDialog()]`:

| Aspect | Requirement |
|--------|-------------|
| Preconditions | The submitted name passes name validation (STORE-153). The chosen parent IRI is a key of the Entity map and its kind is `class` or `defined`. |
| Namespace | The new class is minted in the `pizza:` namespace. The reference build offers no other choice `[src: newClassDialog()]`. An implementation MUST offer a namespace. **Status:** specified, not implemented in the reference build. |
| Steps | 1. Create the Entity with kind `class` and comment `Added in this session.` 2. Set its `parents` to exactly the chosen parent. 3. Append its IRI to the parent's `children` and re-sort that list by local name. 4. Emit `<new> rdfs:subClassOf <parent>` into the TBox array. 5. Push the undo record. 6. Increment `version`. 7. Add the parent IRI to the tree's expanded set. 8. Rebuild the reverse restriction index. |
| Postconditions | The Entity map contains the new IRI. The child-link invariant holds. The TBox array is one triple longer. |
| Index maintenance | The reverse restriction index MUST be rebuilt. The flattened restriction array MUST be rebuilt; the reference build does not, which is harmless only because a new class has no restrictions `[src: newClassDialog()]`. |
| Counters | `version` incremented by 1. |
| Surfaces refreshed | Class tree, Store read-out, then the selection bus with reveal requested, then an informational toast naming both IRIs. |
| Undo | A `newClass` record. See [Architecture](10-architecture.md#8-undo-model) for its limits. |

### 12.2 Rename

**STORE-141** Renaming MUST follow this procedure `[src: commitRename()]`:

| Aspect | Requirement |
|--------|-------------|
| Preconditions | The IRI is a key of the Entity map. The submitted name passes name validation, excluding the Entity itself from the uniqueness test. |
| Steps | 1. If the submitted name equals the current name, make no change and push no undo record. 2. Otherwise push the undo record, assign the new display name, increment `version`. 3. Update the label of the corresponding Viewport node if one exists. |
| Postconditions | The Entity's `name` is the submitted value. The Entity's `iri` is unchanged. No triple changed. |
| Index maintenance | None. No index is keyed by display name. |
| Counters | `version` incremented by 1, only when the name actually changed. |
| Surfaces refreshed | Class tree, inspector, and the Viewport node label. |
| Undo | A `rename` record carrying the previous name. |

**STORE-142** Renaming MUST NOT touch the TBox array, the flattened restriction array, the reverse restriction index or any Individual record. This follows directly from STORE-4: the display name is not the identity, and nothing is keyed by it.

**STORE-143** A rename that fails validation on blur MUST silently abandon the edit and restore the previous rendering; a rename that fails validation on explicit submission MUST keep the editor open, mark it invalid and report the reason `[src: commitRename()]`.

### 12.3 Delete with reparenting

**STORE-144** Deleting a class MUST follow this procedure `[src: deleteSelected()]`:

| Aspect | Requirement |
|--------|-------------|
| Preconditions | The current selection is an Entity whose kind is `class` or `defined`. Any other selection MUST be refused with the message `Select a class in the hierarchy to delete it.` |
| Confirmation | A modal dialog MUST state the consequences before the deletion: the number of subclasses, the number of direct instances, the name of the class the subclasses will be reparented to, and the fact that instances keep their type assertion and will dangle. When there are neither subclasses nor instances the dialog MUST say so: `Nothing else references it, so this removes one class and one subClassOf axiom.` |
| Steps | 1. `parent` is the Entity's first parent, or the universal class when it has none. 2. For each child: replace this IRI with `parent` in the child's `parents`, and append the child to `parent`'s `children`. 3. Remove this IRI from `parent`'s `children`. 4. Delete the Entity from the Entity map. 5. Filter the TBox array, removing every triple in which this IRI is subject or object. 6. Rebuild the reverse restriction index and the flattened restriction array. 7. Remove the node from the Viewport. 8. Clear the selection. 9. Increment `version`. |
| Postconditions | The Entity map does not contain the IRI. No TBox triple mentions the IRI. Every former child names `parent` as a parent. |
| Index maintenance | Reverse restriction index and flattened restriction array MUST both be rebuilt. |
| Counters | `version` incremented by 1. |
| Surfaces refreshed | Class tree, inspector, Store read-out, Budget read-out, then an informational toast. |
| Undo | **None.** See [Architecture](10-architecture.md#81-known-limits-stated-honestly). |

**STORE-145** The following are known defects of the reference deletion `[src: deleteSelected()]`. An implementation MUST fix each. **Status:** specified, not implemented in the reference build.

| # | Defect | Consequence |
|---|--------|-------------|
| 1 | The parent's `children` list is not re-sorted after reparenting. | Reparented subclasses appear at the end of the parent's children rather than in name order, breaking the sort invariant of STORE-25. |
| 2 | Restriction and equivalence records in other Entities that target the deleted IRI are not removed; only TBox triples are filtered. | The inspector renders a link to an Entity that no longer resolves, and the rebuilt reverse restriction index retains a key for it. |
| 3 | Instances in the by-type bucket keyed by the deleted IRI are left in place. | Their `rdf:type` triples name a class with no Entity, violating invariant 7 of [section 5.1](#51-invariants-between-store-fields). The dialog warns the user, but the Store is left inconsistent. |
| 4 | The deleted IRI is not removed from the tree's expanded set. | Harmless, but the set grows without bound across a session of deletions. |
| 5 | `disjointWith` entries in other Entities that name the deleted IRI are not removed. | Same class of dangling reference as defect 2. |

### 12.4 Add individual

**STORE-146** Adding an Individual MUST follow this procedure `[src: newIndividualDialog()]`:

| Aspect | Requirement |
|--------|-------------|
| Preconditions | The by-type index has at least one key; otherwise the operation MUST be refused with `Generate a dataset first — there are no instantiable types in the demo namespace yet.` The submitted price is finite and lies in the closed range 0 to 500. |
| Steps | 1. `i` is the current length of the record array. 2. Construct the record with `iri` = `demo:Pizza_` plus `i + 1` padded to width 6; `type` and `typeName` from the chosen type; `ref` by the rule of STORE-128; `branch` from the chosen branch; `price` rounded to two decimal places; `ts` set to the current instant; `rating` set to 5; `cust` set to 0. 3. Append to the record array. 4. Insert into the Individual IRI index. 5. Append to the by-type bucket, creating it if absent. 6. Increment `version`. |
| Postconditions | All invariants of [section 5.1](#51-invariants-between-store-fields) hold, except `generatedCount`, which is not updated. |
| Index maintenance | Individual IRI index and by-type bucket MUST both be updated in the same operation. The customer index MUST NOT be rebuilt eagerly; the version bump invalidates it. |
| Counters | `version` incremented by 1. `generatedCount` MUST also be incremented; the reference build does not. **Status:** specified, not implemented in the reference build. |
| Surfaces refreshed | Table filter options, table rows, Store read-out, class tree (its per-class instance counts changed), then the selection bus with reveal requested, then an informational toast. |
| Undo | **None.** |

**STORE-147** The reference build hard-codes three values that MUST be user-supplied or derived `[src: newIndividualDialog()]`. **Status:** specified, not implemented in the reference build.

| Value | Reference behaviour | Consequence |
|-------|--------------------|-------------|
| Identifier padding width | fixed at 6 rather than derived from the dataset size | An Individual added to a dataset that widened the padding would have an inconsistent identifier. |
| `cust` | fixed at 0 | Every manually created Individual is attributed to the first customer. |
| `rating` | fixed at 5 | The dialog offers no rating field. |

### 12.5 Edit an Individual field

**STORE-148** Exactly three fields MUST be editable, with exactly these validation rules `[src: commitCell(), COLS]`:

| Field | Editor | Validation, in order | Failure message |
|-------|--------|----------------------|-----------------|
| `branch` | selection from the branch table | MUST be a member of the branch table | `Branch must be one of: Soho, Shoreditch, Camden, Clerkenwell, Borough, Islington.` |
| `price` | free text, decimal input mode | a leading pound sign is stripped; MUST be non-empty; MUST parse to a finite number; MUST be non-negative; MUST NOT exceed 500 | `Price is required. Enter an amount in pounds, for example 12.50.` / `"<value>" is not a number. Enter an amount in pounds, for example 12.50.` / `Price cannot be negative.` / `Price looks wrong — £<value> exceeds the £500 sanity limit for a single pizza.` |
| `rating` | free text, decimal input mode | MUST be non-empty; MUST be a whole number; MUST lie in the closed range 1 to 5 | `Rating is required. Enter a whole number from 1 to 5.` / `Rating must be a whole number, not "<value>".` / `Rating must be between 1 and 5. You entered <value>.` |

**STORE-149** Any other column MUST be refused with `That column is not editable.` `[src: commitCell()]`.

**STORE-150** A commit MUST push the undo record before assigning, and MUST return either null for success or the failure message `[src: commitCell()]`. It MUST NOT raise.

**STORE-151** A successful price commit MUST round to two decimal places `[src: commitCell()]`.

**STORE-152** The caller, not the commit function, MUST increment `version`, re-apply the table filters and re-render the inspector when the edited record is the current selection `[src: beginCellEdit()]`. The commit function MUST remain a pure validate-and-assign so it can be reused by a bulk editor.

| Aspect | Requirement |
|--------|-------------|
| Preconditions | The row's IRI is a key of the Individual IRI index. The column is editable. |
| Postconditions | Exactly one field of exactly one record changed. |
| Index maintenance | **None required.** No index is keyed by `branch`, `price` or `rating`. Editing `type` would require by-type bucket maintenance, which is why `type` is not editable. |
| Counters | `version` incremented by 1 by the caller. |
| Surfaces refreshed | Table (through filter re-application, because the edit may move the row out of the current filter or change its sort position), inspector when the record is selected. |
| Undo | A `cell` record carrying the previous value. |

### 12.6 Name validation

**STORE-153** Name validation MUST apply exactly these rules, in order, returning the first failure `[src: validateName()]`:

| Order | Rule | Message |
|-------|------|---------|
| 1 | The name MUST NOT be empty | `A name is required.` |
| 2 | The name MUST NOT contain whitespace | `Names cannot contain spaces — use CamelCase, as the rest of the ontology does.` |
| 3 | The name MUST start with a letter and contain only letters, digits, hyphens and underscores | `Start with a letter; use letters, digits, hyphen or underscore only.` |
| 4 | No other Entity MUST have the same display name | `An entity named <name> already exists at <shortened IRI>.` |

**STORE-154** Rule 4 compares display names, not IRIs, and excludes the Entity being renamed `[src: validateName()]`. It is a usability rule, not an identity rule: two Entities with the same display name would be indistinguishable in the tree.

**STORE-155** Rule 4 is an O(number of Entities) scan. At 114 Entities this is free; an implementation that grows the TBox substantially SHOULD index by display name.

---

## 13. Scale characteristics

**STORE-156** The application MUST offer exactly four dataset sizes: 1,000, 12,000, 50,000 and 100,000 Individuals `[src: scaleMenu]`. The default at boot MUST be 12,000 `[src: init()]`.

**STORE-157** The following table is normative for triple counts and Individual counts, and indicative for memory and timing. Memory figures are heap in use after a forced collection, measured on the reference runtime, above a 3.72 MB baseline that holds the TBox, the flattened restrictions and the authoring tables. Timings are measured on the reference runtime; an implementation MUST meet the asymptotic shape and SHOULD meet the absolute figures.

| Requested Individuals | 1,000 | 12,000 | 50,000 | 100,000 |
|-----------------------|-------|--------|--------|---------|
| Customers | 125 | 1,500 | 6,250 | 12,500 |
| TBox triples | 239 | 239 | 239 | 239 |
| Flattened restriction triples | 140 | 140 | 140 | 140 |
| ABox triples, counted not stored | 7,250 | 87,000 | 362,500 | 725,000 |
| **Reported triple count** `[src: tripleCount()]` | **7,489** | **87,239** | **362,739** | **725,239** |
| Reported Individual count `[src: individualCount()]` | 1,130 | 13,505 | 56,255 | 112,505 |
| Store memory above baseline, records and indexes | 0.42 MB | 4.87 MB | 20.19 MB | 40.00 MB |
| Same ABox materialised as triples, for comparison | ~1.1 MB | ~12.6 MB | ~52.5 MB | 100.4 MB |
| Generation time | 5 ms | 28 ms | 86 ms | 168 ms |
| Customer index build, lazy | 0.4 ms | 5 ms | 27 ms | 20 ms |
| Full table filter pass, two predicates | 0.2 ms | 0.8 ms | 4.5 ms | 11.6 ms |
| Scan, bound subject, all predicates | 0.6 ms | 0.2 ms | 0.5 ms | 0.3 ms |
| Scan, `rdf:type` with bound class object (`pizza:Margherita`) | 0.5 ms, 51 results | 0.2 ms, 543 results | 0.7 ms, 2,262 results | 0.6 ms, 4,550 results |
| Scan, bound `demo:` predicate, unbound subject and object | 0.5 ms, 1,000 results | 5.2 ms, 12,000 results | 16.6 ms, 50,000 results | 8.9 ms, 100,000 results |
| True degree of `demo:Order` | 1,007 | 12,007 | 50,007 | 100,007 |
| Neighbour list length for `demo:Order`, capped | 1,007 | 4,000 | 4,000 | 4,000 |
| `neighboursOf(demo:Order)` cost | 2.1 ms | 1.4 ms | 3.8 ms | 6.4 ms |
| Viewport node count | ≤ Budget | ≤ Budget | ≤ Budget | ≤ Budget |
| Per-frame cost | unchanged | unchanged | unchanged | unchanged |

**STORE-158** The last two rows are the product claim, and MUST hold: the Viewport holds at most the **Budget** regardless of dataset size, so per-frame cost does not vary with the dataset. Only Store-tier operations scale with the dataset, and all of them are per-interaction or per-dataset-change work — see [Architecture](10-architecture.md#13-performance-architecture).

**STORE-159** Operation cost classes MUST be as follows. An implementation MUST NOT move an operation to a worse class.

| Operation | Class | Depends on |
|-----------|-------|-----------|
| Resolve an IRI to an Entity | O(1) | — |
| Resolve an IRI to a generated Individual | O(1) | — |
| Resolve an IRI to a generated customer | O(customers) in the reference build; MUST be O(1) — see STORE-37 | customer count |
| Label of an IRI | same as resolve | — |
| Kind of an IRI | O(1) | — |
| Neighbours of a generated Individual | O(1) | — |
| Neighbours of a generated customer | O(orders owned) plus one lazy index build | dataset size on first call |
| Neighbours of a class | O(subclasses + restrictions + reverse index entries + instance bucket size), capped in the list, uncapped in the total | instance bucket size |
| Triple count | O(1) | — |
| Class count, property count | O(Entities) | TBox size only |
| Full table filter | O(Individuals) | dataset size |
| Table row window render | O(visible rows) | — |
| Scan, bound subject | O(TBox + flattened) plus O(1) record lookup plus 7 predicate functions | TBox size |
| Scan, unbound subject with bound `rdf:type` object | O(TBox + flattened) plus O(bucket) | bucket size |
| Scan, unbound subject with bound `demo:` predicate | O(TBox + flattened) plus O(Individuals) | dataset size |
| Generation | O(Individuals + customers) | dataset size |
| Reverse restriction index build | O(Entities × restrictions) | TBox size only |
| Customer index build | O(Individuals) | dataset size |

**STORE-160** Every `scan()` call pays the cost of walking the whole TBox array and the whole flattened restriction array, even when the pattern can only match generated content `[src: scan()]`. At 379 static triples this is tolerable, but it is paid once per triple pattern per candidate solution. An implementation SHOULD skip the static sources when the bound predicate is a `demo:` predicate, which cannot appear in them. **Status:** specified, not implemented in the reference build.

---

## 14. Traceability

**STORE-161** Every requirement in this document MUST be traceable to a test in [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md). The deterministic generation requirements of [section 11](#11-deterministic-generation) MUST be tested by exact comparison against the recorded first five Individual records and first three customer records, at all four dataset sizes.

---

## Appendix A — Native stack mapping (non-normative)

This appendix is illustrative. Nothing in it is normative, and an implementation that satisfies the body of this document on a different stack is conformant.

### A.1 Individual records: struct-of-arrays versus array-of-structs

The reference build uses an array of heap-allocated objects, which costs approximately 400 bytes per Individual once the Individual IRI index, the by-type buckets and the customer index are included. A native runtime can do far better, because every field of an Individual record is either a small scalar or a reference into a small dictionary.

**Array-of-structs.** A `readonly record struct IndividualRecord` with the fields below occupies 32 bytes with natural alignment:

| Field | Native type | Bytes | Note |
|-------|-------------|-------|------|
| `TypeId` | `ushort` | 2 | index into the 22-entry named-pizza table; `ushort` leaves room for a far larger TBox |
| `BranchId` | `byte` | 1 | index into the 6-entry branch table |
| `Rating` | `byte` | 1 | 1–5 |
| `CustomerId` | `int` | 4 | index into the customer array |
| `PriceMinorUnits` | `int` | 4 | pence, avoiding floating point entirely for money |
| `PreparedAt` | `long` | 8 | Unix milliseconds, or `DateTime` ticks |
| padding | | 12 | to a 32-byte boundary for cache alignment |

`i`, `iri`, `typeName` and `ref` are all derived and MUST NOT be stored: `i` is the array position; `iri` is the position formatted by the padding rule; `typeName` is a lookup by `TypeId`; `ref` is the position formatted by the reference rule. At 100,000 Individuals this is 3.2 MB, against the reference build's 40 MB — a twelvefold reduction, and the whole array fits comfortably in L3 cache on a modern desktop.

**Struct-of-arrays.** Six parallel arrays — `ushort[] typeId`, `byte[] branchId`, `byte[] rating`, `int[] customerId`, `int[] priceMinorUnits`, `long[] preparedAt` — total 20 bytes per Individual with no padding, or 2.0 MB at 100,000.

The choice turns on the dominant access pattern:

| Access pattern | Frequency | Favours |
|----------------|-----------|---------|
| Table filter over one or two fields, then project all fields for the visible window | every keystroke after debounce | struct-of-arrays: the filter touches only the two arrays it needs, and `Span<T>` plus SIMD over `int[] priceMinorUnits` is straightforward |
| Render one record in the inspector | per selection | array-of-structs: one cache line |
| `scan()` over one predicate across all Individuals | per query | struct-of-arrays: sequential read of a single array |
| Sort by one column | per header activation | either; sort an `int[]` of indices, not the records |

The recommendation is **struct-of-arrays**, because the two hot paths — filtering and scanning — are both single-column sweeps, and the inspector path is a single record read whose cost is irrelevant. The record struct then becomes a view constructed on demand from the six arrays, which is exactly the role `resolve()` plays in the reference build.

### A.2 Index types

| Index | Reference build | Native recommendation |
|-------|-----------------|----------------------|
| Entity map | `Map` from IRI string to record | `Dictionary<string, Entity>` with the ordinal string comparer, or better, intern every IRI to an `EntityId` (`int`) at build time and use `Entity[]` with a single `Dictionary<string, int>` at the boundary |
| Individual IRI index | `Map` from IRI string to record | **Omit entirely.** The identifier is `demo:Pizza_` plus a zero-padded ordinal, so the lookup is a prefix check plus an integer parse plus a bounds check — O(1) with no allocation and no hash table. This alone removes roughly 9 MB at 100,000 Individuals. |
| By-type index | `Map` from class IRI to array | Counting sort at generation into a `int[] typeOffsets` of length 23 plus an `int[] sortedIndices` of length n — a compressed-sparse-row layout. Bucket lookup is then a slice of a contiguous array, which is both smaller and faster to iterate than an array of references. |
| Customer index | lazily built `Map` from customer IRI to array, stamped with the Store version | Same compressed-sparse-row layout, built lazily, invalidated by comparing a stored version against `Store.Version` |
| Reverse restriction index | `Map` from IRI to list | `Dictionary<EntityId, ImmutableArray<ReverseRef>>`, rebuilt wholesale on TBox change; at 56 keys the shape barely matters |
| TBox triples | array, scanned linearly | `ImmutableArray<Triple>` plus a subject-ordered index and a predicate-ordered index; at 239 triples the indexes cost nothing and remove the repeated linear scan noted in STORE-160 |
| Flattened restrictions | array, scanned linearly | same treatment |

Interning IRIs to integer identifiers is the single highest-leverage change. Every Store field that currently holds an IRI string — parent lists, child lists, restriction fillers, edge endpoints, `G.nodes` keys — becomes an `int`. String comparison disappears from every hot path, the edge key of the Viewport becomes a 96-bit struct rather than a concatenated string, and the `Dictionary<string, int>` at the boundary is consulted only when an IRI enters from the outside: a query result, a paste, a file load.

### A.3 Where a persistent triple store would slot in

The virtual triple source is already the seam. `scan(subject, predicate, object)` is a pure enumeration contract with no knowledge of where triples come from, and every consumer — the query evaluator and nothing else — reads through it `[src: scan(), evaluate()]`.

```
interface ITripleSource
{
    IEnumerable<Triple> Scan(Term? subject, Term? predicate, Term? obj);
    long EstimatedCardinality(Term? subject, Term? predicate, Term? obj);
}
```

The second method does not exist in the reference build and is the one addition worth making up front: a persistent store can answer cardinality from its own statistics, and the query evaluator can then order its triple patterns from most selective to least, which matters far more against a disk-backed store than against an in-memory array.

Three implementations then coexist behind the interface:

| Implementation | Content | Notes |
|----------------|---------|-------|
| `StaticTripleSource` | TBox and flattened restrictions | Backed by the two indexed arrays of A.2. |
| `GeneratedTripleSource` | The `demo:` ABox | The predicate function table of STORE-51, over the struct-of-arrays of A.1. Yields without allocating by returning a `Triple` struct. |
| `PersistentTripleSource` | A loaded `.owl` or `.ttl` file, or a remote endpoint | An embedded quad store — LMDB-backed, or a SPARQL endpoint client. |

A `UnionTripleSource` composes them and is what the evaluator sees. The composition order is the order of STORE-50, preserved so that query results remain stable.

Two consequences are worth stating because they are easy to get wrong:

1. **The Store's census functions must move behind the same seam.** `tripleCount()` is currently arithmetic over array lengths (STORE-58). Against a persistent source it becomes a sum of per-source counts, where the persistent source reports its own. The arithmetic rule of STORE-59 and STORE-60 survives unchanged for the generated source.

2. **Adjacency must not be routed through the triple source.** `neighboursOf()` reads the Entity record and the by-type index directly, and must continue to, because a triple-pattern round trip per edge source would turn one in-memory traversal into twelve scans. A persistent store contributes to adjacency through a separate, explicitly bounded query — which is exactly the point at which the neighbour cap of STORE-82 stops being a convenience and starts being the only thing preventing a full table scan on every node expansion.
