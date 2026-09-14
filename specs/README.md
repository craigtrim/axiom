# Axiom — Specification Suite

**Purpose:** This document is the index and the binding contract for the Axiom specification suite; it tells an implementer what to read, in what order, and under what rules every other document in the suite is written.

**Status:** Normative (conventions); index content is descriptive.

**Requirement ID prefixes owned:** none. This document defines no requirements. It registers the prefixes owned by every other document.

---

## What Axiom is

Axiom is a Windows 11 desktop ontology design and management workbench: a single-window professional tool for reading, navigating, editing and querying OWL ontologies and their instance data. It presents four work areas — a bounded graph workbench, a class hierarchy tree with an entity inspector, a virtualised individuals table, and a SPARQL console — over one in-memory Store that may hold hundreds of thousands of triples. Its defining discipline is that no view ever renders the whole Store: the graph viewport is bounded by a hard node Budget, the table is virtualised, and every count the user sees states both the in-view figure and the in-store figure.

This suite exists so that an engineer who has never seen the prototype can build the product from these documents alone — without guessing at a constant, an algorithm, a state transition, or a line of user-facing copy.

## The reference implementation

> **The behavioural source of truth is an HTML prototype:**
>
> `C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\0df77e72-806c-442c-9823-108fcd63adec\index.html`
>
> One self-contained file, 4,743 lines. It is **read-only**. Never edit it, move it, reformat it, or run it as part of implementing this suite.

Where a specification statement and the prototype disagree about *observed behaviour*, the prototype wins and the specification is a defect to be fixed. Where the prototype does something the specification explicitly marks as *not implemented in the reference build*, the specification wins as the statement of intent — but the implementer MUST NOT claim the behaviour exists until it does.

The prototype is a prototype, not the product. The original brief was a **native Windows executable**. Accordingly, the normative body of every document in this suite is **framework-neutral**: it specifies data structures, algorithms, interaction contracts, state machines, constants and copy, and says nothing about WinUI 3, Avalonia, WPF, HTML, Canvas, SVG or any rendering API. Everything stack-specific is quarantined in each document's `Appendix A — Native stack mapping (non-normative)`. The consequence is deliberate: this suite can be implemented as a native Windows application, or re-implemented on the web, and both builds are conformant if they satisfy the same numbered requirements.

---

## Reading order

An implementer starting from zero should read in this order. The reason each step sits where it does is given, because reading these out of order wastes time.

1. **[`README.md`](README.md)** — this file. Read it first so that every `**ID-n**`, every `[src: …]` citation and every RFC 2119 keyword you meet afterwards is already unambiguous.
2. **[`00-product-overview.md`](00-product-overview.md)** — what the product is for, who uses it, the four Surfaces, the product principles that everything else is derived from, the v1 scope boundary, and the canonical glossary. Read before anything technical: the glossary is used without re-definition everywhere else, and the principles explain *why* the later algorithms are shaped as they are.
3. **[`10-architecture.md`](10-architecture.md)** — the module decomposition, the ownership of state, the boot sequence, and the flow of change through the system. Read next because it tells you which later document owns which piece of the machine.
4. **[`11-data-model-and-store.md`](11-data-model-and-store.md)** — the Store, entity records, the compact individual records, the indexes, the adjacency function and the counting functions. Read before any Surface document: all four Surfaces are projections of these structures, and none of them can be built against a guess about the Store.
5. **[`20-graph-viewport-and-budget.md`](20-graph-viewport-and-budget.md)** — the Viewport, the Budget, Focus set, Pin, Eviction, expansion, collapse, seeding, and the honest-reporting contract. Read before the layout and rendering documents: layout and rendering both operate on the node and edge set that this document defines and bounds.
6. **[`21-layout-algorithms.md`](21-layout-algorithms.md)** — the four Layout modes and the `auto` selector, in full numbered pseudocode with all constants. Read after the Viewport because every algorithm takes the bounded node set as its input and is budgeted against the Viewport size.
7. **[`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md)** — the draw pipeline, node and edge shapes, label placement and collision, the minimap, and the four export paths with their provenance header. Read after layout because rendering consumes laid-out coordinates.
8. **[`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md)** — the hierarchy tree (classes and properties), filtering, keyboard model, and the entity inspector's complete section list including the reserved inferred-axioms region. Read here because it is the first Surface a user touches and the one that seeds the graph.
9. **[`31-individuals-table.md`](31-individuals-table.md)** — columns, sorting, filtering, virtualisation arithmetic, in-cell editing, and the send-to-graph path. Read after the tree because the two share the selection model.
10. **[`32-sparql-console.md`](32-sparql-console.md)** — the supported query grammar, tokeniser, parser, evaluator, caps, result reporting and the send-to-graph path. Read last of the Surfaces because it is the only one that depends on the flattened restriction index rather than on the Store's primary structures alone.
11. **[`40-design-system.md`](40-design-system.md)** — Design tokens: colour, type, spacing, radii, motion, elevation, and both themes in full. Read before writing any view code; every visual value in the product comes from here and nowhere else.
12. **[`41-component-library.md`](41-component-library.md)** — the component inventory built from those tokens: buttons, fields, chips, tabs, panels, splitters, menus, dialogs, toasts, meters, tables, with every state. Read immediately after the tokens, since components are the only legal consumers of them.
13. **[`50-visual-reference.html`](50-visual-reference.html)** — a rendered reference of the design system and component states. Open it alongside steps 11 and 12 rather than reading it in sequence; it is a picture, not a specification.
14. **[`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md)** — the complete fixture: the real Pizza ontology TBox and the generated `demo:` ABox, with the exact generator algorithm and seed. Read before implementation begins in earnest, because every acceptance test and every screenshot in the suite assumes this exact data.
15. **[`60-implementation-plan.md`](60-implementation-plan.md)** — the phased build order with vertical slices and their exit criteria. Read when you are ready to start cutting code, not before; it presumes you know what the parts are.
16. **[`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md)** — the conformance suite: what must be demonstrably true, with the exact fixture, inputs and expected outputs. Read last, and then keep it open; it is the definition of done.
17. **[`70-defect-register.md`](70-defect-register.md)** — every defect the specification work found in the reference implementation, with a severity, the requirement that supersedes it, and a suggested order of repair. Read it before you copy any behaviour from the reference build; forty-five of them are recorded, two of which stop a shipped feature working entirely.

`diagrams/*.svg` are referenced from the documents that use them and are not read standalone.

---

## Document map

| File | Title | Prefix | Purpose | Approx. reading time |
|---|---|---|---|---|
| [`README.md`](README.md) | Axiom — Specification Suite | — | Index, reading order, suite conventions, prefix registry | 10 min |
| [`00-product-overview.md`](00-product-overview.md) | Axiom — Product Overview | `OVR` | Purpose, users, the four Surfaces, product principles, v1 scope, non-goals, demo-data policy, glossary, quality attributes | 35 min |
| [`10-architecture.md`](10-architecture.md) | Axiom — Architecture | `ARCH` | Module decomposition, state ownership, boot sequence, change propagation, threading model | 30 min |
| [`11-data-model-and-store.md`](11-data-model-and-store.md) | Axiom — Data Model and Store | `STORE` | Entity records, triples, compact individual records, indexes, adjacency, counting | 45 min |
| [`20-graph-viewport-and-budget.md`](20-graph-viewport-and-budget.md) | Axiom — Graph Viewport and Budget | `VP` | Viewport node/edge set, Budget, Focus set, Pin, Eviction policies, expand/collapse/seed, honest reporting | 45 min |
| [`21-layout-algorithms.md`](21-layout-algorithms.md) | Axiom — Layout Algorithms | `LAY` | Force, hierarchy, radial, grid, and the `auto` selector, with complete constants | 50 min |
| [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md) | Axiom — Graph Rendering and Export | `REN` | Draw pipeline, node shapes, edge routing, label placement, minimap, PNG/SVG/clipboard export and provenance header | 40 min |
| [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) | Axiom — Class Tree and Inspector | `TREE` | Hierarchy tree, property tree, filtering, keyboard model, inspector sections, inferred-axioms region | 40 min |
| [`31-individuals-table.md`](31-individuals-table.md) | Axiom — Individuals Table | `TBL` | Columns, sort, filter, virtualisation, in-cell editing, send-to-graph | 30 min |
| [`32-sparql-console.md`](32-sparql-console.md) | Axiom — SPARQL Console | `SPQ` | Grammar, tokeniser, parser, evaluator, caps, errors, result reporting, examples | 45 min |
| [`40-design-system.md`](40-design-system.md) | Axiom — Design System | `DS` | Design tokens: colour, type, space, radius, motion, elevation, both themes | 30 min |
| [`41-component-library.md`](41-component-library.md) | Axiom — Component Library | `CMP` | Every component and every state, built only from tokens | 40 min |
| [`50-visual-reference.html`](50-visual-reference.html) | Axiom — Visual Reference | `VIS` | Rendered specimen of tokens, components and states | browse |
| [`60-implementation-plan.md`](60-implementation-plan.md) | Axiom — Implementation Plan | `IMP` | Phased vertical slices, ordering, exit criteria, risks | 25 min |
| [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) | Axiom — Acceptance Criteria and Tests | `ACC` | Conformance suite with fixtures, inputs and expected outputs | 40 min |
| [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md) | Axiom — Pizza Ontology Fixture | `FIX` | The complete `pizza:` TBox and the `demo:` ABox generator, verbatim | 35 min |
| [`70-defect-register.md`](70-defect-register.md) | Axiom — Defect Register | `DEF` | Every defect found in the reference build, by severity, with superseding requirements and a repair order | 20 min |

---

## Requirement ID prefix registry

Every normative requirement in the suite carries exactly one stable ID of the form `<PREFIX>-<n>`. A prefix belongs to exactly one document; a document may own only its registered prefix. IDs are numbered from 1 and are **never reused**: if a requirement is withdrawn, its number is retired, not recycled.

| Prefix | Owning document | Domain |
|---|---|---|
| `OVR` | [`00-product-overview.md`](00-product-overview.md) | Product principles, scope, non-goals, demo-data policy, quality attributes |
| `ARCH` | [`10-architecture.md`](10-architecture.md) | Module boundaries, state ownership, boot, change propagation |
| `STORE` | [`11-data-model-and-store.md`](11-data-model-and-store.md) | Store structures, indexes, adjacency, counting |
| `VP` | [`20-graph-viewport-and-budget.md`](20-graph-viewport-and-budget.md) | Viewport, Budget, Eviction, Focus set, Pin, expansion |
| `LAY` | [`21-layout-algorithms.md`](21-layout-algorithms.md) | Layout modes and the `auto` selector |
| `REN` | [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md) | Graph rendering, labels, minimap, export |
| `TREE` | [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) | Hierarchy tree and entity inspector |
| `TBL` | [`31-individuals-table.md`](31-individuals-table.md) | Individuals table |
| `SPQ` | [`32-sparql-console.md`](32-sparql-console.md) | SPARQL console |
| `DS` | [`40-design-system.md`](40-design-system.md) | Design tokens |
| `CMP` | [`41-component-library.md`](41-component-library.md) | Component library |
| `VIS` | [`50-visual-reference.html`](50-visual-reference.html) | Visual reference specimen |
| `IMP` | [`60-implementation-plan.md`](60-implementation-plan.md) | Implementation plan |
| `ACC` | [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) | Acceptance criteria and tests |
| `FIX` | [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md) | Ontology and dataset fixture |
| `DEF` | [`70-defect-register.md`](70-defect-register.md) | Defects in the reference build, and the order to repair them |

No other prefix is valid anywhere in the suite.

---

## Conventions

These are the suite's own normative conventions. Every document binds to them. An implementer never has to guess, and an author never invents an alternative.

### 1. Heading structure

Exactly one `H1` per document, and it is the document title. `H2` introduces a normative section. `H3` introduces a sub-requirement or a sub-part of a section. Appendices are `H2` and are titled exactly `Appendix A — <name> (non-normative)`. No heading level below `H4` is used.

### 2. RFC 2119 keywords

Normative force is expressed only with the RFC 2119 keywords, written in capitals: **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**. Any other modal phrasing ("should probably", "ought to", "we want") is non-normative prose and carries no obligation. A sentence in a normative section that contains no RFC 2119 keyword is context, not a requirement.

### 3. Stable requirement IDs

Every normative requirement begins with its bold stable ID, written as `**<PREFIX>-<n>**`, from the registry above. Numbering starts at 1 within each document and increases monotonically. IDs are permanent: they may be superseded, deprecated or marked as not implemented, but they are never renumbered and never reused for a different requirement. Other documents, tests and commit messages cite requirements by ID.

### 4. Citing the reference implementation

Every factual claim about the *current* behaviour of the reference build carries an inline citation in the form `[src: functionName()]` or `[src: CONSTANT_NAME]`. A citation names a symbol that actually exists in the reference file. Citations MUST be verified by reading the source — never written from assumption or from memory of similar products. An uncited claim about current behaviour is a defect.

### 5. Cross-linking

Documents cross-link with relative Markdown links, optionally with a fragment: for example `[Data model](11-data-model-and-store.md#the-store-object)`. Anchors are the kebab-case form of the target heading text: lower-cased, spaces replaced with hyphens, punctuation dropped. Only filenames from the registered suite list may appear in a link.

### 6. Framework neutrality

The normative body of every document specifies **data structures, algorithms, interaction contracts, state machines and values**, and nothing else. It makes no reference to WinUI 3, Avalonia, WPF, XAML, HTML, CSS, Canvas, SVG, DOM, or any rendering or widget API. Anything stack-specific belongs in that document's `Appendix A — Native stack mapping (non-normative)`, where it is advisory and may be ignored by a conformant implementation that meets the numbered requirements by other means.

### 7. Marking unimplemented behaviour

Behaviour the reference build does not implement is specified where it belongs, and is marked immediately with the exact line:

`**Status:** specified, not implemented in the reference build.`

Such behaviour MUST NOT be described in the present tense as though it exists, and MUST NOT be cited with `[src: …]`.

### 8. Terminology

The following terms are used exactly as defined and are **never** aliased, abbreviated or replaced by a synonym:

| Term | Meaning |
|---|---|
| **Store** | The in-memory ontology database: all entities, axioms and instance data |
| **TBox** | Classes, properties and axioms |
| **ABox** | Individuals |
| **Entity** | Any IRI-named thing: a class, a property, or an individual |
| **Individual** | A named instance |
| **Viewport** | The bounded node set currently on the graph canvas |
| **Budget** | The hard maximum Viewport node count |
| **Eviction** | Removal of a node from the Viewport to stay within Budget |
| **Focus set** | The seed nodes of the current Viewport; exempt from Eviction |
| **Pin** | A user-applied Eviction exemption on a single node |
| **Hidden neighbour** | A neighbour that exists in the Store but is not in the Viewport |
| **Surface** | One of the four work areas |
| **Layout mode** | One of `force`, `hierarchy`, `radial`, `grid`, `auto` |
| **Design token** | A named visual constant; the only legal source of a visual value |

Namespace discipline is part of the terminology rule. The real Pizza ontology vocabulary is the **`pizza:`** namespace. Generated demo data is the **`demo:`** namespace. The two are kept distinct in every sentence, table cell and code sample in the suite; a sentence that blurs them is a defect.

### Additional house rules

- **British English** throughout, matching the reference implementation's copy: *colour*, *behaviour*, *serialising*, *virtualised*, *neighbour*, *centre*.
- Front matter on every document: the `H1` title, a one-sentence purpose, `**Status:** Normative`, and the requirement ID prefixes it owns.
- Prefer tables, numbered pseudocode, exact constants and complete enumerations over prose. Under-specifying is the only failure that matters.
- User-facing copy is quoted verbatim and cited. Copy is part of the specification, not decoration.

---

## How to verify a claim

Every `[src: …]` citation is a promise that the named symbol exists in the reference file and that the surrounding sentence describes what it does. To check one:

1. Take the symbol from the citation. `[src: evictionOrder()]` means the function `evictionOrder`; `[src: NEIGHBOUR_CAP]` means the constant `NEIGHBOUR_CAP`.
2. Search the reference file for its declaration. Function declarations appear as `function evictionOrder(`; constants as `const NEIGHBOUR_CAP =`.
3. Read the declaration and its body, and compare it against the sentence carrying the citation. The sentence MUST be true of that code.

For example, the claim "the default Budget is 1,000 nodes `[src: G.budget]`" is verified by finding the `G` object literal and reading `budget: 1000`. The claim "user copy states that no file is written `[src: wire()]`" is verified by finding the `#cmdSave` handler inside `wire()` and reading the toast string.

Five citation shapes are in use and no others:

| Shape | Means | Example | How to find it |
|---|---|---|---|
| `[src: name()]` | A function | `[src: neighboursOf()]` | Search for `function neighboursOf(` |
| `[src: NAME]` | A module-level constant or state object | `[src: KIND_META]` | Search for `const KIND_META` |
| `[src: #elementId]` | A named element in the reference markup | `[src: #budgetRange]` | Search for `id="budgetRange"` |
| `[src: .className]` | A style rule or markup region, named by its selector; `[src: @rule]` for an at-rule | `[src: .statusbar]`, `[src: @media (prefers-reduced-motion: reduce)]` | Search for the selector text |
| `[src: --token-name]` | A **Design token** declaration | `[src: --h-control]` | Search for `--h-control:` |

If a citation cannot be verified, the claim is a defect: fix the claim, do not weaken the citation. If a symbol exists but does what the sentence does not say, the sentence is wrong — the source is not.

---

## What is deliberately not specified

The suite bounds itself as firmly as the product bounds its Viewport. The following are out of scope, and each is recorded in a named place so that the omission is visible rather than accidental.

| Not specified | Where the omission is recorded |
|---|---|
| Any reasoner, classifier or entailment regime | [`00-product-overview.md`](00-product-overview.md) non-goals; the reserved inspector region is specified in [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) |
| File formats, parsing and serialisation (OWL/RDF-XML, Turtle, OBO, JSON-LD) | [`00-product-overview.md`](00-product-overview.md) non-goals |
| Project, workspace and recent-file management | [`00-product-overview.md`](00-product-overview.md) non-goals |
| A general property and axiom editor | [`00-product-overview.md`](00-product-overview.md) non-goals; the editing operations that *are* in scope are enumerated in [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) and [`31-individuals-table.md`](31-individuals-table.md) |
| Networking, remote endpoints, collaboration, licensing, telemetry, update channels | [`00-product-overview.md`](00-product-overview.md) non-goals |
| Persistence of window geometry, panel sizes and user preferences | [`10-architecture.md`](10-architecture.md) state-ownership section |
| SPARQL features beyond the specified grammar: `CONSTRUCT`, `ASK`, `DESCRIBE`, aggregates, `OPTIONAL`, `UNION`, property paths, named graphs, `GROUP BY`, `BIND`, sub-selects | [`32-sparql-console.md`](32-sparql-console.md) unsupported-grammar section |
| Choice of UI framework, control library and packaging | Constrained only advisorily in each `Appendix A — Native stack mapping (non-normative)`; the recommendation lives in [`00-product-overview.md`](00-product-overview.md) |
| Internationalisation and localisation beyond British English copy | This document, conventions |
| Installer, code signing, CI and release engineering | [`60-implementation-plan.md`](60-implementation-plan.md) risks section |

Anything not on this list and not covered by a numbered requirement is an unresolved gap, and SHOULD be raised rather than invented.

---

## Changelog

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 2026-09-11 | Initial issue of the full suite: index and conventions, product overview, architecture, data model, viewport and budget, layout, rendering and export, the four Surface documents, design system and component library, visual reference, implementation plan, acceptance criteria, and the Pizza ontology fixture. Derived from the HTML reference implementation at the path named above. | craigtrim |
| 1.1 | 2026-09-11 | Integration pass: twenty authored SVG figures and the rendered visual reference completed; every cross-document link and diagram reference verified to resolve; requirement numbering confirmed contiguous and unique across all fourteen numbered documents (2,330 requirements); defect register added, consolidating the forty-five defects previously recorded only inside the documents that found them. | craigtrim |
| 1.2 | 2026-09-11 | Citation pass: all 188 acceptance criteria resolved from prefix-and-behaviour to exact `<PREFIX>-<n>` IDs, each checked against the text of the requirement it verifies; eleven accessibility criteria re-pointed from `OVR` to the documents that actually own the accessibility contract (`DS`, and `CMP` for flyout focus); `ACC-9` rewritten from a pending instruction into the standing rule. Every cited ID verified to exist in its owning document. | craigtrim |
