# Axiom — Acceptance Criteria and Tests

**Purpose:** This document is the conformance suite for Axiom: every criterion that MUST be demonstrably true before the product is done, stated so that it can be checked objectively, with the concrete test cases, performance budgets, accessibility matrix, data integrity checks and regression guards that prove it.

**Status:** Normative

**Requirement ID prefixes owned:** `ACC`

---

## 1. Verification approach

### 1.1 The objectivity rule

**ACC-1** Every acceptance criterion in this suite MUST be objectively checkable. A criterion is objectively checkable when two competent engineers, given the same build and the same fixture, independently reach the same verdict without discussion.

**ACC-2** A criterion that rests on subjective visual judgement MUST be restated as a measurable property or removed. There is no third option, and in particular there is no "reviewer satisfaction" criterion anywhere in this suite.

Worked examples of the restatement, because this is the rule most often paid lip service:

| Rejected phrasing | Restated as |
|---|---|
| "The graph looks uncluttered" | No two node centres are closer than the sum of their radii, asserted over the laid-out coordinates |
| "Labels are legible" | No two drawn label rectangles intersect, and at most 900 labels are drawn per frame |
| "The table feels smooth" | 95th-percentile frame time during a programmatic fling scroll of 100,000 rows is at or below 16.7 ms |
| "The dark theme is readable" | Every foreground-on-background token pair meets its contrast threshold, measured by an automated checker |
| "Queries are fast" | Each of the seven worked examples completes within its stated budget at each of the four dataset sizes |
| "Eviction picks sensible nodes" | Eviction follows the documented total ordering, asserted against an independently computed expected order |

**ACC-3** Where a criterion in this document names a figure — a count, a duration, a threshold — that figure MUST be asserted exactly. "Approximately", "around" and "roughly" MUST NOT appear in an assertion.

### 1.2 What is checked by which means

**ACC-4** Every criterion MUST declare its verification means, and the means MUST be the cheapest one that can actually establish the criterion.

| Means | What it covers | Why |
|---|---|---|
| **Unit test** | The fixture; the **Store** and its indexes; the counting functions; the adjacency function and its cap; **Viewport** admission and **Eviction**; all four layout algorithms and the `auto` selector; label placement geometry; the tokeniser, parser and evaluator; every validation rule and its message text; the export caption string; theme key-set equality | These are pure functions of data. They need no window, run in milliseconds, and can be exhaustive. Anything testable this way MUST be tested this way |
| **Integration test** | Surface-to-surface flows: tree selection seeding the **Viewport**; a table edit appearing in the inspector and in the next query result; send-to-graph from the table and from the console; regeneration invalidating every derived structure; theme switching refreshing the renderer palette | These cross ownership boundaries, which is exactly where the defects live |
| **UI automation test** | Keyboard traversal of every **Surface**; focus visibility; accessible names and roles; dialog and menu focus behaviour; font scaling; the accessibility scan | These need a real window and a real automation tree |
| **Performance harness** | Every budget in [§14](#14-performance-budgets) | Timing must be measured on the target machine under controlled conditions, not asserted in a unit test |
| **Manual inspection** | Only: that the rendered picture corresponds to what the automated geometry assertions claim; that user-facing copy reads as intended in context; that an export opens correctly in third-party software | This list is deliberately short. Manual inspection confirms; it never decides |

**ACC-5** Manual inspection MUST NOT be the sole means of verification for any criterion in this document. Every manual check MUST have an automated check standing behind it that would fail first.

**ACC-6** A test MUST use the fixture of [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md) at a stated size. A test against synthetic data MUST state why the fixture could not serve, and MUST be additional to, never instead of, a fixture-based test.

**ACC-7** Every test MUST be deterministic. A test that depends on wall-clock time, on system locale, on display scaling, or on a platform random source MUST either control that input or be rewritten. The fixture generator is deterministic by `FIX-58`; there is no excuse for a non-deterministic data-driven test.

### 1.3 Traceability

**ACC-8** Every criterion table in [§2](#2-acceptance-criteria-store-and-fixture) to [§12](#12-acceptance-criteria-accessibility) MUST carry, for each row, the requirement it verifies, identified by the owning document's prefix.

**ACC-9** Every criterion below MUST cite the exact `<PREFIX>-<n>` ID of the requirement it verifies, and the citation MUST have been checked against the text of that requirement in its owning document. A criterion pointing at a behaviour name rather than an ID is an incomplete criterion, not a finished one. Where a criterion verifies a contract that its original prefix did not own — the accessibility criteria of [§13](#13-accessibility-test-matrix) among them, which verify the accessibility contract held by [`40-design-system.md`](40-design-system.md) and [`41-component-library.md`](41-component-library.md) rather than by [`00-product-overview.md`](00-product-overview.md) — the prefix MUST be corrected to the owning document rather than the ID forced into the wrong one.

**ACC-10** Every numbered requirement in the suite MUST be verified by at least one criterion in this document, or MUST be explicitly recorded as unverifiable with the reason. An unverified requirement is not a requirement; it is a hope.

---

## 2. Acceptance criteria: Store and fixture

**ACC-11** The following criteria MUST pass before any other section of this document is attempted. A fixture defect invalidates every measurement taken on it.

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-S01 | `FIX-24` | Count the entries in the transcribed class table | 70 |
| AC-S02 | `FIX-27` | Count the named pizza classes | 22 |
| AC-S03 | `FIX-33` | Count the `pizza:` object properties | 8 |
| AC-S04 | `FIX-48`, `FIX-50` | Count the `demo:` data properties and object properties | 5 data, 1 object |
| AC-S05 | `FIX-46` | Count the `demo:` classes | 2 |
| AC-S06 | `FIX-39` | Count the `pizza:` country **Individuals** | 5 |
| AC-S07 | `FIX-52` | Count entities in the **Store** after the **TBox** stage | 114 |
| AC-S08 | `FIX-55` | Count **TBox** triples and group by predicate | 239 total; 111 `rdf:type`, 94 `rdfs:subClassOf`, 8 `owl:disjointWith`, 8 `rdfs:range`, 7 `rdfs:comment`, 7 `rdfs:domain`, 4 `rdfs:subPropertyOf` |
| AC-S09 | `FIX-57` | Call the class counting function | 95 |
| AC-S10 | `FIX-57` | Call the property counting function | 14 |
| AC-S11 | `FIX-57` | Count defined classes | 11 |
| AC-S12 | `FIX-28`, `FIX-29`, `FIX-30`, `FIX-31` | Sum the restriction lists of all 22 named pizzas | 147 = 103 + 22 + 22 |
| AC-S13 | `FIX-31` | Inspect the restriction list of `pizza:Margherita` | 4 entries, in order: two `hasTopping some`, one `hasTopping only (…)`, one `hasCountryOfOrigin value pizza:Italy` |
| AC-S14 | `FIX-31` | Inspect the restriction list of `pizza:Cajun` | 9 entries in the same pattern, with 7 existentials |
| AC-S15 | `FIX-32` | Collect every topping referenced by any named pizza and check each is a declared class | 33 distinct toppings, 0 undeclared |
| AC-S16 | `FIX-21` | Render every restriction in the **Store** to text | Every output matches the table of `FIX-21`; `pizza:Pizza`'s second restriction renders exactly `pizza:hasCountryOfOrigin max 1` |
| AC-S17 | `FIX-100` | Count the flattened restriction index | 140 |
| AC-S18 | `FIX-61`, `FIX-73` | Generate at `n` = 12,000 twice and compare records field for field | Identical |
| AC-S19 | `FIX-73` | Read the first order at `n` = 12,000 | `demo:Pizza_000001`, type `pizza:Rosa`, reference `AX-100000`, branch Shoreditch, price 10.86, rating 3, customer index 640 |
| AC-S20 | `FIX-76` | Read the first customer at any size | `demo:Customer_000001`, name Nadia Duarte |
| AC-S21 | `FIX-74` | Read the customer count at each of the four sizes | 125, 1,500, 6,250, 12,500 |
| AC-S22 | `FIX-77` | Read the first and last order IRIs at each size | `demo:Pizza_000001` and `demo:Pizza_001000` / `_012000` / `_050000` / `_100000` |
| AC-S23 | `FIX-78` | Read the order reference of the first and last order at `n` = 12,000 | `AX-100000` and `AX-111999` |
| AC-S24 | `FIX-80` | Find the minimum and maximum price at `n` = 12,000 | 7.50 and 16.00, all values at two decimal places |
| AC-S25 | `FIX-81` | Find the minimum and maximum timestamp at `n` = 12,000 | Within 2026-08-01T00:00:00Z to 2026-08-30T23:59:59Z, every millisecond component zero |
| AC-S26 | `FIX-82` | Tabulate the rating distribution at `n` = 12,000 | 485 / 492 / 4,001 / 3,567 / 3,455 for ratings 1 to 5 |
| AC-S27 | `FIX-82` | Check the rating range across all four sizes | Every rating an integer in [1, 5] |
| AC-S28 | `FIX-92` | Read the reported triple count at each size | 7,489 / 87,239 / 362,739 / 725,239 |
| AC-S29 | `FIX-96` | Read the reported individual count at each size | 1,130 / 13,505 / 56,255 / 112,505 |
| AC-S30 | `FIX-84` | Sum the type bucket sizes at `n` = 12,000 and compare with the order count | Equal, at 12,000, with no order in two buckets |
| AC-S31 | `FIX-10` | Check every entity's namespace marker against its IRI prefix | Every marker correct; no entity mismarked |
| AC-S32 | `FIX-13` | Check the namespace of every generated order IRI and of its type IRI | Order IRI `demo:`, type IRI `pizza:`, for all `n` |
| AC-S33 | `FIX-16` | Count **Entity** objects after generating 100,000 orders | Still 114; no order or customer materialised as an **Entity** |
| AC-S34 | `FIX-54` | Check every child list for sort order by local name | Sorted at every level |
| AC-S35 | `FIX-53` | Check every child list for duplicates | None |
| AC-S36 | `FIX-89` | Compare each dataset menu label's triple figure with the value the counting function returns for that size | Equal for all four; the reference build's `~8K` / `~92K` / `~383K` / `~766K` labels MUST NOT appear |
| AC-S37 | `FIX-88` | Read the dataset size at start-up | 12,000 |
| AC-S38 | `FIX-26` | Look up `pizza:CheeseyVegetableTopping` | Present, defined, with `pizza:CheeseTopping` and `pizza:VegetableTopping` as its equivalence conjuncts, not repaired and not hidden |
| AC-S39 | `FIX-43` | Look for an `owl:oneOf` axiom on `pizza:Country` | None |
| AC-S40 | `FIX-86` | Regenerate and inspect every derived structure | Customer reverse index, **Viewport** node and edge sets, **Focus set**, table filter state and type filter options all rebuilt or cleared |

---

## 3. Acceptance criteria: Viewport and Budget

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-V01 | `VP-1` "**Budget** ceiling" | After every operation in a 10,000-step fuzz test of admissions, expansions, collapses, pins and **Budget** changes, compare the node count with the **Budget** | Node count never exceeds the **Budget**, except in the all-exempt case of AC-V11 |
| AC-V02 | `VP-31` "adjacency cap" | Call the adjacency function for `pizza:Margherita` at `n` = 100,000, where its type bucket holds 4,550 orders | The returned list has at most 4,000 entries; the returned total is the true uncapped degree, 4,550 plus its **TBox** neighbours, and is greater than 4,000 |
| AC-V03 | `VP-103` "**Hidden neighbour** count" | For every node in the **Viewport**, compute degree minus shown degree | Never negative; equals the per-node **Hidden neighbour** figure displayed |
| AC-V04 | `VP-104` "held-back total" | Sum the per-node **Hidden neighbour** counts and compare with the **Budget** panel's held-back figure | Equal, after every fuzz-test step |
| AC-V05 | `VP-112` "held-back total" | Sum the `+n` badges drawn on screen and compare with the held-back figure, for nodes whose badges are visible | Equal for the visible subset |
| AC-V06 | `VP-53` "**Eviction** exemptions" | Across the fuzz test, record every evicted node and check it against the **Pin** set and the **Focus set** | No pinned node and no **Focus set** member is ever evicted |
| AC-V07 | `VP-58` "**Eviction** ordering" | With a known **Viewport**, compute the expected eviction order independently and compare | Ordering is by descending distance from the **Focus set**, then ascending shown degree, then ascending last-touched |
| AC-V08 | `VP-59` "least-recently-used mode" | Switch the overflow policy to least-recently-used and repeat AC-V07 | Ordering is by ascending last-touched alone |
| AC-V09 | `VP-60` "refusal mode" | Switch the overflow policy to refusal, then admit more nodes than there is room for | Nothing is evicted; the report's refused count equals the overflow exactly |
| AC-V10 | `VP-120` "**Budget** reduction" | With 3,000 nodes in view and none pinned or focused, set the **Budget** to 100 | Exactly 100 nodes remain; the message states 2,900 paged out |
| AC-V11 | `VP-122` "**Budget** reduction" | With every node pinned or in the **Focus set**, lower the **Budget** below the node count | No exempt node is evicted; the **Viewport** remains above **Budget**; the product reports the overage rather than silently exceeding it |
| AC-V12 | `VP-49` "admission report" | Admit a set larger than the remaining room | The report's added, evicted and refused figures sum consistently with the before-and-after node counts |
| AC-V13 | `VP-51` "evicted names" | Trigger an eviction of more than three nodes | The report carries exactly three example labels and the message marks that more followed |
| AC-V14 | `VP-69` "expansion cap" | Expand a node with a per-expansion cap smaller than its degree | At most the cap is admitted; the node is not marked fully expanded |
| AC-V15 | `VP-72` "expansion completeness flag" | Expand a node whose whole neighbourhood fits | The node is marked fully expanded |
| AC-V16 | `VP-79` "collapse" | Collapse a node with a mixture of leaf, pinned, focused and multiply-connected neighbours | Only unpinned, unfocused neighbours with a shown degree of one are removed |
| AC-V17 | `VP-88` "seeding" | Seed from a single class | The **Viewport** is replaced, the **Focus set** contains exactly the seeds, and the first twelve seeds are expanded with a per-seed share of the **Budget** |
| AC-V18 | `VP-45` "revision counter" | Perform each structural operation in turn | The revision counter increases on every one, and the layout is recomputed as a result |
| AC-V19 | `VP-21` "edge consistency" | After every fuzz-test step, check every edge's endpoints against the node set | Every edge has both endpoints in the **Viewport** |
| AC-V20 | `VP-26` "shown degree" | After every fuzz-test step, recompute each node's shown degree from the edge set | Equals the maintained value |
| AC-V21 | `VP-42` "no thrash" | During a single expansion, record admissions and evictions | No node is evicted and then re-admitted within the same expansion |
| AC-V22 | `VP-116` "**Budget** control range" | Read the **Budget** control's bounds and step | Minimum 100, maximum 3,000, step 100, default 1,000 |
| AC-V23 | `VP-118` "occupancy meter" | Fill the **Viewport** to 74, 75, 97 and 98 per cent of the **Budget** | The meter enters its near state at 75 and its full state at 98 |
| AC-V24 | `VP-186` "status honesty" | Compare the status bar's in-view figures with the **Viewport** state | In-view nodes equals the node count; in-view relationships equals the edge count |

---

## 4. Acceptance criteria: the force layout

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-LF01 | `LAY-228` "force determinism" | Run the force layout twice from the same **Viewport** and revision, settling both | Identical coordinates to the last representable digit |
| AC-LF02 | `LAY-98` "no overlap" | After settling, compare every node pair | No two centres closer than the sum of their radii |
| AC-LF03 | `LAY-104` "seed placement" | Admit 240 nodes from one seed and inspect initial positions before the first tick | Positions follow the golden-angle spiral around the seed; no two initial positions coincide |
| AC-LF04 | `LAY-91` "bounded motion" | Settle, then measure total kinetic energy per tick | Monotonically non-increasing after the settling threshold; the simulation reaches rest |
| AC-LF05 | `LAY-26` "freeze" | Freeze the simulation and record coordinates over 60 frames | Unchanged |
| AC-LF06 | `LAY-112` "resume" | Resume the simulation | Motion restarts from the frozen coordinates, not from a reset |
| AC-LF07 | `LAY-64` "approximation" | Instrument the force computation at 3,000 nodes | Pairwise force evaluations grow as `n log n`, not as `n²` |
| AC-LF08 | `LAY-79` "degree weighting" | Lay out a star of one high-degree node and 50 leaves | The high-degree node settles closer to the centroid than any leaf |
| AC-LF09 | `LAY-117` "settle time" | Measure time to settle at the **Budget** ceiling | Within the budget of [§14](#14-performance-budgets) |

---

## 5. Acceptance criteria: the hierarchy layout

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-LH01 | `LAY-228` "hierarchy determinism" | Run twice from the same **Viewport** | Identical coordinates |
| AC-LH02 | `LAY-126` "layer assignment" | For every subclass and sub-property edge, compare the layer indices of its endpoints | The child's layer is strictly greater than the parent's |
| AC-LH03 | `LAY-127` "longest path" | For a known hierarchy, compare assigned layers with an independently computed longest-path assignment | Equal |
| AC-LH04 | `LAY-163` "no overlap" | Compare every node pair | No two centres closer than the sum of their radii |
| AC-LH05 | `LAY-138` "crossing reduction" | Count edge crossings before and after the ordering pass on a known graph | Strictly fewer after; the count matches an independently computed median-heuristic result |
| AC-LH06 | `LAY-150` "layer separation" | Measure the coordinate gap between adjacent layers | Constant and equal to the specified separation |
| AC-LH07 | `LAY-156` "within-layer separation" | Measure the gap between adjacent nodes in a layer | At least the specified minimum for every pair |
| AC-LH08 | `LAY-162` "centring" | Compute the bounding box centre after layout | At the origin |
| AC-LH09 | `LAY-165` "computation time" | Measure at the **Budget** ceiling | Within the budget of [§14](#14-performance-budgets) |

---

## 6. Acceptance criteria: the radial layout

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-LR01 | `LAY-228` "radial determinism" | Run twice from the same **Viewport** | Identical coordinates |
| AC-LR02 | `LAY-180` "ring assignment" | Compare each node's radius with its breadth-first depth from the **Focus set** | Every node lies on the ring for its depth, to within floating-point tolerance |
| AC-LR03 | `LAY-183` "ring ordering" | Compare consecutive ring radii | Strictly increasing |
| AC-LR04 | `LAY-181` "circumference sizing" | For each ring, compare its circumference with the sum of its nodes' diameters plus the specified separation | Circumference is at least the required sum |
| AC-LR05 | `LAY-179` "wedge proportionality" | For each subtree, compare its angular extent with its leaf count as a fraction of the total | Proportional, to within floating-point tolerance |
| AC-LR06 | `LAY-193` "no overlap" | Compare every node pair | No two centres closer than the sum of their radii |
| AC-LR07 | `LAY-195` "ring guides" | Read the recorded ring radii and origin used for rendering | One entry per occupied ring; origin matches the **Focus set** centroid |
| AC-LR08 | `LAY-190` "no crossings within a subtree" | For each subtree, check that its nodes occupy a contiguous angular range | Contiguous, with no interleaving between sibling subtrees |
| AC-LR09 | `LAY-200` "computation time" | Measure at the **Budget** ceiling | Within the budget of [§14](#14-performance-budgets) |

---

## 7. Acceptance criteria: the grid layout

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-LG01 | `LAY-228` "grid determinism" | Run twice from the same **Viewport** | Identical coordinates |
| AC-LG02 | `LAY-202` "clustering" | For each node, compare its group block with its type | Every node is inside the block for its type, and inside exactly one block |
| AC-LG03 | `LAY-213` "block separation" | Compare every block pair | No two blocks overlap |
| AC-LG04 | `LAY-216` "alignment" | Within a block, compare node coordinates with the block's grid pitch | Every node sits on a grid intersection |
| AC-LG05 | `LAY-219` "no overlap" | Compare every node pair | No two centres closer than the sum of their radii |
| AC-LG06 | `LAY-210` "block sizing" | Compare each block's dimensions with its node count and pitch | Block is the smallest that fits its nodes at the specified pitch |
| AC-LG07 | `LAY-23` "stability" | Lay out 1,000 individuals of one class, then 1,000 of two classes | The single-class case is one block; the two-class case is two non-overlapping blocks |
| AC-LG08 | `LAY-226` "computation time" | Measure at the **Budget** ceiling | Within the budget of [§14](#14-performance-budgets) |

---

## 8. Acceptance criteria: the auto selector

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-LA01 | `LAY-7` "`auto` grid by type ratio" | 350 nodes, 400 edges, 240 of them `rdf:type` (60 per cent) | Selects `grid` |
| AC-LA02 | `LAY-7` "`auto` grid by size" | 600 nodes with a low type-edge ratio | Selects `grid` |
| AC-LA03 | `LAY-7` "`auto` hierarchy" | 200 nodes, 150 edges, 120 of them hierarchical (80 per cent) | Selects `hierarchy` |
| AC-LA04 | `LAY-7` "`auto` radial" | 60 nodes, a **Focus set** of one, a low hierarchical ratio | Selects `radial` |
| AC-LA05 | `LAY-7` "`auto` force" | 20 nodes, a **Focus set** of three, a low hierarchical ratio | Selects `force` |
| AC-LA06 | `LAY-7` "`auto` empty" | An empty **Viewport** | Selects `force` and computes nothing |
| AC-LA07 | `LAY-10` "`auto` thresholds are exclusive" | Drive each threshold to one step either side of its boundary | The selection flips at exactly the documented boundary and nowhere else |
| AC-LA08 | `LAY-6` "explicit choice wins" | Choose each **Layout mode** explicitly on a **Viewport** that `auto` would resolve differently | The explicit choice is used, and the status bar does not mark it `(auto)` |
| AC-LA09 | `LAY-3` "status naming" | With `auto` chosen, read the status bar | Names the resolved **Layout mode** followed by `(auto)` |
| AC-LA10 | `LAY-27` "freeze availability" | With each **Layout mode** resolved in turn, read the freeze control | Enabled only for `force`; otherwise disabled with the explanatory tooltip |

---

## 9. Acceptance criteria: rendering and labels

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-R01 | `REN-142` "label collision" | Compute the label placement at 100, 500, 1,000 and 3,000 nodes in each of the four layouts and compare every pair of retained rectangles | No two intersect, in all sixteen combinations |
| AC-R02 | `REN-107` "label priority" | Construct two nodes whose labels must collide, one in the **Focus set** and one not | The **Focus set** member's label is retained and the other is dropped |
| AC-R03 | `REN-106` "label priority order" | Repeat AC-R02 for each adjacent pair in the priority order: **Focus set**, selection, hover, **Pin**, radius, shown degree | The higher-priority label is retained in every pair |
| AC-R04 | `REN-108` "selection label" | Select a node and place labels | The selected node's label is retained whenever the node is on screen |
| AC-R05 | `REN-134` "label cap" | Place labels with 3,000 nodes on screen | At most 900 retained |
| AC-R06 | `REN-124` "off-screen skip" | Place labels with the view panned so that most nodes are outside the visible area | No label is computed for a node beyond the documented margin |
| AC-R07 | `REN-131` "truncation" | Render a node whose label exceeds 30 characters | Truncated to 28 characters followed by an ellipsis |
| AC-R08 | `REN-64` "node shapes" | Render one node of each kind | Rectangle for class, rectangle in the defined-class colour for defined class, circle for **Individual**, diamond for object property, hexagon for data property |
| AC-R09 | `REN-34` "node colours" | Sample the fill of one node of each kind, in both themes | Matches the corresponding **Design token** exactly in both |
| AC-R10 | `REN-67` "node radius" | Compute the radius for a range of degrees and kinds | Matches the documented base-plus-logarithm formula |
| AC-R11 | `REN-77` "edge typing" | Render an `rdf:type` edge and a subclass edge | The type edge is dashed, the subclass edge solid |
| AC-R12 | `REN-85` "parallel edges" | Render two nodes joined by three different predicates | Three distinguishable routes, fanned apart, none overlapping another |
| AC-R13 | `REN-145` "hidden neighbour badge" | Render a node with hidden neighbours | A `+n` badge with `n` equal to the node's **Hidden neighbour** count |
| AC-R14 | `REN-96` "hover highlight" | Hover a node | The node and its immediate neighbours are highlighted; nothing else is |
| AC-R15 | `REN-57` "radial chrome" | Render in the radial **Layout mode** | Ring guides drawn at the recorded radii, centred on the recorded origin |
| AC-R16 | `REN-60` "grid chrome" | Render in the grid **Layout mode** | One block outline per group, matching the recorded blocks |
| AC-R17 | `REN-29` "palette refresh" | Switch theme and render the next frame | Every drawn colour comes from the new theme; none from the previous one |
| AC-R18 | `REN-171` "minimap" | Pan and zoom the main view | The minimap's viewport rectangle tracks the visible region in position and size |
| AC-R19 | `REN-219` "legend" | Read the legend | One entry per node kind, plus the **Pin** marker, plus the held-back explanation |
| AC-R20 | `REN-289` "frame budget" | Measure frame time at the **Budget** ceiling with labels enabled | Within the budget of [§14](#14-performance-budgets) |

---

## 10. Acceptance criteria: export

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-X01 | `REN-274` "export caption" | Compare the caption string with the live status bar and **Budget** panel at the moment of export | Resolved **Layout mode**, node count, relationship count, **Budget** and held-back count all match exactly |
| AC-X02 | `REN-212` "export caption format" | Read the caption | Layout name, node count, relationship count, **Budget**, held-back count and a British-format timestamp, in that order, separated by the documented delimiter |
| AC-X03 | `REN-204` "export chrome" | Measure the header and footer bands | 86 and 58 units respectively, each with its divider rule |
| AC-X04 | `REN-218` "export legend" | Inspect the footer | Every node kind drawn with its real shape and token colour, plus the edge-typing note |
| AC-X05 | `REN-195` "dimension guard" | Export a very large scene at the highest scale | Neither dimension exceeds 9,000 pixels; the scale was reduced rather than the scene clipped |
| AC-X06 | `REN-273` "export completeness" | Export a scene extending well beyond the visible area | Every **Viewport** node appears in the export, with the documented padding around the bounds |
| AC-X07 | `REN-135` "export label density" | Count labels in the export | Up to 4,000, and more than the on-screen cap when the scene warrants it |
| AC-X08 | `REN-256` "export label collision" | Compare every pair of label rectangles in the exported image | No two intersect, at both raster scales |
| AC-X09 | `REN-249` "vector export" | Open the vector export in an independent editor | Opens; text is text, not outlines; shapes are editable |
| AC-X10 | `REN-238` "clipboard export" | Copy and paste into a document | An image arrives at the documented scale |
| AC-X11 | `REN-226` "file naming" | Export in each **Layout mode** | Name contains the product stem, the resolved layout, the date and the time, in the documented format |
| AC-X12 | `REN-28` "theme fidelity" | Export in both themes | Header, footer, canvas and node colours all from the active theme |
| AC-X13 | `REN-190` "export empty" | Export with an empty **Viewport** | The operation is refused with an explanatory message, and no file is written |
| AC-X14 | `REN-216` "export time" | Measure at the **Budget** ceiling | Within the budget of [§14](#14-performance-budgets) |

---

## 11. Acceptance criteria: class tree, inspector, individuals table, console, design system

### 11.1 Class tree and inspector

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-T01 | `TREE-12` "tree completeness" | Expand the whole tree and count | 95 classes and 14 properties, matching `FIX-57` |
| AC-T02 | `TREE-38` "default expansion" | Read the expanded set at start-up | The root, `pizza:DomainConcept`, `pizza:Food`, `pizza:Pizza`, `pizza:PizzaTopping` |
| AC-T03 | `TREE-18` "child ordering" | Check every child list | Sorted by local name |
| AC-T04 | `TREE-34` "instance counts" | Read the count shown on `pizza:Margherita` at `n` = 12,000 | 543, matching the fixture's type distribution |
| AC-T05 | `TREE-32` "kind distinction" | Compare the presentation of a primitive and a defined class | Visibly distinct by icon and colour, both from **Design tokens** |
| AC-T06 | `TREE-50` "filter reveal" | Filter to a deep leaf | The leaf is visible with every ancestor expanded |
| AC-T07 | `TREE-49` "filter clearing" | Clear the filter | The expansion state returns to what it was before the filter |
| AC-T08 | `TREE-80` "keyboard" | Traverse with the arrow keys from the root to a leaf and back | Selection follows; the selected row is scrolled into view; no pointer needed |
| AC-T09 | `TREE-163` "inspector completeness" | Select each of the 114 entities in turn | Every applicable section rendered, no empty required section, no unresolved IRI |
| AC-T10 | `TREE-176` "axiom rendering" | Read the axioms of `pizza:RealItalianPizza` | Three equivalence conjuncts, rendered by `FIX-21` |
| AC-T11 | `TREE-212` "axiom links" | Click an IRI inside an axiom | Selection moves to that entity |
| AC-T12 | `TREE-202` "inferred region" | Read the inferred-axioms region | Present, labelled, and stating that it requires a reasoner that is out of scope |
| AC-T13 | `TREE-188` "customer note" | Select a customer **Individual** | A note states how many generated orders reference it, and the figure matches the customer index |
| AC-T14 | `TREE-106` "rename validation" | Attempt each invalid name | Each of the four rejection messages appears, verbatim, per [§13.9](#139-name-validation) |
| AC-T15 | `TREE-100` "rename effect" | Rename a class that is in the **Viewport** | The tree, the inspector and the graph node label all update |
| AC-T16 | `TREE-104` "rename undo" | Rename, then undo | The previous name is restored |
| AC-T17 | `TREE-70` "seeding" | Select a class and seed the graph | The **Viewport** is seeded from that class |

### 11.2 Individuals table

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-B01 | `TBL-12` "columns" | Read the header | Eight columns: individual, type, order reference, branch, price, rating, prepared, customer |
| AC-B02 | `TBL-2` "virtualisation" | Count realised row elements at the top, the middle and the bottom of 100,000 rows | Constant, and proportional to the visible height, not to the row count |
| AC-B03 | `TBL-25` "row height" | Measure a row | 32 units, constant |
| AC-B04 | `TBL-27` "scroll arithmetic" | Scroll to a known offset and read the first rendered row index | Matches the documented arithmetic including the overscan |
| AC-B05 | `TBL-60` "sorting" | Sort each column ascending and descending | Matches an independently sorted reference for all eight, both directions |
| AC-B06 | `TBL-43` "type filter" | Filter to `pizza:QuattroFormaggi` at `n` = 12,000 | 598 rows |
| AC-B07 | `TBL-45` "branch filter" | Filter to Shoreditch at `n` = 12,000 | 2,001 rows |
| AC-B08 | `TBL-41` "combined filter" | Filter to Shoreditch and `pizza:Margherita` | The intersection, matching an independently computed count |
| AC-B09 | `TBL-134` "filter options" | Read the type filter | One option per type bucket, each with its count; plus an all-types option carrying the total |
| AC-B10 | `TBL-4` "honest counts" | Read the row count display with a filter applied | States both the filtered figure and the store figure |
| AC-B11 | `TBL-100` "cell validation" | Attempt each invalid cell value | Each message appears verbatim, per [§13.10](#1310-cell-validation) |
| AC-B12 | `TBL-86` "validation timing" | Type an invalid value without leaving the cell | No error appears until blur or Enter |
| AC-B13 | `TBL-88` "escape reverts" | Edit a cell and press Escape | The original value is restored and no undo entry is recorded |
| AC-B14 | `TBL-94` "rejected edit" | Commit an invalid value | The record is unchanged and the cell shows its error state, which clears on its own |
| AC-B15 | `TBL-90` "edit propagation" | Commit a valid edit | Visible in the inspector and in the next query result with no further action |
| AC-B16 | `TBL-92` "edit undo" | Commit an edit, then undo | The previous value is restored |
| AC-B17 | `TBL-89` "branch editor" | Open the branch editor | A closed list of exactly the six fixture branches |
| AC-B18 | `TBL-117` "send to graph" | Send 5,000 filtered rows with a **Budget** of 1,000 | At most 1,000 admitted; the message states both figures |
| AC-B19 | `TBL-128` "empty state" | Show the table with no individuals | The documented empty state, naming the control that generates data |
| AC-B20 | `TBL-76` "selection sync" | Select a row | The inspector shows that **Individual**; selecting in the tree or the graph updates the table selection |
| AC-B21 | `TBL-145` "add individual refusal" | Open the add dialog with no instantiable type | Refused with the documented message |
| AC-B22 | `TBL-168` "keyboard" | Operate the table by keyboard alone | Navigation, sorting, filtering, entering and leaving cell edit all reachable |

### 11.3 SPARQL console

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-Q01 | `SPQ-34` "tokeniser" | Tokenise a query containing every token class | Comments discarded; strings, variables, IRIs, prefixed names, numbers, punctuation, words and operators each classified correctly |
| AC-Q02 | `SPQ-9` "prefix declarations" | Declare a prefix and use it | Resolves; the six default prefixes remain available without declaration |
| AC-Q03 | `SPQ-136` "worked examples" | Run all seven worked examples at `n` = 12,000 | All parse and evaluate; each returns its documented row count |
| AC-Q04 | `SPQ-118` "parse errors" | Submit each malformed query of [§13.11](#1311-parser-errors) | Each produces its documented message and hint, verbatim |
| AC-Q05 | `SPQ-43` "unbound projection" | Select a variable never bound in the pattern block | Rejected with the documented message before evaluation begins |
| AC-Q06 | `SPQ-44` "wildcard projection" | Use the wildcard | Projects every variable bound anywhere in the pattern block |
| AC-Q07 | `SPQ-53` "flattened index" | Query `?p a pizza:NamedPizza . ?p pizza:hasTopping ?t` | 103 rows, from the flattened restriction index, at every dataset size. The unrestricted form `?p pizza:hasTopping ?t` returns 106, the extra three being the `pizza:CheesyPizza`, `pizza:MeatyPizza` and `pizza:SpicyPizza` equivalence conjuncts |
| AC-Q08 | `SPQ-54` "type scan by object" | Query `?o a pizza:Margherita` at `n` = 12,000 | 543 rows, via the type bucket index and not a full sweep |
| AC-Q09 | `SPQ-61` "scan by subject" | Query `pizza:Margherita ?p ?o` | Returns every assertion about that class; the scan counter shows no full **ABox** sweep |
| AC-Q10 | `SPQ-56` "data property scan" | Query `?o demo:branch "Shoreditch"` at `n` = 12,000 | 2,001 rows |
| AC-Q11 | `SPQ-99` "numeric filter" | Add `FILTER (?price > 13)` | Compares numerically, not lexically; a price of 9.00 is excluded and 13.50 included |
| AC-Q12 | `SPQ-86` "string filter" | Filter on a non-numeric value | Compares as strings |
| AC-Q13 | `SPQ-91` "distinct" | Run a query with and without `DISTINCT` | Duplicate rows removed only with `DISTINCT` |
| AC-Q14 | `SPQ-96` "order by" | Order ascending and descending on a numeric and a string variable | Numeric ordering for numbers, culture-aware string ordering otherwise |
| AC-Q15 | `SPQ-104` "limit and total" | Apply a limit smaller than the result set | The limited rows are returned; the reported total is the pre-limit figure and the summary marks that the limit was applied |
| AC-Q16 | `SPQ-79` "operation order" | Construct a query where `DISTINCT`, `ORDER BY` and `LIMIT` interact | Applied in that order; the result matches an independently computed reference |
| AC-Q17 | `SPQ-76` "solution cap" | Run a query whose intermediate result exceeds 200,000 solutions | Evaluation stops at the cap, returns, and the summary states that intermediate results were capped at 200,000 |
| AC-Q18 | `SPQ-152` "summary" | Read the summary after a successful run | Row count, elapsed milliseconds, the store triple count, and the distinct IRI count |
| AC-Q19 | `SPQ-163` "send to graph" | Send results to the graph with a **Budget** of 1,000 and more than 1,000 distinct IRIs | At most 1,000 admitted, reported honestly |
| AC-Q20 | `SPQ-157` "live store" | Edit a price in the table, then query for that price | The edited value is returned; no regeneration required |
| AC-Q21 | `SPQ-113` "evaluation time" | Measure each worked example at each of the four sizes | Within the budgets of [§14](#14-performance-budgets) |
| AC-Q22 | `SPQ-16` "unsupported grammar" | Submit `CONSTRUCT`, `ASK`, `OPTIONAL`, `UNION` and a property path | Each rejected with the documented message rather than misparsed |

### 11.4 Design system and theming

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-D01 | `DS-1` "token completeness" | Compare the key sets of the two theme value sets | Identical |
| AC-D02 | `DS-6` "no literals" | Scan every view for literal colour, font size, radius, duration and spacing values | None outside the token definitions |
| AC-D03 | `DS-7` "token coverage" | Compare the tokens defined in [`40-design-system.md`](40-design-system.md) with those present in the build | Every specified token present; no undocumented token added |
| AC-D04 | `DS-25` "contrast, light" | Measure every foreground-on-background token pair in the light theme | Every pair meets its threshold |
| AC-D05 | `DS-25` "contrast, dark" | Measure every foreground-on-background token pair in the dark theme | Every pair meets its threshold |
| AC-D06 | `DS-9` "theme switch" | Switch theme and inspect every visible element | Every themed value changes; nothing is left on the previous theme |
| AC-D07 | `DS-10` "renderer palette" | Switch theme and render the next frame | The graph palette is refreshed within one frame |
| AC-D08 | `DS-95` "theme control naming" | Read the theme control's accessible name in each theme | *Switch to dark theme* in light; *Switch to light theme* in dark |
| AC-D09 | `DS-60` "system preference" | Launch with the system set to dark | The product starts in dark |
| AC-D10 | `CMP-1` "component states" | Render every component in every documented state, in both themes | Every state distinguishable and matching the specification |
| AC-D11 | `DS-55` "motion tokens" | Measure each animated transition | Duration and easing match the motion tokens |
| AC-D12 | `DS-61` "reduced motion" | Enable reduced motion | Every duration is zero and the force simulation does not animate |

---

## 12. Acceptance criteria: accessibility

| ID | Verifies | Check | Expected result |
|---|---|---|---|
| AC-A01 | `OVR-6` "keyboard operability" | Operate the whole product with the keyboard alone, end to end | Every function reachable; no pointer-only path |
| AC-A02 | `DS-89` "focus visibility" | Tab through every focusable element in both themes | A visible focus indicator on every one, meeting its contrast threshold |
| AC-A03 | `DS-104` "focus order" | Tab through each **Surface** | Order follows the visual order; no trap; no unreachable element |
| AC-A04 | `DS-94` "accessible names" | Run an automated accessibility scan on each **Surface** | Zero violations; every interactive element named |
| AC-A05 | `DS-97` "roles" | Inspect the automation tree | Tree rows, grid cells, menu items, meters, tabs and dialogs each expose their correct role |
| AC-A06 | `DS-105` "graph accessibility" | Inspect the automation tree for the graph **Surface** | The **Viewport** exposes its nodes as a navigable collection with names, not as an opaque image |
| AC-A07 | `DS-107` "dialog focus" | Open and close a dialog | Focus moves into the dialog on open and returns to the invoking control on close |
| AC-A08 | `CMP-164` "menu focus" | Open a flyout | Focus moves into the menu; Escape closes it and restores focus |
| AC-A09 | `DS-113` "font scaling" | Set system font scaling to 100, 125, 150 and 200 per cent | No clipped text, no overlapping controls, no lost function at any setting |
| AC-A10 | `DS-60` "reduced motion" | Enable reduced motion and seed the graph | The layout settles in one step with no animation |
| AC-A11 | `DS-109` "status announcements" | Trigger a **Budget** message with a screen reader active | The message is announced |
| AC-A12 | `DS-108` "colour independence" | Inspect every place where kind or state is signalled | Signalled by shape, icon or text as well as by colour |

---

## 13. Concrete test cases

These cover the behaviour that is easy to get wrong. Each is given as given / when / then, on the fixture at the stated size.

### 13.1 Expanding a class whose instance count exceeds the Budget

**TC-01 — the overflow is reported, not hidden.**

- **Given** the fixture at `n` = 12,000, a **Budget** of 1,000, and a **Viewport** seeded from `pizza:Pizza` containing 40 nodes
- **When** the user expands `pizza:Margherita`, which has 543 instances plus its **TBox** neighbours
- **Then** the **Viewport** node count is exactly 1,000, not one more; and the report's added count plus the prior node count minus the evicted count equals 1,000; and the refused count equals the number of wanted neighbours that did not fit; and a message states the **Budget**, the refused count, the label of the expanded node, and the two available remedies, in the form *"Budget reached at 1,000 nodes. N neighbours of Margherita were left out — raise the budget or unpin something."* `[src: reportView()]`

**TC-02 — the expansion is not marked complete.**

- **Given** the state at the end of TC-01
- **When** the expanded node's state is read
- **Then** it is not marked fully expanded, because the wanted set was larger than the admitted slice `[src: expandNode()]`; and re-expanding it after raising the **Budget** admits the remainder

**TC-03 — expansion within the Budget evicts rather than refuses.**

- **Given** a **Budget** of 1,000, a **Viewport** of 990 nodes, of which 500 are unpinned and unfocused, and an expansion wanting 60 new nodes
- **When** the expansion runs in the default overflow policy
- **Then** 50 nodes are evicted, 60 are admitted, none is refused, the final count is 1,000, and a message states the **Budget**, the evicted count with correct singular or plural, up to three evicted labels, an ellipsis if more than three were evicted, and the label of the node that made room, in the form *"Budget held at 1,000. Paged out 50 nodes furthest from the focus (A, B, C, …) to make room for Margherita."* `[src: reportView()]`

**TC-04 — expansion at exactly the Budget.**

- **Given** a **Viewport** at exactly the **Budget** with every node exempt from **Eviction**
- **When** an expansion wanting one node runs
- **Then** nothing is evicted, one node is refused, the node count is unchanged, and the refusal is reported

### 13.2 Eviction ordering with pinned and focused nodes present

**TC-05 — exemptions are absolute.**

- **Given** a **Viewport** of 100 nodes in which node P is pinned, node F is in the **Focus set**, and P and F are both at the greatest distance from the **Focus set** and have the lowest shown degree and the oldest touch time — that is, they would be the first two victims were they not exempt
- **When** 20 nodes must be evicted to make room
- **Then** neither P nor F is evicted; the 20 victims are the next 20 in the documented order `[src: evictionOrder()]`

**TC-06 — the ordering is a strict total order.**

- **Given** a **Viewport** whose nodes have known distances, shown degrees and touch times, constructed so that the first key ties for three nodes and the second key ties for two of them
- **When** the eviction order is computed in the default policy
- **Then** the order is by descending distance, then ascending shown degree, then ascending touch time, exactly; and the order is stable across repeated computation `[src: evictionOrder()]`

**TC-07 — the alternative policy ignores distance.**

- **Given** the same **Viewport** with the policy set to least-recently-used
- **When** the eviction order is computed
- **Then** it is by ascending touch time alone, and a distant but recently touched node survives while a near but stale one does not `[src: evictionOrder()]`

**TC-08 — refusal evicts nothing.**

- **Given** the policy set to refusal and a **Viewport** with room for 10 more nodes
- **When** 30 nodes are admitted
- **Then** 10 are added, 0 are evicted, 20 are refused `[src: addToView()]`

### 13.3 Lowering the Budget below the current node count

**TC-09 — the ceiling is enforced immediately.**

- **Given** a **Viewport** of 3,000 nodes at a **Budget** of 3,000, none pinned and none in the **Focus set**
- **When** the **Budget** is lowered to 100
- **Then** exactly 2,900 nodes are evicted in the documented order, exactly 100 remain, the occupancy meter reads 100 per cent and shows its full state, and a message states *"Budget lowered to 100. Paged out 2,900 nodes."* `[src: wire()]`

**TC-10 — edges of evicted nodes are removed and shown degrees corrected.**

- **Given** the state at the end of TC-09
- **When** every edge and every node's shown degree is re-derived from scratch
- **Then** both match the maintained values, and no edge references an evicted node `[src: unlinkNode()]`

**TC-11 — exempt nodes cannot be forced out.**

- **Given** a **Viewport** of 500 nodes, every one of them pinned, at a **Budget** of 500
- **When** the **Budget** is lowered to 100
- **Then** no node is evicted, the node count remains 500, and the product reports that it is holding 400 nodes above the new **Budget** because they are exempt. The reference build evicts only the non-exempt candidates and reports the number it actually removed `[src: wire()]`, which in this case is zero; it does not state that the **Viewport** is over **Budget**. **Status:** specified, not implemented in the reference build

**TC-12 — raising the Budget admits nothing by itself.**

- **Given** a **Viewport** of 100 nodes at a **Budget** of 100 with held-back neighbours
- **When** the **Budget** is raised to 1,000
- **Then** the node count is still 100 and the held-back count is unchanged, until an expansion or a reseed is performed

### 13.4 Hidden-neighbour counts when the adjacency cap truncates

**TC-13 — the total is uncapped even though the list is capped.**

- **Given** the fixture at `n` = 100,000, where every one of the 22 named pizza classes holds between 4,412 and 4,654 instances and so exceeds the adjacency cap; `pizza:Margherita` holds 4,550
- **When** the adjacency function is called for `pizza:Margherita`
- **Then** the returned list contains exactly 4,000 entries and the returned total is the true degree, greater than 4,000 `[src: neighboursOf()]` `[src: NEIGHBOUR_CAP]`

**TC-14 — the node's degree comes from the total, not the list.**

- **Given** such a node admitted to the **Viewport**
- **When** its **Hidden neighbour** count is computed
- **Then** it equals the true degree minus the shown degree, so the user is told about neighbours that the cap prevented the product from even listing `[src: makeNode()]` `[src: hiddenNeighbours()]`

**TC-15 — the held-back total stays consistent.**

- **Given** a **Viewport** containing several capped-degree nodes
- **When** nodes are expanded, evicted and re-admitted 1,000 times at random
- **Then** after every step the sum of per-node **Hidden neighbour** counts equals the held-back figure shown in the **Budget** panel, and no per-node count is negative `[src: totalHidden()]`

**TC-16 — expanding a capped node admits from the capped list only.**

- **Given** a node whose true degree is 10,000 and whose list is capped at 4,000
- **When** it is expanded with a **Budget** allowing 500 admissions
- **Then** 500 are admitted from the capped list, the node is not marked fully expanded, and the **Hidden neighbour** count falls by exactly 500 — from 10,000 to 9,500 — rather than by the size of the capped list

### 13.5 Layout determinism

**TC-17 — identical input, identical output.**

- **Given** a **Viewport** of 500 nodes and its edge set, and a chosen **Layout mode**
- **When** the layout is computed twice from the same starting state, for each of the four modes in turn
- **Then** every node's coordinates are identical between the two runs, for all four modes

**TC-18 — determinism survives a process restart.**

- **Given** the same **Viewport** reconstructed from the fixture in a fresh process
- **When** each layout is computed
- **Then** coordinates match those from the previous process, for all four modes. Any dependence on hash iteration order, on pointer values, or on a time-seeded random source will fail this test and MUST be removed

**TC-19 — the force layout settles to the same rest state.**

- **Given** the same **Viewport** and the force **Layout mode**
- **When** the simulation is run to rest twice
- **Then** both rest states are identical, and the tick count to reach rest is identical

**TC-20 — relayout is triggered by the documented key only.**

- **Given** a laid-out **Viewport**
- **When** the pan or zoom transform changes, but no node, edge, revision or **Layout mode** changes
- **Then** no relayout occurs and no coordinate changes `[src: layoutKey()]`

### 13.6 The auto layout heuristic selecting each of its four outcomes

**TC-21 — grid by type ratio.**

- **Given** a **Viewport** of 350 nodes and 400 edges of which 240 are `rdf:type` — a ratio of 0.60, above the 0.55 threshold, with the node count above 300
- **When** the selector runs
- **Then** it returns `grid` `[src: chooseLayout()]`

**TC-22 — grid by size.**

- **Given** a **Viewport** of 600 nodes with a type-edge ratio of 0.10
- **When** the selector runs
- **Then** it returns `grid`, because the node count exceeds 500 regardless of ratio `[src: chooseLayout()]`

**TC-23 — hierarchy.**

- **Given** a **Viewport** of 200 nodes and 150 edges, of which 120 are subclass, sub-property or type edges — a hierarchical ratio of 0.80, above the 0.78 threshold; with the edge count at least half the node count, and the node count at most 400
- **When** the selector runs
- **Then** it returns `hierarchy` `[src: chooseLayout()]`

**TC-24 — radial.**

- **Given** a **Viewport** of 60 nodes with a **Focus set** of one and a hierarchical ratio of 0.40
- **When** the selector runs
- **Then** it returns `radial`, because the **Focus set** has at most two members and the node count exceeds 14 `[src: chooseLayout()]`

**TC-25 — force.**

- **Given** a **Viewport** of 20 nodes with a **Focus set** of three and a hierarchical ratio of 0.30
- **When** the selector runs
- **Then** it returns `force`, the fall-through outcome `[src: chooseLayout()]`

**TC-26 — boundary behaviour.**

- **Given** **Viewports** constructed at exactly 300, 301, 500, 501, 400, 401 and 14, 15 nodes, and at type ratios of exactly 0.55 and just above, and hierarchical ratios of exactly 0.78 and just above
- **When** the selector runs on each
- **Then** the outcome flips at exactly the documented boundary in every case, and the comparisons are strict where the source is strict `[src: chooseLayout()]`

**TC-27 — empty viewport.**

- **Given** an empty **Viewport**
- **When** the selector runs
- **Then** it returns `force` and no layout is computed `[src: chooseLayout()]` `[src: relayout()]`

### 13.7 Label collision dropping the lower-priority label

**TC-28 — the focused label wins.**

- **Given** two nodes A and B placed so that their label rectangles must overlap, with A in the **Focus set** and B not, and with B having the larger radius and the higher shown degree so that every lower-priority term favours B
- **When** labels are placed
- **Then** A's label is drawn and B's is not `[src: placeLabels()]`

**TC-29 — the priority order is exact.**

- **Given** pairs constructed to isolate each term of the priority function in turn — **Focus set** against selection, selection against hover, hover against **Pin**, **Pin** against radius, radius against shown degree
- **When** labels are placed for each pair
- **Then** the higher term wins in every case, confirming the weights are ordered as documented and not merely approximately so `[src: placeLabels()]`

**TC-30 — dropping is silent and complete.**

- **Given** 3,000 nodes densely placed
- **When** labels are placed
- **Then** no two drawn rectangles intersect; at most 900 are drawn; and no partial or clipped label is drawn in place of a dropped one

**TC-31 — zooming reveals dropped labels.**

- **Given** a dense view with many labels dropped
- **When** the view is zoomed in so that the same nodes are further apart in screen space
- **Then** more labels are drawn, and still none overlap

### 13.8 Export header figures matching the live status bar

**TC-32 — the five figures agree.**

- **Given** a **Viewport** with a known node count, edge count, **Budget** and held-back total, in a known resolved **Layout mode**
- **When** an export is produced and its caption is read
- **Then** the layout name matches the status bar's layout field; the node count matches the status bar's in-view nodes; the relationship count matches the status bar's in-view relationships; the **Budget** matches the **Budget** panel's value; and the held-back count matches the **Budget** panel's held-back figure `[src: exportCaption()]` `[src: updateBudgetUI()]`

**TC-33 — the figures are taken at export time.**

- **Given** an export in progress
- **When** the **Viewport** is changed immediately afterwards
- **Then** the exported caption still describes the state at the moment of export, not the state afterwards

**TC-34 — the caption survives a layout override.**

- **Given** `auto` resolving to `grid`
- **When** an export is produced
- **Then** the caption names the resolved mode, `Cluster grid`, not the literal string `auto` `[src: exportCaption()]` `[src: LAYOUT_NAMES]`

### 13.9 Name validation

Every rule, with its exact message `[src: validateName()]`.

| # | Given a rename to | Then the result is |
|---|---|---|
| TC-35 | the empty string | Rejected: *"A name is required."* |
| TC-36 | `Spicy Pizza` | Rejected: *"Names cannot contain spaces — use CamelCase, as the rest of the ontology does."* |
| TC-37 | `1Pizza` | Rejected: *"Start with a letter; use letters, digits, hyphen or underscore only."* |
| TC-38 | `Pizza!` | Rejected with the same message as TC-37 |
| TC-39 | `Margherita`, when `pizza:Margherita` already exists and is not the entity being renamed | Rejected: *"An entity named Margherita already exists at pizza:Margherita."* |
| TC-40 | the entity's own current name | Accepted, and no undo entry is recorded, because the name did not change `[src: beginRename()]` |
| TC-41 | `Pizza_2` | Accepted |
| TC-42 | `Pizza-2` | Accepted |
| TC-43 | a name differing from an existing one only by case, such as `margherita` | Accepted, because the uniqueness check is case-sensitive. An implementation that rejects it has changed the rule and MUST update this suite before doing so |

**TC-44 — the uniqueness check spans the whole Store.**

- **Given** a `pizza:` class being renamed
- **When** the proposed name collides with a `demo:` entity's local name
- **Then** it is rejected, and the message names the colliding entity's abbreviated IRI, which makes the namespace of the collision visible `[src: validateName()]`

### 13.10 Cell validation

Every rule, with its exact message `[src: commitCell()]`.

| # | Column | Given the entered value | Then the result is |
|---|---|---|---|
| TC-45 | branch | `Hackney` | Rejected: *"Branch must be one of: Soho, Shoreditch, Camden, Clerkenwell, Borough, Islington."* |
| TC-46 | branch | `Soho` | Accepted; an undo entry is recorded |
| TC-47 | branch | ` Soho ` with surrounding spaces | Accepted, because the value is trimmed before comparison |
| TC-48 | price | the empty string | Rejected: *"Price is required. Enter an amount in pounds, for example 12.50."* |
| TC-49 | price | `abc` | Rejected: *"“abc” is not a number. Enter an amount in pounds, for example 12.50."* |
| TC-50 | price | `-1` | Rejected: *"Price cannot be negative."* |
| TC-51 | price | `501` | Rejected: *"Price looks wrong — £501.00 exceeds the £500 sanity limit for a single pizza."* |
| TC-52 | price | `500` | Accepted, because the limit is exclusive |
| TC-53 | price | `£12.50` | Accepted; the currency symbol is stripped before parsing |
| TC-54 | price | `12.567` | Accepted and stored as 12.57, rounded to two decimal places |
| TC-55 | rating | the empty string | Rejected: *"Rating is required. Enter a whole number from 1 to 5."* |
| TC-56 | rating | `4.5` | Rejected: *"Rating must be a whole number, not “4.5”."* |
| TC-57 | rating | `0` | Rejected: *"Rating must be between 1 and 5. You entered 0."* |
| TC-58 | rating | `6` | Rejected: *"Rating must be between 1 and 5. You entered 6."* |
| TC-59 | rating | `5` | Accepted |
| TC-60 | any non-editable column | any value | Rejected: *"That column is not editable."* |

**TC-61 — rejection leaves the record untouched.**

- **Given** any rejected value from the table above
- **When** the commit is attempted
- **Then** the record's field is unchanged, no undo entry is recorded, the **Store** version is not incremented, and the cell shows its error state, which clears on its own after the documented interval `[src: commitCell()]`

**TC-62 — validation happens on blur, not on keystroke.**

- **Given** a cell in edit
- **When** an invalid value is typed but focus is not left
- **Then** no message appears; the message appears only on blur or on Enter `[src: beginCellEdit()]`

### 13.11 Parser errors

Every documented error, with its message and its hint `[src: parseQuery()]`.

| # | Given the query fragment | Then the message is | And the hint is |
|---|---|---|---|
| TC-63 | `PREFIX pizza: pizza.owl` | *"Malformed PREFIX declaration."* | *"Write it as: PREFIX pizza: <http://www.co-ode.org/ontologies/pizza/pizza.owl#>"* |
| TC-64 | `ASK WHERE { ?s ?p ?o }` | *"Only SELECT queries are supported."* | *"Start the query with SELECT, or pick an example from the right."* |
| TC-65 | `SELECT WHERE { ?s ?p ?o }` | *"SELECT needs at least one variable."* | *"For example: SELECT ?pizza ?topping"* |
| TC-66 | `SELECT ?x { ?s ?p ?o }` | *"Expected WHERE after the projection."* | *"The shape is: SELECT ?x WHERE { ... }"* |
| TC-67 | `SELECT ?x WHERE ?s ?p ?o }` | *"Expected “{” but found “?s”."* | *"Check the braces and the dot at the end of each triple pattern."* |
| TC-68 | `SELECT ?x WHERE { ?s ?p` | *"The pattern ends too early."* | *"Every triple pattern needs a subject, a predicate and an object."* |
| TC-69 | `SELECT ?x WHERE { ?x foo:bar ?y }` | *"Unknown prefix “foo:”."* | *"Declare it with PREFIX, or use one of: pizza: demo: rdf: rdfs: owl: xsd:"* |
| TC-70 | a term that is none of variable, IRI, prefixed name, literal or `a` | *"“…” is not a valid term."* | *"Terms are variables (?x), prefixed names (pizza:Pizza), IRIs (<…>) or literals (\"…\")."* |
| TC-71 | `FILTER (?x ?y)` | *"FILTER needs a comparison operator."* | *"Supported: = != < <= > >="* |
| TC-72 | `ORDER BY ?` with no variable | *"ORDER BY needs a variable."* | *"For example: ORDER BY DESC(?price)"* |
| TC-73 | `LIMIT many` | *"LIMIT needs a number."* | *"For example: LIMIT 100"* |
| TC-74 | `SELECT ?x WHERE { }` | *"The WHERE block has no triple patterns."* | *"Add at least one, for example: ?pizza a pizza:NamedPizza ."* |
| TC-75 | `SELECT ?z WHERE { ?x ?y ?w }` | *"Variable ?z is selected but never bound in the WHERE block."* | *"Either bind it in a pattern, or remove it from SELECT."* |
| TC-76 | a query that ends before its closing brace | *"Expected “}” but found the end of the query."* | *"Check the braces and the dot at the end of each triple pattern."* |

**TC-77 — errors are raised before evaluation.**

- **Given** any malformed query above
- **When** it is submitted at `n` = 100,000
- **Then** the error is reported in under the parse budget of [§14](#14-performance-budgets), which is only possible if evaluation never began

**TC-78 — comments are ignored.**

- **Given** a valid query with a `#` comment on its own line and another at the end of a line
- **When** it is parsed
- **Then** both comments are discarded and the query parses `[src: tokenize()]`

### 13.12 The solution cap being reported

**TC-79 — the cap stops evaluation and is stated.**

- **Given** the fixture at `n` = 100,000 and a query whose intermediate solution set exceeds 200,000 — for example an unconstrained two-pattern join over the order set
- **When** it is evaluated
- **Then** evaluation stops at exactly 200,000 intermediate solutions; the query returns rather than hanging; and the summary includes the phrase *"intermediate results capped at 200,000"* `[src: evaluate()]` `[src: SOLUTION_CAP]`

**TC-80 — the cap is not silently applied to a query that does not reach it.**

- **Given** a query returning 199,999 intermediate solutions
- **When** it is evaluated
- **Then** no cap notice appears

**TC-81 — the reported total is honest.**

- **Given** a capped query with a `LIMIT` of 100
- **When** the summary is read
- **Then** it states the returned row count, the pre-limit total, that the limit was applied, and that intermediate results were capped — all four, because each is a different truth about the same result

### 13.13 Theme switching refreshing the renderer palette

**TC-82 — the graph repaints in the new theme immediately.**

- **Given** a **Viewport** of 1,000 nodes rendered in the light theme
- **When** the theme is switched to dark
- **Then** the next rendered frame uses the dark theme's canvas, grid, text, stroke, surface, accent, warning and five entity colours, with no element retaining a light-theme value `[src: setTheme()]` `[src: refreshPalette()]`

**TC-83 — the export follows.**

- **Given** the state at the end of TC-82
- **When** an export is produced
- **Then** its header band, footer band, legend and node colours are all from the dark theme `[src: drawExportChrome()]`

**TC-84 — the control's accessible name flips.**

- **Given** the light theme
- **When** the theme control's accessible name is read, the theme is switched, and it is read again
- **Then** it reads *Switch to dark theme* and then *Switch to light theme* `[src: setTheme()]`

**TC-85 — no other state is disturbed.**

- **Given** a **Viewport**, a table filter, a selection and a query result
- **When** the theme is switched
- **Then** node coordinates, the **Focus set**, the **Pin** set, the table filter, the selection and the query result are all unchanged

---

## 14. Performance budgets

**ACC-12** Every budget below MUST be met on the machine specification agreed as prerequisite P5 of [`60-implementation-plan.md`](60-implementation-plan.md), with the measurement recorded and dated.

**ACC-13** Frame-time budgets MUST be reported as percentiles over at least 600 consecutive frames, never as an average. An average frame time hides exactly the stutter a user notices.

**ACC-14** A budget MUST be measured on a release build with the profiler's own overhead excluded, and the measurement MUST be repeated at least three times with the median reported.

| # | Operation | Dataset size | Target | How to measure |
|---|---|---|---|---|
| PB-01 | Graph frame time, force layout running, labels on | **Budget** ceiling of 3,000 nodes | p95 ≤ 16.7 ms; p99 ≤ 33 ms | Instrument the render loop; fill the **Viewport** to 3,000 nodes by expanding `pizza:Margherita` at `n` = 100,000; record 600 frames while slowly panning |
| PB-02 | Graph frame time, computed layout, labels on | 3,000 nodes | p95 ≤ 16.7 ms; p99 ≤ 33 ms | As PB-01 with the grid **Layout mode**, which has no per-frame simulation |
| PB-03 | Graph frame time at the default **Budget** | 1,000 nodes | p95 ≤ 8 ms | As PB-01 at the default **Budget** |
| PB-04 | Fresh force layout to rest | 3,000 nodes | ≤ 2,000 ms to rest; first drawable frame ≤ 100 ms | Time from the relayout trigger to the settling threshold; separately, time to the first frame drawn |
| PB-05 | Fresh hierarchy layout | 3,000 nodes | ≤ 400 ms | Time one complete computation, excluding rendering |
| PB-06 | Fresh radial layout | 3,000 nodes | ≤ 250 ms | As PB-05 |
| PB-07 | Fresh grid layout | 3,000 nodes | ≤ 150 ms | As PB-05 |
| PB-08 | Label placement pass | 3,000 nodes, 900 labels retained | ≤ 4 ms | Time the placement function alone, excluding drawing |
| PB-09 | Adjacency computation for a high-degree class | `n` = 100,000 | ≤ 60 ms | Time the adjacency function for `pizza:Margherita`, including the cap; and separately for `demo:Customer`, whose degree is 12,500 |
| PB-10 | Table filter application | 100,000 rows | ≤ 120 ms | Time from filter change to the filtered index list being ready, excluding rendering |
| PB-11 | Table sort | 100,000 rows | ≤ 200 ms | Time the sort of the filtered index list |
| PB-12 | Table scroll frame time | 100,000 rows | p95 ≤ 16.7 ms; p99 ≤ 33 ms | Programmatic fling scroll from top to bottom over 600 frames; record frame times |
| PB-13 | Table first paint after a dataset change | 100,000 rows | ≤ 300 ms | Time from generation completing to the first row window being drawn |
| PB-14 | Query evaluation, worked example 1 (named pizzas and toppings) | all four sizes | ≤ 30 ms at every size | The example is **TBox**-only; its time MUST NOT grow with the **ABox** |
| PB-15 | Query evaluation, worked example 4 (expensive Shoreditch orders) | 1,000 / 12,000 / 50,000 / 100,000 | ≤ 20 / 60 / 200 / 400 ms | Time from submission to the result set being ready, excluding rendering |
| PB-16 | Query evaluation, worked example 5 (five-star orders and customers) | 1,000 / 12,000 / 50,000 / 100,000 | ≤ 25 / 80 / 280 / 550 ms | As PB-15 |
| PB-17 | Query parse | any size | ≤ 5 ms | Time the tokeniser and parser alone, on the longest worked example |
| PB-18 | Query error reporting | 100,000 | ≤ 10 ms | Time from submission of a malformed query to the message being ready |
| PB-19 | Export render, 2× raster | 3,000 nodes | ≤ 1,500 ms | Time from the export command to the image being ready, excluding the file write |
| PB-20 | Export render, 3× raster | 3,000 nodes | ≤ 3,000 ms | As PB-19 |
| PB-21 | Export render, vector | 3,000 nodes | ≤ 2,000 ms | As PB-19 |
| PB-22 | **TBox** build | — | ≤ 20 ms | Time `buildTBox` in isolation |
| PB-23 | **ABox** generation | 100,000 | ≤ 600 ms | Time the generator including index construction |
| PB-24 | Full regeneration, store to interactive | 100,000 | ≤ 1,500 ms | Time from the size being chosen to the status bar showing the new counts and the graph being interactive |
| PB-25 | Application start-up to interactive | default 12,000 | ≤ 2,000 ms | Time from process launch to the window accepting input with the default **Viewport** seeded |
| PB-26 | Theme switch | 3,000 nodes in view | ≤ 100 ms to a fully repainted frame | Time from the control activation to the first frame with the new palette |
| PB-27 | Memory, steady state | 100,000 | ≤ 400 MB working set | Sample after regeneration, a full expansion and a forced collection |
| PB-28 | Memory growth over a one-hour soak | 100,000 | ≤ 5 per cent growth after the first ten minutes | Sample every minute during the slice-10 soak |

**ACC-15** A missed budget MUST be recorded with its measured value rather than quietly re-targeted. Changing a target is a specification change and MUST be made in this document, with a reason.

---

## 15. Accessibility test matrix

**ACC-16** Every cell of this matrix MUST be exercised. A blank cell is an untested combination, not an inapplicable one.

| Check | Class tree and inspector | Graph **Viewport** | Individuals table | SPARQL console | Shell chrome |
|---|---|---|---|---|---|
| Keyboard-only traversal: reach every control | Arrow keys move selection; twisty expands and collapses; filter field reachable; every inspector link reachable and activatable | Every node reachable in a defined order; expand, collapse, **Pin** and select all keyboard-invokable; pan and zoom keyboard-invokable | Row navigation, column sort, filter fields, cell edit entry and exit | Editor, run control, example list, result grid, send-to-graph | Command bar, tabs, splitters, menus, dialogs, status bar |
| Keyboard-only traversal: escape every region | Focus leaves the tree without a pointer | Focus leaves the canvas without a pointer | Focus leaves the grid and leaves cell edit | Focus leaves the editor without inserting a tab character | Escape closes every menu and dialog and restores focus |
| Focus visibility, light theme | Visible indicator on the focused row, the filter field and every link | Visible indicator on the focused node, distinct from selection and hover | Visible indicator on the focused cell, distinct from row selection | Visible indicator on editor, controls and result rows | Visible indicator on every control |
| Focus visibility, dark theme | As above, meeting the contrast threshold | As above | As above | As above | As above |
| Accessible names | Every row named with its entity name and kind; every inspector section named | Every node named with its label and kind; the **Budget** meter named with its value | Every column header named; every editable cell named with its column and row | Editor, run control and each example named | Every control named; the theme control's name flips with the theme |
| Roles | Tree and tree items | A navigable collection, not an image | Grid, rows, cells | Text region, button, list, grid | Menu bar, tabs, splitters, dialog, status |
| Live regions | Rename results announced | **Budget** and eviction messages announced | Validation messages announced | Result summary and errors announced | Toasts announced |
| Contrast, light theme | Text, icons, selection, focus, disabled states | Node fills, edges, labels, badges, ring and block chrome | Text, zebra banding, selection, error state | Syntax highlighting colours, result text | All chrome |
| Contrast, dark theme | As above | As above | As above | As above | As above |
| System font scaling 100–200 per cent | Rows grow; no clipped label; twisty stays aligned | Chrome and panels absorb the change; canvas text remains at its fixed point size by design, and the specification states this so it is not mistaken for a defect | Row height grows; columns remain readable; no clipped cell | Editor and results grow; no clipped control | No clipped control; no overlapping region |
| Reduced motion | No expand or collapse animation | No simulation animation; layout settles in one step; no transition on pan or zoom | No scroll animation | No transition on result appearance | No toast slide; no dialog fade |
| Colour independence | Kind signalled by icon as well as colour | Kind signalled by shape as well as colour | State signalled by text as well as colour | Errors signalled by text as well as colour | States signalled by text or icon as well as colour |

**ACC-17** The graph **Viewport** MUST NOT be exempted from any row of this matrix. It is the hardest **Surface** to make accessible and therefore the one most often skipped; an automation peer exposing the **Viewport** nodes as a named, navigable collection is required work, not an enhancement.

**ACC-18** Canvas label text is drawn at a fixed point size and does not follow system font scaling. This is a deliberate consequence of the label collision pass `[src: placeLabels()]` `[src: labelFont()]`. Zoom is the user's means of enlarging it, and the product MUST make that discoverable. **Status:** specified, not implemented in the reference build — the reference build provides zoom but does not explain it as the accessibility path.

---

## 16. Data integrity checks

### 16.1 Fixture integrity

**ACC-19** The complete verification checklist of `FIX-102` — checks V1 to V60 across its five sections — MUST be implemented as automated tests and MUST run in the continuous build on every push. It is reproduced here by reference rather than by copy, so that there is exactly one authority for it: [`62-pizza-ontology-fixture.md` §16](62-pizza-ontology-fixture.md#16-verification-checklist).

**ACC-20** A failure of any fixture check MUST stop the build. Every other measurement in this document is taken on the fixture; a fixture defect makes all of them meaningless, so continuing past one wastes the whole run.

### 16.2 Index consistency after every mutation

**ACC-21** After every mutation, the following invariants MUST hold, and MUST be asserted in a debug build and in the fuzz tests.

| # | Invariant | After which mutations |
|---|---|---|
| I1 | Every entity's parent list refers to entities that exist | rename, delete, add |
| I2 | Every entity's child list refers to entities that exist, contains no duplicate, and is sorted by local name | rename, delete, add |
| I3 | Parent and child links are mutual: if A lists B as a parent, B lists A as a child | rename, delete, add |
| I4 | The IRI index contains every order record exactly once, and nothing else | generate, add individual, delete individual |
| I5 | The type buckets partition the order set: every order is in exactly one bucket, and every bucket member has that type | generate, add individual, delete individual, type change |
| I6 | The sum of bucket sizes equals the order count | as I5 |
| I7 | Every order's customer index is in range for the current customer array | generate, add individual |
| I8 | The customer reverse index, when built, maps each customer to exactly the orders whose index refers to it | generate, add individual, reverse index build |
| I9 | The flattened restriction index contains one entry per `some` or `value` restriction filler and no other | **TBox** edit, rebuild |
| I10 | Every **Viewport** edge has both endpoints in the **Viewport** node set | admit, evict, expand, collapse, seed, **Budget** change |
| I11 | Every node's shown degree equals the number of **Viewport** edges incident on it | as I10 |
| I12 | Every node's **Hidden neighbour** count is non-negative | as I10 |
| I13 | The **Focus set** is a subset of the **Viewport** node set | as I10 |
| I14 | The **Pin** set is a subset of the **Viewport** node set | as I10 |
| I15 | The **Store** version increases on every mutation and never decreases | every mutation |
| I16 | A rejected edit leaves every index and the version unchanged | cell edit, rename |

**ACC-22** The invariant assertions MUST be active in the fuzz tests of AC-V01 and MUST be checkable in a debug build at runtime. They MAY be compiled out of a release build.

### 16.3 Triple-count arithmetic

**ACC-23** The reported triple total MUST equal `239 + 7 × |orders| + 2 × |customers|` at every dataset size and after every mutation that changes either count, per `FIX-92`.

| # | Check | Expected |
|---|---|---|
| TA-1 | Recompute the total from first principles at each of the four sizes and compare with the reported figure | Equal: 7,489 / 87,239 / 362,739 / 725,239 |
| TA-2 | Add one individual and re-read the total | Increases by exactly 7 |
| TA-3 | Delete one individual and re-read the total | Decreases by exactly 7 |
| TA-4 | Edit a cell value | Total unchanged, because an edit replaces an object and does not add an assertion |
| TA-5 | Rename an entity | Total unchanged |
| TA-6 | Compare the **TBox** component of the total across all four sizes | Constant at 239 |
| TA-7 | Count the assertions the evaluator can actually produce for one order | Exactly 7, plus the virtual `demo:Order` type of `FIX-94`, which is excluded from the count |
| TA-8 | Compare the status bar's triple figure with the export caption's store figure, if the export states one | Equal |
| TA-9 | Compare the flattened index size with the reported total | The 140 flattened entries are excluded from the total per the known gap in `FIX-97`; the product's treatment MUST be consistent between the status bar and the export |

---

## 17. Regression guards

**ACC-24** Each defect below is one this design exists to prevent. Each MUST have a permanent automated test in the continuous build, and that test MUST be the one named.

| # | The defect | Why it matters | The guard that catches a recurrence |
|---|---|---|---|
| RG-01 | **A graph layout that produces overlapping nodes.** This is the failure the four-layout design was built to eliminate, and it is the defect most likely to return, because it returns silently and is only visible to someone looking at the right **Viewport** | It makes the product look amateur in the one view users screenshot | AC-LF02, AC-LH04, AC-LR06, AC-LG05: after every layout, at 100, 500, 1,000 and 3,000 nodes, assert that no two node centres are closer than the sum of their radii. Sixteen combinations, all automated, all permanent |
| RG-02 | **An illegible label smear.** The same failure in its second form: labels drawn on top of one another until nothing can be read | It destroys the graph's only means of saying what anything is | AC-R01 and TC-30: assert that no two drawn label rectangles intersect, in all four layouts at all four node counts, and that the cap of 900 is respected |
| RG-03 | **Silent budget violation.** The **Viewport** exceeding its **Budget** without anyone being told | The **Budget** is the product's central promise; exceeding it silently makes every count untrustworthy | AC-V01 and TC-01: assert the ceiling after every step of a 10,000-operation fuzz test |
| RG-04 | **Dishonest hidden-neighbour arithmetic**, especially when the adjacency cap truncates | The held-back count is how the product admits what it is not showing; a wrong figure is worse than no figure | AC-V04, TC-13 to TC-16: assert that the per-node counts sum to the displayed total after every fuzz step, including on capped-degree nodes |
| RG-05 | **A pinned or focused node being evicted** | It breaks the one promise the user made to the product | AC-V06 and TC-05: record every eviction across the fuzz test and check it against both exemption sets |
| RG-06 | **Layout non-determinism**, usually from hash iteration order or a time-seeded random source | It makes every layout test flaky and every regression unreproducible | TC-17, TC-18, TC-19: identical coordinates across repeated runs and across a process restart, for all four modes |
| RG-07 | **Fixture drift** — a changed topping, price or axiom silently invalidating every number in this document | Every measurement here stands on the fixture | ACC-19: all 60 checks of `FIX-102`, build-stopping on failure |
| RG-08 | **Generator non-determinism** from a platform random source or a signed state word | The golden values become unreproducible and every data-driven test becomes flaky | AC-S18, AC-S19, AC-S26: identical records across runs, and the exact golden values |
| RG-09 | **Virtualisation collapse** — realising one element per row, usually introduced by a well-meaning change to selection or editing | The table stops being able to hold 100,000 rows, which is the product's scale claim | AC-B02 and PB-12: assert a constant realised-element count and measure fling-scroll frame time |
| RG-10 | **A full store sweep on an indexed query pattern** | Query latency becomes unbounded as the dataset grows | AC-Q08, AC-Q09: a counter on the scan path asserts that a bound subject or object never sweeps |
| RG-11 | **A theme left behind** — a hard-coded colour or a value present in one theme only | It accumulates until one theme looks unfinished | AC-D01 and AC-D02: assert identical theme key sets and zero literal visual values in views |
| RG-12 | **The renderer palette not refreshing on theme switch** | The graph stays in the old theme while everything around it changes | AC-R17 and TC-82 |
| RG-13 | **Export figures diverging from the live status bar** | The export's provenance header is the only thing making an exported picture citable | AC-X01 and TC-32 |
| RG-14 | **Validation message drift** — a message reworded without updating the specification | Copy is part of the specification, and a user-facing message is the product's voice | TC-35 to TC-62 assert exact message text for every name and cell rule |
| RG-15 | **Parser error drift** — the same, for the query console | A wrong hint is worse than no hint | TC-63 to TC-76 assert exact message and hint text |
| RG-16 | **Silent truncation** — a cap applied without being reported | The product's whole discipline is honest reporting of bounded views | TC-79 to TC-81 for the solution cap; AC-V13 for eviction; AC-B18 and AC-Q19 for send-to-graph |
| RG-17 | **Accessibility regression** from a control added without a name or a keyboard path | It is invisible until someone cannot use the product | AC-A01 and AC-A04: automated traversal and an automated scan with zero violations, on every push |
| RG-18 | **`pizza:` and `demo:` blurring** — a label, column header or export caption that presents generated data as part of the real ontology | It is the one honesty claim the product makes about its own data | AC-S31, AC-S32 and a copy review asserting that no user-facing string describes `demo:` data as part of `pizza.owl` |

**ACC-25** A regression guard MUST NOT be disabled, skipped or marked flaky to make a build green. If a guard fails, either the build has a defect or the guard is wrong; both are investigated, neither is muted.

---

## Appendix A — Native stack mapping (non-normative)

Advisory only. A conformant implementation may verify these criteria by any means that actually establishes them.

### A.1 Test frameworks

| Layer | Suggested tool | Notes |
|---|---|---|
| Unit tests over `Axiom.Core` and `Axiom.Fixture` | xUnit, with `[Theory]` and `MemberData` driving the fixture tables | The whole of [§2](#2-acceptance-criteria-store-and-fixture) is naturally a theory over the tables of [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md). Transcribe the tables once, into test data, and let the tests read them |
| Property-based tests | FsCheck or CsCheck | The **Viewport** fuzz test of AC-V01 is a property test in all but name: generate operation sequences, assert the invariants of [§16.2](#162-index-consistency-after-every-mutation) after each |
| Approval or snapshot tests | Verify | Useful for the export caption string, the rendered axiom text and the validation messages, where the assertion is exact text |
| Geometry assertions | Plain xUnit over the layout output | No framework needed: the overlap and collision assertions are two nested loops over arrays of rectangles and circles. Keep them in the unit test project so they run on every push |
| Integration tests | xUnit against the view models, with no window | Surface-to-surface flows are testable without a UI thread if the view models own no rendering |

### A.2 UI automation

| Concern | Suggested tool | Notes |
|---|---|---|
| Driving the packaged application | WinAppDriver, or Microsoft.Windows.Apps.Test | Run against the installed MSIX, not a loose build, so that packaging identity problems surface in test rather than in the field |
| Accessibility scanning | Axe.Windows, run headlessly in the build | Satisfies AC-A04; configure it to fail on any violation rather than to report |
| Automation tree inspection | Accessibility Insights for Windows | For AC-A05 and AC-A06, and for building the graph **Surface**'s automation peer in the first place |
| Contrast measurement | Colour Contrast Analyser for manual spot checks; a small script over the token values for the automated audit | The automated audit is the one that counts: run it over the token pairs in both themes, in the build |
| Keyboard traversal | A scripted tab and arrow-key walk asserting the focused element at each step | Encodes the focus order as data, which makes an accidental reorder a test failure rather than a discovery |

### A.3 Performance profiling

| Budget class | Suggested tool | Notes |
|---|---|---|
| Computation budgets: PB-04 to PB-11, PB-14 to PB-18, PB-22, PB-23 | BenchmarkDotNet | Gives distributions rather than single numbers, which is what ACC-14 asks for. Run on the P5 machine with the release configuration |
| Frame-time budgets: PB-01 to PB-03, PB-12, PB-26 | Application-side frame instrumentation writing a timestamp per frame, plus PresentMon or the Windows Performance Analyzer for corroboration | Instrument in the application so the measurement is reproducible in the build; corroborate externally so the instrumentation itself is trusted |
| GPU and composition behaviour | Windows Performance Recorder with the graphics profile | Use when PB-01 fails and the cause is not obvious from the application-side numbers |
| Memory: PB-27, PB-28 | dotnet-counters for sampling; dotMemory or PerfView for a leak | The soak of PB-28 needs sampling, not a single snapshot |
| Start-up: PB-25 | Windows Performance Analyzer, or a stopwatch from process start to first input accepted | Measure on a cold start after a reboot, and separately on a warm start; report both |

### A.4 Keeping the suite honest

Run the unit and integration tests on every push; they should complete in under a minute, and if they do not, the **Store** and fixture layers have acquired a UI dependency they should not have. Run the UI automation and accessibility suites on every merge to the main branch. Run the performance harness nightly and on every release candidate, and publish the numbers with the build rather than keeping them in someone's notebook — ACC-15 is not satisfiable retrospectively.
