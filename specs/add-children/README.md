# Axiom: Add Children Suggestions

**Purpose:** This document specifies the Suggestions Surface, the view in which an assistant proposes new child classes for a selected class and the user triages those proposals and commits the ones worth keeping.

**Status:** Normative. [`visual-reference.html`](visual-reference.html) is descriptive and owns no requirements.

**Requirement ID prefixes owned:** `SUG`

---

## The reference implementation

> **The behavioural source of truth is an HTML prototype:**
>
> `C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\index.html`
>
> One self-contained file. It is **read-only**. Never edit it, move it, reformat it, or run it as part of implementing this document.

Where a statement in this document and the prototype disagree about *observed behaviour*, the prototype wins and this document is a defect to be fixed. Where this document marks behaviour as *specified, not implemented in the reference build*, this document wins as the statement of intent, and the implementer MUST NOT claim the behaviour exists until it does.

Every `[src: ...]` citation below names a symbol that exists in that file and was read before the sentence carrying it was written.

### House style deviations

This document uses no em dash character, on the author's instruction. Two suite conventions are affected and are deliberately departed from:

1. The appendix heading is `Appendix A. Native stack mapping (non-normative)` rather than the form given in [`README.md`](../README.md#1-heading-structure).
2. Where sibling documents set off a clause with an em dash, this document uses a colon, a comma or a full stop.

Nothing else in the suite conventions is departed from. British English is used throughout, as the suite requires.

---

## Scope

The Suggestions Surface occupies its own tab in the ontology workbench. It presents the output of one assistant **Run** against one **Target**: a list of proposed entities, each with a definition and a rationale, which the user filters, inspects, selects and commits into the Store as children of the Target.

### In scope

The presentation of a completed Run, the triage flow over it, the commit path into the Store, and every value, state and string the surface depends on.

### Out of scope

The following are named here so that their absence is deliberate rather than an omission:

1. **Generating suggestions.** The assistant call, its prompt, its transport, its failure modes and its cost are the concern of another document. This document begins at the moment a completed Run exists.
2. **Assistant selection.** The surface presents a chooser, but which assistants are available, how they are configured and how credentials are held are out of scope.
3. **The Individuals tab.** The reference build carries a second tab holding illustrative sample records `[src: INDIVIDUALS]`. It is a placeholder for an unrelated surface and is not specified here. An implementation MUST NOT treat it as a requirement.
4. **Suggestion kinds other than Add Children.** The kind chooser offers Add Siblings, Add Individuals and Refine Definition `[src: #suggestKind]`. Only Add Children is specified. **Status:** the other three are specified, not implemented in the reference build.

### Relationship to the rest of the suite

The surface is a consumer of existing specifications and defines no tokens and no general-purpose components of its own:

- Visual values come from [`40-design-system.md`](../40-design-system.md). Where this document names a prototype token such as `--accent`, the implementer binds it to the corresponding `DS` token.
- Controls come from [`41-component-library.md`](../41-component-library.md): Command bar, Button, Select field, Search field, Chip, Status dot, Tab strip, Virtualised table, Filter bar, Flyout menu. This document specifies only the composites that do not already exist there: the Run bar, the Suggestion row, the Status pill, the Detail disclosure and the Selection action bar.
- Commits mutate the Store as specified in [`11-data-model-and-store.md`](../11-data-model-and-store.md), and the resulting hierarchy change is observed by [`30-class-tree-and-inspector.md`](../30-class-tree-and-inspector.md).

---

## Terminology

Used exactly as defined here, in addition to the suite glossary in [`README.md`](../README.md#8-terminology). Never aliased.

| Term | Meaning |
|---|---|
| **Target** | The class the Run proposes children for |
| **Target queue** | The ordered list of Targets the user pages through |
| **Run** | One completed assistant invocation against one Target, producing a set of Suggestions |
| **Run history** | The ordered list of Runs recorded against one Target, newest first |
| **Suggestion** | One proposed entity within a Run |
| **Status** | A Suggestion's position in the triage lifecycle: `available`, `added` or `exists` |
| **Selectable** | A Suggestion whose Status is `available`; the only Status that can be selected or committed |
| **Selection** | The set of Suggestion identifiers the user has marked for commit |
| **Commit** | The act of writing selected Suggestions into the Store as children of the Target |
| **Analysis** | The assistant's prose explanation of why it proposed this set |
| **Context** | The summary of what was sent to the assistant: ancestors, children, descendants |

---

## Data contract

### The Suggestion record

**SUG-1** A Suggestion record MUST carry the following fields `[src: item()]`.

| Field | Type | Optional | Derivation |
|---|---|---|---|
| `id` | string | no | The normalised form of `label`; stable within a Run and used as the selection key `[src: norm()]` |
| `label` | string | no | The proposed entity's display name, as returned by the assistant |
| `kind` | enum | no | The entity kind. `Class` for Add Children |
| `def` | string | no | A one-sentence definition of the proposed entity |
| `rationale` | string | no | Why the assistant proposed it, in the assistant's own words |
| `norm` | string | no | The normalised name used for duplicate detection `[src: norm()]` |
| `iri` | string | no | The identifier the entity would be given on commit `[src: iri()]` |
| `status` | enum | no | `available`, `added` or `exists`. See [Status](#status) |
| `match` | string | yes | Present only when `status` is `exists`: the existing entity and its location |
| `overlap` | string | yes | A non-blocking caution that the Suggestion partially overlaps an entity elsewhere |

**SUG-2** Normalisation MUST apply Unicode NFKC, lower-case the label, extract runs of Unicode letters, numbers and combining marks, and join those runs with one space. If there are no such runs, it MUST retain the trimmed, lower-cased NFKC label. Distinct non-Latin labels MUST remain distinct. This is the shared authoring identity rule; search tokenisation is separate. This supersedes the prototype's ASCII-only key and is shared with FND-73.

**SUG-3** The identifier MUST apply Unicode NFKC, split into runs of Unicode letters, numbers, combining marks and underscores, uppercase the first character of each run, and concatenate the runs. An empty result becomes `Entity`; a result not starting with a Unicode letter gains the prefix `Entity`. The local name is limited to 200 Unicode code points and is prefixed with the ontology namespace. This is the shared authoring identifier rule. This supersedes the prototype's ASCII-only derivation and is shared with FND-58.

**SUG-4** Two Suggestions within one Run MUST NOT share an `id`. An assistant response containing a collision is malformed and the later record MUST be discarded.

**SUG-5** `overlap` is advisory and MUST NOT change `status`, MUST NOT make a Suggestion unselectable, and MUST NOT block a Commit `[src: detailHTML()]`.

### The Run record

**SUG-6** A Run record MUST carry: a stable identifier, the completion timestamp, the name of the assistant that produced it, and the ordered set of Suggestion records `[src: TARGETS]`.

**SUG-7** Run history MUST be ordered newest first, and a newly recorded Run MUST be prepended to it and become the displayed Run `[src: #newRun]`.

### The Target queue

**SUG-8** The Target queue MUST carry, per Target: the Target's label, its Context summary, its Analysis paragraphs, and its Run history `[src: TARGETS]`.

**SUG-9** The Context summary MUST carry three counted entries, `Ancestors`, `Children` and `Descendants`, each holding an integer count and a detail string, and the count MUST be presented as a distinct value rather than embedded in the detail string `[src: #contextGrid]`.

---

## Status

Status is the spine of the surface. It determines what the user may select, what the counts say, and what a Commit does.

**SUG-10** A Suggestion MUST hold exactly one of three Statuses `[src: STATUS_META]`.

| Status | Meaning | Selectable | Display word |
|---|---|---|---|
| `available` | Not in the Store, and nothing in the Store matches it. Ready to commit | yes | `Available` |
| `added` | Committed to the Store during this Run | no | `Added` |
| `exists` | An entity with this label or normalised name is already in the Store | no | `Exists` |

**SUG-11** Only a Suggestion whose Status is `available` MUST be selectable. A Suggestion whose Status is `added` or `exists` MUST present its selection control in a disabled state, and that control MUST carry an accessible name that states the label and why it cannot be added `[src: renderRows()]`.

**SUG-12** A Suggestion whose Status is `exists` MUST NOT be duplicated in the Store and MUST NOT be moved within the hierarchy. The surface MUST state this to the user verbatim as copy `STATUS-EXISTS-NOTE` `[src: EXISTS_NOTE]`.

### Transitions

**SUG-13** A Commit MUST move every committed Suggestion from `available` to `added`, and MUST NOT alter any other Suggestion's Status `[src: commitAdd()]`.

**SUG-14** Starting a new Run against the same Target MUST map the previous Run's Statuses as follows, because anything previously added or already present is now in the Store `[src: #newRun]`:

| Status before | Status in the new Run |
|---|---|
| `added` | `exists` |
| `exists` | `exists` |
| `available` | `available` |

**SUG-15** Status MUST NOT transition in any direction other than those given in SUG-13 and SUG-14. There is no un-commit within the surface; reversing a Commit is a Store operation performed elsewhere.

---

## Surface anatomy

The surface is four fixed bands above one scrolling region, with one action bar pinned below it.

**SUG-16** The four bands, in order, MUST be: the Tab strip, the Command bar, the Run bar and the Filter bar. They MUST remain visible while the suggestion list scrolls `[src: #suggestionsChrome]`.

**SUG-17** The scrolling region MUST contain the suggestion list and nothing else. The action bar MUST occupy its own space below the scrolling region and MUST NOT overlay it `[src: .od-screen]`.

**SUG-18** No band MUST restate a value another band already displays. Specifically:

1. The Run's timestamp and assistant are displayed by the Run chooser in the Command bar, and MUST NOT be repeated as a separate line.
2. The per-Status counts are displayed by the Filter bar chips, and MUST NOT be repeated as a separate set of count chips.

> This requirement exists because an earlier arrangement carried both duplications, plus Analysis and Context as accordions that displaced the list when opened: seven bands totalling 401px before the first row with Context open. Removing the duplications and making the disclosures overlays brought the same content to four bands totalling 183px, at every panel state. The arithmetic is set out in [`visual-reference.html`](visual-reference.html) under The vertical budget.

### Band contents

**SUG-19** The Command bar MUST carry, in order: the Target pager, the suggestion kind chooser, the assistant chooser, then, aligned to the trailing edge, the Run chooser and the new Run action `[src: #cmdbar]`.

**SUG-20** The Run bar MUST carry the Target title, then, aligned to the trailing edge, the Analysis trigger and the Context trigger `[src: #runbar]`.

**SUG-21** The Run bar MAY carry a single-line preview of the Analysis in the horizontal space between the title and the triggers. The preview MUST occupy only leftover width, MUST truncate rather than wrap, and MUST be withdrawn below the width given in [Constants](#constants) rather than be allowed to add height `[src: #analysisPeek]`.

**SUG-22** The title MUST name both the operation and the Target, and the operation phrase MUST follow the suggestion kind chooser `[src: #suggestKind]`.

**SUG-23** The Filter bar MUST carry the four Status filter chips, then, aligned to the trailing edge, the search field `[src: .tools]`.

---

## The suggestion list

### Columns

**SUG-24** The list MUST present exactly five columns in this order `[src: #grid]`.

| # | Column | Width | Header | Contents |
|---|---|---|---|---|
| 1 | Selection | fixed, 44px | select-all control | The row's selection control |
| 2 | Suggestion | 30% | `Suggestion`, sortable | The label and the entity kind |
| 3 | Definition | remaining | `Definition` | The definition, clamped |
| 4 | Status | fixed, 150px | `Status`, sortable | The Status pill |
| 5 | Detail | fixed, 44px | none | The detail expander |

**SUG-25** The column header row MUST remain visible at the top of the scrolling region while the list scrolls `[src: .grid]`.

### Row anatomy

**SUG-26** A row MUST present the label at a heavier weight than the definition, and the entity kind as a subordinate badge beside the label `[src: .name]`.

**SUG-27** The definition is data text. It MUST be clamped to the line count given in [Constants](#constants) rather than wrapped without limit, and the full text MUST remain reachable through the detail disclosure `[src: .od-clamp-2]`.

**SUG-28** A row MUST be expandable, and activating the row's body outside an interactive control MUST toggle its expansion `[src: toggleExpand()]`.

**SUG-29** A selected row MUST be distinguishable from an unselected row by a persistent background treatment, not by the selection control alone `[src: .is-selected]`.

### The Status pill

**SUG-30** Status MUST be conveyed by three simultaneous cues: a word, a shape, and a colour. Colour MUST NOT be the sole carrier of Status `[src: pillHTML()]`.

| Status | Word | Shape | Border | Colour token |
|---|---|---|---|---|
| `available` | `Available` | plus | dashed | `--idle` |
| `added` | `Added` | tick | solid | `--ok` |
| `exists` | `Exists` | duplicate | solid | `--warn` |

**SUG-31** Where horizontal space forces the word to be withdrawn, the pill MUST retain an accessible name carrying that same word `[src: .pill-text]`.

### The detail disclosure

**SUG-32** An expanded row MUST reveal, in this order: the rationale under a heading naming the assistant, then the identifier and relationship block, then the Status note where one applies, then the single-row commit action where the Status is `available` `[src: detailHTML()]`.

**SUG-33** The identifier and relationship block MUST present the following as labelled values `[src: detailHTML()]`.

| Label | Value | Presented as |
|---|---|---|
| `Label` | the Suggestion's label | text |
| `Normalized name` | `norm` | monospace |
| `Identifier` | `iri` | monospace |
| `Parent relation` | the subclass axiom that a Commit would assert | monospace |
| `Existing entity` | `match`, only where `status` is `exists` | text |

**SUG-34** The Status note MUST be presented for `added` and `exists`, and the `overlap` caution MUST be presented in its place where the Status is `available` and an `overlap` is set `[src: detailHTML()]`.

**SUG-35** Expansion state MUST be per row and MUST allow any number of rows open at once `[src: state]`.

**SUG-36** Changing the Target, the Run, the filter, the search text or the sort MUST NOT be prevented by open rows. Changing the Target or the Run MUST clear all expansion state `[src: resetView()]`.

---

## Filtering, searching and sorting

**SUG-37** The Filter bar MUST present four mutually exclusive filters, each carrying a live count of the rows it would show `[src: renderHeader()]`.

| Filter | Shows |
|---|---|
| `All` | every Suggestion in the Run |
| `Available` | Status `available` |
| `Added` | Status `added` |
| `Already exist` | Status `exists` |

**SUG-38** The counts MUST be computed from the current Run, MUST NOT be affected by the search text, and MUST update immediately after a Commit `[src: countBy()]`.

**SUG-39** Search MUST match case-insensitively against the label and the definition, MUST combine with the active filter by conjunction, and MUST apply on each keystroke `[src: visibleItems()]`.

**SUG-40** The Suggestion and Status columns MUST be sortable. Activating a column's sort control MUST cycle ascending, then descending, then back to the Run's natural order `[src: .sortbtn]`.

**SUG-41** Sorting by Status MUST order `available` before `added` before `exists`, so that actionable rows sort to the top, and MUST break ties by label `[src: STATUS_META]`.

**SUG-42** The active sort MUST be exposed to assistive technology on the column header, and MUST be indicated visually on that header `[src: #thName]`.

### The empty result

**SUG-43** Where the filter and search combination yields no rows, the surface MUST replace the list with an explanation of the cause and a control that clears both the filter and the search text. It MUST NOT present an empty table or a blank region `[src: #gridEmpty]`.

**SUG-44** The explanation MUST distinguish the two causes: a search that matched nothing under the active filter, and a filter whose Status is absent from the Run `[src: #emptyText]`.

---

## Selection and commit

**SUG-45** Selection MUST be keyed by Suggestion `id` and MUST survive filtering, searching, sorting and expansion `[src: state]`.

**SUG-46** The select-all control MUST be tri-state and MUST be scoped to the rows that are both currently visible and selectable `[src: syncSelectAll()]`.

| Condition | State |
|---|---|
| no scoped row selected | unchecked |
| some scoped rows selected | indeterminate |
| every scoped row selected | checked |
| no scoped row exists | unchecked and disabled |

**SUG-47** The action bar MUST display the size of the Selection against the number of `available` Suggestions in the Run, and MUST state plainly when the Selection is empty `[src: renderActionBar()]`.

**SUG-48** The primary action MUST carry the Selection size in its own label, and MUST agree in grammatical number `[src: renderActionBar()]`.

**SUG-49** The primary action and the clear action MUST both be disabled while the Selection is empty `[src: renderActionBar()]`.

**SUG-50** A Commit MUST, in one transaction: assert each selected Suggestion as a new entity, assert the subclass axiom naming the Target as its parent, move each committed Suggestion to `added`, empty the Selection, and recompute every count `[src: commitAdd()]`.

**SUG-51** A Commit MUST be confirmable from two places with identical effect: the action bar for the whole Selection, and the detail disclosure of a single `available` row `[src: commitAdd()]`.

**SUG-52** A Commit MUST be acknowledged with a transient message naming the number committed and the Target `[src: toast()]`.

**SUG-53** A Commit MUST NOT navigate away from the surface, MUST NOT collapse open rows, and MUST NOT reset the filter or the search text.

---

## The overlay panels

Analysis and Context are reference material: consulted occasionally, never needed at the same time as the list. They are therefore overlays and not bands.

**SUG-54** The Analysis and Context panels MUST be presented as overlays anchored to their triggers. They MUST NOT displace, reflow or resize any content beneath them `[src: .pop-panel]`.

**SUG-55** A closed panel MUST cost no vertical space beyond its trigger `[src: .pop-host]`.

**SUG-56** At most one panel MUST be open at a time. Opening one MUST close the other `[src: closePops()]`.

**SUG-57** A panel MUST dismiss on: activating its own trigger again, interacting outside the panel, and the cancel key. Cancel MUST return focus to the trigger that opened the panel `[src: closePops()]`.

**SUG-58** A trigger MUST expose its panel's open state to assistive technology and MUST indicate it visually `[src: .pop-trigger]`.

**SUG-59** A panel MUST constrain its own height and scroll internally rather than grow past the viewport. The constraints are given in [Constants](#constants) `[src: .pop-panel]`.

**SUG-60** Changing the Target or the Run MUST close any open panel, because its contents belong to the Run being left `[src: resetView()]`.

**SUG-61** The Analysis panel MUST title itself with the name of the assistant that produced the Run, and MUST present the Analysis as discrete paragraphs `[src: #analysisTitle]`.

**SUG-62** The Context panel MUST present the three counted entries from SUG-9, with the count given visual precedence over the detail `[src: #contextGrid]`.

---

## Target and run navigation

**SUG-63** The Target pager MUST show the current position and the queue length, and MUST disable the previous control at the first Target and the next control at the last `[src: #pagerPos]`.

**SUG-64** Changing the Target MUST reset the view: clear the Selection, clear expansion, clear the search text, return the filter to `All`, close any open panel, and select that Target's newest Run `[src: resetView()]`.

**SUG-65** The Run chooser MUST list every Run in the current Target's history, each entry stating its timestamp, its assistant, its suggestion count and how many were added `[src: renderHeader()]`.

**SUG-66** Changing the Run MUST reset the view as in SUG-64, without changing the Target.

**SUG-67** Requesting a new Run MUST record a new Run against the current Target, apply the Status mapping in SUG-14, make the new Run current, and reset the view `[src: #newRun]`.

---

## Keyboard model

**SUG-68** Every control on the surface MUST be reachable and operable from the keyboard, and MUST show a visible focus indicator `[src: :focus-visible]`.

**SUG-69** Focus order MUST follow the reading order of the bands: Tab strip, Command bar, Run bar, Filter bar, column headers, then the list, then the action bar.

**SUG-70** The following bindings MUST be honoured.

| Key | Context | Effect |
|---|---|---|
| Tab, Shift+Tab | anywhere | Move to the next or previous control in focus order |
| Left, Right | Tab strip | Move to the previous or next tab and select it `[src: .tab]` |
| Space | a selection control | Toggle that row's selection |
| Space, Enter | the detail expander | Toggle that row's expansion |
| Escape | a panel is open | Close it and return focus to its trigger `[src: closePops()]` |

**SUG-71** Only the expanded row's detail content MUST be present in the focus order. A collapsed row's detail content MUST NOT be reachable `[src: toggleExpand()]`.

**SUG-72** Pointer-only affordances MUST NOT be the only route to any function. Row expansion is reachable by pointer through the row body and by keyboard through the expander `[src: #grid]`.

---

## Accessibility

**SUG-73** The list MUST be exposed as a table with column headers associated with their columns `[src: .grid]`.

**SUG-74** Every control MUST carry an accessible name. Controls whose visible label is withdrawn at narrow widths MUST retain their name `[src: .hide-sm]`.

**SUG-75** Status, selection state and sort state MUST each be conveyed by text or shape in addition to colour `[src: pillHTML()]`.

**SUG-76** Body text MUST meet a contrast ratio of at least 4.5 to 1 against its background. Pills, icons, borders and other essential non-text graphics MUST meet at least 3 to 1. The dark theme MUST be audited independently of the light theme and MUST NOT be derived by inversion.

**SUG-77** The surface MUST honour a user preference for reduced motion by suppressing transitions and entrance animations, without loss of function `[src: @media (prefers-reduced-motion: reduce)]`.

**SUG-78** The surface MUST remain usable with system font scaling applied, reflowing rather than clipping.

---

## Responsive behaviour

**SUG-79** The surface MUST NOT scroll horizontally at any width at or above the minimum given in [Constants](#constants).

**SUG-80** As width is withdrawn, content MUST be surrendered in this order, and the band count MUST NOT increase at any step `[src: @media (max-width: 900px)]`:

1. The Analysis preview is withdrawn.
2. The Definition column is withdrawn and the definition moves beneath the label in the Suggestion column, still clamped.
3. The Status pill's word is withdrawn, leaving the shape and the accessible name.

**SUG-81** No essential action MUST be withdrawn at any width. Selection, commit, filter, search and expansion remain available throughout.

---

## Constants

Every numeric value the surface depends on. No constant appears only in prose.

| Constant | Value | Applies to | Source |
|---|---|---|---|
| Spacing step | 4px | the rhythm all spacing is built on | `[src: --sp-1]` |
| Spacing scale | 4, 8, 12, 16, 20, 24, 32px | all padding and gaps | `[src: --sp-1]` |
| Control height | 30px | selects, buttons, icon buttons in the bands | `[src: .btn]` |
| Primary action height | 34px | the commit action in the action bar | `[src: .btn-lg]` |
| Chip height | 28px | Status filter chips | `[src: .chip]` |
| Pill height | 22px | the Status pill | `[src: .pill]` |
| Selection control size | 18px | row and select-all controls | `[src: input.check]` |
| Expander size | 28px | the detail expander | `[src: .expander]` |
| Band padding | 8px vertical, 16px horizontal | Command bar, Run bar, Filter bar | `[src: .cmdbar]` |
| Action bar padding | 12px vertical, 16px horizontal | the action bar | `[src: .actionbar]` |
| Row padding | 8px vertical, 12px horizontal | list rows | `[src: tr.main]` |
| Selection column width | 44px | column 1 | `[src: #grid]` |
| Suggestion column width | 30% | column 2 | `[src: #grid]` |
| Status column width | 150px | column 4 | `[src: #grid]` |
| Detail column width | 44px | column 5 | `[src: #grid]` |
| Definition clamp | 2 lines | columns 2 and 3 | `[src: .od-clamp-2]` |
| Title size | 18px, and 16px below the narrow breakpoint | the Run bar title | `[src: .runbar]` |
| Body size | 16px | labels and definitions | `[src: .def]` |
| Secondary size | 14px | band labels and the Analysis preview | `[src: .runpeek]` |
| Label size | 13px | column headers, pills, badges | `[src: .pill]` |
| Search field width | 240px, and 150px below the narrow breakpoint | the Filter bar | `[src: .search]` |
| Overlay width | the lesser of 620px and the viewport less 32px | Analysis and Context panels | `[src: .pop-panel]` |
| Overlay maximum height | the lesser of 60% of viewport height and 520px | Analysis and Context panels | `[src: .pop-panel]` |
| Overlay offset | 6px below its trigger | Analysis and Context panels | `[src: .pop-panel]` |
| Preview breakpoint | 1100px | below which the Analysis preview is withdrawn | `[src: .hide-md]` |
| Definition breakpoint | 900px | below which the Definition column folds | `[src: .c-def]` |
| Narrow breakpoint | 680px | below which pill words and band labels are withdrawn | `[src: .hide-sm]` |
| Minimum width | 375px | the narrowest supported width | this document |
| Feedback duration | 120ms | hover and focus state changes | `[src: --t-fast]` |
| Transition duration | 180ms | expansion, overlay entrance, rotation | `[src: --t-enter]` |
| Acknowledgement dwell | 4000ms | the post-commit message | `[src: toast()]` |
| Control radius | 4px | buttons, fields, chips at rest | `[src: --r-ctl]` |
| Panel radius | 6px | overlays and the detail panel | `[src: --r-panel]` |
| Pill radius | fully rounded | Status pills and filter chips | `[src: --r-pill]` |
| Body contrast floor | 4.5 to 1 | text against its background | this document |
| Graphic contrast floor | 3 to 1 | pills, icons, borders | this document |

### Token bindings

The prototype's tokens map to `DS` tokens one for one. An implementation MUST take its values from [`40-design-system.md`](../40-design-system.md) and MUST NOT copy the prototype's literals.

| Prototype token | Role |
|---|---|
| `--ground`, `--surface`, `--raised`, `--sunken` | the four ground levels |
| `--border`, `--border-strong` | hairline and control stroke |
| `--text`, `--text-muted` | primary and secondary text |
| `--accent`, `--accent-hover`, `--accent-fg` | the primary action and selection |
| `--ok`, `--ok-bg`, `--ok-border` | Status `added` |
| `--warn`, `--warn-bg`, `--warn-border` | Status `exists` |
| `--idle`, `--idle-border` | Status `available` |
| `--row-hover`, `--row-selected` | row interaction layers |
| `--focus` | the focus indicator |
| `--shadow-pop` | overlay elevation |

---

## Copy catalogue

Every user-facing string, quoted verbatim. Copy is part of this specification. An implementer MUST NOT invent wording, and MUST NOT translate or paraphrase these strings without a corresponding change to this table.

| Copy ID | String | Where | Source |
|---|---|---|---|
| `FILTER-ALL` | `All` | filter chip | `[src: renderHeader()]` |
| `FILTER-AVAILABLE` | `Available` | filter chip | `[src: renderHeader()]` |
| `FILTER-ADDED` | `Added` | filter chip | `[src: renderHeader()]` |
| `FILTER-EXISTS` | `Already exist` | filter chip | `[src: renderHeader()]` |
| `STATUS-AVAILABLE` | `Available` | Status pill | `[src: STATUS_META]` |
| `STATUS-ADDED` | `Added` | Status pill | `[src: STATUS_META]` |
| `STATUS-EXISTS` | `Exists` | Status pill | `[src: STATUS_META]` |
| `STATUS-EXISTS-NOTE` | `An entity with this label or normalized name already exists. It will not be duplicated or moved.` | detail disclosure | `[src: EXISTS_NOTE]` |
| `STATUS-ADDED-NOTE` | `Added to the ontology in this run as a direct child.` | detail disclosure | `[src: ADDED_NOTE]` |
| `COL-SUGGESTION` | `Suggestion` | column header | `[src: #thName]` |
| `COL-DEFINITION` | `Definition` | column header | `[src: #grid]` |
| `COL-STATUS` | `Status` | column header | `[src: #thStatus]` |
| `SEARCH-PLACEHOLDER` | `Filter suggestions` | search field | `[src: #search]` |
| `SEARCH-NAME` | `Filter suggestions by label or definition` | search field accessible name | `[src: #search]` |
| `SELECT-ALL-NAME` | `Select all available suggestions` | select-all accessible name | `[src: #selectAll]` |
| `SELECTION-EMPTY` | `No suggestions selected` | action bar | `[src: renderActionBar()]` |
| `SELECTION-COUNT` | `{n} of {available} available selected` | action bar | `[src: renderActionBar()]` |
| `ACTION-COMMIT-EMPTY` | `Add selected children` | primary action, empty Selection | `[src: renderActionBar()]` |
| `ACTION-COMMIT-ONE` | `Add 1 child` | primary action, one selected | `[src: renderActionBar()]` |
| `ACTION-COMMIT-MANY` | `Add {n} children` | primary action, more than one selected | `[src: renderActionBar()]` |
| `ACTION-CLEAR` | `Clear selection` | action bar | `[src: #clearSel]` |
| `ACTION-COMMIT-ROW` | `Add this child` | detail disclosure | `[src: detailHTML()]` |
| `ACK-COMMIT-ONE` | `1 child added under {target}` | post-commit message | `[src: commitAdd()]` |
| `ACK-COMMIT-MANY` | `{n} children added under {target}` | post-commit message | `[src: commitAdd()]` |
| `ACK-NEW-RUN` | `New run recorded · {n} suggestions` | post-run message | `[src: #newRun]` |
| `EMPTY-TITLE` | `No suggestions match this filter` | empty result | `[src: #gridEmpty]` |
| `EMPTY-SEARCH` | `Nothing in this run matches "{query}" under the current status filter.` | empty result, search cause | `[src: renderRows()]` |
| `EMPTY-FILTER` | `Nothing in this run has that status.` | empty result, filter cause | `[src: renderRows()]` |
| `EMPTY-RESET` | `Clear filter and search` | empty result | `[src: #resetFilters]` |
| `PANEL-ANALYSIS` | `Analysis` | Run bar trigger | `[src: #analysisBtn]` |
| `PANEL-ANALYSIS-TITLE` | `Why {assistant} proposed these` | Analysis panel | `[src: #analysisTitle]` |
| `PANEL-CONTEXT` | `Context` | Run bar trigger | `[src: #contextBtn]` |
| `PANEL-CONTEXT-TITLE` | `Context sent` | Context panel | `[src: #contextPanel]` |
| `PANEL-CONTEXT-NAME` | `Context sent to the assistant` | Context panel accessible name | `[src: #contextPanel]` |
| `CTX-ANCESTORS` | `Ancestors` | Context panel | `[src: #contextGrid]` |
| `CTX-CHILDREN` | `Children` | Context panel | `[src: #contextGrid]` |
| `CTX-DESCENDANTS` | `Descendants` | Context panel | `[src: #contextGrid]` |
| `DETAIL-IDENTITY` | `Identifier and relationship` | detail disclosure | `[src: detailHTML()]` |
| `DETAIL-LABEL` | `Label` | detail disclosure | `[src: detailHTML()]` |
| `DETAIL-NORM` | `Normalized name` | detail disclosure | `[src: detailHTML()]` |
| `DETAIL-IRI` | `Identifier` | detail disclosure | `[src: detailHTML()]` |
| `DETAIL-PARENT` | `Parent relation` | detail disclosure | `[src: detailHTML()]` |
| `DETAIL-MATCH` | `Existing entity` | detail disclosure | `[src: detailHTML()]` |
| `CMD-SUGGEST` | `Suggest` | Command bar label | `[src: #suggestKind]` |
| `CMD-KIND-CHILDREN` | `Add Children` | kind chooser | `[src: #suggestKind]` |
| `CMD-NEW-RUN` | `New run` | Command bar action | `[src: #newRun]` |
| `TITLE-ADD-CHILDREN` | `Add children to {target}` | Run bar title | `[src: renderHeader()]` |

> `DETAIL-NORM` reads `Normalized name` rather than the British `Normalised name`, because it names a field of the Suggestion record rather than prose. The suite's British English rule governs prose; identifiers keep their spelling. Recorded here so the inconsistency is deliberate rather than a defect.

---

## Deviations and known gaps

1. **Suggestion kinds.** Only Add Children is specified. **Status:** Add Siblings, Add Individuals and Refine Definition are specified, not implemented in the reference build.
2. **Fixture data.** The reference build carries illustrative content about fashion merchandising and textile science. It is not drawn from the fixture in [`62-pizza-ontology-fixture.md`](../62-pizza-ontology-fixture.md) that the suite's acceptance tests assume. Acceptance tests for this surface require fixture Runs to be added there first. Until they are, this surface has no entry in [`61-acceptance-criteria-and-tests.md`](../61-acceptance-criteria-and-tests.md).
3. **Screenshots.** None were produced. [`visual-reference.html`](visual-reference.html) carries the visual burden instead, and shows every state live in both themes, which a screenshot cannot.
4. **Overlay dismissal on scroll.** The reference build does not reposition or dismiss an open panel when the list scrolls beneath it. **Status:** specified, not implemented in the reference build: an open panel SHOULD dismiss when the scrolling region scrolls.
5. **Virtualisation.** The reference build renders every row. The suite requires lists beyond a threshold to be virtualised, per [`31-individuals-table.md`](../31-individuals-table.md). A Run large enough to need it has not been observed. **Status:** specified, not implemented in the reference build.
6. **Em dashes.** See [House style deviations](#house-style-deviations).

---

## Registration

`SUG` is registered in the [suite index](../README.md) alongside TEC and FND.

---

## Appendix A. Native stack mapping (non-normative)

Advisory only. A conformant implementation MAY meet the numbered requirements by other means.

### Control mapping

| This document | WinUI 3 | Avalonia |
|---|---|---|
| Suggestion list | `ListView` with a `GridView`-style column template, or `ItemsRepeater` | `DataGrid` |
| Column sort control | `DataGridColumnHeader` | `DataGridColumnHeader` |
| Selection control | `CheckBox` with `IsThreeState` on the select-all | `CheckBox` with `IsThreeState` |
| Status pill | `Border` around an `IconElement` and `TextBlock` | `Border` around a `PathIcon` and `TextBlock` |
| Detail disclosure | `Expander`, or a templated details row | `Expander` |
| Overlay panel | `Flyout` with `Placement="BottomEdgeAlignedRight"` | `Popup` or `FlyoutBase` |
| Target pager | two `Button` controls around a `TextBlock` | the same |
| Run chooser | `ComboBox` | `ComboBox` |
| Filter chips | `RadioButtons` styled as chips | `RadioButton` group |
| Search field | `AutoSuggestBox` with suggestions disabled, or `TextBox` | `TextBox` with a search theme |
| Action bar | a `Grid` row pinned below the list | the same |
| Acknowledgement | `InfoBar` set to transient, or `TeachingTip` | a notification manager |

### Notes on the mapping

1. **Tri-state select-all.** WinUI's `IsThreeState` cycles through the indeterminate state on user click, which this surface does not want. Bind `IsChecked` to a nullable computed property and handle `Click` rather than `Checked`.
2. **The overlay panels.** A `Flyout` gives dismissal, focus return and top-layer placement without hand-written logic. The reference build implements those by hand only because the web platform's equivalent is newer than its runtime baseline.
3. **The fixed bands.** Place them in `Grid` rows sized `Auto` above a row sized `*`. Do not reproduce the bands as a scrolling header; SUG-16 requires they stay visible.
4. **Definition clamping.** `TextBlock.TextTrimming` with `MaxLines="2"` matches SUG-27. Do not clip without a trimming indicator.
5. **Reduced motion.** Read `UISettings.AnimationsEnabled` and disable storyboards accordingly, satisfying SUG-77.
6. **Contrast.** The `DS` palette is authored per theme. Do not compute the dark theme from the light one; SUG-76 forbids it.
