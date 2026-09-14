# Axiom — Product Overview

**Purpose:** This document states what Axiom is for, who uses it, what its four Surfaces do, the product principles every other document derives from, the boundary of v1, the demo dataset policy, the canonical glossary for the whole suite, and the measurable quality targets.

**Status:** Normative

**Requirement ID prefixes owned:** `OVR`

See [README](README.md) for the suite's conventions, the reading order, and the prefix registry.

---

## 1. Product purpose and the problem it addresses

Axiom is a Windows 11 desktop workbench for designing, inspecting, editing and querying ontologies. It holds a **TBox** and an **ABox** in a single in-memory **Store** and projects them through four **Surfaces**: a graph workbench, a class hierarchy tree with an entity inspector, an individuals table, and a SPARQL console.

### 1.1 The motivation, in the user's terms

The product exists because of three specific complaints, recorded here verbatim in substance because they are the design constraints, not background colour:

1. **Protégé is unpleasant to use.** It is the field's default tool and it is endured rather than enjoyed. Its interaction model, density, responsiveness and visual quality are all below the standard of a modern professional desktop application.
2. **Every alternative is web-based.** The realistic alternatives are browser tools. They carry browser chrome, browser keyboard conflicts, browser file handling and browser performance ceilings. The user wants a **real Windows desktop application** that follows platform conventions — a native title bar and window controls, a command bar, dockable panels with drag splitters, a status bar, and keyboard shortcuts that behave the way Windows applications behave. The reference implementation models exactly this shell: a title bar with minimise, maximise and close; a command bar; three resizable columns; a resizable bottom dock; and a status bar `[src: #winTitle]` `[src: .commandbar]` `[src: .workspace]` `[src: .statusbar]`.
3. **Graph views stop being useful the moment they stop being legible.** Tools that draw the whole ontology produce a hairball. Axiom follows the Neo4j Bloom and Neo4j Browser discipline instead: the graph shows a **bounded** neighbourhood that the user asked for, and grows only by explicit expansion. The reference implementation enforces this with a hard **Budget** on the **Viewport** node count `[src: G]` and refuses to page in anything the user did not request `[src: #graphEmpty]`.

### 1.2 The performance premise

Axiom must stay responsive irrespective of how many classes, Individuals or triples the Store holds. The reference implementation demonstrates this by generating 12,000 Individuals at boot `[src: init()]` and offering the user 1,000, 12,000, 50,000 and 100,000 Individuals on demand — the largest being roughly 766,000 triples `[src: #scaleMenu]`. At every one of those sizes:

- The **Viewport** still holds at most **Budget** nodes `[src: regenerate()]`.
- The individuals table renders only the visible slice of rows `[src: renderTableRows()]`.
- Adjacency is computed on demand and capped, so inspecting a class with 100,000 Individuals costs the same as inspecting one with three `[src: neighboursOf()]` `[src: NEIGHBOUR_CAP]`.
- SPARQL evaluates against compact record arrays through indexes rather than against materialised triples `[src: buildRBox()]` `[src: evaluate()]`.

**OVR-1** The product MUST present a single-window desktop application shell comprising, top to bottom: a title bar, a command bar, a main work region, and a status bar `[src: .win]`.

**OVR-2** The main work region MUST comprise three horizontally arranged columns — hierarchy panel, graph, inspector panel — above a bottom dock, with a user-draggable splitter between each pair `[src: .workspace]` `[src: #splitDock]`.

**OVR-3** The application MUST remain interactive at a Store size of at least 100,000 generated Individuals (approximately 766,000 triples) without any Surface degrading below the targets in [§9 Quality attributes](#9-quality-attributes) `[src: #scaleMenu]`.

**OVR-4** No Surface MAY require the user to wait for a full-Store traversal in order to perform a routine navigation action (select, expand, filter, scroll, sort).

---

## 2. Target user and usage context

### 2.1 Who

The target user is an **ontology engineer** or **knowledge-graph practitioner** working on Windows. They build and maintain OWL ontologies and the instance data that populates them. They are not casual users: they know what `subClassOf` means, they read Manchester-syntax restrictions without a tooltip, and they will be irritated by a tool that explains those things to them.

### 2.2 Context of use

| Dimension | Value |
|---|---|
| Platform | Windows 11 desktop |
| Session length | Hours; the tool is open all day |
| Frequency | Daily |
| Ontology size | From tutorial-scale (tens of classes) to production-scale (hundreds of thousands of Individuals) |
| Input | Keyboard-first, mouse for the graph canvas |
| Display | Desktop monitor, frequently 1440p or larger, often dual-monitor |
| Expectation | A dense, fast, professional tool — closer to an IDE or a database client than to a consumer app |

### 2.3 Consequences for the design

**OVR-5** The interface MUST be information-dense. Control heights, row heights and type sizes MUST follow the compact desktop scale defined in [Design system](40-design-system.md), not a touch-first scale `[src: --h-control]` `[src: --h-row]` `[src: --h-tree-row]`.

**OVR-6** Every frequent action MUST have a keyboard route. At minimum the product MUST bind: global search, undo, save, rename, delete, fit-to-view, re-run layout, and expand-selected-node `[src: wire()]` `[src: wireCanvas()]`.

**OVR-7** The product MUST follow Windows platform conventions for the modifier keys it uses: `Ctrl+F` for search, `Ctrl+Z` for undo, `Ctrl+S` for save, `F2` for rename, `Delete` for delete, `Escape` to dismiss menus and dialogs `[src: wire()]`.

**OVR-8** Keyboard shortcuts MUST NOT fire while the user is typing into a text input, with the explicit exception of `Escape`, `Ctrl+F` and `Ctrl+S`, which MUST remain available `[src: wire()]`.

**OVR-9** The product MUST support a light theme and a dark theme, and MUST adopt the operating system preference at first launch `[src: setTheme()]` `[src: wire()]`.

**OVR-10** The product MUST respect the operating system's reduced-motion preference by suppressing non-essential animation `[src: @media (prefers-reduced-motion: reduce)]`.

**OVR-11** Panel widths and dock height MUST be user-adjustable by dragging, within bounds: hierarchy panel 180–520 px, inspector panel 240–560 px, dock minimum 120 px and no taller than the window height less 260 px `[src: wire()]`.

**OVR-12** Each of the three peripheral regions — hierarchy panel, inspector panel, bottom dock — MUST be collapsible to zero and restorable from a command-bar toggle, and collapsing one MUST re-fit the graph to the new canvas size `[src: wire()]`.

---

## 3. The four Surfaces

Axiom has exactly four Surfaces. Every user job maps onto one of them, and each has a single clear responsibility. They share one selection: selecting an Entity anywhere updates the inspector, the status bar and the tree highlight together `[src: selectEntity()]`.

### 3.1 Graph workbench

**Responsibility:** show a bounded, legible neighbourhood of the ontology as a node-link diagram, and let the user grow, prune, rearrange and export it.

The graph workbench is the centre column and the product's signature Surface. It never loads the ontology wholesale. It starts empty, or from a seed the user chose, and every node after that arrives because the user expanded something, revealed something, sent table rows in, or sent query results in. The **Viewport** is capped by a **Budget** — a hard maximum node count, 1,000 by default and adjustable from 100 to 3,000 `[src: G]` `[src: #budgetRange]`. When an operation would exceed the Budget, the Viewport either **evicts** the nodes furthest from the **Focus set** or refuses the overflow, according to the user's chosen policy, and then reports in plain words exactly what it did `[src: addToView()]` `[src: reportView()]`. The user's job here is spatial reasoning: *what is near this class, what does it connect to, and what shape is this part of the ontology?* The empty state states the discipline outright: "The graph never loads an ontology wholesale. Pick a class in the hierarchy, a row in the individuals table, or run a query, and expand outward from there." `[src: #graphEmpty]`

Owning documents: [Graph viewport and budget](20-graph-viewport-and-budget.md), [Layout algorithms](21-layout-algorithms.md), [Graph rendering and export](22-graph-rendering-and-export.md).

**OVR-13** The graph workbench MUST start from an empty **Viewport** state that explains how to populate it and offers a one-click seed `[src: #graphEmpty]`.

**OVR-14** The graph workbench MUST expose, at minimum: zoom in, zoom out, fit to view, **Layout mode** selection, re-run layout, freeze/resume simulation, export, and clear `[src: .graph__toolbar]`.

**OVR-15** The graph workbench MUST expose the **Budget** as a directly manipulable control, alongside live in-view and **Hidden neighbour** counts and an occupancy meter `[src: .graph__budget]` `[src: updateBudgetUI()]`.

### 3.2 Class hierarchy tree and inspector

**Responsibility:** navigate the **TBox** structurally, and read every asserted axiom about the selected **Entity**.

The hierarchy tree is the left column. It shows two trees behind a tab pair: the class hierarchy rooted at `owl:Thing`, and the property hierarchy `[src: wire()]` `[src: ROOT]`. It supports type-ahead filtering, arrow-key navigation, expand and collapse, and a double-click or `Enter` that reveals the selection in the graph `[src: wire()]`. The inspector is the right column and is a read-first axiom view: annotations, equivalences, superclasses and restrictions, types, property assertions, disjointness, property axioms, usage counts, and a reserved region for inferred axioms `[src: renderInspector()]`. The user's job here is definitional: *what exactly does this class say, and where does it sit?*

Owning document: [Class tree and inspector](30-class-tree-and-inspector.md).

**OVR-16** The hierarchy tree MUST offer both a class hierarchy and a property hierarchy, switchable without losing the current selection `[src: wire()]`.

**OVR-17** The hierarchy tree MUST be keyboard-navigable with `ArrowUp`, `ArrowDown`, `ArrowRight` (expand), `ArrowLeft` (collapse) and `Enter` (reveal in graph) `[src: wire()]`.

**OVR-18** The inspector MUST render the full IRI of the selected **Entity**, its kind, and — for any **Entity** in the `demo:` namespace — a visible marker that it is generated data `[src: renderInspector()]`.

**OVR-19** The inspector MUST render asserted axioms only, and MUST reserve and label a region for inferred axioms that states no reasoner has run `[src: renderInspector()]`.

### 3.3 Individuals table

**Responsibility:** work with the **ABox** at scale as tabular data — filter it, sort it, correct it, and push a selection into the graph.

The individuals table is the first page of the bottom dock. It is virtualised: only the rows in and just around the visible window are materialised, so 100,000 rows cost what 100 rows cost `[src: renderTableRows()]` `[src: ROW_H]`. It offers eight columns, click-to-sort headers, filters for type, branch and free text, a live row count, in-cell editing on the editable columns, and a "Send page to graph" action that seeds the **Viewport** from the current filtered set `[src: COLS]` `[src: applyFilters()]` `[src: wire()]`. The user's job here is instance-level: *which Individuals are there, which ones look wrong, and what does this slice of them look like as a graph?*

Owning document: [Individuals table](31-individuals-table.md).

**OVR-20** The individuals table MUST virtualise its rows; the cost of rendering MUST be a function of the visible window, not of the filtered row count `[src: renderTableRows()]`.

**OVR-21** The individuals table MUST display the filtered row count and the total **Individual** count simultaneously `[src: applyFilters()]`.

**OVR-22** The individuals table MUST allow the current filtered set to seed the graph **Viewport**, truncated to the **Budget**, and MUST state both the number sent and the number filtered `[src: wire()]`.

### 3.4 SPARQL console

**Responsibility:** answer questions the other three Surfaces cannot, and turn the answers into a graph or a selection.

The SPARQL console is the second page of the bottom dock. It provides a query editor with syntax highlighting, a library of worked example queries, a run action bound to `Ctrl+Enter`, a virtualised result grid, and a "Send results to graph" action `[src: wire()]` `[src: EXAMPLES]` `[src: runQuery()]`. It evaluates basic graph patterns with `FILTER`, `DISTINCT`, `ORDER BY` and `LIMIT` against the Store without materialising individual triples `[src: evaluate()]`. Every run reports rows returned, whether a `LIMIT` was applied, elapsed milliseconds, the triple count it ran over, and the number of distinct IRIs in the result `[src: runQuery()]`. The user's job here is analytical: *which things satisfy this pattern, and can I see them?*

Owning document: [SPARQL console](32-sparql-console.md).

**OVR-23** The SPARQL console MUST declare its supported feature set in the interface, so the user is never guessing which grammar is accepted `[src: .sparql__bar]`.

**OVR-24** Every query run MUST report, on completion: row count, whether a `LIMIT` truncated the result, elapsed time in milliseconds, the size of the Store it ran over, and the count of distinct IRIs in the result `[src: runQuery()]`.

**OVR-25** A query failure MUST produce a diagnostic message and, where possible, a corrective hint; it MUST NOT leave a stale result set on screen `[src: runQuery()]`.

**OVR-26** Result rows MUST be virtualised on the same basis as the individuals table `[src: renderQueryResults()]`.

### 3.5 Surface invariants

**OVR-27** There MUST be exactly four Surfaces. Adding a fifth is a product decision, not an implementation decision.

**OVR-28** All four Surfaces MUST share a single selection model: selecting an **Entity** on any Surface MUST update the inspector, the tree highlight and the status-bar selection indicator `[src: selectEntity()]`.

**OVR-29** Three of the four Surfaces — tree, table, SPARQL console — MUST provide an explicit route into the graph **Viewport**; none of them MAY push nodes into the **Viewport** implicitly `[src: wire()]` `[src: revealInGraph()]`.

**OVR-30** A Surface MUST NOT fail or block because another Surface is busy; the layout simulation running on the graph MUST NOT prevent table scrolling, filtering or query execution.

---

## 4. Core product principles

These are the product's load-bearing commitments. Every later document is an elaboration of one of them.

### 4.1 The Viewport is bounded by construction, not by warning

**OVR-31** The **Viewport** MUST hold at most **Budget** nodes at all times. This MUST be enforced as an invariant of the code paths that add nodes, not as a warning shown after the fact `[src: addToView()]`.

**OVR-32** Every code path that adds nodes to the **Viewport** MUST route through a single admission function that computes available room, applies the overflow policy, and returns a report of what happened `[src: addToView()]`.

**OVR-33** The admission function MUST compute `room = Budget − current node count` before admitting anything, and MUST NOT admit more than `room` nodes without first making room by **Eviction** `[src: addToView()]`.

**OVR-34** When the **Budget** is lowered below the current node count, the **Viewport** MUST immediately evict down to the new **Budget** and report how many nodes were paged out `[src: wire()]`.

**OVR-35** The **Budget** MUST be user-adjustable within a documented range. The reference range is 100 to 3,000 in steps of 100, with a default of 1,000 `[src: #budgetRange]` `[src: G]`.

**OVR-36** The user MUST be able to choose the overflow policy from at least these three: evict by distance then degree; evict least recently touched; refuse and warn `[src: #evictMode]` `[src: evictionOrder()]`.

**OVR-37** **Focus set** members and **Pin**ned nodes MUST NOT be candidates for **Eviction** under any policy `[src: evictionOrder()]`.

**OVR-38** If the **Budget** cannot be satisfied even after evicting every eligible node, the surplus MUST be refused and reported, never silently dropped `[src: addToView()]`.

### 4.2 Nothing enters the Viewport that was not asked for

**OVR-39** Nodes MUST enter the **Viewport** only as the direct result of an explicit user action: seeding, expanding, revealing, sending table rows, or sending query results `[src: seedView()]` `[src: expandNode()]` `[src: revealInGraph()]` `[src: wire()]`.

**OVR-40** Selecting an **Entity** in the tree or the table MUST NOT by itself add it to the **Viewport**; revealing MUST be a separate, deliberate action `[src: selectEntity()]`.

**OVR-41** Expansion MUST be bounded. A single expansion MUST NOT admit more than the **Budget**, and the interface MUST offer a small fixed-size expansion as a distinct command `[src: expandNode()]` `[src: wireCanvas()]`.

**OVR-42** Generating or regenerating the Store MUST clear the **Viewport** rather than repopulate it wholesale, and MUST then re-seed from a single named starting point `[src: regenerate()]`.

### 4.3 The Store is never fully loaded into any view

**OVR-43** No Surface MAY materialise the whole Store. The graph is bounded by **Budget**; the individuals table and the query result grid are virtualised; the tree materialises only expanded branches `[src: addToView()]` `[src: renderTableRows()]` `[src: renderTree()]`.

**OVR-44** Adjacency MUST be computed on demand and capped, so that inspecting a high-degree **Entity** costs no more than inspecting a low-degree one. The reference cap is 4,000 neighbours returned `[src: neighboursOf()]` `[src: NEIGHBOUR_CAP]`.

**OVR-45** Where adjacency is capped, the function MUST still return the **honest total degree** alongside the capped list, so that **Hidden neighbour** counts remain correct `[src: neighboursOf()]`.

**OVR-46** Instance data MUST be held in compact records rather than as materialised triples, and triple counts MUST be computed arithmetically from those records `[src: store]` `[src: tripleCount()]`.

### 4.4 Counts shown to the user are honest, and state both figures

**OVR-47** Wherever a count is shown that could be mistaken for the whole Store, the interface MUST show the in-view figure and the in-store figure together `[src: .statusbar]`.

**OVR-48** The status bar MUST permanently display: the ontology name, the Store triple count, the Store class count, the Store **Individual** count, the in-view node count, the in-view relationship count, the current selection, the resolved **Layout mode**, and the zoom level `[src: .statusbar]` `[src: updateStoreUI()]` `[src: updateBudgetUI()]`.

**OVR-49** The **Viewport** panel MUST display the in-view node count, the total **Hidden neighbour** count, and a graphical occupancy meter against the **Budget** `[src: updateBudgetUI()]`.

**OVR-50** Every operation that evicts or refuses nodes MUST report the fact in plain words, naming the count and — for **Eviction** — up to three of the nodes removed `[src: reportView()]` `[src: addToView()]`.

**OVR-51** Paging Individuals into the graph MUST report the number admitted against the number available, and MUST name the **Budget** when it was the limiting factor `[src: wire()]`.

**OVR-52** Node labels MUST be able to carry a `+n` marker indicating how many neighbours the **Budget** is holding back, and the graph legend MUST explain that marker `[src: renderLegend()]` `[src: hiddenNeighbours()]`.

**OVR-53** Exports MUST carry a provenance caption naming the **Layout mode**, node count, relationship count, **Budget**, **Hidden neighbour** count and timestamp `[src: exportCaption()]`.

**OVR-54** Numbers shown to the user MUST be formatted with British English thousands grouping `[src: fmt]`, currency as pounds sterling to two decimal places `[src: money]`, and dates in British English day-month order `[src: when]`.

### 4.5 No claim is made about behaviour the build does not perform

**OVR-55** The product MUST NOT display any affordance that implies a capability it does not have. Where a capability is deliberately absent, the interface MUST say so in the user's own language rather than fail silently or appear to succeed.

**OVR-56** The save command MUST NOT appear to write a file when it does not. The reference build states plainly: "Serialising to OWL is not wired in this prototype — no file is written. The shipping app saves pizza.owl here." `[src: wire()]`

**OVR-57** The inspector's inferred-axioms region MUST state that no reasoner has run and that only asserted axioms are shown `[src: renderInspector()]`.

**OVR-58** Where a query language feature is unsupported, the console MUST say so rather than mis-evaluate. The reference build labels one example query "No aggregates yet — this returns the raw rows to count." `[src: EXAMPLES]`

**OVR-59** Where a control has no meaningful effect in the current state, it MUST be disabled with an explanatory tooltip rather than left live. The reference build disables freeze/resume for every non-force **Layout mode** with the reason "…is computed once, so there is nothing to freeze" `[src: relayout()]`.

**OVR-60** Destructive operations MUST state their consequences before they run, including the counts of affected subclasses and instances `[src: deleteSelected()]`.

### 4.6 Determinism

**OVR-61** Given the same Store and the same user actions, the product MUST produce the same layout. Seeding MUST be deterministic; the reference build uses phyllotaxis placement rather than randomness `[src: layoutForce()]` `[src: makeNode()]`.

**OVR-62** Demo data generation MUST be deterministic from a fixed seed, so that any two installations generating *n* Individuals produce byte-identical data `[src: rnd()]` `[src: generateIndividuals()]`.

---

## 5. Scope for v1

### 5.1 In scope

| Capability | Detail | Reference |
|---|---|---|
| Load a **TBox** at boot | The Pizza ontology, built in memory | `[src: buildTBox()]` |
| Generate an **ABox** at boot | 12,000 Individuals by default | `[src: init()]` |
| Regenerate the **ABox** on demand | 1,000 / 12,000 / 50,000 / 100,000 Individuals | `[src: #scaleMenu]` `[src: regenerate()]` |
| Browse the class hierarchy | Rooted at `owl:Thing`, expandable, filterable | `[src: renderTree()]` `[src: ROOT]` |
| Browse the property hierarchy | Object and data properties | `[src: wire()]` |
| Inspect an **Entity** | Full asserted-axiom view | `[src: renderInspector()]` |
| Global search | Across entity names, Individual local names and order references, capped | `[src: searchEntities()]` |
| Bounded graph **Viewport** | Budgeted, with **Eviction** and **Pin** | `[src: G]` `[src: addToView()]` |
| Expand / collapse / focus / pin / remove | Node context menu and keyboard | `[src: wireCanvas()]` |
| Five **Layout modes** | `auto`, `force`, `hierarchy`, `radial`, `grid` | `[src: LAYOUT_NAMES]` `[src: chooseLayout()]` |
| Pan, zoom, fit, minimap | Zoom clamped to 0.08–4 | `[src: wireCanvas()]` `[src: fitView()]` `[src: drawMinimap()]` |
| Graph export | PNG at 2× and 3×, SVG, clipboard copy, all with a provenance header | `[src: exportPNG()]` `[src: exportSVG()]` `[src: exportCaption()]` |
| Virtualised individuals table | Eight columns, sort, three filters | `[src: COLS]` `[src: applyFilters()]` |
| In-cell editing | Branch, price and rating columns | `[src: beginCellEdit()]` `[src: COLS]` |
| SPARQL console | Basic graph patterns, `FILTER`, `DISTINCT`, `ORDER BY`, `LIMIT`; seven worked examples | `[src: parseQuery()]` `[src: evaluate()]` `[src: EXAMPLES]` |
| Create a class | As a subclass of a chosen superclass, with name validation | `[src: newClassDialog()]` `[src: validateName()]` |
| Create an **Individual** | Of an existing type, with branch and price | `[src: newIndividualDialog()]` |
| Rename an **Entity** | Inline, with validation | `[src: beginRename()]` `[src: commitRename()]` |
| Delete a class | With reparenting of subclasses and a stated consequence | `[src: deleteSelected()]` |
| Undo | Single-level stack over rename, cell edit and class creation | `[src: undo()]` `[src: UI]` |
| Light and dark themes | System preference honoured at launch | `[src: setTheme()]` |
| Panel and dock resize / collapse | Bounded drag with toggles | `[src: wireSplitter()]` `[src: wire()]` |

### 5.2 Scope requirements

**OVR-63** v1 MUST ship all capabilities listed in [§5.1](#51-in-scope) and MUST NOT ship a capability listed in [§6 Explicit non-goals](#6-explicit-non-goals).

**OVR-64** v1 MUST support the class-creation, individual-creation, rename, class-deletion and in-cell-edit operations enumerated above, and MUST support undo across rename, cell edit and class creation `[src: undo()]`.

**OVR-65** Entity name validation MUST run on commit and MUST report the specific reason for rejection rather than a generic failure `[src: validateName()]`.

**OVR-66** All editing operations MUST update every affected Surface in the same user action — the tree, the inspector, the table, the graph and the status bar `[src: newClassDialog()]` `[src: deleteSelected()]`.

**OVR-67** The application MUST boot to a usable, populated state with no user action required: a built **TBox**, a generated **ABox**, a rendered tree, a filtered table, a seeded graph and a selected **Entity** `[src: init()]`.

**OVR-68** The boot sequence MUST be: build the **TBox**; generate the **ABox**; build the reverse index; build the flattened restriction index; initialise the canvas; render the Surfaces; wire interaction; seed the **Viewport**; lay out; fit; select `[src: init()]`.

**OVR-69** The boot **ABox** size MUST be 12,000 Individuals `[src: init()]`.

**OVR-70** The boot **Viewport** seed MUST be `pizza:Pizza`, followed by an expansion of `pizza:NamedPizza` limited to 30 neighbours `[src: init()]`.

---

## 6. Explicit non-goals

These are deliberate absences in the reference build. Each is recorded so that an implementer does not mistake the gap for an oversight and build it anyway.

### 6.1 No reasoner

There is no classifier, no consistency check, no entailment regime and no inferred hierarchy. The inspector reserves and labels a region for inferred axioms and states that none have been computed: "No reasoner has run. This prototype shows asserted axioms only; inferred axioms would appear here, marked with the amber rule, once a reasoner is attached." `[src: renderInspector()]`

The fixture deliberately contains material a reasoner would find interesting — `pizza:CheeseyVegetableTopping` is commented "Deliberately unsatisfiable in the tutorial — the two parents are disjoint." `[src: CLASS_SPEC]` — precisely so that the absence of a reasoner is visible rather than hidden.

**OVR-71** v1 MUST NOT include a reasoner, and MUST NOT present any axiom as inferred.

**OVR-72** The inspector MUST nonetheless reserve the inferred-axioms region in its layout, so that attaching a reasoner later is an addition rather than a redesign `[src: renderInspector()]`.

### 6.2 No file serialisation

Nothing is read from or written to disk. The save command is deliberately inert and says so `[src: wire()]`. There is no open, no import, no export of the ontology itself — the only export is of the graph image `[src: exportPNG()]` `[src: exportSVG()]`.

**OVR-73** v1 MUST NOT read or write ontology files in any format.

**OVR-74** The save affordance MUST exist, MUST be reachable by `Ctrl+S`, and MUST state plainly that no file is written `[src: wire()]`.

### 6.3 No project manager

There is no project or workspace concept, no recent-files list, no multi-ontology session and no File menu. The command bar carries only: new class, new individual, undo, save, dataset, search, panel toggles and theme `[src: .commandbar]`. The window title is fixed to the single ontology `[src: #winTitle]`.

**OVR-75** v1 MUST NOT include project, workspace or recent-file management.

**OVR-76** v1 MUST operate on exactly one ontology per session `[src: #winTitle]`.

### 6.4 No property or axiom editor

Classes may be created, renamed and deleted; Individuals may be created and three of their data values edited. Nothing else about the **TBox** is editable. There is no user interface for creating or modifying a restriction, an equivalence, a disjointness axiom, a domain, a range, a property characteristic or a property hierarchy link. The inspector renders all of these read-only `[src: renderInspector()]`.

**OVR-77** v1 MUST NOT provide a general property or axiom editor.

**OVR-78** The inspector MUST render restrictions, equivalences, disjointness and property axioms as read-only text `[src: renderInspector()]`.

### 6.5 Further non-goals

**OVR-79** v1 MUST NOT include networking of any kind: no remote SPARQL endpoints, no triple-store connections, no collaboration, no telemetry, no update checks.

**OVR-80** v1 MUST NOT persist any state between sessions — not window geometry, not panel sizes, not theme, not **Budget**, not the **Viewport**.

**OVR-81** v1 MUST NOT support ontology diffing, versioning or merge.

**OVR-82** v1 MUST NOT localise its interface; British English is the only supported language.

---

## 7. The demo dataset policy

### 7.1 The split

The fixture is deliberately two things in one Store, in two namespaces that are never conflated:

| Part | Namespace | Origin | Character |
|---|---|---|---|
| **TBox** | `pizza:` = `http://www.co-ode.org/ontologies/pizza/pizza.owl#` | The real Pizza ontology from co-ode.org | Real, verbatim: class names, property names and axioms are taken from that ontology `[src: NS]` |
| **ABox** | `demo:` = `http://example.org/pizzeria#` | Generated by the application | Synthetic pizzeria order data, generated deterministically at run time `[src: NS]` `[src: generateIndividuals()]` |

The source file states the policy in its own header comment: the **TBox** is the real Pizza ontology, and the **ABox** "is labelled as generated everywhere it appears and is never presented as part of pizza.owl" `[src: NS]`.

There is one deliberate crossing of the boundary and it runs in the correct direction only: generated `demo:` order records are typed with a **real** `pizza:` named-pizza class, so that the generated **ABox** is genuinely an instance layer over the real **TBox** rather than an unrelated dataset `[src: generateIndividuals()]`. No `pizza:` **Entity** is ever created by the generator, and no `demo:` **Entity** is ever presented as part of the Pizza ontology.

### 7.2 Why the split exists

1. **The TBox must be real so that the axioms are real.** Existential and universal restrictions, a value partition, disjointness, transitive and functional properties, defined classes and a deliberately unsatisfiable class are all present because the Pizza ontology actually contains them `[src: CLASS_SPEC]` `[src: OBJ_PROPS]`. A fabricated **TBox** would let the specification quietly avoid the hard cases.
2. **The ABox must be generated so that the scale is real.** No published tutorial ontology carries 100,000 Individuals. The performance discipline the product is built around — the **Budget**, **Eviction**, virtualisation, on-demand capped adjacency — is only demonstrable against an **ABox** that can be made arbitrarily large on demand `[src: #scaleMenu]`.
3. **The user must never be misled about provenance.** An ontology engineer looking at `pizza:Margherita` is looking at a real, citable class. An ontology engineer looking at `demo:Pizza_000042` is looking at a fabrication. Blurring the two would make every screenshot, every example query and every acceptance test untrustworthy.

### 7.3 Policy requirements

**OVR-83** The **TBox** MUST be the real Pizza ontology and MUST reproduce its class names, property names and axioms verbatim `[src: CLASS_SPEC]` `[src: OBJ_PROPS]` `[src: NAMED_PIZZAS]`.

**OVR-84** The generated **ABox** MUST occupy a namespace distinct from the **TBox** namespace `[src: NS]`.

**OVR-85** The generator MUST NOT create, modify or delete any **Entity** in the `pizza:` namespace `[src: generateIndividuals()]`.

**OVR-86** Every generated **Entity** MUST be labelled as generated wherever it is shown to the user. The reference build marks it in the inspector with the chip "generated demo data" `[src: renderInspector()]`, describes generated Individuals with the comment "Generated demo individual." `[src: resolve()]`, and prefixes generated vocabulary comments with "Generated demo data." `[src: DEMO_CLASSES]`.

**OVR-87** The dataset-size control MUST be labelled as operating on generated data, and MUST restate the split. The reference build labels the flyout "Generated individuals (demo dataset)" and closes it with "Classes and properties come from the real Pizza ontology. Individuals are generated order records in a separate demo namespace." `[src: #scaleMenu]`

**OVR-88** The five `pizza:Country` Individuals — America, England, France, Germany, Italy — MUST remain in the `pizza:` namespace, because they are genuinely enumerated in the Pizza ontology and are not generated `[src: COUNTRIES]` `[src: buildTBox()]`.

**OVR-89** Regenerating the **ABox** MUST NOT alter the **TBox** `[src: generateIndividuals()]`.

**OVR-90** Generation MUST be deterministic. The reference build uses a linear congruential generator reset to the fixed seed `20250911` at the start of every run `[src: rnd()]` `[src: generateIndividuals()]`.

**OVR-91** After regeneration the product MUST report the resulting Store size, the elapsed time, and a restatement of the **Budget** invariant. The reference build reports: "Store rebuilt: *n* triples, *m* individuals, in *t* ms. The viewport still holds at most *b* nodes." `[src: regenerate()]`

**OVR-92** This split MUST be preserved by any re-implementation. Replacing the real **TBox** with synthetic classes, or promoting generated Individuals into the `pizza:` namespace, is a conformance failure.

---

## 8. Glossary

The canonical glossary for the whole suite. Terms are used exactly as defined here, in every document, without aliasing.

### 8.1 Suite terms

| Term | Definition | Reference |
|---|---|---|
| **Store** | The single in-memory ontology database holding all entities, **TBox** triples, compact **Individual** records and the indexes over them. There is exactly one Store per session. | `[src: store]` |
| **TBox** | The terminological box: classes, properties, and the axioms relating them — subsumption, equivalence, disjointness, restrictions, domains, ranges and property characteristics. | `[src: store]` |
| **ABox** | The assertional box: **Individual**s and the facts asserted about them. | `[src: store]` |
| **Entity** | Any IRI-named thing in the Store: a class, a defined class, an **Individual**, an object property or a data property. | `[src: addEntity()]` `[src: KIND]` |
| **Individual** | A named instance. In this fixture: the five `pizza:Country` Individuals, and every generated `demo:` order and customer. | `[src: KIND]` `[src: individualCount()]` |
| **Viewport** | The bounded set of nodes, and the edges between them, currently on the graph canvas. A strict subset of the Store. | `[src: G]` |
| **Budget** | The hard maximum **Viewport** node count. Default 1,000; adjustable 100–3,000 in steps of 100. | `[src: G]` `[src: #budgetRange]` |
| **Eviction** | Removal of a node from the **Viewport** to make room within **Budget**. Ordered by distance from the **Focus set**, then by in-view degree, then by least-recently-touched; or purely by least-recently-touched, according to policy. | `[src: evictionOrder()]` |
| **Focus set** | The seed nodes of the current **Viewport**. Populated by seeding or focusing; exempt from **Eviction**. | `[src: G]` `[src: seedView()]` |
| **Pin** | A per-node user-applied **Eviction** exemption, toggled from the node context menu. Pinned nodes are marked in the legend. | `[src: wireCanvas()]` `[src: renderLegend()]` |
| **Hidden neighbour** | A neighbour of an in-**Viewport** node that exists in the Store but is not itself in the **Viewport**. Computed as total degree minus in-view degree. | `[src: hiddenNeighbours()]` |
| **Surface** | One of the four work areas: graph workbench, class hierarchy tree and inspector, individuals table, SPARQL console. | §3 |
| **Layout mode** | One of `force`, `hierarchy`, `radial`, `grid`, `auto`. `auto` resolves to one of the other four based on the shape of the current **Viewport**. | `[src: LAYOUT_NAMES]` `[src: chooseLayout()]` |
| **Design token** | A named visual constant — colour, size, radius, duration, font — and the only legal source of a visual value in the product. | `[src: :root]` |

### 8.2 Ontology terms

| Term | Definition | Reference |
|---|---|---|
| **IRI** | Internationalised Resource Identifier: the globally unique name of an **Entity**. Every **Entity** in the Store is keyed by its IRI, for example `http://www.co-ode.org/ontologies/pizza/pizza.owl#Margherita`. | `[src: addEntity()]` |
| **Prefixed name** | An IRI abbreviated by replacing a known namespace IRI with a short prefix, for example `pizza:Margherita`. An IRI with no known prefix is shown in angle brackets. | `[src: shorten()]` `[src: PFX]` |
| **Local name** | The part of an IRI after the last `#` or `/`. Used as the display name of an **Entity**. | `[src: localName()]` |
| **Namespace** | The IRI stem shared by a family of **Entity** names. Six are registered: `pizza:`, `demo:`, `rdf:`, `rdfs:`, `owl:`, `xsd:`. | `[src: NS]` |
| **Class** | A set of Individuals, asserted by the modeller. Kind `class`; rendered as a rounded rectangle. Example: `pizza:MushroomTopping`. | `[src: KIND]` `[src: KIND_META]` |
| **Defined class** | A class whose membership is given by necessary **and sufficient** conditions — an equivalence rather than a subsumption — so that a reasoner could classify Individuals into it. Kind `defined`. Example: `pizza:VegetarianPizza`, equivalent to `pizza:Pizza` and `hasTopping only VegetarianTopping`. | `[src: KIND]` `[src: CLASS_SPEC]` |
| **Named individual** | An **Individual** with its own IRI, as opposed to an anonymous one. Kind `individual`; rendered as a circle. Example: `pizza:Italy`. | `[src: KIND_META]` `[src: COUNTRIES]` |
| **Object property** | A property whose values are Individuals or classes — a relation between two things. Kind `objectProperty`; rendered as a diamond. Example: `pizza:hasTopping`. | `[src: KIND_META]` `[src: OBJ_PROPS]` |
| **Data property** | A property whose values are literals of a datatype. Kind `dataProperty`; rendered as a hexagon. Example: `demo:priceGBP`, with range `xsd:decimal`. | `[src: KIND_META]` `[src: DEMO_DATA_PROPS]` |
| **Literal** | A typed data value, as opposed to an IRI-named thing. Held as a value plus a datatype. | `[src: lit()]` `[src: isLit]` |
| **`subClassOf`** | The subsumption axiom: every member of the subclass is a member of the superclass. Written `rdfs:subClassOf`; rendered in the inspector as `⊑`. Forms the class hierarchy. | `[src: RDFS_SUBCLASS]` `[src: renderInspector()]` |
| **`subPropertyOf`** | The property subsumption axiom, forming the property hierarchy. Example: `pizza:hasTopping` is a sub-property of `pizza:hasIngredient`. | `[src: P_SUBPROP]` `[src: OBJ_PROPS]` |
| **`rdf:type`** | The instantiation axiom: this **Individual** is a member of this class. Rendered in the inspector as `a`. | `[src: RDF_TYPE]` `[src: renderInspector()]` |
| **Existential restriction** | "has **some**": the class of things having at least one value of the given property drawn from the given filler. Quantifier `some`. Example: `pizza:CheesyPizza ≡ Pizza and hasTopping some CheeseTopping`. | `[src: normRestriction()]` `[src: CLASS_SPEC]` |
| **Universal restriction** | "has **only**": the class of things all of whose values for the given property are drawn from the given filler. Quantifier `only`. Example: `pizza:VegetarianPizza ≡ Pizza and hasTopping only VegetarianTopping`. A named pizza also carries a closure axiom of this form over its full topping list. | `[src: normRestriction()]` `[src: buildTBox()]` |
| **Cardinality restriction** | A constraint on the *number* of values a property may take. Quantifiers `min` and `max` with an integer. Examples: `hasTopping min 3 PizzaTopping` on `pizza:InterestingPizza`; `hasCountryOfOrigin max 1` on `pizza:Pizza`. | `[src: normRestriction()]` `[src: restrictionText()]` `[src: CLASS_SPEC]` |
| **Value restriction** | "has **value**": the class of things related by the given property to one specific named **Individual**. Quantifier `value`. Example: `pizza:MozzarellaTopping ⊑ hasCountryOfOrigin value Italy`. | `[src: normRestriction()]` `[src: CLASS_SPEC]` |
| **Complement** | The negation of a class expression, written `not`. Example: `pizza:NonVegetarianPizza ≡ Pizza and not VegetarianPizza`. | `[src: normRestriction()]` `[src: restrictionText()]` |
| **Value partition** | A modelling pattern in which a quality is represented as a class with an exhaustive, mutually exclusive set of subclasses, and an object property pointing at it. Here: `pizza:Spiciness`, partitioned into `Hot`, `Medium` and `Mild`, reached by `pizza:hasSpiciness`. The reference comment reads: "A value partition. Every topping is Mild, Medium or Hot — never two at once." | `[src: CLASS_SPEC]` `[src: buildTBox()]` |
| **Disjointness** | An axiom stating that two classes share no members. Written `owl:disjointWith`; rendered in the inspector as `⊥`. Example: `pizza:Pizza` is disjoint with `pizza:PizzaBase` and `pizza:PizzaTopping`. | `[src: buildTBox()]` `[src: renderInspector()]` |
| **Equivalence** | An axiom stating two class expressions have the same members. Written `owl:equivalentClass`; rendered in the inspector as `≡`. This is what makes a class a **defined class**. | `[src: neighboursOf()]` `[src: renderInspector()]` |
| **Domain** | The class an **Entity** must belong to in order to be the *subject* of a given property. Example: the domain of `pizza:hasTopping` is `pizza:Pizza`. | `[src: OBJ_PROPS]` `[src: buildTBox()]` |
| **Range** | The class — or, for a data property, the datatype — that values of a given property must belong to. Example: the range of `pizza:hasTopping` is `pizza:PizzaTopping`; the range of `demo:rating` is `xsd:integer`. | `[src: OBJ_PROPS]` `[src: DEMO_DATA_PROPS]` |
| **Functional** | A property characteristic: a subject may have at most one value for the property. Example: `pizza:hasBase` is Functional — a pizza has exactly one base. | `[src: OBJ_PROPS]` |
| **Inverse functional** | A property characteristic: a value may be reached from at most one subject. Example: `pizza:hasBase` and `pizza:hasTopping` are both InverseFunctional — a particular physical base or topping belongs to one pizza. | `[src: OBJ_PROPS]` |
| **Transitive** | A property characteristic: if *a* relates to *b* and *b* relates to *c*, then *a* relates to *c*. Example: `pizza:hasIngredient` is Transitive. | `[src: OBJ_PROPS]` |
| **Inverse** | The property that relates the same pairs in the opposite direction. Example: `pizza:hasTopping` and `pizza:isToppingOf` are inverses. Written `owl:inverseOf`. | `[src: OBJ_PROPS]` `[src: neighboursOf()]` |
| **Asserted axiom** | An axiom the modeller wrote down. Everything Axiom displays is asserted. | `[src: renderInspector()]` |
| **Inferred axiom** | An axiom a reasoner derived from the asserted ones — for example, a class placed under a **defined class** it satisfies. Axiom computes none, reserves a labelled region for them, and states that no reasoner has run. | `[src: renderInspector()]` |
| **Triple** | A subject–predicate–object statement. **TBox** triples are held explicitly; **ABox** triples are counted arithmetically from compact records, at seven per generated order plus two per generated customer. | `[src: T()]` `[src: tripleCount()]` |

### 8.3 Glossary requirements

**OVR-93** Every document in the suite MUST use these terms with these meanings and MUST NOT introduce a synonym for any of them.

**OVR-94** User-facing copy MUST use the same vocabulary as this glossary wherever the concept appears, so that the interface and the documentation teach the same words.

**OVR-95** Any new term required by a later document MUST be added to this glossary rather than defined locally.

---

## 9. Quality attributes

Targets are stated as measurable budgets. Where the reference build already measures and reports a figure, the citation is given; where the target is a specification rather than an observed behaviour, it is marked.

### 9.1 Interaction latency

**OVR-96** Selection — clicking a tree row, a table row or a graph node — MUST update the inspector, the tree highlight and the status bar within **100 ms** at any Store size `[src: selectEntity()]`.

**OVR-97** Hover feedback on the graph canvas MUST update within **one frame** of the pointer moving, and MUST NOT run a full-Store query; hit testing MUST be against the **Viewport** only `[src: hitTest()]`.

**OVR-98** Pan and zoom MUST sustain **60 frames per second** at the full **Budget** of 3,000 nodes.
**Status:** specified, not implemented in the reference build. The reference build renders continuously from an animation loop `[src: frame()]` but publishes no frame-rate measurement.

**OVR-99** Type-ahead filters MUST be debounced so that typing does not trigger a re-render per keystroke. The reference debounces the hierarchy filter by **140 ms** and the individuals filter by **160 ms** `[src: wire()]`.

**OVR-100** Expanding a node MUST complete within **250 ms** for an expansion of up to the **Budget**, including **Eviction**, re-linking and the report `[src: expandNode()]` `[src: addToView()]`.

**OVR-101** Any operation expected to exceed **200 ms** MUST yield to the interface first so that its running state is visible before it blocks. The reference build defers both dataset regeneration and query evaluation by one frame for exactly this reason `[src: regenerate()]` `[src: runQuery()]`.

### 9.2 Layout computation budget

**OVR-102** A full layout run MUST be bounded by a work budget that falls as node count rises, so that layout time is approximately constant rather than growing with the **Viewport**. The reference force layout runs `max(70, min(300, round(70000 / (n + 60))))` synchronous ticks on a fresh layout — 300 ticks at small sizes, falling to the 70-tick floor beyond roughly 940 nodes `[src: layoutForce()]`.

**OVR-103** The force layout MUST use an approximation with `O(n log n)` per-tick cost rather than an `O(n²)` all-pairs computation. The reference uses Barnes-Hut with `theta = 0.81` `[src: THETA2]` `[src: qRepel()]`.

**OVR-104** A full layout run MUST complete within **500 ms** at the default **Budget** of 1,000 nodes, and within **1,500 ms** at the maximum **Budget** of 3,000 nodes.

**OVR-105** The product MUST report the measured layout time to the user after an explicit re-layout, naming the resolved **Layout mode**, the node count and the relationship count. The reference reports "*Mode* layout over *n* nodes and *m* relationships in *t* ms." `[src: wire()]`

**OVR-106** Layout MUST be recomputed only when the **Viewport** actually changed. The reference guards this with a signature over node count, edge count, revision counter and **Layout mode** `[src: layoutKey()]` `[src: stepLayout()]`.

**OVR-107** The three non-force **Layout modes** MUST be computed once per change rather than animated continuously, and the freeze control MUST be disabled while one of them is active `[src: relayout()]`.

### 9.3 Table scroll behaviour

**OVR-108** The individuals table MUST render only the rows in the visible window plus a fixed overscan. The reference uses a row height of **32 px**, starts **6 rows** above the first visible row, and renders `ceil(viewportHeight / 32) + 12` rows `[src: ROW_H]` `[src: renderTableRows()]`.

**OVR-109** Scrolling MUST be smooth at **60 frames per second** with 100,000 filtered rows, and the cost of a scroll frame MUST be independent of the filtered row count `[src: renderTableRows()]`.

**OVR-110** Scroll position MUST be reset to the top whenever the filter or the sort changes, so that the visible rows always correspond to the stated row count `[src: wire()]`.

**OVR-111** Applying a filter across the full **ABox** MUST complete within **300 ms** at 100,000 Individuals. The reference performs a single linear pass with an early-exit per predicate `[src: applyFilters()]`.

**OVR-112** Scroll handling MUST NOT block the input thread; the reference registers its scroll listeners as passive `[src: wire()]`.

### 9.4 Query response reporting

**OVR-113** Query evaluation MUST measure and report its own elapsed time, in whole milliseconds, with a floor of 1 ms `[src: runQuery()]`.

**OVR-114** The query status line MUST state, in one line: the row count; whether a `LIMIT` truncated a larger result and what that larger count was; the elapsed milliseconds; the Store triple count it ran over; the number of distinct IRIs in the result; and whether the intermediate solution cap was reached `[src: runQuery()]`.

**OVR-115** Intermediate solutions MUST be capped so that a pathological query cannot exhaust memory. The reference cap is **200,000** solutions, and reaching it MUST be reported rather than hidden `[src: SOLUTION_CAP]` `[src: evaluate()]`.

**OVR-116** A query over the largest supported Store MUST return within **2,000 ms** for any of the supplied example queries `[src: EXAMPLES]`.

**OVR-117** While a query is running, the console MUST show a running state and MUST disable the send-to-graph action until the result is known `[src: runQuery()]`.

### 9.5 Reporting and legibility

**OVR-118** Transient reports MUST appear in a single non-modal region, MUST be dismissible, and MUST auto-dismiss. The reference auto-dismisses after **6,000 ms** `[src: showToast()]`.

**OVR-119** Reports MUST be distinguishable by severity — informational versus warning — by colour **and** by icon, never by colour alone `[src: showToast()]`.

**OVR-120** Graph labels MUST be placed by collision avoidance: a label that would overlap one already placed MUST be omitted rather than drawn over. Zooming in MUST reveal omitted labels `[src: placeLabels()]`.

**OVR-121** Graph labels MUST be drawn at a fixed point size in screen space regardless of zoom, so that legibility does not vary with scale `[src: placeLabels()]`.

**OVR-122** Long labels MUST be truncated with an ellipsis at a fixed length. The reference truncates above **30** characters, to 28 characters plus an ellipsis `[src: shortLabel()]`.

**OVR-123** Fit-to-view MUST frame the whole **Viewport** with a fixed padding and MUST clamp the resulting zoom. The reference uses **88 px** padding and clamps to the range 0.05–1.9 `[src: fitView()]`.

**OVR-124** Interactive zoom MUST be clamped to the range **0.08–4** `[src: wireCanvas()]`.

**OVR-125** Node kind MUST be distinguishable by shape **and** by colour, never by colour alone. The reference assigns: class and defined class a rounded rectangle, **Individual** a circle, object property a diamond, data property a hexagon `[src: KIND_META]` `[src: nodePath()]`.

**OVR-126** A legend MUST be present on the graph Surface, enumerating every node kind, the pinned marker, and the meaning of the `+n` **Hidden neighbour** marker `[src: renderLegend()]`.

---

## Appendix A — Native stack mapping (non-normative)

The normative body above says nothing about a UI framework, and a conformant implementation may use any. This appendix records the trade-offs for the three realistic Windows choices and states a recommendation, so that the decision is made once and with reasons.

### A.1 What this product actually demands of a stack

| Demand | Why it is hard | Where it bites |
|---|---|---|
| A high-throughput 2D drawing surface | Up to 3,000 nodes plus edges, redrawn every frame while a force simulation runs, with per-frame screen-space label collision | [Graph rendering and export](22-graph-rendering-and-export.md) |
| Real UI virtualisation | 100,000-row table, smooth scroll, per-cell editing, sortable headers | [Individuals table](31-individuals-table.md) |
| A virtualised, hierarchical tree | Large class hierarchies with expand/collapse and filter | [Class tree and inspector](30-class-tree-and-inspector.md) |
| Dense desktop chrome | Compact controls, splitters, dockable panels, a real status bar, custom title bar | [Component library](41-component-library.md) |
| Theming from tokens | Light and dark, driven entirely from named constants | [Design system](40-design-system.md) |
| Image export | PNG at 2× and 3×, vector SVG, and clipboard image | [Graph rendering and export](22-graph-rendering-and-export.md) |
| Off-thread compute | Layout ticks, dataset generation, query evaluation, all without freezing input | [Architecture](10-architecture.md) |

### A.2 WinUI 3

**For.** It is the current first-party Windows 11 stack, so Mica, the Windows 11 control styling, native title-bar customisation and the platform's own typography come free rather than being imitated. Its `ItemsRepeater` and `ListView` virtualisation is genuinely incremental. Win2D gives a retained- or immediate-mode Direct2D surface that will comfortably draw thousands of primitives per frame with hardware acceleration, which is exactly what the graph workbench needs. It is also the only option where "this looks like a Windows 11 application" is the default rather than an achievement — which is, verbatim, the user's stated motivation.

**Against.** The desktop story has been unsettled. Packaging (MSIX versus unpackaged with the Windows App SDK bootstrapper) adds friction that WPF does not have. The ecosystem of third-party controls is thinner. There is no cross-platform path at all: choosing WinUI 3 forecloses macOS and Linux permanently. Tooling and designer support are weaker than WPF's, and some patterns that are trivial in WPF still require workarounds.

### A.3 Avalonia

**For.** Cross-platform by construction, so a future macOS or Linux build is a possibility rather than a rewrite. Its rendering model is its own compositor over Skia, which means a custom drawing control behaves identically everywhere and is fast. The XAML dialect is close enough to WPF that the skills transfer. Theming is first-class and token-driven styling is natural; a Fluent theme ships in the box. Virtualisation in `ItemsControl` and `TreeDataGrid` is real and well suited to a 100,000-row table.

**Against.** Its Windows 11 fidelity is an emulation, not the platform's own. Mica, native title-bar behaviour, system accent integration and the exact Fluent control metrics all require deliberate work, and the result is usually *close* rather than *right*. For a user whose explicit complaint is that everything else fails to feel like a real Windows application, "close" is the wrong end of the trade. Some Windows-specific integration (jump lists, shell behaviours, per-monitor DPI edge cases) needs platform-specific code anyway.

### A.4 WPF

**For.** The most mature option: fifteen years of controls, patterns, documentation and answers. Its virtualisation is battle-tested at exactly this scale, and `VirtualizingStackPanel` with container recycling will carry a 100,000-row grid without drama. Styling and templating are the most expressive of the three. Packaging is trivial. Hiring and onboarding are easiest here.

**Against.** Its rendering stack is the oldest, and while a `DrawingVisual` or a `WriteableBitmap` can be pushed hard, a 3,000-node animated graph is closer to its ceiling than to its comfortable middle. Its default look is Windows 7-era and reaching Windows 11 fidelity means either a third-party theme or a great deal of template work — which is much the same objection as Avalonia's, with less modern machinery to do it with. Per-monitor DPI v2 support arrived late and is still awkward. It is also, plainly, a legacy platform.

### A.5 Recommendation

**Build on WinUI 3, with Win2D for the graph canvas.**

The reasons, in order of weight:

1. **The brief is platform fidelity.** The product exists because the alternatives do not feel like Windows applications. WinUI 3 is the only option where that is the starting condition rather than the goal. Every hour spent making Avalonia or WPF *look* like Windows 11 is an hour spent re-earning something WinUI 3 gives away.
2. **The graph is the hard part, and Win2D solves it.** Direct2D through Win2D is the strongest 2D immediate-mode surface of the three, and the graph workbench is the requirement most likely to fail on an inadequate stack. It also makes the export path straightforward: the same draw routine can be re-run into an off-screen render target at 2× or 3× for PNG, which is precisely the structure the reference build uses `[src: renderExportCanvas()]`.
3. **The virtualisation requirement is met.** `ItemsRepeater` handles 100,000 rows; nothing in [Individuals table](31-individuals-table.md) needs more than that.
4. **Cross-platform is not a stated goal.** The brief is a Windows executable. Paying Avalonia's fidelity cost to buy portability that was never asked for is a bad trade. If portability becomes a goal later, the framework-neutral structure of this suite — a Store and four Surfaces, all specified without reference to a rendering API — is what makes a port tractable, not the choice of framework now.

Two risks to accept deliberately:

- **Packaging.** Decide MSIX versus unpackaged early, in [Implementation plan](60-implementation-plan.md), because it affects the build pipeline from the first commit.
- **Control gaps.** The dense desktop chrome — splitters, the custom title bar, the compact command bar, the status bar — will need custom controls. Budget for that in the component phase rather than discovering it midway.

If cross-platform ambition is added to the brief at any point, switch to **Avalonia** rather than WPF: it loses the same Windows fidelity that WPF loses, but it is the newer platform, its rendering is stronger, and it buys something real in return.
