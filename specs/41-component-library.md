# Axiom Component Library

**Purpose.** This document specifies every control in the Axiom workbench — its purpose, its anatomy, its sizing in **Design token**s, every interaction state it can enter, its keyboard behaviour, its accessible name and role, and the rules governing the content it may carry.

**Status:** Normative

**Owned prefix:** `CMP`

**Related documents:** [`README.md`](README.md) · [`40-design-system.md`](40-design-system.md) · [`30-class-tree-and-inspector.md`](30-class-tree-and-inspector.md) · [`31-individuals-table.md`](31-individuals-table.md) · [`32-sparql-console.md`](32-sparql-console.md) · [`20-graph-viewport-and-budget.md`](20-graph-viewport-and-budget.md) · [`50-visual-reference.html`](50-visual-reference.html) · [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md)

---

## Scope and reading conventions

Every component section below follows the same shape:

1. **Purpose** — what the control is for, and when it is the right choice.
2. **Anatomy** — a labelled part list. Part names are stable and are used elsewhere in the suite.
3. **Sizing** — every metric, given as a token reference.
4. **States** — default, hover, pressed, focus, selected, disabled, loading, empty, error. A state that genuinely cannot occur for a component is listed as *not applicable* with the reason; it is never silently omitted.
5. **Keyboard** — every key the component responds to.
6. **Accessibility** — role, accessible name, and any additional properties.
7. **Content rules** — what may and may not appear inside.

**CMP-1.** Every metric, colour, radius and duration named in this document MUST resolve to a token defined in [`40-design-system.md`](40-design-system.md). A component MUST NOT introduce a literal value except under the two exceptions of DS-11.

**CMP-2.** Every interactive control in Axiom MUST use the default arrow cursor, not a pointing hand. This is a desktop application, not a hypertext document; the hand cursor would be the only place in the product that borrows a browser convention [src: `.btn`, `.tab`, `.tree__row`, `.tbl__row`, `.menu__item`, `.qitem`, `.axiom a`, `.wincontrol`]. Two cursors are exceptions: the graph canvas uses a grab cursor and switches to grabbing while panning [src: `.graph__canvas`], and an editable table cell uses a text cursor [src: `.tbl__cell--edit`]. Splitters use the appropriate resize cursor [src: `.splitter`].

**CMP-3.** Every component that transitions on hover or press MUST animate only `background`, `border-color` or `color`, at `--dur-fast` with `--ease-out` (DS-57). A component MUST NOT transition its size or position on hover.

---

## Title bar

### Purpose

Identifies the application and the open document, provides the window drag region, and hosts the three window controls. It is the topmost band of the window grid and is always present.

### Anatomy

| Part | Description |
|---|---|
| **Bar** | The full-width container, 32 px tall, on `--ground`, with a bottom hairline in `--stroke-divider` [src: `.titlebar`] |
| **App icon** | A 16 × 16 icon using the `i-logo` symbol, tinted `--accent` [src: `.titlebar__icon`] |
| **Document title** | A single line of 12 px text in `--text-secondary`, never wrapping [src: `.titlebar__title`] |
| **Spacer** | A flexible gap that pushes the window controls to the trailing edge [src: `.titlebar__spacer`] |
| **Window controls** | The three caption buttons; see [Window controls](#window-controls) |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Height | `--h-titlebar` | 32 px |
| Leading inset | `--sp-3` | 12 px |
| Gap, icon to title | `--sp-2` | 8 px |
| Icon | `.icon` | 16 × 16 px |
| Title size | `--fs-caption` | 12 px |
| Bottom border | `--stroke-divider` | 1 px |

### States

| State | Treatment |
|---|---|
| Default | As above [src: `.titlebar`] |
| Hover | Not applicable to the bar itself; the controls have their own hover states |
| Pressed | Not applicable; pressing the bar begins a window drag, which is a system behaviour and MUST NOT change the bar's appearance |
| Focus | Not applicable; the bar is not focusable. Its controls are |
| Selected | Not applicable |
| Disabled | Not applicable |
| Loading | Not applicable |
| Empty | Not applicable; the title always names a document |
| Error | Not applicable |
| **Window inactive** | **Status:** specified, not implemented in the reference build. When the window loses activation, the document title MUST drop to `--text-disabled` and the window controls MUST drop their glyph colour to `--text-disabled`; the bar's ground MUST NOT change |

### Keyboard

The title bar is not in the tab order. Its controls are. `Alt+Space` MUST open the system window menu, which is a platform behaviour.

### Accessibility

The bar has no role of its own. The document title MUST NOT be exposed as a heading. Text in the bar MUST be non-selectable so that a drag on the title drags the window rather than selecting text [src: `.titlebar`].

### Content rules

**CMP-4.** The document title MUST take the form `<document name> — <application name>`, for example "pizza.owl — Axiom Ontology Workbench" [src: `#winTitle`]. The document name comes first because it is what distinguishes one window from another in the task bar.

**CMP-5.** The title MUST reflect unsaved changes when the concept applies, conventionally by a leading asterisk. **Status:** specified, not implemented in the reference build.

**CMP-6.** The title MUST NOT wrap and MUST truncate with an ellipsis when the window is too narrow, preserving the leading document name [src: `.titlebar__title`].

---

## Window controls

### Purpose

Minimise, maximise and close the window. They follow the Windows caption-button convention exactly, including the distinctive red close-button hover.

### Anatomy

| Part | Description |
|---|---|
| **Control group** | A flush row of three buttons at full bar height, at the trailing edge [src: `.wincontrols`] |
| **Minimise button** | Uses `i-min` [src: `.wincontrol`] |
| **Maximise button** | Uses `i-max` [src: `.wincontrol`] |
| **Close button** | Uses `i-close`, carrying the close modifier [src: `.wincontrol--close`] |

### Sizing

| Metric | Value |
|---|---|
| Button width | 46 px [src: `.wincontrol`] |
| Button height | 100 % of the title bar, i.e. `--h-titlebar` |
| Glyph | 16 × 16 px, centred |
| Border, padding | none; the glyph is centred by the layout |
| Radius | 0; caption buttons are square to the window corner |

### States

| State | Treatment |
|---|---|
| Default | Transparent ground, glyph in `--text` [src: `.wincontrol`] |
| Hover — minimise, maximise | Ground becomes `--layer-hover`, transitioning `background` over `--dur-fast` with `--ease-out` [src: `.wincontrol:hover`] |
| Hover — close | Ground becomes `#C42B1C`, glyph becomes `#FFFFFF`, in both themes [src: `.wincontrol--close:hover`] |
| Pressed | **Status:** specified, not implemented in the reference build. The pressed state MUST darken the hover ground by one step: `--layer-pressed` for minimise and maximise, and a darker red for close |
| Focus | The focus ring is drawn inset by 3 px so it is not clipped by the window edge [src: `.wincontrol:focus-visible`] |
| Selected | Not applicable; caption buttons have no persistent state |
| Disabled | Applicable only to maximise, on a window that cannot be maximised. The glyph drops to `--text-disabled` and the button leaves the tab order |
| Loading | Not applicable |
| Empty | Not applicable |
| Error | Not applicable |

### Keyboard

Reachable by Tab. Activated by Space or Enter. `Alt+F4` MUST close the window regardless of focus.

### Accessibility

**CMP-7.** Each control MUST carry an explicit accessible name — "Minimize", "Maximize", "Close" [src: `.wincontrol` labels]. The glyph MUST be hidden from assistive technology.

**CMP-8.** The maximise control MUST change its accessible name and its glyph when the window is maximised, to "Restore". **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-9.** The three controls MUST appear in the order minimise, maximise, close, at the trailing edge. No fourth control may join the group. Application commands belong on the [Command bar](#command-bar).

**CMP-10.** The close-button hover treatment MUST NOT be applied to any other control anywhere in the product. It is a platform signature, and reusing it would dilute it.

---

## Command bar

### Purpose

The application's primary command surface: a single horizontal band of grouped actions, a global search field, and the view toggles. It is always visible and never scrolls.

### Anatomy

| Part | Description |
|---|---|
| **Bar** | Full-width container on `--surface` with a bottom border in `--stroke` [src: `.commandbar`] |
| **Command group** | A tight cluster of related buttons [src: `.cmdgroup`] |
| **Separator** | A vertical hairline between groups [src: `.cmdsep`] |
| **Search field** | The global search, with its leading magnifier [src: `.search`] |
| **Flexible spacer** | Pushes the trailing group to the right edge |
| **Trailing group** | The three panel toggles and the theme toggle |

The reference build's arrangement, in order [src: command bar markup]: create group (New class, New individual) · separator · edit group (Undo, Save) · separator · dataset split button · separator · global search · spacer · view group (hierarchy toggle, inspector toggle, dock toggle, theme toggle).

### Sizing

| Metric | Token | Value |
|---|---|---|
| Height | `--h-commandbar` | 40 px |
| Horizontal padding | `--sp-2` | 8 px |
| Gap between groups and the bar's direct children | `--sp-1` | 4 px |
| Gap between buttons within a group | — | 2 px [src: `.cmdgroup`] |
| Separator | — | 1 px wide, 18 px tall, `--stroke`, with `--sp-2` margin each side [src: `.cmdsep`] |
| Global search width | — | 260 px [src: `#globalSearch`] |
| Bottom border | `--stroke` | 1 px |

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, pressed, focus, selected, disabled | Not applicable to the bar; each hosted control owns its own states |
| Loading | Not applicable; the bar never blocks. A long operation shows a [Toast](#toast) and leaves the bar live |
| Empty | Not applicable; the bar always carries at least the view toggles |
| Error | Not applicable |
| **Overflow** | **Status:** specified, not implemented in the reference build. When the bar cannot fit its groups, trailing groups MUST collapse into an overflow flyout, in reverse priority order — create group last, view group first. Groups MUST NOT be clipped (DS-122) |

### Keyboard

**CMP-11.** The bar is a toolbar and SHOULD implement toolbar keyboard semantics: one tab stop for the whole bar, with Left and Right arrows moving between controls. **Status:** specified, not implemented in the reference build — the reference bar places every button in the tab order individually.

Shortcuts routed to bar commands: `Ctrl+Z` (Undo), `Ctrl+S` (Save), `Ctrl+F` (focus global search) [src: `wire()`].

### Accessibility

Role `toolbar`, accessible name "Main commands" [src: `.commandbar`]. Separators carry `role="separator"`.

### Content rules

**CMP-12.** Buttons MUST be grouped by task, and groups MUST be separated by a separator, never by extra whitespace alone. Whitespace groups are ambiguous at a glance; the hairline is not.

**CMP-13.** A group MUST contain no more than four buttons. Beyond four the group stops reading as a group.

**CMP-14.** Destructive commands MUST NOT appear on the command bar. Deletion is reached by selection plus the Delete key, and is confirmed in a dialog [src: `deleteSelected()`].

**CMP-15.** The trailing group MUST contain only view state toggles — what is shown, and in which theme. It MUST NOT contain document commands.

---

## Button

### Purpose

The single action primitive. Five variants exist and MUST NOT be extended: default, icon-only, primary, outline and danger.

### Anatomy

| Part | Description |
|---|---|
| **Container** | An inline flex box with a transparent 1 px border, so that every variant has the same box regardless of whether its border is visible [src: `.btn`] |
| **Leading icon** | Optional, 16 × 16 standard or 14 × 14 small, never flexible [src: `.btn svg`] |
| **Label** | Single line, never wrapping [src: `.btn`] |
| **Trailing affordance** | Optional; on a split button, a 14 × 14 chevron rotated 90° [src: `#cmdScale`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Height | `--h-control` | 28 px |
| Horizontal padding | `--sp-3` | 12 px each side |
| Icon-to-label gap | `--sp-2` | 8 px |
| Border | — | 1 px, transparent by default |
| Radius | `--r-control` | 4 px |
| Font | `--fs-body` | 14 px, line-height 1 |
| Icon-only width | `--h-control` | 28 px, zero padding, centred glyph [src: `.btn--icon`] |

**CMP-16.** A button's label MUST use line-height 1 rather than the document line height, so that the glyph and the text share a vertical centre inside a 28 px box [src: `.btn`].

### Variant: default

Transparent ground, `--text` label, transparent border. The workhorse variant; used for every command that is neither the primary action of its surface nor destructive [src: `.btn`].

| State | Treatment |
|---|---|
| Default | Transparent ground, `--text` |
| Hover | Ground `--layer-hover` [src: `.btn:hover`] |
| Pressed | Ground `--layer-pressed` [src: `.btn:active`] |
| Focus | 2 px `--accent` ring, offset 1 px [src: `:focus-visible`] |
| Selected / active | Ground `--layer-selected`, applied when the button is an open flyout's trigger or a toggle in its on state [src: `.btn[aria-expanded="true"]`, `.btn.is-active`] |
| Disabled | Label `--text-disabled`, pointer events removed, out of the tab order [src: `.btn[disabled]`] |
| Loading | **Status:** specified, not implemented in the reference build. A loading button MUST replace its leading icon with a [Spinner](#spinner), MUST keep its label, and MUST become disabled for the duration |
| Empty | Not applicable; a button always has a label or an accessible name |
| Error | Not applicable; a button does not carry error state. The failure it causes is reported by a [Toast](#toast) or an inline error |

### Variant: icon-only

A square 28 × 28 button with no label and a centred 16 × 16 glyph [src: `.btn--icon`]. States are identical to the default variant.

**CMP-17.** An icon-only button MUST carry both an accessible name and a tooltip, and the tooltip MUST name the keyboard shortcut where one exists (DS-95) [src: `#cmdUndo`, `#gFit`].

**CMP-18.** An icon-only button MUST NOT be used for an action whose meaning is not obvious from a standard glyph. "Send page to graph" is a labelled button for exactly this reason [src: `#tblToGraph`].

### Variant: primary

The single strongest action on a surface. Accent ground, on-accent label, semibold [src: `.btn--primary`].

| State | Treatment |
|---|---|
| Default | Ground `--accent`, label `--text-on-accent`, weight 600, transparent border |
| Hover | Ground `--accent-hover` [src: `.btn--primary:hover`] |
| Pressed | Ground `--accent-pressed` [src: `.btn--primary:active`] |
| Focus | The standard ring, which sits outside the accent fill and therefore remains visible |
| Selected | Not applicable; a primary button is an action, never a state |
| Disabled | Inherits the default variant's disabled treatment. **Status:** a dedicated disabled accent ground is specified, not implemented in the reference build — a disabled primary button currently keeps its accent fill and only dims its label, which is insufficient. A disabled primary button MUST drop its ground to `--layer-pressed` and its label to `--text-disabled` |
| Loading | As the default variant |
| Empty, Error | Not applicable |

**CMP-19.** At most one primary button may appear on a surface at one time. The reference build has exactly three: "Start from Pizza" in the graph empty state, "Run" in the SPARQL console, and the confirming action of each dialog [src: `#emptySeed`, `#qRun`, `newClassDialog()`].

### Variant: outline

A default button with a visible boundary and an opaque ground, for a secondary action that must still read as a button on a busy surface [src: `.btn--outline`].

| State | Treatment |
|---|---|
| Default | Border `--stroke-strong`, ground `--surface` |
| Hover | Ground `--layer-hover`, border unchanged [src: `.btn--outline:hover`] |
| Pressed | Ground `--layer-pressed` |
| Focus, Selected, Disabled, Loading | As the default variant |

**CMP-20.** The outline variant's boundary currently fails the 3:1 requirement in both themes (DS-30). The remedy in DS-30 MUST be applied before release.

**CMP-21.** The outline variant is the cancelling action in every dialog, paired with a primary confirming action [src: `newClassDialog()`, `newIndividualDialog()`, `deleteSelected()`].

### Variant: danger

A default button whose label is `--danger` and whose hover ground is `--danger-subtle` [src: `.btn--danger`].

| State | Treatment |
|---|---|
| Default | Transparent ground, label `--danger` |
| Hover | Ground `--danger-subtle`, label unchanged |
| Pressed | Ground `--layer-pressed` over the danger ground |
| Focus, Disabled, Loading | As the default variant |
| Selected, Empty, Error | Not applicable |

**Status:** the danger variant is defined and never used in the reference build. Destructive confirmation is instead expressed as a primary button whose ground is overridden to `--danger` [src: `deleteSelected()`]. **CMP-22.** That override is a defect: a one-off inline colour is exactly what DS-7 forbids. An implementation MUST introduce a `primary danger` variant — accent-weight prominence with the danger hue — and use it for the destructive confirming action.

### Keyboard (all variants)

Reachable by Tab; activated by Space or Enter. A disabled button is not reachable.

### Accessibility (all variants)

Role `button`. A toggle button MUST carry `aria-pressed` and MUST update it on every change [src: `togglePanel()`]. A flyout trigger MUST carry `aria-haspopup="menu"` and `aria-expanded` and MUST reset `aria-expanded` when the flyout closes by any route, including outside click and Escape [src: `closeMenus()`].

### Content rules

**CMP-23.** Labels MUST be sentence case, MUST be verb-first where the button performs an action ("Send page to graph", "Page instances into the graph", "Reset filters"), and MUST NOT end in a full stop.

**CMP-24.** Labels MUST NOT wrap [src: `.btn`]. A label that does not fit is too long and MUST be rewritten, not truncated.

**CMP-25.** A button MUST NOT carry a trailing icon except the chevron of a split button.

---

## Split button with flyout

### Purpose

A single button that opens a menu of related choices, where no single choice is the obvious default. Used for the dataset generator and for graph export [src: `#cmdScale`, `#gExport`].

### Anatomy

| Part | Description |
|---|---|
| **Trigger** | A default-variant button carrying a leading icon, a label, and a trailing chevron rotated 90° to point downward [src: `#cmdScale`] |
| **Flyout** | A [Flyout menu](#flyout-menu) anchored to the trigger's bottom-left corner, offset 4 px below it [src: `openMenu()`] |

**CMP-26.** Axiom's split button is a *single* target: the whole button opens the flyout. It MUST NOT be divided into a default-action half and a chevron half. A divided split button requires a defensible default action, and neither of these commands has one.

### Sizing

Trigger sizing is the default button variant. The chevron is 14 × 14 (`.icon--sm`), rotated 90°. The flyout is offset `trigger.left, trigger.bottom + 4px` [src: `wire()`].

### States

| State | Treatment |
|---|---|
| Default, Hover, Pressed, Focus, Disabled | As the default button variant |
| Selected / open | While the flyout is open the trigger takes `--layer-selected` and `aria-expanded="true"` [src: `.btn[aria-expanded="true"]`] |
| Loading | Not applicable; the trigger only opens a menu |
| Empty | Not applicable; a split button with no items MUST NOT be rendered |
| Error | Not applicable |

**CMP-27.** Clicking an open trigger MUST close the flyout rather than reopening it. The reference build records whether the flyout was closed before closing all flyouts, and reopens only if it was [src: `wire()`].

**CMP-28.** Opening any flyout MUST close every other flyout first [src: `closeMenus()`].

### Keyboard

Enter or Space opens the flyout. Escape closes it and returns focus to the trigger. Arrow Down MUST move focus into the first item. **Status:** arrow-key navigation within the flyout is specified, not implemented in the reference build.

### Accessibility

`aria-haspopup="menu"`, `aria-expanded` maintained in both directions [src: `wire()`, `closeMenus()`].

### Content rules

**CMP-29.** A flyout opened from a split button MUST begin with a group label that states what the choices are, and MAY end with an explanatory label giving the consequence of choosing. Both reference flyouts do exactly this [src: dataset flyout, export flyout].

---

## Text field

### Purpose

Single-line text entry. Used for the global search, the hierarchy filter, the individuals filter and the dialog form fields.

### Anatomy

| Part | Description |
|---|---|
| **Box** | The bordered container, which is also the input [src: `.field`] |
| **Value or placeholder** | The text content |
| **Bottom accent rule** | The 2 px bottom border that carries the focus signal |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Height | `--h-control` | 28 px |
| Horizontal padding | `--sp-2` | 8 px |
| Border, sides and top | `--stroke-strong` | 1 px |
| Border, bottom | `--stroke-strong` | 2 px [src: `.field`] |
| Radius | `--r-control` | 4 px |
| Ground | `--surface` | |
| Font | `--fs-body` | 14 px, inherited family |

**CMP-30.** The bottom border MUST be 2 px in every state, including at rest. Only its colour changes on focus. A field whose border grows on focus shifts its own text by a pixel, which is visible and irritating at this density [src: `.field`, `.field:focus`].

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover | Ground becomes `--surface-alt` [src: `.field:hover`] |
| Pressed | Not applicable; a text field has no pressed state |
| Focus | The outward focus ring is suppressed; the bottom border becomes `--accent` at unchanged width [src: `.field:focus`, `.field:focus-visible`] |
| Selected | Not applicable to the control. Selected *text* uses `--accent` ground with `--text-on-accent` [src: `::selection`] |
| Disabled | **Status:** specified, not implemented in the reference build. A disabled field MUST take `--text-disabled` for its value, `--stroke` for its border, and MUST leave the tab order |
| Read-only | **Status:** specified, not implemented in the reference build. A read-only field MUST keep `--text` for its value, drop its border to `--stroke`, and remain focusable and selectable |
| Loading | Not applicable |
| Empty | The placeholder shows in `--text-secondary`. The placeholder is a hint, never a label |
| Error | Inside a form row marked invalid, both the side border and the bottom border become `--danger`, and the row's error message becomes visible [src: `.formrow.is-invalid .field`] |

### Keyboard

Standard text editing. Escape in a search field closes the suggestion flyout and blurs the field [src: `wireGlobalSearch()`]. `Ctrl+F` from anywhere focuses and selects the global search [src: `wire()`].

### Accessibility

**CMP-31.** Every field MUST have an accessible name. A field with a visible label MUST be associated with it; a field without one MUST carry an explicit label — the global search and the two filter fields all do [src: `#globalSearch`, `#treeSearch`, `#fSearch`].

**CMP-32.** A field with an inline error MUST reference its error message by a describedby relationship, and the message MUST be an alert region [src: `newClassDialog()`].

### Content rules

**CMP-33.** Placeholders MUST describe what to type, not restate the label: "Search entities (Ctrl+F)", "Filter hierarchy", "Filter individuals", "e.g. TruffleTopping" [src: `#globalSearch`, `#treeSearch`, `#fSearch`, `newClassDialog()`].

**CMP-34.** A placeholder MUST NOT be the only label.

**CMP-35.** Filter and search fields MUST debounce their input before doing work — 140 ms for the hierarchy filter, 160 ms for the individuals filter [src: `wire()`]. A field that filters a 100,000-row table on every keystroke is a defect.

---

## Search field

### Purpose

A text field with a leading magnifier glyph and, for the global instance, a results flyout. Three instances exist: the global search on the command bar, the hierarchy filter in the tree toolbar, and the individuals filter in the filter bar.

### Anatomy

| Part | Description |
|---|---|
| **Wrapper** | A relatively positioned flex box [src: `.search`] |
| **Magnifier** | A 14 × 14 `i-search` glyph in `--text-secondary`, absolutely positioned 8 px from the leading edge, non-interactive [src: `.search svg`] |
| **Field** | A text field with its leading padding increased to 28 px to clear the glyph [src: `.search .field`] |
| **Results flyout** | Global search only; a [Flyout menu](#flyout-menu) of at most 10 hits [src: `wireGlobalSearch()`] |

### Sizing

Field sizing as [Text field](#text-field), with leading padding 28 px. The global instance is 260 px wide; the hierarchy filter fills its toolbar; the individuals filter is 200 px [src: `#globalSearch`, `#treeSearch`, `#fSearch`]. The results flyout has a minimum width of 320 px and is positioned at the field's left edge, 4 px below its bottom [src: `wireGlobalSearch()`].

### States

| State | Treatment |
|---|---|
| Default, Hover, Focus, Disabled, Error | As [Text field](#text-field) |
| Pressed | Not applicable |
| Selected | Not applicable |
| Loading | Not applicable. Search runs synchronously against the **Store** index and is capped at 10 hits, so a loading state cannot be reached [src: `searchEntities()`] |
| Empty — no query | The flyout is hidden. A query shorter than two characters MUST NOT open the flyout [src: `wireGlobalSearch()`] |
| Empty — no results | The flyout opens containing a single label: `No entity matches "<query>"` [src: `wireGlobalSearch()`] |
| Error | Not applicable |

### Keyboard

| Key | Action |
|---|---|
| `Ctrl+F` | Focus and select the global search from anywhere [src: `wire()`] |
| `Enter` | Activate the first result, selecting and revealing the **Entity** [src: `wireGlobalSearch()`] |
| `Escape` | Close the flyout and blur the field [src: `wireGlobalSearch()`] |
| `Arrow Down` / `Arrow Up` | Move through results. **Status:** specified, not implemented in the reference build |

### Accessibility

**CMP-36.** The magnifier MUST be hidden from assistive technology and MUST be non-interactive, so a click anywhere in the field lands in the text [src: `.search svg`].

**CMP-37.** The results flyout MUST be announced. **Status:** specified, not implemented in the reference build — the field MUST expose a combobox relationship to the flyout and MUST announce the result count on each change.

### Content rules

**CMP-38.** Each result row MUST carry the **Entity** kind glyph in the kind's colour, the display name, and the kind's label as a trailing hint [src: `wireGlobalSearch()`]. The trailing hint uses the keyboard-hint part, because it occupies the same slot and the same treatment.

**CMP-39.** Search MUST cover both **TBox** entities and **ABox** **Individual**s, **TBox** first, and MUST match an **Individual** on either its local name or its order reference [src: `searchEntities()`].

---

## Select field

### Purpose

Choice from a short, fixed list. Used for the **Layout mode**, the **Eviction** mode, the type and branch filters, and dialog form choices.

### Anatomy

| Part | Description |
|---|---|
| **Box** | The same box as a [Text field](#text-field) [src: `select.field`] |
| **Value** | The selected option's label |
| **Expander** | The platform's own disclosure glyph |
| **List** | The platform's own popup |

### Sizing

As [Text field](#text-field), with trailing padding reduced to `--sp-1` (4 px) to sit closer to the platform expander [src: `select.field`]. Widths are set per instance: 146 px for the **Layout mode**, 100 % for the **Eviction** mode, a 170 px minimum for the type filter, a 140 px minimum for the branch filter [src: `#gLayoutMode`, `#evictMode`, `#fType`, `#fBranch`].

### States

| State | Treatment |
|---|---|
| Default, Hover, Focus, Disabled, Error | As [Text field](#text-field) |
| Pressed | The platform's own; MUST NOT be restyled |
| Selected | Not applicable to the control; the selected option is the value |
| Loading | Not applicable |
| Empty | A select MUST always have a selected option. Where "no filter" is meaningful, the first option MUST express it explicitly and MUST carry a count: "All types (12,000)", "All branches" [src: `populateFilterOptions()`] |
| Error | As [Text field](#text-field) |

### Keyboard

Platform standard: Space or Alt+Down opens, arrows move, Enter commits, Escape cancels.

### Accessibility

**CMP-40.** A select without a visible label MUST carry an explicit accessible name [src: `#fType`, `#fBranch`], and a select whose label is visually hidden MUST be associated with it by a label relationship [src: `#gLayoutMode`].

### Content rules

**CMP-41.** Option labels MUST state the outcome, not the mechanism: "Evict by distance, then degree", "Evict least recently touched", "Refuse and warn" [src: `#evictMode`].

**CMP-42.** A select MUST NOT exceed roughly a dozen options. Beyond that, use a search field with a results flyout.

**CMP-43.** A filter select's options MUST carry the count each option would yield, so the user can predict the result before committing [src: `populateFilterOptions()`].

---

## Chip

### Purpose

A small, non-interactive label carrying a count, a category or a status. Chips state facts; they are never buttons.

### Anatomy

| Part | Description |
|---|---|
| **Container** | A pill with a border [src: `.chip`] |
| **Status dot** | Optional leading 8 px circle [src: `.badge-dot`] |
| **Label** | 12 px text |

### Sizing

| Metric | Value |
|---|---|
| Height | 22 px [src: `.chip`] |
| Horizontal padding | `--sp-2` (8 px) |
| Radius | 11 px, i.e. a full pill at this height |
| Internal gap | 6 px |
| Border | 1 px `--stroke` |
| Ground | `--surface-alt` |
| Text | `--fs-caption`, `--text-secondary` |
| Dot | 8 × 8 px, fully round, never flexible [src: `.badge-dot`] |

### Variant: accent chip

Ground `--accent-subtle`, border `--accent-border`, text `--accent` [src: `.chip--accent`]. **Status:** defined and unused in the reference build. It is reserved for a chip that reports a state the user changed — an active filter, for example — as against the neutral chip, which reports a fact about the data.

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, Pressed, Focus, Selected, Disabled | Not applicable. A chip is not interactive and MUST NOT be given interactive states. A clickable pill is a button, and MUST use the button component |
| Loading | Not applicable |
| Empty | Not applicable; a chip with no content MUST NOT be rendered |
| Error | Not applicable |

### Keyboard

Not focusable.

### Accessibility

**CMP-44.** A chip whose content changes — the row count, for example — MUST NOT be a live region on its own. The [Status bar](#status-bar) and the [Toast](#toast) carry announcements (DS-110).

**CMP-45.** A status dot MUST never be the only carrier of meaning; it MUST always sit beside text in the same chip [src: `renderInspector()`, `renderLegend()`].

### Content rules

**CMP-46.** Chip text MUST be short — ideally two or three words. Reference examples: "0 rows", "generated demo data", "from Margherita", "Basic graph patterns · FILTER · LIMIT" [src: `#tblCount`, `renderInspector()`, SPARQL bar].

**CMP-47.** A chip carrying a count MUST pluralise correctly: "1 row", "12,000 rows" [src: `applyFilters()`].

**CMP-48.** Numbers in chips MUST be formatted with locale thousands separators [src: `fmt()`].

---

## Status dot

### Purpose

An 8 px filled circle that colours a chip, a legend item or a status line to a category or state.

### Anatomy and sizing

A single part: an 8 × 8 px circle with a 50 % radius, never flexible, filled by an inline colour supplied by the caller [src: `.badge-dot`].

### States

Not applicable. The dot has no interaction states; it only takes different fills.

Fills in the reference build: the **Entity** kind colour, in the **Inspector** kind chip [src: `renderInspector()`]; `--warn`, in the legend's **Pin** entry [src: `renderLegend()`].

### Accessibility

Decorative. The dot MUST be accompanied by text (CMP-45) and MUST NOT be exposed to assistive technology.

### Content rules

**CMP-49.** The dot's fill MUST come from a token. The inline colour is a token reference, not a literal, and the token MUST be one already defined for the meaning being expressed.

---

## Panel

### Purpose

A titled, bordered region of the workspace with a fixed header and an independently scrolling body. The hierarchy panel and the **Inspector** panel are both panels.

### Anatomy

| Part | Description |
|---|---|
| **Container** | A two-row grid — header, then flexible body — on `--surface`, clipping overflow [src: `.panel`] |
| **Header** | A 32 px band with a bottom hairline [src: `.panel__head`] |
| **Title** | 12 px semibold uppercase with 0.02em tracking in `--text-secondary` [src: `.panel__title`] |
| **Header actions** | Optional trailing icon-only buttons [src: `#inspRename`, `#inspGraph`] |
| **Tab strip** | Optional; a header may host a [Tab strip](#tab-strip) instead of a title [src: `#leftPanel`] |
| **Toolbar** | Optional secondary band inside the body, above the scrolling content [src: `.panel__toolbar`] |
| **Body** | The scrolling region [src: `.panel__body`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Header height | `--h-row` | 32 px |
| Header padding | — | 0 `--sp-2` 0 `--sp-3` — 12 px leading, 8 px trailing [src: `.panel__head`] |
| Header gap | `--sp-2` | 8 px |
| Header bottom border | `--stroke-divider` | 1 px |
| Toolbar padding | `--sp-2` | 8 px on all sides [src: `.panel__toolbar`] |
| Toolbar gap | `--sp-1` | 4 px |
| Toolbar bottom border | `--stroke-divider` | 1 px |
| Panel ground | `--surface` | |

**CMP-50.** The header's leading inset (12 px) is larger than its trailing inset (8 px). Text needs the larger inset; a trailing icon-only button, which already carries its own padding, does not [src: `.panel__head`].

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, Pressed, Focus, Selected | Not applicable to the panel; its contents own these |
| Disabled | Not applicable |
| Loading | **Status:** specified, not implemented in the reference build. A panel awaiting data MUST show three to five [Skeleton](#skeleton) bars in its body at the body's natural row rhythm |
| Empty | The body shows an [Empty state block](#empty-state-block). The header, including its title and its actions, MUST remain [src: `renderTree()`, `renderInspector()`] |
| Error | **Status:** specified, not implemented in the reference build. A panel whose data failed to load MUST show an empty state block whose heading names the failure and whose action retries |
| **Collapsed** | The panel's grid track collapses to 0 and the panel is not rendered. Its splitter track remains [src: `.workspace.is-left-collapsed`] |

### Keyboard

The panel body is the tab stop for its scrolling content [src: `#treePane`]. Header actions are individually reachable.

### Accessibility

**CMP-51.** Each panel MUST be a landmark region with an accessible name — "Ontology hierarchy", "Entity inspector" [src: `#leftPanel`, `#rightPanel`].

**CMP-52.** The panel title MUST NOT be marked as a heading. It is a chrome label, and a screen-reader heading list full of chrome labels is noise.

### Content rules

**CMP-53.** A panel title MUST be one or two words and MUST be a noun: "Entity", "Classes", "Properties" [src: `#rightPanel`, `#tabClasses`].

**CMP-54.** A panel MUST have at most two header actions. More belongs in the toolbar.

**CMP-55.** The panel body MUST be the only scrolling region within the panel. Nested scroll regions inside a 280 px column are a defect.

---

## Tab strip

### Purpose

Switches a single region between two or more views of comparable importance. Two instances exist: Classes / Properties in the hierarchy panel, and Individuals / SPARQL in the dock.

### Anatomy

| Part | Description |
|---|---|
| **Strip** | A bottom-aligned flex row [src: `.tabstrip`] |
| **Tab** | A borderless button with top corners rounded [src: `.tab`] |
| **Leading icon** | Optional, 14 × 14 [src: `#tabIndividuals`] |
| **Label** | 14 px text |
| **Count suffix** | Optional 12 px count in `--text-secondary` at weight 400 [src: `.tab .count`] |
| **Selected indicator** | A 2 px accent rule along the tab's bottom edge, inset `--sp-3` from each side, with a 1 px radius [src: `.tab[aria-selected="true"]::after`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Tab height | `--h-row` | 32 px |
| Tab horizontal padding | `--sp-3` | 12 px |
| Gap between tabs | — | 2 px [src: `.tabstrip`] |
| Internal gap | — | 6 px [src: `.tab`] |
| Radius | `--r-control` | 4 px, top corners only |
| Indicator | — | 2 px tall, inset 12 px each side, 1 px radius |
| Label | `--fs-body` | 14 px |
| Count | `--fs-caption` | 12 px, weight 400 |

**CMP-56.** The selected indicator MUST be inset from the tab's edges by the same 12 px as the tab's padding, so that it aligns with the label rather than with the tab's hit area [src: `.tab[aria-selected="true"]::after`].

### States

| State | Treatment |
|---|---|
| Default | Transparent ground, label `--text-secondary` [src: `.tab`] |
| Hover | Ground `--layer-hover`, label rises to `--text` — increasing contrast, never decreasing it (DS-126) [src: `.tab:hover`] |
| Pressed | **Status:** specified, not implemented in the reference build. A pressed tab MUST take `--layer-pressed` |
| Focus | The standard focus ring |
| Selected | Label `--text` at weight 600; the accent indicator appears. The ground does *not* change [src: `.tab[aria-selected="true"]`] |
| Disabled | **Status:** specified, not implemented in the reference build. A disabled tab MUST take `--text-disabled` and leave the tab order. A tab that cannot be selected SHOULD be removed rather than disabled |
| Loading | Not applicable; tab switching is synchronous [src: `tabPair()`] |
| Empty | Not applicable to the tab. A tab whose panel has no content MUST still be selectable, and the panel MUST show an [Empty state block](#empty-state-block) |
| Error | Not applicable |

**CMP-57.** The count suffix MUST stay at weight 400 even when the tab is selected, so that selection emphasis falls on the label and not on the number [src: `.tab .count`].

### Keyboard

Reachable by Tab; activated by Space or Enter. **Status:** arrow-key movement within the strip, with automatic selection, is specified and not implemented in the reference build; it MUST be added, and only the selected tab MUST remain in the tab order.

### Accessibility

Role `tablist` on the strip with an accessible name; role `tab` on each tab with `aria-selected` and `aria-controls`; role `tabpanel` on each panel with `aria-labelledby` [src: hierarchy and dock markup].

**CMP-58.** `aria-selected` MUST be updated on both the newly selected and the deselected tab in the same operation [src: `tabPair()`].

### Content rules

**CMP-59.** A tab label MUST be a plural noun naming the content: "Classes", "Properties", "Individuals". "SPARQL" is a proper noun and is the documented exception [src: dock markup].

**CMP-60.** A count suffix MUST be present where the count is knowable and meaningful, and MUST be formatted with locale thousands separators [src: `renderTree()`, `applyFilters()`].

**CMP-61.** A strip MUST carry at least two and at most five tabs. A single tab is a title.

---

## Splitter

### Purpose

Lets the user re-proportion the workspace by dragging the boundary between two regions. Three instances exist: between the hierarchy panel and the graph, between the graph and the **Inspector**, and between the workspace and the dock.

### Anatomy

| Part | Description |
|---|---|
| **Track** | A 1 px line in `--stroke` occupying its own grid track [src: `.splitter`] |
| **Hit area** | A transparent pseudo-element bleeding 3 px beyond the track on both sides, giving a 7 px target [src: `.splitter::after`] |

### Sizing

| Metric | Vertical splitter | Horizontal splitter |
|---|---|---|
| Track | 1 px wide, full height | 1 px tall, full width [src: `.splitter--h`] |
| Hit area | `inset: 0 -3px` — 7 px total | `inset: -3px 0` — 7 px total [src: `.splitter--h::after`] |
| Cursor | column resize | row resize |

### Bounds

| Splitter | Token written | Minimum | Maximum |
|---|---|---|---|
| Left | `--w-left` | 180 px | 520 px [src: `wireSplitter()`] |
| Right | `--w-right` | 240 px | 560 px [src: `wireSplitter()`] |
| Dock | `--h-dock` | 120 px | window height − 260 px [src: `wireSplitter()`] |

**CMP-62.** Bounds MUST be enforced during the drag, by clamping the computed value, not after it. A drag that overshoots and snaps back is a defect [src: `wireSplitter()`].

**CMP-63.** The dock splitter's maximum MUST account for the status bar's 26 px when converting a pointer position into a height [src: `wireSplitter()`].

### States

| State | Treatment |
|---|---|
| Default | Track `--stroke` |
| Hover | Track `--accent` [src: `.splitter:hover`] |
| Pressed / dragging | Track `--accent`, held for the whole drag by a dragging modifier so that the highlight does not flicker when the pointer leaves the 7 px hit area [src: `.splitter.is-dragging`, `wireSplitter()`] |
| Focus | The standard focus ring |
| Selected, Disabled, Loading, Empty, Error | Not applicable |

**CMP-64.** The drag MUST capture the pointer, so that a fast drag outside the splitter continues to resize [src: `wireSplitter()`].

**CMP-65.** On drag end the implementation MUST re-measure the graph canvas and re-fit the **Viewport**; the canvas is device-pixel sized and does not resize itself [src: `wireSplitter()`].

### Keyboard

**Status:** specified, not implemented in the reference build. The splitter is focusable and carries a separator role, but has no key handler. Required behaviour (DS-106): Left/Right (vertical) or Up/Down (horizontal) move by 4 px; with a modifier, by 40 px; Home and End move to the minimum and maximum bound.

### Accessibility

Role `separator`, `aria-orientation`, and an accessible name stating what it resizes: "Resize hierarchy panel", "Resize inspector panel", "Resize bottom dock" [src: `#splitLeft`, `#splitRight`, `#splitDock`].

**CMP-66.** A focusable splitter MUST also expose `aria-valuenow`, `aria-valuemin` and `aria-valuemax` in pixels. **Status:** specified, not implemented in the reference build.

### Content rules

The splitter has no content. It MUST NOT carry a grip glyph, dots, or any other ornament; the hover colour change is the affordance.

---

## Tree row

### Purpose

One node of the class or property hierarchy: an expander, a kind glyph, a name, and an optional instance count.

### Anatomy

| Part | Description |
|---|---|
| **Row** | The full-width interactive container [src: `.tree__row`] |
| **Expander (twisty)** | A 16 × 16 borderless button carrying a 14 × 14 chevron [src: `.tree__twisty`] |
| **Kind icon** | A 14 × 14 **Entity** glyph, tinted with the kind's colour token [src: `.tree__icon`] |
| **Label** | The **Entity**'s display name, filling the remaining width and truncating [src: `.tree__label`] |
| **Count** | An optional trailing 12 px count of direct instances [src: `.tree__meta`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Height | `--h-tree-row` | 24 px |
| Internal gap | — | 6 px [src: `.tree__row`] |
| Trailing padding | `--sp-2` | 8 px |
| Leading padding | — | `4 + depth × 14` px [src: `renderTree()`] |
| Horizontal margin | `--sp-1` | 4 px each side, so the row's fill inset matches the panel's rhythm |
| Radius | `--r-control` | 4 px |
| Expander | — | 16 × 16 px |
| Kind icon | `.icon--sm` | 14 × 14 px |
| Count | `--fs-caption` | 12 px, `--text-secondary` |
| Tree container padding | — | `--sp-1` top, `--sp-6` bottom [src: `.tree`] |

**CMP-67.** The tree's generous 24 px bottom padding exists so that the last row can be scrolled clear of the panel edge and remains comfortably clickable [src: `.tree`].

### States

| State | Treatment |
|---|---|
| Default | Transparent ground, label `--text` |
| Hover | Ground `--layer-hover` [src: `.tree__row:hover`] |
| Pressed | **Status:** specified, not implemented in the reference build. A pressed row MUST take `--layer-pressed` |
| Focus | The standard focus ring, drawn on the row |
| Selected | Ground `--layer-selected`; label rises to weight 600; the count rises from `--text-secondary` to `--text` [src: `.tree__row.is-selected`] |
| Filter match | The label's own box takes an `--accent-subtle` ground with a 2 px radius — highlighting the text, not the row [src: `.tree__row.is-match`] |
| Disabled | Not applicable; every node in the hierarchy is selectable |
| Loading | Not applicable; the tree renders synchronously from the **Store** |
| Empty | Not applicable to the row. An empty tree shows an [Empty state block](#empty-state-block) in place of all rows [src: `renderTree()`] |
| Error | Not applicable |
| **Renaming** | The label is replaced in place by an [Inline rename input](#inline-rename-input) [src: `beginRename()`] |

**CMP-68.** The selected and match states MUST be visually distinguishable and MUST compose. A row can be both, and the reference build expresses selection on the row's ground and match on the label's ground precisely so that both remain readable [src: `.tree__row.is-selected`, `.tree__row.is-match`].

### Expander states

| State | Treatment |
|---|---|
| Collapsed | Chevron pointing right |
| Expanded | Chevron rotated 90°, transitioning `transform` over `--dur-fast` with `--ease-out` [src: `.tree__twisty.is-open`] |
| Leaf | The expander is made invisible but retains its 16 px of layout, so that labels at the same depth align whether or not they have children [src: `.tree__twisty.is-leaf`] |

**CMP-69.** A leaf's expander MUST occupy its space. Removing it shifts leaf labels 22 px left of their siblings, and the eye reads that as a different depth.

### Keyboard

| Key | Action |
|---|---|
| `Arrow Down` / `Arrow Up` | Move selection to the next or previous visible row, scrolling it minimally into view [src: `wire()`] |
| `Arrow Right` | Expand the selected node [src: `wire()`] |
| `Arrow Left` | Collapse the selected node [src: `wire()`] |
| `Enter` | Select the node and reveal it in the graph [src: `wire()`] |
| `F2` | Begin inline rename [src: `wire()`] |
| `Delete` | Delete the selected class, via confirmation, when it is not in the **Viewport** [src: `wire()`] |

**CMP-70.** Arrow Right on a node whose children are already expanded SHOULD move to the first child, and Arrow Left on a collapsed node SHOULD move to its parent. **Status:** specified, not implemented in the reference build.

### Pointer

Single click selects; a click on the expander toggles expansion without changing selection; double click selects and reveals in the graph [src: `wire()`].

### Accessibility

Role `treeitem`, with `aria-level` reflecting depth from 1 and `aria-expanded` present only on rows that have children [src: `renderTree()`]. The container carries role `tree` and an accessible name. Rows carry a negative tab index; the container carries the tab stop (DS-104).

**CMP-71.** The expander MUST be hidden from assistive technology, because `aria-expanded` on the row already carries the state and announcing both is redundant [src: `renderTree()`].

### Content rules

**CMP-72.** The label MUST be the **Entity**'s display name, never its IRI. The IRI belongs in the [Inspector](#inspector-section-header).

**CMP-73.** The count MUST be shown only when it is non-zero, MUST count direct instances, and MUST be formatted with locale thousands separators [src: `renderTree()`].

**CMP-74.** The label MUST truncate with an ellipsis; the count MUST NOT shrink or wrap [src: `.tree__label`, `.tree__meta`].

---

## Inline rename input

### Purpose

Renames an **Entity** in place, replacing the tree row's label without opening a dialog.

### Anatomy

A single part: a text input that replaces the label element in the row's flow and fills the remaining width [src: `beginRename()`].

### Sizing

| Metric | Value |
|---|---|
| Height | 20 px [src: `.rename-input`] |
| Horizontal padding | 4 px |
| Minimum width | 60 px |
| Border | 1 px `--accent` |
| Radius | 2 px |
| Ground | `--surface` |
| Text | `--fs-body` in the inherited family, colour `--text` |

**CMP-75.** The input's 20 px height is 4 px shorter than the 24 px tree row so that it sits inside the row without changing the row's height and without shifting the rows below it [src: `.rename-input`, `--h-tree-row`].

### States

| State | Treatment |
|---|---|
| Default | As above, mounted with its full text selected so that typing replaces the name [src: `beginRename()`] |
| Hover | Not applicable; the input exists only while focused |
| Pressed | Not applicable |
| Focus | Focus is moved to the input on mount. The accent border *is* the focus treatment; no additional ring is drawn |
| Selected | Not applicable |
| Disabled | Not applicable |
| Loading | Not applicable; validation and commit are synchronous [src: `commitRename()`] |
| Empty | An empty value is invalid; committing it raises "A name is required." [src: `validateName()`] |
| Error | The input takes the 2 px inset `--danger` ring of the invalid-cell treatment and is marked invalid, and a [Toast](#toast) states the rule [src: `commitRename()`] |

### Keyboard

| Key | Action |
|---|---|
| `Enter` | Commit. On failure the input stays open, takes the error state and raises a toast [src: `commitRename()`] |
| `Escape` | Cancel and re-render the tree, discarding the edit. The event MUST NOT propagate, so that Escape does not also close a flyout or a dialog [src: `beginRename()`] |
| Blur | Commit silently: on success the rename applies; on failure the tree re-renders with the original name and no toast [src: `commitRename()`] |

**CMP-76.** The blur path MUST be silent. A user who clicks elsewhere has abandoned the edit, and a toast about a name they are no longer typing is noise [src: `commitRename()`].

### Accessibility

**CMP-77.** The input MUST carry an accessible name naming the **Entity** being renamed — "Rename Margherita" [src: `beginRename()`] — and MUST be marked invalid when validation fails [src: `commitRename()`].

### Content rules

**CMP-78.** Validation MUST enforce, in order [src: `validateName()`]:

1. a name is required;
2. no whitespace — "Names cannot contain spaces — use CamelCase, as the rest of the ontology does";
3. it must start with a letter and contain only letters, digits, hyphen or underscore;
4. it must be unique across the **Store**, and the message MUST name the conflicting **Entity** and its shortened IRI.

**CMP-79.** Every validation message MUST state the rule and, where a format is involved, give the convention. "Invalid name" is not an acceptable message.

**CMP-80.** A successful rename MUST push an undo entry, MUST re-render the tree and the **Inspector**, and MUST update the node's label in the **Viewport** without re-laying out the graph [src: `commitRename()`].

---

## Inspector section header

### Purpose

Divides the **Inspector** into labelled groups of axioms without boxing them.

### Anatomy

| Part | Description |
|---|---|
| **Header row** | A flex row holding the title, the rule and any extra [src: `.section__head`] |
| **Title** | 12 px semibold uppercase, 0.02em tracking, `--text-secondary` [src: `.section__title`] |
| **Rule** | A 1 px `--stroke-divider` line that takes all remaining width [src: `.section__rule`] |
| **Extra** | An optional trailing element, in practice a [Chip](#chip) [src: `section()`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Space above the section | `--sp-5` | 20 px [src: `.section`] |
| Space below the header | `--sp-2` | 8 px [src: `.section__head`] |
| Header gap | `--sp-2` | 8 px |
| Rule | — | 1 px tall |
| **Inspector** padding | — | `--sp-3` top, `--sp-4` sides, `--sp-8` bottom [src: `.inspector`] |

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Error | Not applicable. The header is not interactive and is not collapsible |
| Empty | A section with no body MUST NOT be rendered at all — header, rule and space included [src: `section()`] |

**CMP-81.** The "render nothing when empty" rule is what keeps the **Inspector** honest. A class with no disjointness has no "Disjoint with" heading, so the absence of a heading is itself information [src: `section()`].

### Accessibility

**CMP-82.** Section titles SHOULD be exposed as headings so that a screen-reader user can jump between them. **Status:** specified, not implemented in the reference build — the titles are plain text.

### Content rules

**CMP-83.** Section titles MUST name the axiom relation as an ontologist would say it: "Annotations", "Equivalent to", "SubClass of", "Types", "Property assertions", "Disjoint with", "Property axioms", "Usage", "Inferred axioms", "Toppings entailed by its type", "Orders" [src: `renderInspector()`].

**CMP-84.** Sections MUST appear in a fixed order, never reordered by content. The reference order is: Annotations, Equivalent to, SubClass of, Types, Property assertions, entailment sections, Disjoint with, Property axioms, Usage, Inferred axioms [src: `renderInspector()`].

**CMP-85.** The optional trailing extra MUST qualify the section, not act on it: "from Margherita" on an entailment section [src: `renderInspector()`].

---

## Inspector entity head

### Purpose

Identifies the selected **Entity** at the top of the **Inspector**: its kind glyph, its display name, its kind chip and its full IRI.

### Anatomy

| Part | Description |
|---|---|
| **Head row** | A top-aligned flex row [src: `.inspector__head`] |
| **Kind glyph** | A 16 × 16 **Entity** icon in the kind's colour, nudged 3 px down to sit on the name's optical baseline [src: `renderInspector()`] |
| **Name** | 16 px semibold in `--font-display`, wrapping anywhere so that a long CamelCase name breaks rather than overflowing [src: `.inspector__name`] |
| **Chip cluster** | A wrapping cluster of chips: the kind chip with its status dot, plus a provenance chip where the **Entity** is generated demo data [src: `renderInspector()`] |
| **IRI line** | The full IRI in `--font-mono` at 12 px, `--text-secondary`, line-height 1.45, wrapping anywhere [src: `.inspector__iri`] |

### Sizing

| Metric | Value |
|---|---|
| Head gap | `--sp-2` (8 px) |
| Glyph nudge | 3 px down |
| Chip cluster gap | 6 px, 6 px above the cluster |
| IRI top margin | 10 px [src: `renderInspector()`] |

**CMP-86.** The IRI MUST wrap at any character rather than overflowing or truncating. An IRI is the **Entity**'s identity, and a truncated identity is useless [src: `.inspector__iri`].

**CMP-87.** The 10 px gap above the IRI and the 3 px glyph nudge are optical corrections, permitted under DS-49 as component-local constants. They MUST NOT be generalised into tokens.

### States

| State | Treatment |
|---|---|
| Default | As above |
| Empty | With no selection the whole **Inspector** body is replaced by an [Empty state block](#empty-state-block) reading "Nothing selected" [src: `renderInspector()`] |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Error | Not applicable; the head is a display element |

### Accessibility

**CMP-88.** The entity name SHOULD be the **Inspector**'s labelling heading. **Status:** specified, not implemented in the reference build.

**CMP-89.** The IRI MUST be selectable text so that a user can copy it. A copy button SHOULD be offered. **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-90.** The head MUST show the display name and the full IRI, in that order and at that relative weight. The name is for reading; the IRI is for identity.

**CMP-91.** Provenance MUST be stated where an **Entity** did not come from the source ontology: "generated demo data" [src: `renderInspector()`].

---

## Axiom row

### Purpose

One asserted axiom about the selected **Entity**: a kind prefix and a body, set in monospace, with linked **Entity** references.

### Anatomy

| Part | Description |
|---|---|
| **Row** | A top-aligned flex container [src: `.axiom`] |
| **Kind prefix** | A short, non-flexible label in `--text-secondary` naming the axiom's relation: `⊑`, `≡`, `a`, `⊥`, `rdfs:comment`, `Domain`, `Range`, `Inverse of`, `Characteristics`, `hasTopping`, `demo:priceGBP` [src: `.axiom__kind`, `axiom()`] |
| **Body** | The axiom's content, filling the remaining width and wrapping anywhere [src: `axiom()`] |
| **Entity link** | Any **Entity** reference inside the body, rendered as a shortened IRI in `--accent` [src: `entityLink()`, `.axiom a`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Padding | `--sp-1` `--sp-2` | 4 px vertical, 8 px horizontal |
| Gap | `--sp-2` | 8 px |
| Radius | `--r-control` | 4 px |
| Font | `--font-mono`, `--fs-code` | 13 px |
| Line height | — | 1.5 [src: `.axiom`] |

### States

| State | Treatment |
|---|---|
| Default | Transparent ground |
| Hover | Ground `--layer-hover` — the row is a hover target because it contains links [src: `.axiom:hover`] |
| Pressed | Not applicable to the row; the links inside it are the targets |
| Focus | Not applicable to the row; links carry the standard focus ring |
| Selected | Not applicable |
| Disabled | Not applicable |
| Loading | Not applicable; axioms render synchronously |
| Empty | Not applicable; an axiom with no body MUST NOT be rendered |
| Error | Not applicable; the **Inspector** displays asserted axioms and does not validate them |

### Entity link states

| State | Treatment |
|---|---|
| Default | `--accent`, no underline [src: `.axiom a`] |
| Hover | Underlined, colour unchanged [src: `.axiom a:hover`] |
| Focus | The standard focus ring |
| Visited | Not applicable and MUST NOT be styled. These are navigations within a document, not hyperlinks to elsewhere |

**CMP-92.** A link MUST NOT change colour on hover; it gains an underline instead (DS-126) [src: `.axiom a:hover`].

### Keyboard

Links are reachable by Tab and activated by Enter; activating one selects the referenced **Entity** [src: `wire()`].

### Accessibility

**CMP-93.** Link text MUST be the shortened IRI, which is unique and meaningful, never "here" or "link" [src: `entityLink()`].

### Content rules

**CMP-94.** The kind prefix MUST use the conventional description-logic symbol where one exists — `⊑` for subsumption, `≡` for equivalence, `⊥` for disjointness, `a` for type assertion — and the prefixed property IRI otherwise [src: `renderInspector()`].

**CMP-95.** Every **Entity** mentioned in an axiom body MUST be a link. Restriction bodies MUST link the filler *and* the property [src: `renderInspector()`].

**CMP-96.** Free-form annotation values MUST be set in `--font-ui`, overriding the row's monospace, because they are prose (DS-44) [src: `renderInspector()`].

**CMP-97.** Values with units MUST NOT be allowed to break across lines: the price is wrapped in a no-wrap element [src: `renderInspector()`].

---

## Inferred-axiom row

### Purpose

Distinguishes an axiom produced by a reasoner from an axiom asserted in the source.

### Anatomy

An [Axiom row](#axiom-row) with two additions: a 2 px left rule in `--e-defined`, and a persistent `--layer-hover` ground [src: `.axiom--inferred`].

### Sizing

As the axiom row, plus a 2 px left border.

### States

As the axiom row. The hover state composes: the persistent ground and the hover ground are the same value, so a hovered inferred row looks identical to a resting one. **CMP-98.** This is a defect. An inferred row MUST have a hover state distinguishable from its resting state — the resting ground SHOULD be reduced, or the hover ground deepened to `--layer-pressed`. **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-99.** Inferred axioms MUST use the amber `--e-defined` rule, and the **Inspector**'s "Inferred axioms" section MUST explain that convention in its note: "inferred axioms would appear here, marked with the amber rule, once a reasoner is attached" [src: `renderInspector()`].

**CMP-100.** An inferred axiom MUST NOT be editable, and MUST NOT be presented in a way that suggests it is stored.

**Status:** specified, not implemented in the reference build — no reasoner runs, so no inferred row is ever rendered. The style exists so that the convention is fixed before the feature lands.

---

## Key-value list

### Purpose

A compact two-column list of derived facts. Used by the **Inspector**'s "Usage" section.

### Anatomy

| Part | Description |
|---|---|
| **List** | A two-column grid, a fixed-width key column and a flexible value column [src: `.kv`] |
| **Key** | 12 px `--text-secondary` [src: `.kv dt`] |
| **Value** | Body text, wrapping anywhere [src: `.kv dd`] |

### Sizing

| Metric | Value |
|---|---|
| Key column | 104 px fixed [src: `.kv`] |
| Value column | flexible, minimum 0 |
| Row gap | `--sp-1` (4 px) |
| Column gap | `--sp-3` (12 px) |
| Alignment | baseline, so a 12 px key sits on the same baseline as a 14 px value |

**CMP-101.** Baseline alignment is required. Centre alignment across two different type sizes looks misaligned at 4 px row gaps [src: `.kv`].

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Error | Not applicable; the list is a display element |
| Empty | A key with no value MUST still render its row, showing an explicit zero or an em dash. Omitting the row would make the list's shape depend on the data |

### Accessibility

**CMP-102.** The list MUST use description-list semantics so that each value is programmatically associated with its key [src: `.kv`].

### Content rules

**CMP-103.** Keys MUST be one or two words and MUST NOT end in a colon; the grid provides the separation [src: `renderInspector()`].

**CMP-104.** Numeric values MUST be formatted with locale thousands separators [src: `fmt()`].

**CMP-105.** A key longer than the 104 px column is a key that needs rewriting, not a wider column.

---

## Note block

### Purpose

A quiet inline explanation, distinguished from content by a dashed border so that it reads as commentary rather than as data.

### Anatomy

| Part | Description |
|---|---|
| **Container** | A top-aligned flex row with a dashed border [src: `.note`] |
| **Icon** | A 14 × 14 `i-info` glyph, never flexible, nudged 2 px down onto the first line's optical centre [src: `.note svg`] |
| **Text** | 12 px `--text-secondary` |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Padding | `--sp-2` `--sp-3` | 8 px vertical, 12 px horizontal |
| Gap | `--sp-2` | 8 px |
| Border | — | 1 px dashed `--stroke-strong` |
| Radius | `--r-control` | 4 px |
| Ground | `--surface-alt` | |
| Text | `--fs-caption` | 12 px, `--text-secondary` |
| Icon nudge | — | 2 px down |

**CMP-106.** The border MUST be dashed. The dash is the entire signal that this block is commentary and not an axiom; a solid border would make it look like a data card [src: `.note`].

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Empty, Error | Not applicable; the block is static and is rendered only when it has content |

### Accessibility

The icon is decorative and hidden. The text is read normally.

### Content rules

**CMP-107.** A note MUST explain a limit, a consequence or an absence — never an instruction to click something. Reference notes: "12 generated orders reference this customer. Expand the node in the graph to page them in under the viewport budget"; "No reasoner has run. This prototype shows asserted axioms only…" [src: `renderInspector()`].

**CMP-108.** A note MUST be at most three sentences.

**CMP-109.** A note MUST NOT contain a primary action. If the user must do something, that belongs in an [Empty state block](#empty-state-block) or beside the content it acts on.

---

## Virtualised table

### Purpose

Displays an arbitrarily large row set at constant cost by rendering only the rows in view plus a small overscan. Two instances exist: the **Individual**s table and the SPARQL [Result grid](#result-grid).

### Anatomy

| Part | Description |
|---|---|
| **Table** | A two-row grid — header, then flexible viewport [src: `.tbl`] |
| **Header** | A sticky grid row of header cells [src: `.tbl__head`] |
| **Header cell** | A borderless button carrying a label and an optional sort mark [src: `.tbl__hcell`] |
| **Sort mark** | An arrow glyph in `--accent` [src: `.sortmark`] |
| **Viewport** | The scrolling region [src: `.tbl__viewport`] |
| **Spacer** | A block whose height equals `rowCount × rowHeight`, giving the scrollbar the right length [src: `.tbl__spacer`] |
| **Row host** | An absolutely positioned container translated to the first rendered row's offset [src: `.tbl__rows`] |
| **Row** | A grid row [src: `.tbl__row`] |
| **Cell** | A single column's content [src: `.tbl__cell`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Header cell height | `--h-row` | 32 px |
| Row height | `--h-row` | 32 px, and the virtualisation unit [src: `ROW_H`] |
| Cell padding | `--sp-3` | 12 px each side |
| Cell gap | — | 6 px |
| Header cell gap | — | 4 px |
| Header font | `--fs-caption` | 12 px, weight 600, `--text-secondary`, uppercase by content not by transform |
| Header ground | `--surface-alt` | |
| Header bottom border | `--stroke` | 1 px |
| Header cell trailing border | `--stroke-divider` | 1 px |
| Row bottom border | `--stroke-divider` | 1 px |
| Column template | `--cols` | Set once on the header, once on the row host, and restated on each row [src: `renderTableRows()`] |

**CMP-110.** The header MUST be sticky at the top of the viewport at stacking index 2 [src: `.tbl__head`].

**CMP-111.** Virtualisation MUST render the visible window plus six rows above and twelve rows of total overscan, and MUST position the row host by transform, never by changing its offset properties (DS-58) [src: `renderTableRows()`].

**CMP-112.** Any change of filter, sort or query MUST reset the viewport's scroll position to the top [src: `wire()`, `runQuery()`].

### Header cell states

| State | Treatment |
|---|---|
| Default | `--surface-alt` ground, `--text-secondary` label |
| Hover | Ground `--layer-hover`, label rises to `--text` [src: `.tbl__hcell:hover`] |
| Pressed | **Status:** specified, not implemented in the reference build. MUST take `--layer-pressed` |
| Focus | The standard focus ring |
| Sorted | The sort mark appears in `--accent`: an upward arrow ascending, a downward arrow descending [src: `renderTableHead()`] |
| Disabled | Applies to a column that cannot be sorted. **Status:** specified, not implemented in the reference build — every reference column is sortable |
| Loading, Empty, Error | Not applicable |

**CMP-113.** Clicking a sorted column MUST reverse its direction; clicking an unsorted column MUST sort it ascending [src: `wire()`].

**CMP-114.** The header cell's label MUST truncate with an ellipsis rather than wrap [src: `.tbl__hcell`].

### Row states

| State | Treatment |
|---|---|
| Default | Transparent ground [src: `.tbl__row`] |
| Hover | Ground `--layer-hover` [src: `.tbl__row:hover`] |
| Pressed | **Status:** specified, not implemented in the reference build |
| Focus | The viewport carries the tab stop; individual editable cells are focusable [src: `renderTableRows()`] |
| Selected | Ground `--layer-selected`, driven by the global selection, so selecting an **Entity** anywhere highlights its row here [src: `.tbl__row.is-selected`, `renderTableRows()`] |
| Disabled | Not applicable |
| Loading | Not applicable; the table renders from an in-memory array. Regeneration replaces the whole dataset and is reported by [Toast](#toast) [src: `regenerate()`] |
| Empty | With no rows the row host is replaced by an [Empty state block](#empty-state-block), and the host's transform is reset so the block is not translated off screen [src: `renderTableRows()`] |
| Error | Not applicable to the row; errors are per-cell |

**CMP-115.** Single click selects the row; double click selects and reveals the **Individual** in the graph [src: `wire()`].

### Cell variants

| Variant | Treatment |
|---|---|
| Default | Flex row, 12 px padding, 6 px gap, truncating with an ellipsis [src: `.tbl__cell`] |
| Numeric | Right-aligned, `--font-mono` at `--fs-code` [src: `.tbl__cell--num`] |
| Mono | Left-aligned but set in `--font-mono` at `--fs-code`, for identifier-like columns such as the order reference [src: `COLS`] |
| Editable | Text cursor; on hover a 1 px inset ring in `--stroke-strong` with a 2 px radius [src: `.tbl__cell--edit`] |
| Icon | Carries a leading 14 × 14 **Entity** glyph in its kind colour, as the individual column does [src: `renderTableRows()`] |
| Link | Carries an accent-coloured link that selects and reveals the referenced **Entity**, as the [Result grid](#result-grid) does [src: `renderQueryResults()`] |

**CMP-116.** The editable affordance MUST be an inset ring rather than a border, so that it appears without changing the cell's box or shifting its text [src: `.tbl__cell--edit:hover`].

**CMP-117.** An editable cell MUST be individually focusable and MUST announce its editability in its accessible name (DS-99) [src: `renderTableRows()`].

**CMP-118.** Cell content MUST truncate with an ellipsis. A table cell MUST NOT wrap [src: `.tbl__cell`, `.od-truncate`].

### Cell editor

| Part | Description |
|---|---|
| **Input** | A text input or a select, replacing the cell's content in place [src: `beginCellEdit()`] |

| Metric | Value |
|---|---|
| Width | 100 % of the cell |
| Height | 22 px [src: `.cell-input`] |
| Padding | 4 px horizontal |
| Border | 1 px `--accent` |
| Radius | 2 px |
| Ground | `--surface`, text `--text` |

| State | Treatment |
|---|---|
| Default | Mounted focused with its content selected. A select editor is populated from the column's permitted values [src: `beginCellEdit()`] |
| Focus | The accent border is the focus treatment |
| Invalid | The *cell*, not the editor, takes a 2 px inset `--danger` ring; the previous value is restored; a [Toast](#toast) states the rule; the ring clears after 1,800 ms [src: `beginCellEdit()`, `.cell-error`] |
| Loading, Selected, Disabled, Empty | Not applicable |

**CMP-119.** Validation MUST run on commit, not on every keystroke. The reference implementation says so explicitly: "validate on blur, not on every keystroke" [src: `beginCellEdit()`]. Per-keystroke validation flashes errors at a user who is mid-way through typing a valid value.

**CMP-120.** Exactly one cell may be in edit at a time; a second edit request while one is open MUST be ignored [src: `beginCellEdit()`].

**CMP-121.** A select editor MUST commit on change, by blurring itself [src: `beginCellEdit()`].

**CMP-122.** Every committed edit MUST push an undo entry before mutating the record [src: `commitCell()`].

**CMP-123.** Validation messages MUST state the rule, the offending value and a valid example [src: `commitCell()`]:

| Column | Rules |
|---|---|
| Branch | Must be one of the known branches; the message lists them |
| Price | Required; must be a number; must not be negative; must not exceed 500, with the message naming the limit and the entered amount; stored rounded to two decimal places |
| Rating | Required; must be a whole number; must be between 1 and 5, with the message naming the entered value |

### Keyboard

| Key | Action |
|---|---|
| `Enter` on an editable cell | Begin editing [src: `wire()`] |
| `Enter` in the editor | Commit [src: `beginCellEdit()`] |
| `Escape` in the editor | Cancel, restoring the previous content, without propagating [src: `beginCellEdit()`] |
| Blur | Commit [src: `beginCellEdit()`] |

**CMP-124.** Arrow-key navigation between cells and rows MUST be implemented. **Status:** specified, not implemented in the reference build.

### Accessibility

Role `grid` on the viewport with an accessible name; `row` on the header and on each row; `columnheader` with `aria-sort`; `gridcell` on each cell [src: table markup, `renderTableHead()`, `renderTableRows()`].

**CMP-125.** Virtualisation breaks the relationship between the rendered row count and the true row count. The implementation MUST expose the true counts via row-count and row-index properties. **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-126.** Column widths MUST be expressed as a mix of fixed and constrained-flexible tracks, so that identifier columns can breathe and fixed-format columns cannot. The reference template is: Individual `minmax(170px,1.1fr)`, Type `minmax(130px,0.9fr)`, Order ref `108px`, Branch `124px`, Price `92px`, Rating `84px`, Prepared `148px`, Customer `minmax(140px,0.9fr)` [src: `COLS`].

**CMP-127.** Column labels MUST be short nouns, sentence case: "Individual", "Type", "Order ref", "Branch", "Price", "Rating", "Prepared", "Customer" [src: `COLS`].

**CMP-128.** Values MUST be formatted for reading, not for storage: currency with its symbol and two decimals, ratings as "4 / 5", timestamps as an abbreviated local date and time, CamelCase type names spaced into words [src: `money()`, `when()`, `humanise()`].

**CMP-129.** A missing value MUST render as an em dash, never as an empty cell, so that the reader can tell absence from a rendering fault [src: `COLS`, `renderQueryResults()`].

---

## Filter bar

### Purpose

A horizontal band of filter controls above a table, plus a result count and the action that sends the filtered page into the **Viewport**.

### Anatomy

| Part | Description |
|---|---|
| **Bar** | A wrapping flex row with a bottom hairline [src: `.filterbar`] |
| **Label** | A 12 px `--text-secondary` word naming the control that follows [src: `.filterbar__label`] |
| **Filter control** | A [Select field](#select-field) or a [Search field](#search-field) |
| **Reset button** | A default-variant button [src: `#fReset`] |
| **Flexible spacer** | Pushes the trailing items to the right |
| **Count chip** | A [Chip](#chip) stating the filtered row count [src: `#tblCount`] |
| **Send-to-graph button** | A default-variant button with a leading `i-target` glyph [src: `#tblToGraph`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Padding | `--sp-2` `--sp-3` | 8 px vertical, 12 px horizontal |
| Gap | `--sp-2` | 8 px |
| Bottom border | `--stroke-divider` | 1 px |
| Wrapping | — | The bar wraps; it MUST NOT clip [src: `.filterbar`] |

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, Pressed, Focus, Selected, Disabled | Not applicable to the bar; hosted controls own these |
| Loading | Not applicable; filtering is synchronous over an in-memory array [src: `applyFilters()`] |
| Empty | Not applicable; the bar always renders. When the filter matches nothing, the table below shows an [Empty state block](#empty-state-block) whose action resets the filters [src: `renderTableRows()`] |
| Error | Not applicable; filters cannot fail |

**CMP-130.** The bar MUST wrap rather than compress its controls, so that every filter remains reachable at the minimum window width (DS-116) [src: `.filterbar`].

### Keyboard

Each control is individually reachable. Text filters debounce at 160 ms; select filters apply immediately [src: `wire()`].

### Accessibility

**CMP-131.** Each filter control MUST carry an explicit accessible name, because the visible word beside it is a layout label, not an associated one [src: `#fType`, `#fBranch`, `#fSearch`]. An implementation SHOULD instead associate the visible label properly, and then the explicit name is unnecessary.

### Content rules

**CMP-132.** Filter labels MUST be single words: "Type", "Branch" [src: `.filterbar`].

**CMP-133.** Reset MUST clear every filter at once, including the text filter, and MUST re-apply immediately [src: `resetFilters()`].

**CMP-134.** The count chip MUST state the filtered count, pluralised, with thousands separators [src: `applyFilters()`].

**CMP-135.** The send-to-graph action MUST state its outcome in a toast, naming how many of how many rows were sent and what the user can do next: "Seeded the graph with 1,000 of 8,412 filtered rows. Double-click any node to expand it." [src: `wire()`].

**CMP-136.** With no matching rows, the send-to-graph action MUST refuse with an explanation rather than silently doing nothing: "No rows to send — the filter matches nothing." [src: `wire()`].

---

## Code editor with syntax overlay

### Purpose

Edits a SPARQL query with live syntax colouring, implemented as a transparent text input stacked exactly over a coloured, non-interactive rendering of the same text.

### Anatomy

| Part | Description |
|---|---|
| **Well** | The scrolling container, on `--surface-sunken` [src: `.sparql__editorwrap`] |
| **Stack** | A relatively positioned block at least the height of the well [src: `.sparql__stack`] |
| **Highlight layer** | An absolutely positioned, non-interactive preformatted block carrying the coloured markup in `--text` [src: `.sparql__hl`] |
| **Input layer** | The text area, transparent in both ground and colour, with a `--text` caret [src: `.sparql__input`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Padding | `--sp-3` | 12 px, identical on both layers |
| Font | `--font-mono`, `--fs-code` | 13 px, identical on both layers |
| Line height | `--lh-code` | 1.55, identical on both layers |
| Wrapping | — | Preserve whitespace, wrap on overflow, break long words — identical on both layers |
| Border | — | none on both layers |
| Ground | `--surface-sunken` | on the well only |
| Editor region height | — | `minmax(120px, 40%)` of the console [src: `.sparql__main`] |

**CMP-137.** The two layers MUST share padding, family, size, line height, wrapping mode and word-breaking mode exactly. Any divergence causes the colour to drift from the text, and the drift compounds down the document [src: `.sparql__hl, .sparql__input`].

**CMP-138.** The highlight layer MUST be non-interactive so that clicks, selections and the caret all land in the input [src: `.sparql__hl`].

**CMP-139.** The highlighted markup MUST end with a trailing newline, so that a query ending in a newline does not lose its final blank line to collapsing [src: `highlight()`].

**CMP-140.** The layers MUST be scroll-synchronised: when the input scrolls, the highlight layer's scroll offset MUST follow [src: `wire()`].

### Syntax token palette

| Token class | Colour | Weight | Matches |
|---|---|---|---|
| Keyword | `--e-objprop` | 600 | Recognised SPARQL keywords, case-insensitively [src: `.tok-kw`] |
| Variable | `--accent` | 400 | `?name` [src: `.tok-var`] |
| IRI | `--e-individual` | 400 | `<...>` and `prefix:local` [src: `.tok-iri`] |
| String | `--e-dataprop` | 400 | Double-quoted literals with escapes [src: `.tok-str`] |
| Comment | `--text-disabled` | 400, italic | `#` to end of line [src: `.tok-com`] |
| Number | `--warn` | 400 | Integers and decimals, optionally signed [src: `.tok-num`] |

**CMP-141.** The IRI and comment colours fail contrast in light theme (DS-29). A dedicated code palette MUST be introduced. **Status:** specified, not implemented in the reference build.

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover | Not applicable; the editor has no hover treatment |
| Pressed | Not applicable |
| Focus | A 2 px inset ring in `--accent`, replacing the outward focus ring [src: `.sparql__input:focus`] |
| Selected | Selected text takes `--accent` ground with `--text-on-accent`. Because the input's own text is transparent, the selection highlight reads as a coloured band over the highlight layer; this is intentional and MUST be preserved |
| Disabled | Not applicable; the editor is always editable |
| Loading | While a query runs, the editor stays live. The [Status line](#result-status-line) carries the loading state [src: `runQuery()`] |
| Empty | An empty editor is valid; running it produces a parse error, reported by the status line |
| Error | The editor itself is not marked. The error is reported by the status line, which names the fault and gives a hint [src: `runQuery()`] |

**CMP-142.** The editor MUST NOT block during evaluation. It stays editable while the query runs so that the user can begin correcting it [src: `runQuery()`].

### Keyboard

| Key | Action |
|---|---|
| `Ctrl+Enter` | Run the query [src: `wire()`] |
| `Tab` | Insert two spaces at the caret and keep focus, preserving the caret position [src: `wire()`] |

**CMP-143.** The `Tab` override traps focus. An escape route MUST be provided and documented (DS-103). **Status:** specified, not implemented in the reference build.

### Accessibility

The input carries the accessible name "SPARQL query"; the highlight layer is hidden from assistive technology [src: `#qInput`, `#qHighlight`].

### Content rules

**CMP-144.** The editor MUST open with a working example query already loaded, so that the console can be run without writing anything [src: `wire()`].

**CMP-145.** The keyboard shortcut MUST be shown on the Run button rather than hidden in a tooltip: a monospace, reduced-opacity "Ctrl+Enter" beside the label [src: `#qRun`].

**CMP-146.** The console MUST state its supported subset honestly, as a chip in its bar: "Basic graph patterns · FILTER · LIMIT" [src: SPARQL bar].

---

## Result grid

### Purpose

Displays query results. A [Virtualised table](#virtualised-table) whose columns are derived from the query's projection rather than fixed.

### Anatomy

As the virtualised table, with these differences:

| Part | Difference |
|---|---|
| **Header cell** | Not a button; results are not sortable. Rendered as a plain header element [src: `renderQueryResults()`] |
| **Column template** | Every column is `minmax(160px,1fr)`; columns are equal because the projection is unknown in advance [src: `renderQueryResults()`] |
| **IRI cell** | Renders an accent link showing the shortened IRI, which selects and reveals the **Entity** [src: `renderQueryResults()`] |
| **Literal cell** | Renders the literal's lexical form in `--font-mono` at `--fs-code`, truncating [src: `renderQueryResults()`] |
| **Unbound cell** | Renders an em dash [src: `renderQueryResults()`] |

### States

| State | Treatment |
|---|---|
| Default, Hover | As the virtualised table |
| Selected | Not applicable; result rows are not selectable. Selection happens by activating an IRI link |
| Focus | The viewport carries the tab stop; links are individually reachable |
| Pressed, Disabled | Not applicable |
| Loading | The grid retains the previous result while the new one evaluates; the status line carries the loading state [src: `runQuery()`] |
| Empty | With no columns, both the header and the rows are cleared and the spacer's height is set to zero. A zero-row result keeps its headers, so the user can see what was projected [src: `renderQueryResults()`] |
| Error | The grid is cleared entirely — columns, rows and IRI set — and the error is reported by the status line [src: `runQuery()`] |

### Result status line

| Part | Description |
|---|---|
| **Bar** | A band with hairlines above and below, on `--surface-alt`, 12 px text [src: `.sparql__status`] |
| **Icon** | A 14 × 14 glyph: `i-check` in `--ok` on success, `i-warn` on failure [src: `runQuery()`] |
| **Message** | The outcome |

| Metric | Value |
|---|---|
| Padding | `--sp-2` `--sp-3` — 8 px vertical, 12 px horizontal |
| Gap | `--sp-2` (8 px) |
| Borders | 1 px `--stroke-divider` top and bottom |

| State | Treatment |
|---|---|
| Ready | Plain text on `--surface-alt`: "Ready. Pick an example on the right, or write a query." [src: `#qStatus`] |
| Loading | A [Spinner](#spinner) beside the word "Evaluating…" [src: `runQuery()`] |
| Success | Tick in `--ok`, then the row count, whether a LIMIT applied, the elapsed milliseconds, the triple count queried, the distinct IRI count, and whether intermediate results were capped [src: `runQuery()`] |
| Error | A 3 px left rule in `--danger`, ground `--danger-subtle`, text `--danger`, a warning glyph, the message in semibold and a hint sentence after it [src: `.sparql__error`, `runQuery()`] |

**CMP-147.** Every query error MUST carry a hint as well as a message. The default hint is "Check the query syntax against one of the examples." [src: `runQuery()`].

**CMP-148.** The success line MUST report what was actually done, not merely that it succeeded: rows, timing, corpus size and distinct IRIs (DS-128) [src: `runQuery()`].

**CMP-149.** The implementation MUST yield a frame between entering the loading state and evaluating, so that the loading state is actually painted on a large **Store** [src: `runQuery()`].

### Example query rail

| Part | Description |
|---|---|
| **Rail** | A scrolling aside on `--surface-alt` with a leading hairline [src: `.sparql__side`] |
| **Group label** | "Example queries", using the flyout label part [src: `.menu__label`] |
| **Example item** | A full-width borderless button: a semibold 14 px title on its own line, then a 12 px `--text-secondary` note [src: `.qitem`] |

| Metric | Value |
|---|---|
| Rail width | 220 px [src: `.sparql`] |
| Rail padding | `--sp-2` (8 px) |
| Item padding | `--sp-2` (8 px) |
| Item spacing | 2 px |
| Item radius | `--r-control` (4 px) |
| Title | `--fs-body`, weight 600, 2 px below it |
| Note | `--fs-caption`, `--text-secondary` |

| State | Treatment |
|---|---|
| Default | Transparent ground [src: `.qitem`] |
| Hover | Ground `--layer-hover` [src: `.qitem:hover`] |
| Focus | The standard focus ring |
| Selected | Not applicable; choosing an example is an action, not a persistent state |
| Pressed, Disabled, Loading, Empty, Error | Not applicable |

**CMP-150.** Choosing an example MUST load it into the editor, re-highlight it and run it in one action [src: `wire()`].

**CMP-151.** Each example MUST carry a note describing what it demonstrates, not what it returns.

---

## Status bar

### Purpose

A persistent, always-visible summary of the **Store**, the **Viewport**, the selection and the view transform. It is the answer to "what am I looking at" without a click.

### Anatomy

| Part | Description |
|---|---|
| **Bar** | The bottom band on `--surface-alt` with a top border in `--stroke` [src: `.statusbar`] |
| **Item** | A flex group of label text and values [src: `.statusbar__item`] |
| **Value** | A semibold, monospace number inside an item [src: `.statusbar__item b`] |
| **Separator** | A 1 px × 14 px vertical hairline [src: `.statusbar__sep`] |
| **Button** | A compact borderless button [src: `.statusbar button`] |
| **Flexible spacer** | Pushes the trailing items right |

Reference contents, in order [src: status bar markup]: ontology name with a `i-db` glyph · separator · Store triples · Classes · Individuals · separator · In view nodes and triples, in `--text` · spacer · selection description · separator · **Layout mode** · separator · zoom.

### Sizing

| Metric | Token | Value |
|---|---|---|
| Height | `--h-statusbar` | 26 px |
| Horizontal padding | `--sp-3` | 12 px |
| Gap between items | `--sp-3` | 12 px |
| Gap within an item | — | 6 px |
| Separator | — | 1 px × 14 px, `--stroke` |
| Text | `--fs-caption` | 12 px, `--text-secondary` |
| Values | `--font-mono` | semibold, `--text` |
| Button height | — | 20 px, 8 px horizontal padding, `--r-control` radius [src: `.statusbar button`] |

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover — bar | Not applicable |
| Hover — button | Ground `--layer-hover`, text rises to `--text` [src: `.statusbar button:hover`] |
| Pressed — button | **Status:** specified, not implemented in the reference build |
| Focus — button | The standard focus ring |
| Selected | The selection item reads "No selection" when nothing is selected, and `<kind> · <name>` when something is [src: `selectEntity()`] |
| Disabled | Not applicable |
| Loading | Not applicable; every value is computed synchronously |
| Empty | Not applicable; every item always has a value, including zero |
| Error | Not applicable; the status bar reports state, never failure. Failures go to a [Toast](#toast) |

**CMP-152.** The bar MUST clip rather than wrap or scroll. It is a single line by definition, and the trailing items are the least important [src: `.statusbar`].

**CMP-153.** The "In view" item MUST be raised to `--text` rather than `--text-secondary`, because it is the one figure that changes with every interaction and is the point of the **Budget** model [src: status bar markup].

### Keyboard

Buttons are reachable by Tab. The bar itself is not focusable.

### Accessibility

Role `status` with `aria-live="off"` — deliberately not announced (DS-110) [src: `.statusbar`].

**CMP-154.** Each value SHOULD have its own accessible label so that a screen-reader user can query it on demand without it being announced continuously. **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-155.** Every number in the bar MUST be live and computed, never estimated (DS-128) [src: `updateStoreUI()`, `updateBudgetUI()`].

**CMP-156.** Item labels MUST be one word where possible: "Store", "Classes", "Individuals", "In view", "Layout", "Zoom" [src: status bar markup].

**CMP-157.** Numbers MUST be monospace so that a changing count does not shift the items beside it [src: `.statusbar__item b`].

**CMP-158.** Zoom MUST be shown as a whole-number percentage [src: `updateBudgetUI()`].

---

## Flyout menu

### Purpose

A transient list of actions or choices, anchored to a trigger, dismissed by choosing, by Escape, or by clicking away.

### Anatomy

| Part | Description |
|---|---|
| **Surface** | A fixed-position card [src: `.menu`] |
| **Group label** | A non-interactive 12 px `--text-secondary` line [src: `.menu__label`] |
| **Item** | A full-width borderless button [src: `.menu__item`] |
| **Item icon** | Optional leading 14 × 14 glyph |
| **Item label** | The action text |
| **Keyboard hint** | An optional trailing 12 px monospace `--text-secondary` element pushed to the trailing edge [src: `.menu__item .kbd`] |
| **Separator** | A hairline between groups [src: `.menu__sep`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Minimum width | — | 200 px [src: `.menu`]; the search flyout overrides to 320 px [src: `wireGlobalSearch()`] |
| Surface padding | `--sp-1` | 4 px |
| Radius | `--r-card` | 8 px |
| Border | `--stroke` | 1 px |
| Ground | `--surface` | |
| Shadow | `--shadow-flyout` | |
| Stacking index | — | 60 |
| Item height | `--h-row` | 32 px |
| Item padding | `--sp-3` | 12 px |
| Item gap | `--sp-2` | 8 px |
| Item radius | `--r-control` | 4 px |
| Separator | — | 1 px, `--stroke-divider`, with `--sp-1` vertical and `--sp-2` horizontal margin |
| Label padding | `--sp-1` `--sp-3` | 4 px vertical, 12 px horizontal |

### Positioning

**CMP-159.** A flyout MUST be positioned at the requested point, clamped so that its right edge stays 8 px inside the window's right edge and its bottom edge 8 px inside the bottom [src: `openMenu()`]. Measurement MUST happen after the flyout is made visible, because a hidden element has no measurable box [src: `openMenu()`].

**CMP-160.** A flyout opened from a button MUST be anchored to the button's left edge and 4 px below its bottom [src: `wire()`].

### Item states

| State | Treatment |
|---|---|
| Default | Transparent ground, `--text` label [src: `.menu__item`] |
| Hover | Ground `--layer-hover` [src: `.menu__item:hover`] |
| Pressed | **Status:** specified, not implemented in the reference build |
| Focus | The standard focus ring |
| Selected / checked | **Status:** specified, not implemented in the reference build. A checked item MUST carry a leading tick in the icon slot and MUST expose a checked state |
| Disabled | Label `--text-disabled`, pointer events removed. A disabled item MUST remain visible, because its presence tells the user the action exists [src: `.menu__item[disabled]`] |
| Loading | Not applicable |
| Empty | A flyout with no items MUST NOT open. Where a flyout can legitimately have no results — the search flyout — it MUST open containing a single explanatory label [src: `wireGlobalSearch()`] |
| Error | Not applicable |

**CMP-161.** A disabled item's keyboard hint MAY state why it is disabled. The graph context menu's expand item shows "none" when there are no **Hidden neighbour**s and "+18" when there are [src: `wireCanvas()`].

### Dismissal

| Route | Behaviour |
|---|---|
| Choosing an item | Closes every flyout, then performs the action [src: `wire()`, `wireCanvas()`] |
| Escape | Closes every flyout, then any open dialog [src: `wire()`] |
| Pointer down outside | Closes every flyout, unless the press landed on a flyout, on a flyout trigger, or on the global search field [src: `wire()`] |
| Opening another flyout | Closes every other flyout first [src: `closeMenus()`] |

**CMP-162.** Closing MUST reset the expanded state on every trigger, not only on the one that was open [src: `closeMenus()`].

### Keyboard

**Status:** specified, not implemented in the reference build. Required: Arrow Down and Arrow Up move between enabled items with wrapping; Home and End jump to the first and last; Enter and Space activate; Escape closes and returns focus to the trigger; typing a letter jumps to the next item beginning with it.

### Accessibility

Role `menu` on the surface, `menuitem` on each item [src: menu markup].

**CMP-163.** Group labels MUST NOT carry an item role and MUST NOT be focusable [src: `.menu__label`].

**CMP-164.** An open flyout MUST move focus into itself, and MUST restore focus to the trigger when it closes. **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-165.** A flyout MUST open with a group label stating what the choices are [src: dataset flyout, export flyout, `wireGlobalSearch()`].

**CMP-166.** A keyboard hint MUST be used only for a shortcut, a magnitude, or a one-word qualifier — never for a second sentence. Reference hints: "~8K triples", "screen", "print", "editable", "Del", "reseeds view", "+18", "none", "Class" [src: dataset flyout, export flyout, context menu, search flyout].

**CMP-167.** An explanatory label MAY close a flyout, and when present MUST wrap at a constrained width with a relaxed line height rather than forcing the flyout wide [src: dataset flyout, export flyout].

**CMP-168.** A flyout MUST contain no more than about ten items. The search flyout caps its results at ten for exactly this reason [src: `wireGlobalSearch()`].

---

## Context menu

### Purpose

Node-specific actions in the graph **Viewport**, raised where the user right-clicked.

### Anatomy

A [Flyout menu](#flyout-menu), built fresh on each invocation, whose first element is a group label naming the node acted upon [src: `wireCanvas()`].

Reference items, in order [src: `wireCanvas()`]:

| Item | Hint | Disabled when |
|---|---|---|
| Expand neighbours | `+n`, or "none" | The node has no **Hidden neighbour**s |
| Expand 20 only | — | The node has no **Hidden neighbour**s |
| Collapse neighbourhood | — | Never |
| *(separator)* | | |
| Focus here | "reseeds view" | Never |
| Pin — never evict / Unpin | — | Never |
| Remove from view | "Del" | Never |

### Sizing

As the flyout menu.

### States

As the flyout menu. Additionally:

| State | Treatment |
|---|---|
| **No target** | Right-clicking empty canvas MUST NOT open a menu [src: `wireCanvas()`] |
| **Stale target** | If the node has left the **Viewport** between opening the menu and choosing an item, the action MUST be abandoned silently [src: `wireCanvas()`] |

### Positioning

At the pointer, clamped to the window as for any flyout [src: `openMenu()`].

### Keyboard

**Status:** specified, not implemented in the reference build. The context menu MUST be raisable from the keyboard — by the Menu key or `Shift+F10` — on the focused canvas with a node selected, and MUST then open at the selected node's screen position.

### Accessibility

Role `menu` with `menuitem` children [src: `#ctxMenu`].

**CMP-169.** The menu's group label MUST name the node it acts on, so the user can confirm what they right-clicked before committing [src: `wireCanvas()`].

### Content rules

**CMP-170.** Right-clicking a node MUST also select it, so that the **Inspector** and the status bar agree with the menu [src: `wireCanvas()`].

**CMP-171.** Item labels MUST state the effect on the **Viewport**, not the internal operation: "Pin — never evict", "Remove from view", "Focus here" [src: `wireCanvas()`].

**CMP-172.** A toggle item MUST state the action it will perform, not the current state: "Pin — never evict" when unpinned, "Unpin" when pinned [src: `wireCanvas()`].

**CMP-173.** Every context action MUST report its outcome by [Toast](#toast), including the null outcome: "Nothing to collapse — every neighbour is shared or pinned." [src: `wireCanvas()`].

---

## Modal dialog

### Purpose

Collects input or confirms a destructive action. Used for three flows only: new class, new **Individual**, and delete class (DS-130).

### Anatomy

| Part | Description |
|---|---|
| **Scrim** | A full-window overlay that centres the dialog [src: `.scrim`] |
| **Dialog** | The card [src: `.dialog`] |
| **Title** | A 16 px `--font-display` heading [src: `.dialog h2`] |
| **Body** | One or more paragraphs in `--text-secondary` stating the consequence [src: `.dialog p`] |
| **Form row** | A label, a control, and a hidden-until-invalid error [src: `.formrow`] |
| **Required marker** | An asterisk in `--danger` [src: `.formrow .req`] |
| **Inline error** | A 12 px `--danger` message, displayed only when the row is invalid [src: `.formrow .err`] |
| **Action row** | A right-aligned pair of buttons [src: `.dialog__actions`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Scrim | — | Full window, `rgba(0,0,0,0.30)`, stacking index 70 [src: `.scrim`] |
| Dialog width | — | `min(460px, 100vw − 48px)` [src: `.dialog`] |
| Dialog padding | `--sp-6` | 24 px |
| Radius | `--r-card` | 8 px |
| Border | `--stroke` | 1 px |
| Shadow | `--shadow-dialog` | |
| Title | `--fs-subtitle` | 16 px, `--font-display`, 8 px below it |
| Body paragraph | — | `--text-secondary`, 16 px below it |
| Action row | `--sp-2` | 8 px between buttons, 20 px above the row |
| Form row | `--sp-1` | 4 px internal gap, 12 px below the row |
| Form label | `--fs-caption` | 12 px, `--text-secondary` |

### Entrance

Scrim: opacity 0 → 1 over `--dur-base` with `--ease-out`. Dialog: opacity 0 → 1 with `translateY(8px) scale(0.99)` → none, over the same duration and curve [src: `@keyframes fade`, `@keyframes pop`].

**CMP-174.** An exit animation MUST be added, running at `--dur-exit` with `--ease-in` (DS-56). **Status:** specified, not implemented in the reference build — the reference dialog closes instantly.

### States

| State | Treatment |
|---|---|
| Default | As above, with focus moved to the first focusable control [src: `openDialog()`] |
| Hover, Pressed, Selected | Not applicable to the dialog; hosted controls own these |
| Focus | Focus MUST be trapped within the dialog and MUST return to the invoking control on close. **Status:** specified, not implemented in the reference build (DS-107) |
| Disabled | Not applicable |
| Loading | **Status:** specified, not implemented in the reference build. A dialog whose confirming action is slow MUST put its primary button into the loading state and disable its cancel button |
| Empty | Not applicable; a dialog with nothing to say MUST NOT be opened |
| Error | Per form row. An invalid row reveals its error message and turns its field's borders `--danger`; the dialog stays open and focus returns to the offending field [src: `.formrow.is-invalid`, `newClassDialog()`] |

### Dismissal

| Route | Behaviour |
|---|---|
| Cancel button | Closes without committing [src: `wire()`] |
| Clicking the scrim | Closes without committing, only when the press landed on the scrim itself [src: `wire()`] |
| Escape | Closes without committing [src: `wire()`] |
| Confirming action | Validates; on failure stays open and shows the error; on success commits and closes [src: `newClassDialog()`] |

**CMP-175.** A destructive dialog MUST NOT be dismissible by scrim click. **Status:** specified, not implemented in the reference build — the delete dialog currently is. Cancel and Escape MUST remain available.

### Keyboard

Escape cancels. Enter SHOULD activate the confirming action when focus is in a single-line field. **Status:** specified, not implemented in the reference build.

### Accessibility

Role `dialog`, modal, labelled by its title [src: `#dialog`]. The required marker's asterisk MUST be hidden from assistive technology and MUST be paired with a visually hidden "required" (DS-98) [src: `newClassDialog()`]. The inline error MUST be an alert region and MUST be referenced by the field it describes [src: `newClassDialog()`].

### Content rules

**CMP-176.** The title MUST be a short noun phrase for a creation dialog ("New class", "New individual") and a question naming the subject for a confirmation ("Delete Margherita?") [src: `newClassDialog()`, `deleteSelected()`].

**CMP-177.** The body MUST state the consequence in terms of the model, quantified from the actual data. The delete dialog counts the class's subclasses and direct instances, names the class its subclasses will be reparented to, and says plainly that instances "keep their type assertion and will dangle"; where nothing references the class it says so instead: "Nothing else references it, so this removes one class and one subClassOf axiom." [src: `deleteSelected()`].

**CMP-178.** The confirming button MUST name the action, never "OK": "Create class", "Create individual", "Delete class" [src: `newClassDialog()`, `newIndividualDialog()`, `deleteSelected()`].

**CMP-179.** The cancelling button MUST be the outline variant and MUST come first in reading order, with the confirming button last, at the trailing edge [src: `.dialog__actions`].

**CMP-180.** A form field MUST carry a realistic placeholder or a realistic default: "e.g. TruffleTopping", "11.50" [src: `newClassDialog()`, `newIndividualDialog()`].

**CMP-181.** Validation MUST happen on the confirming action, MUST reveal the error on the offending row, and MUST return focus to that row's field [src: `newClassDialog()`].

---

## Toast

### Purpose

A transient, non-blocking report of what just happened, especially where the outcome differed from what the user might assume — a **Budget** refusal, an **Eviction**, a partial page-in, an export that saved, an action with nothing to do.

### Anatomy

| Part | Description |
|---|---|
| **Container** | A card anchored to the bottom centre of the graph **Viewport** [src: `.graph__trace`] |
| **Severity rule** | A 3 px left border coloured by severity [src: `.graph__trace`, `showToast()`] |
| **Severity icon** | A 14 × 14 `i-warn` glyph, coloured by severity [src: `#trace`, `showToast()`] |
| **Message** | Text filling the remaining width [src: `#traceText`] |
| **Dismiss control** | An icon-only button with a 14 × 14 `i-close` glyph [src: `#traceClose`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Position | — | Bottom centre of the canvas, `--sp-6` (24 px) above its bottom edge, horizontally centred [src: `.graph__trace`] |
| Maximum width | — | 560 px |
| Padding | `--sp-2` `--sp-3` | 8 px vertical, 12 px horizontal |
| Gap | `--sp-2` | 8 px |
| Ground | `--surface` | |
| Border | `--stroke` | 1 px, with a 3 px left border in the severity colour |
| Radius | `--r-control` | 4 px |
| Shadow | `--shadow-flyout` | |
| Text | `--fs-caption` | 12 px |

### Severity

| Severity | Rule and icon colour | Used for |
|---|---|---|
| Informational | `--accent` | Completed work, counts, confirmations, and null outcomes [src: `showToast()`] |
| Warning | `--warn` | Refusals, **Budget** limits, validation failures, capability refusals. This is the default when no severity is given [src: `showToast()`, `setStatusMessage()`] |

**CMP-182.** There MUST be exactly two severities. A failure that needs more than a toast belongs in a dialog or in an inline error.

**CMP-183.** Severity MUST colour both the left rule and the icon, and MUST NOT colour the text [src: `showToast()`].

### Motion

Entrance: opacity 0 → 1 with `translateY(6px)` → 0 over `--dur-base` with `--ease-out`, preserving the horizontal centring transform throughout [src: `.graph__trace`, `.graph__trace.is-shown`].

Exit: the same transition, run in reverse. **CMP-184.** The exit SHOULD run at `--dur-exit` with `--ease-in` (DS-56). **Status:** specified, not implemented in the reference build — the reference toast exits with the entrance timing.

### Timing

**CMP-185.** A toast MUST auto-dismiss after **6,000 ms** [src: `showToast()`].

**CMP-186.** A new message MUST reuse the same toast: replace the text, reset the severity, restart the timer. Toasts MUST NOT stack [src: `showToast()`].

**CMP-187.** The auto-dismiss timer MUST be cancelled and restarted on each new message, so that a rapid sequence does not dismiss the last message early [src: `showToast()`].

**CMP-188.** The toast SHOULD pause its timer while hovered or focused. **Status:** specified, not implemented in the reference build.

### States

| State | Treatment |
|---|---|
| Hidden | Opacity 0, no pointer events, offset 6 px down. It remains in the document so that it is a live region from the start (DS-109) [src: `.graph__trace`] |
| Shown | Opacity 1, pointer events restored, offset 0 [src: `.graph__trace.is-shown`] |
| Hover, Pressed, Focus, Selected | Not applicable to the container; the dismiss button owns these |
| Disabled | Not applicable |
| Loading | Not applicable. A toast reports a completed or refused action. Work in progress is announced as an informational toast and superseded by its completion message [src: `regenerate()`] |
| Empty | Not applicable; a toast with no message is never shown |
| Error | Not applicable; a failed message *is* the warning severity |

**CMP-189.** The hidden toast MUST NOT intercept pointer events, or it would block a 560 px band of the graph canvas [src: `.graph__trace`].

### Keyboard

The dismiss button is reachable by Tab and activated by Space or Enter. **CMP-190.** Escape SHOULD dismiss a shown toast. **Status:** specified, not implemented in the reference build.

### Accessibility

Role `status`, `aria-live="polite"`, present in the document before first use [src: `#trace`].

**CMP-191.** The toast MUST NOT be assertive. Its messages are informative, and an assertive region would interrupt the user mid-sentence on every **Eviction**.

### Content rules

**CMP-192.** A message MUST state what happened, in what quantity, and — where the outcome was constrained — what the user can do about it. Reference messages [src: `reportView()`, `wire()`, `exportPNG()`]:

- "Budget reached at 1,000 nodes. 214 neighbours of Margherita were left out — raise the budget or unpin something."
- "Budget held at 1,000. Paged out 37 nodes furthest from the focus (Hot, Mild, Medium, …) to make room for NamedPizza."
- "Saved axiom-graph-force-412.png — 2,560 × 1,440 px, 318 KB."
- "Nothing to collapse — every neighbour is shared or pinned."
- "Serialising to OWL is not wired in this prototype — no file is written. The shipping app saves pizza.owl here."

**CMP-193.** A message MUST NOT exceed roughly two sentences at 560 px.

**CMP-194.** Counts MUST be formatted with thousands separators and MUST pluralise correctly [src: `reportView()`].

**CMP-195.** When a capability is missing, the message MUST say so plainly and name the alternative: "The browser refused clipboard image access on this page. Use Export PNG instead — it saves to your downloads folder." [src: `copyGraphImage()`].

**CMP-196.** A null outcome MUST still be reported: "Nothing to undo.", "Margherita has no further neighbours outside the view." [src: `undo()`, `wireCanvas()`].

---

## Spinner

### Purpose

Indicates indeterminate progress inline, beside the words describing what is progressing.

### Anatomy

A single part: a ring with three quarters in `--stroke-strong` and one quarter in `--accent`, rotating [src: `.spinner`].

### Sizing

| Metric | Value |
|---|---|
| Diameter | 14 × 14 px |
| Stroke | 2 px |
| Track colour | `--stroke-strong` |
| Head colour | `--accent` |
| Radius | fully round |
| Animation | 700 ms linear, infinite |
| Flex | never flexible |

### States

| State | Treatment |
|---|---|
| Default | Rotating |
| Reduced motion | Stationary, showing its accent quarter (DS-60). The accompanying text carries the meaning (DS-62) |
| Hover, Pressed, Focus, Selected, Disabled, Empty, Error | Not applicable; the spinner is a presentation element |

### Accessibility

**CMP-197.** The spinner MUST be hidden from assistive technology; the text beside it carries the announcement [src: `runQuery()`].

### Content rules

**CMP-198.** A spinner MUST NEVER appear alone. It always sits beside a phrase naming the work: "Evaluating…" [src: `runQuery()`] (DS-131).

**CMP-199.** A spinner MUST NOT be used for work expected to take less than a frame. The SPARQL console shows one because the **Store** may hold 766,000 triples; the tree does not, because it renders synchronously.

---

## Skeleton

### Purpose

Reserves the shape of content that has not arrived, so that its arrival does not shift the layout.

### Anatomy

A single part: a rounded bar with a shimmer sweeping across it [src: `.skeleton`].

### Sizing

| Metric | Value |
|---|---|
| Height | 10 px |
| Radius | 5 px, a full pill |
| Ground | A three-stop horizontal gradient: `--surface-sunken` at 25 %, `--layer-hover` at 37 %, `--surface-sunken` at 63 % |
| Background size | 400 % × 100 % |
| Animation | 1.4 s ease-in-out, infinite, sweeping the background position from right to left |
| Width | Set by the caller to approximate the content it stands in for |

### States

| State | Treatment |
|---|---|
| Default | Shimmering |
| Reduced motion | Static, showing the gradient's resting position (DS-60) |
| Hover, Pressed, Focus, Selected, Disabled, Empty, Error | Not applicable |

**Status:** the skeleton is defined and never used in the reference build, because every surface renders synchronously from an in-memory **Store**. It is specified here because a shipping implementation that loads an ontology from disk or from a remote endpoint will need it.

### Accessibility

**CMP-200.** A skeleton region MUST be hidden from assistive technology and MUST be accompanied by a busy state on its container, so that a screen-reader user hears "loading" rather than a row of empty elements.

### Content rules

**CMP-201.** Skeletons MUST match the rhythm of the content they replace — one bar per row, at that row's height — and MUST NOT exceed five bars. Beyond five, a [Spinner](#spinner) with a message is less distracting.

**CMP-202.** A skeleton MUST NOT be shown for less than about 200 ms. A flash of skeleton is worse than a moment of nothing.

---

## Meter

### Purpose

Shows how much of the **Viewport** **Budget** is consumed, and changes colour as it approaches and reaches the limit.

### Anatomy

| Part | Description |
|---|---|
| **Track** | A recessed bar [src: `.meter`] |
| **Fill** | The occupied portion [src: `.meter__fill`] |

### Sizing

| Metric | Value |
|---|---|
| Height | 6 px |
| Radius | 3 px, a full pill |
| Track ground | `--surface-sunken` |
| Track border | 1 px `--stroke-divider` |
| Overflow | clipped, so the fill inherits the track's rounded ends |
| Fill height | 100 % of the track |
| Fill transition | `width` over `--dur-base` with `--ease-out` |

### States

| State | Threshold | Fill colour |
|---|---|---|
| Normal | occupancy < 75 % | `--accent` [src: `.meter__fill`] |
| Near | 75 % ≤ occupancy < 98 % | `--warn` [src: `.meter__fill.is-near`, `updateBudgetUI()`] |
| Full | occupancy ≥ 98 % | `--danger` [src: `.meter__fill.is-full`, `updateBudgetUI()`] |
| Empty | occupancy 0 % | Width 0; the track still renders, so the control does not appear and disappear [src: `#budgetMeter`] |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Error | Not applicable; the meter is not interactive |

**CMP-203.** Occupancy MUST be computed as `min(100, round(nodes / budget × 100))` and the fill's width MUST be set from it [src: `updateBudgetUI()`].

**CMP-204.** The thresholds MUST be exactly 75 % and 98 %. The 98 % threshold, rather than 100 %, exists so that the full state is reached before the **Budget** actually refuses, giving the user a moment of warning [src: `updateBudgetUI()`].

**CMP-205.** The fill's width MUST animate; the colour change MUST NOT. A colour that fades through an intermediate hue reads as a third state that does not exist [src: `.meter__fill`].

### Accessibility

**CMP-206.** The meter MUST carry an accessible name — "Viewport occupancy" [src: `#budgetMeter` container]. It is exposed as an image because it is a graphic summary of numbers already stated in text beside it.

**CMP-207.** The meter MUST NOT be the only expression of occupancy. The **Budget** card states the in-view count and the budget in text, and the status bar repeats the in-view count (DS-108) [src: `updateBudgetUI()`].

### Content rules

The meter carries no content of its own. Its numbers live in the [Budget card](#budget-card).

---

## Graph toolbar

### Purpose

View controls for the graph **Viewport**: zoom, fit, **Layout mode**, relayout, simulation freeze, export and clear. It floats over the canvas at its top-left corner.

### Anatomy

| Part | Description |
|---|---|
| **Card** | A floating, wrapping container [src: `.graph__toolbar`] |
| **Zoom group** | Zoom in, zoom out, fit to view — all icon-only [src: `#gZoomIn`, `#gZoomOut`, `#gFit`] |
| **Separator** | The command-bar separator part [src: `.cmdsep`] |
| **Layout select** | A [Select field](#select-field) with a visually hidden label [src: `#gLayoutMode`] |
| **Relayout button** | Icon-only [src: `#gRelayout`] |
| **Simulation toggle** | Icon-only, a toggle [src: `#gLayout`] |
| **Export split button** | A [Split button with flyout](#split-button-with-flyout) [src: `#gExport`] |
| **Clear button** | A default-variant button [src: `#gClear`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Position | `--sp-3` | 12 px from the canvas's top and left edges |
| Maximum width | — | `calc(100% − 300px)`, so it wraps clear of the **Budget** card [src: `.graph__toolbar`] |
| Padding | `--sp-1` | 4 px |
| Gap | `--sp-1` | 4 px |
| Ground | `--surface` | |
| Border | `--stroke` | 1 px |
| Radius | `--r-card` | 8 px |
| Shadow | `--shadow-flyout` | |
| Layout select width | — | 146 px [src: `#gLayoutMode`] |

### States

| State | Treatment |
|---|---|
| Default | As above; hosted controls own their own states |
| Simulation running | The toggle carries the active ground, its pressed state reads false, and its tooltip reads "Simulation running — click to freeze" [src: `wire()`] |
| Simulation frozen | The active ground is removed, the pressed state reads true, and the tooltip reads "Simulation frozen — click to resume" [src: `wire()`] |
| Layout not simulatable | For a computed **Layout mode** the toggle MUST explain that there is nothing to freeze: "<layout> is computed once, so there is nothing to freeze" [src: `relayout()`] |
| Loading | Not applicable. Relayout runs synchronously and reports its cost by [Toast](#toast): "Force-directed layout over 412 nodes and 780 relationships in 46 ms." [src: `wire()`] |
| Empty | The toolbar MUST remain visible over an empty canvas. Its controls stay live; they simply have nothing to act on |
| Error | Not applicable |

**CMP-208.** The toolbar MUST wrap rather than overflow or clip (DS-116) [src: `.graph__toolbar`].

**CMP-209.** The pressed state of the simulation toggle expresses *frozen*, not *running*, because the button's action is "freeze" [src: `wire()`]. The tooltip MUST make this unambiguous.

### Keyboard

Every control is individually reachable. Two canvas shortcuts duplicate toolbar actions: `F` fits the view and `L` re-runs layout [src: `wireCanvas()`].

### Accessibility

Role `toolbar`, accessible name "Graph view controls" [src: `.graph__toolbar`]. The layout select's label is visually hidden and properly associated [src: `#gLayoutMode`].

### Content rules

**CMP-210.** **Layout mode** options MUST be named for what the reader sees, not for the algorithm's internals: "Auto layout", "Force-directed", "Hierarchy", "Radial", "Cluster grid" [src: `#gLayoutMode`].

**CMP-211.** When the automatic mode is in effect, the status bar MUST name the mode actually chosen and mark it as automatic: "Force-directed (auto)" [src: `relayout()`].

**CMP-212.** "Clear" MUST empty the **Viewport** without touching the **Store**, and the empty state that follows MUST make that distinction plain [src: `wire()`, `#graphEmpty`].

---

## Budget card

### Purpose

Shows and controls the **Viewport** **Budget**: how many nodes may be on screen, how many are, how many neighbours are held back, and what happens on overflow.

### Anatomy

| Part | Description |
|---|---|
| **Card** | A floating panel at the canvas's top-right corner [src: `.graph__budget`] |
| **Title row** | A 12 px semibold uppercase title and the current budget value in monospace [src: `.budget__title`, `.budget__value`] |
| **Slider** | A range input [src: `#budgetRange`] |
| **Meter** | A [Meter](#meter) [src: `#budgetMeter`] |
| **In-view row** | A caption label and a monospace value [src: `#budgetInView`] |
| **Hidden-neighbours row** | A caption label and a monospace value [src: `#budgetHidden`] |
| **Overflow label** | A caption label for the **Eviction** select [src: `#evictMode`] |
| **Eviction select** | A full-width [Select field](#select-field) [src: `#evictMode`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Position | `--sp-3` | 12 px from the canvas's top and right edges |
| Width | — | 264 px; 210 px at the very narrow breakpoint [src: `.graph__budget`, `@media (max-width: 1024px)`] |
| Padding | `--sp-3` | 12 px |
| Ground | `--surface` | |
| Border | `--stroke` | 1 px |
| Radius | `--r-card` | 8 px |
| Shadow | `--shadow-flyout` | |
| Row gap | — | 8 px between groups, 6 px within a row |
| Slider | — | Full width, 20 px tall, accent-tinted [src: `input[type="range"]`] |
| Labels | `--fs-caption` | 12 px `--text-secondary` |
| Values | `--font-mono`, `--fs-body` | 14 px [src: `.budget__value`] |

### Slider

| Metric | Value |
|---|---|
| Minimum | 100 nodes |
| Maximum | 3,000 nodes |
| Step | 100 nodes |
| Default | 1,000 nodes |

[src: `#budgetRange`]

### States

| State | Treatment |
|---|---|
| Default | As above |
| Slider hover, pressed, focus | The platform's own; the accent tint applies throughout [src: `input[type="range"]`] |
| Meter near / full | See [Meter](#meter) |
| **Budget lowered below occupancy** | Nodes are evicted immediately, and a warning [Toast](#toast) names how many: "Budget lowered to 400. Paged out 612 nodes." [src: `wire()`] |
| Disabled | Not applicable |
| Loading | Not applicable; every value updates synchronously [src: `updateBudgetUI()`] |
| Empty | With an empty **Viewport** the meter reads 0 %, in-view reads "0 nodes" and hidden reads "0". The card MUST remain visible so that the **Budget** is discoverable before anything is loaded |
| Error | Not applicable |

**CMP-213.** Every readout MUST update in the same pass: meter width, meter threshold class, in-view count, **Hidden neighbour** total, and the status bar's in-view figures [src: `updateBudgetUI()`].

**CMP-214.** The **Budget** value MUST update live while the slider is dragged, not only on release [src: `wire()`].

### Keyboard

The slider takes arrow keys, Home and End from the platform. The select is reachable by Tab.

### Accessibility

The slider carries the accessible name "Maximum nodes on screen"; the card carries "Viewport budget"; the meter carries "Viewport occupancy" [src: `.graph__budget`].

**CMP-215.** The slider SHOULD expose a text value so that a screen-reader user hears "1,000 nodes" rather than "1000". **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-216.** The card MUST state three numbers: the budget, the in-view count, and the **Hidden neighbour** total. The third is the one that makes the **Budget** model comprehensible — it tells the user how much they are not seeing [src: `updateBudgetUI()`, `totalHidden()`].

**CMP-217.** The **Eviction** select MUST be labelled "On overflow" and its options MUST name the policy plainly: "Evict by distance, then degree", "Evict least recently touched", "Refuse and warn" [src: `#evictMode`].

**CMP-218.** Values MUST carry their unit where it is not obvious: "0 nodes", not "0" [src: `updateBudgetUI()`].

---

## Minimap

### Purpose

Shows the whole laid-out graph in miniature, with a frame marking the portion currently in the **Viewport**.

### Anatomy

| Part | Description |
|---|---|
| **Frame card** | A floating card at the canvas's bottom-right corner [src: `.graph__minimap`] |
| **Canvas** | A drawing surface filling the card [src: `.graph__minimap canvas`] |
| **Node marks** | One small rectangle per node in its kind colour at 85 % opacity — 1.2 px for an **Individual**, 2 px otherwise [src: `drawMinimap()`] |
| **Viewport frame** | A 1 px `--accent` rectangle marking the visible region [src: `drawMinimap()`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Position | `--sp-3` | 12 px from the canvas's bottom and right edges |
| Size | — | 180 × 120 px [src: `.graph__minimap`] |
| Ground | `--surface` card; the drawing surface is filled with `--canvas` [src: `drawMinimap()`] |
| Border | `--stroke` | 1 px |
| Radius | `--r-control` | 4 px |
| Shadow | `--shadow-flyout` | |
| Content padding | — | 6 px inside the fit computation [src: `drawMinimap()`] |

### States

| State | Treatment |
|---|---|
| Default | As above |
| Empty | The surface is cleared to `--canvas` and nothing is drawn; the card remains [src: `drawMinimap()`] |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Error | Not applicable. **Status:** the minimap is display-only in the reference build. Click-to-navigate and drag-the-frame-to-pan are specified, not implemented |

**CMP-219.** The minimap MUST re-fit to the graph's bounds on every frame, so that the miniature never drifts out of date [src: `drawMinimap()`].

**CMP-220.** Node marks MUST use the same kind colours as the main canvas, read from the same palette [src: `nodeColour()`].

### Accessibility

**CMP-221.** The minimap MUST be hidden from assistive technology [src: `.graph__minimap`]. It is a purely spatial summary of information available elsewhere — the node count in the status bar, the **Entity** list in the tree — and exposing it would add noise without adding capability.

**CMP-222.** If click-to-navigate is implemented, the minimap MUST gain a keyboard equivalent, and MUST then be exposed with a name.

### Content rules

The minimap carries no text. It MUST NOT gain labels; at 180 × 120 px they would be unreadable.

---

## Legend

### Purpose

The key to the graph's visual encoding: what each shape and colour means, what the **Pin** marker is, and what the `+n` badge counts.

### Anatomy

| Part | Description |
|---|---|
| **Card** | A floating, wrapping card at the canvas's bottom-left corner [src: `.graph__legend`] |
| **Kind item** | A 14 × 14 **Entity** glyph in the kind's colour, followed by the kind's label [src: `renderLegend()`] |
| **Pin item** | An 8 px `--warn` status dot, followed by "pinned" [src: `renderLegend()`] |
| **Badge item** | The plain text "+n = neighbours held back by the budget" [src: `renderLegend()`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Position | `--sp-3` | 12 px from the canvas's bottom and left edges |
| Maximum width | — | 420 px [src: `.graph__legend`] |
| Padding | `--sp-2` `--sp-3` | 8 px vertical, 12 px horizontal |
| Gap | `--sp-2` / `--sp-3` | 8 px between rows, 12 px between items |
| Item gap | — | 6 px |
| Ground | `--surface` | |
| Border | `--stroke` | 1 px |
| Radius | `--r-control` | 4 px |
| Shadow | `--shadow-flyout` | |
| Text | `--fs-caption` | 12 px, `--text-secondary` |

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hidden | At the narrow breakpoint the legend is removed from the layout entirely (DS-118) [src: `@media (max-width: 1180px)`] |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Error | Not applicable; the legend is a static key |
| Empty | Not applicable; the legend always lists all five kinds regardless of what is in the **Viewport** |

**CMP-223.** The legend MUST list every kind, whether or not it is currently on screen. A key that changes as the **Viewport** changes cannot be learned.

**CMP-224.** The legend MUST be generated from the same kind metadata that drives rendering (DS-79) [src: `renderLegend()`].

### Accessibility

The card carries the accessible name "Node legend"; each glyph is decorative and hidden [src: `#legend`, `renderLegend()`].

### Content rules

**CMP-225.** Kind labels MUST match the labels used everywhere else in the product — the **Inspector** kind chip, the status bar's selection description, the search flyout's kind hint — because all four read from the same metadata [src: `KIND_META`].

**CMP-226.** The legend MUST explain the `+n` badge in words. A badge whose meaning is not stated somewhere is a puzzle [src: `renderLegend()`].

---

## Graph empty-state panel

### Purpose

Occupies the empty **Viewport** with an explanation of why it is empty — which is a deliberate design decision, not a failure — and one action that fills it.

### Anatomy

| Part | Description |
|---|---|
| **Overlay** | A full-canvas centred grid, non-interactive except for its children [src: `.graph__empty`] |
| **Glyph** | The `i-layout` icon at 40 × 40 px in `--text-disabled` [src: `#graphEmpty`] |
| **Heading** | 16 px in `--font-display` [src: `.graph__empty h2`] |
| **Body** | A `--text-secondary` paragraph capped at 44 characters per line [src: `.graph__empty p`] |
| **Action** | A primary button [src: `#emptySeed`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Coverage | — | The full canvas |
| Gap | `--sp-3` | 12 px between elements |
| Padding | `--sp-8` | 32 px |
| Alignment | — | Centred both ways, text centred |
| Glyph | — | 40 × 40 px, `--text-disabled` |
| Heading | `--fs-subtitle` | 16 px, `--font-display` |
| Body | — | `--text-secondary`, maximum 44 characters per line |

**CMP-227.** The overlay MUST be non-interactive, with pointer events restored only on its children, so that the user can still pan and zoom the empty canvas behind it [src: `.graph__empty`].

### States

| State | Treatment |
|---|---|
| Shown | Whenever the **Viewport** holds zero nodes [src: `updateBudgetUI()`] |
| Hidden | As soon as the **Viewport** holds one or more nodes [src: `.graph__empty.is-hidden`, `updateBudgetUI()`] |
| Hover, Pressed, Focus, Selected | Not applicable to the overlay; its button owns these |
| Disabled, Loading, Error | Not applicable |

**CMP-228.** Visibility MUST be derived from the node count in the same update pass as every other **Viewport** readout, never toggled independently [src: `updateBudgetUI()`].

### Keyboard

The action button is reachable by Tab.

### Accessibility

**CMP-229.** The heading SHOULD be exposed as a heading and the panel SHOULD be announced when it appears after the **Viewport** is cleared. **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-230.** The copy MUST explain the product's model, not apologise for the blank screen. The reference copy does exactly this: "The graph never loads an ontology wholesale. Pick a class in the hierarchy, a row in the individuals table, or run a query, and expand outward from there." [src: `#graphEmpty`].

**CMP-231.** The heading MUST state the situation without blame: "Nothing in the viewport yet" [src: `#graphEmpty`].

**CMP-232.** There MUST be exactly one action, and it MUST be concrete rather than generic: "Start from Pizza", not "Get started" [src: `#emptySeed`].

**CMP-233.** The copy MUST NOT be truncated or clamped; it is authored to fit (DS-132) [src: `.graph__empty p`].

---

## Empty state block

### Purpose

The in-flow empty state for a panel body or a table, as distinct from the full-canvas [Graph empty-state panel](#graph-empty-state-panel).

### Anatomy

| Part | Description |
|---|---|
| **Container** | A centred grid [src: `.empty-state`] |
| **Glyph** | Optional, sized by the caller — 28 px in the empty **Inspector** [src: `renderInspector()`] |
| **Heading** | A semibold line in `--text` [src: `.empty-state strong`] |
| **Body** | A 12 px paragraph capped at 40 characters per line [src: `.empty-state p`] |
| **Action** | Optional; an outline-variant button [src: `renderTableRows()`] |

### Sizing

| Metric | Token | Value |
|---|---|---|
| Padding | `--sp-8` `--sp-4` | 32 px vertical, 16 px horizontal |
| Gap | `--sp-2` | 8 px |
| Alignment | — | Centred |
| Colour | `--text-secondary` | with the heading raised to `--text` at weight 600 |
| Body | `--fs-caption` | 12 px, maximum 40 characters per line |

### States

| State | Treatment |
|---|---|
| Default | As above |
| Hover, Pressed, Focus, Selected, Disabled, Loading, Error | Not applicable to the block; its action button owns these |

### Occurrences

| Surface | Heading | Body | Action |
|---|---|---|---|
| Empty **Inspector** | "Nothing selected" | "Pick a class in the hierarchy, a node in the graph, or a row in the individuals table." | none [src: `renderInspector()`] |
| Tree, no filter match | "No match" | "Nothing in the class hierarchy matches that filter. Clear it to see everything again." — with "class" or "property" chosen to match the active tab | none [src: `renderTree()`] |
| Table, no filter match | "No individuals match" | "Loosen the type, branch or text filter, or press Reset to see all 12,000 individuals." | "Reset filters" [src: `renderTableRows()`] |
| Table, no data at all | "No individuals match" | "The demo dataset is empty. Use Dataset on the command bar to generate individuals." | "Reset filters" [src: `renderTableRows()`] |

**CMP-234.** The message MUST distinguish "your filter excluded everything" from "there is nothing here at all". They have different remedies, and a single message cannot serve both [src: `renderTableRows()`].

**CMP-235.** Where an action is offered, it MUST be wired at render time, because the block is created by markup replacement and its previous handler does not survive [src: `renderTableRows()`].

### Accessibility

**CMP-236.** The heading SHOULD be exposed as a heading, and the block SHOULD be announced when it replaces content that was previously present. **Status:** specified, not implemented in the reference build.

### Content rules

**CMP-237.** The heading MUST be three words or fewer.

**CMP-238.** The body MUST name the remedy and, where a count is known, MUST quantify what the remedy would reveal: "…to see all 12,000 individuals" [src: `renderTableRows()`].

**CMP-239.** Copy MUST NOT be jocular, MUST NOT apologise, and MUST NOT use an exclamation mark.

---

## Component-to-token matrix

Tokens each component consumes, directly or through a part it contains. `--r-control` and the focus ring's `--accent` are consumed by every focusable component and are listed only where a component uses them for something other than focus.

| Component | Tokens consumed |
|---|---|
| Title bar | `--h-titlebar`, `--ground`, `--stroke-divider`, `--sp-3`, `--sp-2`, `--fs-caption`, `--text-secondary`, `--accent` (app mark) |
| Window controls | `--h-titlebar`, `--text`, `--layer-hover`, `--dur-fast`, `--ease-out`, `--accent` (focus), `#C42B1C` (documented literal) |
| Command bar | `--h-commandbar`, `--surface`, `--stroke`, `--sp-1`, `--sp-2` |
| Button — default | `--h-control`, `--sp-2`, `--sp-3`, `--r-control`, `--fs-body`, `--text`, `--text-disabled`, `--layer-hover`, `--layer-pressed`, `--layer-selected`, `--dur-fast`, `--ease-out` |
| Button — icon-only | As default, plus `--h-control` as width |
| Button — primary | As default, plus `--accent`, `--accent-hover`, `--accent-pressed`, `--text-on-accent` |
| Button — outline | As default, plus `--stroke-strong`, `--surface` |
| Button — danger | As default, plus `--danger`, `--danger-subtle` |
| Split button | Button tokens, plus the flyout menu's tokens |
| Text field | `--h-control`, `--sp-2`, `--stroke-strong`, `--r-control`, `--surface`, `--surface-alt`, `--text`, `--fs-body`, `--accent`, `--danger` |
| Search field | Text field tokens, plus `--text-secondary` (glyph) and the flyout menu's tokens |
| Select field | Text field tokens, plus `--sp-1` |
| Chip | `--sp-2`, `--stroke`, `--surface-alt`, `--fs-caption`, `--text-secondary`; accent variant adds `--accent-subtle`, `--accent-border`, `--accent` |
| Status dot | The **Entity** palette, or `--warn` |
| Panel | `--surface`, `--h-row`, `--sp-2`, `--sp-3`, `--sp-1`, `--stroke-divider`, `--fs-caption`, `--text-secondary` |
| Tab strip | `--h-row`, `--sp-3`, `--r-control`, `--fs-body`, `--fs-caption`, `--text`, `--text-secondary`, `--layer-hover`, `--accent`, `--dur-fast`, `--ease-out` |
| Splitter | `--stroke`, `--accent`, `--w-left`, `--w-right`, `--h-dock`, `--h-statusbar` |
| Tree row | `--h-tree-row`, `--sp-1`, `--sp-2`, `--sp-6`, `--r-control`, `--text`, `--text-secondary`, `--layer-hover`, `--layer-selected`, `--accent-subtle`, `--fs-caption`, the **Entity** palette, `--dur-fast`, `--ease-out` |
| Inline rename input | `--accent`, `--surface`, `--text`, `--fs-body`, `--danger` (invalid) |
| Inspector section header | `--sp-5`, `--sp-2`, `--stroke-divider`, `--fs-caption`, `--text-secondary` |
| Inspector entity head | `--font-display`, `--fs-subtitle`, `--font-mono`, `--fs-caption`, `--text-secondary`, `--sp-2`, the **Entity** palette |
| Axiom row | `--font-mono`, `--fs-code`, `--sp-1`, `--sp-2`, `--r-control`, `--text-secondary`, `--layer-hover`, `--accent`, `--font-ui` (annotation values) |
| Inferred-axiom row | Axiom row tokens, plus `--e-defined` |
| Key-value list | `--sp-1`, `--sp-3`, `--fs-caption`, `--text-secondary` |
| Note block | `--sp-2`, `--sp-3`, `--surface-alt`, `--stroke-strong`, `--r-control`, `--fs-caption`, `--text-secondary` |
| Virtualised table | `--h-row`, `--sp-3`, `--fs-caption`, `--fs-code`, `--font-mono`, `--surface-alt`, `--stroke`, `--stroke-divider`, `--stroke-strong`, `--text`, `--text-secondary`, `--layer-hover`, `--layer-selected`, `--accent`, `--danger`, `--surface`, `--cols` |
| Filter bar | `--sp-2`, `--sp-3`, `--stroke-divider`, `--fs-caption`, `--text-secondary`, plus field, button and chip tokens |
| Code editor | `--surface-sunken`, `--sp-3`, `--font-mono`, `--fs-code`, `--lh-code`, `--text`, `--accent`, `--e-objprop`, `--e-individual`, `--e-dataprop`, `--warn`, `--text-disabled` |
| Result grid | Virtualised table tokens, plus `--accent` (links) |
| Result status line | `--sp-2`, `--sp-3`, `--stroke-divider`, `--surface-alt`, `--fs-caption`, `--ok`, `--danger`, `--danger-subtle` |
| Example query rail | `--surface-alt`, `--stroke-divider`, `--sp-2`, `--r-control`, `--fs-body`, `--fs-caption`, `--text`, `--text-secondary`, `--layer-hover` |
| Status bar | `--h-statusbar`, `--sp-3`, `--surface-alt`, `--stroke`, `--fs-caption`, `--text`, `--text-secondary`, `--font-mono`, `--layer-hover`, `--r-control` |
| Flyout menu | `--surface`, `--stroke`, `--stroke-divider`, `--r-card`, `--r-control`, `--shadow-flyout`, `--sp-1`, `--sp-2`, `--sp-3`, `--h-row`, `--text`, `--text-secondary`, `--text-disabled`, `--layer-hover`, `--font-mono`, `--fs-caption` |
| Context menu | Flyout menu tokens |
| Modal dialog | `--surface`, `--stroke`, `--r-card`, `--shadow-dialog`, `--sp-1`, `--sp-2`, `--sp-3`, `--sp-4`, `--sp-5`, `--sp-6`, `--font-display`, `--fs-subtitle`, `--fs-caption`, `--text-secondary`, `--danger`, `--dur-base`, `--ease-out` |
| Toast | `--surface`, `--stroke`, `--r-control`, `--shadow-flyout`, `--sp-2`, `--sp-3`, `--sp-6`, `--fs-caption`, `--accent`, `--warn`, `--dur-base`, `--ease-out` |
| Spinner | `--stroke-strong`, `--accent` |
| Skeleton | `--surface-sunken`, `--layer-hover` |
| Meter | `--surface-sunken`, `--stroke-divider`, `--accent`, `--warn`, `--danger`, `--dur-base`, `--ease-out` |
| Graph toolbar | `--sp-1`, `--sp-3`, `--surface`, `--stroke`, `--r-card`, `--shadow-flyout`, plus button and select tokens |
| Budget card | `--sp-3`, `--surface`, `--stroke`, `--r-card`, `--shadow-flyout`, `--fs-caption`, `--fs-body`, `--font-mono`, `--text-secondary`, `--accent`, plus meter and select tokens |
| Minimap | `--sp-3`, `--surface`, `--stroke`, `--r-control`, `--shadow-flyout`, `--canvas`, `--accent`, the **Entity** palette |
| Legend | `--sp-2`, `--sp-3`, `--surface`, `--stroke`, `--r-control`, `--shadow-flyout`, `--fs-caption`, `--text-secondary`, `--warn`, the **Entity** palette |
| Graph empty-state panel | `--sp-3`, `--sp-8`, `--font-display`, `--fs-subtitle`, `--text-secondary`, `--text-disabled`, plus primary button tokens |
| Empty state block | `--sp-2`, `--sp-4`, `--sp-8`, `--fs-caption`, `--text`, `--text-secondary`, plus outline button tokens |

**CMP-240.** This matrix MUST be kept true by test: a build-time check MUST assert that no component references a token absent from its row, and that every token in the catalogue appears in at least one row. A token that appears in no row is dead and MUST be removed or given a consumer.

---

## Appendix A — Native stack mapping (non-normative)

Each component's nearest Windows control, and an honest note on what a native control gives away. Nothing here is binding.

| Component | Nearest Windows / WinUI control | Note |
|---|---|---|
| Title bar | `AppWindowTitleBar` with `ExtendsContentIntoTitleBar` | Near-exact. The system draws the caption buttons, handles snap layouts and mirrors for right-to-left. Adopt it |
| Window controls | System caption buttons | Adopt. The `#C42B1C` literal then disappears |
| Command bar | `CommandBar` with `AppBarButton` and `AppBarSeparator` | Close. `CommandBar` gives overflow for free (CMP-11), which the reference build lacks. Its default 48 px height must be reduced to 40 px |
| Button — default | `Button` with a transparent background style | Near-exact |
| Button — icon-only | `AppBarButton` with `LabelPosition="Collapsed"`, or a `Button` with a `FontIcon` | Exact, once sized to 28 px |
| Button — primary | `Button` with `AccentButtonStyle` | Exact |
| Button — outline | The default `Button` style | Exact |
| Button — danger | **Custom.** WinUI has no destructive button style | Build it from the accent style with the danger brush (CMP-22) |
| Split button | `DropDownButton` | Exact. `SplitButton` is the wrong choice — it has a default action, which CMP-26 forbids |
| Text field | `TextBox` | Near-exact, including the accent underline on focus, which is the Fluent convention the reference build copies |
| Search field | `AutoSuggestBox` with `QueryIcon` | Exact for the global search, and it brings the combobox semantics CMP-37 asks for |
| Select field | `ComboBox` | Exact |
| Chip | **Custom.** `InfoBadge` is close but is sized for counts, not labels | Small custom control over a `Border` |
| Status dot | `Ellipse`, or `InfoBadge` with `AttentionValueInfoBadgeStyle` | Trivial |
| Panel | `Grid` with a `Border`; `Expander` where collapsibility is wanted | Custom composition, no framework control needed |
| Tab strip | `TabView` with `TabWidthMode="SizeToContent"`, or a `Pivot` | `TabView` brings drag-reorder and close buttons that must be switched off. A `ListView` with a custom item template may be cleaner |
| Splitter | **Custom.** WinUI has no `GridSplitter` in the box | The Community Toolkit `GridSplitter` is the usual answer; it must be restyled to a 1 px track with a 7 px hit area and given the keyboard behaviour of CMP-66 |
| Tree row | `TreeView` with `TreeViewItem` | Close, and it virtualises. The 24 px row height and the 14 px indentation step must be overridden; the default is far looser |
| Inline rename input | **Custom.** `TreeViewItem` has no in-place edit | A `TextBox` swapped into the item template |
| Inspector section header | **Custom** | A `TextBlock` plus a `Rectangle`; no control needed |
| Axiom row | **Custom.** `RichTextBlock` with `Hyperlink` inlines | `RichTextBlock` handles the mixed mono/prose and inline links well |
| Key-value list | `Grid` with two columns, or an `ItemsControl` | Trivial |
| Note block | `InfoBar` with `Severity="Informational"` | Close, but `InfoBar` is heavier and has a dismiss affordance that must be removed. A custom `Border` with a dashed stroke is nearer the specification |
| Virtualised table | **Custom.** WinUI has no DataGrid in the box | The Community Toolkit `DataGrid` is the pragmatic choice; sticky headers, column templates, cell editing and virtualisation all come with it, but its default density is far looser than 32 px and its styling is extensive work |
| Filter bar | `Grid` with `VariableSizedWrapGrid`, or a `WrapPanel` | Straightforward |
| Code editor | **Custom.** No syntax-highlighting editor ships with WinUI | Either the two-layer approach specified here over a `TextBox` and a `RichTextBlock`, or a `WebView2` hosting a code editor. The two-layer approach is lighter and keeps the token palette |
| Result grid | As the virtualised table | |
| Result status line | `InfoBar`, or a custom `Border` | A custom band is nearer; `InfoBar` is too tall |
| Example query rail | `ListView` with a two-line item template | Exact |
| Status bar | **Custom.** WinUI has no status bar | A `Grid` of `TextBlock`s; trivial |
| Flyout menu | `MenuFlyout` with `MenuFlyoutItem`, `MenuFlyoutSeparator` | Exact, and it brings the keyboard behaviour of CMP-164 for free. `MenuFlyoutItem.KeyboardAcceleratorTextOverride` is the keyboard-hint part |
| Context menu | `MenuFlyout` via `ContextFlyout` | Exact, and it brings `Shift+F10` support (CMP-169) |
| Modal dialog | `ContentDialog` | Exact, and it brings focus trapping and restoration (CMP-175). Its primary/secondary/close button model maps onto the action row directly |
| Toast | `InfoBar` positioned as an overlay | `InfoBar` gives severity, an icon and a dismiss button. It does *not* auto-dismiss; the 6 s timer of CMP-185 must be added. A Windows toast notification is the wrong control — this is in-app, not system-level |
| Spinner | `ProgressRing` with `IsIndeterminate` | Exact, at 14 px |
| Skeleton | **Custom.** No skeleton control ships with WinUI | A `Rectangle` with an animated `LinearGradientBrush` |
| Meter | `ProgressBar` | Close. Its default height is 4 px and must be set to 6 px; the threshold colours are a value converter on the `Foreground` |
| Graph toolbar | `CommandBar` in a floating `Border`, or a `WrapPanel` of `AppBarButton`s | A `WrapPanel` is nearer, because CMP-208 requires wrapping rather than overflow |
| Budget card | `Border` containing a `Slider`, a `ProgressBar` and a `ComboBox` | The `Slider` brings the text-value support CMP-215 asks for, via `ThumbToolTipValueConverter` |
| Minimap | **Custom.** A `CanvasControl` (Win2D) or a `SwapChainPanel` | Same surface technology as the main canvas |
| Legend | `ItemsControl` with a `WrapPanel` panel template | Trivial |
| Graph empty-state panel | **Custom** | A centred `StackPanel` over the canvas |
| Empty state block | **Custom** | A centred `StackPanel` |

### Controls needing a custom implementation

Eleven components have no adequate in-box Windows control and MUST be built:

1. **Splitter** — no in-box `GridSplitter`; the toolkit version needs restyling and keyboard support.
2. **Virtualised table** — no in-box DataGrid; the toolkit version needs substantial restyling to reach compact density.
3. **Code editor with syntax overlay** — no syntax-highlighting editor in the framework.
4. **Status bar** — no status bar control.
5. **Chip** — `InfoBadge` is sized for counts, not labels.
6. **Skeleton** — no skeleton control.
7. **Minimap** — a second drawing surface, inherently custom.
8. **Graph empty-state panel** and **Empty state block** — composition, not a control.
9. **Inline rename input** — `TreeViewItem` has no in-place edit mode.
10. **Danger button variant** — WinUI ships no destructive button style.
11. **Inspector section header** and **Axiom row** — composition over `RichTextBlock`.

The remaining components map onto in-box controls, and in four cases the in-box control is strictly better than the reference build: `MenuFlyout` brings menu keyboard navigation, `ContentDialog` brings focus trapping and restoration, `CommandBar` brings command overflow, and `AutoSuggestBox` brings combobox semantics. Each of those is an open defect in this document — CMP-164, CMP-175, CMP-11 and CMP-37 — that adopting the platform control closes at no cost.

