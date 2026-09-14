# Axiom — Individuals Table

**Purpose:** This document specifies the individuals table — the Surface on which the ABox is browsed, filtered, sorted, edited cell-by-cell and sent to the graph — including its column model, virtualisation arithmetic, filter and sort semantics, in-cell editing and validation, verbatim copy, and its performance obligations at one hundred thousand rows.

**Status:** Normative

**Requirement ID prefixes owned:** `TBL`

---

## Purpose and scale

The individuals table is where the ABox is legible. The TBox is small — a few hundred classes and properties — and the tree in [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) handles it comfortably. The ABox is not: the fixture generates 12,000 Individuals at boot and the dataset command can take it to 100,000 `[src: init()]` `[src: #scaleMenu]`. At that scale a control that materialises one row per record is not a slow option; it is not an option at all. Every design decision in this document follows from that single fact.

**TBL-1** The table MUST render the generated Individual records of the `demo:` ABox. It MUST NOT render Store Entities, and it MUST NOT render generated customers, which are reachable only through the graph or an Individual's inspector `[src: applyFilters()]` `[src: store]`.

**TBL-2** The table MUST be virtualised. Rendering cost MUST be a function of the visible area, not of the row count, and MUST NOT grow when the dataset grows `[src: renderTableRows()]`.

**TBL-3** The table MUST support browsing *and* editing. Editing MUST be in-cell, on the row the user is already looking at, and MUST NOT require a modal form `[src: beginCellEdit()]`.

**TBL-4** The table MUST always state both figures the user needs: how many rows the current filter matched, and how many Individuals exist in the Store `[src: applyFilters()]` `[src: #tblCount]` `[src: #indCount]`.

**TBL-5** The table MUST be one of the two pages of the bottom dock, sharing a tab strip with the SPARQL console specified in [`32-sparql-console.md`](32-sparql-console.md), and MUST be the default page at boot `[src: #tabIndividuals]`.

**TBL-6** The dock tab MUST carry a live badge showing the total Individual record count, formatted with `en-GB` grouping separators `[src: applyFilters()]` `[src: #indCount]`.

**TBL-7** Becoming visible after the dock tab is switched MUST trigger a re-render of the visible window, because the viewport's measured height is meaningless while the page is hidden `[src: wire()]`.

**TBL-8** A change to the host window size MUST trigger a re-render of the visible window, because the visible-row count is derived from the viewport height `[src: wire()]`.

### Table state

**TBL-9** The table MUST hold exactly this state, and nothing else `[src: TBL]`:

| Field | Type | Initial value | Meaning |
|---|---|---|---|
| `rows` | Ordered list of Individual records | Empty | The filtered, sorted result set — the only thing the table renders |
| `sort` | Column identifier | `iri` | The active sort column |
| `dir` | `+1` or `−1` | `+1` | Ascending or descending |
| `type` | Class IRI, or empty | Empty | The type facet |
| `branch` | Branch name, or empty | Empty | The branch facet |
| `q` | String | Empty | The free-text predicate |
| `editing` | Editor descriptor, or none | None | The single active cell editor |

**TBL-10** `rows` MUST hold references to the Store's own records, never copies. An in-cell edit mutates the record, and the table MUST see that mutation without a synchronisation step `[src: applyFilters()]` `[src: commitCell()]`.

**TBL-11** Scroll offset MUST NOT be part of table state. It belongs to the scrolling viewport and is read at render time `[src: renderTableRows()]`.

---

## Column model

**TBL-12** The table MUST have exactly eight columns, in this order, with exactly these properties `[src: COLS]`:

| # | Identifier | Header text | Width specification | Value accessor | Sort key | Alignment | Monospace | Editable |
|---|---|---|---|---|---|---|---|---|
| 1 | `iri` | `Individual` | `minmax(170px, 1.1fr)` — minimum 170 px, grows at weight 1.1 | The local name of the record's IRI, for example `Pizza_000042` | The record's generation index (integer) | Leading | No | No |
| 2 | `type` | `Type` | `minmax(130px, 0.9fr)` — minimum 130 px, grows at weight 0.9 | The record's type local name, humanised | The record's type local name (raw, un-humanised) | Leading | No | No |
| 3 | `ref` | `Order ref` | `108px` fixed | The record's order reference, for example `AX-100042` | The order reference | Leading | **Yes** | No |
| 4 | `branch` | `Branch` | `124px` fixed | The record's branch name | The branch name | Leading | No | **Yes — single-select** |
| 5 | `price` | `Price` | `92px` fixed | Pound sign then the price to exactly two decimal places, for example `£12.50` | The price as a number | **Trailing** | **Yes** (implied by numeric alignment) | **Yes — text, decimal input mode** |
| 6 | `rating` | `Rating` | `84px` fixed | The rating integer, then ` / 5`, for example `4 / 5` | The rating as a number | **Trailing** | **Yes** (implied by numeric alignment) | **Yes — text, decimal input mode** |
| 7 | `ts` | `Prepared` | `148px` fixed | `en-GB` date-time: two-digit day, short month, two-digit hour and minute, for example `04 Aug, 09:31` | The timestamp in epoch milliseconds | Leading | No | No |
| 8 | `cust` | `Customer` | `minmax(140px, 0.9fr)` — minimum 140 px, grows at weight 0.9 | The customer's person name, or an em dash when the customer does not resolve | The customer's person name, or the empty string when it does not resolve | Leading | No | No |

**TBL-13** Column widths MUST be applied as a single track specification shared by the header row and every body row, so that headers and cells cannot drift apart `[src: tableTemplate()]`.

**TBL-14** The three flexible columns — `iri`, `type` and `cust` — MUST absorb all surplus width in the ratio 1.1 : 0.9 : 0.9 and MUST NOT fall below their stated minima. The five fixed columns MUST NOT grow or shrink `[src: COLS]`.

**TBL-15** The numeric alignment flag MUST imply both trailing alignment and the monospace face at code size, so that decimal points align down the column `[src: .tbl__cell--num]`.

**TBL-16** The explicit monospace flag, used by `Order ref` alone, MUST apply the monospace face at code size without changing alignment `[src: renderTableRows()]`.

**TBL-17** The `Individual` cell MUST be prefixed by a small Individual glyph tinted with the Individual colour token. No other column carries a glyph `[src: renderTableRows()]` `[src: KIND_META]`.

**TBL-18** The `Individual` column's sort key MUST be the generation index, not the IRI string. Sorting by generation index is numeric and stable; sorting by the IRI string would be lexicographic and would reorder rows once the dataset exceeds the zero-padding width `[src: COLS]` `[src: generateIndividuals()]`.

**TBL-19** The `Type` column's displayed value MUST be humanised — a space inserted between a lower-case letter or digit and a following upper-case letter, and every underscore replaced by a space, so that `FruttiDiMare` displays as `Frutti Di Mare` `[src: humanise()]`.

**TBL-20** The `Type` column's *sort key* MUST be the raw, un-humanised type name, so that sort order does not depend on the display transform `[src: COLS]`.

**TBL-21** An unresolvable customer MUST display an em dash (`—`) and MUST sort as the empty string, which places such rows first in ascending order `[src: COLS]`.

**TBL-22** Every cell's content MUST be clipped with a trailing ellipsis when it exceeds the column width. No cell may wrap, and row height MUST NOT vary `[src: .tbl__cell]`.

**TBL-23** Cell padding MUST be 12 px leading and trailing, with a 6 px gap between a glyph and its text `[src: .tbl__cell]`.

**TBL-24** Columns MUST NOT be reorderable, resizable or hideable in v1. **Status:** specified, not implemented in the reference build — a build that adds them MUST persist nothing, per the state-ownership rules in [`10-architecture.md`](10-architecture.md).

---

## Virtualisation

The table renders a sliding window of rows positioned inside a spacer whose height is the full extent of the dataset. The scrollbar therefore reflects the true row count while the number of rendered rows stays constant.

### Constants

| Constant | Value | Meaning | Source |
|---|---|---|---|
| Row height | 32 px | Fixed height of every body row and of the header row | `[src: ROW_H]` `[src: --h-row]` |
| Leading overscan | 6 rows | Rows rendered above the first visible row | `[src: renderTableRows()]` |
| Trailing overscan | 6 rows | Rows rendered below the last visible row | `[src: renderTableRows()]` |

**TBL-25** Row height MUST be exactly 32 px and MUST be identical for every row. Variable row heights are forbidden, because the window computation depends on a constant `[src: ROW_H]`.

**TBL-26** The row-height constant used by the layout and the row-height constant used by the arithmetic MUST be the same value, taken from one place `[src: ROW_H]` `[src: --h-row]`.

### The arithmetic

**TBL-27** The implementation MUST compute the rendered window with exactly these formulas, where `scrollTop` is the viewport's current scroll offset in pixels, `viewportHeight` is the viewport's measured inner height in pixels, and `n` is the number of rows in the filtered result set `[src: renderTableRows()]` `[src: applyFilters()]`:

```
spacerHeight = n × 32

first = max(0, floor(scrollTop ÷ 32) − 6)

count = ceil(viewportHeight ÷ 32) + 12

window = rows[first .. first + count)        // clipped to the end of the list

translation = first × 32
```

**TBL-28** The spacer MUST establish the true scroll extent: its height MUST be exactly `n × 32` pixels, and it MUST be recomputed whenever the filtered result set changes `[src: applyFilters()]`.

**TBL-29** The rendered window MUST be translated downwards by exactly `first × 32` pixels inside the spacer, so that row `first` lands at its true scroll position `[src: renderTableRows()]`.

**TBL-30** The translation MUST be an integral multiple of the row height. Sub-pixel offsets are forbidden, because they cause text to shimmer during scrolling `[src: renderTableRows()]`.

**TBL-31** The window slice MUST be clipped at the end of the list. Requesting `count` rows from `first` when fewer remain MUST yield only the remainder and MUST NOT pad `[src: renderTableRows()]`.

**TBL-32** The leading overscan of 6 rows MUST be applied by subtraction *before* clamping to zero, so that the window at the very top of the list starts at row 0 rather than at a negative index `[src: renderTableRows()]`.

**TBL-33** The trailing overscan MUST be 6 rows, achieved by adding 12 to the visible-row count: 6 to cover the partially visible row at each edge and the leading overscan already subtracted, and 6 beyond the last visible row `[src: renderTableRows()]`.

**TBL-34** Every rendered row MUST carry its absolute index in the filtered result set — `first + i` for the `i`-th row of the window — so that a row can be identified independently of its position in the rendered window `[src: renderTableRows()]`.

**TBL-35** Every rendered row MUST carry the IRI of its record, which is the key used by selection, editing and reveal `[src: renderTableRows()]`.

**TBL-36** A scroll event MUST re-render the window and MUST NOT re-filter or re-sort `[src: wire()]`.

**TBL-37** The scroll listener MUST be registered as passive, or its platform equivalent, so that scrolling is never blocked waiting for the handler `[src: wire()]`.

**TBL-38** Rendering cost MUST be independent of row count. With a viewport 400 px tall, the window is `ceil(400 ÷ 32) + 12 = 25` rows whether the dataset holds 100 rows or 100,000 `[src: renderTableRows()]`.

**TBL-39** The implementation MUST NOT create per-row resources that outlive the window — no per-row event listeners, no per-row accessibility objects retained after the row leaves the window. All row interaction MUST be handled by delegation on the container `[src: wire()]`.

**TBL-40** Header row height MUST equal body row height (32 px), and the header MUST remain pinned to the top of the viewport during vertical scrolling `[src: .tbl__head]`.

---

## Filtering

**TBL-41** The table MUST provide exactly three filters, which compose by conjunction: the type facet, the branch facet, and a free-text predicate. A row is retained only when it satisfies all three `[src: applyFilters()]`.

**TBL-42** A filter pass MUST be a single linear scan of the Individual records, testing all three predicates per record, and MUST NOT build intermediate collections per facet `[src: applyFilters()]`.

### The type facet

**TBL-43** The type facet MUST be an exact match on the record's type IRI. An empty facet value MUST mean "no constraint" `[src: applyFilters()]`.

**TBL-44** The type facet MUST NOT be hierarchical: selecting a superclass MUST NOT match instances of its subclasses. The facet's options are the keys of the type index, which are exactly the classes that have direct instances `[src: applyFilters()]` `[src: populateFilterOptions()]`.

### The branch facet

**TBL-45** The branch facet MUST be an exact, case-sensitive match on the record's branch name. An empty facet value MUST mean "no constraint" `[src: applyFilters()]`.

### The free-text predicate

**TBL-46** The free-text predicate MUST be a case-insensitive substring test against a single haystack composed, per record, by joining exactly these five fields with single spaces, in this order `[src: applyFilters()]`:

| Order | Field | Example |
|---|---|---|
| 1 | Order reference | `ax-100042` |
| 2 | Type local name | `margherita` |
| 3 | Branch name | `soho` |
| 4 | Individual local name | `pizza_000043` |
| 5 | Customer person name, or nothing when the customer does not resolve | `ada rossi` |

**TBL-47** The haystack and the query MUST both be lower-cased before the test `[src: applyFilters()]`.

**TBL-48** The free-text predicate MUST NOT search the price, the rating or the timestamp. Those are numeric and temporal columns; substring matching against them would produce results the user cannot predict `[src: applyFilters()]`.

**TBL-49** The implementation MUST reproduce the consequence of concatenating fields into one haystack: a query may span a field boundary. `margherita soho` matches a Margherita produced at the Soho branch, because the type name and the branch name are adjacent in the haystack. This is emergent, useful and specified `[src: applyFilters()]`.

### Debounce, reset and composition

**TBL-50** The free-text field MUST be debounced by exactly 160 ms of keystroke quiescence before the query is applied, and the query MUST be trimmed of leading and trailing whitespace `[src: wire()]`.

**TBL-51** The type and branch facets MUST apply immediately on change, with no debounce, because they are discrete selections rather than typed input `[src: wire()]`.

**TBL-52** Every filter change — text, type or branch — MUST reset the scroll offset to zero *before* the filter is applied. A user who filters and is left looking at row 4,000 of a 12-row result has been shown an empty viewport `[src: wire()]`.

**TBL-53** The reset action MUST clear all three filters and clear all three controls, then re-filter `[src: resetFilters()]`.

**TBL-54** The reset action MUST NOT clear the sort column or direction, and MUST NOT clear the selection `[src: resetFilters()]`.

**TBL-55** The reset action MUST also reset the scroll offset to zero. **Status:** specified, not implemented in the reference build — the reference resets the three filters without resetting the scroll offset, so a reset from deep in a filtered list can leave the viewport beyond the new extent until the next scroll event `[src: resetFilters()]`.

**TBL-56** Every filter application MUST, in this order: rebuild the result set; update the matched-row readout; update the total-Individual readout; resize the spacer; and re-render the window `[src: applyFilters()]`.

**TBL-57** The matched-row readout MUST read `<n> rows`, or exactly `1 row` when one row matched, with `en-GB` grouping separators `[src: applyFilters()]`.

**TBL-58** Regenerating the dataset MUST repopulate the facet options and then perform a full reset of the filters `[src: regenerate()]`.

---

## Sorting

**TBL-59** The default sort MUST be the `iri` column ascending, which is generation order `[src: TBL]`.

**TBL-60** Activating a column header MUST toggle as follows `[src: wire()]`:

| Current state | Activation | New state |
|---|---|---|
| This column is the sort column | Any | Direction inverts; column unchanged |
| A different column is the sort column | Any | This column becomes the sort column, direction resets to ascending |

**TBL-61** Header activation MUST re-render the header, re-apply the filters (which re-sorts), and reset the scroll offset to zero `[src: wire()]`.

**TBL-62** The comparator MUST be derived from the active column's sort key: extract the key from each record, compare with the natural ordering of that key's type, and multiply the result by the direction `[src: applyFilters()]`:

```
compare(a, b) = sign(key(a), key(b)) × dir
where sign(x, y) = −1 if x < y, +1 if x > y, 0 otherwise
```

**TBL-63** The comparator MUST NOT be type-specific per column beyond the sort key itself. Numeric columns yield numbers and compare numerically; string columns yield strings and compare by code unit `[src: applyFilters()]`.

**TBL-64** The sort MUST be stable, so that rows equal on the sort key retain their previous relative order `[src: applyFilters()]`.

**TBL-65** The implementation MAY skip the sort entirely when the sort column is `iri` and the direction is ascending, because the filter pass already emits records in generation-index order and that order is exactly the `iri` column's sort key `[src: applyFilters()]`.

**TBL-66** The optimisation in **TBL-65** MUST NOT be extended to any other column or direction `[src: applyFilters()]`.

**TBL-67** Sorting MUST operate on the filtered result set, not on the whole dataset. Filtering then sorting is `O(n) + O(m log m)` where `m ≤ n`; sorting then filtering would always be `O(n log n)` `[src: applyFilters()]`.

**TBL-68** Each column header MUST expose its sort state to assistive technology as exactly one of: ascending, descending, or none. Exactly one header at a time may be other than none `[src: renderTableHead()]`.

**TBL-69** The active sort column MUST show an accent-coloured arrow: upwards for ascending, downwards for descending. Inactive columns MUST show no arrow `[src: renderTableHead()]`.

**TBL-70** Header cells MUST be caption-size, semi-bold, secondary text colour, separated by a 1 px divider, leading-aligned regardless of the column's cell alignment, and MUST show a hover state that raises the text to primary colour `[src: .tbl__hcell]`.

---

## Selection

**TBL-71** A single activation anywhere on a row MUST select that row's Individual through the shared selection operation defined in [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) **TREE-5**, without revealing it in the graph `[src: wire()]`.

**TBL-72** A double activation on a row MUST select the Individual **and** reveal it in the graph, through the reveal path of **TREE-70** `[src: wire()]`.

**TBL-73** Selection MUST be single. The table MUST NOT support multi-row selection in v1 `[src: wire()]`.

**TBL-74** The selected row MUST be indicated by the selected-layer background token, and the indication MUST survive scrolling — a row re-entering the window MUST be drawn selected `[src: renderTableRows()]`.

**TBL-75** Selecting a row MUST re-render the inspector with the Individual's record sections, per **TREE-183** `[src: selectEntity()]` `[src: renderInspector()]`.

**TBL-76** Selecting an Individual from the graph or from global search MUST mark its row selected the next time that row is rendered. The table MUST NOT scroll to the selected row automatically. **Status:** specified, not implemented in the reference build — where implemented, scroll-to-selection MUST place the row at the nearest edge and MUST NOT alter the filters, which could otherwise hide the very row being revealed `[src: renderTableRows()]`.

**TBL-77** A single activation that lands on an editable cell MUST select the row *and* open the editor for that cell, in that order `[src: wire()]`.

**TBL-78** Because of **TBL-77**, a double activation on an editable cell both opens the editor and reveals in the graph. The specification records this honestly; an implementation MAY suppress editor opening when the activation is the first click of a double activation, provided single-click editing still works `[src: wire()]`.

---

## Inline editing

**TBL-79** Exactly three columns MUST be editable, with exactly these controls `[src: COLS]` `[src: beginCellEdit()]`:

| Column | Control | Initial value | Notes |
|---|---|---|---|
| `Branch` | Single-select over the six permitted branches | The record's current branch, pre-selected | Choosing an option MUST commit immediately |
| `Price` | Single-line text with decimal input mode | The record's price formatted to exactly two decimal places | Contents selected on open |
| `Rating` | Single-line text with decimal input mode | The record's rating as a bare integer | Contents selected on open |

**TBL-80** No other column may be editable. An attempt to commit against a non-editable column MUST fail with exactly `That column is not editable.` `[src: commitCell()]`.

**TBL-81** Exactly one editor may be active at a time. While an editor is active, a request to open another MUST be ignored `[src: beginCellEdit()]`.

**TBL-82** Opening an editor MUST capture the cell's rendered content so that it can be restored exactly on cancel or on failure `[src: beginCellEdit()]`.

**TBL-83** Opening an editor MUST move focus into it and select its contents, so that typing replaces `[src: beginCellEdit()]`.

**TBL-84** The editor MUST carry an accessible name equal to the column's header text `[src: beginCellEdit()]`.

**TBL-85** An editor MUST be visually distinct: full cell width, 22 px tall, 4 px horizontal padding, a 1 px accent border and a 2 px corner radius, inheriting the cell's type face `[src: .cell-input]`.

### Commit, cancel and validation timing

**TBL-86** Validation MUST run on loss of focus and MUST NOT run on keystroke. A user mid-way through typing `12.50` has typed `1`, `12`, `12.` — none of which is an error yet `[src: beginCellEdit()]`.

**TBL-87** `Enter` MUST commit, by removing focus from the editor, which triggers the loss-of-focus commit path. `Enter` MUST suppress any default action of the host control `[src: beginCellEdit()]`.

**TBL-88** `Escape` MUST cancel: restore the captured cell content exactly, discard the editor, leave the record untouched, and MUST NOT propagate to the window's close-dialog handler `[src: beginCellEdit()]`.

**TBL-89** A select-type editor MUST commit as soon as a value is chosen `[src: beginCellEdit()]`.

**TBL-90** A successful commit MUST perform exactly these effects, in this order `[src: beginCellEdit()]` `[src: commitCell()]`:

| Step | Effect |
|---|---|
| 1 | Clear the active-editor slot |
| 2 | Push the undo record — see **TBL-92** |
| 3 | Write the new value into the record |
| 4 | Increment the Store version counter |
| 5 | Re-apply the filters, which re-filters, re-sorts, resizes the spacer and re-renders the window |
| 6 | If the edited Individual is the current selection, re-render the inspector |

**TBL-91** Step 5 is deliberate: an edit may move a row out of the current filter, or to a different position under the current sort. The table MUST show the true result of the edit and MUST NOT keep a now-non-matching row in place `[src: beginCellEdit()]`.

**TBL-92** Every successful commit MUST push exactly one undo record of the form `{ kind: cell, record, column, from: <previous value> }`, pushed **before** the record is mutated `[src: commitCell()]`.

**TBL-93** Undo of a cell edit MUST write the previous value back into the record, re-apply the filters, and re-render the inspector `[src: undo()]`.

**TBL-94** A failed commit MUST perform exactly these effects, in this order `[src: beginCellEdit()]`:

| Step | Effect |
|---|---|
| 1 | Clear the active-editor slot |
| 2 | Mark the cell invalid with a 2 px inset danger-coloured outline |
| 3 | Surface the verbatim validation message as a transient warning notification |
| 4 | Restore the captured cell content — the **previous** value, not the rejected input |
| 5 | After exactly 1,800 ms, remove the invalid outline |

**TBL-95** The invalid outline MUST be transient and MUST clear itself after 1,800 ms without user action. A permanent error state on a cell the user has already left is noise `[src: beginCellEdit()]`.

**TBL-96** A failed commit MUST NOT mutate the record, MUST NOT push an undo record, MUST NOT increment the Store version, and MUST NOT re-filter `[src: commitCell()]` `[src: beginCellEdit()]`.

**TBL-97** A failed commit MUST discard the rejected input. The specification records this honestly: the user's typed value is lost and they must retype it. An implementation MAY instead keep the editor open with the rejected value and the message attached, which is kinder; it MUST NOT silently accept the value `[src: beginCellEdit()]`.

---

## Validation rules

Every message below is verbatim and MUST be reproduced character for character, including the typographic quotation marks and the em dash.

**TBL-98** A validation message MUST name the cause and the remedy. `Invalid value`, `Bad input` and `Error` are non-conformant messages regardless of where they appear. Every message in this section either states the permitted set, gives a worked example, or echoes what the user actually typed `[src: commitCell()]`.

**TBL-99** Input MUST be trimmed of leading and trailing whitespace before any rule is evaluated `[src: commitCell()]`.

**TBL-100** Rules within a column MUST be evaluated in the stated order, and the first failure's message MUST be the one reported `[src: commitCell()]`.

### Branch

**TBL-101** The permitted branch set MUST be exactly, and in this order: `Soho`, `Shoreditch`, `Camden`, `Clerkenwell`, `Borough`, `Islington` `[src: BRANCHES]`.

**TBL-102** The branch column MUST be validated by exactly this rule `[src: commitCell()]`:

| # | Condition | Verbatim message |
|---|---|---|
| 1 | The trimmed value is not a member of the permitted set, compared exactly and case-sensitively | `Branch must be one of: Soho, Shoreditch, Camden, Clerkenwell, Borough, Islington.` |

**TBL-103** The branch message MUST enumerate the permitted set in full. It MUST NOT say "not a valid branch" and leave the user to guess `[src: commitCell()]`.

**TBL-104** The message MUST be generated from the permitted set, joined with `, `, so that it cannot drift out of step with the set it describes `[src: commitCell()]`.

### Price

**TBL-105** The price column MUST be validated by exactly these rules, in this order `[src: commitCell()]`:

| # | Condition | Verbatim message |
|---|---|---|
| 1 | The trimmed value is empty | `Price is required. Enter an amount in pounds, for example 12.50.` |
| 2 | The value, after stripping a single leading pound sign, does not parse to a finite number | `“<value>” is not a number. Enter an amount in pounds, for example 12.50.` |
| 3 | The parsed number is less than zero | `Price cannot be negative.` |
| 4 | The parsed number is greater than 500 | `Price looks wrong — £<value to 2dp> exceeds the £500 sanity limit for a single pizza.` |

**TBL-106** A single leading pound sign MUST be stripped before parsing, so that a user who retypes the displayed value including its currency symbol is not rejected `[src: commitCell()]`.

**TBL-107** The upper sanity limit MUST be 500, and the message MUST state the figure `£500` explicitly. A limit the user cannot see is indistinguishable from a bug `[src: commitCell()]`.

**TBL-108** The limit message MUST echo the rejected amount formatted as currency to two decimal places — for example `Price looks wrong — £750.00 exceeds the £500 sanity limit for a single pizza.` `[src: commitCell()]` `[src: money()]`.

**TBL-109** The non-numeric message MUST echo the rejected input verbatim, wrapped in typographic double quotation marks — for example `“twelve” is not a number. Enter an amount in pounds, for example 12.50.` `[src: commitCell()]`.

**TBL-110** An accepted price MUST be rounded to exactly two decimal places before it is written to the record `[src: commitCell()]`.

**TBL-111** The limit is a *sanity* limit, not a business rule, and the message MUST say so by phrasing it as a suspicion (`looks wrong`) rather than a prohibition `[src: commitCell()]`.

### Rating

**TBL-112** The rating column MUST be validated by exactly these rules, in this order `[src: commitCell()]`:

| # | Condition | Verbatim message |
|---|---|---|
| 1 | The trimmed value is empty | `Rating is required. Enter a whole number from 1 to 5.` |
| 2 | The parsed number is not an integer | `Rating must be a whole number, not “<value>”.` |
| 3 | The parsed number is below 1 or above 5 | `Rating must be between 1 and 5. You entered <value>.` |

**TBL-113** The range MUST be 1 to 5 inclusive `[src: commitCell()]`.

**TBL-114** The range message MUST echo the entered value back to the user, so that a typo such as `55` is visible in the message itself `[src: commitCell()]`.

**TBL-115** The whole-number message MUST echo the rejected input in typographic double quotation marks — for example `Rating must be a whole number, not “4.5”.` `[src: commitCell()]`.

**TBL-116** The required message MUST state the permitted range, so that the user learns the constraint at the first failure rather than the second `[src: commitCell()]`.

---

## Send page to graph

**TBL-117** The table MUST provide a single action, labelled exactly `Send page to graph`, in the filter bar `[src: #tblToGraph]`.

**TBL-118** The action MUST take the first `min(filteredRowCount, Budget)` rows of the **current filtered and sorted result set**, in their displayed order `[src: wire()]`.

**TBL-119** "Page" means the leading slice of the result set under the current Budget. It MUST NOT mean the rows currently visible in the scroll window, and it MUST NOT mean the whole dataset `[src: wire()]`.

**TBL-120** When the filtered result set is empty, the action MUST do nothing to the Viewport and MUST show this warning notification verbatim: `No rows to send — the filter matches nothing.` `[src: wire()]`.

**TBL-121** The action MUST **seed** the Viewport, not expand it. Seeding MUST clear the existing nodes, edges and Focus set, then add the selected IRIs as the new Focus set at distance 0 `[src: seedView()]`.

**TBL-122** The seed MUST be performed with neighbour expansion suppressed. Sending 1,000 Individuals and then expanding each of them would exceed the Budget immediately and would make the result unreadable `[src: wire()]` `[src: seedView()]`.

**TBL-123** After seeding, the implementation MUST run a fresh layout, fit the view, and refresh the Budget readout `[src: seedView()]` `[src: wire()]`.

**TBL-124** The report MUST read exactly `Seeded the graph with <sent> of <matched> filtered rows. Double-click any node to expand it.` with both figures `en-GB` grouped, and MUST use the informational treatment `[src: wire()]`.

**TBL-125** The report MUST state both figures even when they are equal. A user who sent 1,000 of 12,000 rows and is told only "seeded the graph" has been misled about what they are looking at `[src: wire()]`.

**TBL-126** The action MUST NOT alter the filters, the sort, the selection or the scroll offset `[src: wire()]`.

---

## Empty state

**TBL-127** When the filtered result set is empty, the table MUST replace the row window with an empty state and MUST reset the window translation to zero `[src: renderTableRows()]`.

**TBL-128** The empty state MUST distinguish two cases, with exactly this copy `[src: renderTableRows()]`:

| Case | Condition | Heading | Body |
|---|---|---|---|
| Filters match nothing | The Store holds one or more Individual records | `No individuals match` | `Loosen the type, branch or text filter, or press Reset to see all <n> individuals.` |
| No dataset at all | The Store holds no Individual records | `No individuals match` | `The demo dataset is empty. Use Dataset on the command bar to generate individuals.` |

**TBL-129** In the first case, the total MUST be the full Individual count, `en-GB` grouped — for example `…to see all 12,000 individuals.` `[src: renderTableRows()]`.

**TBL-130** Both cases MUST offer a recovery action: an outline button labelled exactly `Reset filters`, which performs the reset of **TBL-53** `[src: renderTableRows()]` `[src: resetFilters()]`.

**TBL-131** The recovery action MUST be present in the no-dataset case even though it cannot help there. The specification records this honestly; an implementation SHOULD instead offer an action that opens the dataset menu in that case, which is the remedy the copy actually names `[src: renderTableRows()]`.

**TBL-132** Each empty-state body MUST name a specific remedy — which filters to loosen, or which command to use. `No results` alone is non-conformant, per **TBL-98** `[src: renderTableRows()]`.

**TBL-133** The empty state MUST be centred, with a heading in primary text colour and a body of at most 40 characters' measure in secondary text colour `[src: .empty-state]`.

---

## Filter option population

**TBL-134** The type facet's options MUST be built from the keys of the type index — exactly the classes that have at least one direct instance `[src: populateFilterOptions()]`.

**TBL-135** Type options MUST be sorted ascending by local name with locale-aware comparison `[src: populateFilterOptions()]`.

**TBL-136** The type facet MUST begin with an "all" option whose value is empty and whose label is exactly `All types (<n>)`, where `<n>` is the total Individual count, `en-GB` grouped — for example `All types (12,000)` `[src: populateFilterOptions()]`.

**TBL-137** Each type option's label MUST be the humanised local name followed by a space and the bucket count in brackets, `en-GB` grouped — for example `Frutti Di Mare (541)` `[src: populateFilterOptions()]` `[src: humanise()]`.

**TBL-138** Each type option's value MUST be the full type IRI, not its local name, so that two classes with the same local name in different namespaces cannot collide `[src: populateFilterOptions()]`.

**TBL-139** The branch facet MUST begin with an "all" option whose value is empty and whose label is exactly `All branches`, followed by the six permitted branches **in their declared order, not sorted** `[src: populateFilterOptions()]` `[src: BRANCHES]`.

**TBL-140** Branch options MUST NOT show counts. The specification records this asymmetry with the type facet honestly: branch counts would require a second pass over the dataset and are not held in an index `[src: populateFilterOptions()]` `[src: store]`.

**TBL-141** The facet options MUST be rebuilt whenever the dataset is regenerated, before the filters are reset, because regeneration replaces the type index wholesale `[src: regenerate()]`.

**TBL-142** The facet options MUST be rebuilt whenever an Individual is created with a type that has no existing bucket, because a new key has appeared in the type index `[src: newIndividualDialog()]`.

**TBL-143** Rebuilding the options MUST NOT preserve the user's current facet selections. Regeneration invalidates them, and **TBL-58** resets them immediately afterwards `[src: regenerate()]`.

---

## Create an individual

**TBL-144** Individual creation MUST be reachable from the New Individual command on the command bar `[src: #cmdNewIndividual]`.

**TBL-145** When the type index is empty, the dialog MUST NOT open and the implementation MUST show this warning notification verbatim: `Generate a dataset first — there are no instantiable types in the demo namespace yet.` `[src: newIndividualDialog()]`.

### Dialog fields

| Field | Control | Required | Default | Source |
|---|---|---|---|---|
| Type | Single-select over the type-index keys, labelled with local names, sorted ascending by local name | Yes | The first option | `[src: newIndividualDialog()]` |
| Branch | Single-select over the six permitted branches, in declared order | Yes | The first branch, `Soho` | `[src: newIndividualDialog()]` |
| Price, GBP | Single-line text with decimal input mode | Yes, marked with a danger-coloured asterisk | `11.50` | `[src: newIndividualDialog()]` |

**TBL-146** The dialog title MUST be exactly `New individual` `[src: newIndividualDialog()]`.

**TBL-147** The dialog MUST carry this explanatory line verbatim, immediately under the title `[src: newIndividualDialog()]`:

> Adds one record to the generated demo dataset. It appears in the table, the graph and the query results immediately.

**TBL-148** The action buttons MUST be exactly `Cancel` (outline) and `Create individual` (primary), in that order `[src: newIndividualDialog()]`.

**TBL-149** The type options MUST be labelled with the raw local name, **not** humanised. The specification records this inconsistency with **TBL-137** honestly; an implementation SHOULD humanise both `[src: newIndividualDialog()]`.

### Validation

**TBL-150** The price field MUST be validated on commit only, by exactly this rule `[src: newIndividualDialog()]`:

| # | Condition | Verbatim message |
|---|---|---|
| 1 | The value does not parse to a finite number, or is below 0, or is above 500 | `Enter an amount between 0 and 500, for example 12.50.` |

**TBL-151** A failed validation MUST mark the price row invalid, write the message into its error slot, and MUST NOT close the dialog `[src: newIndividualDialog()]`.

**TBL-152** The dialog's price rule MUST be reconciled with the in-cell price rules of **TBL-105**. The specification records the divergence honestly: the dialog accepts an empty value, because an empty string parses to zero, and creates a `£0.00` Individual. A conformant implementation MUST reject an empty price with the message from **TBL-105** rule 1, and SHOULD use one validation routine for both entry points `[src: newIndividualDialog()]` `[src: commitCell()]`.

### Store mutation

**TBL-153** A successful commit MUST construct a record with exactly these fields `[src: newIndividualDialog()]`:

| Field | Value |
|---|---|
| Generation index | The current Individual count, before insertion |
| IRI | `demo:Pizza_` followed by the generation index plus one, zero-padded to 6 digits |
| Type | The chosen type IRI |
| Type name | The local name of the chosen type |
| Order reference | `AX-` followed by the last 6 digits of `100000 + generationIndex` |
| Branch | The chosen branch |
| Price | The entered price rounded to two decimal places |
| Timestamp | The current wall-clock time in epoch milliseconds |
| Rating | `5` |
| Customer index | `0` |

**TBL-154** The record MUST be appended to the Individual list, registered in the IRI index, and appended to its type bucket, creating the bucket when it does not exist. The Store version counter MUST then be incremented `[src: newIndividualDialog()]`.

**TBL-155** The zero-padding width MUST match the width used by the generator for the current dataset size. **Status:** specified, not implemented in the reference build — the dialog pads to 6 digits unconditionally, while the generator pads to `max(6, digits(n))`, so for a dataset of 1,000,000 or more the created IRI is narrower than its generated siblings `[src: newIndividualDialog()]` `[src: generateIndividuals()]`.

**TBL-156** The customer index MUST be settable. **Status:** specified, not implemented in the reference build — the reference assigns customer index 0 unconditionally, so every created Individual is attributed to the first generated customer `[src: newIndividualDialog()]`.

**TBL-157** The rating MUST be settable. **Status:** specified, not implemented in the reference build — the reference assigns 5 unconditionally `[src: newIndividualDialog()]`.

**TBL-158** Creation MUST NOT push an undo record in the reference build; creating an Individual is therefore not undoable `[src: newIndividualDialog()]` `[src: undo()]`. A conformant implementation SHOULD record a reversible create.

### Post-commit behaviour

**TBL-159** After a successful commit the implementation MUST, in this order `[src: newIndividualDialog()]`:

| Step | Effect |
|---|---|
| 1 | Close the dialog |
| 2 | Rebuild the facet options |
| 3 | Re-apply the filters, which re-renders the table |
| 4 | Refresh the Store statistics readout |
| 5 | Re-render the hierarchy tree, whose instance counts have changed |
| 6 | Select the new Individual **and reveal it in the graph** |
| 7 | Show the confirmation notification |

**TBL-160** Step 5 is mandatory: the tree's instance-count suffix is derived from the type index, which step 2 of **TBL-154** has just changed `[src: newIndividualDialog()]` `[src: renderTree()]`.

**TBL-161** The confirmation notification MUST read exactly `Created <prefixed IRI>.` with the informational treatment — for example `Created demo:Pizza_012001.` `[src: newIndividualDialog()]`.

**TBL-162** The new Individual may fall outside the active filters and therefore may not appear in the table. The implementation MUST NOT clear the filters to make it visible; the selection and the reveal are what tell the user it exists `[src: newIndividualDialog()]`.

---

## Accessibility

**TBL-163** The scrolling viewport MUST be exposed as a grid with the accessible name `Individuals`, and MUST be a single stop in the tab order `[src: #tblViewport]`.

**TBL-164** The header MUST be exposed as a row; each header cell MUST be exposed as a column header carrying its sort state, per **TBL-68** `[src: renderTableHead()]`.

**TBL-165** Each body row MUST be exposed as a row; each cell MUST be exposed as a grid cell carrying its column identifier `[src: renderTableRows()]`.

**TBL-166** Every editable cell MUST carry an accessible name composed as `<header text>: <rendered value>, editable` — for example `Price: £12.50, editable` `[src: renderTableRows()]`.

**TBL-167** Non-editable cells MUST NOT carry a redundant accessible name; their text content is their name `[src: renderTableRows()]`.

**TBL-168** Every editable cell MUST be focusable by keyboard; non-editable cells MUST NOT be `[src: renderTableRows()]`.

**TBL-169** `Enter` on a focused editable cell MUST open its editor and MUST suppress the host control's default action `[src: wire()]`.

**TBL-170** The editor MUST receive focus when it opens, per **TBL-83** `[src: beginCellEdit()]`.

**TBL-171** On commit, focus MUST return to the cell that was edited. **Status:** specified, not implemented in the reference build — the reference re-renders the whole window on commit, which destroys the edited cell and drops focus to the document root, stranding a keyboard user `[src: beginCellEdit()]`. A conformant implementation MUST restore focus to the edited cell after the re-render, locating it by record IRI and column identifier, and MUST move focus to the nearest surviving row's corresponding cell when the edited row has been filtered out.

**TBL-172** On cancel, focus MUST return to the cell that was being edited. The cancel path restores the cell in place and so MUST NOT lose focus `[src: beginCellEdit()]`.

**TBL-173** The virtualised window MUST report the true total row count to assistive technology, not the size of the rendered window. **Status:** specified, not implemented in the reference build — a conformant implementation MUST expose the row count and each row's absolute index, which **TBL-34** already requires the renderer to carry.

**TBL-174** Validation messages MUST be announced. Routing them through a single polite live region satisfies this, and is what the reference does by sending every message to the transient notification host `[src: setStatusMessage()]`.

**TBL-175** Arrow-key navigation between cells and rows MUST be implemented, with `Home` and `End` moving to the first and last cell of a row and `Ctrl+Home` / `Ctrl+End` to the first and last row. **Status:** specified, not implemented in the reference build `[src: wire()]`.

**TBL-176** The colour used to indicate an invalid cell MUST NOT be the sole indicator. **Status:** specified, not implemented in the reference build — the reference marks an invalid cell with colour alone and relies on the accompanying notification to carry the meaning. A conformant implementation MUST additionally mark the cell's accessible invalid state for the duration of the outline.

---

## Performance requirements

**TBL-177** A scroll frame — recomputing the window and re-rendering it — MUST complete within 16 ms at any dataset size up to 100,000 rows, on the reference hardware profile named in [`10-architecture.md`](10-architecture.md) `[src: renderTableRows()]`.

**TBL-178** A filter pass over 100,000 rows MUST complete within 50 ms, measured from the expiry of the debounce to the completed re-render `[src: applyFilters()]`.

**TBL-179** A filter pass MUST be a single linear scan. It MUST NOT allocate per-row objects, MUST NOT build a per-facet intermediate list, and MUST NOT re-derive the haystack more than once per row per pass `[src: applyFilters()]`.

**TBL-180** The filter MUST short-circuit: the cheapest predicates — the two exact-match facets — MUST be evaluated before the free-text haystack is composed, so that a faceted query never pays for string concatenation on rows it has already rejected `[src: applyFilters()]`.

**TBL-181** A sort over 100,000 rows MUST complete within 200 ms `[src: applyFilters()]`.

**TBL-182** The table MUST NOT re-filter on scroll, MUST NOT re-sort on scroll, and MUST NOT recompute the spacer height on scroll `[src: wire()]` `[src: renderTableRows()]`.

**TBL-183** Regenerating the dataset at 100,000 rows MUST leave the table interactive; the implementation MUST show the generation notification before the work begins and the completion report after it `[src: regenerate()]`.

**TBL-184** Memory MUST be proportional to the dataset, not to the dataset times the number of Surfaces. The table holds references to the Store's records and MUST NOT project them into view-models with copied field values `[src: applyFilters()]`.

**TBL-185** The implementation MUST NOT materialise triples for Individuals in order to render the table. Each record is a compact object read directly by the column accessors; the 7-triples-per-Individual figure reported in the Store statistics is counted, never built `[src: tripleCount()]` `[src: COLS]`.

---

## Copy register

| # | String | Where | Source |
|---|---|---|---|
| 1 | `Individuals` | Dock tab label, and the grid's accessible name | `[src: #tabIndividuals]` `[src: #tblViewport]` |
| 2 | `Type` | Filter bar label, and column header | `[src: #pageIndividuals]` `[src: COLS]` |
| 3 | `Filter by type` | Type facet accessible name | `[src: #fType]` |
| 4 | `Branch` | Filter bar label, and column header | `[src: #pageIndividuals]` `[src: COLS]` |
| 5 | `Filter by branch` | Branch facet accessible name | `[src: #fBranch]` |
| 6 | `Filter individuals` | Free-text placeholder and accessible name | `[src: #fSearch]` |
| 7 | `Reset` | Filter bar action | `[src: #fReset]` |
| 8 | `<n> rows` / `1 row` | Matched-row readout | `[src: applyFilters()]` |
| 9 | `Send page to graph` | Filter bar action | `[src: #tblToGraph]` |
| 10 | `Individual` | Column header | `[src: COLS]` |
| 11 | `Order ref` | Column header | `[src: COLS]` |
| 12 | `Price` | Column header | `[src: COLS]` |
| 13 | `Rating` | Column header | `[src: COLS]` |
| 14 | `Prepared` | Column header | `[src: COLS]` |
| 15 | `Customer` | Column header | `[src: COLS]` |
| 16 | `<header>: <value>, editable` | Editable cell accessible name | `[src: renderTableRows()]` |
| 17 | `No individuals match` | Empty-state heading | `[src: renderTableRows()]` |
| 18 | `Loosen the type, branch or text filter, or press Reset to see all <n> individuals.` | Empty state, filters match nothing | `[src: renderTableRows()]` |
| 19 | `The demo dataset is empty. Use Dataset on the command bar to generate individuals.` | Empty state, no dataset | `[src: renderTableRows()]` |
| 20 | `Reset filters` | Empty-state recovery action | `[src: renderTableRows()]` |
| 21 | `All types (<n>)` | Type facet "all" option | `[src: populateFilterOptions()]` |
| 22 | `All branches` | Branch facet "all" option | `[src: populateFilterOptions()]` |
| 23 | `Branch must be one of: Soho, Shoreditch, Camden, Clerkenwell, Borough, Islington.` | Validation | `[src: commitCell()]` |
| 24 | `Price is required. Enter an amount in pounds, for example 12.50.` | Validation | `[src: commitCell()]` |
| 25 | `“<value>” is not a number. Enter an amount in pounds, for example 12.50.` | Validation | `[src: commitCell()]` |
| 26 | `Price cannot be negative.` | Validation | `[src: commitCell()]` |
| 27 | `Price looks wrong — £<value> exceeds the £500 sanity limit for a single pizza.` | Validation | `[src: commitCell()]` |
| 28 | `Rating is required. Enter a whole number from 1 to 5.` | Validation | `[src: commitCell()]` |
| 29 | `Rating must be a whole number, not “<value>”.` | Validation | `[src: commitCell()]` |
| 30 | `Rating must be between 1 and 5. You entered <value>.` | Validation | `[src: commitCell()]` |
| 31 | `That column is not editable.` | Validation | `[src: commitCell()]` |
| 32 | `No rows to send — the filter matches nothing.` | Notification | `[src: wire()]` |
| 33 | `Seeded the graph with <n> of <m> filtered rows. Double-click any node to expand it.` | Notification | `[src: wire()]` |
| 34 | `Generate a dataset first — there are no instantiable types in the demo namespace yet.` | Notification | `[src: newIndividualDialog()]` |
| 35 | `New individual` | Dialog title | `[src: newIndividualDialog()]` |
| 36 | `Adds one record to the generated demo dataset. It appears in the table, the graph and the query results immediately.` | Dialog body | `[src: newIndividualDialog()]` |
| 37 | `Price, GBP` | Dialog field label | `[src: newIndividualDialog()]` |
| 38 | `Enter an amount between 0 and 500, for example 12.50.` | Dialog validation | `[src: newIndividualDialog()]` |
| 39 | `Cancel` | Dialog action | `[src: newIndividualDialog()]` |
| 40 | `Create individual` | Dialog action | `[src: newIndividualDialog()]` |
| 41 | `Created <prefixed IRI>.` | Notification | `[src: newIndividualDialog()]` |
| 42 | `Nothing to undo.` / `Undone.` | Notification | `[src: undo()]` |

---

## Conformance summary

Against the fixture in [`62-pizza-ontology-fixture.md`](62-pizza-ontology-fixture.md), at the boot dataset of 12,000 Individuals.

| # | Check | Requirement |
|---|---|---|
| 1 | At boot the table shows 12,000 rows in generation order and reports `12,000 rows` | TBL-57, TBL-59 |
| 2 | With a 400 px viewport, exactly 25 rows are rendered at any scroll offset | TBL-27, TBL-38 |
| 3 | The scrollbar extent corresponds to 384,000 px (12,000 × 32) | TBL-28 |
| 4 | Scrolling to the bottom renders the final partial window and no padding rows | TBL-31 |
| 5 | Selecting type `Margherita` reduces the row count, resets the scroll offset, and leaves the sort unchanged | TBL-43, TBL-52 |
| 6 | Typing `soho` 160 ms after the last keystroke matches every Soho row | TBL-46, TBL-50 |
| 7 | `margherita soho` matches Margheritas from Soho | TBL-49 |
| 8 | Activating `Price` sorts ascending; activating it again sorts descending; both report their sort state | TBL-60, TBL-68 |
| 9 | Clicking a `Branch` cell opens a select; choosing `Camden` commits immediately and re-filters | TBL-79, TBL-89, TBL-90 |
| 10 | Entering `750` in a `Price` cell reports the £500 sanity message and restores the previous value | TBL-105, TBL-94 |
| 11 | Entering `4.5` in a `Rating` cell reports the whole-number message with the value echoed | TBL-112 |
| 12 | `Escape` during an edit restores the previous value and mutates nothing | TBL-88, TBL-96 |
| 13 | `Ctrl+Z` after a committed edit restores the previous value and re-filters | TBL-92, TBL-93 |
| 14 | `Send page to graph` with no filter seeds exactly Budget rows and reports both figures | TBL-118, TBL-124 |
| 15 | A filter matching nothing shows the first empty-state copy with the 12,000 figure | TBL-128, TBL-129 |
| 16 | Creating an Individual selects it, reveals it, and updates the tree's instance count | TBL-159, TBL-160 |

---

## Appendix A — Native stack mapping (non-normative)

This appendix is advisory. A conformant implementation may ignore every word of it.

### Virtualised data grids on Windows

| Stack | Control | Notes |
|---|---|---|
| WinUI 3 | `ItemsRepeater` inside a `ScrollViewer`, with a `StackLayout` of `ItemHeight = 32` | Closest to the reference model. You keep full control of the window arithmetic, which matters because **TBL-27** is normative. `ItemsRepeater` recycles element containers by data-template, satisfying **TBL-39**. |
| WinUI 3 | Community Toolkit `DataGrid` | Gives column headers, sort glyphs and cell edit templates out of the box; heavier, and its virtualisation is harder to reason about when rows are replaced wholesale on every filter pass. |
| WPF | `DataGrid` with `EnableRowVirtualization="True"` and `VirtualizingPanel.VirtualizationMode="Recycling"` | Set `RowHeight="32"` explicitly. Leave `EnableColumnVirtualization` off; eight columns do not need it and it interferes with the shared track specification of **TBL-13**. |
| Avalonia | `TreeDataGrid` in flat mode | Virtualises rows and columns, supports per-column templates and sort indicators, and exposes a row-index concept that maps to **TBL-34**. |

Practical notes:

- Bind the scroll viewer's `VerticalOffset` and `ViewportHeight` directly into the formulas in **TBL-27**. Do not let the control choose its own realisation window; the overscan figures are specified.
- Give the spacer its height as a fixed `Height`, not as a `MinHeight` on a stack panel. The scrollbar must reflect `n × 32` before a single row is realised.
- The shared column track in **TBL-13** maps to a `Grid` with eight `ColumnDefinition`s (`170,1.1*` becomes `MinWidth=170, Width=1.1*`) shared via `Grid.IsSharedSizeScope` on the table root, or to a single `ColumnDefinitions` object bound by both the header and the row template.
- Do not use `ObservableCollection` change notifications for the filter pass. Replacing the entire collection on each pass is cheaper than 90,000 individual removal notifications, and matches the reference behaviour of recomputing `rows` wholesale.
- `en-GB` formatting is not the default on every machine. Pin the culture explicitly for `fmt`, `money` and `when`; do not rely on `CultureInfo.CurrentCulture`, or the timestamps in **TBL-12** row 7 will change shape on a US-locale machine.

### Cell edit templates

| Concern | Windows convention |
|---|---|
| Entering edit | Single click on an editable cell, per **TBL-77**, plus `Enter` on a focused cell, per **TBL-169**. On `DataGrid`, set `BeginEditOnSingleClick`. |
| Branch editor | `ComboBox` with `IsEditable="False"`, `SelectedItem` bound to the branch, and `SelectionChanged` committing immediately, per **TBL-89**. |
| Price and rating editors | `TextBox` with `InputScope="Number"` (WinUI) or `NumberBox` with `ValidationMode="Disabled"`. Disable the built-in validation — **TBL-86** requires validation on focus loss only, and `NumberBox` validates far more eagerly. |
| Commit | `LostFocus` on the editor. On WinUI, beware that opening a `ComboBox` popup can itself raise `LostFocus`; commit from `SelectionChanged` for that control instead. |
| Cancel | `Escape` with the key marked handled, per **TBL-88**. |
| Invalid indication | An inset `Border` with the danger brush plus a `DispatcherTimer` of 1,800 ms, per **TBL-94** and **TBL-95**. Also set `AutomationProperties` invalid state, per **TBL-176**. |
| Focus restoration | **TBL-171** is the one requirement most easily lost on a virtualising control. After the re-render, look the cell up by record IRI and column identifier and call `Focus(FocusState.Programmatic)`. Do it in a layout-updated callback, not synchronously, or the container will not exist yet. |

### Incremental filtering

The reference re-scans the whole dataset on every filter application, which is well within the 50 ms budget of **TBL-178** at 100,000 rows. Two refinements are worth having if the ceiling rises:

- **Facet pre-indexing.** The type facet already has an index — the type buckets. When a type is selected and the other two filters are empty, iterate the bucket rather than the whole dataset. This turns the common case into `O(bucketSize)`.
- **Incremental narrowing.** When the new query string has the previous query as a prefix and the facets are unchanged, the new result set is necessarily a subset of the previous one. Scan `rows` instead of the full dataset. Invalidate the moment a facet changes, the query stops extending, or the Store version counter moves.

Neither refinement may change the observable result. **TBL-42** requires a single linear scan; both refinements scan a smaller set exactly once, which satisfies it. Do not add a background thread for filtering: at these sizes the marshalling costs more than the scan, and a filter that completes out of order is worse than one that takes 50 ms.
