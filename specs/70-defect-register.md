# Defect register

> One consolidated list of every defect the specification work found in the reference implementation.

**Status:** Normative for the defect list and its severities; descriptive about the reference build.
**Owns prefix:** `DEF`

---

## 1 · What this document is

Writing this suite meant reading every line of the reference implementation, and in several cases extracting its code into a harness and running it against the real fixture. That surfaced defects. They are recorded here rather than silently corrected, because the reference build is locked read-only for the run that produced this suite, and because a specification that quietly papers over the behaviour it documents is worse than no specification.

**DEF-1** Every entry MUST state where the defect lives, what it does, and which requirement in the suite supersedes it. An entry without a superseding requirement is an observation, not a defect, and MUST NOT appear here.

**DEF-2** An implementer building from this suite MUST implement the superseding requirement, not the reference behaviour. Where the two disagree, the requirement governs.

**DEF-3** Each entry carries a severity from the scale below. Severity describes the effect on a user of the finished product, not the difficulty of the fix.

| Severity | Meaning |
|---|---|
| **Critical** | A shipped feature does not work at all. |
| **High** | The product shows the user something false, or violates a contract the product itself advertises. |
| **Medium** | Wrong in a reachable edge case, or a real accessibility or performance failure. |
| **Low** | Dead code, cosmetic inconsistency, or a latent trap with no current user-visible effect. |

**DEF-4** The reference implementation is `index.html` in the Open Design project directory. Nothing in this suite modifies it.

---

## 2 · Critical

### DEF-5 · Every `PREFIX` declaration is rejected, so all seven example queries fail
**Severity:** Critical · **Area:** SPARQL console · **Superseded by:** [SPQ grammar and tokenisation](32-sparql-console.md#tokenisation)

The tokeniser has no terminal for a bare prefix label. `pizza:` in a `PREFIX` line lexes as a word followed by a stray colon, the parser then expects an IRI and finds `:`, and throws `Malformed PREFIX declaration.` Every one of the seven built-in examples fails to parse as shipped. They run only if their `PREFIX` lines are deleted — which works by accident, because all six prefix labels are already present in the built-in prefix table.

Verified by extracting the engine and executing it against the fixture at all four dataset sizes.

### DEF-6 · Deleting the ontology root throws
**Severity:** Critical · **Area:** Class tree · **Superseded by:** [TREE delete a class](30-class-tree-and-inspector.md#delete-a-class)

`owl:Thing` is kind `class`, so it passes the delete eligibility test, but it has no parent. Composing the confirmation body calls `localName(undefined)` and throws. The root is one keystroke away in the default tree state.

---

## 3 · High

### DEF-7 · Hidden-neighbour counts over-report
**Severity:** High · **Area:** Graph viewport · **Superseded by:** [VP hidden neighbours](20-graph-viewport-and-budget.md#hidden-neighbours)

Adjacency increments the degree total per emission rather than per distinct `(target, predicate, direction)`. A named pizza carries both `hasTopping some X` and `hasTopping only (X, Y)`, so `pizza:Margherita` reports a true degree of 6 against 4 distinct edges. With every neighbour resident it claims 2 are hidden when the answer is 0.

The `+n` badge is the affordance that makes a bounded viewport trustworthy. A badge that lies about what is being held back defeats the feature it exists to serve.

### DEF-8 · The SVG export omits six element classes, including the hidden-neighbour badges
**Severity:** High · **Area:** Export · **Superseded by:** [REN export requirements](22-graph-rendering-and-export.md#export-requirements)

The vector path leaves out the dot grid, arrowheads, the defined-class overlay mark, the selection ring, pin markers and hidden-neighbour badges. The last of those breaks the export contract directly: an export must state what the Budget is holding back, and the SVG does not.

### DEF-9 · `--stroke-strong` fails its contrast threshold in both themes
**Severity:** High · **Area:** Design system · **Superseded by:** [DS contrast audit](40-design-system.md#contrast-audit)

Measured 1.74:1 light and 1.93:1 dark against `--surface`, and 1.63:1 / 2.44:1 against `--canvas`, where 3:1 applies. It is the sole boundary of text fields and outline buttons, and the colour of every graph edge, so the failure reaches both the forms and the graph.

### DEF-10 · A throw in layout or draw permanently ends the render loop
**Severity:** High · **Area:** Architecture · **Superseded by:** [ARCH the frame loop](10-architecture.md#the-frame-loop)

The frame function reschedules itself as its last statement. Any exception in the layout step or the draw step skips the reschedule, so a single transient error stops rendering for the rest of the session with no indication of why.

### DEF-11 · The dataset menu overstates every triple count
**Severity:** High · **Area:** Store · **Superseded by:** [FIX dataset size table](62-pizza-ontology-fixture.md#dataset-size-table)

The menu advertises approximately 8K / 92K / 383K / 766K triples. The counter returns 7,489 / 87,239 / 362,739 / 725,239 — an overstatement of 5.5 % to 6.8 %, reaching 40,761 triples at the largest size. The labels are hand-authored rather than derived.

### DEF-12 · Selecting in one Surface does not update the table
**Severity:** High · **Area:** Architecture · **Superseded by:** [ARCH cross-surface selection](10-architecture.md#cross-surface-selection)

The selection bus notifies the inspector, the tree and the status bar, but never the individuals table. Selecting a generated Individual in the tree or the graph leaves the matching table row unhighlighted until a scroll or filter forces a re-render.

### DEF-13 · Class deletion is unrecoverable
**Severity:** High · **Area:** Class tree · **Superseded by:** [TREE delete a class](30-class-tree-and-inspector.md#delete-a-class)

Deletion pushes no undo record. The confirmation dialog is the only safeguard, and once past it the class, its axioms and its position in the hierarchy are gone for the session.

### DEF-14 · The triple counter omits the flattened restriction triples
**Severity:** High · **Area:** Store · **Superseded by:** [STORE triple accounting](11-data-model-and-store.md#triple-accounting)

The pattern matcher yields all 140 flattened restriction triples to queries, but the counter excludes them. A user can retrieve a triple the status bar does not count, at every dataset size.

---

## 4 · Medium

### DEF-15 · `expandNode` can mark a node fully expanded when it is not
**Severity:** Medium · **Area:** Graph viewport · **Superseded by:** [VP expansion](20-graph-viewport-and-budget.md#expansion)

The completeness test compares two counts both derived from the already-capped 4,000-entry neighbour list, so a node of degree 10,000 whose first 4,000 fit is flagged complete.

### DEF-16 · Admission does not de-duplicate its input sequence
**Severity:** Medium · **Area:** Graph viewport · **Superseded by:** [VP admission](20-graph-viewport-and-budget.md#admission)

A repeated absent IRI in one batch is appended twice, over-counts against headroom, and creates the node record twice; the second creation discards the first's already-incremented in-view degree while the edge map still refers to it.

### DEF-17 · Edges are missed across batches when the adjacency cap truncates one endpoint
**Severity:** Medium · **Area:** Graph viewport · **Superseded by:** [VP the edge record](20-graph-viewport-and-budget.md#the-edge-record-and-edge-keying)

Within a single batch both directions are enumerated, so the edge is found. Across batches only one endpoint is enumerated, and if that endpoint's neighbour list was truncated at the cap the edge never appears.

### DEF-18 · Lowering the Budget can leave the viewport above it
**Severity:** Medium · **Area:** Graph viewport · **Superseded by:** [VP budget control](20-graph-viewport-and-budget.md#budget-control)

The handler evicts only non-exempt candidates. If every resident node is pinned or in the Focus set it removes nothing and reports nothing, leaving the viewport silently over Budget — the one invariant the feature exists to hold.

### DEF-19 · A `<` inside FILTER swallows text to a later `>`
**Severity:** Medium · **Area:** SPARQL console · **Superseded by:** [SPQ tokenisation](32-sparql-console.md#tokenisation)

The IRI alternative precedes the operator alternative in the token pattern and crosses newlines, so `FILTER (?a < 5)` followed by any later `>` consumes everything between as a single IRI token.

### DEF-20 · Solution-cap truncation corrupts subsequent joins
**Severity:** Medium · **Area:** SPARQL console · **Superseded by:** [SPQ evaluation](32-sparql-console.md#evaluation)

Once the cap is reached, the break propagates such that every later pattern stops after its first solution. A query that should return results can return zero.

### DEF-21 · A negative `LIMIT` returns all-but-last-N
**Severity:** Medium · **Area:** SPARQL console · **Superseded by:** [SPQ limit](32-sparql-console.md#limit)

`LIMIT -5` over 313 solutions returns 308 rows and reports "308 rows of 313 (LIMIT applied)". Negative limits are not rejected at parse time.

### DEF-22 · `DISTINCT` keys can collide
**Severity:** Medium · **Area:** SPARQL console · **Superseded by:** [SPQ distinct](32-sparql-console.md#distinct)

Solution keys are joined without a separator, so the bindings `["ab", "c"]` and `["a", "bc"]` produce the same key and one result is discarded.

### DEF-23 · A repeated variable within one pattern does not self-join
**Severity:** Medium · **Area:** SPARQL console · **Superseded by:** [SPQ evaluation](32-sparql-console.md#evaluation)

Bindings are written in sequence as the pattern is matched, so `?x ?p ?x` does not constrain subject and object to be equal.

### DEF-24 · Query results are not invalidated when the dataset is regenerated
**Severity:** Medium · **Area:** SPARQL console · **Superseded by:** [SPQ results presentation](32-sparql-console.md#results-presentation)

The result grid keeps rows that reference discarded Individuals. Clicking one selects an IRI that no longer resolves.

### DEF-25 · Customer lookup is a linear scan
**Severity:** Medium · **Area:** Store · **Superseded by:** [STORE adjacency](11-data-model-and-store.md#adjacency)

There is no IRI index over customers, so entity resolution, labelling, adjacency and the triple source each scan the array — up to 12,500 comparisons per call. Measured: the five-star-orders example costs 2,697 ms at 100,000 Individuals against 263 ms for a structurally similar query that avoids the lookup.

### DEF-26 · Undoing a class creation leaves its triple behind
**Severity:** Medium · **Area:** Class tree · **Superseded by:** [TREE create a class](30-class-tree-and-inspector.md#create-a-class)

The entity and the parent's child link are removed, but the `rdfs:subClassOf` triple stays in the TBox and the derived indexes are not rebuilt, so the triple count never returns to its pre-create value.

### DEF-27 · The delete dialog's subclass count is mode-filtered
**Severity:** Medium · **Area:** Class tree · **Superseded by:** [TREE delete a class](30-class-tree-and-inspector.md#delete-a-class)

The count is taken through the active tree mode's filter, so a class with subclasses reports `0 subclasses` whenever the tree is showing properties. The user confirms a destructive action against a false statement of its consequence.

### DEF-28 · The new-individual dialog accepts an empty price
**Severity:** Medium · **Area:** Individuals table · **Superseded by:** [TBL create an individual](31-individuals-table.md#create-an-individual)

An empty field coerces to 0, passes the finite and range tests, and creates a £0.00 Individual — while the in-cell editor rejects empty explicitly. The same value is valid in one place and invalid in another.

### DEF-29 · Committing a cell edit destroys keyboard focus
**Severity:** Medium · **Area:** Individuals table · **Superseded by:** [TBL accessibility](31-individuals-table.md#accessibility)

Commit re-renders the whole virtualised window, so a keyboard user is dropped to the document root after every edit and must traverse back.

### DEF-30 · Class deletion leaves dangling references
**Severity:** Medium · **Area:** Store · **Superseded by:** [STORE mutation operations](11-data-model-and-store.md#store-mutation-operations)

Restriction fillers, equivalence members and disjointness targets that referenced the deleted class are not cleaned up, and the reparented children list is left unsorted.

### DEF-31 · Regeneration does not clear selection or the undo stack
**Severity:** Medium · **Area:** Architecture · **Superseded by:** [ARCH dataset regeneration](10-architecture.md#dataset-regeneration)

Both keep pointing at discarded records. An undo after regeneration applies an inverse operation to an object that is no longer in the Store.

### DEF-32 · Node degree and radius are never refreshed after a Store change
**Severity:** Medium · **Area:** Graph viewport · **Superseded by:** [VP the viewport node record](20-graph-viewport-and-budget.md#the-viewport-node-record)

Both are computed once at admission. Adding an Individual to a class that is on screen does not change that class's radius or its hidden-neighbour badge until the node is removed and re-admitted.

### DEF-33 · The reverse restriction index uses a different predicate from the forward direction
**Severity:** Medium · **Area:** Store · **Superseded by:** [STORE adjacency](11-data-model-and-store.md#adjacency)

The forward direction falls back to `owl:equivalentClass` where the reverse falls back to `rdfs:subClassOf`. The asymmetry produces two viewport edges where there is one relationship.

### DEF-34 · The reduced-motion preference does not gate the force simulation
**Severity:** Medium · **Area:** Rendering · **Superseded by:** [REN accessibility](22-graph-rendering-and-export.md#accessibility)

The CSS block suppresses chrome transitions only. A user who has asked the system for reduced motion still gets an animating graph.

### DEF-35 · Eight keyboard behaviours are unimplemented
**Severity:** Medium · **Area:** Components · **Superseded by:** [CMP component specifications](41-component-library.md)

Splitter keyboard resize; dialog focus trap and focus restoration on close; flyout arrow-key navigation; tab-strip arrow-key navigation; table cell arrow-key navigation; virtualised row count exposure to assistive technology; command-bar overflow; and an escape from the SPARQL editor's `Tab` capture. Each is specified and marked unimplemented in the component library.

### DEF-36 · The SPARQL IRI token fails its contrast threshold
**Severity:** Medium · **Area:** Design system · **Superseded by:** [DS contrast audit](40-design-system.md#contrast-audit)

Measured 4.38:1 against the editor ground in the light theme, against a 4.5:1 requirement.

### DEF-37 · The SPARQL comment token fails its contrast threshold
**Severity:** Medium · **Area:** Design system · **Superseded by:** [DS contrast audit](40-design-system.md#contrast-audit)

Measured 2.95:1 in the light theme. It renders readable text, not a disabled control, so the disabled-state exemption does not apply.

### DEF-38 · Order references drift from their IRIs and wrap
**Severity:** Medium · **Area:** Fixture · **Superseded by:** [FIX generation parameters](62-pizza-ontology-fixture.md#generation-parameters)

`demo:Pizza_000001` carries order reference `AX-100000`, an off-by-one against the IRI, and the reference wraps to `AX-000000` past index 899,999. Both are reachable only above the currently offered dataset sizes, but the arithmetic is stated as normative so an implementer does not reproduce the wrap unknowingly.

### DEF-39 · Resetting the filters does not reset the scroll offset
**Severity:** Medium · **Area:** Individuals table · **Superseded by:** [TBL filtering](31-individuals-table.md#filtering)

Every other filter change resets it. After a reset the user is left part-way down a list whose contents have changed under them.

---

## 5 · Low

### DEF-40 · The status bar labels an edge count as a triple count
**Severity:** Low · **Area:** Graph viewport · **Superseded by:** [VP reported counts](20-graph-viewport-and-budget.md#reported-counts)

The field reads `In view N nodes · M triples`, but `M` is the in-view edge count. The label and the value disagree, and the same line also carries a genuine Store triple count, so the two invite comparison.

### DEF-41 · The renderer's palette cache keys are misleading
**Severity:** Low · **Area:** Rendering · **Superseded by:** [REN palette acquisition](22-graph-rendering-and-export.md#palette-acquisition)

The cache key `stroke` maps to token `--stroke-strong`, the key `divider` maps to token `--stroke`, and `--stroke-divider` is never read at all. Nothing is currently wrong on screen; swapping two of them would be a silent, plausible-looking regression.

### DEF-42 · The delete confirmation hard-codes a colour
**Severity:** Low · **Area:** Components · **Superseded by:** [CMP buttons](41-component-library.md#buttons)

An inline background override is applied to a primary button, breaking the product's own rule that no component hard-codes a visual value. A `primary danger` variant is specified as the replacement.

### DEF-43 · Spinner and skeleton durations sit outside the token set
**Severity:** Low · **Area:** Design system · **Superseded by:** [DS motion](40-design-system.md#motion)

700 ms and 1.4 s are hard-coded in component rules rather than declared as tokens.

### DEF-44 · The row-height constant is duplicated rather than derived
**Severity:** Low · **Area:** Design system · **Superseded by:** [DS spacing and control metrics](40-design-system.md#spacing-and-layout-rhythm)

The script constant and the CSS token carry the same value independently. Changing one does not change the other.

### DEF-45 · Three SVG export details diverge from the raster path
**Severity:** Low · **Area:** Export · **Superseded by:** [REN export](22-graph-rendering-and-export.md#export)

The Focus set ring is drawn as a plain circle rather than the kind path; cluster titles are written as one world-space run rather than two screen-space runs; and the legend advance is estimated from character count rather than measured.

### DEF-46 · Five icons and five tokens are declared and never used
**Severity:** Low · **Area:** Design system · **Superseded by:** [DS iconography](40-design-system.md#iconography)

Unused symbols: pin, expand, collapse, trash, filter. Unused tokens: the title font size, the window radius, the exit duration, the ease-in curve, and the literal Entity colour. Each is catalogued with the consumer it is waiting for.

### DEF-47 · One icon carries two unrelated meanings
**Severity:** Low · **Area:** Design system · **Superseded by:** [DS iconography](40-design-system.md#iconography)

The check glyph signals both query success and commit-rename.

### DEF-48 · Four store fields are dead or drift
**Severity:** Low · **Area:** Store · **Superseded by:** [STORE the entity record](11-data-model-and-store.md#the-entity-record)

The domain-of and range-of collections are never populated; the value-partition flag is written and never read; and the generated-count field drifts from the actual array length after a manual add.

### DEF-49 · The rating clamp is unreachable
**Severity:** Low · **Area:** Fixture · **Superseded by:** [FIX generation parameters](62-pizza-ontology-fixture.md#generation-parameters)

The expression already spans exactly 1 to 5, so the clamp can never fire. It is retained as a guard and specified as such, with the reasoning recorded so a later change to the distribution does not remove it as dead code.

---

## 6 · Suggested order of repair

**DEF-50** An implementer repairing the reference build SHOULD work in this order, because each group unblocks honest evaluation of the next.

| Order | Group | Entries | Why first |
|---|---|---|---|
| 1 | Crashes and dead features | DEF-5, DEF-6 | A feature that cannot run cannot be assessed. |
| 2 | False statements to the user | DEF-7, DEF-11, DEF-14, DEF-27, DEF-40 | The product's credibility rests on its counts being true. |
| 3 | Contract violations | DEF-8, DEF-9, DEF-18, DEF-12 | Each breaks something the product advertises. |
| 4 | Data integrity | DEF-13, DEF-26, DEF-30, DEF-31 | Editing must be safe before editing is expanded. |
| 5 | Query correctness | DEF-19 – DEF-24 | Meaningless until DEF-5 lands. |
| 6 | Accessibility and performance | DEF-25, DEF-29, DEF-34, DEF-35, DEF-36, DEF-37 | Substantial but independently testable. |
| 7 | Everything else | the Low section | Cheap, and best done as a single sweep. |

**DEF-51** A repair MUST be accompanied by the test named for its superseding requirement in [61-acceptance-criteria-and-tests.md](61-acceptance-criteria-and-tests.md), so the same defect cannot return unobserved.

---

## Appendix A — How these were found (non-normative)

Three methods, in descending order of yield:

1. **Executing the extracted code.** The store, the fixture generator and the query engine were lifted into a scratch harness and run against the real data at 1,000 / 12,000 / 50,000 / 100,000 Individuals. This produced every measured figure in the suite and found DEF-5, DEF-11, DEF-14, DEF-19 through DEF-25, and DEF-38.
2. **Reading for the specification.** Writing a requirement forces a decision about what the behaviour should be, which exposes places where the implementation never made that decision. This found most of the Medium entries.
3. **Computing what was asserted.** The contrast ratios were calculated from the hex values rather than taken on trust, which found DEF-9, DEF-36 and DEF-37 — three failures in a palette previously described as audited.

The lesson worth carrying forward is the third one. Everything in this suite that could be computed was computed, and the claims that survived are the ones that earned it.
