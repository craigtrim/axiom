# Axiom — Implementation Plan

**Purpose:** This document is the build order for Axiom: eleven vertical slices, each ending in something that runs and can be shown, with objectively checkable exit criteria, a dependency graph, a risk register and a definition of done for the product as a whole.

**Status:** Normative

**Requirement ID prefixes owned:** `IMP`

---

## 1. How to use this plan

### 1.1 Vertical slices, never horizontal layers

**IMP-1** Work MUST be organised as vertical slices. A slice MUST cut through every layer it needs — data, logic and presentation — and MUST end in a running application that a person can be shown.

**IMP-2** A slice MUST NOT be defined as a horizontal layer. "Build the **Store**", "build the rendering layer", "build the view models" are not slices, because none of them can be demonstrated and none of them can be proved wrong. The first slice of this plan looks like a horizontal layer and is not: it ends in a window that displays real counts from the real fixture, which is a thing a person can look at and disbelieve.

**IMP-3** Each slice MUST declare, before work starts: its goal, the specification sections it implements, its entry criteria, its ordered task list, its exit criteria, its demo, and its dependencies. This document supplies all seven for all eleven slices.

**IMP-4** Exit criteria MUST be objectively checkable. An exit criterion phrased as a judgement — "the graph looks right", "performance is acceptable" — MUST be restated as a measurement or removed. Where this plan states a visual outcome, it states the measurable property that stands behind it.

**IMP-5** A slice MUST NOT be declared complete while any of its exit criteria is unmet. Carrying an unmet criterion forward as a to-do is the failure mode this plan exists to prevent: it converts a vertical slice back into a horizontal layer with a demo bolted on.

**IMP-6** Every slice MUST leave the application in a runnable state. The build MUST NOT be broken across a slice boundary, and the previous slice's demo MUST still work at the end of the next one.

### 1.2 The demo is the deliverable

**IMP-7** Every slice MUST end in a demo that can be given in under five minutes, without a script, on the fixture of [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md) at one of its four offered sizes.

**IMP-8** The demo MUST exercise the slice's own behaviour against the real fixture. A demo against a hand-made three-node graph proves nothing about a product whose entire discipline is bounded presentation of a large **Store**.

### 1.3 Traceability

**IMP-9** Every task in this plan MUST be traceable to at least one numbered requirement in another suite document, and every requirement in the suite MUST be claimed by at least one slice. A requirement claimed by no slice is either out of scope and MUST be recorded as such, or an omission in this plan.

**IMP-10** A commit SHOULD name the requirement IDs it implements. A pull request MUST name the slice it belongs to and the exit criteria it advances.

---

## 2. Prerequisites

**IMP-11** Before slice one begins, the following MUST be true.

| # | Prerequisite | Why it must precede slice one |
|---|---|---|
| P1 | [`README.md`](README.md), [`00-product-overview.md`](00-product-overview.md), [`10-architecture.md`](10-architecture.md), [`11-data-model-and-store.md`](11-data-model-and-store.md) and [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md) have been read end to end | The **Store** shape and the fixture are assumed without re-statement by every later document |
| P2 | A Windows 11 development machine with the chosen UI stack installed and a hello-world window building and running | Slice one ends in a window; a toolchain problem discovered then is a slice-one blocker |
| P3 | A repository with a working continuous build that compiles and runs the unit test project on every push | Slice one's exit criteria are unit tests; they need somewhere to run |
| P4 | A decision, recorded, on the UI framework | Framework choice is advisory in this suite but cannot be deferred past slice two, and changing it after slice four is expensive |
| P5 | Agreement on the target minimum hardware, expressed as a concrete machine specification | Every performance budget in [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) is meaningless without it |
| P6 | A display for measurement at the reference resolution, plus one high-DPI display | The label collision pass and the export scale factors behave differently at different device pixel ratios |
| P7 | The reference implementation available, read-only, for behavioural comparison | It is the behavioural source of truth where this suite is silent |

**IMP-12** The reference implementation MUST NOT be edited, moved, reformatted or made part of the build. It is read-only evidence.

**IMP-13** No slice MAY begin before P1 to P5 are satisfied. P6 and P7 MUST be satisfied before slice four.

---

## 3. The slices

### 3.1 Slice 1 — The Store and the fixture

**Goal.** A window that builds the whole **TBox** and generates the whole **ABox** from the fixture, and reports the counts, correctly, at all four dataset sizes.

**Implements.** [`11-data-model-and-store.md`](11-data-model-and-store.md) in full; [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md) in full; the boot sequence of [`10-architecture.md`](10-architecture.md).

**Entry criteria.** P1 to P5 of [§2](#2-prerequisites).

**Tasks, in order.**

1. Define the **Entity** record: IRI, local name, kind, parents, children, restrictions, equivalents, disjoint-with, domain-of, range-of, characteristics, comment, namespace marker.
2. Define the restriction normal form and the three shapes of `FIX-17`, with the rendering rules of `FIX-21` and the target extraction of `FIX-22`.
3. Transcribe the class table of `FIX-24` — all 70 entries, in order.
4. Transcribe the named pizza table of `FIX-27` — all 22 entries, with the three axiom families of `FIX-28`, `FIX-29` and `FIX-30`.
5. Transcribe the object property table of `FIX-33`, the countries of `FIX-39`, and the `demo:` vocabulary of `FIX-46` to `FIX-50`.
6. Implement the **TBox** build in the ten stages of `FIX-52`, including the child-link back-fill and the child-list sort.
7. Implement the triple emission rules of `FIX-55` and `FIX-56` exactly — seven predicates, 239 triples, nothing else.
8. Implement the pseudo-random generator of `FIX-61` with its exact parameters, and verify it against the golden values before writing anything that depends on it.
9. Implement the **ABox** generator of `FIX-73`, including the draw order of `FIX-70`, the IRI padding of `FIX-77`, the order reference of `FIX-78`, the price jitter of `FIX-80`, the timestamp of `FIX-81`, the rating of `FIX-82` and the customer assignment of `FIX-83`.
10. Build the three **ABox** indexes of `FIX-84` in a single pass.
11. Implement the counting functions of `FIX-92` to `FIX-97`.
12. Implement the flattened restriction index of `FIX-98` to `FIX-100`.
13. Implement the entity resolution path of `FIX-16` that gives a generated record a display shape without materialising it.
14. Write the fixture verification suite: every check in `FIX-102`, sections 16.1 to 16.5.
15. Put a window on screen showing the four figures — triples, classes, individuals, dataset size — and a control that regenerates at each of the four sizes.

**Exit criteria.**

| # | Criterion |
|---|---|
| E1.1 | All 60 checks V1 to V60 of `FIX-102` pass as automated tests |
| E1.2 | The golden values of `FIX-102` V33 to V47 match exactly at all four sizes |
| E1.3 | Two consecutive generations at the same size produce identical records, field for field |
| E1.4 | Reported triples are 7,489 / 87,239 / 362,739 / 725,239 at the four sizes |
| E1.5 | Generation of 100,000 orders completes within the budget of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) on the P5 machine |
| E1.6 | No **ABox** record is materialised as an **Entity**, verified by an allocation or entity-count assertion after generation |
| E1.7 | Every entity's namespace marker matches its IRI prefix |

**Demo.** Launch. Read the four counts aloud. Switch to 100,000. Watch the counts change to 725,239 triples and 112,505 individuals, and the elapsed time appear. Switch back to 12,000 and show that the first customer is still Nadia Duarte and the first order is still a `pizza:Rosa` — the same data every time.

**Dependencies.** None.

---

### 3.2 Slice 2 — The application shell and the token system

**Goal.** The real window: command bar, four **Surface** regions, splitters, status bar, both themes, and every visual value coming from a **Design token**.

**Implements.** [`40-design-system.md`](40-design-system.md) in full; [`41-component-library.md`](41-component-library.md) for the components this slice uses; the shell and state ownership of [`10-architecture.md`](10-architecture.md).

**Entry criteria.** Slice 1 complete.

**Tasks, in order.**

1. Define every **Design token** from [`40-design-system.md`](40-design-system.md) as a single named resource set: colour, type, spacing, radius, motion, elevation.
2. Define both theme value sets — light and dark — over the same token names.
3. Implement theme switching, including the accessible name of the control flipping between *Switch to dark theme* and *Switch to light theme* `[src: setTheme()]`.
4. Honour the system dark-mode preference at start-up `[src: init()]`.
5. Build the shell: command bar, left panel, centre **Surface** host, right inspector panel, status bar.
6. Build the tabbed switch between the graph **Surface**, the individuals table **Surface** and the **SPARQL** console **Surface**.
7. Build the draggable splitters with their minimum sizes.
8. Build the status bar with its fields: ontology name, store triples, classes, individuals, in-view nodes, in-view relationships, layout name, zoom `[src: updateStoreUI()]` `[src: updateBudgetUI()]`.
9. Build the toast surface and the modal dialog scrim.
10. Build the flyout menu component.
11. Wire the status bar to the real **Store** counts from slice 1.
12. Write the token audit test: no view declares a literal colour, font size, radius, duration or spacing value.

**Exit criteria.**

| # | Criterion |
|---|---|
| E2.1 | The token audit test passes: zero literal visual values outside the token definitions |
| E2.2 | Every token defined in [`40-design-system.md`](40-design-system.md) has a value in both themes; the two sets have identical key sets |
| E2.3 | Theme switching changes every themed value with no application restart and no visual element left on the previous theme |
| E2.4 | Contrast ratios meet the thresholds of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) in both themes, measured by an automated checker over the token pairs |
| E2.5 | The status bar shows the real fixture counts and updates on regeneration |
| E2.6 | Splitters resize, respect their minimum sizes, and are keyboard-operable |
| E2.7 | Every interactive control is reachable by keyboard and shows a visible focus indicator |

**Demo.** Launch. Drag the splitters. Switch themes and back. Show the status bar counts changing as the dataset size changes. Traverse the whole window with the keyboard alone, saying what has focus at each step.

**Dependencies.** Slice 1.

---

### 3.3 Slice 3 — The class hierarchy tree and the inspector

**Goal.** The first **Surface** a user touches: a browsable class and property hierarchy with a working entity inspector.

**Implements.** [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) in full.

**Entry criteria.** Slices 1 and 2 complete.

**Tasks, in order.**

1. Build the tree from the **Store**'s parent and child links, rooted at `owl:Thing`.
2. Implement the default expansion set `[src: DEFAULT_OPEN]` — the root, `pizza:DomainConcept`, `pizza:Food`, `pizza:Pizza`, `pizza:PizzaTopping`.
3. Render per-kind icons and colours from the kind metadata, distinguishing primitive from defined classes.
4. Show instance counts on classes that have a type bucket, from the fixture's type index.
5. Implement the tree filter, including the reveal behaviour that expands ancestors of a match.
6. Implement the keyboard model: up and down to move selection, the twisty to expand and collapse, Enter to act.
7. Build the property tree over object and data properties, with the sub-property links of `FIX-34`.
8. Build the inspector: header, kind, IRI, comment, parents, children, equivalence axioms, subclass restrictions, disjointness, domain and range, characteristics, inverse, types.
9. Render axioms with the Manchester-like rules of `FIX-21`, with every IRI a live link that changes the selection.
10. Reserve and label the inferred-axioms region, and mark it as requiring a reasoner that is out of scope.
11. Implement rename with the validation rules of [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) `[src: validateName()]`, including the uniqueness check across the whole **Store**.
12. Implement the undo entry for a rename.
13. Show the customer note for a customer **Individual**, stating how many generated orders reference it `[src: renderInspector()]`.

**Exit criteria.**

| # | Criterion |
|---|---|
| E3.1 | The tree shows exactly 95 classes and 14 properties for the fixture, matching `FIX-57` |
| E3.2 | Child lists are sorted by local name at every level |
| E3.3 | Selecting each of the 114 entities in turn renders an inspector with no empty required section and no unresolved IRI |
| E3.4 | `pizza:Margherita` shows exactly four restrictions, in the order of `FIX-31` |
| E3.5 | Every name validation rule of `[src: validateName()]` is covered by a test, including the four rejection messages |
| E3.6 | Filtering to a leaf reveals it with every ancestor expanded |
| E3.7 | The whole tree is operable by keyboard alone, and the selected row is announced with its accessible name |

**Demo.** Launch. Expand to `pizza:Margherita`, read its four axioms. Click the `pizza:MozzarellaTopping` link inside an axiom and land on that class. Filter for "spicy" and show the four matches revealed in place. Rename a class, then try to rename it to a name that already exists and show the message.

**Dependencies.** Slices 1, 2.

---

### 3.4 Slice 4 — The graph Viewport, the Budget, and one force layout

**Goal.** The product's defining discipline, working: a bounded **Viewport** that admits, evicts and reports honestly, with one real layout.

**Implements.** [`20-graph-viewport-and-budget.md`](20-graph-viewport-and-budget.md) in full; the force layout of [`21-layout-algorithms.md`](21-layout-algorithms.md); the basic draw pipeline of [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md).

**Entry criteria.** Slices 1, 2, 3 complete. P6 and P7 satisfied.

**Tasks, in order.**

1. Implement the adjacency function over every relation the **Store** holds: parents, children, restriction targets, disjointness, domain, range, inverse, types, reverse restrictions, and the expensive instances-of-a-class direction `[src: neighboursOf()]`.
2. Implement the adjacency cap at 4,000 `[src: NEIGHBOUR_CAP]`, returning a **capped list** and an **uncapped total** as two separate figures. The total is what **Hidden neighbour** arithmetic depends on.
3. Build the **Viewport** state: node map, edge map, **Budget**, eviction mode, **Focus set**, selection, hover, layout mode, revision counter, view transform.
4. Implement node creation with degree-derived radius and golden-angle seed placement around the node it was expanded from `[src: makeNode()]`.
5. Implement edge creation and the shown-degree bookkeeping on both endpoints `[src: linkNode()]` `[src: unlinkNode()]`.
6. Implement **Eviction** ordering: furthest from the **Focus set** first, then least connected in view, then least recently touched; with the alternative least-recently-used ordering; and with **Pin** and **Focus set** membership as absolute exemptions `[src: evictionOrder()]`.
7. Implement admission with its honest report — added, evicted, refused, and up to three evicted labels `[src: addToView()]`.
8. Implement the third overflow policy, refusal, which admits what fits and refuses the rest `[src: addToView()]`.
9. Implement expansion with a per-expansion cap and the expanded-flag rule that a node counts as fully expanded only when nothing was left out `[src: expandNode()]`.
10. Implement collapse, which removes only leaf neighbours that are neither pinned nor in the **Focus set** `[src: collapseNode()]`.
11. Implement seeding, which replaces the **Viewport**, sets the **Focus set**, and expands the first twelve seeds with a per-seed share of the **Budget** `[src: seedView()]`.
12. Implement the **Hidden neighbour** count per node and its total across the **Viewport** `[src: hiddenNeighbours()]` `[src: totalHidden()]`.
13. Build the **Budget** control: value display, slider from 100 to 3,000 in steps of 100, occupancy meter with its near and full thresholds, in-view node count, held-back neighbour count `[src: #budgetRange]` `[src: updateBudgetUI()]`.
14. Implement lowering the **Budget** below the current node count, which evicts down to the new ceiling and reports how many were paged out `[src: wire()]`.
15. Implement the force layout: Barnes-Hut approximation, degree-weighted link forces, and hard collision resolution `[src: layoutForce()]`.
16. Implement the simulation freeze and resume control.
17. Draw nodes, edges and the selection and hover states; implement pan, zoom, drag, fit-to-view and the minimap.
18. Wire tree selection to seeding, and double-click to expansion.

**Exit criteria.**

| # | Criterion |
|---|---|
| E4.1 | The **Viewport** node count never exceeds the **Budget**, asserted after every admission in a fuzz test of at least 10,000 random operations |
| E4.2 | Expanding `pizza:Margherita` at **Budget** 1,000 over the 12,000-order dataset admits what fits and reports the refused count exactly |
| E4.3 | The sum of per-node **Hidden neighbour** counts equals the held-back figure in the **Budget** panel, at every point in the fuzz test |
| E4.4 | **Hidden neighbour** counts remain correct when the adjacency cap truncates the list — verified on `pizza:Margherita` at 100,000 orders, where the uncapped degree is 4,550 and the cap is 4,000 |
| E4.5 | No pinned node and no **Focus set** member is ever evicted, asserted across the fuzz test |
| E4.6 | Lowering the **Budget** from 3,000 to 100 with 3,000 nodes in view leaves exactly 100 nodes and reports 2,900 paged out |
| E4.7 | Two force layout runs from the same **Viewport** and the same revision produce identical coordinates |
| E4.8 | No two node centres are closer than the sum of their radii after the force layout settles |
| E4.9 | Frame time at the **Budget** ceiling meets the budget of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) |

**Demo.** Launch at 12,000. Select `pizza:Pizza` in the tree; the graph seeds. Double-click `pizza:NamedPizza` and watch 22 pizzas arrive. Drop the **Budget** to 200 and watch nodes page out with a message saying how many. Pin a node, drop the **Budget** again, and show the pinned node survive. Point at the held-back count and expand a node to show it rise.

**Dependencies.** Slices 1, 2, 3.

---

### 3.5 Slice 5 — The remaining three layouts and the auto selector

**Goal.** Four real layouts, and a selector that picks the right one without being asked.

**Implements.** The hierarchy, radial and grid layouts and the `auto` selector of [`21-layout-algorithms.md`](21-layout-algorithms.md).

**Entry criteria.** Slice 4 complete, including E4.7 and E4.8.

**Tasks, in order.**

1. Implement the hierarchy layout: longest-path layer assignment over the subclass, sub-property and type edges, median-heuristic crossing reduction, priority coordinate relaxation `[src: layoutHierarchy()]`.
2. Implement the radial layout: breadth-first depth rings from the **Focus set**, wedges proportional to subtree leaf count, each ring sized to fit its own circumference, with the ring guides recorded for rendering `[src: layoutRadial()]`.
3. Implement the grid layout: type-clustered packed grids with the group blocks recorded for rendering `[src: layoutGrid()]`.
4. Implement the parallel-edge fan so that multiple edges between the same pair are separated rather than stacked `[src: indexEdges()]`.
5. Implement the `auto` selector with its exact thresholds `[src: chooseLayout()]`: grid above 300 nodes when more than 55 per cent of edges are type edges; grid above 500 nodes; hierarchy when the edge count is at least half the node count, more than 78 per cent of edges are hierarchical, and there are at most 400 nodes; radial when the **Focus set** has at most two members and there are more than 14 nodes; force otherwise.
6. Implement the relayout trigger keyed on node count, edge count, revision and layout mode `[src: layoutKey()]`.
7. Show the resolved **Layout mode** in the status bar, marked `(auto)` when it was chosen rather than requested `[src: relayout()]`.
8. Disable the freeze control for the three computed layouts, with the explanatory tooltip `[src: relayout()]`.
9. Implement centring after each computed layout `[src: centreNodes()]`.

**Exit criteria.**

| # | Criterion |
|---|---|
| E5.1 | Each of the four layouts produces identical coordinates across repeated runs on the same **Viewport** |
| E5.2 | The `auto` selector returns each of its four outcomes for the four documented **Viewport** shapes, each covered by a test |
| E5.3 | After every layout, no two node centres are closer than the sum of their radii |
| E5.4 | The hierarchy layout produces monotonically increasing layer coordinates along every subclass edge |
| E5.5 | The radial layout places every node on its breadth-first ring, with ring radii strictly increasing |
| E5.6 | The grid layout places every node inside exactly one group block, with no block overlapping another |
| E5.7 | Fresh layout computation at the **Budget** ceiling meets the budget of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) |
| E5.8 | The status bar names the resolved layout, and marks it `(auto)` only when the user chose `auto` |

**Demo.** Seed from `pizza:Pizza`, whose neighbourhood is a single-member **Focus set** of more than fourteen nodes, and watch `auto` pick radial. Expand the class hierarchy until hierarchical edges dominate and watch it pick hierarchy. Send 800 individuals from the table and watch it pick grid. Collapse to a handful of nodes with a **Focus set** of three and watch it fall through to force. Then switch each **Layout mode** manually and show the same four pictures on demand.

**Dependencies.** Slice 4.

---

### 3.6 Slice 6 — Rendering polish: the label pass and edge typing

**Goal.** A graph that reads. This is the slice that decides whether the product is credible.

**Implements.** The draw pipeline, node shapes, edge routing and typing, the label pass, the **Hidden neighbour** badge and the minimap of [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md).

**Entry criteria.** Slice 5 complete.

**Tasks, in order.**

1. Implement the five node shapes, one per kind: rectangle for a class, rectangle for a defined class with its own colour, circle for an **Individual**, diamond for an object property, hexagon for a data property `[src: KIND_META]` `[src: nodePath()]`.
2. Implement edge typing: dashed for `rdf:type`, solid for subclass and object property relations, with per-predicate treatment as specified.
3. Implement the greedy label pass: geometry in world space, text in screen space at a fixed point size, spatial-hash collision detection, and a hard cap on labels drawn `[src: placeLabels()]`.
4. Implement the label priority function exactly `[src: placeLabels()]`: **Focus set** membership, then selection, then hover, then **Pin**, then node radius, then in-view degree.
5. Implement label truncation at 30 characters with an ellipsis `[src: shortLabel()]`.
6. Implement the on-screen label cap of 900 and the off-screen margin test that skips labels outside the visible area `[src: placeLabels()]`.
7. Implement the **Hidden neighbour** badge — the `+n` marker — and the legend entry that explains it `[src: renderLegend()]`.
8. Implement the layout-specific chrome: radial ring guides and grid group blocks.
9. Implement hover highlighting of a node and its immediate neighbourhood.
10. Implement the background grid whose spacing is suppressed below a zoom threshold.
11. Implement the minimap with its viewport rectangle.
12. Implement the legend with every kind, the **Pin** marker and the held-back explanation.
13. Refresh the renderer palette on theme change `[src: refreshPalette()]` `[src: setTheme()]`.

**Exit criteria.**

| # | Criterion |
|---|---|
| E6.1 | No two drawn label rectangles intersect, asserted programmatically over the placement result at 100, 500, 1,000 and 3,000 nodes in all four layouts |
| E6.2 | When two labels collide, the one retained is the one with the higher priority under the documented function — covered by a test with a deterministic tie |
| E6.3 | The selected node's label is always drawn when the node is on screen |
| E6.4 | No more than 900 labels are drawn on screen in any frame |
| E6.5 | Every node kind renders its documented shape and its documented token colour, in both themes |
| E6.6 | Theme switching refreshes the renderer palette within one frame, with no element left on the previous theme's colour |
| E6.7 | The sum of `+n` badges equals the held-back total in the **Budget** panel |
| E6.8 | Frame time at the **Budget** ceiling with labels enabled meets the budget of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) |

**Demo.** Fill the **Viewport** to 1,000 nodes in grid layout and zoom out: the labels thin out rather than smearing. Zoom in and watch them return. Hover a node and watch its neighbourhood lift. Switch themes mid-frame. Point at a `+n` badge and expand that node to show the badge fall.

**Dependencies.** Slice 5.

---

### 3.7 Slice 7 — The individuals table

**Goal.** 100,000 rows, scrolling smoothly, filterable, sortable and editable in place.

**Implements.** [`31-individuals-table.md`](31-individuals-table.md) in full.

**Entry criteria.** Slices 1, 2 complete; slice 4 complete for the send-to-graph path.

**Tasks, in order.**

1. Define the eight columns with their widths, accessors, sort keys and editability `[src: COLS]`.
2. Implement the virtualised body: fixed row height of 32, a spacer sized to the full filtered row count, a rendered window of the visible rows plus an overscan of 6 above and 12 extra rows in total, and a translation offset `[src: ROW_H]` `[src: renderTableRows()]`.
3. Implement sorting on every column, ascending and descending, with the documented sort keys.
4. Implement the three filters — type, branch, free text — and their combination `[src: applyFilters()]`.
5. Populate the type filter from the **Store**'s type buckets with per-type counts, and the branch filter from the fixture's six branches `[src: populateFilterOptions()]`.
6. Implement the row count display showing both the filtered figure and the store figure.
7. Implement in-cell editing for branch, price and rating, with the branch editor a closed list of the six branches.
8. Implement validation on blur, not on keystroke, with Enter committing and Escape reverting `[src: commitCell()]`.
9. Implement every validation rule and its exact message for branch, price and rating `[src: commitCell()]`.
10. Implement the error state on a rejected cell, with its timed clear.
11. Implement the undo entry for each committed cell edit.
12. Implement the empty state for a dataset with no individuals `[src: renderTableRows()]`.
13. Implement selection synchronisation with the tree and the inspector.
14. Implement send-to-graph, which seeds the **Viewport** from the filtered rows up to the **Budget** and reports how many of how many were taken `[src: wire()]`.
15. Implement the add-individual dialog, including the rule that it refuses when there is no instantiable type `[src: wire()]`.

**Exit criteria.**

| # | Criterion |
|---|---|
| E7.1 | The table displays 100,000 rows with a constant number of realised row elements regardless of scroll position |
| E7.2 | Scroll frame time at 100,000 rows meets the budget of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) |
| E7.3 | Filter application at 100,000 rows meets its budget |
| E7.4 | Sorting each of the eight columns produces the documented order, verified against an independently sorted reference |
| E7.5 | Every branch, price and rating validation rule is covered by a test asserting the exact message text |
| E7.6 | A rejected edit leaves the underlying record unchanged |
| E7.7 | A committed edit is visible in the inspector and in query results without a further action |
| E7.8 | Send-to-graph never exceeds the **Budget** and reports both figures |
| E7.9 | The table is fully keyboard-operable, including entering and leaving cell edit |

**Demo.** Open the table at 100,000. Drag the scrollbar from top to bottom in one motion. Filter to Shoreditch and a price band. Sort by price descending. Edit a price to `abc` and show the message; edit it to 12.50 and show it commit. Send the filtered rows to the graph and show the count message.

**Dependencies.** Slices 1, 2, 4.

---

### 3.8 Slice 8 — The SPARQL console

**Goal.** A real evaluator over the **Store**, answering the seven worked examples against 725,239 triples.

**Implements.** [`32-sparql-console.md`](32-sparql-console.md) in full.

**Entry criteria.** Slices 1, 2 complete; slice 4 complete for the send-to-graph path.

**Tasks, in order.**

1. Implement the tokeniser with its ten token classes, including comments, strings, variables, IRIs, prefixed names, numbers, punctuation, words and operators `[src: tokenize()]`.
2. Implement the parser: prefix declarations, `SELECT` with `DISTINCT` and the wildcard, `WHERE`, triple patterns, `FILTER`, `ORDER BY` with `ASC` and `DESC`, and `LIMIT` `[src: parseQuery()]`.
3. Implement every parse error with its exact message and its exact hint `[src: parseQuery()]`.
4. Implement the projection check that rejects a selected variable never bound in the pattern block.
5. Implement the pattern scanner over all four sources: **TBox** triples, the flattened restriction index, generated order assertions, and customer assertions `[src: scan()]`.
6. Implement the index-driven scan paths so that a bound subject or a bound object uses an index rather than a full sweep `[src: scan()]`.
7. Implement the nested-loop join with the solution cap of 200,000 and the truncation flag `[src: evaluate()]` `[src: SOLUTION_CAP]`.
8. Implement filter evaluation with its numeric-versus-string coercion rule `[src: evaluate()]`.
9. Implement `DISTINCT`, `ORDER BY` and `LIMIT` in that order, and report the pre-limit total `[src: evaluate()]`.
10. Build the console: editor with syntax highlighting, the seven worked examples with their descriptions, the run control, and the results grid reusing the virtualisation of slice 7.
11. Implement the result summary: row count, elapsed time, and the cap notice when the cap was reached `[src: SOLUTION_CAP]`.
12. Implement the error presentation with the message and the hint.
13. Implement send-to-graph from a result set, bounded by the **Budget**.

**Exit criteria.**

| # | Criterion |
|---|---|
| E8.1 | All seven worked examples parse, evaluate and return the documented row counts at 12,000 |
| E8.2 | Every parse error is covered by a test asserting both the message and the hint |
| E8.3 | A query that reaches the solution cap reports the cap in the summary and does not hang |
| E8.4 | Query evaluation at each of the four dataset sizes meets its budget |
| E8.5 | A query with a bound subject or object does not sweep the whole **ABox**, verified by a counter on the scan path |
| E8.6 | `DISTINCT`, `ORDER BY` and `LIMIT` are applied in the documented order, with the reported total being the pre-limit figure |
| E8.7 | An edit made in the table is visible in the next query result without regeneration |

**Demo.** Run the named-pizzas-and-toppings example. Run the five-star orders example at 100,000 and show the elapsed time. Break a query deliberately — a missing brace, an unknown prefix, a variable selected but never bound — and read the three messages. Send a result set to the graph.

**Dependencies.** Slices 1, 2, 4.

---

### 3.9 Slice 9 — Export

**Goal.** A picture you can put in a document, carrying a header that says exactly what it is.

**Implements.** The four export paths and the provenance header of [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md).

**Entry criteria.** Slices 4, 5, 6 complete.

**Tasks, in order.**

1. Implement scene bounds with padding over the current **Viewport** `[src: sceneBounds()]`.
2. Implement off-screen rendering of the whole scene at an arbitrary scale, independent of the on-screen surface `[src: renderExportCanvas()]`.
3. Implement the dimension guard that reduces the scale factor until neither dimension exceeds 9,000 pixels `[src: EXPORT_MAX_PX]`.
4. Implement the header band of 86 units and the footer band of 58 units with their divider rules `[src: EXPORT_HEADER]` `[src: EXPORT_FOOTER]`.
5. Implement the caption: resolved **Layout mode**, node count, relationship count, **Budget**, held-back neighbour count, and the timestamp in British format `[src: exportCaption()]`.
6. Implement the footer legend drawn with the real node shapes, plus the edge-typing note `[src: drawExportChrome()]`.
7. Raise the label cap for export to 4,000 so that a print-resolution picture is not thinned to screen density `[src: renderExportCanvas()]`.
8. Implement the two raster scales, the vector export and the clipboard copy.
9. Implement the file naming rule: product stem, resolved layout, date and time `[src: exportStem()]`.

**Exit criteria.**

| # | Criterion |
|---|---|
| E9.1 | The header figures equal the live status bar and **Budget** panel figures at the moment of export, asserted by comparing the rendered strings |
| E9.2 | Neither dimension of any export exceeds 9,000 pixels at any scale and any scene size |
| E9.3 | The vector export reopens in an independent vector editor with text as text, not as outlines |
| E9.4 | The clipboard copy pastes into a document at the documented scale |
| E9.5 | No two labels overlap in the exported image, at both raster scales |
| E9.6 | Export render time meets its budget at the **Budget** ceiling |
| E9.7 | Exports in both themes use the corresponding theme palette throughout, including the header and footer bands |

**Demo.** Fill the **Viewport**, export at 3×, open the file, and read the header aloud against the status bar. Export the vector version and open it in an editor. Copy to clipboard and paste into a document.

**Dependencies.** Slices 4, 5, 6.

---

### 3.10 Slice 10 — Hardening, accessibility and performance

**Goal.** The product is not merely complete but defensible: measured, accessible, and free of the defects this design exists to prevent.

**Implements.** The accessibility requirements across the suite; the performance budgets and regression guards of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md).

**Entry criteria.** Slices 1 to 9 complete.

**Tasks, in order.**

1. Complete the keyboard traversal of every **Surface**, including the graph canvas, which is the hardest and is therefore the one most often skipped.
2. Give every interactive element an accessible name and role; give every meter, tree row, grid cell and menu item its correct semantics.
3. Verify focus visibility against the token contrast threshold in both themes.
4. Implement the reduced-motion path: no force simulation animation, no transition durations, layouts computed and settled in one step.
5. Verify behaviour at system font scaling up to 200 per cent, and fix every clipped or overlapping region.
6. Run the contrast audit over both themes and fix every pair below threshold.
7. Build the performance harness that measures every budget in [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) reproducibly on the P5 machine.
8. Measure, record and fix until every budget passes.
9. Implement the regression guards: the overlap assertion, the label collision assertion, the **Budget** ceiling assertion, the **Hidden neighbour** arithmetic assertion, the index consistency assertion after every mutation, and the fixture checksum assertion.
10. Run a long-session soak: repeated regeneration, expansion, eviction, layout switching and theme switching, asserting no growth in entity count, node count or memory beyond the expected steady state.
11. Complete the error and empty states for every **Surface**.
12. Complete the undo coverage for every documented mutation.

**Exit criteria.**

| # | Criterion |
|---|---|
| E10.1 | Every **Surface** is fully operable with the keyboard alone, verified by an automated traversal |
| E10.2 | Every interactive element exposes an accessible name and role, verified by an automated accessibility scan with zero violations |
| E10.3 | Every contrast pair in both themes meets its threshold |
| E10.4 | The reduced-motion path produces a settled layout with no animation |
| E10.5 | The interface is usable at 200 per cent system font scaling with no clipped text and no overlapping controls |
| E10.6 | Every performance budget passes on the P5 machine, with the measurement recorded |
| E10.7 | Every regression guard is an automated test in the continuous build |
| E10.8 | A one-hour soak shows no unbounded growth in any counted resource |

**Demo.** Drive the entire product from the keyboard, end to end, without touching the pointer. Turn on reduced motion and show the graph settle in one step. Set font scaling to 200 per cent and show the shell absorb it. Show the performance report, with each budget and its measured value.

**Dependencies.** Slices 1 to 9.

---

### 3.11 Slice 11 — Packaging and release readiness

**Goal.** Something a person can install.

**Implements.** No numbered requirement in the suite; this slice exists because the suite records installer, signing and release engineering as deliberately unspecified, and unspecified is not the same as unnecessary.

**Entry criteria.** Slice 10 complete.

**Tasks, in order.**

1. Produce a signed installable package for the target Windows 11 versions.
2. Verify a clean-machine install and first run, with the fixture present and no network access.
3. Verify start-up time from launch to an interactive window on the P5 machine.
4. Produce the release notes, naming the fixture provenance and the demo-data policy in the user's own words.
5. Produce the crash and error diagnostics path, with no telemetry, since telemetry is a recorded non-goal.

**Exit criteria.**

| # | Criterion |
|---|---|
| E11.1 | A clean Windows 11 machine, with no development tooling and no network connection, installs and runs the product |
| E11.2 | Start-up to interactive meets its budget |
| E11.3 | The package is signed and the signature verifies |
| E11.4 | The release notes state the ontology provenance and the demo-data policy |

**Demo.** Install on a clean machine, offline, and run the slice-one demo on it.

**Dependencies.** Slice 10.

---

## 4. Dependency graph

**IMP-14** The slices MUST be scheduled consistently with the following dependencies.

| Slice | Depends on | Unblocks |
|---|---|---|
| 1 — Store and fixture | — | 2, 3, 4, 7, 8 |
| 2 — Shell and tokens | 1 | 3, 4, 6, 7, 8 |
| 3 — Tree and inspector | 1, 2 | 4 |
| 4 — **Viewport**, **Budget**, force layout | 1, 2, 3 | 5, 7, 8, 9 |
| 5 — Three more layouts and `auto` | 4 | 6, 9 |
| 6 — Rendering polish | 5 (and 2 for tokens) | 9 |
| 7 — Individuals table | 1, 2, 4 | 8 (shares the virtualised grid), 10 |
| 8 — SPARQL console | 1, 2, 4, 7 | 10 |
| 9 — Export | 4, 5, 6 | 10 |
| 10 — Hardening | 1–9 | 11 |
| 11 — Packaging | 10 | — |

Rendered as a chain of the longest path:

```
1 → 2 → 3 → 4 → 5 → 6 → 9 → 10 → 11
             ↘ 7 → 8 ↗
```

**IMP-15** The critical path is 1 → 2 → 3 → 4 → 5 → 6 → 9 → 10 → 11. Slices 7 and 8 branch off slice 4 and rejoin at slice 10; they are the only meaningful opportunity for parallel work.

---

## 5. Risk register

**IMP-16** Each risk below MUST be tracked, and its mitigation MUST be scheduled inside the slice named against it. A risk whose mitigation is scheduled after the slice that creates it is not mitigated.

Likelihood and impact are stated as high, medium or low.

### 5.1 Graph rendering performance at the Budget ceiling on a native surface

| | |
|---|---|
| **Risk** | The graph cannot hold its frame budget at 3,000 nodes on the native drawing surface, because retained-mode scene graphs and per-element hit testing behave very differently from an immediate-mode canvas |
| **Likelihood** | High |
| **Impact** | High — the **Budget** ceiling is a documented product promise, and a product that stutters at its own advertised ceiling is not credible |
| **Slice** | 4, measured again in 6 and 10 |
| **Mitigation** | Draw the graph in immediate mode to a single surface, not as thousands of retained elements. Prove this in slice 4 with a spike of 3,000 nodes before any other graph work is done. Keep hit testing in the application's own spatial index rather than in the framework's. Measure on the P5 machine at every slice boundary, not at the end. If the frame budget cannot be met at 3,000, the honest response is to lower the maximum **Budget** and say so, not to quietly drop frames |

### 5.2 Layout quality regressions

| | |
|---|---|
| **Risk** | A layout change produces overlapping nodes or an unreadable label smear. This is the failure that motivated the current four-layout design, and it will recur the moment layout quality is judged by eye instead of measured |
| **Likelihood** | High |
| **Impact** | High — it is the single defect most likely to make the product look amateur, and it is invisible to every test that does not explicitly look for it |
| **Slice** | 5 and 6, guarded permanently from 10 |
| **Mitigation** | Make overlap and label collision automated assertions, not review comments: no two node centres closer than the sum of their radii, and no two drawn label rectangles intersecting, asserted across all four layouts at 100, 500, 1,000 and 3,000 nodes. Make layout determinism a test so that a regression is reproducible. Keep a small corpus of **Viewport** snapshots as fixtures. Never accept "it looks fine on my screen" as evidence |

### 5.3 Virtualised grid performance at 100,000 rows

| | |
|---|---|
| **Risk** | The table loses its frame budget while scrolling, or takes visibly long to apply a filter, at the largest dataset size |
| **Likelihood** | Medium |
| **Impact** | High — the table is the **Surface** where the product's scale claim is most directly visible to a user, and a stuttering scrollbar reads as a broken product |
| **Slice** | 7, measured again in 10 |
| **Mitigation** | Realise a fixed number of row elements and recycle them; never create one element per row. Keep the row height constant so that scroll position is arithmetic rather than measurement. Keep the filtered row set as an index list, not as copied records. Sort indices, not records. Measure fling-scroll frame time, not just steady scrolling, because the fling is where a per-row allocation shows up |

### 5.4 Query latency without a real index

| | |
|---|---|
| **Risk** | A query with an unbound subject and an unbound object degrades to a full sweep of the **ABox**, and the console becomes unusable at 100,000 orders |
| **Likelihood** | Medium |
| **Impact** | Medium — the console is the least-used **Surface**, but a hang is a hang |
| **Slice** | 8 |
| **Mitigation** | Route every scan through an index when the pattern binds a subject or an object; only the fully-unbound case may sweep. Keep the solution cap at 200,000 and report it honestly rather than truncating silently. Instrument the scan path with a counter and assert in tests that a bound pattern does not sweep. Evaluate patterns in the order given rather than re-ordering them, so that latency is predictable and explicable to the user; if join re-ordering is added later, it MUST be added with its own tests |

### 5.5 The cost of keeping two themes independently audited

| | |
|---|---|
| **Risk** | Light and dark drift apart: a value is added to one theme and not the other, or a colour is hard-coded in a view and only ever looked at in one theme. The cost is not in the first audit but in every audit thereafter |
| **Likelihood** | High |
| **Impact** | Medium — a single unthemed element is a small defect, but it is the kind that accumulates until the product looks unfinished in whichever theme the team uses less |
| **Slice** | 2, guarded permanently from 10 |
| **Mitigation** | Make the two theme value sets share one key set, and assert equality of the key sets in a test. Forbid literal visual values outside the token definitions and assert it in a test. Run the contrast audit over token pairs automatically in the build rather than by inspection. Render the visual reference in both themes and review both, every time, so that neither theme is ever the one nobody looks at |

### 5.6 Further risks

| Risk | Likelihood | Impact | Slice | Mitigation |
|---|---|---|---|---|
| Fixture transcription error — a wrong topping, a wrong price, a wrong disjointness assertion — silently invalidating every downstream number | Medium | High | 1 | Generate the fixture tables from this suite mechanically where possible; assert all 60 checks of `FIX-102`; treat a fixture test failure as a build-stopping defect |
| Generator non-determinism from using a platform random source or a signed 32-bit state | Medium | High | 1 | Implement the generator exactly as specified and verify against the golden values before anything downstream is built |
| **Hidden neighbour** arithmetic drifting when the adjacency cap truncates | Medium | Medium | 4 | Keep the capped list and the uncapped total as two separate values from the start; assert their relationship in the **Viewport** fuzz test |
| Eviction thrash — nodes evicted and re-admitted repeatedly during expansion | Medium | Medium | 4 | Assert in the fuzz test that a single expansion never evicts a node it then re-admits |
| Framework choice proving unable to meet the graph frame budget, discovered late | Low | High | 4 | The slice-four spike exists precisely to discover this early; the decision point is at the end of slice 4, not later |
| Accessibility deferred to slice 10 and then found to require structural change | Medium | High | 2, enforced throughout | Make keyboard operability and accessible naming exit criteria of every slice that adds a control, not of slice 10 alone; slice 10 verifies, it does not retrofit |
| Installer, signing and release engineering treated as an afterthought | Medium | Medium | 11 | Schedule slice 11 explicitly; the suite records this area as unspecified, which is a decision to be made deliberately rather than skipped |
| Scope creep into a reasoner, file formats, or a general axiom editor | Medium | High | all | These are recorded non-goals; a request for one is a scope change, not a task |

---

## 6. Sequencing guidance

### 6.1 What may be built in parallel

**IMP-17** After slice 4 is complete, slices 5 and 7 MAY proceed in parallel, on separate branches, by separate people. They touch different **Surfaces** and share only the **Store** and the token set, both of which are frozen by then.

**IMP-18** Within slice 1, the **TBox** transcription and the **ABox** generator MAY be built in parallel, because the generator depends on the named pizza list and the base price table only.

**IMP-19** Within slice 2, the token definitions and the shell layout MAY be built in parallel, provided the token names are agreed first.

**IMP-20** Slice 8 MAY begin before slice 7 is complete, provided the virtualised grid from slice 7 is available in at least a working form, since the console reuses it for results.

**IMP-21** Documentation, the visual reference and the test harness MAY be built alongside any slice.

### 6.2 What MUST NOT be built in parallel

**IMP-22** Slices 5 and 6 MUST NOT proceed in parallel. Rendering polish is judged against laid-out coordinates; polishing against coordinates that are about to change wastes the work and, worse, hides layout defects behind rendering fixes.

**IMP-23** Slice 9 MUST NOT begin before slice 6 is complete. Export renders the same scene through the same pipeline; building it against an unfinished pipeline guarantees two pipelines and two sets of defects.

**IMP-24** Slice 4 MUST NOT begin before slice 3 is complete. The tree is what seeds the **Viewport**; a graph built without its seeding path is a graph tested only against synthetic input.

**IMP-25** No slice MUST begin before slice 1 is complete. Every other slice is a projection of the **Store**, and a **Store** that changes shape under them invalidates all of them at once.

**IMP-26** Performance work MUST NOT be deferred to slice 10 alone. Slice 10 verifies and records; the budget for each **Surface** MUST be measured in the slice that builds it, because a structural performance defect found in slice 10 is a redesign, not a fix.

**IMP-27** Accessibility MUST NOT be deferred to slice 10 alone, for the same reason and with the same consequence.

### 6.3 Ordering within a slice

**IMP-28** Within a slice, tasks MUST be executed in the order given. The orders in [§3](#3-the-slices) are not arbitrary: each puts the thing that can invalidate the rest first. The generator is verified before anything reads it; the adjacency cap is built before the **Hidden neighbour** count that depends on it; layout determinism is established before rendering is judged against it.

---

## 7. Definition of done

**IMP-29** Axiom is done when all of the following are true. Every item is objectively checkable; none rests on a judgement.

| # | Condition |
|---|---|
| D1 | Every numbered requirement in the suite is either implemented, or marked `**Status:** specified, not implemented in the reference build.` and recorded as out of scope for this release |
| D2 | Every check in `FIX-102` passes |
| D3 | Every acceptance criterion in [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) passes |
| D4 | Every performance budget in [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) is met on the P5 machine, with the measurement recorded and dated |
| D5 | Every accessibility test in the matrix of [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md) passes, in both themes |
| D6 | Every regression guard is an automated test running in the continuous build |
| D7 | The four **Surfaces** are each fully operable by keyboard alone |
| D8 | Both themes pass the contrast audit, and the two theme value sets have identical key sets |
| D9 | No view contains a literal visual value outside the token definitions |
| D10 | The product runs with no network access and writes no file except when the user exports one |
| D11 | The `pizza:` **TBox** and the `demo:` **ABox** are distinguishable on every **Surface**, in every export and in every query result |
| D12 | Every user-facing string matches the copy specified in the owning document |
| D13 | A clean Windows 11 machine installs and runs the signed package offline |
| D14 | The full test suite runs in the continuous build on every push, and is green |
| D15 | No slice has an unmet exit criterion |

**IMP-30** D1 MUST be satisfied by an explicit traceability list, not by assertion. An implementation that cannot name where each requirement is implemented has not satisfied it.

---

## Appendix A — Native stack mapping (non-normative)

Advisory only. The normative body above is framework-neutral, and a conformant implementation may meet every requirement by other means. This appendix describes one concrete way to do it, on WinUI 3.

### A.1 Solution structure

A five-project solution keeps the fixture and the domain testable without a UI thread, which is what makes slice one's exit criteria cheap to run.

| Project | Type | Contains | References |
|---|---|---|---|
| `Axiom.Core` | Class library, no UI | The **Store**, entity records, the restriction normal form, the indexes, the counting functions, the adjacency function, the **Viewport** and **Budget** logic, the four layout algorithms, the query tokeniser, parser and evaluator | none |
| `Axiom.Fixture` | Class library, no UI | The transcribed `pizza:` **TBox** tables, the `demo:` vocabulary, the pseudo-random generator and the **ABox** generator | `Axiom.Core` |
| `Axiom.App` | WinUI 3 packaged application | Views, view models, the token resource dictionaries, the graph drawing surface, the virtualised grid, the export pipeline | `Axiom.Core`, `Axiom.Fixture` |
| `Axiom.Tests` | Unit test project | Fixture verification, **Store** and index tests, **Viewport** fuzz tests, layout determinism and overlap assertions, parser and evaluator tests, validation message tests | `Axiom.Core`, `Axiom.Fixture` |
| `Axiom.UiTests` | UI automation test project | Keyboard traversal, accessibility scans, theme switching, end-to-end **Surface** journeys | `Axiom.App` |

`Axiom.Core` and `Axiom.Fixture` MUST NOT reference any UI assembly. That constraint is what allows the whole of slice one, and most of slices 4, 5, 7 and 8, to be tested headlessly in under a second.

### A.2 Package dependencies

| Package | Purpose | Notes |
|---|---|---|
| `Microsoft.WindowsAppSDK` | WinUI 3 application framework | Pins the Windows App SDK version; keep it current within a release train, not across one |
| `Microsoft.Windows.SDK.BuildTools` | Build tooling for the packaged app | Version-matched to the App SDK |
| `Microsoft.Extensions.DependencyInjection` | Composition of view models and services | Optional; hand-rolled composition is defensible at this size |
| `CommunityToolkit.Mvvm` | Observable objects and commands | Reduces boilerplate; nothing in the suite requires it |
| `Win2D.uwp` / `Microsoft.Graphics.Win2D` | Immediate-mode drawing for the graph and the export pipeline | This is the one dependency worth arguing about; see A.3 |
| `xunit`, `xunit.runner.visualstudio` | Unit testing | Any equivalent is fine |
| `FluentAssertions` | Readable assertions over the fixture tables | Optional |
| `BenchmarkDotNet` | The performance harness of slice 10 | Use it for computation budgets; use frame instrumentation for frame budgets |
| `Microsoft.Windows.Apps.Test` / WinAppDriver | UI automation for `Axiom.UiTests` | Whichever the team can keep green |
| `Axe.Windows` | Automated accessibility scanning | Supports E10.2 |

### A.3 The graph surface

Draw the graph with Win2D onto a single `CanvasControl`, in immediate mode, on every frame. Do not create one XAML element per node: at the 3,000-node **Budget** ceiling that is 3,000 elements plus their edges, each with layout, hit testing and accessibility overhead, and it will not hold the frame budget.

Consequences to plan for:

- Hit testing is yours. Keep a spatial hash over node positions and query it on pointer move; the label collision pass already needs one, so build it once and use it twice.
- Accessibility is yours. A single drawing surface exposes nothing by default, so an automation peer that exposes the **Viewport** nodes as a navigable collection is required work in slice 10, not a nicety. Budget for it.
- The export pipeline of slice 9 renders the same scene to a `CanvasRenderTarget` at an arbitrary scale, which is why export is cheap if and only if the scene rendering is a pure function of the **Viewport**, the palette and a view transform. Keep it that way from slice 4.

### A.4 The virtualised grid

`ItemsRepeater` with a `StackLayout` and element recycling is the right starting point, over an `IList` of row indices rather than of records. `ListView` is acceptable but harder to hold to a constant realised-element count. A fixed row height of 32 device-independent units makes scroll offset pure arithmetic, which is what E7.1 and E7.2 both depend on.

### A.5 Build and packaging outline

1. `dotnet build` for `Axiom.Core`, `Axiom.Fixture` and `Axiom.Tests`; these must build and test on a machine with no Windows App SDK workload.
2. `msbuild` for `Axiom.App` with the platform set explicitly to `x64` and `arm64`; `AnyCPU` is not meaningful for a packaged WinUI 3 application.
3. Produce an MSIX package per architecture, plus a bundle.
4. Sign the bundle with the release certificate. A self-signed certificate is acceptable for internal builds and MUST NOT be used for release.
5. Run `Axiom.UiTests` against the installed package, not against a loose build, so that packaging identity problems are caught before release rather than after.
6. Publish the bundle, the release notes and the recorded performance measurements together. The measurements are part of the release: D4 is not satisfiable retrospectively.
