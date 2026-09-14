# Axiom — Architecture

Purpose: define the module decomposition, boot order, frame loop, cross-surface selection bus, application state containers, revision-driven relayout, undo model, chrome infrastructure, theming, regeneration, resilience and performance envelope of the Axiom ontology workbench.

**Status:** Normative

Requirement ID prefix owned by this document: `ARCH`.

Related documents: [Data model and Store](11-data-model-and-store.md), [Viewport and Budget](20-graph-viewport-and-budget.md), [Layout algorithms](21-layout-algorithms.md), [Graph rendering and export](22-graph-rendering-and-export.md), [Class tree and inspector](30-class-tree-and-inspector.md), [Individuals table](31-individuals-table.md), [SPARQL console](32-sparql-console.md), [Design system](40-design-system.md), [Component library](41-component-library.md), [Implementation plan](60-implementation-plan.md), [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md), [Pizza ontology fixture](62-pizza-ontology-fixture.md).

---

## 1. Scope and conventions

**ARCH-1** This document is framework-neutral. The normative body MUST NOT be read as prescribing any UI toolkit, retained-mode scene graph or rendering API. Mappings onto a concrete Windows stack are confined to [Appendix A](#appendix-a--native-stack-mapping-non-normative).

**ARCH-2** The terms **Store**, **TBox**, **ABox**, **Entity**, **Individual**, **Viewport**, **Budget**, **Eviction**, **Focus set**, **Pin**, **Hidden neighbour**, **Surface**, **Layout mode** and **Design token** carry the meanings fixed in [Data model and Store](11-data-model-and-store.md) and [Viewport and Budget](20-graph-viewport-and-budget.md). Implementations MUST NOT introduce aliases for them in code identifiers, user-facing copy or documentation.

**ARCH-3** A **Surface** is a user-visible region that presents Store or Viewport content and accepts input. The Surfaces are: the class tree, the entity inspector, the graph Viewport, the individuals table, the SPARQL console, the command bar and the status bar. A Surface MUST own its own presentation state and MUST NOT reach into the presentation state of another Surface.

**ARCH-4** The reference build is one self-contained document of 4,743 lines with a single script block. Its own section banners are the authority for the module boundaries in this document; every module named in [section 2](#2-module-decomposition) corresponds to one banner in that source.

**ARCH-5** The `pizza:` namespace is the real Pizza ontology vocabulary. The `demo:` namespace is generated demonstration data. Every module, every Surface and every piece of user-facing copy MUST keep the two distinguishable, and MUST NOT present `demo:` content as part of the Pizza ontology.

---

## 2. Module decomposition

**ARCH-6** The application MUST be decomposed into exactly the fifteen modules in the table below. Each row gives the module identifier used throughout this suite, its single responsibility, and the source banner it is derived from.

| ID | Module | Single responsibility | Derived from source banner |
|----|--------|----------------------|----------------------------|
| M1 | Ontology source data | Hold the literal authoring tables for the `pizza:` TBox and the `demo:` vocabulary. Contains no logic. | `TBox source data` `[src: CLASS_SPEC]` |
| M2 | Store | Build, hold and mutate the Store: Entity map, TBox triple array, flattened restriction array, compact Individual record array and its indexes. | `Store`, `ABox generator` `[src: store]` |
| M3 | Adjacency | Answer "what is adjacent to this IRI" for the whole product, on demand, capped. | `Adjacency` `[src: neighboursOf()]` |
| M4 | Graph viewport | Hold the bounded node and edge set; admit and evict under the Budget; expand and collapse neighbourhoods. | `Graph viewport` `[src: G]` |
| M5 | Layout engines | Assign coordinates to Viewport nodes under one of four Layout modes; choose the mode when set to auto. | `Layout engines` `[src: relayout()]` |
| M6 | Rendering | Draw the Viewport, the minimap and the labels; resolve hit tests. | `Rendering` `[src: renderScene()]` |
| M7 | Export | Produce PNG, SVG and clipboard images of the current scene with chrome, independent of the on-screen Surface size. | `Export` `[src: renderExportCanvas()]` |
| M8 | Shared selection and helpers | Own the selection bus and the shared formatting helpers. | `Shared selection + DOM helpers` `[src: selectEntity()]` |
| M9 | Class tree | Present and filter the class and property hierarchies; inline rename. | `Class / property hierarchy tree` `[src: renderTree()]` |
| M10 | Inspector | Present all asserted axioms of the current selection; reveal a selection in the Viewport. | `Entity inspector` `[src: renderInspector()]` |
| M11 | Individuals table | Present, filter, sort and edit generated Individual records under virtualisation. | `Individuals table` `[src: renderTableRows()]` |
| M12 | SPARQL console | Parse and evaluate queries against the virtual triple source; present results. | `SPARQL console` `[src: runQuery()]` |
| M13 | Chrome | Toasts, flyout menus, modal dialogs, splitters, panel and dock collapse, theme, legend, Budget and Store read-outs, global search. | `Chrome: toasts, menus, dialogs, panels, theme`, `Splitters`, `Dialogs`, `Global search` `[src: showToast()]` |
| M14 | Wiring | Bind every input event on every Surface to operations exposed by M2–M13. Contains no algorithm. | `Wiring`, `Graph interaction` `[src: wire()]` |
| M15 | Boot | Construct the world in order, then run the frame loop; rebuild the dataset on request. | `Boot` `[src: init()]` |

### 2.1 Public surface of each module

**ARCH-7** Each module MUST expose exactly the operations listed below as its public surface. Anything not listed MUST be private to the module. Names are the reference build's; an implementation MAY rename, but MUST preserve arity, return shape and side-effect set.

| Module | Public surface |
|--------|----------------|
| M1 | `CLASS_SPEC`, `NAMED_PIZZAS`, `OBJ_PROPS`, `COUNTRIES`, `DEMO_CLASSES`, `DEMO_DATA_PROPS`, `BRANCHES`, `FIRST_NAMES`, `LAST_NAMES`, `BASE_PRICE`, `PIZZA_NAMES` — read-only tables `[src: CLASS_SPEC, NAMED_PIZZAS, OBJ_PROPS, BASE_PRICE]` |
| M2 | `NS`, `PFX`, `RDF_TYPE`, `RDFS_SUBCLASS`, `KIND`, `KIND_META`, `store`, `shorten()`, `localName()`, `humanise()`, `addEntity()`, `T()`, `lit()`, `isLit()`, `buildTBox()`, `normRestriction()`, `restrictionText()`, `restrictionTargets()`, `rnd()`, `generateIndividuals()`, `tripleCount()`, `classCount()`, `propCount()`, `individualCount()`, `resolve()`, `buildRBox()`, `DEMO_PRED`, `scan()` `[src: store, buildTBox(), scan()]` |
| M3 | `NEIGHBOUR_CAP`, `buildReverseIndex()`, `customerIndex()`, `neighboursOf()`, `labelOf()`, `kindOf()` `[src: NEIGHBOUR_CAP, neighboursOf()]` |
| M4 | `G`, `nodeRadius()`, `makeNode()`, `addToView()`, `removeFromView()`, `expandNode()`, `collapseNode()`, `seedView()`, `evictionOrder()`, `hiddenNeighbours()`, `totalHidden()`, `viewEdges()` `[src: G, addToView()]` |
| M5 | `LAYOUT_NAMES`, `chooseLayout()`, `relayout()`, `stepLayout()`, `fitView()`, `indexEdges()`, `layoutKey()` `[src: LAYOUT_NAMES, stepLayout()]` |
| M6 | `refreshPalette()`, `resizeCanvas()`, `renderScene()`, `draw()`, `drawMinimap()`, `hitTest()`, `nodePath()`, `placeLabels()` `[src: draw(), hitTest()]` |
| M7 | `exportPNG()`, `exportSVG()`, `copyGraphImage()`, `sceneBounds()`, `legendEntries()`, `EXPORT_HEADER`, `EXPORT_FOOTER`, `EXPORT_MAX_PX` `[src: exportPNG(), EXPORT_MAX_PX]` |
| M8 | `UI`, `selectEntity()`, `esc()`, `fmt()`, `money()`, `when()` `[src: UI, selectEntity()]` |
| M9 | `ROOT`, `DEFAULT_OPEN`, `treeRoots()`, `treeChildren()`, `subtreeSize()`, `renderTree()`, `renderTreeSelection()`, `toggleTreeNode()`, `beginRename()`, `commitRename()`, `validateName()` `[src: ROOT, DEFAULT_OPEN, renderTree()]` |
| M10 | `renderInspector()`, `revealInGraph()`, `entityLink()` `[src: renderInspector(), revealInGraph()]` |
| M11 | `ROW_H`, `COLS`, `TBL`, `renderTableHead()`, `renderTableRows()`, `applyFilters()`, `resetFilters()`, `beginCellEdit()`, `commitCell()`, `populateFilterOptions()` `[src: ROW_H, COLS, TBL]` |
| M12 | `SOLUTION_CAP`, `EXAMPLES`, `parseQuery()`, `evaluate()`, `runQuery()`, `renderQueryResults()`, `highlight()`, `QR` `[src: SOLUTION_CAP, runQuery(), QR]` |
| M13 | `showToast()`, `setStatusMessage()`, `reportView()`, `openMenu()`, `closeMenus()`, `openDialog()`, `closeDialog()`, `setTheme()`, `renderLegend()`, `updateBudgetUI()`, `updateStoreUI()`, `wireSplitter()`, `newClassDialog()`, `newIndividualDialog()`, `deleteSelected()`, `undo()`, `searchEntities()` `[src: showToast(), openDialog(), setTheme()]` |
| M14 | `wire()`, `wireCanvas()`, `wireGlobalSearch()` `[src: wire(), wireCanvas()]` |
| M15 | `init()`, `frame()`, `regenerate()` `[src: init(), frame(), regenerate()]` |

**ARCH-8** `buildRBox()` is textually defined beneath the SPARQL console banner in the reference build `[src: buildRBox()]`, but it is a Store-tier operation: it materialises flattened restriction triples into `store.rbox`. Implementations MUST place it in M2 and MUST NOT make M2 depend on M12 in order to obtain it.

**ARCH-9** M1 MUST contain no executable logic beyond literal table construction. Any derivation from those tables belongs in M2.

**ARCH-10** Presentation helpers that format values for display — thousands separators, currency, timestamps, HTML escaping — live in M8 and MUST NOT be duplicated in Surface modules `[src: fmt(), money(), when(), esc()]`.

### 2.2 Dependency graph

**ARCH-11** The module dependency graph MUST be acyclic. The complete set of permitted edges is given below; each row names the one direction the edge runs and why. Any edge not listed MUST NOT exist.

| From | To | Direction and reason |
|------|----|----------------------|
| M2 | M1 | Store reads the authoring tables. M1 never calls back. |
| M3 | M2 | Adjacency reads the Entity map, restriction lists and Individual indexes. Store never asks for neighbours. |
| M4 | M3 | Viewport asks for a node's true degree and neighbour list when admitting and linking. Adjacency knows nothing of the Viewport. |
| M4 | M2 | Viewport reads `KIND` to size nodes by Entity kind. |
| M5 | M4 | Layout reads and writes node coordinates in the Viewport. The Viewport never invokes a layout engine directly; it raises `G.rev` instead (see [section 7](#7-structural-revision-counter)). |
| M5 | M2 | Layout classifies edges by predicate constants (`rdfs:subClassOf`, `rdfs:subPropertyOf`, `rdf:type`). |
| M6 | M4 | Renderer reads nodes, edges, view transform, hover and selection. |
| M6 | M2 | Renderer reads `KIND_META` for shape and colour token per Entity kind. |
| M6 | M5 | Renderer reads `G.radialRings`, `G.ringOrigin` and `G.groupBlocks`, produced by layout, to draw ring and cluster guides. |
| M7 | M6 | Export re-uses the scene renderer against an off-screen Surface. |
| M7 | M4 | Export computes scene bounds from the Viewport. |
| M8 | M2 | Selection bus resolves an IRI to a displayable record and to a kind label. |
| M8 | M4 | Selection bus mirrors the selection into `G.selected` when that node is in view. |
| M8 | M9 | Selection bus notifies the tree highlight. |
| M8 | M10 | Selection bus notifies the inspector, and requests reveal-in-graph when asked. |
| M9 | M2, M3, M8 | Tree reads the Entity map and instance counts, resolves labels, publishes selection. |
| M10 | M2, M3, M4, M8, M13 | Inspector resolves the selection, reads adjacency-derived counts, pages instances into the Viewport, links back through M8, reports through M13. |
| M11 | M2, M8, M4, M13 | Table reads Individual records, publishes selection, seeds the Viewport, reports through M13. |
| M12 | M2, M8, M4, M13 | Console scans the virtual triple source, publishes selection on result-IRI activation, seeds the Viewport, reports through M13. |
| M13 | M2, M3, M4, M5, M6, M8, M9, M10, M11 | Chrome owns the dialogs, undo and global search, which mutate the Store and then force each affected Surface to re-render. |
| M14 | M1–M13 | Wiring may call anything. Nothing may call M14. |
| M15 | M1–M14 | Boot may call anything. Nothing may call M15 except the platform entry point and the dataset menu, which invokes `regenerate()` through M14. |

**ARCH-12** M1, M2 and M3 MUST NOT depend on any Surface, on the Viewport, on layout or on rendering. A change confined to the presentation layer MUST be provable to leave M1–M3 untouched.

**ARCH-13** No Surface module (M9, M10, M11, M12) MUST depend on another Surface module. Cross-surface effects travel through M8 (selection) or M13 (chrome, dialogs, toasts) only. See [section 6](#6-cross-surface-selection).

**ARCH-14** M6 MUST NOT be reachable from M2, M3 or M4. The renderer is a pure consumer of model state.

**ARCH-15** The edges M8 → M9 and M8 → M10 are the only permitted calls from the selection bus into a Surface, and they exist precisely so that no Surface has to know about any other. An implementation MAY invert them into an observer registration, in which case M8 MUST NOT retain a compile-time dependency on M9 or M10, and the registration order MUST be fixed by [section 6](#6-cross-surface-selection).

---

## 3. Boot sequence

**ARCH-16** Boot MUST execute the ordered steps of `init()` exactly as specified below `[src: init()]`. The order is load-bearing: each step's precondition is the postcondition of an earlier step, and the final column states the failure that results from reordering.

| # | Step | Reference call | Precondition | Postcondition | Why the order MUST hold |
|---|------|----------------|--------------|---------------|-------------------------|
| 1 | Construct the TBox | `buildTBox()` | `store.ent` empty, `store.tbox` empty | Every `pizza:` and `demo:` Entity exists with parents, children, restrictions, equivalents, disjoints, domain, range, inverse and characteristics; `store.tbox` holds all schema triples | Nothing else can name an Entity before it exists. Child links are computed at the end of this step from the parent lists, so no later step may add a parent without repairing them. |
| 2 | Generate the ABox | `generateIndividuals(12000)` | TBox present, because every generated record's type is a `pizza:` named-pizza IRI | `store.inds`, `store.indIndex`, `store.byType`, `store.customers` populated; `store.generatedCount = 12000`; `store.version` incremented | The by-type index keys are class IRIs minted in step 1. Generating first would produce records whose type has no Entity. |
| 3 | Build the reverse restriction index | `buildReverseIndex()` | All restrictions, equivalents, domains and ranges final | `revRestriction` maps filler IRI to a list of `{from, prop}` | Adjacency cannot report incoming restriction edges without it, and step 14 seeds the Viewport, which calls adjacency. |
| 4 | Flatten restrictions to triples | `buildRBox()` | Restrictions normalised in step 1 | `store.rbox` holds one `[subject, property, filler]` triple per `some` and per `value` restriction | The SPARQL console and the triple read-out both depend on `store.rbox`. Building it after a Surface has shown a triple count would display a stale figure. |
| 5 | Acquire the drawing surfaces | bind main and minimap Surfaces and their contexts | Surfaces exist in the layout | Main and minimap drawing contexts held | Palette refresh and sizing both need a live context. |
| 6 | Refresh the palette | `refreshPalette()` | Design tokens resolved for the active theme | `palette` holds resolved values for canvas, canvas grid, text, secondary text, strong stroke, divider, surface, accent, warn, UI font, mono font and the five Entity-kind colours `[src: refreshPalette()]` | The renderer reads only from `palette`; drawing before it is populated produces an unpainted frame. |
| 7 | Size the drawing surfaces | `resizeCanvas()` | Contexts held; layout measured | Backing stores sized to `clientWidth × dpr` by `clientHeight × dpr`, where `dpr = min(2, devicePixelRatio)`, and the context transform set to uniform scale `dpr` `[src: resizeCanvas()]` | `fitView()` divides by Surface dimensions; an unsized Surface yields a degenerate zoom. |
| 8 | Seed the default tree expansion | add each member of `DEFAULT_OPEN` to `UI.expanded` | `UI.expanded` empty | `owl:Thing`, `pizza:DomainConcept`, `pizza:Food`, `pizza:Pizza`, `pizza:PizzaTopping` marked expanded `[src: DEFAULT_OPEN]` | The tree renders from `UI.expanded`; seeding after the first render would show a collapsed root and then flicker. |
| 9 | Render the legend | `renderLegend()` | `KIND_META` available | Legend lists the five Entity kinds, plus a **Pin** marker and a **Hidden neighbour** marker `[src: renderLegend()]` | Independent of data; placed here so the graph panel is visually complete before the first frame. |
| 10 | First tree render | `renderTree()` | Steps 1, 2 and 8 complete | Tree rows emitted with per-class instance counts; class and property counters updated | Instance counts read `store.byType`, which exists only after step 2. |
| 11 | Table head, filter options, first filter pass | `renderTableHead()`, `populateFilterOptions()`, `applyFilters()` | Step 2 complete | Column headers with sort state; type filter listing every instantiated type with its count; `TBL.rows` populated; spacer sized to `rows × ROW_H`; first virtualised row window rendered | `populateFilterOptions()` enumerates `store.byType`; `applyFilters()` writes the row-count read-out. |
| 12 | First inspector render | `renderInspector()` | `UI.selection` is `null` | Empty-state panel shown | Establishes the empty state before any selection exists, so step 18 has something to replace. |
| 13 | Store read-out | `updateStoreUI()` | Steps 1, 2 and 4 complete | Status bar shows triple count, class count and Individual count `[src: updateStoreUI()]` | The triple count sums the TBox array plus per-Individual and per-customer counts; all three inputs must be final. |
| 14 | Wire every event | `wire()` | Every Surface has rendered at least once, so every element referenced by the wiring exists | All handlers bound; graph interaction bound; global search menu created; window resize bound; system colour-scheme preference applied | Handlers bind by element identity. Binding before first render would bind nothing. `wire()` ends by applying the dark theme when the system prefers it, which re-runs `refreshPalette()`; this is why step 6 may be superseded. |
| 15 | Seed the Viewport | `seedView([pizza:Pizza])` | Adjacency ready (step 3); Budget known | Nodes, edges and Focus set cleared then re-seeded; `pizza:Pizza` added to the Focus set; up to twelve seed IRIs expanded; `relayout({fresh:true})` and `fitView()` executed inside `seedView()` `[src: seedView()]` | Must follow wiring so that the Budget control value and the Eviction mode already reflect the controls' initial state. |
| 16 | Expand the named-pizza neighbourhood | `expandNode(pizza:NamedPizza, 30)` | `pizza:NamedPizza` admitted by step 15 | Up to thirty further neighbours admitted | Gives the first frame a recognisable shape rather than a single star. |
| 17 | Settle the layout and frame the scene | `relayout({fresh:true})`, `fitView()` | Nodes present | Coordinates assigned by the resolved Layout mode; view transform frames the whole scene with 88 px padding | Step 16 admitted nodes after `seedView()` had already laid out, so a second explicit relayout is required before the first paint. |
| 18 | Initial selection | `selectEntity(pizza:Pizza)` | Inspector, tree and status bar rendered | `UI.selection` set; inspector, tree highlight and status bar updated; no reveal requested | Must follow step 10, or the tree highlight pass finds no rows to mark. |
| 19 | Budget read-out | `updateBudgetUI()` | Viewport populated | Budget meter, in-view node count, hidden-neighbour total, in-view relationship count, zoom percentage and graph empty-state visibility all updated `[src: updateBudgetUI()]` | Reads `totalHidden()`, which needs both the true degree and the shown degree of every node; both are set during admission. |
| 20 | Start the frame loop | schedule `frame()` | All of the above | Loop running | Starting earlier would draw against an unsized Surface and an unpopulated palette. |

**ARCH-17** `init()` MUST run exactly once per process. Re-running it MUST NOT be a supported operation; dataset changes go through `regenerate()` ([section 11](#11-dataset-regeneration)).

**ARCH-18** The system colour-scheme check MUST be the last action of wiring, not the first, because it calls `setTheme()`, which re-reads the palette; performing it before the drawing contexts are acquired would write tokens into a palette the renderer has not yet been given `[src: wire()]`.

**ARCH-19** The default dataset size at boot MUST be 12,000 Individuals `[src: init()]`. It MUST be a named constant, not a literal at the call site.

**ARCH-20** Boot MUST NOT block the first paint on dataset generation of more than the default size. Generation of 12,000 Individuals is bounded by [section 13](#13-performance-architecture); larger sizes are reached only through `regenerate()`, which announces progress first.

---

## 4. The frame loop

**ARCH-21** The application MUST run a single continuous frame loop whose body is exactly three ordered actions `[src: frame()]`:

```
1. frame():
2.   stepLayout()     // simulation: MAY mutate node coordinates
3.   draw()           // rendering: MUST NOT mutate model state
4.   schedule frame() for the next display refresh
```

**ARCH-22** The loop MUST be unconditional in the reference behaviour. It MUST NOT be started or stopped in response to idleness; the cost of an idle frame is bounded by ARCH-25 and by [section 13](#13-performance-architecture).

### 4.1 Simulation is separate from rendering

**ARCH-23** `stepLayout()` MUST perform exactly two checks, in this order `[src: stepLayout()]`:

```
1. stepLayout():
2.   if layoutKey() != layoutSig:
3.       relayout({ fresh: false })     // full re-assignment of coordinates
4.   if G.layoutResolved == 'force' and G.layoutOn:
5.       forceTick(sync = false)        // one integration step
```

**ARCH-24** Only the force Layout mode advances per frame. The hierarchy, radial and grid Layout modes MUST be computed once per structural change and MUST NOT be re-run per frame. The freeze control MUST be disabled, with an explanatory title, whenever the resolved Layout mode is not force `[src: relayout()]`.

**ARCH-25** `forceTick()` MUST return immediately without work when invoked asynchronously and the simulation temperature `G.alpha` has fallen below `0.004` `[src: forceTick()]`. This is the mechanism by which a settled Viewport costs nothing to simulate, and it is why the unconditional loop of ARCH-22 is affordable.

**ARCH-26** Simulation MUST NOT read from any Surface, and MUST NOT write to the Store. Its entire write set is: node `x`, `y`, `vx`, `vy`, `charge`; `G.alpha`; and, via `relayout()`, `G.layoutResolved`, `G.radialRings`, `G.ringOrigin`, `G.groupBlocks` and `layoutSig`.

### 4.2 Rendering never mutates model state

**ARCH-27** `draw()` MUST render the main scene and then the minimap, and MUST NOT write to `G.nodes`, `G.edges`, `G.focus`, `G.view`, `G.alpha`, `G.rev`, `UI` or the Store `[src: draw()]`. Rendering is a pure read of model state plus the palette.

**ARCH-28** The renderer MUST receive its inputs as an explicit parameter object — Surface width, Surface height, view transform, palette, hovered IRI, selected IRI — rather than reading globals, so that the same routine serves the on-screen Surface and the export Surface unchanged `[src: draw(), renderExportCanvas()]`.

**ARCH-29** Label placement MUST be a rendering-time concern only. Labels are positioned in screen space by a collision pass on every frame, and the result MUST NOT be written back onto node records `[src: placeLabels()]`.

**ARCH-30** Hit testing MUST read the same node geometry the renderer reads, and MUST NOT maintain a separate spatial structure that could drift from it `[src: hitTest()]`. In the reference build hit testing is a linear scan over `G.nodes` picking the nearest node within `r + 6 / k` world units of the pointer `[src: hitTest()]`.

**ARCH-31** A failure thrown inside `stepLayout()` or `draw()` MUST NOT prevent the next frame from being scheduled. The reference build schedules the next frame as the final statement of `frame()`, so a throw ends the loop; see [section 12](#12-error-handling-and-resilience). **Status:** specified, not implemented in the reference build.

---

## 5. Application state

**ARCH-32** Application state MUST live in exactly two containers, plus the Store: `UI` (selection and Surface-shared user state) and `G` (the Viewport). Module-level mutable variables outside these two are permitted only for the cases enumerated in ARCH-37.

### 5.1 The `UI` object

**ARCH-33** `UI` MUST have exactly the following fields `[src: UI]`.

| Field | Type | Default | Meaning | Invariants | Write owner |
|-------|------|---------|---------|-----------|-------------|
| `selection` | IRI string or `null` | `null` | The single application-wide selection. | MUST be `null`, or an IRI that `resolve()` can answer, or an IRI being cleared within the same operation that deleted it. There is exactly one selection; multi-selection is not modelled. | M8 `selectEntity()` only, except M13 `deleteSelected()`, which sets it to `null` as part of removing the selected Entity `[src: deleteSelected()]` |
| `treeMode` | `'classes'` or `'properties'` | `'classes'` | Which hierarchy the class tree presents. | MUST be one of the two values. A change MUST trigger a full tree re-render. | M14 tab wiring `[src: wire()]` |
| `expanded` | Set of IRI strings | empty, then seeded with `DEFAULT_OPEN` at boot step 8 | Which tree nodes are expanded. | Membership is advisory: an IRI with no children MAY be present and MUST be ignored by the tree renderer. Entries are not removed when an Entity is deleted. | M9 `toggleTreeNode()`, M14 keyboard handlers, M13 `newClassDialog()` (adds the chosen parent) `[src: toggleTreeNode(), newClassDialog()]` |
| `undo` | Array of operation records | `[]` | Last-in-first-out undo stack. | Record shapes are restricted to those in [section 8](#8-undo-model). No depth cap exists in the reference build. | M9 `commitRename()`, M11 `commitCell()`, M13 `newClassDialog()` push; M13 `undo()` pops |

**ARCH-34** `UI` MUST NOT accumulate Surface-private state. Tree filter text, table filter and sort state, and query result state are Surface-private and live in `treeFilter`/`treeVisible`, `TBL` and `QR` respectively `[src: treeFilter, TBL, QR]`.

### 5.2 The `G` object

**ARCH-35** `G` MUST have exactly the following fields `[src: G]`. The semantics of admission, Eviction and the Focus set are normative in [Viewport and Budget](20-graph-viewport-and-budget.md); this table fixes shapes, defaults, invariants and write ownership.

| Field | Type | Default | Meaning | Invariants | Write owner |
|-------|------|---------|---------|-----------|-------------|
| `nodes` | Map from IRI to node record | empty map | The admitted node set. | Size MUST NOT exceed `budget` after any completed operation. Every key MUST equal its value's `iri`. | M4 only |
| `edges` | Map from edge key to edge record | empty map | Edges between admitted nodes. Key is subject IRI concatenated with predicate IRI concatenated with object IRI `[src: edgeKey()]`. | Both endpoints SHOULD be present in `nodes`; layout and rendering MUST tolerate a dangling endpoint by filtering through `viewEdges()` `[src: viewEdges()]`. | M4 only |
| `budget` | integer | `1000` | The **Budget**: maximum admitted nodes. | MUST lie in the closed range `[100, 3000]`, in steps of 100, as offered by the control `[src: budgetRange]`. Lowering it MUST immediately evict down to the new value. | M14 Budget control; M4 reads |
| `evictMode` | `'degree'`, `'lru'` or `'refuse'` | `'degree'` | Eviction policy. | MUST be one of the three values `[src: evictionOrder(), addToView()]`. | M14 Eviction-mode control |
| `focus` | Set of IRI strings | empty set | The **Focus set**: nodes exempt from Eviction. | Every member SHOULD also be a key of `nodes`. Cleared whenever the Viewport is re-seeded without `replace` disabled `[src: seedView()]`. | M4 |
| `selected` | IRI string or `null` | `null` | The node drawn as selected. | SHOULD be `null` or a key of `nodes`; the renderer MUST tolerate a stale value. | M8 `selectEntity()`, M10 `revealInGraph()`, M14 background click and clear-view |
| `hovered` | IRI string or `null` | `null` | The node under the pointer. | Set only from hit testing. | M14 pointer-move handler |
| `alpha` | number in `[0, 1]` | `0` | Force-simulation temperature. | Raised to at least `0.9` on admission, `0.4` on removal, `0.35` on node drag and `0.6` on resuming the simulation; multiplied down by `1 − 0.0228` each tick `[src: addToView(), removeFromView(), forceTick(), wireCanvas()]`. | M4, M5, M14 |
| `layoutOn` | boolean | `true` | Whether the force simulation is running. | Meaningful only when the resolved Layout mode is force. | M14 freeze control |
| `layout` | `'auto'`, `'force'`, `'hierarchy'`, `'radial'` or `'grid'` | `'auto'` | The user's Layout mode choice. | MUST be one of the five values. Participates in the layout signature. | M14 Layout mode control |
| `layoutResolved` | `'force'`, `'hierarchy'`, `'radial'` or `'grid'` | `'force'` | The Layout mode `auto` actually chose for the current view. | Written only by `relayout()`, from `chooseLayout()` `[src: relayout(), chooseLayout()]`. | M5 only |
| `rev` | integer | `0` | Structural revision counter. See [section 7](#7-structural-revision-counter). | Monotonically non-decreasing; never reset. | M4, and M14 for the clear-view command |
| `groupBlocks` | array | `[]` | Cluster rectangles produced by the grid Layout mode, used to draw guides. | Cleared at the start of every `relayout()`. | M5 only |
| `radialRings` | array or `null` | `null` | Ring radii produced by the radial Layout mode. | Cleared to `null` at the start of every `relayout()`. | M5 only |
| `ringOrigin` | point or `null` | `null` | Centre of the radial rings. | Meaningful only when `radialRings` is non-null. | M5 only |
| `view` | record `{ x, y, k }` | `{ x: 0, y: 0, k: 1 }` | View transform: world-to-screen translation and scale. | `k` MUST be clamped to `[0.08, 4]` by interactive zoom and to `[0.05, 1.9]` by `fitView()` `[src: fitView(), wireCanvas()]`. | M5 `fitView()`, M14 zoom and pan |
| `clock` | integer | `0` | Monotonic touch counter for least-recently-used Eviction. | Incremented before each assignment to a node's `touched` field. | M4 only |

**ARCH-36** Any module other than the declared write owner MUST treat a field as read-only. The specification does not mandate runtime enforcement, but an implementation SHOULD expose `G` and `UI` through interfaces that make the ownership boundary checkable at compile time.

### 5.3 Permitted module-level state

**ARCH-37** The following module-level mutable variables are permitted and MUST be private to the module named. No other module-level mutable state is permitted.

| Variable | Module | Purpose | Reset condition |
|----------|--------|---------|-----------------|
| `store` | M2 | The Store itself. | Never replaced; individual fields are replaced by `generateIndividuals()` `[src: generateIndividuals()]` |
| `rngState` | M2 | State of the deterministic pseudo-random generator. | Reset to the fixed seed at the start of every generation `[src: rngState]` |
| `revRestriction` | M3 | Reverse restriction index. | Rebuilt by `buildReverseIndex()` after any TBox structural change |
| `byCustomer` | M3 | Version-stamped customer-to-orders index. | Invalidated by assignment of a null value, or implicitly by a `store.version` mismatch `[src: customerIndex()]` |
| `layoutSig` | M5 | Last layout signature. | Written on every `relayout()` |
| `palette`, main and minimap Surfaces and contexts, `dpr` | M6 | Resolved design tokens and drawing Surfaces. | Palette rewritten on every theme change |
| `treeFilter`, `treeVisible` | M9 | Tree filter text and the retained-IRI set. | Recomputed on every tree render |
| `TBL` | M11 | Table filter, sort, row set and in-progress cell edit. | `TBL.rows` recomputed by `applyFilters()` |
| `QR` | M12 | Last query result columns, rows and distinct IRIs. | Replaced on every query run |
| `toastTimer` | M13 | Auto-dismiss timer handle. | Cleared and re-armed on every toast |
| `dialogCloser` | M13 | Closure that dismisses the open modal dialog. | Set on open, cleared on close |

---

## 6. Cross-surface selection

**ARCH-38** `selectEntity(iri, options)` MUST be the single selection bus for the application `[src: selectEntity()]`. No Surface MUST update another Surface's presentation in response to a selection except by calling it.

### 6.1 Contract

**ARCH-39** `selectEntity(iri, options)` MUST perform exactly the following, in order `[src: selectEntity()]`:

```
1. selectEntity(u, opts):
2.   UI.selection <- u
3.   if G.nodes contains u: G.selected <- u        // otherwise G.selected is left alone
4.   notify observer 1: inspector       -> renderInspector()
5.   notify observer 2: tree highlight  -> renderTreeSelection()
6.   notify observer 3: status bar      -> set selection read-out
7.   notify observer 4: table highlight -> re-render the visible row window
8.   if opts.reveal is true: revealInGraph(u)
```

**ARCH-40** Step 3 MUST NOT clear `G.selected` when the selected IRI is absent from the Viewport. Selecting an Entity that is not in view leaves the previously selected node drawn as selected until the Viewport itself changes. This is deliberate: selection in the tree or table must not blank the graph `[src: selectEntity()]`.

**ARCH-41** The status-bar read-out MUST be `<kind label> · <display label>` when the IRI resolves, and the literal text `No selection` when it does not `[src: selectEntity()]`. The kind label comes from `KIND_META` ([Data model and Store](11-data-model-and-store.md#3-entity-kinds)); the display label comes from `labelOf()`.

**ARCH-42** Step 7 is required by this specification. The reference build does not perform it: the table marks a row as selected only when that row is re-rendered by a scroll, a filter change or a sort change `[src: renderTableRows(), selectEntity()]`, so a selection made in the tree does not immediately highlight the corresponding table row. **Status:** specified, not implemented in the reference build.

**ARCH-43** `selectEntity()` MUST accept an IRI that has no Entity record, including a generated `demo:` Individual and a generated customer, and MUST render it correctly by way of `resolve()` `[src: resolve(), selectEntity()]`.

**ARCH-44** `selectEntity()` MUST be idempotent: calling it twice with the same IRI and the same options MUST leave the application in the same state as calling it once, except for the Viewport camera movement caused by `reveal`.

**ARCH-45** `selectEntity()` MUST NOT mutate the Store, MUST NOT change the Budget, and MUST NOT admit nodes to the Viewport unless `reveal` is requested.

### 6.2 Reveal in graph

**ARCH-46** When `options.reveal` is true, `revealInGraph(iri)` MUST run after all observers have been notified, and MUST perform `[src: revealInGraph()]`:

```
1. revealInGraph(u):
2.   if u is not in G.nodes:
3.       report <- addToView([u], { dist: 0 })
4.       add u to G.focus
5.       reportView(report, labelOf(u))            // toast if anything was evicted or refused
6.       expandNode(u, min(80, G.budget))          // page in up to 80 neighbours
7.       fitView()
8.   G.selected <- u
9.   if node u exists:
10.      G.view.k <- max(G.view.k, 0.8)            // never reveal at an unreadable zoom
11.      G.view.x <- surfaceWidth / 2  - node.x * G.view.k
12.      G.view.y <- surfaceHeight / 2 - node.y * G.view.k
13.  updateBudgetUI()
```

**ARCH-47** Reveal MUST NOT re-seed or clear the Viewport. It adds at most one node plus up to eighty of its neighbours, subject to the Budget, and centres the camera.

**ARCH-48** An explicit "show in graph" affordance in the inspector MAY call `revealInGraph()` directly without changing the selection `[src: wire()]`. This is the one permitted bypass of the bus, and it is permitted only because it does not alter `UI.selection`.

### 6.3 Selection sequences

**ARCH-49** Each of the following interactions MUST produce the sequence described. Implementations MUST NOT add Surface-to-Surface calls to any of them.

#### 6.3.1 Selecting in the class tree

1. Pointer press lands on a tree row `[src: wire()]`.
2. If the press landed on the row's expand control, the handler calls `toggleTreeNode()` and returns. No selection occurs.
3. Otherwise the handler calls `selectEntity(rowIri)` with no options.
4. Inspector re-renders for the new selection; tree highlight moves; status bar read-out updates.
5. The Viewport is not touched. `G.selected` changes only if that IRI already happens to be in view.
6. A double press on the same row calls `selectEntity(rowIri, { reveal: true })`, which additionally runs the reveal sequence of ARCH-46.
7. Arrow-down and arrow-up move the selection to the adjacent visible row through `selectEntity()` and scroll it into view; arrow-right and arrow-left add to or remove from `UI.expanded` and re-render the tree; Enter performs a reveal `[src: wire()]`.

#### 6.3.2 Selecting a graph node

1. Pointer press hit-tests the Viewport. A hit begins a node drag; a miss begins a pan `[src: wireCanvas()]`.
2. Pointer release with no intervening movement and a node under the press calls `selectEntity(node.iri)` with no options.
3. Pointer release with no intervening movement and no node under the press sets `G.selected` to null. It MUST NOT clear `UI.selection`, so the inspector keeps showing the last selected Entity `[src: wireCanvas()]`.
4. In both cases the Budget read-out is refreshed on release.
5. A context-menu press first calls `selectEntity(node.iri)`, then opens the node menu positioned at the pointer `[src: wireCanvas()]`.

#### 6.3.3 Selecting a table row

1. Pointer press lands on a table row `[src: wire()]`.
2. The handler calls `selectEntity(rowIri)` unconditionally.
3. If the press also landed on an editable cell, the handler then begins a cell edit on that cell. Selection happens first, so the inspector already shows the record being edited.
4. A double press on the row calls `selectEntity(rowIri, { reveal: true })`.

#### 6.3.4 Clicking an IRI link in the inspector

1. Pointer press on an element carrying a link IRI `[src: wire()]`.
2. Default activation is suppressed and the handler calls `selectEntity(linkIri)` with no options.
3. The inspector therefore replaces its own content with the target Entity. It MUST NOT navigate the tree, scroll the table or move the camera.
4. Separately, the inspector's "page instances into the graph" action does not change the selection: it adds the class node if absent, adds the class's Individual bucket at distance 1 seeded from the class node, refits the view, reports the outcome as a toast and refreshes the Budget read-out `[src: wire()]`.

#### 6.3.5 Choosing a global search hit

1. Typing two or more characters in the global search field runs `searchEntities(query, 10)` and opens a results menu anchored beneath the field `[src: wireGlobalSearch()]`.
2. Choosing a hit hides the menu and calls `selectEntity(hitIri, { reveal: true })`.
3. Enter with a non-empty result list chooses the first hit by the same path.
4. Escape hides the menu and returns focus to the document.

#### 6.3.6 Clicking an IRI in query results

1. Query results render IRI cells as activatable links carrying the full IRI; literal cells are inert `[src: renderQueryResults()]`.
2. Pointer press on a link suppresses default activation and calls `selectEntity(linkIri, { reveal: true })` `[src: wire()]`.
3. Because reveal is requested, the IRI is admitted to the Viewport if absent, up to eighty of its neighbours are paged in, and the camera centres on it.

**ARCH-50** Exactly three of the six entry points request reveal by default: tree double-activation, global search and query-result links. Table double-activation also reveals. Single activation in the tree, the table, the graph and the inspector MUST NOT move the camera.

---

## 7. Structural revision counter

**ARCH-51** `G.rev` MUST be incremented on every structural change to the Viewport `[src: G]`. A structural change is exactly one of:

| Operation | Reference site | Increment |
|-----------|----------------|-----------|
| Nodes admitted, with or without Eviction | `addToView()` | `G.rev` incremented once per call, after admission and linking `[src: addToView()]` |
| A node removed | `removeFromView()` | `G.rev` incremented once `[src: removeFromView()]` |
| The Viewport cleared by the clear command | clear-view handler | `G.rev` incremented once `[src: wire()]` |

**ARCH-52** `G.rev` MUST NOT be incremented by camera movement, hover, selection, pin or unpin, label changes, theme changes or Budget changes that do not evict.

**ARCH-53** The layout signature MUST be the ordered tuple of node count, edge count, revision counter and user Layout mode choice, rendered as a single comparable value `[src: layoutKey()]`:

```
layoutKey() = nodeCount + ":" + edgeCount + ":" + G.rev + ":" + G.layout
```

**ARCH-54** `relayout()` MUST record the current signature into `layoutSig` as part of its work, before any layout engine runs `[src: relayout()]`.

**ARCH-55** `stepLayout()` MUST compare the live signature with `layoutSig` on every frame and MUST call `relayout({fresh:false})` when they differ `[src: stepLayout()]`. This comparison is the sole mechanism by which layout stays in sync with the Viewport. There MUST NOT be an explicit invalidation call from M4 into M5.

**ARCH-56** The signature MUST include the revision counter and not only the node and edge counts, because an operation can leave both counts unchanged while changing the graph — for example, admitting three nodes that displace three evicted nodes. Without the counter, such an operation would go unnoticed and the view would render new nodes at stale coordinates.

**ARCH-57** The signature MUST include the user Layout mode choice, so that switching the Layout mode is itself a relayout trigger even when the graph is unchanged `[src: layoutKey()]`.

**ARCH-58** The signature MUST NOT include `G.layoutResolved`, because that value is an output of `relayout()`; including it would make the comparison self-triggering.

**ARCH-59** A relayout triggered by signature mismatch MUST run with `fresh` false, meaning existing coordinates are retained as the starting point and the force simulation is merely reheated. A relayout requested explicitly by the user, by `seedView()` or by boot MUST run with `fresh` true, meaning coordinates are re-seeded deterministically and the force simulation is run to convergence synchronously before the next frame `[src: relayout(), layoutForce(), seedView()]`.

---

## 8. Undo model

**ARCH-60** Undo MUST be a single last-in-first-out stack of operation records held at `UI.undo` `[src: UI]`. There is no redo stack.

**ARCH-61** Exactly three operation record shapes MUST be pushed. No other operation in the reference build is undoable.

| Kind | Pushed by | Record fields | Meaning |
|------|-----------|---------------|---------|
| `rename` | `commitRename()` `[src: commitRename()]` | `kind`, `iri` (the renamed Entity), `from` (the display name before the edit) | An Entity's display name changed. The IRI did not change. |
| `cell` | `commitCell()` `[src: commitCell()]` | `kind`, `rec` (reference to the Individual record), `col` (one of `branch`, `price`, `rating`), `from` (the previous value) | One editable field of one generated Individual changed. |
| `newClass` | the new-class dialog `[src: newClassDialog()]` | `kind`, `iri` (the created class), `parent` (the chosen superclass IRI) | A class was created as a subclass of the chosen parent. |

**ARCH-62** A record MUST be pushed before the mutation is applied, and MUST capture the previous value by value, not by reference, for scalars `[src: commitCell()]`.

**ARCH-63** A rename MUST NOT push a record when the submitted name equals the current name `[src: commitRename()]`.

**ARCH-64** `undo()` MUST pop one record and apply exactly the inverse specified below `[src: undo()]`.

| Kind | Inverse operation | Surfaces refreshed |
|------|-------------------|--------------------|
| `rename` | Restore the Entity's display name to `from`; restore the label of the corresponding Viewport node if present. | Tree, inspector |
| `cell` | Assign `from` back to the named column of the referenced record. | Table (through a filter re-application), inspector |
| `newClass` | Remove the created IRI from its parent's children list; delete the Entity from the Entity map; remove the node from the Viewport if present. | Tree, inspector, Store read-out, Budget read-out |

**ARCH-65** `undo()` with an empty stack MUST report `Nothing to undo.` as an informational toast and MUST make no other change `[src: undo()]`.

**ARCH-66** Every successful undo MUST report completion as an informational toast `[src: undo()]`.

### 8.1 Known limits, stated honestly

**ARCH-67** The following are real limits of the reference build's undo model. An implementation MAY fix them, but MUST NOT describe the reference behaviour as if they were already fixed.

| # | Limit | Consequence | Reference evidence |
|---|-------|-------------|--------------------|
| 1 | Class deletion is not undoable. No record is pushed. | Deleting a class with subclasses reparents them irreversibly. | `deleteSelected()` pushes nothing `[src: deleteSelected()]` |
| 2 | Individual creation is not undoable. No record is pushed. | A created Individual can only be removed by regenerating the dataset. | the new-individual dialog pushes nothing `[src: newIndividualDialog()]` |
| 3 | Undoing a class creation does not remove the `rdfs:subClassOf` triple that creation appended to the TBox array. | The triple count read-out remains one higher than the true axiom count, and the orphan triple remains visible to the SPARQL console. | creation calls `T()`; `undo()` does not remove it `[src: newClassDialog(), undo()]` |
| 4 | Undoing a class creation does not rebuild the reverse restriction index or the flattened restriction array, both of which creation refreshed. | Stale index entries can survive an undo. | `newClassDialog()` calls `buildReverseIndex()`; `undo()` does not `[src: newClassDialog(), undo()]` |
| 5 | Undoing a class creation does not remove the parent IRI that creation added to `UI.expanded`. | A tree node may remain expanded that was collapsed before the operation. | `[src: newClassDialog(), undo()]` |
| 6 | No undo path decrements `store.version`. | Version-stamped caches are invalidated more often than strictly necessary, never less; this is safe but not tidy. | `[src: undo()]` |
| 7 | The stack has no depth cap. | Memory grows without bound in a long session of edits. | `UI.undo` is a plain array `[src: UI]` |
| 8 | Undo is not scoped per Surface and is not coalesced. | Three consecutive edits to the same cell require three undos. | `[src: commitCell()]` |
| 9 | A `cell` record holds a live reference to the Individual record. If the dataset is regenerated, the reference dangles. | Undoing across a regeneration writes to an orphaned record and appears to do nothing. | `regenerate()` replaces `store.inds` and does not clear `UI.undo` `[src: regenerate()]` |

**ARCH-68** An implementation SHOULD cap the undo stack at a documented depth and SHOULD clear it on dataset regeneration. **Status:** specified, not implemented in the reference build.

---

## 9. Chrome infrastructure

### 9.1 Toast and status messaging

**ARCH-69** The application MUST have exactly one transient message channel, presented as a single toast anchored inside the graph panel `[src: showToast()]`.

**ARCH-70** A toast MUST carry exactly one of two severities.

| Severity | Accent | Raised by | Meaning |
|----------|--------|-----------|---------|
| `info` | accent colour token | explicit `info` calls | The operation succeeded; here is what it did. |
| `warn` | warn colour token | the default when no severity is passed, and every call through `setStatusMessage()` | The operation was constrained, refused or invalid. |

**ARCH-71** `setStatusMessage(text)` MUST be exactly `showToast(text, 'warn')` `[src: setStatusMessage()]`. Validation failures in the class tree rename and in table cell editing MUST use it.

**ARCH-72** A toast MUST auto-dismiss after 6,000 ms `[src: showToast()]`. Showing a new toast MUST cancel the pending dismissal of the previous one and re-arm the timer, so the visible lifetime is measured from the most recent message.

**ARCH-73** The channel MUST hold exactly one message. A new message replaces the current one; messages MUST NOT queue or stack.

**ARCH-74** The toast MUST be an assertive-free polite live region: it MUST be announced to assistive technology when its text changes, without interrupting the user's current utterance `[src: trace]`. The reference build marks it `role="status"` with `aria-live="polite"`.

**ARCH-75** The toast MUST carry an explicit dismiss control that hides it immediately without waiting for the timer `[src: wire()]`.

**ARCH-76** The status bar MUST NOT be a live region. It is a continuously updated read-out and announcing it would flood assistive technology `[src: statusbar]`. The reference build marks it `role="status"` with `aria-live="off"`.

**ARCH-77** Viewport admission outcomes MUST be reported through a single reporting helper with exactly three cases `[src: reportView()]`:

```
1. reportView(report, label):
2.   if report is absent: return
3.   if report.refused > 0:
4.       warn: "Budget reached at <budget> nodes. <refused> neighbours of <label> were
5.              left out — raise the budget or unpin something."
6.   else if report.evicted > 0:
7.       warn: "Budget held at <budget>. Paged out <evicted> node(s) furthest from the
8.              focus (<up to three evicted labels>[, …]) to make room for <label>."
9.   else: say nothing
```

**ARCH-78** A successful operation that changed nothing MUST still be reported when the user explicitly asked for it. Expanding a node with no further neighbours outside the view MUST produce the informational message `<label> has no further neighbours outside the view.` `[src: wireCanvas()]`.

### 9.2 Flyout menus

**ARCH-79** A flyout menu MUST be positioned by explicit coordinates and MUST be clamped to the visible window `[src: openMenu()]`:

```
1. openMenu(menu, x, y):
2.   make menu visible                              // so it can be measured
3.   measure menu width w and height h
4.   left <- min(x, windowWidth  - w - 8)
5.   top  <- min(y, windowHeight - h - 8)
6.   place menu at (left, top)
```

**ARCH-80** The clamp MUST use an 8 px margin from the right and bottom window edges `[src: openMenu()]`. The reference build does not clamp against the left or top edges; an implementation SHOULD clamp all four. **Status:** specified, not implemented in the reference build.

**ARCH-81** The menu MUST be made visible before measurement, because a hidden element has no measurable size `[src: openMenu()]`.

**ARCH-82** There MUST be exactly one close-all operation that hides every flyout and resets the expanded state of every control that opens one: the node context menu, the dataset menu, the export menu and the global search results menu `[src: closeMenus()]`.

**ARCH-83** The following MUST close all flyouts:

1. A pointer press anywhere outside a menu and outside the three controls that own menus `[src: wire()]`.
2. The Escape key, which closes menus and then dismisses any open dialog `[src: wire()]`.
3. A pointer press on the graph Surface `[src: wireCanvas()]`.
4. Activating any item inside a menu, before the item's action runs `[src: wire(), wireCanvas()]`.

**ARCH-84** A control that owns a menu MUST toggle: if its menu was open, activating the control MUST leave everything closed rather than immediately reopening `[src: wire()]`.

**ARCH-85** A menu anchored to a control MUST be positioned at the control's left edge and 4 px below its bottom edge, then clamped by ARCH-79 `[src: wire()]`. A menu raised by a context gesture MUST be positioned at the pointer, then clamped.

### 9.3 Modal dialogs

**ARCH-86** A modal dialog MUST have exactly one instance at a time, presented over a dimming scrim `[src: openDialog()]`.

**ARCH-87** The dialog lifecycle MUST be `[src: openDialog(), closeDialog()]`:

```
1. openDialog(content, onMount):
2.   replace the dialog body with content
3.   show the scrim
4.   move keyboard focus to the first focusable control in the dialog
5.   run onMount(dialogRoot) so the caller can bind its own handlers
6.   install the closer

7. closeDialog():
8.   if a closer is installed:
9.       hide the scrim
10.      clear the closer
```

**ARCH-88** Initial focus MUST go to the first focusable control in document order among text inputs, selects and buttons `[src: openDialog()]`.

**ARCH-89** A dialog MUST be dismissible by all three of:

1. Activating a control marked as the dialog's cancel action `[src: wire()]`.
2. A pointer press on the scrim itself, and only on the scrim — a press that lands inside the dialog body MUST NOT dismiss `[src: wire()]`.
3. The Escape key `[src: wire()]`.

**ARCH-90** A dialog's primary action MUST close the dialog only after its validation has passed. Validation failure MUST keep the dialog open, mark the offending field invalid, place an error message in an alert region adjacent to that field, and return focus to it `[src: newClassDialog()]`.

**ARCH-91** A dialog MUST be announced as a modal dialog with an accessible name taken from its own heading `[src: dialog]`. The reference build uses `role="dialog"`, `aria-modal="true"` and a reference to the heading element.

**ARCH-92** Focus MUST be trapped within the dialog while it is open, and MUST be restored to the control that opened it on dismissal. The reference build does neither. **Status:** specified, not implemented in the reference build.

**ARCH-93** The three dialogs are: new class, new individual and delete-class confirmation. Their content, validation and effects are specified in [Class tree and inspector](30-class-tree-and-inspector.md) and [Individuals table](31-individuals-table.md); their lifecycle is governed by this section.

### 9.4 Splitters

**ARCH-94** A splitter MUST be a pointer-driven drag handle that writes a single size Design token and nothing else `[src: wireSplitter()]`.

**ARCH-95** The drag lifecycle MUST be `[src: wireSplitter()]`:

```
1. on pointer down:
2.   suppress default handling
3.   mark the splitter as dragging
4.   capture the pointer to the splitter, so the drag survives leaving the handle
5.   bind move and up handlers to the splitter
6. on pointer move: apply(event)                   // caller-supplied size rule
7. on pointer up:
8.   unmark dragging, release the pointer capture, unbind both handlers
9.   resizeCanvas(); fitView()
```

**ARCH-96** The graph Surface MUST be resized and the scene refitted on drag release, not on every move `[src: wireSplitter()]`. Resizing on every move would re-allocate the backing store at pointer rate.

**ARCH-97** The three splitters MUST enforce exactly these bounds `[src: wire()]`:

| Splitter | Size token written | Measurement | Minimum | Maximum |
|----------|--------------------|-------------|---------|---------|
| Left, between the class tree and the graph | left panel width | pointer x from the window's left edge | 180 px | 520 px |
| Right, between the graph and the inspector | right panel width | window width minus pointer x | 240 px | 560 px |
| Dock, between the graph and the bottom dock | dock height | window height minus pointer y minus 26 px, the status-bar allowance | 120 px | window height minus 260 px |

**ARCH-98** A splitter MUST expose itself as a separator with an orientation and an accessible name, and MUST be reachable by keyboard `[src: splitLeft, splitRight, splitDock]`. The reference build marks each splitter `role="separator"` with an orientation and a label, and gives it a tab stop, but binds no keyboard resize handler. Keyboard resizing MUST be implemented. **Status:** specified, not implemented in the reference build.

### 9.5 Panel and dock collapse

**ARCH-99** The left panel, the right panel and the bottom dock MUST each be independently collapsible to zero extent, and MUST be restorable to their previous extent `[src: wire()]`.

**ARCH-100** Collapse MUST be driven by a state flag on the layout container, not by writing the size token to zero, so that the user's chosen size survives a collapse and restore cycle `[src: wire()]`.

**ARCH-101** Every collapse or restore MUST, on the next display refresh and not synchronously, re-size the graph Surface, refit the scene and refresh the Budget read-out `[src: wire()]`. Deferring by one frame is required because the layout has not yet reflowed at the moment the flag is toggled.

**ARCH-102** The command that toggles the bottom dock MUST be reachable from two places — the command bar and a collapse control on the dock itself — and both MUST invoke the same operation `[src: wire()]`.

**ARCH-103** Every collapse control MUST expose its pressed state, and the pressed state MUST read as pressed when the panel is *shown*, not when it is collapsed `[src: wire()]`.

### 9.6 Legend, Budget and Store read-outs

**ARCH-104** The legend MUST be derived from `KIND_META`, never hand-authored, and MUST additionally carry a **Pin** marker and an explanation of the **Hidden neighbour** badge `[src: renderLegend()]`.

**ARCH-105** `updateBudgetUI()` MUST refresh all seven of the following in one pass `[src: updateBudgetUI()]`: the Budget meter fill percentage; the meter's near-full state at 75–97 % and full state at 98 % or above; the in-view node count; the total hidden-neighbour count; the status-bar in-view node count; the status-bar in-view relationship count; the zoom percentage. It MUST also show or hide the graph empty state according to whether any node is in view.

**ARCH-106** `updateStoreUI()` MUST refresh the triple count, the class count and the Individual count `[src: updateStoreUI()]`. It MUST be called after every Store mutation and after every regeneration, and MUST NOT be called per frame — see [section 13](#13-performance-architecture).

---

## 10. Theme system

**ARCH-107** All colour, size, radius and duration values MUST be expressed as **Design tokens**. No component rule and no rendering routine MUST hard-code a visual value `[src: :root]`.

**ARCH-108** There MUST be exactly two themes: light and dark. Light MUST be the default at start-up `[src: html data-theme="light"]`.

**ARCH-109** The dark theme MUST be independently authored as a complete replacement token set, not derived from the light set by inversion or lightness arithmetic. The reference build restates every colour token under the dark theme selector, including all five Entity-kind colours, which are hue-matched but not mechanically derived `[src: [data-theme="dark"]]`.

| Entity kind | Light token value | Dark token value |
|-------------|-------------------|------------------|
| Class | `#0F6CBD` | `#6CB8F6` |
| Defined class | `#B36A00` | `#E3A13C` |
| Individual | `#0E7C66` | `#5FCFB4` |
| Object property | `#7A46C0` | `#C09BF0` |
| Data property | `#A8446F` | `#F095C0` |

**ARCH-110** Theme selection MUST be a single attribute on the application root, and switching MUST be a single write of that attribute `[src: setTheme()]`.

**ARCH-111** `setTheme(theme)` MUST perform exactly `[src: setTheme()]`:

```
1. setTheme(t):
2.   set the root theme attribute to t
3.   refreshPalette()                         // renderer re-reads every token
4.   update the theme control's accessible label to name the theme it will switch TO
5.   update the theme control's icon to the one representing the theme it will switch TO
```

**ARCH-112** The renderer MUST re-read its palette after any theme change, and MUST NOT cache resolved colours anywhere other than `palette` `[src: refreshPalette(), setTheme()]`. This is the sole reason `setTheme()` is not a pure attribute write: the Viewport is drawn to an immediate-mode Surface that does not inherit styling.

**ARCH-113** At boot, the system colour-scheme preference MUST be queried once, and the dark theme MUST be applied if the system prefers dark `[src: wire()]`. The reference build performs this as the final statement of `wire()`.

**ARCH-114** The application SHOULD subscribe to subsequent changes of the system preference and follow them until the user has made an explicit choice. The reference build queries the preference once and never listens for changes. **Status:** specified, not implemented in the reference build.

**ARCH-115** The theme control MUST toggle between the two themes and MUST NOT expose a third "system" state in the reference behaviour `[src: wire()]`.

**ARCH-116** Reduced-motion preference MUST be honoured by collapsing animation and transition durations to a negligible value `[src: @media (prefers-reduced-motion: reduce)]`. It MUST NOT stop the force simulation, which is content rather than decoration.

---

## 11. Dataset regeneration

**ARCH-117** `regenerate(n)` MUST rebuild the generated `demo:` ABox at size `n` without touching the `pizza:` TBox `[src: regenerate()]`.

**ARCH-118** `regenerate(n)` MUST announce itself before doing any work, then defer the work to the next display refresh so the announcement is actually painted `[src: regenerate()]`:

```
1.  regenerate(n):
2.    toast info: "Generating <n> individuals…"
3.    on the next display refresh:
4.      t0 <- now
5.      generateIndividuals(n)                  // replaces inds, indIndex, byType, customers
6.      invalidate the customer index
7.      clear G.nodes, G.edges, G.focus
8.      populateFilterOptions()
9.      resetFilters()
10.     renderTree()
11.     updateStoreUI()
12.     seedView([pizza:Pizza])
13.     updateBudgetUI()
14.     renderInspector()
15.     toast info: "Store rebuilt: <tripleCount> triples, <individualCount> individuals,
16.                  in <now - t0> ms. The viewport still holds at most <budget> nodes."
```

### 11.1 What is torn down

**ARCH-119** Regeneration MUST discard, completely: the Individual record array, the Individual IRI index, the by-type index, the customer array `[src: generateIndividuals()]`, the customer index `[src: regenerate()]`, and the entire Viewport — nodes, edges and Focus set `[src: regenerate()]`.

**ARCH-120** The Viewport MUST be cleared rather than left holding stale Entity references. Every generated `demo:` IRI in the old dataset is invalid after regeneration — the padding width of the identifier is itself a function of the dataset size `[src: generateIndividuals()]` — so retained nodes would reference records that no longer exist. Clearing is not an optimisation; it is a correctness requirement.

**ARCH-121** The table filters MUST be reset, not merely re-applied. A type filter naming a class with no instances in the new dataset, or a text filter matching only old identifiers, would present an empty table with no explanation `[src: regenerate(), resetFilters()]`.

### 11.2 What is rebuilt

**ARCH-122** Regeneration MUST rebuild, in this order: the Individual records and their three indexes; the table's type filter option list with per-type counts; the table's row set under cleared filters; the class tree, whose rows carry per-class instance counts; the Store read-out; the Viewport, re-seeded from `pizza:Pizza`; the Budget read-out; the inspector `[src: regenerate()]`.

**ARCH-123** Regeneration MUST NOT rebuild the reverse restriction index or the flattened restriction array. Both are functions of the TBox alone, which regeneration does not touch `[src: regenerate(), buildReverseIndex(), buildRBox()]`.

**ARCH-124** Regeneration MUST increment the Store version counter exactly once, inside generation, so that every version-stamped cache invalidates `[src: generateIndividuals()]`.

### 11.3 What is reported

**ARCH-125** Two messages MUST be emitted: an informational one before the work, naming the requested Individual count; and an informational one after, naming the resulting triple count, the resulting Individual count, the elapsed milliseconds and the fact that the Viewport still holds at most the Budget `[src: regenerate()]`. The second message's closing clause is the product's central claim made visible, and MUST NOT be dropped.

### 11.4 Known gaps

**ARCH-126** `UI.selection` MUST be cleared by regeneration when it names a generated `demo:` IRI, because that IRI's record has been discarded. The reference build leaves `UI.selection` untouched and re-renders the inspector against it; if the identifier happens to exist in the new dataset it silently shows different data, and if it does not, the inspector falls back to the empty state `[src: regenerate()]`. **Status:** specified, not implemented in the reference build.

**ARCH-127** `UI.undo` MUST be cleared by regeneration, for the reason given in ARCH-67 limit 9. The reference build does not clear it `[src: regenerate()]`. **Status:** specified, not implemented in the reference build.

**ARCH-128** The four dataset sizes offered MUST be 1,000, 12,000, 50,000 and 100,000 Individuals, each labelled with its approximate resulting triple count `[src: scaleMenu]`. See [section 13](#13-performance-architecture) and [Data model and Store](11-data-model-and-store.md#13-scale-characteristics).

---

## 12. Error handling and resilience

**ARCH-129** Failures MUST be classified into exactly three bands, and each band MUST be handled as specified.

| Band | Definition | Handling |
|------|------------|----------|
| A — User-correctable | The user supplied a value the application cannot accept. | MUST be reported to the user, inline next to the offending control where one exists, and additionally as a `warn` toast. MUST NOT be logged as an error. MUST leave all state unchanged. |
| B — Operation-constrained | The operation succeeded but was clipped by a limit: Budget refusal, Eviction, neighbour cap, solution cap, export dimension cap. | MUST be reported to the user with the exact figures involved. MUST NOT be silent. |
| C — Internal | A defect: an unexpected exception in layout, rendering, parsing or a Surface render. | MUST be logged with the full diagnostic. MUST be reported to the user only as a short, non-technical `warn` toast. MUST NOT tear down the frame loop. |

**ARCH-130** Band A failures MUST be expressed as a returned message, not a thrown exception, wherever the caller can act on them. Name validation returns the first violated rule as text `[src: validateName()]`; cell commit returns a per-column message and applies no change `[src: commitCell()]`.

**ARCH-131** Band A messages MUST name the rule, the offending value and the acceptable form. The reference build's messages are the standard, for example: `Rating must be between 1 and 5. You entered 9.` and `An entity named Margherita already exists at pizza:Margherita.` `[src: commitCell(), validateName()]`.

**ARCH-132** A field that fails validation MUST be marked invalid, MUST place its message in an alert region adjacent to it, and MUST clear both when the value becomes valid `[src: newClassDialog(), beginCellEdit()]`.

**ARCH-133** An invalid cell edit MUST restore the cell's previous rendering, flash an error treatment for 1,800 ms, and leave the record untouched `[src: beginCellEdit()]`.

**ARCH-134** Cell edits MUST be validated on commit, not on every keystroke `[src: beginCellEdit()]`. Commit is triggered by focus loss or by Enter; Escape abandons the edit and restores the previous rendering.

**ARCH-135** Band B failures MUST be reported through `reportView()` for Viewport admission ([ARCH-77](#91-toast-and-status-messaging)), and through an explicit toast naming the cap for every other limit. The SPARQL console MUST state when intermediate results were capped, and at what figure `[src: runQuery(), SOLUTION_CAP]`.

**ARCH-136** Query parsing and evaluation MUST be wrapped so that no malformed query can propagate an exception. The failure MUST be presented in the console's own status region with a bold message and a hint, and MUST clear the previous result set `[src: runQuery()]`. This is the only guarded region in the reference build.

**ARCH-137** Every Surface render MUST be independently guarded, so that a defect in one Surface cannot prevent the others from rendering or prevent the frame loop from continuing. **Status:** specified, not implemented in the reference build.

**ARCH-138** The frame loop MUST schedule its next iteration unconditionally, in a manner that survives a throw from simulation or rendering:

```
1. frame():
2.   try: stepLayout()
3.   catch e: log C-band(e); note that layout is degraded
4.   try: draw()
5.   catch e: log C-band(e); note that rendering is degraded
6.   always: schedule frame()
```

**Status:** specified, not implemented in the reference build; the reference build schedules the next frame as the last statement of an unguarded body `[src: frame()]`.

**ARCH-139** Repeated C-band failures of the same kind MUST be rate-limited to one user-visible toast per 30 seconds, so a per-frame defect does not fill the screen with messages. **Status:** specified, not implemented in the reference build.

**ARCH-140** Unimplemented commands MUST say so plainly rather than failing silently or pretending to succeed. The reference build's save command reports `Serialising to OWL is not wired in this prototype — no file is written.` `[src: wire()]`.

**ARCH-141** No failure MUST leave the Store partially mutated. Every Store mutation in [Data model and Store](11-data-model-and-store.md#12-store-mutation-operations) MUST complete its index maintenance and counter bumps, or make no change at all.

---

## 13. Performance architecture

**ARCH-142** Work MUST be classified into exactly four cadences, and every operation MUST be assigned to one. An operation MUST NOT be performed at a faster cadence than its classification.

| Cadence | Trigger | Permitted work |
|---------|---------|----------------|
| Per frame | Every display refresh | One simulation step; one scene draw; one minimap draw |
| Per interaction | A pointer, key or control event | Hit test; camera change; a windowed re-render of one Surface; read-out refresh |
| Per structural change | `G.rev` advanced, or an explicit relayout request | Edge indexing; full layout; view fit |
| Per dataset change | `generateIndividuals()` or a Store mutation | Index rebuilds; filter option rebuild; full Surface re-renders; counter refresh |

### 13.1 Per-frame work and its budget

**ARCH-143** The per-frame budget MUST be 16.7 ms at 60 Hz. Within it:

| Work | Complexity | Budget | Reference evidence |
|------|-----------|--------|--------------------|
| Layout signature comparison | O(1) — four values concatenated | under 0.01 ms | `[src: layoutKey(), stepLayout()]` |
| Force integration step, when the resolved mode is force and the simulation is running and `alpha ≥ 0.004` | O(n log n) repulsion via Barnes-Hut plus O(E) link forces plus collision resolution | 6 ms at the default Budget of 1,000 nodes | `[src: forceTick()]` |
| Force integration step when `alpha < 0.004` | O(n) to gather nodes, then immediate return | under 0.05 ms | `[src: forceTick()]` |
| Scene draw | O(n + E) plus a greedy label collision pass over candidate labels | 8 ms at the default Budget | `[src: renderScene(), placeLabels()]` |
| Minimap draw | O(n) | 1 ms | `[src: drawMinimap()]` |

**ARCH-144** Per-frame work MUST NOT touch the Store, MUST NOT call `neighboursOf()`, MUST NOT allocate per-node objects and MUST NOT re-render any Surface other than the graph.

**ARCH-145** The Budget's upper bound of 3,000 nodes is set by the per-frame budget, not by memory. The Budget exists to keep the per-frame cost bounded regardless of dataset size, which is why the reference build can hold 100,000 Individuals and still draw at frame rate `[src: G, budgetRange]`.

### 13.2 Per-interaction work and its budget

**ARCH-146** A single interaction MUST complete within 50 ms for the response to feel immediate.

| Work | Complexity | Budget | Reference evidence |
|------|-----------|--------|--------------------|
| Hit test | O(n) linear scan over admitted nodes | 1 ms at 3,000 nodes | `[src: hitTest()]` |
| Budget read-out refresh, including the hidden-neighbour total | O(n) | 1 ms | `[src: updateBudgetUI(), totalHidden()]` |
| Table row window render | O(visible rows) — the window is the viewport height divided by the 32 px row height, plus 12 rows of overscan, starting 6 rows early | 3 ms irrespective of dataset size | `[src: renderTableRows(), ROW_H]` |
| Query result window render | O(visible rows), same windowing rule | 3 ms | `[src: renderQueryResults()]` |
| Inspector render | O(axioms of one Entity) | 5 ms | `[src: renderInspector()]` |
| Tree render | O(visible rows), bounded by the expanded set | 10 ms | `[src: renderTree()]` |
| Node expansion | O(degree of the node) bounded by `NEIGHBOUR_CAP`, plus Eviction sort | 30 ms | `[src: expandNode(), NEIGHBOUR_CAP]` |
| Camera zoom or pan | O(1) | under 0.1 ms | `[src: wireCanvas()]` |

**ARCH-147** Text-entry filters MUST be debounced before they trigger a re-filter: 140 ms for the tree filter and 160 ms for the table text filter `[src: wire()]`. Undebounced filtering over 100,000 records at keystroke rate is the single most likely cause of typing lag.

**ARCH-148** Table filtering MUST be a full linear pass over the Individual record array with an early-out per predicate, then an optional sort `[src: applyFilters()]`. At 100,000 records this MUST complete within 50 ms. The sort MUST be skipped entirely when the table is in its default order — sorted ascending by Individual identifier, which is generation order `[src: applyFilters()]`.

**ARCH-149** A long-running operation that cannot meet the 50 ms budget MUST announce itself, then yield one display refresh before starting, so the announcement paints. Both dataset regeneration and query evaluation do this `[src: regenerate(), runQuery()]`.

### 13.3 Per-structural-change work and its budget

**ARCH-150** A structural change MUST complete its relayout within 250 ms at the maximum Budget of 3,000 nodes.

| Work | Complexity | Budget | Reference evidence |
|------|-----------|--------|--------------------|
| Edge indexing for parallel-edge fanning | O(E) | 5 ms | `[src: indexEdges()]` |
| Auto Layout mode choice | O(E) — one pass counting hierarchical and type edges | 2 ms | `[src: chooseLayout()]` |
| Force layout, fresh | O(ticks × n log n), where ticks is `clamp(round(70000 / (n + 60)), 70, 300)` | 200 ms | `[src: layoutForce()]` |
| Force layout, not fresh | O(1) — temperature is merely raised to at least 0.5 | under 0.01 ms | `[src: layoutForce()]` |
| Hierarchy, radial or grid layout | see [Layout algorithms](21-layout-algorithms.md) | 200 ms | `[src: relayout()]` |
| View fit | O(n) | 1 ms | `[src: fitView()]` |

**ARCH-151** The fresh-force tick count MUST fall as the node count rises, so that total layout cost stays roughly constant rather than growing with the square of the node count `[src: layoutForce()]`. At 100 nodes this yields 300 ticks; at 1,000 nodes, 70 ticks; at 3,000 nodes, 70 ticks.

**ARCH-152** Admission MUST call `neighboursOf()` exactly twice per newly admitted node — once to obtain its true degree when the node record is created, and once to link it against nodes already in view `[src: makeNode(), linkNode()]`. It MUST NOT call it per frame.

### 13.4 Per-dataset-change work and its budget

**ARCH-153** Dataset regeneration MUST complete within the following envelope, measured from the start of generation to the final read-out refresh.

| Individuals | Generation | Index construction | Total regeneration |
|-------------|-----------|--------------------|--------------------|
| 1,000 | under 5 ms | under 2 ms | under 60 ms |
| 12,000 | under 30 ms | under 10 ms | under 150 ms |
| 50,000 | under 120 ms | under 40 ms | under 400 ms |
| 100,000 | under 250 ms | under 80 ms | under 800 ms |

**ARCH-154** Generation MUST be a single linear pass that constructs the record, appends it to the record array, inserts it into the Individual IRI index and appends it to its by-type bucket, with no second pass `[src: generateIndividuals()]`.

**ARCH-155** The customer index MUST be built lazily and stamped with the Store version, so that a dataset the user never inspects by customer never pays for the index `[src: customerIndex()]`.

**ARCH-156** Triple counts MUST be computed arithmetically from array lengths and MUST NOT be obtained by enumerating triples `[src: tripleCount()]`. See [Data model and Store](11-data-model-and-store.md#7-triple-count-accounting).

### 13.5 Cadence violations to avoid

**ARCH-157** The following MUST NOT occur, and each is an instance of running work at too fast a cadence:

1. Calling `updateStoreUI()` or `updateBudgetUI()` from the frame loop.
2. Calling `applyFilters()` on a keystroke rather than on a debounced settle.
3. Calling `renderTree()` on selection change; only `renderTreeSelection()` may run, which is an O(visible rows) attribute pass `[src: renderTreeSelection()]`.
4. Re-reading Design tokens during a draw; tokens are read once per theme change into `palette` `[src: refreshPalette()]`.
5. Re-allocating the drawing Surface backing store during a splitter drag; that happens once, on release `[src: wireSplitter()]`.
6. Calling `neighboursOf()` during rendering or hit testing.
7. Materialising ABox triples for any purpose other than an active query scan; see [Data model and Store](11-data-model-and-store.md#6-the-three-tier-data-strategy).

---

## 14. Traceability

**ARCH-158** Every requirement in this document MUST be traceable to a test in [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md). Requirements marked **Status:** specified, not implemented in the reference build MUST be traceable to a test that is expected to fail against the reference build and to pass against the implementation.

---

## Appendix A — Native stack mapping (non-normative)

This appendix is illustrative. Nothing in it is normative, and an implementation that satisfies the body of this document on a different stack is conformant.

### A.1 Module to project mapping, WinUI 3 solution

| Module | Project | Kind | Notes |
|--------|---------|------|-------|
| M1 Ontology source data | `Axiom.Ontology.Fixtures` | .NET class library, no dependencies | Source-generated static tables, or embedded resources parsed once at start-up. |
| M2 Store | `Axiom.Core.Store` | .NET class library | No reference to any UI assembly. Target `net8.0`, not `net8.0-windows`, to make the boundary a compile error rather than a convention. |
| M3 Adjacency | `Axiom.Core.Adjacency` | .NET class library | References `Axiom.Core.Store` only. |
| M4 Graph viewport | `Axiom.Core.Viewport` | .NET class library | References `Axiom.Core.Adjacency`. Still no UI reference: the Viewport is a data structure, not a control. |
| M5 Layout engines | `Axiom.Core.Layout` | .NET class library | References `Axiom.Core.Viewport`. Hot loops here are the main candidates for `System.Numerics.Vector2` and `Span<T>`. |
| M6 Rendering | `Axiom.Render` | .NET library, Windows-targeted | The first project that may reference a graphics API. |
| M7 Export | `Axiom.Render.Export` | .NET library, Windows-targeted | References `Axiom.Render`. |
| M8 Selection bus | `Axiom.App.Shell` | WinUI 3 app project | Implemented as a small mediator with an ordered observer list. |
| M9–M12 Surfaces | `Axiom.App.Surfaces.*` | WinUI 3 user controls | One control per Surface, each with a view model. |
| M13 Chrome | `Axiom.App.Chrome` | WinUI 3 library | `InfoBar` for the toast, `MenuFlyout` for the flyouts, `ContentDialog` for the modals, `GridSplitter` for the splitters. |
| M14 Wiring | `Axiom.App.Shell` | WinUI 3 app project | XAML command bindings plus a composition root. |
| M15 Boot | `Axiom.App` | WinUI 3 app entry | `App.OnLaunched` performs the ordered boot of [section 3](#3-boot-sequence). |

A project reference from `Axiom.Core.*` to any `Axiom.App.*` or `Axiom.Render*` assembly is a build break, which is the intended enforcement of ARCH-12 and ARCH-14.

### A.2 Threading model

| Thread | Owns | Notes |
|--------|------|-------|
| UI thread | `UI`, every Surface, the selection bus, the chrome, hit testing, the render callback | All mutation of `UI` and all Surface updates happen here. |
| Layout worker | A double-buffered copy of node positions | The force simulation, the Sugiyama passes, the radial tree and the grid packer are pure numeric work over a position array and are natural candidates for a background thread. |
| Generation worker | A staging Store | `generateIndividuals()` at 100,000 Individuals costs roughly 250 ms, which is four dropped frames on the UI thread. Generate into a staging structure on a worker, then publish by a single reference swap on the UI thread, then run the regeneration teardown and rebuild of [section 11](#11-dataset-regeneration). |
| Query worker | The Store, read-only | Query evaluation is a read-only scan. A `CancellationToken` lets a new query pre-empt a running one. |

A practical arrangement for the layout worker: the worker owns the authoritative `float[] x, y, vx, vy` arrays; each completed tick copies positions into a back buffer; the render callback reads the front buffer and swaps under a lightweight lock. The node records themselves — identity, kind, degree, pin state — stay on the UI thread and are never written by the worker. This preserves ARCH-27 without a full actor model.

If a single-threaded implementation is chosen first, the boundaries above still hold: `Axiom.Core.Layout` takes arrays in and writes arrays out, which is what makes moving it off-thread a later refactor rather than a rewrite.

### A.3 Rendering surface

| Option | Fit | Trade-off |
|--------|-----|-----------|
| Win2D over `CanvasSwapChainPanel` | Strong default | Immediate-mode API that maps one-to-one onto the reference build's draw calls: paths, strokes, fills, text layout, transforms. Hardware accelerated through Direct2D. Presents independently of the XAML compositor, so the graph can run at display rate while the rest of the window is idle. Cost: an extra dependency, and text measurement differs enough from XAML that the label collision pass must be re-tuned. |
| Win2D over `CanvasControl` | Acceptable | Simpler; redraws are driven by the XAML compositor. Adequate up to roughly 1,500 nodes. |
| SkiaSharp over `SKXamlCanvas` | Acceptable | Portable if the workbench is later targeted beyond Windows. Cost: an extra composition step and a second text stack. |
| Direct2D via a `SwapChainPanel` interop | Maximum control | Only worth it if the Budget is raised well beyond 3,000 nodes. |
| XAML shapes in a `Canvas` | Unsuitable | 3,000 retained elements with per-element layout will not hold frame rate, and the label collision pass has no natural home. |

For export ([section 2](#2-module-decomposition), M7), Win2D's `CanvasRenderTarget` gives an off-screen surface at an arbitrary size, satisfying the requirement that export is independent of the on-screen Surface. SVG export is a separate serialiser over the same scene traversal and needs no graphics API at all.

### A.4 Virtualisation primitives

| Surface | Primitive | Notes |
|---------|-----------|-------|
| Individuals table | `ItemsRepeater` with `StackLayout` and a fixed 32 px item height, inside a `ScrollViewer` | A fixed item height allows exact extent calculation and constant-time scroll-to-index, which is what makes 100,000 rows cost the same as 100. Bind to an `IReadOnlyList<IndividualRecord>` and let `ItemsRepeater` realise only the visible window. |
| Query results | `ItemsRepeater` with the same fixed row height, columns defined per result set | Result column count varies per query, so the row template is built at result time rather than declared in XAML. |
| Class tree | `TreeView` with `ItemsSource` binding | Node count is bounded by the expanded set, not by the ontology, so full virtualisation is not required. A flattened list plus `ItemsRepeater` is an alternative if the property hierarchy is later widened. |
| Filter option lists | `ComboBox` with `ItemsSource` | Option count equals the number of instantiated types, which is 22 for the reference fixture. |

`ListView` is workable for the table but carries selection, focus and container-recycling behaviour that fights the per-cell editing model of [Individuals table](31-individuals-table.md). `ItemsRepeater` with explicit selection state is the closer match to the reference behaviour.
