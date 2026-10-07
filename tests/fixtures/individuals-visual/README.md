# Individuals, Inspector and Touchpoints

**Purpose:** Specify the Individuals grid, the kind aware Inspector, and Find Touchpoints as a detached action, to the level of detail required to rebuild all three without reading the prototype.

**Status:** Normative. Revision 1.

**Requirement ID prefixes owned:** `IND`

**Behavioural source of truth:** `C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\individuals.html`, read only. Where this document and the prototype disagree about a fact the prototype genuinely establishes, the prototype wins and this document is the defect. Where they disagree about a decision, this document wins and Appendix B.1 records the prototype as the defect.

**Why this document exists in two places.** `.gitignore` line 17 is `specs/`, and `git ls-files specs` returns nothing. Every document under `specs/` is untracked and is removed by a clean. The repository already met this problem and solved it: `docs/issues56-validation.md` records that "Revision 2 and its normative README are tracked under `tests/fixtures/extend-visual` because `specs/` is ignored". This document therefore exists at `specs/individuals/` where the other specs live, and byte identical at `tests/fixtures/individuals-visual/` where git keeps it. Neither copy is authoritative over the other. If they ever differ, the tracked copy wins, because it is the one that survived.

---

## 1. Scope and precedence

**IND-1** This document specifies three surfaces: the **Individuals** pane, the **Inspector** pane, and the **Touchpoints** pane together with the action that opens it.

**IND-2** It does not specify Details, Graph, Hierarchy, Query, Sparsity or Ontology Quality. Where a behaviour is shared, this document names the owning document and defers.

**IND-3** The following documents own what they describe, and this document MUST NOT restate or contradict them:

| Document | Owns |
| --- | --- |
| `docs/touchpoints.md` | Touchpoint candidates, ranking, relationships, targets, the apply path, the saved result cache and the request etiquette |
| `docs/menu-ux.md` | The Individuals report, its six entry points, its page size, and the count and disable rules for class choices |
| `docs/adaptive-pane-ux.md` | Presentation names, thresholds, hysteresis, the recovery state, and the retained state of each pane |
| `docs/entity-editing.md` | The concurrent edit merge contract shared by Details, Inspector and scoped Source |
| `specs/find/README.md` sections 3.1 and 3.2 | Container nesting, vertical budget and horizontal measure discipline |
| `specs/quality/README.md` QLY-66 to QLY-74 | The one directional gate applied here to usage facts |

**IND-4** Where this document supersedes a sentence in an existing document, the superseded sentence MUST appear in Appendix B.2, quoted verbatim, with the superseding authority named. A silent supersession is a defect in this document.

**IND-5** Requirement identifiers are `IND-n`, numbered from 1, with no gaps and no duplicates. Numbering is append only across revisions: a later revision adds identifiers and never renumbers an existing one, so that any identifier cited elsewhere keeps its meaning.

**IND-6** RFC 2119 keywords in capitals carry their RFC 2119 meaning.

---

## 2. Evidence and source markers

**IND-7** Every factual claim in this document carries a marker naming where it came from:

| Marker | Meaning |
| --- | --- |
| `[shot: NN]` | Visible in the numbered capture in `screenshots/` |
| `[ttl]` | Measured from the working ontology, `schools.ttl` |
| `[proto]` | Read out of the prototype named above |
| `[docs: f.md]` | Stated by that repository document |
| `[new]` | A judgment with no source behind it |

**IND-8** `[new]` claims are the ones to argue with, and they are marked precisely so a reviewer can find them without reading the whole document.

**IND-9** The evidence folder holds exactly two captures, because exactly two exist. No capture of any surface specified here has ever been taken, because none of these surfaces has run in Axiom.

| File | What it establishes |
| --- | --- |
| `screenshots/01-window-grid-and-inspector.png` | The Individuals grid at three columns, the default Inspector on an individual, the Hierarchy rail, and the tab strip carrying both `Find Touchpoints` inside the Inspector and `Find Touchpoints_2` beside it |
| `screenshots/02-details-statement-table.png` | The Details view, which the Inspector's statement region conforms to |

---

## 3. The working ontology

**IND-10** The figures in this section are measured from `schools.ttl` and are cited by later requirements. They are facts about one ontology, not constants of the product. An implementation MUST derive the equivalent figures from whatever ontology is loaded.

**IND-11** The ontology declares two classes. One, `:School`, has 21,461 direct instances. The other, `owl:Thing`, has none. `[ttl]`

**IND-12** Twelve predicates are asserted across those individuals, plus `rdf:type`. Measured fill and distinct counts over all 21,461 subjects: `[ttl]`

| Predicate | Fill | Fill % | Distinct values |
| --- | ---: | ---: | ---: |
| `rdf:type` | 21,461 | 100.0 | 1 |
| `:hasQID` | 21,461 | 100.0 | 21,461 |
| `:hasType` | 21,461 | 100.0 | 323 |
| `owl:sameAs` | 21,461 | 100.0 | 21,461 |
| `rdfs:label` | 20,517 | 95.6 | 20,273 |
| `:hasCountry` | 20,470 | 95.4 | 289 |
| `:establishedYear` | 17,589 | 82.0 | 499 |
| `rdfs:comment` | 17,517 | 81.6 | 11,597 |
| `:locatedIn` | 17,118 | 79.8 | 7,144 |
| `:hasWebsite` | 16,286 | 75.9 | 16,117 |
| `:hasCoordinates` | 14,534 | 67.7 | 14,337 |
| `rdfs:seeAlso` | 10,281 | 47.9 | 20,200 |
| `:hasLanguage` | 61 | 0.3 | 13 |

**IND-13** 944 individuals assert no `rdfs:label`. That is 4.4 per cent of the ontology. `[ttl]`

**IND-14** `rdfs:seeAlso` is multi valued. One subject, `:Q736674`, carries 29 values. 10,281 subjects carry at least one and 5,265 carry exactly one. `[ttl]`

**IND-15** 74 lines of the ontology carry a backslash escaped quotation mark inside a literal, for example `"POLTEK \"API\""@en`. A reader that splits on every quotation mark produces empty and truncated values. An implementation MUST parse literals with escape awareness. `[ttl]`

**IND-16** Every individual carries both `:hasQID` and an `owl:sameAs` whose object is `http://www.wikidata.org/entity/` followed by that QID. The IRI of each individual is the namespace `http://devry.edu/school-names#` followed by the same QID. `[ttl]` This single fact governs three requirements later in this document: IND-33 on derived columns, IND-41 on default visibility, and IND-170 on the touchpoint already linked state.

---

## 4. The space discipline this document inherits

**IND-17** `specs/find/README.md` section 3.1 and section 3.2 are in force here without restatement. The requirements below add what those sections do not cover, and the budgets in IND-20 and IND-22 are their instantiation for these three panes.

**IND-18** One level of bordered container applies inside a pane body. A bordered container inside a bordered container is a defect however it is styled.

**IND-19** No header band may restate what the region visibly is. A band reading `Columns` above a list of columns, or `Statements` above a statement table, is forbidden. Where a count belongs to a region, it goes on that region's existing first line.

**IND-20** Vertical budget. Each band of the Individuals pane has a maximum height, measured at 100 per cent pane zoom with the default type scale:

| Band | Budget | Note |
| --- | ---: | --- |
| Pane identity and toolbar | 36 px | One band, not three. Carries the pane name, the filter, the chooser trigger, the class choice and the overflow |
| Status line | 24 px | Withdrawn below the shallow threshold |
| Column header | 28 px | |
| Data row | 30 px | |
| Footer and pager | 30 px | Rendered only when more than one page exists |
| **Total chrome** | **118 px** | Above and below the scrolling rows |

**IND-21** The Inspector's bands:

| Band | Budget | Note |
| --- | ---: | --- |
| Header with name, save state and overflow | 36 px | The only place in the pane that reports save state |
| Identity line | 26 px | Kind, class, local name and IRI, each stated once |
| Statement count line with Add row | 26 px | |
| Statement table header | 22 px | |
| Statement row, single valued | 34 px | |
| Statement row, each additional shown value | 31 px | |
| Usage line | 30 px | |

**IND-22** Horizontal measure. No region is sized by its container.

| Region | Cap | Note |
| --- | ---: | --- |
| Statement predicate column | 158 px | 118 px below the narrow threshold |
| Statement value stack | 560 px | A value field does not grow because the pane did |
| Identity line IRI | fills remaining width, truncating | The one region allowed to take leftover width, because truncation is its specified behaviour |
| Column chooser | 408 px | |
| A grid column | 56 px to 720 px | IND-54 |

**IND-23** Empty space beside or below a content sized region is correct. Stretching a region to fill it, centring it in the void, or inserting anything to occupy it are all defects.

**IND-24** No fact is stated twice in one view. A count that appears in the status line does not reappear in the footer; a query visible in the filter field is not echoed in a message below it.

---

## 5. The Individuals pane

### 5.1 Anatomy

**IND-25** The pane consists of, in order: one toolbar band carrying the pane identity, one status line, the scrolling grid, and a footer. `[new]`

**IND-26** The pane identity, the filter, the column chooser trigger, the class choice, the creation action and the overflow MUST occupy **one** band. The shipped build spends a tab strip, a toolbar and a count line on these, which is three bands and roughly 118 px before the column header. `[shot: 01]`

**IND-27** The status line reports the row count exactly once, in one of two forms:

- unfiltered: `{n} individuals` followed by `{k} of {m} columns shown`
- filtered: `{n} of {total} individuals match across {k} shown columns`

**IND-28** The footer is rendered only when the result spans more than one page. On a single page it is not rendered at all, because the status line has already reported how many rows there are and a footer reading `Rows 1 to 37` beside a status line reading `37 individuals` violates IND-24.

**IND-29** When rendered, the footer carries the visible range, first, previous, a page number field, the page total, next and last. The page number field is editable and clamps to the available range.

### 5.2 Scope

**IND-30** A class choice scopes the grid to the direct instances of one class, or to all classes.

**IND-31** Class choices MUST show their direct instance count and MUST be disabled when that count is zero. `[docs: menu-ux.md]` quotes: "Class choices in the report and Individuals filters also show counts and disable empty choices." On this ontology `owl:Thing` therefore appears as a disabled choice reading zero, and `:School` as an enabled choice reading 21,461. `[ttl]`

**IND-32** The same rule applies to the Hierarchy rail when it is used to scope the grid: a class with no direct instances is not a usable scope and MUST NOT behave as one.

---

## 6. The column model

### 6.1 Columns are derived, never declared

**IND-33** Every selectable column is one of:

1. a predicate observed on at least one individual in the loaded ontology, or
2. the **subject column**, which renders the individual's identity, or
3. a **derived column**, whose values are computed from other columns rather than read from the store.

Nothing else may become a column. A column set written into the implementation ahead of the data is a defect.

**IND-34** The subject column is always present and MUST NOT be hidden. It is the only such column.

**IND-35** Exactly two derived columns exist, and both MUST be declared as derived with their derivation stated in the chooser:

| Column | Derivation |
| --- | --- |
| `IRI` | the ontology namespace followed by the subject's local name, which on this ontology equals `:hasQID` |
| `rdfs:label` | the value the subject column already renders |

**IND-36** The shipped grid offers three columns: `Individual`, `Class` and `IRI`. `[shot: 01]` Under IND-33 and IND-35 that is one informative column and two that are not: `Class` carries one distinct value across every row (IND-12) and `IRI` is derived. The remaining eleven predicates are not reachable at all. This is the defect the whole of section 6 exists to correct.

### 6.2 Fill and distinct

**IND-37** For each column the implementation MUST compute two statistics over the rows currently in scope:

- **fill**: the number of rows carrying at least one value for that column
- **distinct**: the number of different values those rows carry, counting every value of a multi valued predicate

**IND-38** Both statistics MUST be shown in the chooser, as numbers, beside every column. A bar or any other graphic MAY accompany a number; it MUST NOT replace one.

**IND-39** The two statistics answer two different questions and neither substitutes for the other. Fill answers whether there is data. Distinct answers whether the column discriminates. A column with fill 21,461 and distinct 1 is full and useless; a column with fill 61 and distinct 13 is nearly empty and discriminating. Neither fact is legible from a column name, which is why both are shown.

**IND-40** A column MUST also carry its **maximum value depth**: the largest number of values any single row holds for it. This is what tells a reader that a column will need the overflow treatment of IND-64 before they turn it on.

### 6.3 Reason tags

**IND-41** Where a column's statistics or derivation explain why it is not useful, or not useful by default, the chooser MUST say so with a short tag beside the column. The tags, and the exact condition each one reports:

| Tag | Condition |
| --- | --- |
| `always shown` | the subject column |
| `shown as Individual` | the column is derived from what the subject column renders |
| `prefix plus :hasQID` | the column is derived from the namespace and the local name |
| `no values` | fill is zero |
| `one value` | distinct is one |
| `unique per row` | fill equals the row count **and** distinct equals the row count |
| `sparse` | fill is greater than zero and below five per cent of the row count |
| `identifiers` | more than ninety per cent of the column's values match the entity identifier shape of the ontology |
| `{n} values deep` | maximum value depth is greater than one |

**IND-42** `unique per row` requires both conditions. A column where every value differs but which is absent from a quarter of the rows is not an identifier: `:hasWebsite` has 16,117 distinct values over 16,286 filled rows and MUST NOT carry this tag. `[ttl]`

**IND-43** More than one tag MAY apply to one column. Tags that report a defect in the column's usefulness MUST be visually distinguished from tags that merely describe it, by more than colour.

### 6.4 Default visibility

**IND-44** Default visibility MUST be computed from the statistics of the loaded ontology. A hardcoded list of default columns is a defect, because it cannot be right for the next ontology.

**IND-45** The algorithm:

1. The subject column is on.
2. A column is **eligible** when all of: it is not the subject column; it is not derived; its fill is at least five per cent of the row count; its distinct is greater than one; and it is not `unique per row`.
3. Eligible columns are ordered by two keys: columns whose values are predominantly readable before columns whose values are predominantly identifiers, then by fill descending.
4. The first four of that order are on. Every other column is off.

**IND-46** Step 3 exists because a column of opaque entity identifiers is not a useful first impression even when it is the fullest column available. `:hasType` and `:hasCountry` are both filled above 95 per cent and both carry only `Q` numbers, so both rank behind `:establishedYear` and `rdfs:comment`. `[ttl]` They remain one click away and carry the `identifiers` tag that explains their ranking.

**IND-47** The algorithm MUST be re evaluated when the loaded ontology changes. Giving `rdf:type` a second distinct value makes it eligible with no user action and no code change, which is the test that the defaults are genuinely derived.

**IND-48** On `schools.ttl` the algorithm yields: `Individual`, `:establishedYear`, `rdfs:comment`, `:hasWebsite`, `:hasCoordinates`. Five columns of fifteen. `[proto]` An implementation that produces a different set from the same ontology has implemented a different algorithm and is a defect against IND-45.

### 6.5 The chooser

**IND-49** The chooser opens from a trigger in the toolbar band. The trigger MUST state the current ratio on its face, as `Columns {k} of {m}`, so the ratio is readable without opening anything.

**IND-50** The chooser lists every column in **display order**, not in a grouped or alphabetical order, so that the reorder controls in IND-59 operate on the order the reader can see.

**IND-51** Each row of the chooser carries, in this order: the visibility control, the column name, its reason tags, its fill, and its distinct.

**IND-52** The chooser carries a legend stating what the two numbers mean. One sentence, in the chooser footer, present at all times: `Fill is how many rows carry a value. Distinct is how many differ.`

**IND-53** The chooser carries `All`, `None` and `Reset`. `None` leaves the subject column on, because IND-34 forbids hiding it. `Reset` returns visibility, order and widths to the computed defaults, not to a remembered earlier state.

---

## 7. Column geometry

### 7.1 Resize

**IND-54** Column width is adjustable between **56** and **720** CSS pixels. A width outside that range MUST be clamped, not rejected.

**IND-55** The resize affordance is a separator between two column headers. It MUST be at least **8** CSS pixels wide, MUST show a column resize cursor, and MUST sit above the sort control in hit priority so that aiming at the divider never sorts the column.

**IND-56** Resizing MUST track the pointer continuously. A width that updates only on pointer release is a defect: the reader is sizing a column to its content and cannot see the content while the width is not moving.

**IND-57** Resizing MUST NOT re render the rows. Only the column geometry changes, so a resize across fifty columns and a hundred rows costs one layout, not a hundred row rebuilds.

### 7.2 Autofit

**IND-58** Double clicking a separator sets that column to the width of its widest rendered value on the current page, plus the cell padding, plus any overflow affordance the widest cell carries, bounded by IND-54. The header label is included in the measurement, so autofit never truncates the column's own name.

### 7.3 Order

**IND-59** Column order is user controlled by two routes, and both MUST exist:

1. dragging a column header onto another header, with an insertion indicator showing which side of the target the column will land on
2. a move earlier and move later control on each row of the chooser

**IND-60** Route 2 exists because route 1 is pointer only. An implementation that ships only the drag has made reordering unavailable from the keyboard.

**IND-61** The subject column MAY be pinned so that it remains visible while the remaining columns scroll horizontally. When pinned it MUST be separated from the scrolling columns by a rule stronger than an ordinary column rule. Horizontal scrolling of a wide grid is expected rather than avoided: `[docs: adaptive-pane-ux.md]` lists "deliberate horizontal scrolling" as the Individuals pane's narrow presentation.

### 7.4 Persistence

**IND-62** Column visibility, order and width are retained **per class scope**, so returning to a class restores the arrangement in which it was last read. `[docs: adaptive-pane-ux.md]` lists "Sort, filters, selection, values and virtualization" as the Individuals pane's retained state; this requirement extends that list and the extension is recorded in Appendix B.2.

**IND-63** A retained layout MUST survive closing and reopening the pane and MUST survive a workspace save. A retained layout naming a column the loaded ontology does not have MUST be ignored for that column and MUST NOT discard the rest of the layout.

---

## 8. Cell treatments

**IND-64** A cell holding more than one value shows the first value and a control reporting how many remain. Activating that control reveals every value of that cell. The cell MUST NOT concatenate values with a delimiter, MUST NOT grow the row height, and MUST NOT make the remaining values reachable only through a `title` attribute.

**IND-65** A delimiter is forbidden rather than discouraged. The first value containing the delimiter breaks the rendering, and the reader cannot tell a value containing a comma from two values.

**IND-66** A subject with no asserted `rdfs:label` renders its local name in the subject column, marked as an identifier rather than a name. 944 rows of this ontology are in that state, and without the marking they read as 944 schools named `Q100257877`. `[ttl]`

**IND-67** An empty cell renders empty. A dash, a zero, a `null`, an `N/A` or any other placeholder is a defect: absence and a recorded value are different facts and the grid is the surface where that difference is read.

**IND-68** A column whose values are numeric is aligned to the end of the cell and uses tabular figures, so that digits line up down the column.

**IND-69** A column whose values are identifiers, IRIs or coordinates is rendered in the monospace face, so that a transposed character is visible.

**IND-70** Every cell value truncates with an ellipsis at the column's current width. Truncation is why IND-54 and IND-58 exist: the reader's remedy for a truncated column is to widen it or autofit it, and both are one gesture away.

---

## 9. Grid behaviour

### 9.1 Filter

**IND-71** The filter matches across the columns that are currently shown, plus the subject's local name. It MUST NOT match a column the reader has hidden.

**IND-72** The status line MUST state that the match was made across the shown columns, and MUST state how many. Showing a column therefore widens the search, and the reader is told so rather than discovering it.

**IND-73** The zero match message MUST name the number of shown columns and MUST offer the remedy: showing more columns. A bare "no matches" on a grid whose search scope is user controlled repeats the Find pane's original defect.

**IND-74** On this ontology, searching `higher education institution` with `rdfs:comment` hidden matches nothing, and matches 32 rows of the loaded extract with it shown. `[proto]` That gap is the entire argument for IND-72.

### 9.2 Sort

**IND-75** Any column may be sorted. Sorting is a single control on the column header, separate from the resize separator of IND-55.

**IND-76** Rows with no value for the sorted column sort **last in both directions**. An ascending sort that opens with 944 blank rows has hidden the data rather than ordered it. `[ttl]`

**IND-77** Ties are broken by the subject's local name, so that a sort is stable across repeated renders and across a commit and read back.

**IND-78** A numeric column sorts numerically, not lexically. `1961` sorts before `1981` and `999` sorts before both.

### 9.3 Paging

**IND-79** A page contains at most **100** records. `[docs: menu-ux.md]` quotes: "Each page contains at most 100 records, with filtering and Previous/Next controls." An implementation offering a larger page size contradicts that sentence and is a defect; the prototype's 250 option is recorded in Appendix B.1.

**IND-80** `[docs: adaptive-pane-ux.md]` names **virtualization** as the Individuals pane's retained state. At 21,461 rows paging is the fallback, not the design. An implementation MUST virtualize the row region and MUST retain the virtualization position across the pane's retained state, and the pager in IND-29 exists for the report form described in `docs/menu-ux.md`, not as a substitute for virtualization.

### 9.4 Selection

**IND-81** Exactly one row is selected at a time. Selecting a row populates the Inspector with that subject.

**IND-82** Selection MUST NOT scroll the grid, MUST NOT re render the rows, and MUST NOT change any column geometry. `[docs: issue-36-validation.md]` records the measured requirement that selecting a row leaves table top and width unchanged.

**IND-83** Selection moves with the arrow keys, jumps to the first and last row of the page with Home and End, and crosses a page boundary with Page Up and Page Down, landing on a row rather than on nothing.
---

## 10. The Inspector

### 10.1 What is wrong with the shipped Inspector

**IND-84** The shipped Inspector is a class shaped form applied to an individual. `[shot: 01]` Four of its regions are defects, and each has a requirement below that corrects it:

| Region in the capture | Defect | Corrected by |
| --- | --- | --- |
| `Usage` reporting `Subclasses 0`, `Descendants 0`, `Direct instances 0` | Three facts that are structurally zero for every individual and can never be anything else | IND-86 |
| `More properties`, collapsed | Nine of the subject's twelve statements are behind it | IND-95 |
| `Statements: 12 statements describe this entity` plus `Open source editor` | A count is shown where the content belongs, and the reader is sent to a different surface to read it | IND-94 |
| `Types` with `Add` and `Remove` against the opposite edge of the pane | The controls are roughly a thousand pixels from the field they operate on | IND-91 |

### 10.2 Kind awareness and the usage gate

**IND-85** The Inspector renders only facts that can be non trivial for the subject's kind. This is the gate `specs/quality/README.md` QLY-66 to QLY-74 established for vocabulary checks, applied here to usage facts.

**IND-86** A usage fact that is **structurally impossible** for the subject's kind MUST be withdrawn: not listed, not labelled, and not shown as zero. An individual has no subclasses, no descendants and no direct instances, so those three rows do not exist on an individual.

**IND-87** A usage fact that is **possible but currently zero** MUST be shown as zero. A class with no subclasses shows `Subclasses 0`, because the number can change and the zero is information.

**IND-88** The distinction is the whole requirement. A withdrawn fact is one the kind cannot have; a zero is one the kind can have and does not. Rendering the first as the second is what produced the three dead rows in the capture.

**IND-89** Usage facts by kind:

| Kind | Rendered | Withdrawn |
| --- | --- | --- |
| Individual | referenced by, inferred axioms, revision | subclasses, descendants, direct instances |
| Class | subclasses, descendants, direct instances, referenced by, inferred axioms, revision | none |
| Property | sub properties, referenced by, inferred axioms, revision | descendants, direct instances |

**IND-90** `referenced by` counts statements elsewhere in the ontology whose object is this subject. It MUST NOT count the subject's own statements, and it MUST NOT count the subject as referencing itself.

### 10.3 Type membership

**IND-91** `rdf:type` is a predicate like any other and is edited in the statement table. The Inspector MUST NOT carry a separate Types widget.

**IND-92** This removes the stranded `Add` and `Remove` of IND-84 by removing the control they belonged to rather than by moving it. The statement table already adds and removes values of a predicate, including `rdf:type`, and an individual with two types is `rdf:type` with two values, which is the grouped predicate treatment `specs/find/README.md` section 10.5 already specifies.

**IND-93** The value of `rdf:type` MUST be a link to the class, so that the one navigation the Types widget provided survives its removal.

### 10.4 The statement table

**IND-94** The Inspector renders the subject's statements. It MUST NOT report a count of statements in place of the statements, and it MUST NOT offer a control that opens a different surface in order to read them.

**IND-95** Every asserted statement is reachable without opening a disclosure. A disclosure hiding the majority of a subject's statements is a defect; on the captured subject it hid nine of twelve. `[shot: 01]`

**IND-96** The table is the Predicate and Value table of the Details view. `[shot: 02]` Predicate once per statement, values stacked beneath it, the grouped treatment of `specs/find/README.md` section 10.5 for multiple values, `Add value` inside the group and `Add row` below the table.

**IND-97** At most three values of a predicate are shown before the remainder collapse behind a control reporting how many are hidden. The count beside a predicate appears only while values are hidden, because with all of them visible it restates what is on screen.

**IND-98** A statement count line sits above the table, reporting asserted and inferred separately: `{n} asserted` and, when any exist, `{m} inferred`. A single combined number is ambiguous the moment inferred rows are rendered.

**IND-99** `Add row` sits on the statement count line rather than below the table, so the line carries a fact and an action instead of a fact alone.

**IND-100** `Add row` MUST NOT overwrite an existing predicate. When the predicate it would open already has values, it appends an empty value to that predicate instead.

### 10.5 Asserted and inferred

**IND-101** An inferred statement is rendered with the asserted ones, marked as inferred, and is not editable in place.

**IND-102** The mark MUST NOT be colour alone. A word, a shape or a border carries it, with colour as reinforcement.

**IND-103** An individual of a class whose ancestor is `owl:Thing` has at least the inferred statement `rdf:type owl:Thing`. An implementation that reasons further renders what it derives; one that does not MUST NOT claim an inferred count larger than what it rendered.

**IND-104** Inferred statements MAY be hidden by a setting. The usage line's inferred count MUST continue to report them when they are hidden, because the axiom exists whether or not it is displayed.

### 10.6 Identity

**IND-105** One identity line carries the kind, the class, the local name and the IRI, each stated exactly once.

**IND-106** The shipped Inspector states the identifier in a `Name` field, the IRI behind a `Full identifier (IRI)` disclosure, and the type in a `Types` select, which is three bands for facts that fit on one. `[shot: 01]`

**IND-107** The IRI truncates. It is the one region permitted to take the remaining width of its line, because truncation is its specified behaviour rather than an accident of layout.

**IND-108** Rename edits the subject's label. It is reached from the pane overflow, replaces the name in place with a field, commits on Enter and on blur, and abandons on Escape. A rename produces a draft; it does not write to the ontology.

### 10.7 Draft and apply

**IND-109** Typing in the Inspector does not update the ontology. Every edit accumulates into a draft for that subject.

**IND-110** A draft is held **per subject**. Selecting another individual and returning MUST restore the draft. Discarding a draft silently on selection change is a defect, because the reader was given no notice that work would be lost.

**IND-111** The grid always renders the ontology, never a draft. An unapplied draft has not changed the ontology and the grid is the view of the ontology.

**IND-112** The Inspector renders the draft where one exists, and the header reports that it is doing so.

**IND-113** The pane reports save state in exactly one place. No draft means the word alone and no actions. A draft brings its two actions with it, and they disappear with it.

**IND-114** Applying a draft MUST follow the concurrent edit contract of `[docs: entity-editing.md]`: the loaded statements, the draft and the current ontology are compared, and the merge happens in the same operation that updates the entity, with no gap between checking the version and applying the change. The eight outcomes in that document's table are its specification and are not restated here.

**IND-115** A save MUST retain typing that occurs while the request is in flight, rebasing those keystrokes onto the saved result. `[docs: entity-editing.md]`

**IND-116** An apply is one Undo operation.

**IND-117** A refusal to apply MUST name the affected predicate and MUST leave the draft available. A silent refusal is a defect.

**IND-118** `[docs: adaptive-pane-ux.md]` states that "Inspector submits its existing form through an associated Apply button in the fixed footer." This document places the save state and its actions in the pane header instead, and the divergence is recorded in Appendix B.2 with its reason: the header slot already reports `Saved`, so a footer Apply gives the pane two save status regions, and IND-24 forbids stating one fact twice. An implementation MAY keep the footer; it MUST NOT keep both.

---

## 11. Find Touchpoints as a detached action

### 11.1 What this section corrects

**IND-119** The prototype implements a feature that computes entities sharing a predicate value with the subject. That is not Find Touchpoints. `[docs: touchpoints.md]` owns the feature, and the whole of section 11 is written from that document. The prototype is recorded in Appendix B.1 as a defect against every requirement below.

**IND-120** Find Touchpoints links an entity to external resources, by searching English Wikipedia and writing mapping statements against DBpedia, Wikidata or Wikipedia. `[docs: touchpoints.md]`

### 11.2 Invocation and pane identity

**IND-121** Touchpoints is invoked as an explicit action against one named subject. It MUST NOT be a tab, a mode, a sub tab or a section inside the Inspector.

**IND-122** The documented entry points are `Find > Touchpoints` in the taxonomy and graph entity menus, a `Find Touchpoints` button on the graph and the Inspector, and `View > Touchpoints` which opens the pane directly. `[docs: touchpoints.md]` A button that launches the action does not make the pane part of the Inspector, and IND-121 forbids only the latter.

**IND-123** The capture shows the feature twice: as a sub tab inside the Inspector, beside `Details`, and as a top level tab named `Find Touchpoints_2`. `[shot: 01]` Both are defects. The sub tab violates IND-121 and the suffix violates IND-124.

**IND-124** A touchpoints pane is titled by the subject it was run against. Two subjects give two panes with two different titles, so a numeric disambiguating suffix is never needed and MUST NOT be generated. A title reading `Find Touchpoints_2` is a defect in the pane's identity, not in its presentation.

**IND-125** Running the action again on a subject that already has a pane focuses that pane rather than opening a second one.

**IND-126** A pane is **pinned** to the subject it was run against. Changing the selection in the grid, the Hierarchy or the graph MUST NOT retarget an open touchpoints pane. `[docs: adaptive-pane-ux.md]` quotes: "Touchpoints shows the entity and query associated with its displayed candidates."

**IND-127** The pane states, at all times, the subject it is pinned to and the query that produced the candidates on screen.

**IND-128** Blank nodes have the action disabled rather than absent. `[docs: menu-ux.md]` records disabled Synonyms and Touchpoints actions for blank nodes.

### 11.3 Search

**IND-129** The query is initialised from the subject's preferred label and remains editable. `[docs: touchpoints.md]`

**IND-130** Typing MUST NOT send a request. The search is sent on Enter or on the `Search` control, and only then. `[docs: touchpoints.md]`

**IND-131** A search returns at most twenty English Wikipedia candidates. `[docs: touchpoints.md]`

**IND-132** When the local MPNet model is available, the returned candidates are reranked using the entity's label, parents and description. Without the model, Wikipedia's own ranking is retained. The search invokes neither Claude nor Codex. `[docs: touchpoints.md]`

**IND-133** The pane MUST NOT present the reranked and the unranked orders as the same thing. When the model is unavailable the pane says so, because the order the reader is reading is then Wikipedia's rather than Axiom's.

### 11.4 Candidates

**IND-134** Each candidate row shows its title, its short description and its target IRI. `[docs: touchpoints.md]`

**IND-135** `Open Wikipedia page` opens the article in the default browser. `[docs: touchpoints.md]`

**IND-136** A disambiguation page MUST NOT be selectable. `[docs: touchpoints.md]`

**IND-137** A candidate already linked through its Wikipedia, DBpedia or Wikidata identity is marked `Linked`. `[docs: touchpoints.md]`

### 11.5 Relationship and target

**IND-138** Every selected candidate carries a relationship and a target, both reviewable before applying. `[docs: touchpoints.md]`

**IND-139** The relationship defaults are:

| Condition | Default relationship |
| --- | --- |
| A matching label, alias or redirect | `skos:exactMatch` |
| Any other candidate | `skos:closeMatch` |

`[docs: touchpoints.md]`

**IND-140** The available relationships are `skos:exactMatch`, `skos:closeMatch`, `skos:broadMatch`, `skos:narrowMatch`, `skos:relatedMatch` and `rdfs:seeAlso`. **Individuals additionally offer `owl:sameAs`.** `[docs: touchpoints.md]`

**IND-141** IND-140 is the one place in this document where the subject's kind changes the touchpoints pane. On an ontology of 21,461 individuals, `owl:sameAs` is the relationship most of this pane's work will use.

**IND-142** The target defaults to DBpedia. Wikidata is available when Wikipedia reports an item ID. Wikipedia is available and becomes the default target for `rdfs:seeAlso`. `[docs: touchpoints.md]`

**IND-143** Every touchpoint is a resource statement. Text synonyms are a separate action and MUST NOT be produced here. `[docs: touchpoints.md]`

### 11.6 Apply

**IND-144** `Apply selected touchpoints` adds the reviewed statements as **one** Undo operation. `[docs: touchpoints.md]`

**IND-145** Validation rejects the **whole batch** if any selected statement is unavailable or invalid. A partial application is a defect. `[docs: touchpoints.md]`

**IND-146** If the ontology changes after a search, the reader must search again before applying. The pane MUST make that state visible rather than failing at apply time. `[docs: touchpoints.md]`

### 11.7 Saved results

**IND-147** Results are stored under `~/.axiom/wikipedia` and have **no automatic expiry**. A search reuses a valid saved entry regardless of its age, including after a restart. `[docs: touchpoints.md]`

**IND-148** The pane displays when the result on screen was fetched. Without that, a saved result of unknown age is indistinguishable from a fresh one.

**IND-149** `Refresh` explicitly requests new results. A failed refresh retains the saved rows and shows the error. `[docs: touchpoints.md]`

**IND-150** The cache keying, the request queue, the User-Agent, the gzip request, the HTTP 429 handling with its five second initial wait and doubling, and the fifteen second timeout are specified by `[docs: touchpoints.md]` and are not restated here.

### 11.8 This ontology

**IND-151** Every individual of `schools.ttl` already carries `owl:sameAs http://www.wikidata.org/entity/{QID}` and the matching `:hasQID`. `[ttl]`

**IND-152** Under IND-137, a Wikipedia candidate resolving to that Wikidata item is therefore already linked, and the pane marks it `Linked` rather than offering it. On this ontology Find Touchpoints is close to a no operation, and the pane MUST make that legible rather than presenting twenty candidates that cannot be applied.

**IND-153** This is the useful case for a bulk reading of the already linked state: a pane that can say "this subject is already linked" without twenty rows of rejected candidates is worth more here than one that cannot.

---

## 12. Presentation

**IND-154** Presentation adapts to the pane's own measured rectangle, expressed as container queries against that rectangle. A viewport media query in a docked pane is a defect: the pane is not the window.

**IND-155** The thresholds, their hysteresis and the recovery state are owned by `[docs: adaptive-pane-ux.md]`: 600 CSS pixels of width and 400 of height, exits at 616 and 416, recovery below 240 wide. No threshold is invented here and no presentation is given a new name.

**IND-156** The Individuals pane by presentation. `[docs: adaptive-pane-ux.md]` publishes the first column of this table; the remaining detail is this document's instantiation of it:

| Presentation | Published | Instantiation |
| --- | --- | --- |
| Expanded | Grid and filters | Full toolbar band, status line, grid, footer |
| Narrow | Compact filters; column access and deliberate horizontal scrolling | Class choice and creation action fold into the overflow; the filter and the chooser trigger stay, because they are what this pane is for; the grid scrolls horizontally rather than dropping columns |
| Shallow | Compact actions/filters; maximum row area | The status line withdraws; the toolbar and the pager stay, because both are how the reader moves |
| Recovery | not published for this pane | The pane states what it is and renders nothing else |

**IND-157** Narrow MUST NOT drop columns. The published behaviour is horizontal scrolling, and a reader who has chosen five columns has made a decision the pane must not quietly reverse.

**IND-158** Shallow withdraws the status line and not the footer. The footer reports position, which is what a reader of a short pane needs; the status line reports a total, which the reader can get back by growing the pane.

**IND-159** The Inspector by presentation:

| Presentation | Published | Instantiation |
| --- | --- | --- |
| Expanded | Fields, relationships and usage | Header, identity line, statement count, statement table, usage line |
| Narrow | Name, label, common edits; secondary disclosures | Predicate column narrows to 118 px; the identity line's IRI withdraws; the statement table remains whole |
| Shallow | Editable identity beside the active details section | The usage line withdraws; the statement table remains, because it is the content |
| Recovery | not published for this pane | The pane states what it is |

**IND-160** The Narrow row of IND-159 diverges from the published "secondary disclosures", because IND-95 forbids hiding the majority of a subject's statements behind one. The divergence and its reason are recorded in Appendix B.2.

**IND-161** Shallow MUST NOT withdraw the save state. A draft that exists while its text is hidden is the one state where hiding a region could hide the fact that unapplied work exists, and IND-113 places the save state in the header precisely so that withdrawing anything below it stays safe.

---

## 13. Keyboard model

**IND-162** Every control specified in this document is reachable from the keyboard, carries a visible focus state, and carries an accessible name that names its object rather than only its verb.

**IND-163** Bindings:

| Surface | Key | Action |
| --- | --- | --- |
| Grid | Up, Down | Move the selection one row |
| Grid | Home, End | First, last row of the page |
| Grid | Page Up, Page Down | Previous, next page, landing on a row |
| Resize separator | Left, Right | Narrow, widen by 8 px |
| Resize separator | Shift with Left, Right | Narrow, widen by 32 px |
| Resize separator | Enter, Space | Autofit |
| Resize separator | Home | Restore the column's default width |
| Column header | Enter, Space | Sort, toggling direction on repeat |
| Chooser | Escape | Close and return focus to the trigger |
| Inspector | Escape | Discard the draft |
| Any popover or menu | Escape | Close and return focus to the opener |

**IND-164** A resize separator MUST expose its current width as a value, with its minimum and maximum, and MUST announce the new width after a keyboard adjustment. A control that can be operated but not read is not accessible.

**IND-165** A control revealed on hover MUST also be revealed on keyboard focus, and MUST stand permanently where the pointer is coarse.

---

## 14. Accessibility

**IND-166** Body text meets a contrast ratio of at least 4.5 to 1 against its background. Icons and essential graphics meet at least 3 to 1. Light and dark are audited independently; neither is inferred from the other.

**IND-167** No status, state or category is carried by colour alone. A reason tag carries its word, an inferred statement carries its word, a label free subject carries its mark.

**IND-168** A statistic rendered as a bar MUST be accompanied by its number, which is both an accessibility requirement and IND-38.

**IND-169** The grid is announced as a grid, its rows as rows and its cells as cells, with the selected row carrying its selected state.

**IND-170** A change that is not visible where focus is MUST be announced: a sort applied, a column shown or hidden, a width changed, a draft applied or discarded, a touchpoints pane opened.

**IND-171** The layout survives system font scaling and honours a reduced motion preference without losing a state or breaking a region.

---

## 15. Copy catalogue

**IND-172** User visible strings are drawn from this catalogue. A string that appears in an implementation and not here is a defect; copy invented at the keyboard is how two surfaces end up saying the same thing differently.

| ID | String |
| --- | --- |
| `grid.title` | `Individuals` |
| `grid.filter.placeholder` | `Filter individuals` |
| `grid.filter.clear` | `Clear the filter` |
| `grid.columns.trigger` | `Columns {shown} of {total}` |
| `grid.class.label` | `Class` |
| `grid.class.all` | `All classes` |
| `grid.new` | `New individual` |
| `grid.status.plain` | `{n} individuals` |
| `grid.status.columns` | `{shown} of {total} columns shown` |
| `grid.status.filtered` | `{n} of {total} {class} individuals match across {k} shown columns` |
| `grid.foot.range` | `Rows {from} to {to}` |
| `grid.foot.page` | `Page` |
| `grid.foot.of` | `of {n}` |
| `grid.empty.filtered` | `No individual matches "{q}" in the {k} shown columns. Show more columns to widen the search.` |
| `grid.empty.class` | `This class holds no individuals.` |
| `grid.cell.identifier` | `id` |
| `grid.cell.more` | `+{n}` |
| `grid.menu.perpage` | `{n} rows a page` |
| `grid.menu.export` | `Export shown columns as CSV` |
| `grid.menu.resetcols` | `Reset column layout` |
| `cols.title` | `Columns` |
| `cols.count` | `{shown} of {total} shown` |
| `cols.all` | `All` |
| `cols.none` | `None` |
| `cols.reset` | `Reset` |
| `cols.legend` | `Fill is how many rows carry a value. Distinct is how many differ.` |
| `cols.why.locked` | `always shown` |
| `cols.why.inSubject` | `shown as Individual` |
| `cols.why.derivedIri` | `prefix plus :hasQID` |
| `cols.why.empty` | `no values` |
| `cols.why.single` | `one value` |
| `cols.why.unique` | `unique per row` |
| `cols.why.sparse` | `sparse` |
| `cols.why.codes` | `identifiers` |
| `cols.why.deep` | `{n} values deep` |
| `cols.move.earlier` | `Move {column} earlier` |
| `cols.move.later` | `Move {column} later` |
| `cols.resize.name` | `Width of {column}` |
| `cols.resize.said` | `{column} is {n} pixels wide` |
| `insp.title` | `Inspector` |
| `insp.empty` | `Select an individual to inspect it.` |
| `insp.kind.individual` | `Individual` |
| `insp.kind.class` | `Class` |
| `insp.count.asserted` | `{n} asserted` |
| `insp.count.inferred` | `{n} inferred` |
| `insp.addrow` | `Add row` |
| `insp.addvalue` | `Add value` |
| `insp.more` | `{n} more` |
| `insp.fewer` | `Show fewer` |
| `insp.inferred.tag` | `inferred` |
| `insp.usage.referenced` | `Referenced by` |
| `insp.usage.inferred` | `Inferred axioms` |
| `insp.usage.subclasses` | `Subclasses` |
| `insp.usage.descendants` | `Descendants` |
| `insp.usage.instances` | `Direct instances` |
| `insp.usage.revision` | `Revision` |
| `insp.state.saved` | `Saved` |
| `insp.state.draft` | `Draft` |
| `insp.action.discard` | `Discard` |
| `insp.action.apply` | `Apply changes` |
| `insp.menu.rename` | `Rename` |
| `insp.menu.touchpoints` | `Find touchpoints` |
| `insp.menu.copyiri` | `Copy IRI` |
| `tp.title` | `Touchpoints` |
| `tp.pane.title` | `Touchpoints · {subject}` |
| `tp.pinned` | `pinned to this subject` |
| `tp.query.label` | `Query` |
| `tp.search` | `Search` |
| `tp.open` | `Open Wikipedia page` |
| `tp.linked` | `Linked` |
| `tp.apply` | `Apply selected touchpoints` |
| `tp.refresh` | `Refresh` |
| `tp.fetched` | `Fetched {when}` |
| `tp.stale` | `The ontology changed. Search again before applying.` |
| `tp.nomodel` | `Ranked by Wikipedia. The local model is unavailable.` |
| `tp.relationship` | `Relationship` |
| `tp.target` | `Target` |
| `tp.empty` | `No candidate was returned for this query.` |
| `tp.alllinked` | `Every candidate is already linked.` |

**IND-173** `tp.pane.title` is the requirement that makes `Find Touchpoints_2` impossible: the title is a function of the subject, so two panes differ without a counter.

---

## 16. Constants

**IND-174** Every number in the normative body appears here. A number that appears only in prose is a defect in this document.

| Constant | Value | Requirement |
| --- | ---: | --- |
| Minimum column width | 56 px | IND-54 |
| Maximum column width | 720 px | IND-54 |
| Resize separator hit width | 8 px | IND-55 |
| Keyboard resize step | 8 px | IND-163 |
| Keyboard resize step with Shift | 32 px | IND-163 |
| Toolbar band height | 36 px | IND-20 |
| Status line height | 24 px | IND-20 |
| Column header height | 28 px | IND-20 |
| Data row height | 30 px | IND-20 |
| Footer height | 30 px | IND-20 |
| Individuals pane chrome total | 118 px | IND-20 |
| Inspector predicate column, expanded | 158 px | IND-22 |
| Inspector predicate column, narrow | 118 px | IND-22, IND-159 |
| Inspector value stack cap | 560 px | IND-22 |
| Column chooser width | 408 px | IND-22 |
| Values shown before collapse | 3 | IND-97 |
| Default visible columns beyond the subject | 4 | IND-45 |
| Sparse threshold | 5 per cent | IND-41, IND-45 |
| Identifier share threshold | 90 per cent | IND-41 |
| Records per page, maximum | 100 | IND-79 |
| Touchpoint candidates, maximum | 20 | IND-131 |
| Width threshold | 600 px | IND-155 |
| Width exit threshold | 616 px | IND-155 |
| Height threshold | 400 px | IND-155 |
| Height exit threshold | 416 px | IND-155 |
| Recovery width | 240 px | IND-155 |
| Body text contrast | 4.5 to 1 | IND-166 |
| Graphic contrast | 3 to 1 | IND-166 |

---

## 17. Registration

**IND-175** This document owns `IND`. Verified free at the time of writing against `DEF`, `EXT` and `FND` in `docs/`, and against `EXT`, `FND`, `QLY` and `SUG` in the spec folders.

**IND-176** Two coverage tables need a row that this document cannot add, because both files are existing content this task had no authority to edit:

- `docs/adaptive-pane-ux.md` has rows for Individuals and Inspector but none for Touchpoints, although `docs/touchpoints.md` describes a dockable pane opened by `View > Touchpoints`. The missing row, using the published vocabulary, is: **Touchpoints** | Query row, candidate list with relationship and target | Compact query row; relationship and target fold into the row | Query and candidates only | Subject, query, candidates, selection and fetch time.
- Neither Find nor Ontology Quality has a row either. That gap predates this document and is recorded in the Find and Quality specs.

---

## Appendix A. Native stack mapping (non normative)

**A.1** The prototype is a single self contained HTML file with no dependencies and no build step. It exists to be read, not shipped.

**A.2** Tokens are CSS custom properties on `:root`, with light and dark authored as independent blocks rather than one inverted into the other, selected by a `data-theme` attribute taking `auto`, `light` or `dark`.

**A.3** Presentation uses `container-type: size` on the pane element with `container-name: pane`, and `@container pane (...)` queries. In Axiom the container is `AdaptivePane.tsx`'s measured rectangle.

**A.4** The grid is a table with `table-layout: fixed` and a `colgroup` whose widths are the column model's widths, a sticky header row, and a sticky first column. Resize writes one `col` width and the table width, which is why IND-57 costs one layout.

**A.5** Autofit measures text with a canvas 2D context rather than by inserting and measuring elements, so IND-58 does not reflow the document.

**A.6** The layout primitives block at the top of the stylesheet is structural only and is kept first so that product CSS always wins.

---

## Appendix B.1. Divergences in individuals.html

The prototype is the defect in every row.

| # | Requirement | Divergence | Blocking |
| ---: | --- | --- | :-: |
| 1 | IND-119 to IND-153 | The touchpoints pane computes entities sharing a predicate value with the subject. The documented feature searches English Wikipedia and writes mapping statements against DBpedia, Wikidata or Wikipedia. The implemented feature is not the specified one. | yes |
| 2 | IND-114, IND-115 | Apply overwrites the subject's statements with the draft. The documented merge contract compares loaded statements, draft and current ontology in the operation that writes, and rebases typing that happened during the save. | yes |
| 3 | IND-79 | The overflow offers 250 rows a page, above the documented maximum of 100. | no |
| 4 | IND-31, IND-32 | The class choice and the Hierarchy rail offer `Thing` with a count of zero as a selectable scope. Empty choices must be disabled. | no |
| 5 | IND-80 | Rows are paged, not virtualized. Virtualization is named as this pane's retained state. | no |
| 6 | IND-118 | The save actions sit in the pane header. The published policy puts Apply in a fixed footer. Recorded in B.2 row 1 as a deliberate supersession; listed here so an implementer does not read the header placement as accidental. | no |
| 7 | IND-160 | `More properties` is deleted outright. The published narrow presentation retains secondary disclosures. Recorded in B.2 row 2. | no |
| 8 | IND-89 | Only the individual row of the usage table is implemented. The class and property rows have never run, because the ontology has one populated class and no properties. | no |
| 9 | IND-103 | The inferred set is a fixed single axiom rather than a derivation. | no |
| 10 | IND-133 | The pane has no model availability state, because it does not call a model. | no |

## Appendix B.2. Superseded documentation

| # | Superseded sentence | Source | Superseding authority | Reason |
| ---: | --- | --- | --- | --- |
| 1 | "Inspector submits its existing form through an associated Apply button in the fixed footer." | `docs/adaptive-pane-ux.md` | IND-118, on the instruction that the default Inspector view is awful | The header slot already reports `Saved`. A footer Apply gives the pane two save status regions, which IND-24 forbids. |
| 2 | "Name, label, common edits; secondary disclosures" as the Inspector's narrow presentation | `docs/adaptive-pane-ux.md` | IND-160, through IND-95 | The disclosure in the shipped build hides nine of twelve statements. Narrowing the predicate column achieves the same saving without hiding content. |
| 3 | "Sort, filters, selection, values and virtualization" as the Individuals pane's retained state | `docs/adaptive-pane-ux.md` | IND-62 | Extended rather than contradicted: column visibility, order and width join that list. |

**B.2 note.** Rows 1 and 2 are the two places this document overrules a published sentence, and both are consequences of one instruction about the Inspector. Row 3 adds to a list rather than replacing anything. No other sentence in any repository document is overruled here.

## Appendix C. What was not read

**C.1** The Axiom source was not read. Every claim about shipped behaviour comes from a repository document or a capture.

**C.2** `docs/verification.md` was not read. At its size it may already record measured behaviour for these panes that would settle IND-80, IND-89 or IND-103.

**C.3** `docs/issues56-validation.md` was read only for the sentence about `specs/` being ignored and the column width rows. Its remaining content may bear on the grid.

**C.4** No test file was read. `tests/domain/entity-merge.test.ts` and `tests/domain/editor-drafts.test.ts` are named by `docs/entity-editing.md` as the coverage for IND-114 and IND-115 and would confirm the merge outcomes this document defers to rather than restates.

**C.5** No surface specified in this document has ever run in Axiom, so no capture of a correct implementation exists and none could be taken. The visual reference beside this file carries that load.
