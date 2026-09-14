# Axiom — Pizza Ontology Fixture

**Purpose:** This document is the complete, transcribable definition of the single fixture that every Axiom build, screenshot, acceptance test and performance measurement is taken against: the real Pizza ontology as the **TBox**, and a deterministically generated pizzeria order dataset as the **ABox**.

**Status:** Normative

**Requirement ID prefixes owned:** `FIX`

---

## 1. Scope and standing of this document

This is the only document in the suite that is mostly *data* rather than *behaviour*. Everything in it is reproduced from the reference implementation and MUST be transcribed into an Axiom build without alteration. No table here is abridged, summarised or exemplary: where a table exists, it is the whole of the thing it describes.

**FIX-1** An implementation MUST ship the fixture defined in this document as its built-in ontology, and MUST make it available with no file opened, imported or downloaded `[src: init()]`.

**FIX-2** The fixture MUST be loaded in two separable stages: the **TBox** stage, which is fixed and identical in every run `[src: buildTBox()]`, and the **ABox** stage, which is regenerated on demand at a user-chosen size `[src: generateIndividuals()]`.

**FIX-3** An implementation MUST NOT alter any class name, property name, topping list, axiom, characteristic, domain, range or annotation given in this document. Where the fixture appears to contain a modelling error, the error is part of the fixture and MUST be reproduced — the tutorial ontology's deliberately unsatisfiable class is the clearest case `[src: CLASS_SPEC]`.

**FIX-4** The **TBox** and the **ABox** MUST remain distinguishable to the user at every point at which they appear: in the class tree, the inspector, the graph **Viewport**, the individuals table, query results and exports. Distinguishability is carried by the namespace, never by convention and never by the reader's memory `[src: addEntity()]`.

Related documents: [`11-data-model-and-store.md`](11-data-model-and-store.md) owns the **Store** structures this fixture fills; [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) turns [§16](#16-verification-checklist) into executable checks; [`32-sparql-console.md`](32-sparql-console.md) owns the query surface that reads the flattened index of [§14](#14-the-flattened-restriction-index).

---

## 2. Provenance

### 2.1 The TBox is the real Pizza ontology

The **TBox** is the Pizza ontology published by co-ode.org and universally known as the Protégé tutorial ontology. Its class names, property names and axioms are used verbatim, and its namespace IRI is used unchanged `[src: NS]`.

**FIX-5** The **TBox** namespace IRI MUST be exactly

```
http://www.co-ode.org/ontologies/pizza/pizza.owl#
```

and MUST be bound to the prefix `pizza:` `[src: NS]` `[src: PFX]`.

**FIX-6** The product MUST describe this vocabulary to the user as the real Pizza ontology and MUST NOT present it as sample or invented content. The reference build states this in the dataset flyout, verbatim: *"Classes and properties come from the real Pizza ontology. Individuals are generated order records in a separate demo namespace."* `[src: #scaleMenu]`

### 2.2 The ABox is not part of that ontology

The **ABox** is **not** part of the Pizza ontology. It is a generated pizzeria order dataset, invented for this product to demonstrate behaviour at scale, and it lives in its own namespace `[src: NS]`.

**FIX-7** The **ABox** namespace IRI MUST be exactly

```
http://example.org/pizzeria#
```

and MUST be bound to the prefix `demo:` `[src: NS]` `[src: PFX]`.

**FIX-8** Generated data MUST be labelled as generated wherever it is described. Every generated **Individual** resolved through the **Store** carries the comment `Generated demo individual.` `[src: resolve()]`, and both `demo:` classes carry comments beginning `Generated demo data.` `[src: DEMO_CLASSES]`.

**FIX-9** The product MUST NOT present the `demo:` **ABox** as part of `pizza.owl`, on any **Surface**, in any export, in any query result, or in any status figure.

### 2.3 Namespace discipline

**FIX-10** Every **Entity** in the **Store** MUST carry a namespace marker derived from its IRI: `demo` when the IRI begins with the `demo:` namespace, otherwise `pizza` `[src: addEntity()]`. The marker is assigned at creation and is never edited.

**FIX-11** The following six prefixes MUST be pre-bound in every context that abbreviates an IRI, including the **SPARQL** console's default prefix environment `[src: PFX]` `[src: parseQuery()]`.

| Prefix | Namespace IRI | Role in the fixture |
|---|---|---|
| `pizza:` | `http://www.co-ode.org/ontologies/pizza/pizza.owl#` | The real Pizza ontology **TBox** and its five country **Individuals** |
| `demo:` | `http://example.org/pizzeria#` | The generated order dataset and its own vocabulary |
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` | `rdf:type` |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` | `rdfs:subClassOf`, `rdfs:subPropertyOf`, `rdfs:domain`, `rdfs:range`, `rdfs:comment`, `rdfs:label` |
| `owl:` | `http://www.w3.org/2002/07/owl#` | `owl:Thing`, `owl:Class`, `owl:ObjectProperty`, `owl:DatatypeProperty`, `owl:disjointWith`, `owl:equivalentClass`, `owl:inverseOf` |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` | Datatypes of the `demo:` data properties |

**FIX-12** An IRI matching no bound prefix MUST be displayed in angle brackets as `<full-iri>` `[src: shorten()]`.

### 2.4 The one place the two namespaces meet

There is exactly one deliberate join between the two namespaces, and an implementer who misses it will build the wrong fixture.

**FIX-13** Every generated order **Individual** has a `demo:` IRI but is asserted to be an instance of a `pizza:` named pizza class — for example `demo:Pizza_000001 rdf:type pizza:Rosa` `[src: generateIndividuals()]`. The **Individual** is `demo:`; its type is `pizza:`. Both halves MUST be reproduced, and the two MUST NOT be conflated in any label, tooltip, column header or export caption.

**FIX-14** Membership of `demo:Order` MUST be treated as *virtual*. It is not a stored assertion on the record, and is produced only when a caller explicitly asks for the instances of `demo:Order` `[src: scan()]` `[src: neighboursOf()]`. The same rule applies to `demo:Customer` for customer records, except that customer records additionally yield an `rdfs:label` assertion `[src: scan()]`.

---

## 3. Entity kinds

**FIX-15** Every **Entity** created by the fixture MUST carry exactly one kind drawn from the following closed set `[src: KIND]`.

| Kind value | Meaning | Produced by the fixture for |
|---|---|---|
| `class` | A primitive class | `owl:Thing`, every primitive `pizza:` class, all 22 named pizzas, both `demo:` classes |
| `defined` | A defined class — one carrying an equivalence axiom | The 11 defined `pizza:` classes |
| `individual` | A named instance | The five `pizza:` country **Individuals** |
| `objectProperty` | An object property | The eight `pizza:` object properties and `demo:orderedBy` |
| `dataProperty` | A data property | The five `demo:` data properties |

**FIX-16** Generated order and customer records MUST NOT be materialised as **Entity** objects. They are held in compact record arrays and resolved to a display shape on demand `[src: resolve()]`; when resolved, their kind is `individual`.

---

## 4. Restriction normal form

Every axiom in the class table of [§5](#5-the-complete-class-table) is stored in one normal form, and every rendering of an axiom in the product is produced from that form. An implementer MUST build this structure first; the class table is unusable without it.

**FIX-17** A restriction MUST be represented as exactly one of three shapes `[src: normRestriction()]`.

| Shape | Fields | Source form | Meaning |
|---|---|---|---|
| `class` | `filler` | `['ClassName']` | A bare named class, used as a conjunct of an equivalence axiom |
| `not` | `filler` | `['not', 'ClassName']` | Negation of a named class |
| `restriction` | `prop`, `q`, `filler`, `n` | `[property, quantifier, filler, n?]` | A property restriction |

**FIX-18** The quantifier `q` MUST be one of `some`, `only`, `value`, `min`, `max`, and no other `[src: CLASS_SPEC]` `[src: normRestriction()]`.

**FIX-19** A `filler` MUST be a single IRI, an array of IRIs (used only by the `only` quantifier over a whole topping set), or absent (used only by `max` with a cardinality) `[src: normRestriction()]`.

**FIX-20** Every bare name in the fixture's restriction data MUST be expanded into the `pizza:` namespace when normalised. The fixture's restriction data contains no `demo:` term `[src: normRestriction()]`.

**FIX-21** Rendering a restriction to Manchester-like text MUST follow these rules, tested in this order `[src: restrictionText()]`.

| # | Case | Output |
|---|---|---|
| 1 | shape is `class` | `shorten(filler)` |
| 2 | shape is `not` | `not ` + `shorten(filler)` |
| 3 | `q` is `value` | `prop` + ` value ` + `shorten(filler)` |
| 4 | `q` is `max` and `filler` is absent | `prop` + ` max ` + `n` |
| 5 | `filler` is an array | `prop` + ` only (` + fillers joined by ` or ` + `)` |
| 6 | `n` is present | `prop` + ` ` + `q` + ` ` + `n` + ` ` + `shorten(filler)` |
| 7 | otherwise | `prop` + ` ` + `q` + ` ` + `shorten(filler)` |

**FIX-22** The set of IRIs a restriction points at MUST be the filler when it is a single IRI, every element when it is an array, and empty when the filler is absent `[src: restrictionTargets()]`. This set is what the graph adjacency function and the flattened restriction index both consume.

**FIX-23** Every conjunct of an equivalence axiom MUST be stored as a separate normalised restriction in an ordered list, and rendered as a conjunction in that stored order. The fixture contains no nested or anonymous class expression beyond this one level `[src: buildTBox()]`.

---

## 5. The complete class table

**FIX-24** An implementation MUST create exactly the 70 classes in the table below, in this order, with these parents, these axioms, these disjointness assertions, these spiciness assertions and these annotation comments `[src: CLASS_SPEC]`. The order is load-bearing: parent links are asserted as each class is created, and child lists are only sorted afterwards.

How to read the table:

- **Parent** is the single asserted `rdfs:subClassOf` target. A class whose source parent is absent is attached to `owl:Thing` `[src: buildTBox()]`.
- **Kind** is `Defined` when the source entry carries `defined: true`, otherwise `Primitive` `[src: KIND]`.
- **Axioms** shows `EquivalentTo:` conjuncts joined with `and` for defined classes, and each `SubClassOf:` restriction on its own line for primitive ones, rendered by the rules of **FIX-21**.
- **Disjoint with** lists asserted `owl:disjointWith` targets. Disjointness in this fixture is asserted explicitly in both directions; an implementation MUST NOT infer the reverse direction and omit the assertion.
- **Spiciness** is a separate source key that expands into an additional `SubClassOf:` restriction `[src: buildTBox()]`.
- **Comment** is the `rdfs:comment` annotation. Only seven classes carry one.

| # | Class (`pizza:`) | Parent | Kind | Axioms (Manchester-like) | Disjoint with | Spiciness | Comment |
|---|---|---|---|---|---|---|---|
| 1 | `pizza:DomainConcept` | `owl:Thing` | Primitive | — | — | — | The root of the ontology's own vocabulary, below owl:Thing. |
| 2 | `pizza:Food` | `pizza:DomainConcept` | Primitive | — | — | — | — |
| 3 | `pizza:Pizza` | `pizza:Food` | Primitive | SubClassOf: `pizza:hasBase some pizza:PizzaBase`<br>SubClassOf: `pizza:hasCountryOfOrigin max 1` | `pizza:PizzaBase`, `pizza:PizzaTopping` | — | A pizza. Every pizza must have exactly one base and may carry any number of toppings. |
| 4 | `pizza:PizzaBase` | `pizza:Food` | Primitive | — | `pizza:Pizza`, `pizza:PizzaTopping` | — | — |
| 5 | `pizza:PizzaTopping` | `pizza:Food` | Primitive | — | `pizza:Pizza`, `pizza:PizzaBase` | — | — |
| 6 | `pizza:IceCream` | `pizza:Food` | Primitive | — | — | — | Present in the ontology mainly to demonstrate disjointness with Pizza. |
| 7 | `pizza:Spiciness` | `pizza:DomainConcept` | Primitive | — | — | — | A value partition. Every topping is Mild, Medium or Hot — never two at once. |
| 8 | `pizza:Hot` | `pizza:Spiciness` | Primitive | — | — | — | — |
| 9 | `pizza:Medium` | `pizza:Spiciness` | Primitive | — | — | — | — |
| 10 | `pizza:Mild` | `pizza:Spiciness` | Primitive | — | — | — | — |
| 11 | `pizza:Country` | `pizza:DomainConcept` | Primitive | — | — | — | An enumerated class: America, England, France, Germany, Italy. |
| 12 | `pizza:DeepPanBase` | `pizza:PizzaBase` | Primitive | — | `pizza:ThinAndCrispyBase` | — | — |
| 13 | `pizza:ThinAndCrispyBase` | `pizza:PizzaBase` | Primitive | — | `pizza:DeepPanBase` | — | — |
| 14 | `pizza:CheeseTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 15 | `pizza:FishTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 16 | `pizza:FruitTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 17 | `pizza:HerbSpiceTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 18 | `pizza:MeatTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 19 | `pizza:NutTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 20 | `pizza:SauceTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 21 | `pizza:VegetableTopping` | `pizza:PizzaTopping` | Primitive | — | — | — | — |
| 22 | `pizza:FourCheesesTopping` | `pizza:CheeseTopping` | Primitive | — | — | — | — |
| 23 | `pizza:GoatsCheeseTopping` | `pizza:CheeseTopping` | Primitive | — | — | — | — |
| 24 | `pizza:GorgonzolaTopping` | `pizza:CheeseTopping` | Primitive | — | — | — | — |
| 25 | `pizza:MozzarellaTopping` | `pizza:CheeseTopping` | Primitive | SubClassOf: `pizza:hasCountryOfOrigin value pizza:Italy` | — | — | — |
| 26 | `pizza:ParmesanTopping` | `pizza:CheeseTopping` | Primitive | SubClassOf: `pizza:hasCountryOfOrigin value pizza:Italy` | — | — | — |
| 27 | `pizza:SoyCheeseTopping` | `pizza:CheeseTopping` | Primitive | — | — | — | — |
| 28 | `pizza:AnchoviesTopping` | `pizza:FishTopping` | Primitive | — | — | — | — |
| 29 | `pizza:MixedSeafoodTopping` | `pizza:FishTopping` | Primitive | — | — | — | — |
| 30 | `pizza:PrawnsTopping` | `pizza:FishTopping` | Primitive | — | — | — | — |
| 31 | `pizza:SultanaTopping` | `pizza:FruitTopping` | Primitive | — | — | — | — |
| 32 | `pizza:CajunSpiceTopping` | `pizza:HerbSpiceTopping` | Primitive | — | — | SubClassOf: `pizza:hasSpiciness some pizza:Hot` | — |
| 33 | `pizza:RosemaryTopping` | `pizza:HerbSpiceTopping` | Primitive | — | — | — | — |
| 34 | `pizza:ChickenTopping` | `pizza:MeatTopping` | Primitive | — | — | — | — |
| 35 | `pizza:HamTopping` | `pizza:MeatTopping` | Primitive | — | — | — | — |
| 36 | `pizza:HotSpicedBeefTopping` | `pizza:MeatTopping` | Primitive | — | — | SubClassOf: `pizza:hasSpiciness some pizza:Hot` | — |
| 37 | `pizza:PeperoniSausageTopping` | `pizza:MeatTopping` | Primitive | — | — | SubClassOf: `pizza:hasSpiciness some pizza:Medium` | — |
| 38 | `pizza:SalamiTopping` | `pizza:MeatTopping` | Primitive | — | — | SubClassOf: `pizza:hasSpiciness some pizza:Medium` | — |
| 39 | `pizza:PineKernels` | `pizza:NutTopping` | Primitive | — | — | — | — |
| 40 | `pizza:TobascoPepperSauce` | `pizza:SauceTopping` | Primitive | — | — | SubClassOf: `pizza:hasSpiciness some pizza:Hot` | — |
| 41 | `pizza:PepperTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 42 | `pizza:GreenPepperTopping` | `pizza:PepperTopping` | Primitive | — | — | — | — |
| 43 | `pizza:JalapenoPepperTopping` | `pizza:PepperTopping` | Primitive | — | — | SubClassOf: `pizza:hasSpiciness some pizza:Hot` | — |
| 44 | `pizza:PeperonataTopping` | `pizza:PepperTopping` | Primitive | — | — | — | — |
| 45 | `pizza:SweetPepperTopping` | `pizza:PepperTopping` | Primitive | — | — | — | — |
| 46 | `pizza:ArtichokeTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 47 | `pizza:AsparagusTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 48 | `pizza:CaperTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 49 | `pizza:GarlicTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 50 | `pizza:LeekTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 51 | `pizza:MushroomTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 52 | `pizza:OliveTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 53 | `pizza:OnionTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 54 | `pizza:PetitPoisTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 55 | `pizza:RocketTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 56 | `pizza:SpinachTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 57 | `pizza:SundriedTomatoTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 58 | `pizza:TomatoTopping` | `pizza:VegetableTopping` | Primitive | — | — | — | — |
| 59 | `pizza:NamedPizza` | `pizza:Pizza` | Primitive | — | — | — | A pizza that appears on a menu with a fixed topping list. |
| 60 | `pizza:CheesyPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `pizza:hasTopping some pizza:CheeseTopping` | — | — | — |
| 61 | `pizza:InterestingPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `pizza:hasTopping min 3 pizza:PizzaTopping` | — | — | — |
| 62 | `pizza:MeatyPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `pizza:hasTopping some pizza:MeatTopping` | — | — | — |
| 63 | `pizza:ThinAndCrispyPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `pizza:hasBase some pizza:ThinAndCrispyBase` | — | — | — |
| 64 | `pizza:SpicyPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `pizza:hasTopping some pizza:SpicyTopping` | — | — | — |
| 65 | `pizza:VegetarianPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `pizza:hasTopping only pizza:VegetarianTopping` | — | — | — |
| 66 | `pizza:NonVegetarianPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `not pizza:VegetarianPizza` | — | — | — |
| 67 | `pizza:RealItalianPizza` | `pizza:Pizza` | Defined | EquivalentTo: `pizza:Pizza` and `pizza:hasCountryOfOrigin value pizza:Italy` and `pizza:hasBase only pizza:ThinAndCrispyBase` | — | — | — |
| 68 | `pizza:SpicyTopping` | `pizza:PizzaTopping` | Defined | EquivalentTo: `pizza:PizzaTopping` and `pizza:hasSpiciness some pizza:Hot` | — | — | — |
| 69 | `pizza:VegetarianTopping` | `pizza:PizzaTopping` | Defined | EquivalentTo: `pizza:PizzaTopping` and `not pizza:MeatTopping` and `not pizza:FishTopping` | — | — | — |
| 70 | `pizza:CheeseyVegetableTopping` | `pizza:VegetableTopping` | Defined | EquivalentTo: `pizza:CheeseTopping` and `pizza:VegetableTopping` | — | — | Deliberately unsatisfiable in the tutorial — the two parents are disjoint. |

### 5.1 Derived facts about the class table

These are consequences of the table, and an implementer SHOULD assert them as unit tests.

| Fact | Value |
|---|---|
| Entries in the class table | 70 |
| Defined classes (rows 60–70) | 11 |
| Primitive classes in the table | 59 |
| Classes with an `rdfs:comment` | 7 — rows 1, 3, 6, 7, 11, 59, 70 |
| Classes with a spiciness assertion | 6 — rows 32, 36, 37, 38, 40, 43 |
| Classes with an explicit `owl:disjointWith` | 5 — rows 3, 4, 5, 12, 13 |
| `owl:disjointWith` assertions emitted | 8 |
| Classes with a `SubClassOf:` restriction from the `sub` key | 3 — rows 3 (two restrictions), 25, 26 |
| Distinct top-level topping families (children of `pizza:PizzaTopping`) | 9 — rows 14–21 plus `pizza:SpicyTopping`; `pizza:VegetarianTopping` is a tenth defined child |

**FIX-25** `pizza:Hot`, `pizza:Medium` and `pizza:Mild` MUST be created as classes below `pizza:Spiciness` and additionally flagged as value-partition members `[src: buildTBox()]`. They are **not** created as **Individuals** in this fixture, and the spiciness assertions of rows 32–43 are therefore `some` restrictions over classes, not `value` restrictions over **Individuals**.

**FIX-26** `pizza:CheeseyVegetableTopping` MUST be created exactly as specified, unsatisfiable, and MUST NOT be silently repaired, hidden or reparented. Its annotation explains why it exists `[src: CLASS_SPEC]`.

---

## 6. The complete named pizza table

The 22 named pizzas are created as a second pass, after the class table `[src: buildTBox()]`. They do not appear in the class table and are not declared there.

**FIX-27** An implementation MUST create exactly these 22 classes, each with `pizza:NamedPizza` as its sole parent, kind `class` (primitive), and the annotation comment `A named pizza from the menu.` `[src: buildTBox()]` `[src: NAMED_PIZZAS]`.

| # | Named pizza (`pizza:`) | n | Toppings (`pizza:` local names, in fixture order) |
|---|---|---|---|
| 1 | `pizza:American` | 3 | MozzarellaTopping, PeperoniSausageTopping, TomatoTopping |
| 2 | `pizza:AmericanHot` | 4 | JalapenoPepperTopping, MozzarellaTopping, PeperoniSausageTopping, TomatoTopping |
| 3 | `pizza:Cajun` | 7 | CajunSpiceTopping, MozzarellaTopping, OnionTopping, PeperonataTopping, PrawnsTopping, TobascoPepperSauce, TomatoTopping |
| 4 | `pizza:Capricciosa` | 6 | AnchoviesTopping, CaperTopping, HamTopping, MozzarellaTopping, OliveTopping, TomatoTopping |
| 5 | `pizza:Caprina` | 3 | GoatsCheeseTopping, SundriedTomatoTopping, TomatoTopping |
| 6 | `pizza:Fiorentina` | 6 | GarlicTopping, MozzarellaTopping, OliveTopping, ParmesanTopping, SpinachTopping, TomatoTopping |
| 7 | `pizza:FourSeasons` | 7 | AnchoviesTopping, CaperTopping, MozzarellaTopping, MushroomTopping, OliveTopping, PeperoniSausageTopping, TomatoTopping |
| 8 | `pizza:FruttiDiMare` | 3 | GarlicTopping, MixedSeafoodTopping, TomatoTopping |
| 9 | `pizza:Giardiniera` | 6 | LeekTopping, MozzarellaTopping, MushroomTopping, OliveTopping, PetitPoisTopping, TomatoTopping |
| 10 | `pizza:LaReine` | 5 | HamTopping, MozzarellaTopping, MushroomTopping, OliveTopping, TomatoTopping |
| 11 | `pizza:Margherita` | 2 | MozzarellaTopping, TomatoTopping |
| 12 | `pizza:Mushroom` | 3 | MozzarellaTopping, MushroomTopping, TomatoTopping |
| 13 | `pizza:Napoletana` | 5 | AnchoviesTopping, CaperTopping, MozzarellaTopping, OliveTopping, TomatoTopping |
| 14 | `pizza:Parmense` | 5 | AsparagusTopping, HamTopping, MozzarellaTopping, ParmesanTopping, TomatoTopping |
| 15 | `pizza:PolloAdAstra` | 6 | ChickenTopping, GarlicTopping, MozzarellaTopping, OnionTopping, SweetPepperTopping, TomatoTopping |
| 16 | `pizza:PrinceCarlo` | 5 | LeekTopping, MozzarellaTopping, ParmesanTopping, RosemaryTopping, TomatoTopping |
| 17 | `pizza:QuattroFormaggi` | 2 | FourCheesesTopping, TomatoTopping |
| 18 | `pizza:Rosa` | 3 | GorgonzolaTopping, MozzarellaTopping, TomatoTopping |
| 19 | `pizza:Siciliana` | 5 | GarlicTopping, HamTopping, MozzarellaTopping, OliveTopping, TomatoTopping |
| 20 | `pizza:SloppyGiuseppe` | 5 | GreenPepperTopping, HotSpicedBeefTopping, MozzarellaTopping, OnionTopping, TomatoTopping |
| 21 | `pizza:Soho` | 6 | GarlicTopping, MozzarellaTopping, OliveTopping, ParmesanTopping, RocketTopping, TomatoTopping |
| 22 | `pizza:Veneziana` | 6 | CaperTopping, MozzarellaTopping, OnionTopping, PineKernels, SultanaTopping, TomatoTopping |

Sum of the `n` column: **103**.

### 6.1 The three axiom families every named pizza receives

**FIX-28** For each named pizza, an implementation MUST add one **existential restriction per topping**, in fixture order, before any other axiom `[src: buildTBox()]`:

```
pizza:<Name>  SubClassOf  pizza:hasTopping some pizza:<Topping>
```

Across the 22 pizzas this produces **103** existential restrictions in total.

**FIX-29** For each named pizza, an implementation MUST then add exactly one **universal restriction over the whole topping set** `[src: buildTBox()]`:

```
pizza:<Name>  SubClassOf  pizza:hasTopping only (pizza:<T1> or pizza:<T2> or … or pizza:<Tk>)
```

The disjunction MUST list the toppings in the fixture order given in the table above, and MUST contain exactly the same toppings as the existential restrictions — no more, no fewer. This produces **22** universal restrictions. The complete, rendered text of all 22 is:

```
pizza:American          → pizza:hasTopping only (pizza:MozzarellaTopping or pizza:PeperoniSausageTopping or pizza:TomatoTopping)
pizza:AmericanHot       → pizza:hasTopping only (pizza:JalapenoPepperTopping or pizza:MozzarellaTopping or pizza:PeperoniSausageTopping or pizza:TomatoTopping)
pizza:Cajun             → pizza:hasTopping only (pizza:CajunSpiceTopping or pizza:MozzarellaTopping or pizza:OnionTopping or pizza:PeperonataTopping or pizza:PrawnsTopping or pizza:TobascoPepperSauce or pizza:TomatoTopping)
pizza:Capricciosa       → pizza:hasTopping only (pizza:AnchoviesTopping or pizza:CaperTopping or pizza:HamTopping or pizza:MozzarellaTopping or pizza:OliveTopping or pizza:TomatoTopping)
pizza:Caprina           → pizza:hasTopping only (pizza:GoatsCheeseTopping or pizza:SundriedTomatoTopping or pizza:TomatoTopping)
pizza:Fiorentina        → pizza:hasTopping only (pizza:GarlicTopping or pizza:MozzarellaTopping or pizza:OliveTopping or pizza:ParmesanTopping or pizza:SpinachTopping or pizza:TomatoTopping)
pizza:FourSeasons       → pizza:hasTopping only (pizza:AnchoviesTopping or pizza:CaperTopping or pizza:MozzarellaTopping or pizza:MushroomTopping or pizza:OliveTopping or pizza:PeperoniSausageTopping or pizza:TomatoTopping)
pizza:FruttiDiMare      → pizza:hasTopping only (pizza:GarlicTopping or pizza:MixedSeafoodTopping or pizza:TomatoTopping)
pizza:Giardiniera       → pizza:hasTopping only (pizza:LeekTopping or pizza:MozzarellaTopping or pizza:MushroomTopping or pizza:OliveTopping or pizza:PetitPoisTopping or pizza:TomatoTopping)
pizza:LaReine           → pizza:hasTopping only (pizza:HamTopping or pizza:MozzarellaTopping or pizza:MushroomTopping or pizza:OliveTopping or pizza:TomatoTopping)
pizza:Margherita        → pizza:hasTopping only (pizza:MozzarellaTopping or pizza:TomatoTopping)
pizza:Mushroom          → pizza:hasTopping only (pizza:MozzarellaTopping or pizza:MushroomTopping or pizza:TomatoTopping)
pizza:Napoletana        → pizza:hasTopping only (pizza:AnchoviesTopping or pizza:CaperTopping or pizza:MozzarellaTopping or pizza:OliveTopping or pizza:TomatoTopping)
pizza:Parmense          → pizza:hasTopping only (pizza:AsparagusTopping or pizza:HamTopping or pizza:MozzarellaTopping or pizza:ParmesanTopping or pizza:TomatoTopping)
pizza:PolloAdAstra      → pizza:hasTopping only (pizza:ChickenTopping or pizza:GarlicTopping or pizza:MozzarellaTopping or pizza:OnionTopping or pizza:SweetPepperTopping or pizza:TomatoTopping)
pizza:PrinceCarlo       → pizza:hasTopping only (pizza:LeekTopping or pizza:MozzarellaTopping or pizza:ParmesanTopping or pizza:RosemaryTopping or pizza:TomatoTopping)
pizza:QuattroFormaggi   → pizza:hasTopping only (pizza:FourCheesesTopping or pizza:TomatoTopping)
pizza:Rosa              → pizza:hasTopping only (pizza:GorgonzolaTopping or pizza:MozzarellaTopping or pizza:TomatoTopping)
pizza:Siciliana         → pizza:hasTopping only (pizza:GarlicTopping or pizza:HamTopping or pizza:MozzarellaTopping or pizza:OliveTopping or pizza:TomatoTopping)
pizza:SloppyGiuseppe    → pizza:hasTopping only (pizza:GreenPepperTopping or pizza:HotSpicedBeefTopping or pizza:MozzarellaTopping or pizza:OnionTopping or pizza:TomatoTopping)
pizza:Soho              → pizza:hasTopping only (pizza:GarlicTopping or pizza:MozzarellaTopping or pizza:OliveTopping or pizza:ParmesanTopping or pizza:RocketTopping or pizza:TomatoTopping)
pizza:Veneziana         → pizza:hasTopping only (pizza:CaperTopping or pizza:MozzarellaTopping or pizza:OnionTopping or pizza:PineKernels or pizza:SultanaTopping or pizza:TomatoTopping)
```

**FIX-30** For each named pizza, an implementation MUST finally add exactly one **country-of-origin value assertion** `[src: buildTBox()]`:

```
pizza:<Name>  SubClassOf  pizza:hasCountryOfOrigin value pizza:Italy
```

This is applied to **all 22** named pizzas without exception, producing **22** value assertions. It is applied uniformly in the reference build; see [§17](#17-fidelity-notes-non-normative) for the fidelity consequence.

**FIX-31** The restriction list of a named pizza MUST therefore have exactly `k + 2` entries, where `k` is the topping count, ordered: the `k` existentials in fixture order, then the universal, then the country value assertion. Across the fixture this is `103 + 22 + 22 = 147` restrictions.

**FIX-32** Every topping named in the named pizza table MUST already exist as a class from the class table. The fixture uses **33** distinct topping classes across all 22 pizzas, and introduces none that the class table does not declare `[src: NAMED_PIZZAS]` `[src: CLASS_SPEC]`.

---

## 7. The complete object property table

**FIX-33** An implementation MUST create exactly these eight `pizza:` object properties, in this order, with these sub-property links, domains, ranges, characteristics and inverses `[src: OBJ_PROPS]`.

| # | Property (`pizza:`) | Sub-property of | Domain | Range | Characteristics | Inverse |
|---|---|---|---|---|---|---|
| 1 | `pizza:hasIngredient` | — (top-level) | `pizza:Food` | `pizza:Food` | Transitive | `pizza:isIngredientOf` |
| 2 | `pizza:hasBase` | `pizza:hasIngredient` | `pizza:Pizza` | `pizza:PizzaBase` | Functional, InverseFunctional | `pizza:isBaseOf` |
| 3 | `pizza:hasTopping` | `pizza:hasIngredient` | `pizza:Pizza` | `pizza:PizzaTopping` | InverseFunctional | `pizza:isToppingOf` |
| 4 | `pizza:isIngredientOf` | — (top-level) | `pizza:Food` | `pizza:Food` | Transitive | `pizza:hasIngredient` |
| 5 | `pizza:isBaseOf` | `pizza:isIngredientOf` | `pizza:PizzaBase` | `pizza:Pizza` | Functional | `pizza:hasBase` |
| 6 | `pizza:isToppingOf` | `pizza:isIngredientOf` | `pizza:PizzaTopping` | `pizza:Pizza` | Functional | `pizza:hasTopping` |
| 7 | `pizza:hasSpiciness` | — (top-level) | `pizza:PizzaTopping` | `pizza:Spiciness` | Functional | — (none asserted) |
| 8 | `pizza:hasCountryOfOrigin` | — (top-level) | — (none asserted) | `pizza:Country` | — (none) | — (none asserted) |

**FIX-34** A property with no asserted sub-property parent MUST be attached to no parent at all — it MUST NOT be attached to `owl:topObjectProperty` or to `owl:Thing` `[src: buildTBox()]`. Four properties have a parent (rows 2, 3, 5, 6) and four do not.

**FIX-35** `pizza:hasCountryOfOrigin` MUST have **no** asserted domain `[src: OBJ_PROPS]`. This is deliberate: it is asserted on toppings, on named pizzas and on the `pizza:RealItalianPizza` equivalence axiom, so a domain would over-constrain it. Seven of the eight properties carry a domain; all eight carry a range.

**FIX-36** The inverse relation MUST be stored on both members of each pair, giving three declared pairs — `hasIngredient`/`isIngredientOf`, `hasBase`/`isBaseOf`, `hasTopping`/`isToppingOf` — and two properties (`hasSpiciness`, `hasCountryOfOrigin`) with no inverse `[src: OBJ_PROPS]`.

**FIX-37** Property characteristics MUST be stored as an ordered list of the exact tokens `Transitive`, `Functional`, `InverseFunctional`. No other characteristic token appears in this fixture `[src: OBJ_PROPS]`.

**FIX-38** The reference build emits `rdf:type owl:ObjectProperty`, and where present `rdfs:subPropertyOf`, `rdfs:domain` and `rdfs:range`, as **TBox** triples for each object property. It does **not** emit characteristic or inverse triples; those are held on the **Entity** record only `[src: buildTBox()]`. An implementation MUST reproduce this, because the **TBox** triple total in [§13](#13-triple-accounting) depends on it.

---

## 8. Country individuals and the spiciness value partition

### 8.1 Countries

**FIX-39** An implementation MUST create exactly five `pizza:` **Individuals**, in this order, each typed `pizza:Country` and each carrying the comment `Named individual of pizza:Country.` `[src: COUNTRIES]` `[src: buildTBox()]`.

| # | Individual | Type | Comment |
|---|---|---|---|
| 1 | `pizza:America` | `pizza:Country` | Named individual of pizza:Country. |
| 2 | `pizza:England` | `pizza:Country` | Named individual of pizza:Country. |
| 3 | `pizza:France` | `pizza:Country` | Named individual of pizza:Country. |
| 4 | `pizza:Germany` | `pizza:Country` | Named individual of pizza:Country. |
| 5 | `pizza:Italy` | `pizza:Country` | Named individual of pizza:Country. |

**FIX-40** These five **Individuals** MUST be counted in the individual total alongside the generated `demo:` records `[src: individualCount()]`. They are the only `pizza:`-namespace **Individuals** in the product.

**FIX-41** Each country **Individual** MUST emit exactly one **TBox** triple, `<individual> rdf:type pizza:Country`. The comment on a country **Individual** MUST NOT be emitted as a triple `[src: buildTBox()]`.

**FIX-42** Only `pizza:Italy` is referenced by an axiom. It is the filler of 25 value restrictions: two topping subclass restrictions (rows 25 and 26 of the class table), the `pizza:RealItalianPizza` equivalence conjunct, and the 22 named pizza country assertions. `pizza:America`, `pizza:England`, `pizza:France` and `pizza:Germany` are declared and unreferenced, and MUST remain so.

**FIX-43** `pizza:Country` is annotated as an enumerated class but the fixture asserts **no** `owl:oneOf` axiom `[src: CLASS_SPEC]` `[src: buildTBox()]`. An implementation MUST NOT synthesise one.

### 8.2 The spiciness value partition

**FIX-44** The spiciness value partition MUST consist of the class `pizza:Spiciness` and its three children `pizza:Hot`, `pizza:Medium`, `pizza:Mild`, and these three MUST additionally be flagged as value-partition members so that a **Surface** may present them differently from ordinary classes `[src: buildTBox()]`.

| Member | Parent | Value-partition flag | Referenced by |
|---|---|---|---|
| `pizza:Hot` | `pizza:Spiciness` | yes | 4 topping restrictions (rows 32, 36, 40, 43) and the `pizza:SpicyTopping` equivalence axiom |
| `pizza:Medium` | `pizza:Spiciness` | yes | 2 topping restrictions (rows 37, 38) |
| `pizza:Mild` | `pizza:Spiciness` | yes | none |

**FIX-45** Flagging a value-partition member MUST NOT change its kind. All three remain classes and are counted as classes `[src: classCount()]`.

---

## 9. The `demo:` namespace vocabulary

The `demo:` vocabulary is small by design: two classes, five data properties and one object property. It exists to describe generated order records and nothing else.

### 9.1 Demo classes

**FIX-46** An implementation MUST create exactly these two `demo:` classes, each with `owl:Thing` as its sole parent, each emitting `rdfs:subClassOf owl:Thing` as a **TBox** triple `[src: DEMO_CLASSES]` `[src: buildTBox()]`.

| # | Class | Parent | Kind | Comment (verbatim) |
|---|---|---|---|---|
| 1 | `demo:Order` | `owl:Thing` | class (primitive) | Generated demo data. One physical pizza produced at a branch. |
| 2 | `demo:Customer` | `owl:Thing` | class (primitive) | Generated demo data. |

**FIX-47** The comments on the two `demo:` classes MUST NOT be emitted as `rdfs:comment` triples; they are carried on the **Entity** record only `[src: buildTBox()]`. This differs from the seven `pizza:` class comments, which are emitted.

### 9.2 Demo data properties

**FIX-48** An implementation MUST create exactly these five `demo:` data properties, in this order, each with domain `demo:Order`, each with the stated `xsd:` range, each carrying the stated comment, and each emitting exactly one **TBox** triple `rdf:type owl:DatatypeProperty` `[src: DEMO_DATA_PROPS]` `[src: buildTBox()]`.

| # | Data property | Range (datatype) | Domain | Comment (verbatim) | Backing record field |
|---|---|---|---|---|---|
| 1 | `demo:orderRef` | `xsd:string` | `demo:Order` | Human-readable order reference. | `ref` |
| 2 | `demo:branch` | `xsd:string` | `demo:Order` | Branch that produced the pizza. | `branch` |
| 3 | `demo:priceGBP` | `xsd:decimal` | `demo:Order` | Price paid, in pounds sterling. | `price` |
| 4 | `demo:preparedAt` | `xsd:dateTime` | `demo:Order` | Timestamp the pizza left the oven. | `ts`, rendered as an ISO 8601 instant |
| 5 | `demo:rating` | `xsd:integer` | `demo:Order` | Customer rating, 1 to 5. | `rating` |

**FIX-49** The domain and range of a `demo:` data property MUST be stored on the **Entity** record but MUST NOT be emitted as `rdfs:domain` or `rdfs:range` triples `[src: buildTBox()]`. Only the `rdf:type` triple is emitted. An implementation that emits them will produce a **TBox** triple total of 249 rather than 239 and will fail the checks of [§16](#16-verification-checklist).

### 9.3 The demo object property

**FIX-50** An implementation MUST create exactly one `demo:` object property `[src: buildTBox()]`.

| Property | Domain | Range | Characteristics | Inverse | Comment (verbatim) | Triples emitted |
|---|---|---|---|---|---|---|
| `demo:orderedBy` | `demo:Order` | `demo:Customer` | none | none | Generated demo data. Links a produced pizza to its customer. | `rdf:type owl:ObjectProperty` only |

### 9.4 The undeclared label property

**FIX-51** Customer records are matched by `rdfs:label` in the query evaluator, yielding a string literal of the customer's display name `[src: scan()]`. The fixture declares **no** `rdfs:label` **Entity**. An implementation MUST reproduce this: `rdfs:label` is answerable but not declared, and MUST NOT appear in the property tree.

---

## 10. TBox load order and triple emission

**FIX-52** `buildTBox` MUST run exactly once per process, before any **ABox** generation, and MUST execute its stages in this order `[src: buildTBox()]` `[src: init()]`:

| Stage | What it creates | Entities added |
|---|---|---|
| 1 | `owl:Thing`, with the comment `The universal class. Everything is a Thing.` | 1 |
| 2 | The 70 classes of the class table, with their axioms, disjointness and spiciness | 70 |
| 3 | The 22 named pizzas, with their three axiom families | 22 |
| 4 | The 8 `pizza:` object properties | 8 |
| 5 | The 5 `pizza:` country **Individuals** | 5 |
| 6 | The value-partition flags on `pizza:Hot`, `pizza:Medium`, `pizza:Mild` | 0 (mutates existing) |
| 7 | The 2 `demo:` classes | 2 |
| 8 | The 5 `demo:` data properties | 5 |
| 9 | `demo:orderedBy` | 1 |
| 10 | Child-link back-fill: for every **Entity**, append it to each parent's child list if not already present | 0 |
| 11 | Child-list sort: every child list sorted by local name, ordinal-insensitive, using the platform's culture-aware string comparison | 0 |
| | **Total entities** | **114** |

**FIX-53** The child-link back-fill of stage 10 MUST be idempotent: an **Entity** MUST NOT appear twice in any parent's child list `[src: buildTBox()]`.

**FIX-54** The child-list sort of stage 11 MUST sort by **local name**, not by full IRI and not by display label `[src: buildTBox()]`.

**FIX-55** The **TBox** triple store MUST contain exactly **239** triples after `buildTBox` completes, distributed by predicate as follows `[src: buildTBox()]`.

| Predicate | Count | Sources |
|---|---|---|
| `rdf:type` | 111 | 70 class-table classes + 22 named pizzas (each `owl:Class`), 8 `pizza:` object properties, 5 country **Individuals**, 5 `demo:` data properties, 1 `demo:orderedBy` |
| `rdfs:subClassOf` | 94 | 70 class-table classes + 22 named pizzas + 2 `demo:` classes |
| `owl:disjointWith` | 8 | Rows 3, 4, 5 (two each) and rows 12, 13 (one each) |
| `rdfs:range` | 8 | All 8 `pizza:` object properties |
| `rdfs:comment` | 7 | The seven annotated `pizza:` classes of the class table |
| `rdfs:domain` | 7 | 7 of 8 `pizza:` object properties; `pizza:hasCountryOfOrigin` has none |
| `rdfs:subPropertyOf` | 4 | `hasBase`, `hasTopping`, `isBaseOf`, `isToppingOf` |
| **Total** | **239** | |

**FIX-56** Restrictions, equivalence axioms, characteristics, inverses and the `demo:` comments MUST NOT be emitted as **TBox** triples `[src: buildTBox()]`. They are held on the **Entity** record and, for the subset described in [§14](#14-the-flattened-restriction-index), in a separate flattened index.

**FIX-57** After `buildTBox` completes, the aggregate figures MUST be exactly:

| Figure | Value | Derivation |
|---|---|---|
| Entities in the **Store** | 114 | 1 + 70 + 22 + 8 + 5 + 2 + 5 + 1 |
| Classes reported `[src: classCount()]` | 95 | `owl:Thing` + 70 + 22 + 2 |
| — of which defined | 11 | Rows 60–70 of the class table |
| — of which primitive | 84 | 95 − 11 |
| Properties reported `[src: propCount()]` | 14 | 8 `pizza:` object + 1 `demo:` object + 5 `demo:` data |
| **Individuals** declared as entities | 5 | The countries |
| Stored restrictions | 157 | 10 from the class table + 147 from the named pizzas |
| Stored equivalence conjuncts | 24 | Across the 11 defined classes |
| Stored disjointness assertions | 8 | |
| **TBox** triples | 239 | See **FIX-55** |

The 10 class-table restrictions are: 2 on `pizza:Pizza`, 1 each on `pizza:MozzarellaTopping` and `pizza:ParmesanTopping`, and 6 spiciness assertions. The 24 equivalence conjuncts are 2 each for rows 60–66 and 68, and 3 each for rows 67 and 69, and 2 for row 70.

---

## 11. The ABox generator

The **ABox** is produced by one function from one seed. It is the reason this fixture can back a numeric acceptance suite at all.

### 11.1 Determinism

**FIX-58** **ABox** generation MUST be reproducible. For a given size `n`, the same seed MUST yield a byte-identical dataset — the same IRIs, the same types, the same branches, the same prices, the same timestamps, the same ratings and the same customer assignments, in the same order `[src: generateIndividuals()]` `[src: rnd()]`.

**FIX-59** The generator MUST reset the random state to the fixed seed at the start of every generation run, before any record is produced `[src: generateIndividuals()]`. It MUST NOT carry state over from a previous run, and MUST NOT consult a clock, a hardware entropy source, a process identifier or any platform default random source.

**FIX-60** The generator MUST NOT be parallelised in a way that changes the draw order. The draw order given in [§11.4](#114-the-draw-order) is part of the fixture.

### 11.2 The pseudo-random generator

**FIX-61** The generator MUST be the linear congruential generator below, with exactly these parameters `[src: rnd()]`.

| Parameter | Value |
|---|---|
| Multiplier `a` | 1664525 |
| Increment `c` | 1013904223 |
| Modulus `m` | 4294967296 (2³²) |
| Seed | 20250911 |
| Output | `state / 4294967296`, a value in the half-open interval [0, 1) |

Pseudocode:

```
1  state ← 20250911                       // reset at the start of every generation
2  function rnd():
3      state ← (state × 1664525 + 1013904223) mod 4294967296
4      return state ÷ 4294967296
```

**FIX-62** The state MUST be held as an unsigned 32-bit integer. The multiply-and-add MUST be evaluated exactly and then reduced modulo 2³²; natural 32-bit unsigned wraparound produces the identical result and is permitted `[src: rnd()]`.

**FIX-63** Selecting from a list MUST be `list[⌊rnd() × length(list)⌋]`, truncating toward zero `[src: generateIndividuals()]`. Because `rnd()` never returns 1, the index is always in range.

### 11.3 Source lists

**FIX-64** The branch list MUST be exactly these six values, in this order `[src: BRANCHES]`.

| # | Branch |
|---|---|
| 1 | Soho |
| 2 | Shoreditch |
| 3 | Camden |
| 4 | Clerkenwell |
| 5 | Borough |
| 6 | Islington |

**FIX-65** The first-name list MUST be exactly these 26 values, in this order `[src: FIRST_NAMES]`.

| # | First name | # | First name |
|---|---|---|---|
| 1 | Ada | 14 | Nadia |
| 2 | Bruno | 15 | Omar |
| 3 | Chidi | 16 | Petra |
| 4 | Dara | 17 | Quinn |
| 5 | Elif | 18 | Rosa |
| 6 | Farid | 19 | Sami |
| 7 | Greta | 20 | Tariq |
| 8 | Hana | 21 | Ursula |
| 9 | Idris | 22 | Viktor |
| 10 | Jonna | 23 | Wren |
| 11 | Kofi | 24 | Xiulan |
| 12 | Lena | 25 | Yusuf |
| 13 | Milo | 26 | Zara |

**FIX-66** The last-name list MUST be exactly these 25 values, in this order `[src: LAST_NAMES]`.

| # | Last name | # | Last name |
|---|---|---|---|
| 1 | Abara | 14 | Novak |
| 2 | Bianchi | 15 | Okafor |
| 3 | Costa | 16 | Peeters |
| 4 | Duarte | 17 | Quintana |
| 5 | Esposito | 18 | Rossi |
| 6 | Ferrari | 19 | Sato |
| 7 | Greco | 20 | Tremblay |
| 8 | Haddad | 21 | Ueda |
| 9 | Ionescu | 22 | Varga |
| 10 | Jensen | 23 | Weber |
| 11 | Kowalski | 24 | Yilmaz |
| 12 | Lombardi | 25 | Zanetti |
| 13 | Moreau | | |

The two lists are of different lengths — 26 first names and 25 last names — and the difference MUST be preserved, because it changes every draw that follows.

**FIX-67** The pizza-type list MUST be the keys of the named pizza table in **fixture order**, which is the order of [§6](#6-the-complete-named-pizza-table) — `American`, `AmericanHot`, `Cajun`, `Capricciosa`, `Caprina`, `Fiorentina`, `FourSeasons`, `FruttiDiMare`, `Giardiniera`, `LaReine`, `Margherita`, `Mushroom`, `Napoletana`, `Parmense`, `PolloAdAstra`, `PrinceCarlo`, `QuattroFormaggi`, `Rosa`, `Siciliana`, `SloppyGiuseppe`, `Soho`, `Veneziana` `[src: PIZZA_NAMES]`. It MUST NOT be re-sorted; the index drawn from it selects by position.

**FIX-68** The base price table MUST be exactly these 22 entries `[src: BASE_PRICE]`. The values are in pounds sterling.

| # | Pizza type | Base price (£) |
|---|---|---|
| 1 | Margherita | 8.50 |
| 2 | Mushroom | 9.00 |
| 3 | American | 10.50 |
| 4 | AmericanHot | 11.00 |
| 5 | Napoletana | 11.50 |
| 6 | Veneziana | 11.00 |
| 7 | Capricciosa | 12.50 |
| 8 | FourSeasons | 12.50 |
| 9 | LaReine | 11.50 |
| 10 | Siciliana | 12.00 |
| 11 | Soho | 12.00 |
| 12 | Fiorentina | 12.00 |
| 13 | Giardiniera | 11.00 |
| 14 | Caprina | 12.00 |
| 15 | Cajun | 13.50 |
| 16 | FruttiDiMare | 14.00 |
| 17 | Parmense | 12.50 |
| 18 | PolloAdAstra | 12.50 |
| 19 | PrinceCarlo | 12.00 |
| 20 | QuattroFormaggi | 12.00 |
| 21 | Rosa | 11.50 |
| 22 | SloppyGiuseppe | 12.00 |

**FIX-69** A type with no entry in the base price table MUST fall back to a base of £11.00 `[src: generateIndividuals()]`. All 22 types have entries, so the fallback is unreachable with this fixture; it MUST still be implemented, so that adding a type later cannot produce a null price.

### 11.4 The draw order

**FIX-70** The generator MUST make its draws in exactly this order `[src: generateIndividuals()]`.

| Phase | Per item | Draws | In order |
|---|---|---|---|
| Customers | per customer | 2 | 1 first name, 2 last name |
| Orders | per order | 7 | 1 pizza type, 2 branch, 3 price jitter, 4 timestamp offset, 5 rating tier, 6 low-rating trigger, 7 customer index |

**FIX-71** All customers MUST be generated before the first order. Total draws for a dataset of size `n` with `c` customers are therefore `2c + 7n`, and the first order's values depend on `c`. A change to the customer count changes every order.

**FIX-72** The rating expression MUST evaluate its two draws left to right: the tier draw first, the low-rating trigger second `[src: generateIndividuals()]`. Reversing them produces a different, silently wrong dataset.

### 11.5 The generation algorithm

**FIX-73** Generation MUST follow this algorithm exactly `[src: generateIndividuals()]`.

```
 1  function generateIndividuals(n):
 2      state ← 20250911
 3      clear the individual array, the IRI index, the type index, the customer array
 4
 5      customerCount ← max(24, round(n ÷ 8))
 6      for i from 0 to customerCount − 1:
 7          name ← pick(FIRST_NAMES) + " " + pick(LAST_NAMES)
 8          iri  ← demo: + "Customer_" + zeroPad(i + 1, 6)
 9          append { iri, name } to the customer array
10
11      start ← 1785542400                      // seconds; 2026-08-01T00:00:00Z
12      pad   ← max(6, digitCount(n))
13
14      for i from 0 to n − 1:
15          type   ← pick(PIZZA_NAMES)
16          branch ← pick(BRANCHES)
17          base   ← BASE_PRICE[type] if present else 11
18          record ← {
19              i:        i,
20              iri:      demo: + "Pizza_" + zeroPad(i + 1, pad),
21              type:     pizza: + type,
22              typeName: type,
23              ref:      "AX-" + lastSixCharacters(decimalString(100000 + i)),
24              branch:   branch,
25              price:    round((base + (rnd() × 3 − 1)) × 100) ÷ 100,
26              ts:       (start + floor(rnd() × 2592000)) × 1000,
27              rating:   3 + floor(rnd() × 3) − (2 if rnd() < 0.12 else 0),
28              cust:     floor(rnd() × customerCount)
29          }
30          if record.rating < 1: record.rating ← 1
31          if record.rating > 5: record.rating ← 5
32          append record to the individual array
33          index record by IRI
34          append record to the type bucket for record.type, creating the bucket if absent
35
36      generatedCount ← n
37      version ← version + 1
```

### 11.6 Each field in detail

**FIX-74 — Customer count.** The customer count MUST be `max(24, round(n ÷ 8))` `[src: generateIndividuals()]`. Rounding is half away from zero at the midpoint. The floor of 24 exists so that a very small dataset still has enough customers to be interesting; it binds only for `n < 192`, and none of the four offered sizes reaches it.

**FIX-75 — Customer IRI.** A customer IRI MUST be `demo:Customer_` followed by the one-based index zero-padded to exactly **6** digits `[src: generateIndividuals()]`. The customer padding is fixed at 6 and MUST NOT vary with the dataset size.

**FIX-76 — Customer name.** A customer name MUST be a first name, a single space, and a last name `[src: generateIndividuals()]`. Names are not de-duplicated; collisions are expected and MUST NOT be repaired. The name is not stored as a triple on the record but is answerable as `rdfs:label` `[src: scan()]`.

**FIX-77 — Individual IRI padding.** The order IRI MUST be `demo:Pizza_` followed by the one-based index zero-padded to `pad` digits, where `pad` is 6 when `n` has fewer than 6 decimal digits and `digitCount(n)` otherwise `[src: generateIndividuals()]`.

| `n` | `digitCount(n)` | `pad` | First IRI | Last IRI |
|---|---|---|---|---|
| 1,000 | 4 | 6 | `demo:Pizza_000001` | `demo:Pizza_001000` |
| 12,000 | 5 | 6 | `demo:Pizza_000001` | `demo:Pizza_012000` |
| 50,000 | 5 | 6 | `demo:Pizza_000001` | `demo:Pizza_050000` |
| 100,000 | 6 | 6 | `demo:Pizza_000001` | `demo:Pizza_100000` |
| 1,000,000 | 7 | 7 | `demo:Pizza_0000001` | `demo:Pizza_1000000` |

**FIX-78 — Order reference format.** The order reference MUST be the literal `AX-` followed by the **last six characters** of the decimal string of `100000 + i`, where `i` is the **zero-based** index `[src: generateIndividuals()]`.

The one-based IRI and the zero-based reference are deliberately out of step: `demo:Pizza_000001` carries reference `AX-100000`. This off-by-one MUST be reproduced.

| Zero-based `i` | `100000 + i` | Reference |
|---|---|---|
| 0 | 100000 | `AX-100000` |
| 1 | 100001 | `AX-100001` |
| 11,999 | 111999 | `AX-111999` |
| 99,999 | 199999 | `AX-199999` |
| 899,999 | 999999 | `AX-999999` |
| 900,000 | 1000000 | `AX-000000` — wraps |

**FIX-79** Order references MUST be unique for any `n` ≤ 900,000. Beyond that the last-six-characters rule wraps and references collide. The reference is a display value, not an identity; identity is the IRI `[src: generateIndividuals()]`. An implementation MUST NOT use the reference as a key.

**FIX-80 — Price jitter.** The price MUST be `round((base + (rnd() × 3 − 1)) × 100) ÷ 100` `[src: generateIndividuals()]`.

| Property | Value |
|---|---|
| Jitter range | [−1.00, +2.00), continuous, uniform |
| Mean jitter | +0.50 |
| Rounding | To two decimal places, half away from zero at the midpoint |
| Minimum possible price | £7.50 (Margherita at base 8.50 with jitter −1.00) |
| Maximum possible price | £16.00 (FruttiDiMare at base 14.00 approaching jitter +2.00) |
| Observed range at n = 12,000 | £7.50 to £16.00 |

**FIX-81 — Timestamp base and range.** The timestamp MUST be `(start + ⌊rnd() × 2592000⌋) × 1000`, in milliseconds since the Unix epoch `[src: generateIndividuals()]`.

| Property | Value |
|---|---|
| `start` | 1785542400 seconds = **2026-08-01T00:00:00Z** |
| Range | 2,592,000 seconds = exactly 30 days |
| Earliest possible instant | 2026-08-01T00:00:00Z |
| Latest possible instant | 2026-08-30T23:59:59Z |
| Resolution | Whole seconds; the millisecond component is always zero |
| Time zone | The stored instant is UTC. Display is a presentation concern owned by [`31-individuals-table.md`](31-individuals-table.md) |

August 2026 is chosen as a month entirely in the future relative to the reference build's authoring date, so that no generated order can be mistaken for a real one.

**FIX-82 — Rating derivation.** The rating MUST be `3 + ⌊rnd() × 3⌋ − (2 if rnd() < 0.12 else 0)`, then clamped to the closed range [1, 5] `[src: generateIndividuals()]`.

| Step | Effect |
|---|---|
| Tier draw | Produces 3, 4 or 5 with equal probability |
| Low-rating probability | **0.12** — a strictly-less-than comparison against the second draw |
| Penalty | Subtract 2 when the trigger fires, producing 1, 2 or 3 |
| Clamp | Lower bound 1, upper bound 5 |

The clamp is unreachable with these parameters — the expression already spans exactly 1 to 5 — and MUST nevertheless be implemented as a guard `[src: generateIndividuals()]`.

Resulting theoretical distribution: P(1) = P(2) = 0.04, P(3) = 0.3333, P(4) = P(5) = 0.2933.

**FIX-83 — Customer assignment.** The customer index MUST be `⌊rnd() × customerCount⌋`, a zero-based index into the customer array `[src: generateIndividuals()]`. It is stored as an integer index, not as an IRI; the IRI is resolved on read `[src: COLS]`.

**FIX-84 — Indexes built during generation.** Generation MUST populate, in one pass, the ordered individual array, an IRI-to-record index, and a type-to-records bucket index keyed by the full `pizza:` class IRI `[src: generateIndividuals()]`. Buckets MUST be created lazily and MUST preserve insertion order, which is ascending order of `i`.

**FIX-85 — Version bump.** Generation MUST increment the **Store** version counter exactly once, at the end `[src: generateIndividuals()]`.

**FIX-86** Regeneration MUST invalidate every derived structure computed from the **ABox**: the customer reverse index, the **Viewport** node and edge sets, the **Focus set**, the table filter state, and the type filter options `[src: regenerate()]`.

---

## 12. Dataset sizes

**FIX-87** An implementation MUST offer exactly these four dataset sizes, in this order, with these labels `[src: #scaleMenu]`.

| # | Size `n` | Menu label | Customers `c = max(24, round(n/8))` | Individuals reported `n + c + 5` | Triples counted `239 + 7n + 2c` |
|---|---|---|---|---|---|
| 1 | 1,000 | 1,000 pizzas | 125 | 1,130 | 7,489 |
| 2 | 12,000 | 12,000 pizzas | 1,500 | 13,505 | 87,239 |
| 3 | 50,000 | 50,000 pizzas | 6,250 | 56,255 | 362,739 |
| 4 | 100,000 | 100,000 pizzas | 12,500 | 112,505 | 725,239 |

The arithmetic, shown in full:

| `n` | `c` | `n + c + 5` | `7n` | `2c` | `239 + 7n + 2c` |
|---|---|---|---|---|---|
| 1,000 | round(125) = 125 | 1,000 + 125 + 5 = 1,130 | 7,000 | 250 | 239 + 7,000 + 250 = **7,489** |
| 12,000 | round(1,500) = 1,500 | 12,000 + 1,500 + 5 = 13,505 | 84,000 | 3,000 | 239 + 84,000 + 3,000 = **87,239** |
| 50,000 | round(6,250) = 6,250 | 50,000 + 6,250 + 5 = 56,255 | 350,000 | 12,500 | 239 + 350,000 + 12,500 = **362,739** |
| 100,000 | round(12,500) = 12,500 | 100,000 + 12,500 + 5 = 112,505 | 700,000 | 25,000 | 239 + 700,000 + 25,000 = **725,239** |

**FIX-88** The default dataset size at start-up MUST be **12,000** `[src: init()]`.

**FIX-89** The secondary text on each size menu item MUST state the triple figure that the product's own counting function will report for that size — **7,489**, **87,239**, **362,739** and **725,239** respectively, formatted with the product's thousands grouping.

**Defect to be corrected in the product.** The reference build's menu items state `~8K triples`, `~92K triples`, `~383K triples` and `~766K triples` `[src: #scaleMenu]`, none of which equals the value the status bar then shows `[src: tripleCount()]` `[src: updateStoreUI()]`. The discrepancy reaches 40,761 triples at the largest size. **FIX-89** supersedes those labels; an implementation MUST NOT copy them.

**FIX-90** After regeneration the product MUST report the new figures in a confirmation message naming the triple count, the individual count, the elapsed milliseconds and the standing **Budget**, in the form used by the reference build: *"Store rebuilt: {triples} triples, {individuals} individuals, in {ms} ms. The viewport still holds at most {budget} nodes."* `[src: regenerate()]`

**FIX-91** An implementation MAY accept sizes beyond the four offered, and MUST apply the same arithmetic if it does. The IRI padding rule of **FIX-77** is what makes sizes above 999,999 well-formed.

---

## 13. Triple accounting

The product never materialises the **ABox** as triples. It counts them `[src: tripleCount()]`.

**FIX-92** The reported triple total MUST be

```
tripleCount = |TBox triples| + 7 × |orders| + 2 × |customers|
```

with the **TBox** figure fixed at 239 by **FIX-55** `[src: tripleCount()]`.

**FIX-93** The seven triples attributed to each order MUST correspond to exactly these assertions `[src: tripleCount()]` `[src: scan()]` `[src: DEMO_PRED]`.

| # | Predicate | Object | Notes |
|---|---|---|---|
| 1 | `rdf:type` | the order's `pizza:` named pizza class | The `demo:` → `pizza:` join of **FIX-13** |
| 2 | `demo:orderRef` | `xsd:string` literal | From the `ref` field |
| 3 | `demo:branch` | `xsd:string` literal | From the `branch` field |
| 4 | `demo:priceGBP` | `xsd:decimal` literal | From the `price` field |
| 5 | `demo:preparedAt` | `xsd:dateTime` literal | ISO 8601 rendering of `ts` |
| 6 | `demo:rating` | `xsd:integer` literal | From the `rating` field |
| 7 | `demo:orderedBy` | the customer's IRI | Resolved from the `cust` index |

**FIX-94** The virtual `rdf:type demo:Order` assertion MUST NOT be counted among the seven `[src: tripleCount()]`. It is answerable by the evaluator but is not part of the accounting.

**FIX-95** The two triples attributed to each customer MUST be `rdf:type demo:Customer` and `rdfs:label` with the customer's name as a string literal `[src: tripleCount()]` `[src: scan()]`.

**FIX-96** The reported individual total MUST be `|orders| + |customers| + 5`, where 5 is the country **Individual** count `[src: individualCount()]`.

**FIX-97** The counting functions MUST be O(1) or O(entities) and MUST NOT enumerate the **ABox** `[src: tripleCount()]` `[src: individualCount()]`. At 100,000 orders they run on every store mutation.

**Known gap.** The 140 flattened restriction triples of [§14](#14-the-flattened-restriction-index) are matchable by the query evaluator `[src: scan()]` but are **not** included in the reported total `[src: tripleCount()]`. A user can therefore retrieve a triple the status bar does not count. **Status:** specified, not implemented in the reference build. An implementation SHOULD either add the flattened index size to the reported total or state in the status bar that the figure counts asserted triples only; whichever it chooses, the choice MUST be consistent between the status bar and the export header of [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md).

---

## 14. The flattened restriction index

**FIX-98** An implementation MUST build a flattened index of restrictions so that a query can match `pizza:Margherita pizza:hasTopping pizza:MozzarellaTopping` directly, without walking an anonymous class expression `[src: buildRBox()]`.

**FIX-99** The index MUST include a triple `(subject, property, filler)` for every restriction and every equivalence conjunct that is a property restriction whose quantifier is `some` or `value`, one triple per filler `[src: buildRBox()]`. Restrictions with quantifier `only`, `min` or `max`, and shapes `class` and `not`, MUST be excluded.

**FIX-100** The flattened index MUST contain exactly **140** entries for this fixture `[src: buildRBox()]`, composed as follows.

| Source | Count |
|---|---|
| Named pizza topping existentials | 103 |
| Named pizza country value assertions | 22 |
| `pizza:Pizza hasBase some pizza:PizzaBase` | 1 |
| `pizza:MozzarellaTopping hasCountryOfOrigin value pizza:Italy` | 1 |
| `pizza:ParmesanTopping hasCountryOfOrigin value pizza:Italy` | 1 |
| Spiciness assertions on the six spicy toppings | 6 |
| `pizza:CheesyPizza hasTopping some pizza:CheeseTopping` | 1 |
| `pizza:MeatyPizza hasTopping some pizza:MeatTopping` | 1 |
| `pizza:ThinAndCrispyPizza hasBase some pizza:ThinAndCrispyBase` | 1 |
| `pizza:SpicyPizza hasTopping some pizza:SpicyTopping` | 1 |
| `pizza:RealItalianPizza hasCountryOfOrigin value pizza:Italy` | 1 |
| `pizza:SpicyTopping hasSpiciness some pizza:Hot` | 1 |
| **Total** | **140** |

**FIX-101** The flattened index MUST be rebuilt whenever the **TBox** changes and MUST be rebuilt after any entity edit that alters a restriction `[src: buildRBox()]`.

---

## 15. Golden values

These values are produced by a correct implementation of [§11](#11-the-abox-generator) and by no other. An implementation that matches [§16](#16-verification-checklist) but not this section has a generator defect — most commonly a wrong draw order, a wrong customer count, or a signed rather than unsigned random state.

### 15.1 Customers

The first five customers are identical at every dataset size, because customers are drawn first from a freshly reset state.

| IRI | Name |
|---|---|
| `demo:Customer_000001` | Nadia Duarte |
| `demo:Customer_000002` | Chidi Tremblay |
| `demo:Customer_000003` | Greta Varga |
| `demo:Customer_000004` | Xiulan Sato |
| `demo:Customer_000005` | Kofi Weber |

The last customer differs by size, because the count differs:

| `n` | Last customer IRI | Name |
|---|---|---|
| 1,000 | `demo:Customer_000125` | Quinn Esposito |
| 12,000 | `demo:Customer_001500` | Jonna Ueda |
| 50,000 | `demo:Customer_006250` | Elif Ionescu |
| 100,000 | `demo:Customer_012500` | Sami Lombardi |

### 15.2 First and last order at each size

The first order's values depend on the dataset size, because the customer phase consumes `2c` draws before it.

| `n` | Record | IRI | Type | Reference | Branch | Price | Prepared (UTC) | Rating | Customer index |
|---|---|---|---|---|---|---|---|---|---|
| 1,000 | first | `demo:Pizza_000001` | `pizza:FruttiDiMare` | AX-100000 | Camden | 14.71 | 2026-08-16T05:51:00Z | 4 | 100 |
| 1,000 | last | `demo:Pizza_001000` | `pizza:Siciliana` | AX-100999 | Soho | 13.18 | 2026-08-14T21:34:54Z | 4 | 62 |
| 12,000 | first | `demo:Pizza_000001` | `pizza:Rosa` | AX-100000 | Shoreditch | 10.86 | 2026-08-24T13:48:37Z | 3 | 640 |
| 12,000 | last | `demo:Pizza_012000` | `pizza:Margherita` | AX-111999 | Shoreditch | 8.14 | 2026-08-13T18:39:27Z | 4 | 1150 |
| 50,000 | first | `demo:Pizza_000001` | `pizza:Caprina` | AX-100000 | Borough | 11.41 | 2026-08-25T15:55:02Z | 2 | 4551 |
| 50,000 | last | `demo:Pizza_050000` | `pizza:QuattroFormaggi` | AX-149999 | Clerkenwell | 12.71 | 2026-08-27T01:57:35Z | 4 | 4990 |
| 100,000 | first | `demo:Pizza_000001` | `pizza:Veneziana` | AX-100000 | Shoreditch | 11.67 | 2026-08-16T06:38:30Z | 3 | 11551 |
| 100,000 | last | `demo:Pizza_100000` | `pizza:American` | AX-199999 | Shoreditch | 9.65 | 2026-08-04T02:44:07Z | 4 | 5366 |

### 15.3 Aggregate checksums

| `n` | Sum of prices (£) | Sum of ratings |
|---|---|---|
| 1,000 | 12,206.53 | 3,830 |
| 12,000 | 146,475.15 | 45,015 |
| 50,000 | 609,160.42 | 188,150 |
| 100,000 | 1,217,990.26 | 375,866 |

The price sums are the exact sum of the stored two-decimal values; an implementation SHOULD compute them in decimal arithmetic to avoid a floating-point drift that would mask a real defect.

### 15.4 Rating distribution

| `n` | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 1,000 | 33 | 39 | 306 | 309 | 313 |
| 12,000 | 485 | 492 | 4,001 | 3,567 | 3,455 |
| 50,000 | 1,988 | 2,059 | 16,478 | 14,765 | 14,710 |
| 100,000 | 4,124 | 4,045 | 33,203 | 29,097 | 29,531 |

### 15.5 Branch distribution

| `n` | Soho | Shoreditch | Camden | Clerkenwell | Borough | Islington |
|---|---|---|---|---|---|---|
| 1,000 | 177 | 158 | 161 | 153 | 175 | 176 |
| 12,000 | 1,940 | 2,001 | 1,941 | 2,072 | 1,929 | 2,117 |
| 50,000 | 8,185 | 8,366 | 8,221 | 8,496 | 8,424 | 8,308 |
| 100,000 | 16,555 | 16,736 | 16,632 | 16,479 | 16,790 | 16,808 |

### 15.6 Type distribution at the default size

Bucket sizes at `n` = 12,000, which is what the type filter and the class tree instance counts MUST show at start-up.

| Type | Count | Type | Count |
|---|---|---|---|
| `pizza:American` | 536 | `pizza:Napoletana` | 531 |
| `pizza:AmericanHot` | 555 | `pizza:Parmense` | 530 |
| `pizza:Cajun` | 533 | `pizza:PolloAdAstra` | 500 |
| `pizza:Capricciosa` | 565 | `pizza:PrinceCarlo` | 553 |
| `pizza:Caprina` | 539 | `pizza:QuattroFormaggi` | 598 |
| `pizza:Fiorentina` | 562 | `pizza:Rosa` | 531 |
| `pizza:FourSeasons` | 547 | `pizza:Siciliana` | 530 |
| `pizza:FruttiDiMare` | 570 | `pizza:SloppyGiuseppe` | 571 |
| `pizza:Giardiniera` | 527 | `pizza:Soho` | 544 |
| `pizza:LaReine` | 568 | `pizza:Veneziana` | 540 |
| `pizza:Margherita` | 543 | | |
| `pizza:Mushroom` | 527 | **Total** | **12,000** |

---

## 16. Verification checklist

**FIX-102** An implementation MUST pass every check below before any other acceptance criterion in [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) is attempted. A fixture defect invalidates every test that stands on it.

### 16.1 Structural counts

| # | Assertion | Expected |
|---|---|---|
| V1 | Entries in the class table | 70 |
| V2 | Defined classes in the class table | 11 |
| V3 | Primitive classes in the class table | 59 |
| V4 | Named pizzas | 22 |
| V5 | `pizza:` object properties | 8 |
| V6 | `demo:` object properties | 1 |
| V7 | `demo:` data properties | 5 |
| V8 | `demo:` classes | 2 |
| V9 | `pizza:` country **Individuals** | 5 |
| V10 | Total entities in the **Store** after the **TBox** stage | 114 |
| V11 | Reported class count `[src: classCount()]` | 95 |
| V12 | Reported property count `[src: propCount()]` | 14 |
| V13 | **TBox** triples | 239 |
| V14 | Flattened restriction index entries | 140 |
| V15 | Stored restrictions across all entities | 157 |
| V16 | Stored equivalence conjuncts across all entities | 24 |
| V17 | Stored disjointness assertions | 8 |

### 16.2 Axiom shape

| # | Assertion | Expected |
|---|---|---|
| V18 | Sum of topping counts across all named pizzas | 103 |
| V19 | Distinct topping classes used by named pizzas | 33 |
| V20 | Named pizzas with a `hasTopping only (…)` axiom | 22 |
| V21 | Named pizzas with `hasCountryOfOrigin value pizza:Italy` | 22 |
| V22 | Restriction count on `pizza:Margherita` | 4 — 2 existentials, 1 universal, 1 country value |
| V23 | Restriction count on `pizza:Cajun` | 9 — 7 existentials, 1 universal, 1 country value |
| V24 | Toppings named by a pizza that are not declared classes | 0 |
| V25 | Classes with `rdfs:comment` | 7 |
| V26 | Classes with a spiciness restriction | 6 — 4 `Hot`, 2 `Medium`, 0 `Mild` |
| V27 | Object properties with an inverse | 6, forming 3 pairs |
| V28 | Object properties with a domain | 7 |
| V29 | Object properties with a range | 8 |
| V30 | Object properties with a sub-property parent | 4 |
| V31 | `pizza:CheeseyVegetableTopping` exists, is defined, and has both `pizza:CheeseTopping` and `pizza:VegetableTopping` as equivalence conjuncts | true |
| V32 | `pizza:Country` has an `owl:oneOf` axiom | false |

### 16.3 Generator determinism

| # | Assertion | Expected |
|---|---|---|
| V33 | Two consecutive generations at `n` = 12,000 produce identical records field for field | true |
| V34 | Customer count at `n` = 12,000 | 1,500 |
| V35 | `demo:Customer_000001` name | Nadia Duarte |
| V36 | `demo:Pizza_000001` at `n` = 12,000 is a `pizza:Rosa` with reference `AX-100000`, branch Shoreditch, price 10.86, rating 3 | true |
| V37 | Sum of ratings at `n` = 12,000 | 45,015 |
| V38 | Sum of prices at `n` = 12,000 | 146,475.15 |
| V39 | Every rating is an integer in [1, 5] | true |
| V40 | Every price is in [7.50, 16.00] with at most two decimal places | true |
| V41 | Every timestamp falls within 2026-08-01T00:00:00Z to 2026-08-30T23:59:59Z | true |
| V42 | Every timestamp has a zero millisecond component | true |
| V43 | Every order references a customer index in [0, customerCount) | true |
| V44 | Order IRIs are unique | true |
| V45 | Order references are unique at every offered size | true |
| V46 | Type buckets partition the order set with no overlap and no omission | true |
| V47 | Sum of type bucket sizes at `n` = 12,000 | 12,000 |

### 16.4 Counting

| # | Assertion | Expected |
|---|---|---|
| V48 | Reported triples at `n` = 1,000 | 7,489 |
| V49 | Reported triples at `n` = 12,000 | 87,239 |
| V50 | Reported triples at `n` = 50,000 | 362,739 |
| V51 | Reported triples at `n` = 100,000 | 725,239 |
| V52 | Reported individuals at `n` = 12,000 | 13,505 |
| V53 | Reported individuals at `n` = 100,000 | 112,505 |
| V54 | Reported class count is unaffected by dataset size | true |
| V55 | Reported property count is unaffected by dataset size | true |

### 16.5 Namespace discipline

| # | Assertion | Expected |
|---|---|---|
| V56 | Every generated order IRI begins with the `demo:` namespace | true |
| V57 | Every generated order's type IRI begins with the `pizza:` namespace | true |
| V58 | No `demo:` IRI appears anywhere in the **TBox** restriction data | true |
| V59 | Every entity's namespace marker matches its IRI prefix | true |
| V60 | An IRI in neither namespace and matching no prefix displays in angle brackets | true |

---

## 17. Fidelity notes (non-normative)

These notes record where the fixture departs from the upstream ontology, so that a reader who knows the tutorial ontology is not left wondering whether the difference is a transcription error. They are observations about the reference build, and they change nothing: the fixture is as specified above.

- **Country of origin on every named pizza.** The reference build applies `hasCountryOfOrigin value pizza:Italy` uniformly to all 22 named pizzas `[src: buildTBox()]`. It does so to give the `pizza:RealItalianPizza` defined class something to classify and to give the graph a shared hub node. Nothing in the reference build varies the country by pizza.
- **Spiciness as classes rather than individuals.** `pizza:Hot`, `pizza:Medium` and `pizza:Mild` are classes below `pizza:Spiciness` here, carrying a value-partition flag `[src: buildTBox()]`, and the spiciness assertions are `some` restrictions rather than `value` restrictions.
- **`pizza:Country` is annotated as enumerated but not axiomatised as such** `[src: CLASS_SPEC]`. The five countries are typed **Individuals** with no `owl:oneOf`.
- **No `owl:equivalentClass` triples are emitted.** Equivalence is held on the **Entity** record and rendered from there `[src: buildTBox()]`; only the seven predicates of **FIX-55** ever reach the triple store.
- **Anything this suite says about the upstream co-ode.org publication beyond the prototype's own header statement is outside what can be verified from the reference file.** The provenance claim in [§2.1](#21-the-tbox-is-the-real-pizza-ontology) is the prototype's own, stated in its header comment and in its dataset flyout copy `[src: #scaleMenu]`.

---

## Appendix A — Native stack mapping (non-normative)

Advisory only. A conformant implementation may satisfy every requirement above by other means.

### A.1 Where the fixture lives

The **TBox** is small, fixed and fully enumerated here, so the simplest correct shape is a static C# class of `readonly` arrays compiled into the application assembly — no file, no parser, no embedded resource, no start-up I/O. `ClassSpec`, `NamedPizzas`, `ObjProps`, `Countries`, `DemoClasses`, `DemoDataProps`, `Branches`, `FirstNames`, `LastNames` and `BasePrice` map one-to-one onto the tables above.

A source generator that emits these arrays from a checked-in data file is an acceptable alternative and makes drift from this document visible in a diff, but it buys little for 114 entities.

### A.2 The random generator in .NET

`System.Random` MUST NOT be used: its algorithm is not specified across runtimes and changed between .NET Framework and .NET Core, so it cannot satisfy **FIX-58**. Implement the generator of **FIX-61** directly:

```csharp
private uint _state = 20250911u;

private double Rnd()
{
    unchecked { _state = _state * 1664525u + 1013904223u; }
    return _state / 4294967296.0;
}
```

`unchecked` arithmetic on `uint` gives the modulo-2³² reduction of **FIX-62** for free. Verify against the golden values of [§15](#15-golden-values) before trusting any downstream measurement.

### A.3 Record layout

The generated **ABox** is the only part of the product that is large, so the record type is worth getting right. A `struct` in a flat `Order[]` avoids 100,000 heap allocations and keeps the virtualised table's scroll frame time predictable:

| Field | Suggested .NET type | Bytes |
|---|---|---|
| `i` | `int` | 4 |
| `typeIndex` | `byte` — index into the 22 named pizzas | 1 |
| `branchIndex` | `byte` — index into the 6 branches | 1 |
| `rating` | `byte` | 1 |
| `priceMinorUnits` | `int` — pence, avoiding binary floating point entirely | 4 |
| `tsSeconds` | `int` — seconds since the epoch | 4 |
| `cust` | `int` | 4 |

Storing price in pence and reconstructing the decimal on read sidesteps the accumulation error that would otherwise make the checksums of [§15.3](#153-aggregate-checksums) unreproducible. The IRI and the order reference are both pure functions of `i` and need not be stored; materialise them on demand, and intern them only if profiling shows the allocation matters.

### A.4 Fixture tests

An xUnit or NUnit theory driven by the tables of [§16](#16-verification-checklist) is the cheapest possible guard on the most expensive possible mistake. Put the fixture tests in their own project with no UI dependency, so that they run in under a second and can be made a pre-commit gate.
