# Axiom: Find

**Purpose:** This document specifies the Find surface, the global entity search across the whole Store, its scoping model, its results, and the zero result state in which a search that returned nothing becomes a place to create the thing that was missing.

**Status:** Normative. [`visual-reference.html`](visual-reference.html) is descriptive and owns no requirements.

**Requirement ID prefixes owned:** `FND`

---

## The reference implementation

> **The behavioural source of truth is an HTML prototype:**
>
> `C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\find.html`
>
> One self-contained file. It is **read-only**. Never edit it, move it, reformat it, or run it as part of implementing this document.

Where a statement in this document and the prototype disagree about *observed behaviour*, the prototype wins and this document is a defect to be fixed. Where this document marks behaviour as *specified, not implemented in the reference build*, this document wins as the statement of intent.

### Citation convention

This document follows the two namespace convention established by [`text-entity-create/README.md`](../text-entity-create/README.md#citation-convention).

| Form | Names a symbol in | Example |
|---|---|---|
| `[src: ...]` | the prototype, in the five shapes the suite registers | `[src: runSearch()]`, `[src: .remedy]`, `[src: --accent-tint]` |
| `[cur: ...]` | the current Electron build | not used in this document |

**No `[cur: ...]` citation appears anywhere below.** The current build's Find view was seen only as a screenshot; its source was not read. Every claim this document makes about current behaviour is therefore a claim about the prototype, and any statement about the shipped build is confined to [What this design replaces](#what-this-design-replaces), which is marked non-normative and carries no citation it cannot support.

### House style deviations

This document uses no em dash character, on the author's instruction, following [`add-children/README.md`](../add-children/README.md#house-style-deviations) and [`text-entity-create/README.md`](../text-entity-create/README.md#house-style-deviations). The appendix heading is `Appendix A. Native stack mapping (non-normative)` rather than the form given in [`README.md`](../README.md#1-heading-structure), and clauses that a sibling document would set off with an em dash use a colon, a comma or a full stop.

British English is used in this document's prose. Product copy and identifiers are quoted exactly as they are and are never corrected.

---

## Scope

### In scope

The query and match model, the scoping model and its counts, the result list, paging, selection and the inspector, the zero result state and its remedies, and the inline create panel that the zero state carries.

### Out of scope

Named so that their absence is deliberate rather than an omission:

1. **Entity creation as a whole.** [`text-entity-create/README.md`](../text-entity-create/README.md) owns it. This document specifies only how a restricted profile of that design is reached from a failed search. See [The create panel as a TEC profile](#the-create-panel-as-a-tec-profile).
2. **The graph handoff.** `Open results in new graph` leaves this surface. What the graph does on arrival belongs to [`20-graph-viewport-and-budget.md`](../20-graph-viewport-and-budget.md).
3. **The write into the Store.** The triples a commit produces and its undo entry belong to [`11-data-model-and-store.md`](../11-data-model-and-store.md).
4. **The Details view.** The statement editor idiom this surface adopts was taken from it. Details is not specified by any document in the suite yet, and this document does not specify it.
5. **Indexing and retrieval performance.** The prototype scans a small in-memory array. Real retrieval over the Store is the concern of [`11-data-model-and-store.md`](../11-data-model-and-store.md).

### Relationship to the rest of the suite

**FND-1** This surface defines no design tokens. Every visual value MUST come from [`40-design-system.md`](../40-design-system.md) through [Token bindings](#token-bindings), and an implementation MUST NOT copy the prototype's literals.

**FND-2** This surface defines no general-purpose components. Tab strip, Command bar, Button, Text field, Search field, Select field, Chip and Virtualised table MUST come from [`41-component-library.md`](../41-component-library.md). This document specifies only the composites that do not already exist there, and [Where these composites belong](#where-these-composites-belong) states that even those are provisional here.

**FND-3** A commit from this surface mutates the hierarchy that [`30-class-tree-and-inspector.md`](../30-class-tree-and-inspector.md) presents. This surface MUST NOT hold a private copy of that hierarchy across a commit.

---

## Terminology

Used exactly as defined here, in addition to the suite glossary in [`README.md`](../README.md#8-terminology).

| Term | Meaning |
|---|---|
| **Query** | The text the user is searching for |
| **Token** | One unit of the Query after splitting and filtering, per FND-6 |
| **Match mode** | How tokens must occur for a match: all words, any word, or exact phrase |
| **Search field** | One named field of an entity that a search may read |
| **Scope** | The set of search fields and the set of entity types currently included |
| **Scoped miss** | A Query returning no results while the Scope excludes at least one search field or entity type |
| **Remedy** | A single action that widens the Scope or relaxes the Match mode, carrying the number of matches it would yield |
| **Yield** | The number of matches a Remedy would produce, computed before the Remedy is taken |
| **Statement** | One predicate and value pair asserted about the subject being created |
| **Subject** | The IRI the create panel will assert statements about |

---

## What this design replaces

Non-normative, and recorded because the specified zero state is a direct answer to a specific failure.

The shipped Find view reports a search that found nothing with one line: `No matches. Try fewer words or reset the filters.` The scope rail beside it reads `Search scope · 2 fields`, with `Names and aliases` and `IRI` ticked and every other field, including `owl:equivalentClass` at 612 populated entities, excluded.

So the zero was a Scoped miss and the copy presented it as an absence. Three consequences follow:

1. The user cannot tell whether the entity is missing or merely out of scope, and the interface offers no way to find out other than manually re-ticking fields.
2. The remedies the copy names, fewer words and resetting filters, are offered without any indication that either would help. Both may still yield nothing.
3. Adding a create action on top of that state is how duplicate entities are made, which is the most expensive error available in ontology work, because a duplicate is discovered only after both copies have acquired axioms.

The specified zero state answers the question the user actually has, which is *is it really not there*, before it offers to create anything.

---

## The query and match model

**FND-4** A Query MUST be evaluated against the current Scope only. A search MUST NOT silently read a field the user has excluded `[src: evaluate()]`.

**FND-5** An empty Query MUST match every entity within the entity type Scope, so that the surface with no Query entered is a browsable list rather than a blank `[src: evaluate()]`.

**FND-6** Tokenisation MUST lower-case the Query, split it on every run of characters outside `[a-z0-9]`, and discard tokens shorter than the minimum token length in [Constants](#constants) `[src: tokens()]`.

**FND-7** Three Match modes MUST be offered, and each MUST be evaluated case-insensitively `[src: hitsField()]`.

| Mode | Matches when |
|---|---|
| All words | every Token occurs |
| Any word | at least one Token occurs |
| Exact phrase | the trimmed Query occurs as a substring |

**FND-8** In All words mode a match MUST be satisfied either by one scoped field containing every Token on its own, or by the scoped fields taken together containing every Token between them `[src: evaluate()]`. The per field result is what the Scope rail reports; the combined result is what the result list reports.

**FND-9** Exact phrase mode MUST NOT use Tokens. An empty or whitespace Query in this mode MUST match nothing `[src: hitsField()]`.

### Sorting

**FND-10** Four sort orders MUST be offered: best match, name ascending, name descending, and type `[src: sortResults()]`.

**FND-11** Best match MUST rank in this order, and MUST break every tie on the label ascending `[src: score()]`.

| Rank | Condition |
|---|---|
| 0 | the label equals the Query |
| 1 | the label starts with the Query |
| 2 | the label contains the Query |
| 3 | the match was on the label field |
| 4 | the match was on the IRI field |
| 5 | the match was on any other scoped field |

---

## The scope model

This is the surface's central idea and the reason the zero state can be honest.

**FND-12** The Scope rail MUST carry two independent groups: entity types and search fields `[src: #typeList]` `[src: #fieldList]`.

**FND-13** The two groups MUST report **different** counts, and an implementation MUST NOT unify them.

| Group | The count reports |
|---|---|
| Entity type | how many entities of that type match the Query under the current Scope |
| Search field | how many entities that field **alone** would match under the current Query, whether or not the field is currently scoped in |

**FND-14** FND-13 is the requirement that makes a Scoped miss diagnosable. A field count answers *would ticking this help*, which is the question a zero result raises, and a field count of zero beside a ticked field is therefore information rather than noise `[src: renderRail()]`.

**FND-15** With an empty Query, a field count MUST instead report how many entities have that field populated, because the per Query figure would be meaningless `[src: renderRail()]`.

**FND-16** The rail MUST carry a one line summary of the active Scope stating both ratios, fields scoped of fields available and types scoped of types available `[src: #railSummaryText]`, and that summary MUST remain visible when the rail is collapsed.

**FND-17** Three bulk field actions MUST be offered: all fields, names only, and clear `[src: #allFields]` `[src: #namesOnly]` `[src: #clearFields]`. A field filter MUST narrow the visible field list without changing the Scope `[src: #fieldFilter]`.

**FND-18** Clearing every search field MUST be permitted and MUST yield no matches for any non-empty Query. The surface MUST NOT silently re-add a field to avoid the empty result.

---

## Results

**FND-19** The result list MUST present three columns: Entity, Type and Synonym `[src: #grid]`.

**FND-20** The Entity cell MUST carry the label, and beneath it the entity's ancestor path or an explicit statement that no parent is recorded `[src: pathOf()]`.

**FND-21** Where a result matched on a field other than the label or the IRI, the Entity cell MUST name the field it matched in `[src: .matchin]`. A user who cannot see why a row is in the list cannot trust the list.

**FND-22** A result row MUST be selectable by pointer and by keyboard, and the selected row MUST be distinguishable by a persistent background rather than by focus alone `[src: #rows]`.

**FND-23** The match count MUST state both the number matched and the size of the Store, so that the figure is never read without its denominator `[src: #matchCount]`.

**FND-24** Paging MUST offer a page size and MUST report the current page and the page total. With no results the report MUST read page zero of zero rather than page one of one `[src: #pagePos]`.

**FND-25** The graph handoff action MUST be disabled while there are no results and enabled otherwise `[src: #openGraph]`.

### The inspector

**FND-26** The inspector MUST occupy one line while nothing is selected, carrying an instruction rather than an empty panel `[src: #inspector]`.

**FND-27** On selection the inspector MUST present the label, the entity type, the identifier, the ancestor path, synonyms and the definition, and MUST state explicitly where a value is not recorded rather than leaving it blank `[src: renderInspector()]`.

**FND-28** An entity created through this surface MUST be marked as such in the inspector for the remainder of the session `[src: renderInspector()]`.

---

## The zero result state

**FND-29** Where a Query yields no results the surface MUST replace the result list with the zero state. It MUST NOT present an empty table under a populated header, and the footer MUST NOT report a page range that does not exist `[src: renderResults()]`.

**FND-30** The zero state headline MUST quote the Query `[src: renderZero()]`.

**FND-31** The zero state MUST state the Scope that produced the miss: the number of fields scoped of the number available, the number of entity types scoped of the number available, and the size of the Store `[src: renderZero()]`.

**FND-32** The zero state MUST state, in words, that a miss inside a narrowed Scope is not an absence. This sentence is `ZERO-SCOPE` in the [Copy catalogue](#copy-catalogue) and MUST NOT be reworded to something weaker.

**FND-33** The surface MUST NOT present a Scoped miss as proof that the entity does not exist, in any copy, at any point.

### The remedy ladder

**FND-34** Where at least one Remedy is available the zero state MUST present the ladder **above** the create panel, under a heading naming its purpose `[src: .remedy-head]`.

**FND-35** Remedies MUST be ordered by ascending cost to the user's intent, and MUST be offered in this order where each is applicable `[src: remedies()]`.

| # | Remedy | Applicable when | Effect |
|---|---|---|---|
| 1 | Search all fields | fewer fields are scoped than exist | scopes in every search field |
| 2 | Match any word instead of all | the Match mode is All words | sets the Match mode to Any word |
| 3 | Include all entity types | fewer types are scoped than exist | scopes in every entity type |
| 4 | Reset every filter | always | scopes everything in and relaxes the Match mode |

**FND-36** Each Remedy MUST carry its Yield, computed against the Store before the Remedy is taken `[src: remedies()]`. A user MUST never have to take a Remedy to discover whether it would have helped.

**FND-37** A Remedy whose Yield is zero MUST be rendered disabled with its zero visible. It MUST NOT be hidden `[src: renderZero()]`. A hidden remedy conceals the fact that widening would not help, which is exactly the fact that justifies creating the entity.

**FND-38** Taking a Remedy MUST apply it, re-run the Query and return to page one, without navigation and without losing anything the user has typed into the create panel.

### The two empty causes

**FND-39** Where the result list is empty the surface MUST distinguish the two causes in copy, and MUST NOT use one message for both `[src: renderResults()]`.

| Cause | Copy id |
|---|---|
| a Query matched nothing under the active Scope | `EMPTY-SEARCH` |
| a status or type filter excluded everything | `EMPTY-FILTER` |

---

## The create panel as a TEC profile

This is the part of the surface that another document already owns.

**FND-40** [`text-entity-create/README.md`](../text-entity-create/README.md) owns entity creation in Axiom. The Find create panel MUST be implemented as a **restricted profile** of that design: it MAY offer less, it MUST NOT contradict it, and where the two disagree `TEC` wins and the Find rendering is the defect.

**FND-41** The Find create panel exists for one case: a search proved an entity absent and the user wants it present without leaving the result they were looking for. It MUST NOT grow into a second general entity authoring surface.

**FND-42** The panel MUST offer a handoff to the full Add entity view whenever the user needs anything the profile omits, and at minimum whenever a parent must itself be created. **Status:** specified, not implemented in the reference build.

**FND-43** The panel MUST be open by default within the zero state rather than behind a further disclosure `[src: renderZero()]`. The user has already spent a search proving the entity is absent; a second click to begin is a toll on a decision already made.

**FND-44** The panel MUST seed the label from the Query, title cased, and MUST re-seed it while the user has not edited the label `[src: titleCase()]` `[src: seedCreateFromQuery()]`.

### Conformance against TEC

**FND-45** Every difference between the Find create panel and `TEC` MUST be one of three kinds, and MUST be recorded as such. **Conforms**: the same rule. **Restricts**: the profile offers less, which FND-40 permits. **Contradicts**: the profile disagrees, which FND-40 forbids, and which is therefore a defect against the named `TEC` requirement.

| # | Subject | `TEC` | Find | Kind |
|---|---|---|---|---|
| 1 | Draft frame stack and nested parent creation | TEC-4, TEC-5 | absent | Restricts, with FND-42 the required escape |
| 2 | Label limited to 256 characters, comment to 10,000, enforced at the input | TEC-6 | neither limit enforced | **Contradicts** |
| 3 | A parent already chosen is not offered at all | TEC-11 | every class is offered, including the subject itself | **Contradicts** |
| 4 | An empty parent list is written as `owl:Thing` | TEC-13 | written as no parent | **Contradicts** |
| 5 | The `owl:Thing` destination stated in words in both the empty state and the footer note | TEC-14 | stated once, in the ancestry caution | **Contradicts** |
| 6 | A class may not be its own ancestor, and the condition is reported not merely enforced | TEC-72 condition 4, TEC-73 | not checked | **Contradicts** |
| 7 | A disabled commit shows its reason next to the thing that caused it | TEC-75 | one reason, shown beside the commit action rather than beside the label | **Contradicts** |
| 8 | Commit shows `Adding…` and disables every field while in flight | TEC-77 | commit is synchronous, no in flight state | **Contradicts** once the write is a service call |
| 9 | Commit carries the dataset epoch and Store version and is rejected if either moved | TEC-82 | not carried | **Contradicts** |
| 10 | After commit, re-read the Store and report the parents written rather than the parents requested | TEC-83 | reports the requested parent | **Contradicts** |
| 11 | The view creates classes only | `TEC` scope statement | offers Class, Instance and Property | **Contradicts** |
| 12 | Monospace used for exactly three things | TEC-116 | also used for the Source serialisation block | **Contradicts**, and the cheaper repair is to widen TEC-116 |
| 13 | The prototype is light only; the implementation derives dark independently | TEC-115 | ships both themes, authored independently | Conforms |
| 14 | No design tokens defined by the view | TEC-1 | two tokens added, `--accent-tint` and `--r-card` | Conforms once both are added to `DS` |

**FND-46** Each row marked **Contradicts** in FND-45 MUST be repaired in favour of the `TEC` requirement, not in favour of the prototype. FND-45 is the authoritative list of what this surface currently gets wrong.

---

## The statement editor

The panel presents creation as what it is: asserting statements about a subject.

**FND-47** The panel MUST present the statements as a two column table of predicate and value `[src: .stmts]`, and MUST state the statement count above it `[src: .stmt-count]`.

**FND-48** A predicate that the user may change MUST carry a disclosure affordance. A predicate that is fixed MUST NOT `[src: .predwrap]` `[src: .stmt-fixed]`. The affordance is the only signal that distinguishes the two, so it MUST NOT be applied decoratively.

**FND-49** The entity type MUST be the value of `rdf:type` rather than a separate control `[src: TYPE_ROWS]`.

**FND-50** A class's parent MUST be `rdfs:subClassOf`. An individual's parent MUST be a **second** `rdf:type` statement, not `rdfs:subClassOf` `[src: TYPE_ROWS]`. Presenting an individual's type as a subclass axiom is an error in the ontology, not only in the interface.

**FND-51** A property MUST NOT be offered a parent row in this panel. Its domain and range are out of scope here. See FND-45 row 11: offering properties at all contradicts `TEC`.

**FND-52** The following statements MUST be present and fixed: `rdf:type`, `rdfs:label`, the parent row where the type has one, and `rdfs:comment` `[src: statementRows()]`. Further statements MUST be addable, each with a changeable predicate and a removal action `[src: #addRow]`.

**FND-53** A removal action MUST NOT appear on a fixed statement `[src: statementRows()]`.

**FND-54** An added statement MUST default to a predicate not already used, so that adding a row twice does not silently produce a duplicate predicate `[src: #addRow]`.

**FND-55** An added statement whose predicate the Store indexes MUST be written to that field on commit, so that a value asserted here is findable by the same search immediately afterwards `[src: createEntity()]`. A statement the user can assert but not then find is a statement the surface pretended to accept.

### The subject

**FND-56** The subject identifier MUST be presented as its own row, distinct from the statement table, because it is the subject rather than a statement about the subject `[src: .subject-row]`.

**FND-57** The identifier MUST be derived from the label by the algorithm in FND-58, MUST follow the label while untouched, and MUST stop following it the moment the user edits it. The panel MUST say which of the two states it is in `[src: subjectIri()]`.

**FND-58** The derivation MUST split the label on every run of characters outside `[A-Za-z0-9]`, capitalise the first letter of each resulting word, concatenate them, and prefix the ontology namespace `[src: iri()]`. This is the same algorithm [`add-children/README.md`](../add-children/README.md) specifies as `SUG-3`, and the two MUST NOT diverge.

### The ancestry chain

**FND-59** The panel MUST show where the entity will land, as the subject followed by each ancestor up to the root, linked in order `[src: ancestorChain()]`.

**FND-60** The subject card MUST be visually distinct from the ancestor cards, and MUST carry a caption naming what is being created as well as the label `[src: .chain-card]`.

**FND-61** Changing the parent MUST redraw the chain before the user commits `[src: renderZero()]`.

**FND-62** Where no parent is chosen the chain MUST show the root explicitly rather than showing the subject alone, and MUST carry the caution in `ROOT-CAUTION` `[src: renderZero()]`. Per FND-45 row 5 this caution is currently the only statement of the destination, where TEC-14 requires two.

**FND-63** The ancestor walk MUST terminate at a bounded depth so that a cycle in the recorded hierarchy cannot hang the panel `[src: ancestorChain()]`.

### Source

**FND-64** The panel MUST offer a collapsed disclosure showing the RDF that the current statements would assert `[src: #srcDisc]`.

**FND-65** Source MUST stay in step with the table on every change. The panel and its serialisation MUST NOT be able to disagree `[src: sourceXml()]`.

**FND-66** Source MUST distinguish a resource object from a literal object by predicate, and MUST use the classification below `[src: RESOURCE_PREDS]`.

| Object form | Predicates |
|---|---|
| resource | `rdf:type`, `rdfs:subClassOf`, `owl:equivalentClass`, `rdfs:isDefinedBy` |
| literal, typed as `xsd:string` | every other predicate offered |

**FND-67** A statement with an empty value MUST be omitted from Source rather than serialised empty `[src: sourceXml()]`.

**FND-68** Values MUST be XML escaped `[src: xmlEsc()]`, and prefixed names MUST be expanded against the prefix table `[src: PREFIXES]` `[src: expandIri()]`.

---

## The duplicate guard

This is the safety property that the whole feature rests on.

**FND-69** The duplicate check MUST run against **every entity in the Store**, independent of the active Scope and the Match mode `[src: findCollision()]`. The Scope produced the zero result that led the user here; reusing it to decide whether the entity already exists would repeat the same mistake with worse consequences.

**FND-70** The check MUST run on the label as it is typed, not only at commit `[src: renderZero()]`.

**FND-71** A collision MUST block creation `[src: renderZero()]`.

**FND-72** A collision MUST distinguish an exact label collision from a normalised name collision in its copy, and MUST name the colliding entity and its ancestor path `[src: findCollision()]`.

**FND-73** Normalisation MUST lower-case the label, replace every run of characters outside `[a-z0-9]` with a single underscore, and trim leading and trailing underscores `[src: norm()]`. This is the same algorithm `SUG-2` specifies, and the two MUST NOT diverge.

**FND-74** A collision MUST offer opening the existing entity instead, and taking that action MUST widen the Scope so that the entity the search missed is now visible `[src: #openExisting]`.

**FND-75** The panel MUST state that the check covers the whole Store, so that the user can trust the absence the panel is about to act on `[src: renderZero()]`.

---

## Commit

**FND-76** Commit MUST write the entity, re-run the current Query, select the created entity and populate the inspector `[src: createEntity()]`.

**FND-77** After commit the created entity MUST appear as a result of the Query that failed, because the label was seeded from that Query. Where an edit to the label has made that untrue the surface MUST still select the entity rather than returning an empty result.

**FND-78** Commit MUST be acknowledged, naming what was created and where it was attached `[src: toast()]`.

**FND-79** Commit MUST reset the panel, retaining the entity type and discarding the label, parent, comment, identifier override and added statements `[src: createEntity()]`.

**FND-80** The triples written and the undo entry are the concern of [`11-data-model-and-store.md`](../11-data-model-and-store.md). This document specifies the shape handed to the writer, not the writer. `TEC-81` through `TEC-85` govern the commit itself and are binding here through FND-40.

---

## Where these composites belong

**FND-81** The section panel, the ancestry chain, the statement table, the add row action and the Source disclosure are **not** Find components. They were taken from the Details view and they will be wanted by the Add entity view, the class inspector and anything else that edits an entity.

**FND-82** Specifying them in this document is provisional. They MUST be moved into [`41-component-library.md`](../41-component-library.md) as the `CMP` entries below, and this document MUST then cite them rather than define them. Until that happens, a second surface adopting the same idiom has nothing to cite and will redraw it, which is the drift this document exists partly to stop.

| Proposed `CMP` entry | What it covers |
|---|---|
| Section panel | accent top rule, tinted ground, icon and uppercase heading |
| Ancestry chain | linked cards, subject card, root card, connector |
| Statement table | predicate and value columns, fixed against changeable predicates, row actions |
| Add row action | the accent text action that appends a row |
| Source disclosure | a collapsed serialisation of the surrounding editor's state |

**FND-83** `--accent-tint` and `--r-card` MUST be added to [`40-design-system.md`](../40-design-system.md) before any of FND-82's entries are written, since a component library entry may not depend on a token the token document does not carry.

---

## Keyboard model

**FND-84** Every control MUST be reachable and operable from the keyboard with a visible focus indicator `[src: :focus-visible]`.

**FND-85** Focus order MUST follow the reading order: tab strip, query bar, scope rail, results, footer, inspector. Within the zero state it MUST run headline, remedies, then the create panel in statement order.

**FND-86** The following bindings MUST be honoured.

| Key | Context | Effect |
|---|---|---|
| Tab, Shift+Tab | anywhere | move through the focus order |
| Enter, Space | a result row | select that row `[src: #rows]` |
| Enter, Space | a Remedy | apply that Remedy |
| Space | a scope checkbox | toggle that field or type |

**FND-87** Editing a value in the statement table MUST NOT move focus or lose the caret position, even though the panel re-renders to keep Source in step `[src: renderZeroKeepFocus()]`.

**FND-88** The Source disclosure MUST retain its open state across a re-render `[src: renderZeroKeepFocus()]`.

---

## Accessibility

**FND-89** The result list MUST be exposed as a table with column headers associated with their columns `[src: .grid]`.

**FND-90** Every control MUST carry an accessible name, including controls whose visible label is withdrawn at narrow widths `[src: .hide-sm]`.

**FND-91** The match count and the acknowledgement MUST be announced politely `[src: #matchCount]` `[src: toast()]`.

**FND-92** A collision MUST be conveyed by text and shape, never by colour alone `[src: .notice-warn]`.

**FND-93** Body text MUST meet 4.5 to 1 against its background and essential non-text graphics 3 to 1. The dark theme MUST be audited independently and MUST NOT be derived by inverting the light one.

**FND-94** The surface MUST honour a reduced motion preference by suppressing transitions without loss of function `[src: @media (prefers-reduced-motion: reduce)]`.

---

## Responsive behaviour

**FND-95** The surface MUST NOT scroll horizontally at any width at or above the minimum in [Constants](#constants).

**FND-96** Content MUST be surrendered in this order as width is withdrawn `[src: @media (max-width: 900px)]`.

| Width | Withdrawn | Where it goes |
|---|---|---|
| 1100px and below | the Match and Sort labels | the controls keep their accessible names |
| 900px and below | the two column workspace | the rail moves above the results and gains its own height cap |
| 900px and below | predicate column width | reduced, so the value column keeps its room |
| 680px and below | the recent searches control | the query field takes the full width |

**FND-97** No essential action MUST be withdrawn at any width: search, scoping, selection, the remedies and creation remain available throughout.

---

## Constants

| Constant | Value | Applies to | Source |
|---|---|---|---|
| Minimum token length | 3 characters | tokenisation | `[src: tokens()]` |
| Spacing step | 4px | all spacing | `[src: --sp-1]` |
| Control height | 30px | query field, selects, buttons | `[src: .btn]` |
| Primary action height | 34px | the commit action | `[src: .btn-lg]` |
| Remedy height | 34px | the remedy ladder | `[src: .remedy]` |
| Scope rail width | 264px | the two column workspace | `[src: --rail-w]` |
| Predicate column width | 210px, and 150px below 900px | the statement table | `[src: .stmts]` |
| Result type column width | 130px | the result list | `[src: #grid]` |
| Result synonym column width | 26% | the result list | `[src: #grid]` |
| Page size | 10, 25 or 50, defaulting to 10 | paging | `[src: #perPage]` |
| Ancestor walk depth cap | 12 | the ancestry chain | `[src: ancestorChain()]` |
| Acknowledgement dwell | 4500ms | the acknowledgement | `[src: toast()]` |
| Feedback duration | 120ms | hover and focus | `[src: --t-fast]` |
| Transition duration | 180ms | disclosure and rotation | `[src: --t-enter]` |
| Control radius | 4px | controls at rest | `[src: --r-ctl]` |
| Panel radius | 6px | panels and the source block | `[src: --r-panel]` |
| Card radius | 8px | section and chain cards | `[src: --r-card]` |
| Body size | 16px | labels, definitions, values | this document |
| Secondary size | 15px | statement values, inspector values | `[src: .stmt-val]` |
| Label size | 13px | section heads, captions, hints | `[src: .section-head]` |
| Minimum width | 375px | the narrowest supported width | this document |
| Body contrast floor | 4.5 to 1 | text against its background | this document |
| Graphic contrast floor | 3 to 1 | pills, icons, borders | this document |

### Token bindings

**FND-98** The prototype's tokens map to `DS` tokens one for one. An implementation MUST take its values from [`40-design-system.md`](../40-design-system.md).

| Prototype token | Role |
|---|---|
| `--ground`, `--surface`, `--raised`, `--sunken` | the four ground levels |
| `--border`, `--border-strong` | hairline and control stroke |
| `--text`, `--text-muted` | primary and secondary text |
| `--accent`, `--accent-hover`, `--accent-fg` | the commit action and selection |
| `--accent-soft`, `--accent-tint` | the matched-in marker, and the section ground |
| `--ok`, `--ok-bg`, `--ok-border` | a Remedy yield and the acknowledgement |
| `--warn`, `--warn-bg`, `--warn-border` | a collision |
| `--idle`, `--idle-border` | a zero count |
| `--row-hover`, `--row-selected` | result row interaction layers |
| `--focus` | the focus indicator |
| `--shadow-pop` | elevation |
| `--font`, `--mono` | the interface face, and identifiers |

**FND-99** The monospace face MUST be used for identifiers and for the Source serialisation, and for nothing else. This widens `TEC-116` by one case; see FND-45 row 12.

---

## Copy catalogue

Every user facing string, quoted verbatim. Copy is part of this specification.

| Copy ID | String | Where | Source |
|---|---|---|---|
| `Q-PLACEHOLDER` | `Search names, IRIs and annotations` | query field | `[src: #q]` |
| `Q-NAME` | `Search the ontology` | query field accessible name | `[src: #q]` |
| `MODE-ALL` | `All words` | match mode | `[src: #matchMode]` |
| `MODE-ANY` | `Any word` | match mode | `[src: #matchMode]` |
| `MODE-PHRASE` | `Exact phrase` | match mode | `[src: #matchMode]` |
| `SORT-BEST` | `Best match` | sort | `[src: #sortBy]` |
| `RECENT` | `Recent searches` | recent searches | `[src: #recent]` |
| `RESET-ALL` | `Reset filters` | query bar | `[src: #resetAll]` |
| `RAIL-SUMMARY` | `Search scope: {fields} of {fieldTotal} fields, {types} of {typeTotal} types` | scope rail | `[src: #railSummaryText]` |
| `RAIL-TYPES` | `Entity types` | scope rail | `[src: #h-types]` |
| `RAIL-FIELDS` | `Search fields` | scope rail | `[src: #h-fields]` |
| `FIELD-FILTER` | `Filter fields` | scope rail | `[src: #fieldFilter]` |
| `FIELD-ALL` | `All fields` | scope rail | `[src: #allFields]` |
| `FIELD-NAMES` | `Names only` | scope rail | `[src: #namesOnly]` |
| `FIELD-CLEAR` | `Clear` | scope rail | `[src: #clearFields]` |
| `FIELD-NONE` | `No field name contains that text.` | scope rail | `[src: renderRail()]` |
| `COL-ENTITY` | `Entity` | result column | `[src: #grid]` |
| `COL-TYPE` | `Type` | result column | `[src: #grid]` |
| `COL-SYNONYM` | `Synonym` | result column | `[src: #grid]` |
| `MATCHED-IN` | `matched in {field}` | result row | `[src: .matchin]` |
| `NO-PARENT` | `no parent recorded` | result row, inspector | `[src: pathOf()]` |
| `GRAPH` | `Open results in new graph` | results header | `[src: #openGraph]` |
| `GRAPH-ACK` | `Sending {n} entities to a new graph view` | acknowledgement | `[src: #openGraph]` |
| `INSPECT-EMPTY` | `Select a result to inspect it.` | inspector | `[src: #inspector]` |
| `INSPECT-NONE` | `none recorded` | inspector | `[src: renderInspector()]` |
| `INSPECT-NEW` | `created here` | inspector | `[src: renderInspector()]` |
| `ZERO-HEAD` | `No matches for “{query}”` | zero state | `[src: renderZero()]` |
| `ZERO-SCOPE` | `Searched {fields} of {fieldTotal} fields across {types} of {typeTotal} entity types, in {n} entities. A miss inside a narrowed scope is not the same as an absence.` | zero state | `[src: renderZero()]` |
| `REMEDY-HEAD` | `Widen the search first` | zero state | `[src: .remedy-head]` |
| `REMEDY-FIELDS` | `Search all {n} fields` | remedy | `[src: remedies()]` |
| `REMEDY-MODE` | `Match any word instead of all` | remedy | `[src: remedies()]` |
| `REMEDY-TYPES` | `Include all entity types` | remedy | `[src: remedies()]` |
| `REMEDY-RESET` | `Reset every filter` | remedy | `[src: remedies()]` |
| `REMEDY-YIELD` | `{n} matches` | remedy, singular `1 match` | `[src: renderZero()]` |
| `EMPTY-SEARCH` | `Nothing in this run matches "{query}" under the current status filter.` | empty result | `[src: renderResults()]` |
| `EMPTY-FILTER` | `Nothing in this run has that status.` | empty result | `[src: renderResults()]` |
| `CREATE-HEAD` | `Not in the ontology? Add it.` | create panel | `[src: renderZero()]` |
| `CREATE-SUB` | `Checked against all {n} entities as you type, not just the fields above.` | create panel | `[src: renderZero()]` |
| `ANCESTRY` | `Ancestry` | section head | `[src: .section-head]` |
| `CHAIN-NEW` | `New {word}` | subject card caption | `[src: renderZero()]` |
| `CHAIN-UNTITLED` | `Untitled` | subject card, no label yet | `[src: renderZero()]` |
| `CHAIN-ROOT` | `Root level` | root card caption | `[src: renderZero()]` |
| `CHAIN-ROOT-NAME` | `owl:Thing` | root card | `[src: renderZero()]` |
| `CHAIN-PROP` | `Properties sit outside the class tree` | root card, property | `[src: renderZero()]` |
| `ROOT-CAUTION` | `This will sit at the root beside Academic Subject. Set rdfs:subClassOf below to place it under an existing parent.` | ancestry section | `[src: renderZero()]` |
| `SUBJECT` | `Subject` | subject row | `[src: .subject-row]` |
| `SUBJECT-FOLLOWS` | `follows rdfs:label` | subject row | `[src: renderZero()]` |
| `SUBJECT-OVERRIDDEN` | `overridden` | subject row | `[src: renderZero()]` |
| `STMT-COUNT` | `{n} statements` | statement table, singular `1 statement` | `[src: .stmt-count]` |
| `STMT-PRED` | `Predicate` | statement table header | `[src: .stmts]` |
| `STMT-VAL` | `Value` | statement table header | `[src: .stmts]` |
| `STMT-COMMENT-PH` | `One sentence saying what this is` | comment value | `[src: renderZero()]` |
| `ADD-ROW` | `Add row` | statement table | `[src: #addRow]` |
| `SOURCE` | `Source` | disclosure | `[src: #srcDisc]` |
| `COLLIDE-EXACT` | `{label} already exists. It sits under {path}. The search missed it because that field was out of scope.` | collision | `[src: renderZero()]` |
| `COLLIDE-NORM` | `{label} already exists, and its normalised name is the same as yours. It sits under {path}. The search missed it because that field was out of scope.` | collision | `[src: renderZero()]` |
| `COLLIDE-OPEN` | `Open {label}` | collision | `[src: #openExisting]` |
| `OPEN-ACK` | `Opened {label}` | acknowledgement | `[src: toast()]` |
| `CREATE-ACTION` | `Create {word}` | create panel | `[src: #doCreate]` |
| `CREATE-BLOCKED` | `Give rdfs:label a value to continue.` | create panel | `[src: renderZero()]` |
| `CREATE-ACK-PARENT` | `{label} created under {parent}` | acknowledgement | `[src: createEntity()]` |
| `CREATE-ACK-ROOT` | `{label} created at the root` | acknowledgement | `[src: createEntity()]` |

**FND-100** `EMPTY-SEARCH` and `EMPTY-FILTER` both say `run` and `status filter`, which are the Suggestions surface's vocabulary and not this surface's. They MUST be reworded to name the Query and the Scope. **Status:** specified, not implemented in the reference build.

---

## Deviations and known gaps

1. **The conformance table.** FND-45 records twelve contradictions against `TEC`. They are defects in the reference build, not decisions, and FND-46 binds their direction of repair.
2. **Screenshots.** None were produced. [`visual-reference.html`](visual-reference.html) carries the visual burden and shows every state live in both themes.
3. **Em dashes.** See [House style deviations](#house-style-deviations).
4. **The field total.** Nine search fields is the prototype's own enumerated list `[src: FIELDS]`, not a claim about the shipped build, whose field list scrolls beyond what the screenshot showed.
5. **Parent selection at scale.** The parent control is a plain select over the whole class list `[src: renderZero()]`. At the shipped build's entity count that needs a typeahead with its own performance contract, which this document does not establish. `TEC`'s combobox is the design to adopt.
6. **The graph view.** `Open results in new graph` is correctly enabled and disabled, but there is no graph view in the prototype to arrive at, so the handoff itself is unspecified here.
7. **Fixture data.** The prototype's store is an academic subject ontology, not the fixture in [`62-pizza-ontology-fixture.md`](../62-pizza-ontology-fixture.md). This surface therefore has no entry in [`61-acceptance-criteria-and-tests.md`](../61-acceptance-criteria-and-tests.md) until fixture queries are added.
8. **Retrieval.** The prototype scans every entity for every keystroke `[src: runSearch()]`. That is correct for 28 entities and wrong for the shipped build. Indexing is out of scope here and belongs to [`11-data-model-and-store.md`](../11-data-model-and-store.md).

---

## Registration

This document is not yet registered in the suite index. [`README.md`](../README.md) was deliberately not edited.

**Prefix registry**, into the table under `Requirement ID prefix registry`:

```
| `FND` | [`find/README.md`](find/README.md) | Find: the scope model, the zero state and its remedies, the inline create profile |
```

**Document map**, into the table under `Document map`:

```
| [`find/README.md`](find/README.md) | Find | `FND` | Global entity search: scoping and its two count semantics, the honest zero state, and creation as a restricted TEC profile | 30 min |
```

**Reading order**, as a new step after the Surface documents:

```
**[`find/README.md`](find/README.md)** - global entity search. Read after `text-entity-create`, because its create panel is a restricted profile of that document and its conformance table is only legible once TEC is known.
```

> **`SUG` is still unregistered.** [`add-children/README.md`](../add-children/README.md) is on disk but its prefix does not appear in the registry, so that document remains unreachable from the index. Its registration rows are in its own Registration section.

---

## Appendix A. Native stack mapping (non-normative)

Advisory only. A conformant implementation MAY meet the numbered requirements by other means.

### Control mapping

| This document | WinUI 3 | Avalonia |
|---|---|---|
| Result list | `ListView` with a `GridView` column template | `DataGrid` |
| Scope rail | `TreeView` or two `ItemsControl` groups of `CheckBox` | the same |
| Field filter | `TextBox` filtering the bound collection view | the same |
| Statement table | `ItemsRepeater` over a statement collection | `ItemsControl` |
| Changeable predicate | `ComboBox` with a transparent chrome until hover | the same |
| Ancestry chain | `ItemsControl` with a connector in the item template | the same |
| Source disclosure | `Expander` over a read-only `TextBox` with a monospace face | the same |
| Collision notice | `InfoBar` at `Warning` severity | a notification control |
| Acknowledgement | `InfoBar` set to transient | a notification manager |
| Inspector | a `Grid` row that grows from one line when selection is non-empty | the same |

### Notes on the mapping

1. **The two count semantics.** FND-13 is the easiest requirement to lose in binding. The type counts come from the current result set; the field counts require a separate evaluation per field against the Query. Do not bind both to the same collection view.
2. **Re-render and the caret.** FND-87 exists because the prototype rebuilds the panel on every keystroke to keep Source in step. A native implementation with real two way binding does not have this problem and should not reproduce the workaround.
3. **Remedy yields.** FND-36 requires evaluating each Remedy's result set before it is taken. At the shipped build's entity count that is several full evaluations per zero result, so it needs the index rather than a scan.
4. **Contrast.** The `DS` palette is authored per theme. Do not compute the dark theme from the light one; FND-93 forbids it.
5. **The escape to Add entity.** FND-42 is the requirement that keeps this panel from growing. Bind it early, even if the handoff initially just opens the other view with the label carried across.
