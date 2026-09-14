# Axiom — Class Tree and Inspector

**Purpose:** This document specifies the hierarchy tree and the Entity inspector — the two panes through which a user reads, navigates, renames, creates and deletes the TBox — including their state, rendering model, filtering, keyboard model, validation rules, dialogs, verbatim copy, and the reserved inferred-axioms region.

**Status:** Normative

**Requirement ID prefixes owned:** `TREE`

---

## Scope and the two panes

Axiom's TBox Surface is two panes that always operate on the same Entity.

| Pane | Position | Owns | Reads |
|---|---|---|---|
| Hierarchy tree | Leading edge of the workspace, full height, resizable | `treeMode`, `expanded`, the tree filter string, the derived visible set | `Store.ent` (parents, children, kind, name), `Store.byType`, `Store.inds`, `Store.customers` |
| Entity inspector | Trailing edge of the workspace, full height, resizable | Nothing; it is a pure projection | The resolved Entity record for the current selection, `Store.byType`, `Store.customers`, the customer index, `NAMED_PIZZAS` |

The tree is a navigator: it shows structure and lets the user move through it. The inspector is a reader: it shows everything asserted about one Entity and nothing about any other. Neither pane renders instance data in bulk; that is the job of [`31-individuals-table.md`](31-individuals-table.md).

**TREE-1** The hierarchy tree and the Entity inspector MUST be two distinct panes, independently resizable and independently collapsible, and MUST NOT be merged into a single scrolling region `[src: #leftPanel]` `[src: #rightPanel]`.

**TREE-2** The tree MUST be the only Surface that renders the TBox hierarchy. The inspector MUST NOT render a hierarchy; it renders the direct axioms of exactly one Entity.

**TREE-3** Neither pane may hold a private copy of Store data. Both MUST read the Store on every render and MUST derive every displayed figure at render time `[src: renderTree()]` `[src: renderInspector()]`.

### The shared selection bus

Selection is global application state, not pane state. It is defined in [`10-architecture.md`](10-architecture.md); this section states the tree's and inspector's obligations against it.

**TREE-4** Selection MUST be a single nullable IRI held in one place for the whole application `[src: UI]`. There MUST NOT be a separate "tree selection" and "inspector selection".

**TREE-5** A selection change MUST perform exactly these effects, in this order `[src: selectEntity()]`:

| Step | Effect |
|---|---|
| 1 | Set the global selection to the IRI |
| 2 | If the IRI is present in the Viewport, set the Viewport's selected node to it; otherwise leave the Viewport's selected node unchanged |
| 3 | Re-render the inspector in full |
| 4 | Refresh the tree's selection highlight only (not a full tree render) |
| 5 | Update the status-bar selection readout |
| 6 | If, and only if, the caller asked for reveal, reveal the IRI in the graph |

**TREE-6** The status-bar selection readout MUST be the Entity's kind label, then a middot surrounded by single spaces, then the Entity's display label — for example `Class · Pizza` — and MUST be exactly `No selection` when the IRI does not resolve to any Entity, Individual or customer `[src: selectEntity()]` `[src: #stSelection]`.

**TREE-7** The display label used in step 6 and in the inspector header MUST be resolved in this precedence order `[src: labelOf()]`:

| Order | Condition | Label |
|---|---|---|
| 1 | The IRI is a generated Individual record | The record's order reference, for example `AX-100042` |
| 2 | The IRI is a generated customer | The customer's person name, for example `Ada Rossi` |
| 3 | The IRI is a Store Entity | The Entity's mutable `name` |
| 4 | Otherwise | The local name of the IRI (the part after the last `#` or `/`) |

**TREE-8** Selection MUST be settable from at least four producers: a tree row, a graph node, a table row, and a global-search result. Every producer MUST route through the single selection operation in **TREE-5** and MUST NOT update the inspector or the tree directly `[src: selectEntity()]`.

---

## Tree modes

The tree has exactly two modes. The mode is a single enumerated value and switching it re-renders the tree only; it MUST NOT alter the selection, the expanded set, or the filter string `[src: wire()]`.

| Mode | Identifier | Tab label | Counter shown in the tab |
|---|---|---|---|
| Classes | `classes` | `Classes` | Total number of Entities whose kind is class or defined class |
| Properties | `properties` | `Properties` | Total number of Entities whose kind is object property or data property |

**TREE-9** The tree MUST support exactly the two modes `classes` and `properties`, MUST default to `classes` at boot, and MUST expose them as a two-tab strip above the tree `[src: UI]` `[src: #tabClasses]` `[src: #tabProps]`.

**TREE-10** Each tab MUST carry a live count badge. The classes badge MUST be the count of Entities of kind class or defined class; the properties badge MUST be the count of Entities of kind object property or data property. Both MUST be recomputed on every tree render and formatted with `en-GB` thousands separators `[src: classCount()]` `[src: propCount()]` `[src: renderTree()]`.

**TREE-11** Switching mode MUST re-render the tree from scratch and MUST NOT clear the filter string, the expanded set, or the selection `[src: wire()]`.

### Root derivation

**TREE-12** In `classes` mode the tree MUST have exactly one root, `http://www.w3.org/2002/07/owl#Thing`, and MUST NOT synthesise any other root `[src: treeRoots()]` `[src: ROOT]`.

**TREE-13** In `properties` mode the roots MUST be every Entity whose kind is object property or data property and whose parent list is empty, sorted ascending by local name using locale-aware comparison `[src: treeRoots()]`.

**TREE-14** The property roots MUST NOT include `owl:Thing`, and the class root MUST NOT appear in `properties` mode `[src: treeRoots()]`.

For the fixture defined in [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md), the property roots are, in rendered order:

| Root | Kind | Has children |
|---|---|---|
| `demo:branch` | Data property | No |
| `pizza:hasCountryOfOrigin` | Object property | No |
| `pizza:hasIngredient` | Object property | Yes — `hasBase`, `hasTopping` |
| `pizza:hasSpiciness` | Object property | No |
| `pizza:isIngredientOf` | Object property | Yes — `isBaseOf`, `isToppingOf` |
| `demo:orderedBy` | Object property | No |
| `demo:orderRef` | Data property | No |
| `demo:preparedAt` | Data property | No |
| `demo:priceGBP` | Data property | No |
| `demo:rating` | Data property | No |

(The listed order is the locale-aware ascending order of the local names `branch`, `hasCountryOfOrigin`, `hasIngredient`, `hasSpiciness`, `isIngredientOf`, `orderedBy`, `orderRef`, `preparedAt`, `priceGBP`, `rating`. Note that locale-aware comparison orders `orderedBy` before `orderRef`, because it compares base letters before case.)

### Child filtering

**TREE-15** A node's children MUST be taken from the Entity's own child list and then filtered so that each mode shows only its own Entity kinds `[src: treeChildren()]`:

| Mode | Child kinds retained | Child kinds dropped |
|---|---|---|
| `classes` | class, defined class | individual, object property, data property |
| `properties` | object property, data property | class, defined class, individual |

**TREE-16** A child IRI that does not resolve to a Store Entity MUST be dropped silently and MUST NOT render a placeholder row `[src: treeChildren()]`.

**TREE-17** Individuals MUST NOT appear as tree rows in either mode. The tree is a TBox navigator; instance data is reached through the instance count, the inspector's page-instances action, or the individuals table `[src: treeChildren()]`.

**TREE-18** The child list of every Entity MUST be held sorted ascending by local name at build time, and any mutation that appends a child MUST re-sort that child list so that tree order never depends on insertion order `[src: buildTBox()]` `[src: newClassDialog()]`.

**TREE-19** When an Entity has more than one parent, it MUST be rendered once under each of its parents. The tree is a projection of a directed acyclic graph, not of a strict tree, and the specification does not de-duplicate `[src: treeChildren()]`.

---

## The tree row

Every visible node renders exactly one row of fixed height. Rows are laid out as a flat ordered list produced by a depth-first pre-order walk from the roots; a node's children are walked only when the node is expanded `[src: renderTree()]`.

### Row anatomy

| Slot | Order | Size | Content | Notes |
|---|---|---|---|---|
| Indent | 1 | `4 + depth × 14` px of leading inset | — | `depth` is 0 for a root `[src: renderTree()]` |
| Expander | 2 | 16 × 16 px | Chevron glyph | Rotated a quarter-turn when expanded; invisible but space-occupying for a leaf |
| Kind icon | 3 | 14 × 14 px | Kind glyph | Coloured by the kind's colour token |
| Label | 4 | Fills remaining width | The Entity's mutable `name` | Truncated with an ellipsis; never wrapped |
| Count suffix | 5 | Intrinsic, never shrinks | Direct instance count | Omitted entirely when the count is zero |

**TREE-20** Row height MUST be 24 px and MUST be uniform for every row at every depth `[src: --h-tree-row]`.

**TREE-21** The horizontal gap between expander, icon, label and count MUST be 6 px, and the row MUST reserve 8 px of trailing inset `[src: .tree__row]`.

**TREE-22** Indentation MUST be computed as `4 + depth × 14` pixels of leading inset, applied to the row as a whole so that the expander, not the label, is what steps rightwards with depth `[src: renderTree()]`.

**TREE-23** The label MUST be the Entity's `name` field, not its IRI and not its shortened form. The `name` field is mutable and is what rename edits `[src: renderTree()]` `[src: commitRename()]`.

**TREE-24** A row MUST NOT wrap. When the label exceeds the available width it MUST be clipped with a trailing ellipsis, and the full IRI MUST remain reachable by selecting the row and reading the inspector `[src: .tree__label]`.

### The expander and its leaf state

**TREE-25** The expander MUST be present on every row, including leaves, and MUST occupy its 16 px slot on a leaf so that labels at the same depth align `[src: renderTree()]` `[src: .tree__twisty]`.

**TREE-26** On a leaf — a node whose mode-filtered, filter-filtered child list is empty — the expander MUST be invisible and MUST NOT be activatable `[src: renderTree()]`.

**TREE-27** The expander MUST indicate collapsed and expanded states by rotation of a single chevron glyph, MUST NOT use two different glyphs, and the rotation MUST be animated over the fast duration token `[src: .tree__twisty]`.

**TREE-28** Activating the expander MUST toggle the node's expanded state and MUST NOT change the selection `[src: toggleTreeNode()]` `[src: wire()]`.

**TREE-29** Expander activation MUST be hit-tested before row activation, so that a pointer press landing on the expander toggles without selecting `[src: wire()]`.

### The kind icon and its colour token

**TREE-30** The kind icon and its colour MUST be looked up from a single kind-metadata table and MUST NOT be chosen per-Surface `[src: KIND_META]`. The table is:

| Kind identifier | Label | Icon | Colour token | Graph shape |
|---|---|---|---|---|
| `class` | `Class` | `i-class` | `--e-class` | rect |
| `defined` | `Defined class` | `i-defined` | `--e-defined` | rect |
| `individual` | `Individual` | `i-individual` | `--e-individual` | circle |
| `objectProperty` | `Object property` | `i-objprop` | `--e-objprop` | diamond |
| `dataProperty` | `Data property` | `i-dataprop` | `--e-dataprop` | hex |

**TREE-31** The icon MUST be tinted with the colour token for its kind and MUST NOT be tinted with the text colour `[src: renderTree()]`. Token values for both themes are specified in [`40-design-system.md`](40-design-system.md).

**TREE-32** A defined class MUST be visually distinguishable from a primitive class at row level, by icon and colour token alone, without the user having to select it `[src: KIND_META]`.

### The instance-count suffix

**TREE-33** A row MUST render a trailing count when, and only when, the node has a non-zero direct-instance count. A zero count MUST render nothing at all — not `0`, not an empty badge `[src: renderTree()]`.

**TREE-34** The direct-instance count MUST be derived as follows, in this order `[src: renderTree()]`:

| Order | Condition | Count |
|---|---|---|
| 1 | The type index holds a bucket for this IRI | The length of that bucket |
| 2 | The IRI is `demo:Order` | The total number of generated Individual records |
| 3 | The IRI is `demo:Customer` | The total number of generated customers |
| 4 | Otherwise | 0 |

**TREE-35** The count MUST be the *direct* instance count. It MUST NOT include instances of subclasses, and the tree MUST NOT display an inherited or entailed instance count anywhere `[src: renderTree()]`.

**TREE-36** The count MUST be formatted with `en-GB` grouping separators — `12,000`, not `12000` `[src: fmt()]`.

**TREE-37** The count MUST NOT shrink or be truncated when the label is long; the label MUST yield space first `[src: .tree__meta]`.

Consequence for the fixture: counts appear on the 22 named-pizza classes (`pizza:Margherita` and its siblings) and on `demo:Order` and `demo:Customer`. They do not appear on `pizza:Country`, whose five individuals are Store Entities rather than generated records, and they do not appear on any intermediate class such as `pizza:Pizza` `[src: generateIndividuals()]` `[src: buildTBox()]`.

### The default expanded set

**TREE-38** At boot, and only at boot, exactly these five IRIs MUST be added to the expanded set `[src: DEFAULT_OPEN]` `[src: init()]`:

| # | IRI |
|---|---|
| 1 | `http://www.w3.org/2002/07/owl#Thing` |
| 2 | `pizza:DomainConcept` |
| 3 | `pizza:Food` |
| 4 | `pizza:Pizza` |
| 5 | `pizza:PizzaTopping` |

**TREE-39** The expanded set MUST be a set of IRIs shared by both modes. An IRI expanded in one mode MUST remain expanded when the user returns to that mode `[src: UI]`.

**TREE-40** The expanded set MUST NOT be persisted across application restarts; **TREE-38** MUST re-establish it on every boot `[src: init()]`.

**TREE-41** Expanding a node MUST NOT load anything. The child list already exists in the Store, so expansion is a rendering decision and MUST NOT be asynchronous `[src: treeChildren()]`.

### Descendant count

**TREE-42** The descendant count of a node MUST be computed as the total number of nodes in its mode-filtered subtree, excluding the node itself, by summing `1 + descendantCount(child)` over the mode-filtered children `[src: subtreeSize()]`.

**TREE-43** The descendant count MUST be computed with the same child-filtering rule as rendering, so that the figure shown in the inspector agrees with what the tree would actually draw if fully expanded `[src: subtreeSize()]` `[src: treeChildren()]`.

**TREE-44** The descendant count MUST be recomputed on demand and MUST NOT be cached, because rename, create and delete all invalidate it `[src: renderInspector()]`.

**TREE-45** Where an Entity has multiple parents, the descendant count counts it once per path. Implementations MUST NOT de-duplicate, so that the descendant figure matches the number of rows the tree would render `[src: subtreeSize()]`.

---

## Filtering

The tree filter is a substring filter over Entity names within the active mode, with ancestor retention so that a match is always reachable.

### Matching

**TREE-46** The filter MUST match case-insensitively against the Entity's local name — its mutable `name` field — and MUST NOT match against the full IRI, the namespace prefix, the `rdfs:comment` annotation, or any axiom text `[src: computeFilter()]`.

**TREE-47** The match MUST be an unanchored substring test. `top` MUST match `PizzaTopping`, `TomatoTopping` and `SpicyTopping` `[src: computeFilter()]`.

**TREE-48** Only Entities of the active mode's kinds MUST be eligible to match: class and defined class in `classes` mode; object property and data property in `properties` mode `[src: computeFilter()]`.

**TREE-49** An empty filter string MUST clear the visible set entirely, restoring the unfiltered tree. The implementation MUST distinguish "no filter" from "a filter that matched nothing" `[src: computeFilter()]`.

### Ancestor retention

**TREE-50** For each matched Entity, that Entity and every transitive ancestor reachable through its parent links MUST be added to the visible set, so that no match is orphaned below a hidden parent `[src: computeFilter()]`.

**TREE-51** Ancestor retention MUST follow every parent of a multi-parent Entity, not only the first `[src: computeFilter()]`.

**TREE-52** Ancestor walk-up MUST be memoised against the visible set — a node already in the set terminates the walk — so the cost of a filter pass is linear in the number of Entities plus the number of distinct ancestor edges `[src: computeFilter()]`.

**TREE-53** Rendering MUST skip any node not in the visible set, and MUST also filter each node's child list to the visible set, so that a retained ancestor shows only the branches that lead to matches `[src: renderTree()]`.

### Automatic expansion

**TREE-54** Every matched Entity MUST be added to the expanded set, so that a match with children opens to show them `[src: computeFilter()]`.

**TREE-55** Every parent of every node in the visible set MUST be added to the expanded set, so that the whole path from the root down to each match is open `[src: computeFilter()]`.

**TREE-56** Automatic expansion MUST mutate the shared expanded set. The consequence — that clearing the filter leaves the tree more open than it was before — is the specified behaviour and MUST NOT be reverted on clear `[src: computeFilter()]`.

### Highlight

**TREE-57** A row whose Entity is itself a match MUST be highlighted; a row retained only because it is an ancestor MUST NOT be highlighted `[src: renderTree()]`.

**TREE-58** The match highlight MUST be a subtle background tint behind the label text using the accent-subtle token with a 2 px corner radius, MUST NOT be a bold weight, and MUST NOT replace or compete with the selection highlight `[src: .tree__row.is-match]`.

**TREE-59** The implementation MUST retain the set of matches separately from the set of visible nodes, because the two differ precisely by the retained ancestors `[src: computeFilter()]`.

**TREE-60** The highlight MUST mark the whole row's label, not the matched character range within it. Sub-string character highlighting is **Status:** specified, not implemented in the reference build. Where implemented, it MUST highlight every occurrence of the query within the label.

### Debounce and cost

**TREE-61** Filter input MUST be debounced by exactly 140 ms of keystroke quiescence before the filter string is applied `[src: wire()]`.

**TREE-62** The filter string MUST be trimmed of leading and trailing whitespace before use `[src: wire()]`.

**TREE-63** A filter pass MUST be a single linear scan of the Entity collection, followed by the ancestor walk. It MUST NOT re-scan per row, and MUST complete within 16 ms for a TBox of 10,000 Entities `[src: computeFilter()]`.

**TREE-64** The filter MUST be recomputed at the start of every tree render rather than held as an independent cache, so that a rename or a create can never leave a stale visible set behind `[src: renderTree()]`.

### Empty result

**TREE-65** When a filter is active and the visible set produces no rows, the tree MUST render an empty state in place of the rows, with this exact copy `[src: renderTree()]`:

> **No match**
>
> Nothing in the class hierarchy matches that filter. Clear it to see everything again.

**TREE-66** In `properties` mode the word `class` in that sentence MUST be replaced by `property`, giving exactly `Nothing in the property hierarchy matches that filter. Clear it to see everything again.` `[src: renderTree()]`.

**TREE-67** The empty state MUST name the remedy (clear the filter) and MUST NOT merely report absence. This is an instance of the cause-and-remedy principle stated in **TREE-98**.

---

## Selection and reveal

**TREE-68** A single activation of a tree row (primary pointer press, or keyboard navigation onto it) MUST select the row's Entity without revealing it in the graph, and MUST NOT modify the Viewport `[src: wire()]`.

**TREE-69** A double activation of a tree row MUST select the Entity *and* reveal it in the graph `[src: wire()]`.

**TREE-70** Reveal MUST perform exactly these steps `[src: revealInGraph()]`:

| Step | Condition | Effect |
|---|---|---|
| 1 | The IRI is not in the Viewport | Add it to the Viewport at distance 0 |
| 2 | The IRI is not in the Viewport | Add it to the Focus set |
| 3 | The IRI is not in the Viewport | Report the Budget outcome of the add honestly, per [`20-graph-viewport-and-budget.md`](20-graph-viewport-and-budget.md) |
| 4 | The IRI is not in the Viewport | Expand it, capped at `min(80, Budget)` neighbours |
| 5 | The IRI is not in the Viewport | Fit the view to the new content |
| 6 | Always | Set the Viewport's selected node to the IRI |
| 7 | The node exists | Raise zoom to at least 0.8 if it is below, then centre the viewpoint on the node |
| 8 | Always | Refresh the Budget readout |

**TREE-71** Reveal of an Entity already in the Viewport MUST NOT re-expand it and MUST NOT evict anything; it MUST only recentre and select `[src: revealInGraph()]`.

**TREE-72** Reveal MUST NOT reduce the zoom level. If the user is zoomed in beyond 0.8, that zoom MUST be preserved `[src: revealInGraph()]`.

### Highlight refresh without re-render

**TREE-73** Changing the selection MUST NOT cause a full tree render. The implementation MUST provide a selection-only refresh that walks the existing rows and updates the selected flag on each `[src: renderTreeSelection()]`.

**TREE-74** The selection-only refresh MUST set the selected state on exactly the row whose IRI equals the selection and clear it on every other row, tolerating the case where no row matches (the selected Entity is filtered out, collapsed under a closed parent, or is an Individual that the tree never shows) `[src: renderTreeSelection()]`.

**TREE-75** Operations that change *structure* — expand, collapse, filter, rename, create, delete, mode switch — MUST perform a full tree render. Operations that change only *which row is selected* MUST NOT `[src: toggleTreeNode()]` `[src: selectEntity()]`.

**TREE-76** The selected row MUST be indicated by a filled background using the selected-layer token and a semi-bold label, and the count suffix on a selected row MUST switch from secondary to primary text colour `[src: .tree__row.is-selected]`.

**TREE-77** Selecting an Entity that is not currently rendered as a row (because its ancestors are collapsed, or the filter excludes it) MUST still update the inspector and the status readout. Automatic scroll-to-and-expand-to-reveal of the selected Entity in the tree is **Status:** specified, not implemented in the reference build. Where implemented, it MUST expand the ancestor chain, render, and scroll the row into view with nearest-edge alignment.

---

## Keyboard model

The tree pane is a single tab stop. Within it, arrow keys move selection; the rows themselves are not individual tab stops.

**TREE-78** The tree region MUST be a single stop in the tab order, and individual rows MUST NOT be reachable by Tab `[src: renderTree()]` `[src: #treePane]`.

**TREE-79** The tab order within the hierarchy pane MUST be: mode tabs, then the filter field, then the add-class button, then the tree region `[src: #leftPanel]`.

**TREE-80** The following bindings MUST be implemented when focus is inside the tree region:

| Key | Condition | Effect | Scroll obligation | Source |
|---|---|---|---|---|
| `ArrowDown` | A row after the current selection exists | Select the next row in rendered order | MUST scroll the newly selected row into view with nearest-edge alignment | `[src: wire()]` |
| `ArrowUp` | A row before the current selection exists | Select the previous row in rendered order | MUST scroll the newly selected row into view with nearest-edge alignment | `[src: wire()]` |
| `ArrowRight` | A selection exists | Add the selection to the expanded set and re-render | None in the reference build | `[src: wire()]` |
| `ArrowLeft` | A selection exists | Remove the selection from the expanded set and re-render | None in the reference build | `[src: wire()]` |
| `Enter` | A selection exists | Select and reveal in the graph | None | `[src: wire()]` |
| `F2` | A selection exists, anywhere in the application, and focus is not in a text control | Begin inline rename of the selection | The row must be rendered for rename to begin | `[src: wire()]` |
| `Delete` | The selection resolves to a Store Entity **and** is *not* currently in the Viewport | Open the delete-class confirmation | None | `[src: wire()]` |
| `Ctrl+F` | Always | Move focus to global search and select its contents | None | `[src: wire()]` |
| `Ctrl+Z` | Focus is not in a text control | Undo the last recorded operation | None | `[src: wire()]` |
| `Escape` | Always | Close any open menu and any open dialog | None | `[src: wire()]` |

**TREE-81** `ArrowDown` with no selection at all MUST select the first rendered row `[src: wire()]`.

**TREE-82** `ArrowUp` at the first row and `ArrowDown` at the last row MUST be no-ops and MUST NOT wrap `[src: wire()]`.

**TREE-83** Arrow navigation MUST operate over the *rendered* row order — the flattened, filtered, expansion-aware list — and MUST NOT navigate the underlying hierarchy `[src: wire()]`.

**TREE-84** `ArrowDown` and `ArrowUp` MUST suppress the default scroll behaviour of the containing scroll region and perform their own nearest-edge scroll-into-view `[src: wire()]`.

**TREE-85** The `Delete` binding MUST be inhibited while the selected Entity is present in the Viewport, because `Delete` is bound to "remove from view" on the graph Surface and the two meanings MUST NOT collide `[src: wire()]`.

**TREE-86** No keyboard binding in the tree may trigger a Store mutation without an explicit confirmation step, except rename, which is itself an explicit, visible, reversible edit `[src: wire()]`.

### Bindings specified but not implemented

**Status:** specified, not implemented in the reference build.

**TREE-87** `ArrowRight` on an expanded node with children SHOULD move selection to the first child rather than re-expanding; `ArrowRight` on a leaf SHOULD be a no-op.

**TREE-88** `ArrowLeft` on a collapsed node SHOULD move selection to its parent.

**TREE-89** `Home` SHOULD select the first rendered row and `End` the last.

**TREE-90** Typeahead SHOULD select the next row whose label starts with the typed prefix, with a 1,000 ms accumulation window.

**TREE-91** `ArrowRight` and `ArrowLeft` SHOULD scroll the affected row into view after the re-render, matching **TREE-84**.

---

## Rename

**TREE-92** Rename MUST be an in-place edit on the tree row: the label is replaced by a single-line text editor pre-filled with the current name and with its contents selected, so that typing replaces and a caret click appends `[src: beginRename()]`.

**TREE-93** Rename MUST be reachable from exactly two places: the `F2` key with a selection, and the rename button in the inspector panel header `[src: wire()]`.

**TREE-94** The rename button MUST act only on IRIs that resolve to a Store Entity. A generated Individual or customer MUST NOT be renameable, because its label is derived from generated record fields and has nowhere to be stored `[src: wire()]` `[src: resolve()]`.

**TREE-95** The rename editor MUST carry an accessible name of exactly `Rename ` followed by the current Entity name `[src: beginRename()]`.

**TREE-96** Rename commit and cancel semantics MUST be exactly:

| Trigger | Validation | Outcome | Source |
|---|---|---|---|
| `Enter` | Runs | On pass: commit. On fail: keep the editor open, mark it invalid, announce the message | `[src: beginRename()]` `[src: commitRename()]` |
| `Escape` | Not run | Discard the edit, re-render the tree, keep the old name; the key press MUST NOT propagate to the global `Escape` handler | `[src: beginRename()]` |
| Loss of focus | Runs | On pass: commit silently. On fail: **discard silently** — re-render with the old name and show no message | `[src: commitRename()]` |
| Editor value equals current name | Runs | No mutation, no undo record, no version bump; tree and inspector still re-render | `[src: commitRename()]` |

**TREE-97** The silent-commit-on-blur rule MUST be implemented exactly as stated: a blur with an *invalid* value MUST NOT raise an error message, because the user has already left the control and an error they cannot see is noise. A blur with a *valid, changed* value MUST commit `[src: commitRename()]`.

**TREE-98** An error message raised by rename MUST name the cause and the remedy. A message that says only that the input is invalid is non-conformant. This principle binds every validation message in this document and in [`31-individuals-table.md`](31-individuals-table.md) `[src: validateName()]`.

**TREE-99** On a failed non-silent commit the editor MUST be marked invalid in the accessibility tree, MUST show a 2 px danger-coloured error outline, and the message MUST be surfaced as a transient warning notification that persists for 6,000 ms `[src: commitRename()]` `[src: setStatusMessage()]` `[src: showToast()]`.

**TREE-100** A successful commit MUST perform exactly these effects, in this order `[src: commitRename()]`:

| Step | Effect |
|---|---|
| 1 | Push an undo record `{ kind: rename, iri, from: <previous name> }` — only when the name actually changed |
| 2 | Write the new name to the Entity record |
| 3 | Increment the Store version counter |
| 4 | Re-render the tree in full |
| 5 | Re-render the inspector in full |
| 6 | Write the new label onto every Viewport node whose IRI matches |

**TREE-101** Rename MUST change the Entity's display name only. It MUST NOT change the IRI, MUST NOT rewrite any triple in the TBox, and MUST NOT alter the type index, the reverse-restriction index or the flattened restriction index `[src: commitRename()]`.

**TREE-102** The specification records the consequence honestly: after a rename, the tree label and the inspector header show the new name while the inspector's IRI line, every axiom link, every shortened form and every SPARQL result still show the original local name. This is the reference behaviour and MUST be reproduced `[src: commitRename()]` `[src: shorten()]`.

**TREE-103** Propagation of a rename MUST reach every dependent Surface:

| Surface | Obligation | Source |
|---|---|---|
| Hierarchy tree | Full re-render; the row label shows the new name | `[src: commitRename()]` |
| Entity inspector | Full re-render; the header name shows the new name | `[src: commitRename()]` |
| Graph Viewport | Every node holding the old label MUST be updated in place; no relayout, no eviction, no Budget change | `[src: commitRename()]` |
| Status bar | The selection readout MUST show the new label on the next selection event | `[src: selectEntity()]` |
| Individuals table | No obligation; the table renders Individual local names, which rename does not touch | `[src: COLS]` |
| Global search | No obligation beyond reading the Store; the next query matches the new name | `[src: searchEntities()]` |

**TREE-104** Undo of a rename MUST restore the previous name, re-render tree and inspector, and restore the label on the matching Viewport node `[src: undo()]`.

**TREE-105** The undo stack MUST be a last-in-first-out list with no cap in the reference build. A bounded stack is permitted; if bounded, the bound MUST be at least 100 operations `[src: UI]`.

---

## Name validation

Name validation is shared by rename and by class creation. It MUST be one function with one set of messages.

**TREE-106** Validation MUST run the following rules in exactly this order and MUST return the first failure's message verbatim `[src: validateName()]`:

| # | Condition (on the trimmed input) | Verbatim message |
|---|---|---|
| 1 | The input is empty | `A name is required.` |
| 2 | The input contains any whitespace character | `Names cannot contain spaces — use CamelCase, as the rest of the ontology does.` |
| 3 | The input does not match `^[A-Za-z][A-Za-z0-9_-]*$` | `Start with a letter; use letters, digits, hyphen or underscore only.` |
| 4 | Another Entity, excluding the Entity being renamed, already has this exact name | `An entity named <name> already exists at <prefixed IRI>.` |
| — | All rules pass | No message; the name is accepted |

**TREE-107** The whitespace rule MUST state the reason — that the ontology uses CamelCase — and MUST NOT merely forbid the character. Stating the convention is what makes the message actionable `[src: validateName()]`.

**TREE-108** The character rule MUST permit exactly: an initial ASCII letter, followed by any number of ASCII letters, ASCII digits, underscore and hyphen. It MUST reject a leading digit, a leading underscore, a leading hyphen, a colon, a dot, a slash, a hash, and every non-ASCII letter `[src: validateName()]`.

**TREE-109** The uniqueness rule MUST compare names, not IRIs, exactly and case-sensitively, over every Entity in the Store `[src: validateName()]`.

**TREE-110** The uniqueness message MUST embed both the offending name and the prefixed form of the *conflicting* Entity's IRI, so that the user can navigate to the conflict. The prefixed form MUST use the registered prefixes — for example `An entity named TomatoTopping already exists at pizza:TomatoTopping.` `[src: validateName()]` `[src: shorten()]`.

**TREE-111** Uniqueness MUST be evaluated against Store Entities only. Generated Individuals and generated customers are not Entities and MUST NOT participate `[src: validateName()]` `[src: resolve()]`.

**TREE-112** When renaming, the Entity being renamed MUST be excluded from the uniqueness scan, so that committing a name unchanged is not reported as a conflict `[src: validateName()]`.

**TREE-113** Input MUST be trimmed before validation, so that a trailing space never produces the whitespace error `[src: beginRename()]` `[src: newClassDialog()]`.

**TREE-114** No validation message may be the word "invalid", or any variant of it, on its own. Every message MUST identify what is wrong and what to do instead. This is the cause-and-remedy principle `[src: validateName()]`.

---

## Create a class

**TREE-115** Class creation MUST be reachable from two places: the add button in the hierarchy pane toolbar, and the New Class command on the command bar `[src: wire()]` `[src: #treeAdd]` `[src: #cmdNewClass]`.

### Dialog fields

| Field | Control | Required | Default | Source |
|---|---|---|---|---|
| Class name | Single-line text, autocomplete off, placeholder `e.g. TruffleTopping` | Yes, marked with a danger-coloured asterisk and an accessible `required` | Empty | `[src: newClassDialog()]` |
| Superclass | Single-select list of every class and defined class in the Store, sorted ascending by name | Yes | Derived — see **TREE-118** | `[src: newClassDialog()]` |

**TREE-116** The dialog title MUST be exactly `New class` `[src: newClassDialog()]`.

**TREE-117** The dialog MUST carry this explanatory line verbatim, immediately under the title `[src: newClassDialog()]`:

> The new class is asserted as a subclass of the selection. Nothing else in the ontology changes.

**TREE-118** The superclass default MUST be derived from the current selection: if the selection resolves to a Store Entity whose kind is class or defined class, that Entity; otherwise `owl:Thing` `[src: newClassDialog()]`.

**TREE-119** The superclass list MUST contain every class and defined class, including `owl:Thing`, sorted ascending by name with locale-aware comparison, and MUST show names rather than IRIs `[src: newClassDialog()]`.

**TREE-120** The action buttons MUST be exactly `Cancel` (outline) and `Create class` (primary), in that order `[src: newClassDialog()]`.

**TREE-121** On open, focus MUST move to the first focusable control in the dialog — the name field `[src: openDialog()]`.

### Validation timing

**TREE-122** The name field MUST be validated on loss of focus and again on commit. It MUST NOT be validated on every keystroke `[src: newClassDialog()]`.

**TREE-123** On blur validation, the field MUST be marked invalid only when the input is *both* non-empty and failing. An empty field on blur MUST NOT be marked invalid, because the user has not yet made an error — they have merely not finished `[src: newClassDialog()]`.

**TREE-124** On blur validation, the error text MUST be written into the field's error slot and cleared when validation passes `[src: newClassDialog()]`.

**TREE-125** On commit with a failing name, the dialog MUST mark the name row invalid, write the verbatim message into the error slot, return focus to the name field, and MUST NOT close `[src: newClassDialog()]`.

**TREE-126** `Enter` pressed in the name field MUST be equivalent to activating `Create class` `[src: newClassDialog()]`.

**TREE-127** The error slot MUST be announced as a live region, so that a commit failure is spoken without the user hunting for it `[src: newClassDialog()]`.

### Store mutations

**TREE-128** A successful commit MUST perform exactly these mutations, in this order `[src: newClassDialog()]`:

| Step | Mutation |
|---|---|
| 1 | Create an Entity with IRI `pizza:<name>`, kind class, and `rdfs:comment` exactly `Added in this session.` |
| 2 | Set the new Entity's parent list to exactly the chosen superclass |
| 3 | Append the new IRI to the superclass's child list |
| 4 | Re-sort the superclass's child list ascending by local name |
| 5 | Append the triple `<new IRI> rdfs:subClassOf <superclass IRI>` to the TBox |
| 6 | Push the undo record `{ kind: newClass, iri, parent }` |
| 7 | Increment the Store version counter |
| 8 | Add the superclass to the expanded set |
| 9 | Rebuild the reverse-restriction index |

**TREE-129** The new class MUST be minted in the `pizza:` namespace regardless of the superclass's namespace. The specification records this honestly: creating a subclass of `demo:Order` produces `pizza:<name>`, a `pizza:` Entity with a `demo:` parent `[src: newClassDialog()]`. A conformant implementation MUST reproduce this or MUST make the namespace an explicit dialog field; it MUST NOT silently choose a different namespace.

**TREE-130** Creation MUST NOT write an `rdf:type owl:Class` triple, MUST NOT write an `rdfs:comment` triple, and MUST NOT rebuild the flattened restriction index — the new class carries no restrictions `[src: newClassDialog()]` `[src: buildRBox()]`.

**TREE-131** Only the reverse-restriction index MUST be rebuilt after creation, because the child-list and parent-list mutations are made in place `[src: newClassDialog()]` `[src: buildReverseIndex()]`.

### Post-commit behaviour

**TREE-132** After a successful commit the implementation MUST, in this order `[src: newClassDialog()]`:

| Step | Effect |
|---|---|
| 1 | Close the dialog |
| 2 | Re-render the tree in full |
| 3 | Refresh the Store statistics readout |
| 4 | Select the new class **and reveal it in the graph** |
| 5 | Show a confirmation notification |

**TREE-133** The parent MUST already be in the expanded set before the tree re-renders, so that the new class is visible in the tree without further user action `[src: newClassDialog()]`.

**TREE-134** The confirmation notification MUST read exactly `Created <prefixed new IRI> as a subclass of <prefixed parent IRI>.` and MUST use the informational, not the warning, treatment — for example `Created pizza:TruffleTopping as a subclass of pizza:PizzaTopping.` `[src: newClassDialog()]`.

**TREE-135** Reveal MUST be performed through the standard reveal path of **TREE-70**, which means the new class enters the Focus set and is expanded up to `min(80, Budget)` neighbours — for a brand-new class, one parent `[src: newClassDialog()]` `[src: revealInGraph()]`.

**TREE-136** Undo of a create MUST remove the new IRI from its parent's child list, delete the Entity, remove it from the Viewport, then re-render tree, inspector, Store statistics and Budget readout `[src: undo()]`.

**TREE-137** The specification records honestly that undo of a create does **not** remove the `rdfs:subClassOf` triple written in step 5 of **TREE-128**, and does not rebuild the reverse-restriction index `[src: undo()]`. A conformant implementation SHOULD remove the triple and rebuild the index; the resulting triple count MUST then return to its pre-create value.

---

## Delete a class

**TREE-138** Deletion MUST be reachable from the `Delete` key with an eligible selection. It MUST always require confirmation `[src: wire()]` `[src: deleteSelected()]`.

### Eligibility

**TREE-139** An Entity MUST be eligible for deletion only when it resolves in the Store *and* its kind is class or defined class `[src: deleteSelected()]`.

**TREE-140** When the selection is not eligible, the implementation MUST NOT open the dialog and MUST show this warning notification verbatim: `Select a class in the hierarchy to delete it.` `[src: deleteSelected()]`.

**TREE-141** Properties, Individuals, generated records and customers MUST NOT be deletable through this path `[src: deleteSelected()]`.

**TREE-142** `owl:Thing` MUST NOT be deletable. **Status:** specified, not implemented in the reference build — the reference build treats `owl:Thing` as an eligible class and fails when it composes the confirmation body, because the root has no parent to reparent to `[src: deleteSelected()]`. A conformant implementation MUST reject deletion of the root with a message naming the cause.

### Confirmation dialog

**TREE-143** The dialog title MUST be exactly `Delete <name>?` using the Entity's current display name `[src: deleteSelected()]`.

**TREE-144** The dialog body MUST state the actual consequence in numbers. It MUST be composed exactly as follows `[src: deleteSelected()]`:

| Case | Verbatim body |
|---|---|
| Subclasses > 0 and instances > 0 | `This class has <S> subclasses and <I> direct instances. Subclasses are reparented to <parent local name>; instances keep their type assertion and will dangle.` |
| Subclasses > 0, instances = 0 | `This class has <S> subclasses. Subclasses are reparented to <parent local name>; instances keep their type assertion and will dangle.` |
| Subclasses = 0, instances > 0 | `This class has <I> direct instances. Subclasses are reparented to <parent local name>; instances keep their type assertion and will dangle.` |
| Both zero | `Nothing else references it, so this removes one class and one subClassOf axiom.` |

**TREE-145** Both counts MUST be singularised correctly: `1 subclass` / `<n> subclasses`, and `1 direct instance` / `<n> direct instances` `[src: deleteSelected()]`.

**TREE-146** Both counts MUST be formatted with `en-GB` grouping separators `[src: deleteSelected()]` `[src: fmt()]`.

**TREE-147** The subclass count MUST be the mode-filtered child count. The specification records honestly that this figure is therefore 0 while the tree is in `properties` mode, even for a class with subclasses `[src: deleteSelected()]` `[src: treeChildren()]`. A conformant implementation SHOULD count class children irrespective of the active mode.

**TREE-148** The direct-instance count MUST be the length of the type-index bucket for the class, and MUST NOT include instances of its subclasses `[src: deleteSelected()]`.

**TREE-149** The reparent target named in the body MUST be the *local name* of the class's first parent `[src: deleteSelected()]`.

**TREE-150** The action buttons MUST be exactly `Cancel` (outline) and `Delete class`, and the destructive button MUST be filled with the danger colour token `[src: deleteSelected()]`.

**TREE-151** The dialog MUST NOT default focus to the destructive button; focus MUST go to the first focusable control `[src: openDialog()]`.

### Deletion semantics

**TREE-152** On confirmation the implementation MUST perform exactly these operations, in this order `[src: deleteSelected()]`:

| Step | Operation |
|---|---|
| 1 | Resolve the reparent target: the class's first parent, or `owl:Thing` if it has none |
| 2 | For every child: replace this class with the reparent target in the child's parent list |
| 3 | For every child: append the child to the reparent target's child list |
| 4 | Remove this class from the reparent target's child list |
| 5 | Delete the Entity record |
| 6 | Remove every TBox triple whose subject **or** object is this IRI |
| 7 | Rebuild the reverse-restriction index |
| 8 | Rebuild the flattened restriction index |
| 9 | Remove the IRI from the Viewport |
| 10 | Clear the selection |
| 11 | Increment the Store version counter |
| 12 | Close the dialog |
| 13 | Re-render tree, inspector, Store statistics and Budget readout |
| 14 | Show the confirmation notification |

**TREE-153** Reparenting MUST preserve every other parent a child holds. Only the deleted class is replaced in the child's parent list `[src: deleteSelected()]`.

**TREE-154** Triple removal MUST match on subject and object position only. A triple whose *predicate* is the deleted IRI MUST be left in place; this is the reference behaviour and is correct for classes, which never occupy predicate position `[src: deleteSelected()]`.

**TREE-155** The implementation MUST rebuild both the reverse-restriction index and the flattened restriction index after a delete, because a restriction may have pointed at the deleted class `[src: deleteSelected()]` `[src: buildReverseIndex()]` `[src: buildRBox()]`.

**TREE-156** Viewport removal MUST go through the standard remove path, which also unlinks the node's edges and drops it from the Focus set `[src: removeFromView()]`.

**TREE-157** The confirmation notification MUST read exactly `Deleted <prefixed IRI>.` with the informational treatment — for example `Deleted pizza:IceCream.` `[src: deleteSelected()]`.

**TREE-158** Deletion MUST state, and MUST honour, the honest consequence: **instances keep their type assertion**. The type index is not rewritten, the generated records still name the deleted class as their type, and those instances are left dangling. The implementation MUST NOT silently delete instances, and MUST NOT silently retype them `[src: deleteSelected()]`.

**TREE-159** Deletion MUST NOT push an undo record in the reference build; deletion is therefore not undoable `[src: deleteSelected()]` `[src: undo()]`. A conformant implementation SHOULD record a reversible delete. Until it does, the confirmation dialog is the only safeguard, which is why **TREE-138** makes it mandatory.

**TREE-160** After deletion the child list of the reparent target MUST be re-sorted ascending by local name. **Status:** specified, not implemented in the reference build — the reference appends reparented children without re-sorting, so their rows appear after the target's existing children rather than in alphabetical order `[src: deleteSelected()]`.

---

## The Entity inspector

The inspector renders one Entity in full. It is rebuilt from scratch on every selection change and on every mutation; it holds no state `[src: renderInspector()]`.

**TREE-161** The inspector MUST resolve the selected IRI through the shared resolver, which returns, in order: a Store Entity; a synthetic record for a generated Individual; a synthetic record for a generated customer; or nothing `[src: resolve()]`.

**TREE-162** When the IRI resolves to nothing, or no IRI is selected, the inspector MUST render the empty state of **TREE-238** and MUST render nothing else `[src: renderInspector()]`.

### Section model

**TREE-163** Sections MUST be rendered in exactly this order, with exactly these visibility conditions `[src: renderInspector()]`:

| # | Section | Heading | Visible when | Empty behaviour |
|---|---|---|---|---|
| 1 | Header | — (no heading) | Always | Never empty |
| 2 | IRI | — (no heading) | Always | Never empty |
| 3 | Annotations | `Annotations` | The Entity has a non-empty `rdfs:comment` | Section omitted entirely |
| 4 | Equivalent to | `Equivalent to` | The Entity has one or more equivalence expressions | Section omitted entirely |
| 5 | SubClass of | `SubClass of` | The Entity has one or more parents | Section omitted entirely; restrictions are rendered inside it and never alone |
| 6 | Types | `Types` | The Entity has one or more asserted types | Section omitted entirely |
| 7 | Property assertions (order) | `Property assertions` | The IRI resolved to a generated Individual record | Never empty when visible |
| 8 | Toppings entailed by its type | `Toppings entailed by its type` | The Individual's type has a non-empty topping list in the named-pizza table | Section omitted entirely |
| 9 | Property assertions (customer) | `Property assertions` | The IRI resolved to a generated customer | Never empty when visible |
| 10 | Orders | `Orders` | The IRI resolved to a generated customer | Never empty when visible; the count may be 0 |
| 11 | Disjoint with | `Disjoint with` | The Entity has one or more disjointness axioms | Section omitted entirely |
| 12 | Property axioms | `Property axioms` | The Entity's kind is object property or data property | Section omitted entirely when the property has no domain, range, inverse or characteristics |
| 13 | Usage | `Usage` | The Entity's kind is class or defined class | Never empty when visible; figures may be 0 |
| 14 | Inferred axioms | `Inferred axioms` | Always | Never empty — it always states that no reasoner has run |

**TREE-164** A section whose body is empty MUST be omitted entirely — heading, rule and all. The inspector MUST NOT render an empty section with a "none" placeholder `[src: section()]`.

**TREE-165** Every section heading MUST be rendered in caption size, semi-bold, upper case, with 0.02em tracking in secondary text colour, followed by a 1 px divider rule that fills the remaining width `[src: .section__title]` `[src: .section__rule]`.

**TREE-166** A section MAY carry one trailing chip in its heading row. In the reference build exactly one section uses it: section 8, whose chip reads `from <type local name>` — for example `from Margherita` `[src: section()]` `[src: renderInspector()]`.

### Section 1 — header

**TREE-167** The header MUST contain, in this order: the kind icon tinted with the kind colour token; the Entity's display label in display-face, subtitle size, semi-bold, wrapping anywhere rather than overflowing; then a chip row `[src: renderInspector()]`.

**TREE-168** The chip row MUST always contain a kind chip: a solid dot filled with the kind colour token followed by the kind's label from the kind-metadata table — `Class`, `Defined class`, `Individual`, `Object property`, `Data property` `[src: renderInspector()]` `[src: KIND_META]`.

**TREE-169** The chip row MUST contain a second chip reading exactly `generated demo data` when, and only when, the Entity's namespace marker is `demo` `[src: renderInspector()]`.

**TREE-170** The generated-data chip MUST be present on every `demo:` Entity, including `demo:Order`, `demo:Customer`, the five `demo:` data properties, `demo:orderedBy`, every generated Individual and every generated customer. It MUST NOT appear on any `pizza:` Entity or on `owl:Thing` `[src: addEntity()]` `[src: resolve()]` `[src: renderInspector()]`.

### Section 2 — IRI

**TREE-171** The full, unshortened IRI MUST be rendered in the monospace face at caption size in secondary text colour, wrapping anywhere, with 10 px of space above it `[src: renderInspector()]` `[src: .inspector__iri]`.

**TREE-172** The IRI line MUST NOT be abbreviated, MUST NOT be truncated, and MUST NOT be a link `[src: renderInspector()]`.

### Section 3 — annotations

**TREE-173** The annotation section MUST render one axiom row with the kind marker `rdfs:comment` and the comment text set in the UI face, not the monospace face, because it is prose `[src: renderInspector()]`.

### Sections 4 and 5 — equivalences, superclasses and restrictions

**TREE-174** Equivalences MUST be rendered as a single axiom row with the kind marker `≡`, whose parts are joined by a line break followed by the word `and ` `[src: renderInspector()]`.

**TREE-175** Superclasses MUST be rendered as one axiom row per parent with the kind marker `⊑`, followed by one axiom row per restriction, also with `⊑` `[src: renderInspector()]`.

**TREE-176** Restrictions MUST be rendered in a Manchester-like syntax produced by exactly these rules `[src: restrictionText()]`:

| Expression kind | Rendered as | Example |
|---|---|---|
| A bare class | The prefixed class IRI | `pizza:PizzaTopping` |
| A negation | `not ` then the prefixed class IRI | `not pizza:MeatTopping` |
| A value restriction | `<prop> value <filler>` | `pizza:hasCountryOfOrigin value pizza:Italy` |
| A `max` restriction with no filler | `<prop> max <n>` | `pizza:hasCountryOfOrigin max 1` |
| A restriction whose filler is a list | `<prop> only (<f1> or <f2> or …)` | `pizza:hasTopping only (pizza:MozzarellaTopping or pizza:TomatoTopping)` |
| A cardinality-qualified restriction | `<prop> <quantifier> <n> <filler>` | `pizza:hasTopping min 3 pizza:PizzaTopping` |
| Any other restriction | `<prop> <quantifier> <filler>` | `pizza:hasBase some pizza:PizzaBase` |

**TREE-177** Within a rendered restriction, every filler IRI MUST be converted into an activatable Entity link, and the property IRI MUST be converted into an activatable Entity link `[src: renderInspector()]`.

**TREE-178** Within a rendered *equivalence*, filler IRIs MUST be linked but the property IRI MUST NOT be. This asymmetry is the reference behaviour and MUST be reproduced, or corrected by linking the property in both places; it MUST NOT be corrected by removing the links from restrictions `[src: renderInspector()]`.

**TREE-179** Axiom rows MUST be set in the monospace face at code size with a line height of 1.5, MUST wrap anywhere rather than overflow, and MUST show a hover background `[src: .axiom]`.

**TREE-180** The kind marker MUST occupy a fixed leading slot in secondary text colour and MUST NOT shrink `[src: .axiom__kind]`.

### Section 6 — types

**TREE-181** Asserted types MUST be rendered one axiom row per type with the kind marker `a`, each an activatable Entity link `[src: renderInspector()]`.

**TREE-182** A generated Individual MUST report exactly one type — its generated type IRI. A generated customer MUST report exactly one type — `demo:Customer` `[src: resolve()]`.

### Sections 7 and 8 — a generated Individual

**TREE-183** For a generated Individual, property assertions MUST be rendered in exactly this order, one axiom row each `[src: renderInspector()]`:

| Order | Kind marker | Value format | Example |
|---|---|---|---|
| 1 | `demo:orderRef` | The record's order reference, verbatim | `AX-100042` |
| 2 | `demo:branch` | The record's branch name, verbatim | `Shoreditch` |
| 3 | `demo:priceGBP` | Pound sign then the amount to exactly two decimal places, never wrapped | `£12.50` |
| 4 | `demo:rating` | The integer, then ` / 5` | `4 / 5` |
| 5 | `demo:preparedAt` | `en-GB` date-time: two-digit day, short month, two-digit hour and minute | `04 Aug, 09:31` |
| 6 | `demo:orderedBy` | An Entity link to the customer IRI, then the customer's person name in secondary text colour | `demo:Customer_000007 Ada Rossi` |

**TREE-184** Row 6 MUST be omitted when the record's customer index does not resolve; rows 1 to 5 MUST always be present for a generated Individual `[src: renderInspector()]`.

**TREE-185** The entailed-toppings section MUST be rendered when the Individual's type name has a non-empty entry in the named-pizza topping table. It MUST render one axiom row per topping with the kind marker `hasTopping`, each an activatable link to the `pizza:` topping class, and MUST carry the heading chip `from <type local name>` `[src: renderInspector()]` `[src: NAMED_PIZZAS]`.

**TREE-186** The entailed-toppings section MUST be understood, and described in the user interface, as a projection of the *class's* asserted restrictions onto the instance. It is not a reasoner result, and the implementation MUST NOT present it as one. The chip naming the source type is what makes the provenance visible `[src: renderInspector()]`.

### Sections 9 and 10 — a generated customer

**TREE-187** For a generated customer, the property-assertions section MUST render a single axiom row with the kind marker `rdfs:label` carrying the person name `[src: renderInspector()]`.

**TREE-188** The orders section MUST render an informational note reading exactly `<n> generated orders reference this customer. Expand the node in the graph to page them in under the viewport budget.` where `<n>` is the length of the customer's order list from the customer index, formatted with `en-GB` grouping `[src: renderInspector()]` `[src: customerIndex()]`.

**TREE-189** The orders section MUST NOT list the orders. Listing instance data in the inspector is forbidden; the count plus a route to the graph or the table is the specified treatment `[src: renderInspector()]`.

### Section 11 — disjointness

**TREE-190** Disjointness MUST be rendered one axiom row per disjoint class with the kind marker `⊥`, each an activatable Entity link `[src: renderInspector()]`.

### Section 12 — property axioms

**TREE-191** For an object property or a data property, the property-axioms section MUST render, in this order and only when present `[src: renderInspector()]`:

| Order | Kind marker | Condition | Value |
|---|---|---|---|
| 1 | `Domain` | The property has a domain | Entity link to the domain class |
| 2 | `Range` | The property has a range | If the range IRI is in the XSD namespace: the prefixed form as plain text, **not** a link. Otherwise: an Entity link |
| 3 | `Inverse of` | The property has an inverse | Entity link to the inverse property |
| 4 | `Characteristics` | The property has one or more characteristics | The characteristic names joined by `, ` as plain text |

**TREE-192** Characteristic names MUST be rendered exactly as held: `Transitive`, `Functional`, `InverseFunctional` `[src: OBJ_PROPS]` `[src: renderInspector()]`.

**TREE-193** A datatype range MUST NOT be an Entity link, because a datatype is not an Entity in the Store and activating it would select nothing `[src: renderInspector()]`.

### Section 13 — usage

**TREE-194** For a class or defined class, the usage section MUST render a definition list of exactly three rows, with a fixed 104 px label column `[src: renderInspector()]` `[src: .kv]`:

| Label | Value | Derivation |
|---|---|---|
| `Subclasses` | Integer, `en-GB` grouped | The mode-filtered child count |
| `Descendants` | Integer, `en-GB` grouped | The recursive mode-filtered subtree size, excluding the class itself |
| `Direct instances` | Integer, `en-GB` grouped | The type-index bucket length, with the `demo:Order` and `demo:Customer` special cases of **TREE-34** |

**TREE-195** When the direct-instance count is greater than zero, the usage section MUST render an outline button labelled exactly `Page instances into the graph`. When the count is zero the button MUST NOT be rendered `[src: renderInspector()]`.

**TREE-196** Activating the page-instances button MUST perform exactly `[src: wire()]`:

| Step | Effect |
|---|---|
| 1 | Collect the IRIs of every record in the class's type-index bucket |
| 2 | If the class is not in the Viewport: add it to the Focus set and add it to the Viewport at distance 0 |
| 3 | Add the collected IRIs to the Viewport at distance 1, seeded at the class's node position |
| 4 | Fit the view |
| 5 | Report the outcome honestly (see **TREE-197**) |
| 6 | Refresh the Budget readout |

**TREE-197** The page-instances report MUST be composed exactly as `Paged <added> of <total> instances into the view`, then `, evicting <n>` when anything was evicted, then `. <n> stayed out — the budget is <budget>` when anything was refused, then a full stop. It MUST use the warning treatment when anything was refused and the informational treatment otherwise `[src: wire()]`.

**TREE-198** The page-instances action MUST NOT clear the Viewport. It adds to the existing view and is subject to Eviction under the Budget rules of [`20-graph-viewport-and-budget.md`](20-graph-viewport-and-budget.md) `[src: wire()]`.

### Panel header actions

**TREE-199** The inspector panel header MUST carry the title `Entity` and exactly two icon actions: rename, with the tooltip `Rename (F2)`; and reveal, with the tooltip `Reveal in graph` `[src: #inspRename]` `[src: #inspGraph]`.

**TREE-200** The rename action MUST do nothing when there is no selection, or when the selection does not resolve to a Store Entity `[src: wire()]`.

**TREE-201** The reveal action MUST perform the reveal path of **TREE-70** for any selection, including a generated Individual `[src: wire()]`.

---

## The inferred-axioms seam

**TREE-202** The inspector MUST always render a final section headed `Inferred axioms`, for every Entity of every kind, including when every other section is absent `[src: renderInspector()]`.

**TREE-203** The region MUST be visually distinguished from asserted axioms. In the reference build it is a dashed-border note block on the alternate surface, at caption size, in secondary text colour, with an information glyph `[src: .note]`.

**TREE-204** Inferred axiom rows, when they exist, MUST be marked with a 2 px leading rule in the amber defined-class colour token and a raised background, so that an inferred axiom can never be mistaken for an asserted one at a glance `[src: .axiom--inferred]`.

**TREE-205** The region MUST state plainly that no reasoner has run. The copy MUST be exactly `[src: renderInspector()]`:

> No reasoner has run. This prototype shows asserted axioms only; inferred axioms would appear here, marked with the amber rule, once a reasoner is attached.

**TREE-206** The copy MUST NOT be softened into a promise ("coming soon"), MUST NOT be hidden behind a disclosure control, and MUST NOT be removed when the section would otherwise be empty. An empty reasoning region that says nothing is indistinguishable from a reasoner that inferred nothing, and that ambiguity is the failure this requirement exists to prevent.

### What would populate it

**Status:** specified, not implemented in the reference build.

**TREE-207** When a reasoner is attached, the region MUST list, for the selected Entity, at minimum: inferred superclasses not asserted; inferred equivalences not asserted; inferred types for an Individual; inferred disjointness; and unsatisfiability.

**TREE-208** Unsatisfiability MUST be reported in the region as its own row, naming the class as equivalent to `owl:Nothing`, and MUST also be reflected on the tree row for that class. The fixture contains a deliberately unsatisfiable class, `pizza:CheeseyVegetableTopping`, whose two asserted parents are disjoint; it is the conformance case for this requirement `[src: CLASS_SPEC]`.

**TREE-209** Every inferred axiom row MUST carry a provenance affordance that names the axioms that entailed it. A row the user cannot explain is not an improvement over no row.

**TREE-210** The region MUST report the reasoner's state as one of exactly: never run; running; complete, with the wall-clock duration; failed, with the cause. It MUST NOT show stale results as though current after a Store mutation; a version-counter change MUST invalidate them `[src: store]`.

**TREE-211** Reasoning MUST NOT run on the interaction thread, MUST NOT block the tree, the inspector, the table or the console, and MUST be cancellable.

---

## IRI links in the inspector

**TREE-212** Every Entity reference rendered anywhere in the inspector MUST be activatable: parents, restriction fillers, restriction properties, equivalence fillers, types, disjoint classes, domain, range (when not a datatype), inverse, entailed toppings, and the customer of an order `[src: entityLink()]`.

**TREE-213** A link's visible text MUST be the prefixed form of the IRI — `pizza:MozzarellaTopping`, `demo:Customer_000007` — and MUST NOT be the bare local name and MUST NOT be the full IRI `[src: entityLink()]` `[src: shorten()]`.

**TREE-214** An IRI with no registered prefix MUST be rendered in angle brackets, for example `<http://example.com/x>` `[src: shorten()]`.

**TREE-215** Activating a link MUST change the selection and MUST NOT reveal in the graph, MUST NOT navigate away from the Surface, MUST NOT open a dialog, and MUST NOT alter the Viewport `[src: wire()]`.

**TREE-216** Activating a link MUST suppress any default navigation behaviour of the underlying control `[src: wire()]`.

**TREE-217** Links MUST be rendered in the accent colour without an underline at rest, and MUST underline on hover `[src: .axiom a]`.

**TREE-218** Link activation MUST be handled by one delegated handler on the inspector region rather than by per-link handlers, so that a full inspector re-render costs nothing in listener churn `[src: wire()]`.

**TREE-219** Following a link MUST NOT push a navigation history entry in the reference build. A back-and-forward selection history is **Status:** specified, not implemented in the reference build; where implemented it MUST be bounded and MUST NOT be confused with the undo stack, which records mutations only.

---

## Global search

**TREE-220** The application MUST provide a single global search field in the command bar with the placeholder `Search entities  (Ctrl+F)` — two spaces before the bracket — and the accessible name `Search entities` `[src: #globalSearch]`.

**TREE-221** `Ctrl+F` (or `Cmd+F`) MUST move focus to the field and select its existing contents, and MUST suppress the host platform's own find affordance `[src: wire()]`.

### Query and results

**TREE-222** The minimum query length MUST be 2 characters after trimming. A shorter query MUST close the result list and MUST NOT run a search `[src: wireGlobalSearch()]`.

**TREE-223** The search MUST run on every input event and on focus, with no debounce `[src: wireGlobalSearch()]`.

**TREE-224** The search MUST scan in exactly this order and MUST stop as soon as the result cap is reached `[src: searchEntities()]`:

| Order | Collection | Match condition | Result label |
|---|---|---|---|
| 1 | Store Entities | The Entity's name contains the query, case-insensitively | The Entity's name |
| 2 | Generated Individual records | The Individual's local name contains the query, **or** its order reference contains the query, case-insensitively | The order reference, then ` · `, then the type local name — for example `AX-100042 · Margherita` |

**TREE-225** Generated customers MUST NOT be searched in the reference build. The specification records this honestly: a customer is reachable only through an order's inspector link or through the graph `[src: searchEntities()]`. A conformant implementation SHOULD extend the scan to customers as a third pass, after Individuals.

**TREE-226** The Entity pass MUST complete before the Individual pass begins. TBox results MUST always outrank ABox results, because a user searching `Margherita` in a 100,000-row dataset wants the class, not an arbitrary order `[src: searchEntities()]`.

**TREE-227** The result cap MUST be 10 `[src: wireGlobalSearch()]`.

**TREE-228** The cap MUST be enforced during the scan, not after it, so that a search over a large ABox terminates early and stays interactive `[src: searchEntities()]`.

### Result presentation

**TREE-229** Each result row MUST contain, in this order: the kind icon tinted with its kind colour token; the result label, truncated with an ellipsis and filling the available width; and the kind label in the trailing key-cap style — `Class`, `Individual`, and so on `[src: wireGlobalSearch()]` `[src: KIND_META]`.

**TREE-230** The result list MUST be at least 320 px wide and MUST be positioned with its leading edge aligned to the field's leading edge and its top 4 px below the field's bottom edge, clamped to remain fully on screen `[src: wireGlobalSearch()]` `[src: openMenu()]`.

**TREE-231** When the query is long enough but matches nothing, the list MUST show a single non-activatable line reading exactly `No entity matches “<query>”` using typographic quotation marks `[src: wireGlobalSearch()]`.

### Keyboard and activation

**TREE-232** `Enter` in the search field MUST activate the first result, when one exists, and MUST close the list `[src: wireGlobalSearch()]`.

**TREE-233** `Escape` in the search field MUST close the list and remove focus from the field `[src: wireGlobalSearch()]`.

**TREE-234** Activating a result — by pointer or by `Enter` — MUST close the list and MUST **select and reveal** the result in the graph `[src: wireGlobalSearch()]`.

**TREE-235** Search reveal MUST use the standard reveal path of **TREE-70**, which means a searched-for Entity that is not in the Viewport enters the Focus set and is expanded up to `min(80, Budget)` neighbours, with honest Budget reporting `[src: revealInGraph()]`.

**TREE-236** A pointer press outside the search field and outside the result list MUST close the list `[src: wire()]`.

**TREE-237** Arrow-key navigation of the result list MUST be implemented: `ArrowDown` and `ArrowUp` move a highlighted result, `Enter` activates the highlighted one, and the highlight MUST be exposed to assistive technology as active-descendant. **Status:** specified, not implemented in the reference build — the reference offers only "activate the first result" `[src: wireGlobalSearch()]`.

---

## Empty, loading and error states

**TREE-238** The inspector's no-selection empty state MUST render a 28 px disabled-colour class glyph and exactly this copy `[src: renderInspector()]`:

> **Nothing selected**
>
> Pick a class in the hierarchy, a node in the graph, or a row in the individuals table.

**TREE-239** The inspector empty state MUST name all three routes to a selection. Naming one route only is non-conformant `[src: renderInspector()]`.

**TREE-240** The tree's filtered-to-nothing state MUST use the copy of **TREE-65** and **TREE-66**.

**TREE-241** The tree MUST NOT have a distinct "no ontology loaded" state in v1, because the fixture is always present. **Status:** specified, not implemented in the reference build — a build that supports opening files MUST add one, and its copy MUST name the action that loads an ontology.

**TREE-242** Neither pane has a loading state in the reference build: the Store is built synchronously at boot and every tree and inspector operation is synchronous `[src: init()]`. An implementation whose Store load is asynchronous MUST show a determinate progress indicator in the tree region and MUST keep the inspector in its no-selection empty state until the Store is ready; it MUST NOT show a partially-built hierarchy.

**TREE-243** Neither pane has an inline error state. Every recoverable failure MUST be surfaced as a transient notification that persists for 6,000 ms, with warning colouring for validation failures and accent colouring for informational reports `[src: showToast()]` `[src: setStatusMessage()]`.

**TREE-244** An error notification MUST NOT be the only record of a failed edit. The control that failed MUST also carry a visible invalid state until the user corrects or abandons it `[src: commitRename()]` `[src: newClassDialog()]`.

**TREE-245** A notification MUST NOT block interaction, MUST NOT require dismissal, and MUST be manually dismissable before its timeout `[src: #traceClose]`.

---

## Copy register

Every user-facing string owned by this Surface, verbatim. Copy is specification, not decoration.

| # | String | Where | Source |
|---|---|---|---|
| 1 | `Classes` | Tree mode tab | `[src: #tabClasses]` |
| 2 | `Properties` | Tree mode tab | `[src: #tabProps]` |
| 3 | `Filter hierarchy` | Tree filter placeholder and accessible name | `[src: #treeSearch]` |
| 4 | `Add subclass of selection` | Add-class button accessible name | `[src: #treeAdd]` |
| 5 | `Add subclass` | Add-class button tooltip | `[src: #treeAdd]` |
| 6 | `Class hierarchy` | Tree region accessible name | `[src: #tree]` |
| 7 | `No match` | Tree empty-state heading | `[src: renderTree()]` |
| 8 | `Nothing in the class hierarchy matches that filter. Clear it to see everything again.` | Tree empty state, classes mode | `[src: renderTree()]` |
| 9 | `Nothing in the property hierarchy matches that filter. Clear it to see everything again.` | Tree empty state, properties mode | `[src: renderTree()]` |
| 10 | `Rename <name>` | Rename editor accessible name | `[src: beginRename()]` |
| 11 | `A name is required.` | Validation | `[src: validateName()]` |
| 12 | `Names cannot contain spaces — use CamelCase, as the rest of the ontology does.` | Validation | `[src: validateName()]` |
| 13 | `Start with a letter; use letters, digits, hyphen or underscore only.` | Validation | `[src: validateName()]` |
| 14 | `An entity named <name> already exists at <prefixed IRI>.` | Validation | `[src: validateName()]` |
| 15 | `New class` | Dialog title | `[src: newClassDialog()]` |
| 16 | `The new class is asserted as a subclass of the selection. Nothing else in the ontology changes.` | Dialog body | `[src: newClassDialog()]` |
| 17 | `Class name` | Field label | `[src: newClassDialog()]` |
| 18 | `e.g. TruffleTopping` | Field placeholder | `[src: newClassDialog()]` |
| 19 | `Superclass` | Field label | `[src: newClassDialog()]` |
| 20 | `Cancel` | Dialog action | `[src: newClassDialog()]` |
| 21 | `Create class` | Dialog action | `[src: newClassDialog()]` |
| 22 | `Created <prefixed IRI> as a subclass of <prefixed parent IRI>.` | Notification | `[src: newClassDialog()]` |
| 23 | `Select a class in the hierarchy to delete it.` | Notification | `[src: deleteSelected()]` |
| 24 | `Delete <name>?` | Dialog title | `[src: deleteSelected()]` |
| 25 | `This class has <S> subclasses and <I> direct instances. Subclasses are reparented to <parent>; instances keep their type assertion and will dangle.` | Dialog body | `[src: deleteSelected()]` |
| 26 | `Nothing else references it, so this removes one class and one subClassOf axiom.` | Dialog body | `[src: deleteSelected()]` |
| 27 | `Delete class` | Dialog action | `[src: deleteSelected()]` |
| 28 | `Deleted <prefixed IRI>.` | Notification | `[src: deleteSelected()]` |
| 29 | `Nothing to undo.` | Notification | `[src: undo()]` |
| 30 | `Undone.` | Notification | `[src: undo()]` |
| 31 | `Entity` | Inspector panel title | `[src: #rightPanel]` |
| 32 | `Rename entity` / `Rename (F2)` | Inspector action accessible name / tooltip | `[src: #inspRename]` |
| 33 | `Reveal in graph` | Inspector action accessible name and tooltip | `[src: #inspGraph]` |
| 34 | `Nothing selected` | Inspector empty-state heading | `[src: renderInspector()]` |
| 35 | `Pick a class in the hierarchy, a node in the graph, or a row in the individuals table.` | Inspector empty state | `[src: renderInspector()]` |
| 36 | `generated demo data` | Inspector chip | `[src: renderInspector()]` |
| 37 | `Annotations` | Section heading | `[src: renderInspector()]` |
| 38 | `Equivalent to` | Section heading | `[src: renderInspector()]` |
| 39 | `SubClass of` | Section heading | `[src: renderInspector()]` |
| 40 | `Types` | Section heading | `[src: renderInspector()]` |
| 41 | `Property assertions` | Section heading | `[src: renderInspector()]` |
| 42 | `Toppings entailed by its type` | Section heading | `[src: renderInspector()]` |
| 43 | `from <type>` | Section heading chip | `[src: renderInspector()]` |
| 44 | `Orders` | Section heading | `[src: renderInspector()]` |
| 45 | `<n> generated orders reference this customer. Expand the node in the graph to page them in under the viewport budget.` | Inspector note | `[src: renderInspector()]` |
| 46 | `Disjoint with` | Section heading | `[src: renderInspector()]` |
| 47 | `Property axioms` | Section heading | `[src: renderInspector()]` |
| 48 | `Domain` / `Range` / `Inverse of` / `Characteristics` | Axiom kind markers | `[src: renderInspector()]` |
| 49 | `Usage` | Section heading | `[src: renderInspector()]` |
| 50 | `Subclasses` / `Descendants` / `Direct instances` | Usage labels | `[src: renderInspector()]` |
| 51 | `Page instances into the graph` | Usage action | `[src: renderInspector()]` |
| 52 | `Paged <n> of <m> instances into the view, evicting <k>. <r> stayed out — the budget is <b>.` | Notification | `[src: wire()]` |
| 53 | `Inferred axioms` | Section heading | `[src: renderInspector()]` |
| 54 | `No reasoner has run. This prototype shows asserted axioms only; inferred axioms would appear here, marked with the amber rule, once a reasoner is attached.` | Inspector note | `[src: renderInspector()]` |
| 55 | `Search entities  (Ctrl+F)` | Global search placeholder | `[src: #globalSearch]` |
| 56 | `Search entities` | Global search accessible name | `[src: #globalSearch]` |
| 57 | `No entity matches “<query>”` | Search empty result | `[src: wireGlobalSearch()]` |

---

## Conformance summary

An implementation of this Surface is conformant when all of the following hold against the fixture in [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md).

| # | Check | Requirement |
|---|---|---|
| 1 | At boot the tree shows `owl:Thing` expanded down through `DomainConcept`, `Food`, `Pizza` and `PizzaTopping`, and no further | TREE-38 |
| 2 | The properties tab shows 10 roots in the order listed under **TREE-14** | TREE-13 |
| 3 | Typing `top` into the tree filter after 140 ms leaves every topping class visible with its full ancestor chain, each match highlighted | TREE-46, TREE-50, TREE-57, TREE-61 |
| 4 | Typing `zzzz` shows the `No match` empty state with the classes-mode sentence | TREE-65 |
| 5 | `pizza:Margherita` shows a non-zero grouped instance count; `pizza:Pizza` shows none | TREE-33, TREE-35 |
| 6 | Renaming `pizza:IceCream` to `Gelato` updates the tree row, the inspector header and any graph node label, but leaves the IRI line unchanged | TREE-100, TREE-101, TREE-103 |
| 7 | Renaming to `Ice Cream` reports the CamelCase message and keeps the editor open | TREE-96, TREE-106 |
| 8 | Renaming to `Pizza` reports `An entity named Pizza already exists at pizza:Pizza.` | TREE-110 |
| 9 | Blurring the rename editor with `Ice Cream` silently discards | TREE-97 |
| 10 | Creating `TruffleTopping` under `pizza:PizzaTopping` expands the parent, selects the new class, reveals it, and reports the exact creation copy | TREE-128, TREE-132, TREE-134 |
| 11 | Deleting `pizza:PepperTopping` names 4 subclasses and 0 direct instances, and reparents them to `VegetableTopping` | TREE-144, TREE-152 |
| 12 | Selecting a generated Individual shows six property assertions and an entailed-toppings section chipped with its type | TREE-183, TREE-185 |
| 13 | Selecting `pizza:hasBase` shows Domain, Range, Inverse of and Characteristics `Functional, InverseFunctional` | TREE-191, TREE-192 |
| 14 | Every Entity shows an `Inferred axioms` section stating that no reasoner has run | TREE-202, TREE-205 |
| 15 | Typing `marg` into global search lists the class before any order, capped at 10 | TREE-224, TREE-226, TREE-227 |

---

## Appendix A — Native stack mapping (non-normative)

This appendix is advisory. A conformant implementation may ignore every word of it.

### Virtualised tree controls

The tree is small by ontology standards — the fixture flattens to a few hundred rows — but a real ontology can reach tens of thousands of classes, and the filter's automatic expansion can open most of them at once. Treat virtualisation as mandatory rather than optional.

| Stack | Control | Notes |
|---|---|---|
| WinUI 3 | `TreeView` with `ItemsSource` and a hierarchical template | Virtualises by default through `ItemsStackPanel`. `TreeViewItem.GlyphOpacity` gives the leaf-state expander without a template rewrite. Set `TreeView.SelectionMode="Single"`. |
| WinUI 3, alternative | `ItemsRepeater` over a flattened row list you maintain yourself | The reference implementation's model — a flat list of `{iri, depth, isOpen, isLeaf, isMatch}` — maps to this directly and gives exact control over the `4 + depth × 14` inset. Preferred when the filter must re-flatten on every keystroke. |
| WPF | `TreeView` with `VirtualizingStackPanel.IsVirtualizing="True"` and `VirtualizationMode="Recycling"` | Virtualisation is off by default in a `TreeView`; it must be switched on explicitly, and `HierarchicalDataTemplate` binding must not force a full expansion. |
| Avalonia | `TreeDataGrid` in its hierarchical mode | Gives virtualisation, a built-in expander column and per-row templating in one control. |

Practical notes:

- Keep the flattened row list as the single source of truth for keyboard navigation. Arrow-key handling over a flattened list is trivial; over a nested visual tree it is not.
- The expanded set belongs in the view-model, not in the control. Controls that own expansion state will lose it on every re-render caused by a filter change.
- The filter's automatic expansion can open thousands of nodes at once. Re-flatten once, then hand the control a fresh list, rather than raising a per-node expansion event.
- Bind the kind icon's tint to a theme resource keyed by the kind identifier — one `Dictionary<Kind, SolidColorBrush>` rebuilt on theme change — so that the kind-metadata table stays the only place a colour decision is made.
- Row height is fixed at 24 px; tell the control so. `ItemsStackPanel` with a known extent avoids measure passes during fast scrolling.

### Inline edit patterns

| Concern | Windows convention |
|---|---|
| Entering edit | `F2` on the selected item, or a slow second click. The reference implements `F2` and an explicit toolbar action; a slow second click is optional and MUST NOT be a fast double click, which is bound to reveal. |
| The editor | A `TextBox` swapped in for the label `TextBlock` within the row template, sized to the row, with `SelectAll()` on load. |
| Commit | `Enter`, and loss of focus. Windows convention is silent commit on focus loss, which matches **TREE-97**. |
| Cancel | `Escape`. Mark the key handled so it does not bubble to the window's close-dialog handler. |
| Invalid state | `TextBox` with an error-coloured `BorderBrush` plus `AutomationProperties.IsRequiredForForm` / an `aria-invalid` equivalent. On WinUI, set `TextBox.Header` or an adjacent `InfoBar` rather than a tooltip; tooltips are invisible to keyboard users. |
| Announcement | Raise a UIA `LiveRegionChanged` on the message host. The reference routes every validation message through the same transient notification, which maps cleanly to a single polite live region. |

### Dialog conventions on Windows

- Use `ContentDialog` on WinUI 3 for both the new-class and delete-class dialogs. It handles the scrim, the focus trap, `Escape`-to-close and the primary/secondary button layout that **TREE-120** and **TREE-150** describe.
- Windows places the affirmative button first (leading) with `PrimaryButtonText`, and the dismissive second. The reference renders `Cancel` then the affirmative, which is the web convention. Either is acceptable; be consistent across all dialogs in the product.
- For the destructive dialog, colour the primary button with the danger token and set `DefaultButton="Close"` so that `Enter` does not delete. This satisfies **TREE-151**.
- Validation messages belong in the dialog, adjacent to the offending field, not only in a transient notification. **TREE-125** requires the dialog to stay open and focus to return to the field; `ContentDialog.PrimaryButtonClick` with `args.Cancel = true` is the idiomatic way.
- The dialog title carries user data (`Delete <name>?`). Escape it; an Entity name is user-supplied and may contain markup characters.
- Announce the dialog with `AutomationProperties.Name` matching the title, and give the body an `AutomationProperties.LabeledBy` relationship so the consequence sentence in **TREE-144** is read aloud before the buttons are reached. The numbers in that sentence are the whole point of the dialog; a screen-reader user who hears only "Delete class?" has been told nothing.
