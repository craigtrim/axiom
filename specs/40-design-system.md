# Axiom Design System

**Purpose.** This document defines the complete visual language of Axiom — every design token, its light and dark value, the contrast it achieves, and the typographic, spatial, motion, iconographic and accessibility rules that bind every surface and control in the product.

**Status:** Normative

**Owned prefix:** `DS`

**Related documents:** [`README.md`](README.md) · [`00-product-overview.md`](00-product-overview.md) · [`41-component-library.md`](41-component-library.md) · [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md) · [`50-visual-reference.html`](50-visual-reference.html) · [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md)

---

## Scope

This document is the single source of truth for Axiom's visual system. It governs:

- the token catalogue and the rules for defining, overriding and consuming tokens;
- the light and dark themes, and the relationship (or deliberate lack of one) between them;
- typography, spacing, motion, iconography and elevation;
- the colour encoding of the five **Entity** kinds;
- the accessibility contract and the contrast audit;
- responsive behaviour down to the minimum supported window width.

It does **not** define component anatomy — that is [`41-component-library.md`](41-component-library.md) — nor the drawing of the graph **Viewport**, which is [`22-graph-rendering-and-export.md`](22-graph-rendering-and-export.md). Where this document names a **Design token**, the component library consumes it; where the component library names a metric, it resolves to a token defined here.

**DS-1.** Every value in this document is normative. An implementation MUST reproduce the listed values exactly. Where a value is marked as unused in the reference build, the implementation MUST still define the token, because downstream documents reference it.

---

## Design principles

These five principles are derived from the reference implementation, not imposed on it. Each one is testable: a review MUST be able to point at a screen and say whether it holds.

**DS-2.** **Platform-native over bespoke.** Axiom MUST look like a Windows 11 application, not like a web page rendered in a window. The type family is the platform UI family; the grounds are layered Mica-style neutrals; the control metrics follow the Fluent compact tier; the window controls occupy the standard 46 px cells at the top right [src: `.wincontrol`]. Where a platform convention and a bespoke idea conflict, the platform convention MUST win. A designer's preference is not a reason to diverge; a measured usability problem is.

**DS-3.** **Density serves the professional user.** Axiom is a workbench, used for hours, over ontologies with hundreds of thousands of triples. Vertical rhythm is therefore tight: the base spacing unit is 4 px, the standard control is 28 px tall, a table row is 32 px and a tree row is 24 px [src: `--sp-1`, `--h-control`, `--h-row`, `--h-tree-row`]. Implementations MUST NOT inflate these to a marketing-site scale. Density is not clutter: it is the reason a user can see forty classes at once rather than twelve.

**DS-4.** **Hierarchy from type, weight, colour and whitespace — not from borders and cards.** Sections in the **Inspector** are separated by a small-caps label and a one-pixel rule that runs to the right edge, not by a boxed card [src: `.section__head`, `.section__rule`]. **Panel** headings are 12 px, semibold, uppercase, letter-spaced, in secondary text colour [src: `.panel__title`]. Implementations MUST NOT add a border or a background fill where a weight change and 20 px of space already establish the hierarchy.

**DS-5.** **Colour never carries meaning alone.** Every state and every category that is signalled by colour MUST also be signalled by shape, icon, text or position. The five **Entity** kinds each carry a distinct silhouette as well as a distinct hue [src: `KIND_META`]. A **Pin**ned node carries an amber dot *and* an entry in the legend *and* a context-menu label [src: `renderLegend()`]. Sort direction is an arrow glyph as well as an accent colour [src: `.sortmark`]. Query success is a tick icon plus a row count, not a green bar [src: `runQuery()`].

**DS-6.** **Every value lives in a token.** No component rule may hard-code a colour, a size, a radius, a duration or a font family. See [Token architecture](#token-architecture) for the full rule and its two documented exceptions.

---

## Token architecture

**DS-7.** Every colour, size, radius, duration, easing curve and font family used anywhere in the product MUST be defined exactly once, as a named **Design token**, in the token layer. Component rules MUST reference tokens by name and MUST NOT restate a literal value. The reference implementation states this as a comment above the token block: "Every colour, size, radius and duration lives here; component rules below never hard-code a visual value" [src: `:root`].

**DS-8.** Tokens MUST be declared in two tiers:

- **Tier 1 — theme-invariant tokens.** Typography families, the font size scale, line heights, the spacing scale, control metrics, radii, motion durations and easing curves. These are declared once on the document root and do not change between themes [src: `:root`].
- **Tier 2 — theme-variant tokens.** Grounds, surfaces, strokes, text colours, the accent family, interaction layers, shadows, semantic colours and the **Entity** palette. These are declared once per theme [src: `:root, [data-theme="light"]`, `[data-theme="dark"]`].

**DS-9.** The theme override mechanism MUST work as follows. A single theme attribute is set on the document root; each theme block redeclares the full set of Tier 2 tokens under that attribute's value. Light is the default and is declared on the root selector as well as on the explicit light selector, so a document with no theme attribute renders light [src: `:root, [data-theme="light"]`]. Switching theme MUST be a single attribute write; it MUST NOT require re-rendering the tree, re-registering styles, or touching a component [src: `setTheme()`].

**DS-10.** Consumers that cannot read tokens through the style system — principally the immediate-mode graph canvas — MUST read the resolved token values once per theme change into a palette object, and MUST re-read them on every theme change. The reference implementation resolves fifteen tokens into a palette and calls that resolver from the theme setter [src: `refreshPalette()`, `setTheme()`]. Canvas drawing code MUST read from the palette, never from a literal.

**DS-11.** Two categories of literal are permitted, and only these two:

1. **Optical constants inside a single component** that have no reuse and no theme dependence — for example the 11 px pill radius of a chip whose height is 22 px, the 2 px inner radius of an inline editor, or the 6 px scrollbar thumb radius [src: `.chip`, `.cell-input`, `::-webkit-scrollbar-thumb`]. These MUST be confined to the component's own rule.
2. **The window close-button hover fill**, `#C42B1C` with a `#FFFFFF` glyph, which is a fixed Windows system value in both themes and is deliberately not themed [src: `.wincontrol--close:hover`].

Any other literal is a defect.

**DS-12.** Runtime layout dimensions that the user can change MUST also be tokens, written to the document root by the interaction that changes them, with a default supplied by the consuming rule. Three such tokens exist: the left panel width, the right panel width and the dock height [src: `--w-left`, `--w-right`, `--h-dock`, `wireSplitter()`]. They are listed in [Runtime layout tokens](#runtime-layout-tokens).

**DS-13.** A layout primitive layer MAY be used for structure-only rules — display, flex and grid, overflow, wrapping, aspect ratio — provided it is declared in a lower cascade layer than product styling so that product rules always win, and provided it sets no colour, no font and no fixed size [src: `@layer od-layout`]. Its gap variable defaults MUST be expressed in the same 4 px rhythm as the spacing scale.

---

## Token catalogue

Every token in the reference build is listed below. "Light" and "Dark" give the two theme values; "*(same)*" means the token is theme-invariant.

### Typography tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--font-ui` | `"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif` | *(same)* | All interface text: buttons, labels, tree rows, table cells, menu items, status bar [src: `--font-ui`] |
| `--font-display` | `"Segoe UI Variable Display", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif` | *(same)* | Titles only: **Inspector** entity name, dialog heading, graph empty-state heading [src: `--font-display`] |
| `--font-mono` | `"Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, "SFMono-Regular", monospace` | *(same)* | IRIs, axioms, SPARQL source, numeric table columns, keyboard hints, status-bar counters [src: `--font-mono`] |
| `--fs-caption` | `12px` | *(same)* | Panel titles, section titles, chips, table headers, status bar, IRI line, hints, legend [src: `--fs-caption`] |
| `--fs-body` | `14px` | *(same)* | Document default, buttons, fields, tree labels, table cells, menu items [src: `--fs-body`] |
| `--fs-subtitle` | `16px` | *(same)* | Dialog heading, **Inspector** entity name, graph empty-state heading [src: `--fs-subtitle`] |
| `--fs-title` | `20px` | *(same)* | Largest step in the scale. **Status:** specified, not implemented in the reference build — declared but never referenced [src: `--fs-title`] |
| `--fs-code` | `13px` | *(same)* | Monospace contexts: axiom rows, SPARQL editor, numeric and mono table cells [src: `--fs-code`] |
| `--lh-body` | `1.5` | *(same)* | Document line height [src: `--lh-body`] |
| `--lh-code` | `1.55` | *(same)* | SPARQL editor and its highlight overlay; the two MUST share it exactly or the overlay drifts [src: `--lh-code`, `.sparql__hl`] |

### Spacing tokens

| Token | Value | Usage |
|---|---|---|
| `--sp-1` | `4px` | Command-bar gaps, toolbar gaps, tree row insets, axiom row padding, menu padding, form row gaps [src: `--sp-1`] |
| `--sp-2` | `8px` | The default gap. Field padding, panel head gaps, chip padding, filter bar padding, dialog action gaps [src: `--sp-2`] |
| `--sp-3` | `12px` | Button horizontal padding, table cell padding, panel head left inset, graph overlay insets, editor padding [src: `--sp-3`] |
| `--sp-4` | `16px` | **Inspector** horizontal padding, dialog paragraph spacing, empty-state horizontal padding [src: `--sp-4`] |
| `--sp-5` | `20px` | Space above an **Inspector** section; dialog action row top margin [src: `--sp-5`] |
| `--sp-6` | `24px` | Dialog padding; tree bottom padding; graph toast bottom offset [src: `--sp-6`] |
| `--sp-8` | `32px` | Empty-state vertical padding; **Inspector** bottom padding [src: `--sp-8`] |

There is no `--sp-7`. The scale is 4, 8, 12, 16, 20, 24, 32 — seven steps, not eight.

### Control metric tokens

| Token | Value | Usage |
|---|---|---|
| `--h-control` | `28px` | Every button, text field, search field and select field; also the width of an icon-only button [src: `--h-control`, `.btn--icon`] |
| `--h-row` | `32px` | Panel header, tab, table header cell, table row, menu item; also the collapsed dock height [src: `--h-row`] |
| `--h-tree-row` | `24px` | Tree row height, and the virtualisation unit of the class tree [src: `--h-tree-row`] |
| `--h-titlebar` | `32px` | Title bar band in the window grid [src: `--h-titlebar`] |
| `--h-commandbar` | `40px` | Command bar band in the window grid [src: `--h-commandbar`] |
| `--h-statusbar` | `26px` | Status bar band in the window grid; also subtracted in the dock splitter bound [src: `--h-statusbar`, `wireSplitter()`] |

**DS-14.** The virtualised table row height MUST equal `--h-row` (32 px). The reference implementation duplicates this as a script constant used for scroll arithmetic [src: `ROW_H`, `.tbl__row`]. An implementation MUST derive the scroll constant from the token rather than restating it, or MUST assert their equality in test.

### Radius tokens

| Token | Value | Usage |
|---|---|---|
| `--r-control` | `4px` | Buttons, fields, chips other than the pill chip, tree rows, menu items, axiom rows, minimap, legend, toast, status-bar buttons, focus ring [src: `--r-control`] |
| `--r-card` | `8px` | Flyout menus, dialog, graph toolbar, **Budget** card [src: `--r-card`] |
| `--r-window` | `8px` | Outer window corner. **Status:** specified, not implemented in the reference build — declared but never referenced [src: `--r-window`] |

### Motion tokens

| Token | Value | Usage |
|---|---|---|
| `--dur-fast` | `120ms` | Hover and pressed transitions on buttons, window controls, tabs; tree twisty rotation [src: `--dur-fast`] |
| `--dur-base` | `200ms` | Entrances: scrim fade, dialog pop, toast fade-and-rise; also the meter fill width [src: `--dur-base`] |
| `--dur-exit` | `140ms` | Exit transitions. **Status:** specified, not implemented in the reference build — declared but never referenced [src: `--dur-exit`] |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Every entrance and every state transition in the reference build [src: `--ease-out`] |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Exits. **Status:** specified, not implemented in the reference build — declared but never referenced [src: `--ease-in`] |

Two animation durations are stated outside the token set because they are indefinite loops rather than transitions: the spinner rotates at `700ms` linear, infinite [src: `.spinner`], and the skeleton shimmer runs at `1.4s` ease-in-out, infinite [src: `.skeleton`]. Both MUST be tokenised in a shipping implementation.

### Ground and surface tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--ground` | `#F3F3F3` | `#202020` | The window backdrop. Title bar, the workspace grid gutters, body background [src: `--ground`, `.win`, `.titlebar`] |
| `--surface` | `#FFFFFF` | `#2B2B2B` | Raised content: command bar, panels, dock, flyouts, dialog, graph overlay cards, fields [src: `--surface`] |
| `--surface-alt` | `#FAFAFA` | `#272727` | Quiet secondary bands: table header, dock header, status bar, SPARQL status line and side rail, note block, field hover [src: `--surface-alt`] |
| `--surface-sunken` | `#EDEDED` | `#1A1A1A` | Recessed wells: the SPARQL editor gutter, the meter track, the skeleton base [src: `--surface-sunken`] |
| `--canvas` | `#F7F7F9` | `#17171A` | The graph **Viewport** ground. Also the label halo colour and the notch colour on a defined-class node [src: `--canvas`, `renderScene()`] |
| `--canvas-grid` | `#E4E4EA` | `#27272C` | The 34 px dot grid painted on the canvas, and the radial **Layout mode**'s guide rings [src: `--canvas-grid`, `renderScene()`] |

**DS-15.** The four content grounds MUST form a monotonic light-to-dark ordering in light theme (`--surface` lightest, then `--surface-alt`, then `--ground`, then `--surface-sunken`) and the mirror ordering in dark. The graph canvas sits outside this ladder: it is deliberately cooler and, in dark theme, darker than every panel ground, so the **Viewport** reads as a distinct working area rather than as another panel.

### Stroke tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--stroke` | `#E1E1E1` | `#3D3D3D` | Container edges: command bar bottom, panel and dock edges, menu border, dialog border, chip border, graph overlay card borders, command-bar separator, status-bar separator [src: `--stroke`] |
| `--stroke-strong` | `#C4C4C4` | `#565656` | Interactive edges: field border, outline button border, dashed note border, spinner track, scrollbar thumb, the editable-cell hover ring, and the graph edge colour [src: `--stroke-strong`] |
| `--stroke-divider` | `#EAEAEA` | `#343434` | In-container rules: panel head and toolbar bottoms, table row separators, header cell separators, **Inspector** section rules, menu separators, filter bar bottom [src: `--stroke-divider`] |

### Text tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--text` | `#1B1B1B` | `#F5F5F5` | Primary body text, tree labels, table cells, menu items, node labels on canvas [src: `--text`] |
| `--text-secondary` | `#5A5A5A` | `#C2C2C2` | Panel titles, section titles, captions, table headers, IRIs, chips, status bar, keyboard hints, legend, axiom kind prefixes [src: `--text-secondary`] |
| `--text-disabled` | `#8A8A8A` | `#8C8C8C` | Disabled buttons and menu items; the SPARQL comment token; the empty-state glyph; the scrollbar thumb on hover [src: `--text-disabled`] |
| `--text-on-accent` | `#FFFFFF` | `#06121C` | Text and glyphs on an accent fill: the primary button, the text selection highlight [src: `--text-on-accent`, `.btn--primary`, `::selection`] |

**DS-16.** `--text-on-accent` is not white in dark theme. The dark accent is a light blue, so the on-accent colour MUST be a near-black (`#06121C`). An implementation that hard-codes white on the primary button is a defect.

### Accent family tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--accent` | `#0F6CBD` | `#6CB8F6` | The single brand accent. Primary button fill, focus ring, selected-tab indicator, splitter hover, meter fill, sort mark, links in axioms and query results, editor focus ring, minimap frame, selected-node ring, emphasised graph edges, app mark [src: `--accent`] |
| `--accent-hover` | `#115EA3` | `#8CC8F8` | Primary button hover fill only [src: `--accent-hover`, `.btn--primary:hover`] |
| `--accent-pressed` | `#0C3B5E` | `#479EF5` | Primary button pressed fill only [src: `--accent-pressed`, `.btn--primary:active`] |
| `--accent-subtle` | `#EFF6FC` | `#11293E` | Quiet accent ground: accent chip fill, tree match highlight [src: `--accent-subtle`] |
| `--accent-border` | `#B4D6FA` | `#2B5C86` | Accent chip border [src: `--accent-border`, `.chip--accent`] |

**DS-17.** Axiom MUST have exactly one accent hue. A second brand colour MUST NOT be introduced. The **Entity** palette is a categorical encoding, not a set of brand accents, and MUST NOT be used for interactive affordances outside the graph and its legend — with the single documented exception of the SPARQL syntax tokens, which borrow four **Entity** hues as a code palette [src: `.tok-kw`, `.tok-iri`, `.tok-str`].

### Interaction layer tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--layer-hover` | `rgba(0,0,0,0.037)` | `rgba(255,255,255,0.06)` | Hover fill on buttons, window controls, tabs, tree rows, table rows, menu items, header cells, axiom rows, status-bar buttons, query example items; also the inferred-axiom ground and the skeleton highlight stop [src: `--layer-hover`] |
| `--layer-pressed` | `rgba(0,0,0,0.07)` | `rgba(255,255,255,0.10)` | Pressed fill on buttons [src: `--layer-pressed`, `.btn:active`] |
| `--layer-selected` | `#EAF3FB` | `#143349` | Selection ground: selected tree row, selected table row, an expanded or active toggle button [src: `--layer-selected`] |

**DS-18.** The hover and pressed layers MUST be translucent so that they compose correctly over any ground. The selected layer MUST be opaque, because selection is a persistent state that must read identically on `--surface` and on `--surface-alt`, and must not accumulate when a hovered row is also selected.

### Shadow tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--shadow-flyout` | `0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)` | `0 8px 16px rgba(0,0,0,0.50), 0 0 2px rgba(0,0,0,0.60)` | Flyout menus, context menu, graph toolbar, **Budget** card, minimap, legend, toast [src: `--shadow-flyout`] |
| `--shadow-dialog` | `0 32px 64px rgba(0,0,0,0.24), 0 0 8px rgba(0,0,0,0.20)` | `0 32px 64px rgba(0,0,0,0.60), 0 0 8px rgba(0,0,0,0.60)` | The modal dialog only [src: `--shadow-dialog`, `.dialog`] |

**DS-19.** There are exactly two shadow tiers. A third MUST NOT be introduced. Each tier is a two-part shadow: a large soft offset shadow for depth and a tight ambient shadow for edge definition. Dark-theme shadows are substantially heavier in opacity than light, because a shadow on a dark ground must work harder to separate two similar values.

### Semantic colour tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--ok` | `#0E700E` | `#79CE79` | Query-success tick in the SPARQL status line [src: `--ok`, `runQuery()`] |
| `--warn` | `#8A5200` | `#E3A13C` | Warning toast icon and left rule; meter fill at 75–98 % occupancy; **Pin**ned-node marker; numeric syntax token [src: `--warn`] |
| `--danger` | `#B10E1C` | `#FF9A9A` | Destructive button text; required-field marker; inline form error; invalid-cell ring; meter fill at ≥ 98 %; SPARQL error text and left rule [src: `--danger`] |
| `--danger-subtle` | `#FDF3F4` | `#3B1F21` | Danger button hover fill; SPARQL error ground [src: `--danger-subtle`] |

**DS-20.** There is no `--ok-subtle` and no `--warn-subtle`. Success and warning are expressed by an icon plus text, not by a tinted band. Only the danger state earns a subtle ground, because a failed query must be findable by eye without reading it.

### Entity palette tokens

| Token | Light | Dark | Entity kind | Shape | Icon |
|---|---|---|---|---|---|
| `--e-class` | `#0F6CBD` | `#6CB8F6` | Class | Rounded rectangle | `i-class` |
| `--e-defined` | `#B36A00` | `#E3A13C` | Defined class | Rounded rectangle with a plus notch | `i-defined` |
| `--e-individual` | `#0E7C66` | `#5FCFB4` | **Individual** | Circle | `i-individual` |
| `--e-objprop` | `#7A46C0` | `#C09BF0` | Object property | Diamond | `i-objprop` |
| `--e-dataprop` | `#A8446F` | `#F095C0` | Data property | Hexagon | `i-dataprop` |
| `--e-literal` | `#6A6A6A` | `#ABABAB` | Literal | — | — |

[src: `KIND_META`, `--e-class` … `--e-literal`, `nodePath()`]

**DS-21.** `--e-literal` is declared in both themes and referenced nowhere in the reference build. **Status:** specified, not implemented in the reference build. An implementation MUST define it, because a future literal-node rendering mode and the **ABox** value display both depend on it; until such a mode exists it MUST NOT appear in the legend.

**DS-22.** In light theme `--e-class` holds the same value as `--accent` (`#0F6CBD`), and in dark theme the same value as `--accent` (`#6CB8F6`). This is intentional: the Class is the primary **Entity** and the accent is the primary colour. They MUST remain separate tokens so that a theme MAY diverge them without editing component rules.

**DS-23.** In dark theme `--e-defined` holds the same value as `--warn` (`#E3A13C`). This is a coincidence of palette selection, not a semantic link. Implementations MUST NOT collapse the two tokens.

### Runtime layout tokens

| Token | Default | Bounds | Written by | Usage |
|---|---|---|---|---|
| `--w-left` | `280px` | 180 px – 520 px | Left splitter drag | Hierarchy panel column width [src: `.workspace`, `wireSplitter()`] |
| `--w-right` | `320px` | 240 px – 560 px | Right splitter drag | **Inspector** panel column width [src: `.workspace`, `wireSplitter()`] |
| `--h-dock` | `288px` | 120 px – (window height − 260 px) | Dock splitter drag | Bottom dock row height [src: `.main`, `wireSplitter()`] |

**DS-24.** Runtime layout tokens MUST be written to the document root, not to the element, so that the value survives a re-render of the panel's contents and so that the graph canvas — which is a sibling, not a child — resizes from the same source [src: `wireSplitter()`].

### Auxiliary tokens

| Token | Default | Usage |
|---|---|---|
| `--od-gap` | `8px` (containers), `12px` (grid), `2px` (stacked fields) | Gap override for the layout primitive layer [src: `@layer od-layout`] |
| `--od-cols` | `3` | Column count for the primitive grid [src: `.od-grid`] |
| `--od-ratio` | `auto` | Aspect ratio opt-in for media [src: `.od-media`] |
| `--od-rail-pad` | `16px` | Inline padding and scroll padding of a horizontal rail [src: `.od-rail`] |
| `--cols` | *(set per table)* | The grid template for a virtualised table's header and rows; set once on the header, once on the row host, and restated per row [src: `.tbl__head`, `renderTableHead()`, `renderTableRows()`] |

---

## Contrast audit

**DS-25.** Every foreground/background pair that carries text or an essential graphic MUST be audited in **both** themes. Dark-theme values MUST be chosen and audited independently. An implementation MUST NOT derive a dark value by inverting, rotating or algorithmically lightening a light value; the reference build's dark accent (`#6CB8F6`) is not a transform of its light accent (`#0F6CBD`), and its dark danger (`#FF9A9A`) is not a transform of `#B10E1C`.

**DS-26.** The applicable thresholds are:

- **4.5:1** — body text below 18.66 px regular or 14 px bold. This covers `--fs-caption` (12 px), `--fs-body` (14 px regular) and `--fs-code` (13 px).
- **3:1** — large text (≥ 18.66 px regular or ≥ 14 px bold) and essential non-text graphics: focus rings, the selected-tab indicator, graph node fills, the sort mark, the meter fill, status icons.
- **No threshold** — disabled text, and purely decorative graphics such as the canvas dot grid and container hairlines whose absence would not prevent use.

All ratios below are computed from the hex values by the WCAG 2.x relative-luminance formula and rounded to two decimals.

### Primary text on every ground

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--text` | `--ground` | 15.52 | 14.94 | 4.5 | Pass / Pass |
| `--text` | `--surface` | 17.22 | 12.99 | 4.5 | Pass / Pass |
| `--text` | `--surface-alt` | 16.50 | 13.70 | 4.5 | Pass / Pass |
| `--text` | `--surface-sunken` | 14.71 | 15.96 | 4.5 | Pass / Pass |
| `--text` | `--canvas` | 16.10 | 16.41 | 4.5 | Pass / Pass |
| `--text` | `--layer-selected` | 15.35 | 12.04 | 4.5 | Pass / Pass |
| `--text` | `--accent-subtle` | 15.80 | 13.66 | 4.5 | Pass / Pass |
| `--text` | `--danger-subtle` | 15.83 | 13.72 | 4.5 | Pass / Pass |
| `--text` | `--layer-hover` over `--surface` (effective `#F6F6F6` / `#383838`) | 15.94 | 10.76 | 4.5 | Pass / Pass |
| `--text` | `--layer-hover` over `--ground` (effective `#EAEAEA` / `#2D2D2D`) | 14.32 | 12.63 | 4.5 | Pass / Pass |
| `--text` | `--layer-pressed` over `--surface` (effective `#EDEDED` / `#404040`) | 14.71 | 9.51 | 4.5 | Pass / Pass |

### Secondary text on every ground

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--text-secondary` | `--ground` | 6.22 | 9.15 | 4.5 | Pass / Pass |
| `--text-secondary` | `--surface` | 6.90 | 7.95 | 4.5 | Pass / Pass |
| `--text-secondary` | `--surface-alt` | 6.61 | 8.39 | 4.5 | Pass / Pass |
| `--text-secondary` | `--surface-sunken` | 5.89 | 9.77 | 4.5 | Pass / Pass |
| `--text-secondary` | `--canvas` | 6.45 | 10.04 | 4.5 | Pass / Pass |
| `--text-secondary` | `--layer-selected` | 6.15 | 7.37 | 4.5 | Pass / Pass |
| `--text-secondary` | `--accent-subtle` | 6.32 | 8.36 | 4.5 | Pass / Pass |
| `--text-secondary` | `--danger-subtle` | 6.34 | 8.40 | 4.5 | Pass / Pass |
| `--text-secondary` | `--layer-hover` over `--surface` | 6.38 | 6.58 | 4.5 | Pass / Pass |

### Disabled text on every ground

Disabled text is exempt from WCAG 1.4.3. The ratios are recorded so that a future change is visible.

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--text-disabled` | `--ground` | 3.11 | 4.85 | — | Exempt |
| `--text-disabled` | `--surface` | 3.45 | 4.21 | — | Exempt |
| `--text-disabled` | `--surface-alt` | 3.31 | 4.44 | — | Exempt |
| `--text-disabled` | `--surface-sunken` | 2.95 | 5.18 | — | Exempt |
| `--text-disabled` | `--canvas` | 3.23 | 5.32 | — | Exempt |
| `--text-disabled` | `--layer-selected` | 3.08 | 3.90 | — | Exempt |
| `--text-disabled` | `--accent-subtle` | 3.17 | 4.43 | — | Exempt |
| `--text-disabled` | `--danger-subtle` | 3.17 | 4.45 | — | Exempt |

**DS-27.** `--text-disabled` is exempt only where it marks a genuinely inactive control. The reference build also uses it for the SPARQL comment token on `--surface-sunken` (2.95:1 light, 5.18:1 dark) [src: `.tok-com`]. That is readable text, not a disabled control, and the light value **fails**. An implementation MUST NOT use `--text-disabled` for the comment token; it MUST introduce a dedicated code-comment token meeting 4.5:1 against `--surface-sunken` in both themes. **Status:** specified, not implemented in the reference build.

### Accent on every ground

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--accent` | `--surface` | 5.38 | 6.62 | 4.5 (text), 3 (ring) | Pass / Pass |
| `--accent` | `--ground` | 4.85 | 7.62 | 4.5 | Pass / Pass |
| `--accent` | `--surface-alt` | 5.16 | 6.99 | 4.5 | Pass / Pass |
| `--accent` | `--surface-sunken` | 4.60 | 8.14 | 4.5 | Pass / Pass |
| `--accent` | `--canvas` | 5.03 | 8.37 | 3 (ring, minimap frame) | Pass / Pass |
| `--accent` | `--layer-selected` | 4.80 | 6.14 | 4.5 | Pass / Pass |
| `--accent` | `--accent-subtle` | 4.94 | 6.96 | 4.5 | Pass / Pass |

**DS-28.** The light accent on `--surface-sunken` clears 4.5:1 by 0.10. Any future adjustment to `--surface-sunken` or to `--accent` MUST re-run this pair; it is the tightest passing text pair in the light theme.

### On-accent text

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--text-on-accent` | `--accent` | 5.38 | 8.84 | 4.5 | Pass / Pass |
| `--text-on-accent` | `--accent-hover` | 6.66 | 10.56 | 4.5 | Pass / Pass |
| `--text-on-accent` | `--accent-pressed` | 11.65 | 6.73 | 4.5 | Pass / Pass |
| `#FFFFFF` | `#C42B1C` (close-button hover) | 5.66 | 5.66 | 4.5 | Pass / Pass |

### Semantic colours

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--ok` | `--surface-alt` (SPARQL status band) | 6.02 | 7.77 | 3 (icon) | Pass / Pass |
| `--ok` | `--surface` | 6.28 | 7.36 | 3 | Pass / Pass |
| `--warn` | `--surface` (toast icon and rule) | 6.39 | 6.36 | 3 | Pass / Pass |
| `--warn` | `--surface-sunken` (meter fill on track) | 5.46 | 7.81 | 3 | Pass / Pass |
| `--warn` | `--canvas` (**Pin** marker) | 5.97 | 8.03 | 3 | Pass / Pass |
| `--danger` | `--surface` (danger button text) | 7.12 | 6.97 | 4.5 | Pass / Pass |
| `--danger` | `--danger-subtle` (error band, hover fill) | 6.55 | 7.37 | 4.5 | Pass / Pass |
| `--danger` | `--surface-sunken` (meter fill on track) | 6.08 | 8.57 | 3 | Pass / Pass |

### Entity colours against the canvas ground

Node fills are essential graphics; the applicable threshold is 3:1.

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--e-class` | `--canvas` | 5.03 | 8.37 | 3 | Pass / Pass |
| `--e-defined` | `--canvas` | 3.94 | 8.03 | 3 | Pass / Pass |
| `--e-individual` | `--canvas` | 4.79 | 9.43 | 3 | Pass / Pass |
| `--e-objprop` | `--canvas` | 5.66 | 7.83 | 3 | Pass / Pass |
| `--e-dataprop` | `--canvas` | 5.27 | 8.32 | 3 | Pass / Pass |
| `--e-literal` | `--canvas` | 5.06 | 7.79 | 3 | Pass / Pass (token unused) |

### Entity colours as icon and as code text

**Entity** colours appear as 14 px icon strokes in the tree, the legend, the **Inspector** head, the search flyout and the individual column of the table [src: `renderTree()`, `renderLegend()`, `renderInspector()`, `renderTableRows()`], and as SPARQL syntax-token text on `--surface-sunken` [src: `.tok-kw`, `.tok-iri`, `.tok-str`].

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--e-class` | `--surface` | 5.38 | 6.62 | 3 (icon) | Pass / Pass |
| `--e-defined` | `--surface` | 4.22 | 6.36 | 3 (icon) | Pass / Pass |
| `--e-individual` | `--surface` | 5.13 | 7.46 | 3 (icon) | Pass / Pass |
| `--e-objprop` | `--surface` | 6.06 | 6.19 | 3 (icon) | Pass / Pass |
| `--e-dataprop` | `--surface` | 5.64 | 6.58 | 3 (icon) | Pass / Pass |
| `--e-defined` | `--surface` (inferred-axiom rule) | 4.22 | 6.36 | 3 (graphic) | Pass / Pass |
| `--e-objprop` (`.tok-kw`, 600 weight) | `--surface-sunken` | 5.18 | 7.61 | 4.5 (text) | Pass / Pass |
| `--e-individual` (`.tok-iri`) | `--surface-sunken` | 4.38 | 9.18 | 4.5 (text) | **Fail** / Pass |
| `--e-dataprop` (`.tok-str`) | `--surface-sunken` | 4.82 | 8.09 | 4.5 (text) | Pass / Pass |
| `--accent` (`.tok-var`) | `--surface-sunken` | 4.60 | 8.14 | 4.5 (text) | Pass / Pass |
| `--warn` (`.tok-num`) | `--surface-sunken` | 5.46 | 7.81 | 4.5 (text) | Pass / Pass |
| `--text-disabled` (`.tok-com`) | `--surface-sunken` | 2.95 | 5.18 | 4.5 (text) | **Fail** / Pass |

**DS-29.** The light-theme IRI syntax token fails at 4.38:1 and the light-theme comment token fails at 2.95:1. An implementation MUST define a dedicated code-syntax palette rather than reusing `--e-individual` and `--text-disabled`, and every member of that palette MUST clear 4.5:1 against `--surface-sunken` in both themes. **Status:** specified, not implemented in the reference build.

### Strokes and hairlines

| Foreground | Background | Light | Dark | Threshold | Result |
|---|---|---|---|---|---|
| `--stroke` | `--surface` | 1.31 | 1.30 | — (decorative) | Exempt |
| `--stroke` | `--ground` | 1.18 | 1.50 | — (decorative) | Exempt |
| `--stroke-divider` | `--surface` | 1.20 | 1.14 | — (decorative) | Exempt |
| `--stroke-strong` | `--surface` | 1.74 | 1.93 | 3 (control boundary) | **Fail** / **Fail** |
| `--stroke-strong` | `--ground` | 1.57 | 2.22 | 3 (control boundary) | **Fail** / **Fail** |
| `--stroke-strong` | `--canvas` (graph edges) | 1.63 | 2.44 | 3 (essential graphic) | **Fail** / **Fail** |
| `--canvas-grid` | `--canvas` | 1.18 | 1.20 | — (decorative) | Exempt |
| `--accent-border` | `--surface` | 1.51 | 2.01 | — (chip has a fill) | Exempt |

**DS-30.** `--stroke-strong` is the sole visual boundary of a text field and of an outline button [src: `.field`, `.btn--outline`], and is the colour of every graph edge [src: `renderScene()`]. At 1.74:1 light and 1.93:1 dark against `--surface` it fails the 3:1 requirement for a control boundary, and at 1.63:1 / 2.44:1 against `--canvas` it fails for an essential graphic. An implementation MUST address this and MUST NOT ship without doing so. Two acceptable remedies:

1. darken `--stroke-strong` in light theme and lighten it in dark theme until it clears 3:1 against `--surface`, `--ground` and `--canvas`; or
2. give every field and outline button a fill distinct from its container ground, and introduce a separate, higher-contrast edge token for graph edges, so that the hairline is never the sole indicator.

**Status:** specified, not implemented in the reference build.

**DS-31.** `--stroke`, `--stroke-divider`, `--canvas-grid` and `--accent-border` are exempt because removing them would not prevent any control from being perceived or operated: panels are separated by ground change and by position, table rows by the hover layer and by row-height rhythm, the accent chip by its fill.

### Audit maintenance

**DS-32.** The contrast audit MUST be executed as an automated test over the token catalogue, not maintained by hand. The test MUST fail the build when any audited pair drops below its threshold in either theme. See [`61-acceptance-criteria-and-tests.md`](61-acceptance-criteria-and-tests.md).

**DS-33.** Three known failures are recorded above — DS-27, DS-29 and DS-30. Each MUST be tracked as an open defect against the shipping implementation and closed before first release. They are documented rather than silently corrected because the reference build's values are otherwise authoritative, and a document that quietly changed them would no longer describe the artefact it cites.

---

## Typography

### The role scale

| Role | Token | Size | Weight | Line height | Family | Applied to |
|---|---|---|---|---|---|---|
| Body | `--fs-body` | 14 px | 400 | 1.5 (`--lh-body`) | `--font-ui` | Document default; tree labels, table cells, menu items, buttons, field text [src: `body`] |
| Body strong | `--fs-body` | 14 px | 600 | 1.5 | `--font-ui` | Primary button label; selected tab label; selected tree row label; query-example title [src: `.btn--primary`, `.tab[aria-selected="true"]`, `.tree__row.is-selected .tree__label`, `.qitem strong`] |
| Caption | `--fs-caption` | 12 px | 400 | 1.5 | `--font-ui` | Status bar, chips, legend, table counts, keyboard hints, filter labels, form labels, note text, empty-state paragraph [src: `--fs-caption`] |
| Caption strong / section label | `--fs-caption` | 12 px | 600 | 1.5 | `--font-ui` | Panel title, **Inspector** section title, **Budget** card title, table header cell — all uppercase with `0.02em` tracking [src: `.panel__title`, `.section__title`, `.budget__title`, `.tbl__hcell`] |
| Subtitle | `--fs-subtitle` | 16 px | 600 (**Inspector** name); element default (dialog and empty-state headings) | 1.5 | `--font-display` | Dialog heading, **Inspector** entity name, graph empty-state heading [src: `.dialog h2`, `.inspector__name`, `.graph__empty h2`] |
| Title | `--fs-title` | 20 px | — | 1.5 | `--font-display` | **Status:** specified, not implemented in the reference build |
| Code | `--fs-code` | 13 px | 400 (SPARQL keywords 600) | 1.55 (`--lh-code`) | `--font-mono` | Axiom rows, SPARQL editor and overlay, numeric and mono table cells [src: `.axiom`, `.sparql__hl`, `.tbl__cell--num`] |
| IRI | `--fs-caption` | 12 px | 400 | 1.45 | `--font-mono` | The IRI line under the **Inspector** entity name [src: `.inspector__iri`] |

**DS-34.** The scale has exactly five interface sizes — 12, 13, 14, 16, 20 px. An implementation MUST NOT introduce an intermediate size. Where a heading needs more presence, it MUST gain it from weight, tracking, case or space, not from an off-scale size.

**DS-35.** Uppercase section labels MUST carry `0.02em` letter-spacing. Uppercase at 12 px without tracking is measurably harder to read [src: `.panel__title`, `.section__title`, `.budget__title`].

**DS-36.** Only three roles use `--font-display`: the dialog heading, the **Inspector** entity name and the graph empty-state heading. `--font-display` MUST NOT be used below 16 px; the display optical size is cut for large settings and reads thin and loose at caption size.

**DS-37.** Only two weights are used: 400 and 600. Weights 500 and 700 MUST NOT be introduced. Semibold is the only emphasis weight, and it marks exactly four things — a primary action, a selected item, a section label, and a value the user is meant to read off (status-bar counters, query row counts).

### Canvas typography

The graph **Viewport** draws its own text in screen space at fixed point sizes, independent of the document scale.

| Role | Size and weight | Family | Source |
|---|---|---|---|
| Node label — **Individual** | `400 11px` | `--font-ui` | [src: `labelFont()`] |
| Node label — all other kinds | `600 12.5px` | `--font-ui` | [src: `labelFont()`] |
| Cluster-grid group title | `600 12px` | `--font-ui` | [src: `renderScene()`] |
| Cluster-grid group count | `400 11px` | `--font-ui` | [src: `renderScene()`] |
| **Hidden neighbour** badge | `600 9.5px` | `--font-ui` | [src: `renderScene()`] |

**DS-38.** Canvas text MUST be drawn in screen space at a fixed point size and MUST NOT scale with zoom. Scaling label text with the **Viewport** transform produces unreadable text at low zoom and absurd text at high zoom [src: `renderScene()`].

**DS-39.** Every canvas label MUST be drawn with a 3.5 px halo in the canvas ground colour before the fill, so that a label crossing an edge or another node remains legible [src: `renderScene()`].

**DS-40.** Node labels longer than 30 characters MUST be truncated to 28 characters plus an ellipsis [src: `shortLabel()`].

### Monospace policy

**DS-41.** `--font-mono` MUST be used for, and only for:

- full IRIs and shortened IRIs (`pizza:Margherita`) [src: `.inspector__iri`, `entityLink()`];
- axiom bodies in the **Inspector**, including the axiom kind prefix [src: `.axiom`];
- SPARQL source text and its syntax-highlight overlay [src: `.sparql__hl`, `.sparql__input`];
- numeric table columns — price, rating — and any column explicitly marked mono, such as the order reference [src: `.tbl__cell--num`, `COLS`];
- **Budget** card readouts: the budget value, the in-view count, the **Hidden neighbour** count [src: `.budget__value`];
- status-bar counters, which are set in mono inside a semibold element [src: `.statusbar__item b`];
- keyboard hints inside a flyout menu item [src: `.menu__item .kbd`];
- the inline shortcut hint on the SPARQL Run button [src: `#qRun`].

**DS-42.** `--font-mono` MUST NOT be used for prose, for **Entity** display names, for button labels or for any authored copy. An **Entity**'s display name is prose; its IRI is code.

**DS-43.** Numeric columns MUST be right-aligned and set in mono, so that digits align in a column and magnitude is comparable by eye [src: `.tbl__cell--num`].

**DS-44.** Free-form annotation text embedded in an axiom row — `rdfs:comment`, for example — MUST override the mono family back to `--font-ui` for the annotation value, while the axiom's kind prefix stays mono [src: `renderInspector()`].

### Fallback stacks

**DS-45.** Each family token MUST declare the full fallback chain given in [Typography tokens](#typography-tokens), in that order:

- **UI:** Segoe UI Variable Text → Segoe UI Variable → Segoe UI → `system-ui` → `-apple-system` → `sans-serif`.
- **Display:** Segoe UI Variable Display → Segoe UI Variable → Segoe UI → `system-ui` → `sans-serif`.
- **Mono:** Cascadia Mono → Cascadia Code → Consolas → `ui-monospace` → SFMono-Regular → `monospace`.

**DS-46.** The UI chain names the *Text* optical size first and the display chain names the *Display* optical size first; both fall back to the non-optical family before falling back to the legacy family. An implementation MUST NOT collapse the two chains into one.

**DS-47.** Text MUST be rendered with greyscale antialiasing rather than subpixel antialiasing on the primary interface surface, matching the reference build [src: `body`]. On a native stack this is the platform default and no action is required.

---

## Spacing and layout rhythm

**DS-48.** The base spacing unit is **4 px**. Every gap, padding and margin MUST be an integer multiple of 4 px drawn from the seven-step scale in [Spacing tokens](#spacing-tokens): 4, 8, 12, 16, 20, 24, 32.

**DS-49.** Four sub-unit values are permitted, each confined to a single component, where 4 px would break an optical relationship:

| Value | Where | Source |
|---|---|---|
| 2 px | Gap between buttons inside a command-bar group; gap between tabs; gap between stacked query-example items; inner radius of an inline editor and of a tree match highlight | [src: `.cmdgroup`, `.tabstrip`, `.qitem`, `.cell-input`, `.tree__row.is-match .tree__label`] |
| 6 px | Gap between an icon and its label inside a chip, a tab, a tree row, a table cell, a legend item, a status-bar item; scrollbar thumb radius | [src: `.chip`, `.tab`, `.tree__row`, `.tbl__cell`, `.legend__item`, `.statusbar__item`] |
| 3 px | Splitter hit-area bleed on each side; scrollbar thumb inset; window-control focus ring inset | [src: `.splitter::after`, `::-webkit-scrollbar-thumb`, `.wincontrol:focus-visible`] |
| 14 px | Tree indentation step per depth level | [src: `renderTree()`] |

**DS-50.** The density tier is **compact**. A shipping implementation MAY offer a comfortable tier; if it does, the comfortable tier MUST change only `--h-control`, `--h-row`, `--h-tree-row` and the spacing scale, and MUST NOT change type sizes, radii or colours. Compact MUST remain the default.

**DS-51.** Tree indentation MUST be `4 + depth × 14` pixels of left padding on the row [src: `renderTree()`]. Indentation MUST be applied as row padding, not as a margin or a spacer element, so that the row's hover and selection fills still span the full panel width.

**DS-52.** The workspace is a five-track grid: left panel, 1 px splitter, flexible centre, 1 px splitter, right panel [src: `.workspace`]. Splitters MUST be exactly 1 px of layout width and MUST bleed 3 px each side for pointer targeting [src: `.splitter::after`]. Collapsing a panel MUST set its track to `0`, retaining the splitter track [src: `.workspace.is-left-collapsed`].

**DS-53.** The window is a four-row grid: title bar, command bar, flexible main, status bar, at `--h-titlebar`, `--h-commandbar`, `minmax(0,1fr)` and `--h-statusbar` [src: `.win`]. The main area is itself a three-row grid: flexible workspace, 1 px horizontal splitter, dock at `--h-dock`; collapsing the dock sets its row to `--h-row` [src: `.main`, `.main.is-dock-collapsed`].

**DS-54.** Every scrolling region MUST declare a zero minimum height on itself and on its grid ancestors. Without it a nested grid refuses to shrink below its content and the scroll never engages [src: `.panel`, `.panel__body`, `.dock`, `.tbl`].

---

## Motion

### Duration tiers

| Tier | Token | Value | Applies to |
|---|---|---|---|
| Fast | `--dur-fast` | 120 ms | State change on an element already on screen: button hover and press fill, window control hover, tab hover and colour, splitter hover, twisty rotation [src: `.btn`, `.wincontrol`, `.tab`, `.tree__twisty`] |
| Base | `--dur-base` | 200 ms | An element entering or leaving: scrim fade, dialog pop, toast fade-and-rise; also the meter fill width, which is a value animation [src: `@keyframes fade`, `@keyframes pop`, `.graph__trace`, `.meter__fill`] |
| Exit | `--dur-exit` | 140 ms | Exits. **Status:** specified, not implemented in the reference build |

**DS-55.** No transition or entrance animation may exceed 200 ms. The two indefinite animations — the spinner at 700 ms per revolution and the skeleton shimmer at 1.4 s per cycle — are exempt because they signal ongoing work rather than a transition [src: `.spinner`, `.skeleton`].

### Easing

| Curve | Token | Value | Use |
|---|---|---|---|
| Decelerate | `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Every entrance and every state transition |
| Accelerate | `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Every exit. **Status:** specified, not implemented in the reference build |
| Linear | — | `linear` | The spinner only [src: `.spinner`] |
| Standard | — | `ease-in-out` | The skeleton shimmer only [src: `.skeleton`] |

**DS-56.** Entrances MUST decelerate and exits MUST accelerate. The entrance-to-exit duration ratio MUST be **200 : 140**, that is 10 : 7 — an exit runs at roughly 70 % of its entrance. An element arriving is content the user must read; an element leaving is content the user has finished with, and holding it on screen costs attention.

### Animatable properties

**DS-57.** Only the following properties MAY be animated:

- `opacity` — toast, scrim, dialog [src: `.graph__trace`, `@keyframes fade`, `@keyframes pop`];
- `transform` — dialog entry translate-and-scale, toast rise, twisty rotation, spinner rotation, virtualised row-host translate [src: `@keyframes pop`, `.graph__trace`, `.tree__twisty`, `.spinner`, `renderTableRows()`];
- `background` and `background-color` — hover and pressed fills [src: `.btn`, `.wincontrol`, `.tab`, `.splitter`];
- `border-color` — button and field borders [src: `.btn`];
- `color` — tab label on hover [src: `.tab`];
- `width` — the **Budget** meter fill, which is a data value and must be seen to move [src: `.meter__fill`];
- `background-position` — the skeleton shimmer [src: `@keyframes shimmer`].

**DS-58.** `height`, `top`, `left`, `margin` and `padding` MUST NOT be animated. Panel collapse, dock collapse and splitter drag MUST be instantaneous re-layouts, not animated ones [src: `togglePanel()`, `wireSplitter()`].

**DS-59.** The dialog entrance is `opacity 0 → 1` together with `translateY(8px) scale(0.99) → none` over 200 ms decelerating [src: `@keyframes pop`]. The scrim entrance is `opacity 0 → 1` over the same 200 ms [src: `@keyframes fade`]. The toast entrance is `opacity 0 → 1` with `translateY(6px) → 0`, preserving its horizontal centring transform throughout [src: `.graph__trace`, `.graph__trace.is-shown`].

### Reduced motion

**DS-60.** When the system reports a reduced-motion preference, the implementation MUST:

- clamp every animation duration to an imperceptible value;
- clamp every animation iteration count to 1, which stops the spinner and the skeleton shimmer from looping;
- clamp every transition duration to an imperceptible value.

This MUST apply to the element and to both of its generated-content pseudo-elements [src: `@media (prefers-reduced-motion: reduce)`].

**DS-61.** Reduced motion MUST NOT suppress:

- the final state of any transition — a hovered button still changes fill, it simply arrives instantly;
- the appearance or dismissal of any element — a toast still appears and still auto-dismisses at 6 s;
- the meter fill reaching its correct width;
- any content, any control, or any information.

Reduced motion removes the interpolation, never the outcome.

**DS-62.** Under reduced motion the spinner stops rotating. The implementation MUST therefore ensure that a loading state is also conveyed non-kinetically: the SPARQL console pairs the spinner with the literal text "Evaluating…" and disables the send-to-graph button [src: `runQuery()`]. A spinner MUST NOT be the sole indicator of progress.

---

## Iconography

### The icon family

**DS-63.** Axiom MUST use exactly one icon family: a 16 × 16 outlined geometric set drawn on a 16-unit grid.

**DS-64.** Icons MUST be stroked, never filled, with:

- stroke width **1.5**;
- stroke caps **round**;
- stroke joins **round**;
- fill **none**;
- colour inherited from the element's text colour [src: `.icon`].

**DS-65.** There are exactly two icon sizes:

| Size | Value | Use |
|---|---|---|
| Standard | 16 × 16 px | Command bar buttons, panel header buttons, graph toolbar buttons, window controls, menu items [src: `.icon`] |
| Small | 14 × 14 px | Inline with text: inside a search field, a chip, a tab, a legend item, a table cell, a status-bar item, a toast, a note block, a tree row [src: `.icon--sm`] |

One documented override exists: the graph empty state draws its glyph at 40 × 40 px in `--text-disabled` [src: `#graphEmpty`]. An empty-state illustration is not an icon and is exempt from the two-size rule.

**DS-66.** A filled variant is available for the rare case where an outline reads as noise at small size: it sets the fill to the current colour and removes the stroke [src: `.icon--filled`]. **Status:** specified, not implemented in the reference build — the class is declared and never applied. If used, the filled variant MUST come from the same family, MUST keep the same 16-unit grid, and MUST NOT be mixed with an outline icon inside the same control.

**DS-67.** Corner radii inside an icon MUST fall between 1 and 2.5 units on the 16-unit grid: 1 for small rectangles, 1.5 for panel and table frames, 2.5 for the **Entity** class glyph [src: `#i-max`, `#i-table`, `#i-class`].

**DS-68.** Icons from two families MUST NOT be mixed. An implementation that adopts a platform icon font MUST adopt it wholesale, including for the **Entity** kind glyphs, or MUST keep the bespoke family wholesale. A screen containing one icon from each family is a defect.

**DS-69.** Emoji MUST NOT appear anywhere in the product: not in labels, not in status messages, not in toasts, not in empty states, not in generated export captions. The reference build contains none.

**DS-70.** Every icon MUST be marked decorative and hidden from assistive technology; the control that contains it MUST carry the accessible name [src: every `aria-hidden="true"` on an icon element, `.wincontrol` labels].

**DS-71.** Where a single glyph must indicate a rotated state, rotation MUST be applied by transform rather than by a second glyph: the tree twisty rotates 90° when open [src: `.tree__twisty.is-open`], and the chevron in a split button is rotated 90° to point downward [src: `#cmdScale`, `#gExport`].

### Icon inventory

The complete sprite. "Identifier" is the symbol id; every symbol is defined on a `0 0 16 16` view box.

| Identifier | Purpose | Used in |
|---|---|---|
| `i-chevron` | Right-pointing chevron | Tree expander, rotating to 90° when open; split-button flyout affordance, rotated 90° [src: `.tree__twisty`, `#cmdScale`, `#gExport`] |
| `i-search` | Magnifier | Global search field, hierarchy filter field, individuals filter field [src: `.search`] |
| `i-plus` | Plus | "New class" command; "Add subclass" tree toolbar button [src: `#cmdNewClass`, `#treeAdd`] |
| `i-minus` | Single horizontal rule | "Collapse dock" button in the dock header [src: `#dockCollapse`] |
| `i-close` | Cross | Window close control; toast dismiss control [src: `.wincontrol--close`, `#traceClose`] |
| `i-min` | Single horizontal rule | Window minimise control [src: `.wincontrol`] |
| `i-max` | Square, radius 1 | Window maximise control [src: `.wincontrol`] |
| `i-class` | Rounded square, radius 2.5 | Class **Entity** glyph — tree, legend, **Inspector**, search results; also the empty-**Inspector** glyph [src: `KIND_META.class`, `renderInspector()`] |
| `i-defined` | Rounded square with a plus inside | Defined class **Entity** glyph [src: `KIND_META.defined`] |
| `i-individual` | Circle, radius 4.5 | **Individual** **Entity** glyph; "New individual" command; the individual column of the table [src: `KIND_META.individual`, `#cmdNewIndividual`, `renderTableRows()`] |
| `i-objprop` | Diamond | Object property **Entity** glyph [src: `KIND_META.objectProperty`] |
| `i-dataprop` | Hexagon | Data property **Entity** glyph [src: `KIND_META.dataProperty`] |
| `i-pin` | Pushpin | The **Pin** affordance. **Status:** specified, not implemented in the reference build — defined in the sprite, never referenced; **Pin** state is drawn on canvas as an amber dot and named in the context menu instead [src: `renderScene()`, context menu] |
| `i-expand` | Circled plus | Expand a node's neighbourhood. **Status:** specified, not implemented in the reference build — defined, never referenced |
| `i-collapse` | Circled minus | Collapse a node's neighbourhood. **Status:** specified, not implemented in the reference build — defined, never referenced |
| `i-target` | Crosshair reticle | "Reveal in graph" in the **Inspector** header; "Send page to graph"; "Send results to graph" [src: `#inspGraph`, `#tblToGraph`, `#qToGraph`] |
| `i-trash` | Waste bin | Delete. **Status:** specified, not implemented in the reference build — defined, never referenced; deletion is reached by the Delete key and confirmed in a dialog [src: `deleteSelected()`] |
| `i-play` | Right-pointing triangle | "Run" in the SPARQL console [src: `#qRun`] |
| `i-sun` | Sun with eight rays | Theme toggle glyph while the dark theme is active [src: `setTheme()`] |
| `i-moon` | Crescent | Theme toggle glyph while the light theme is active [src: `setTheme()`] |
| `i-info` | Circled "i" | Informational note blocks in the **Inspector** [src: `.note`, `renderInspector()`] |
| `i-warn` | Triangle with a bang | Toast severity glyph; SPARQL error status glyph [src: `#trace`, `runQuery()`] |
| `i-zoomin` | Magnifier with a plus | Graph toolbar zoom in [src: `#gZoomIn`] |
| `i-zoomout` | Magnifier with a minus | Graph toolbar zoom out [src: `#gZoomOut`] |
| `i-fit` | Four corner brackets | Graph toolbar "Fit to view" [src: `#gFit`] |
| `i-layout` | Three linked nodes | Graph toolbar simulation freeze/resume toggle; the graph empty-state glyph at 40 px [src: `#gLayout`, `#graphEmpty`] |
| `i-table` | Framed table with a header rule | "Individuals" dock tab [src: `#tabIndividuals`] |
| `i-code` | Opposed angle brackets | "SPARQL" dock tab; "SVG vector" export menu item [src: `#tabSparql`, export flyout] |
| `i-db` | Cylinder | "Dataset" split button; the ontology name in the status bar [src: `#cmdScale`, `#stOntology`] |
| `i-panel` | Frame with a left division | Toggle hierarchy panel [src: `#cmdToggleLeft`] |
| `i-panel-r` | Frame with a right division | Toggle **Inspector** panel [src: `#cmdToggleRight`] |
| `i-dock` | Frame with a bottom division | Toggle bottom dock [src: `#cmdToggleDock`] |
| `i-undo` | Curved arrow returning left | Undo command [src: `#cmdUndo`] |
| `i-save` | Floppy disk | Save ontology command [src: `#cmdSave`] |
| `i-export` | Down arrow onto a tray | Graph export split button; "Copy image to clipboard" menu item [src: `#gExport`, export flyout] |
| `i-refresh` | Circular arrow with a tail | Graph toolbar "Re-run layout" [src: `#gRelayout`] |
| `i-image` | Framed picture with a sun and hills | "PNG, 2×" and "PNG, 3×" export menu items [src: export flyout] |
| `i-filter` | Funnel | Filtering. **Status:** specified, not implemented in the reference build — defined, never referenced; the filter bar is labelled in words instead [src: `.filterbar`] |
| `i-check` | Tick | Query success in the SPARQL status line; the "Rename entity" button in the **Inspector** header [src: `runQuery()`, `#inspRename`] |
| `i-logo` | Three nodes joined into a triangle | The application mark in the title bar, tinted `--accent` [src: `.titlebar__icon`] |

**DS-72.** The reference build defines 40 symbols and references 35. The five unreferenced symbols — `i-pin`, `i-expand`, `i-collapse`, `i-trash`, `i-filter` — MUST be retained in the sprite: each has a named future consumer recorded above.

**DS-73.** The `i-check` glyph carries two unrelated meanings in the reference build: query success, and the "Rename entity" action. This is a defect; an implementation MUST assign the rename action its own glyph. **Status:** specified, not implemented in the reference build.

**DS-74.** `i-minus` and `i-min` are geometrically identical. They MUST remain separate identifiers, because one is a window control and one is a panel action, and a future change to either MUST NOT propagate to the other.

---

## Entity visual encoding

**DS-75.** Axiom recognises exactly five **Entity** kinds. Each MUST be encoded on three independent channels — colour, silhouette and icon — so that any one channel can be lost without losing the distinction.

| Kind | Colour token | Canvas silhouette | Icon | Node base radius |
|---|---|---|---|---|
| Class | `--e-class` | Rounded rectangle | `i-class` | 8.5 |
| Defined class | `--e-defined` | Rounded rectangle with a plus notch struck in the canvas ground colour | `i-defined` | 8.5 |
| **Individual** | `--e-individual` | Circle | `i-individual` | 5.5 |
| Object property | `--e-objprop` | Diamond, four points, axis-aligned | `i-objprop` | 7 |
| Data property | `--e-dataprop` | Hexagon, six points, first vertex at π/6 | `i-dataprop` | 7 |

[src: `KIND_META`, `nodePath()`, `nodeRadius()`]

**DS-76.** Kind MUST be distinguishable without colour. The test is normative: render the graph, the tree, the legend and the **Inspector** in greyscale and confirm that every kind remains identifiable. Colour alone MUST NOT be relied upon anywhere.

**DS-77.** Class and Defined class share both silhouette and colour family; they are distinguished by the plus notch on the canvas node and by the plus inside the icon [src: `renderScene()`, `#i-defined`]. The notch MUST be struck in `--canvas` at a line width of `2 / k` world units, so that it holds a constant screen weight at every zoom.

**DS-78.** Node radius MUST grow with degree: `base + min(9, log₂(1 + degree) × 1.6)` [src: `nodeRadius()`]. **Individual** nodes carry the smallest base because they are the most numerous; a dense **ABox** must not swamp the **TBox** structure around it.

**DS-79.** The legend MUST be generated from the same kind metadata that drives rendering, never hand-authored, so that the two cannot drift [src: `renderLegend()`]. The legend MUST list, in order: the five kinds with their icon and label; the **Pin** marker as an amber dot labelled "pinned"; and a plain-text entry explaining the badge as "+n = neighbours held back by the budget".

**DS-80.** Three canvas states are encoded on top of kind, and MUST be distinguishable from one another:

| State | Encoding | Source |
|---|---|---|
| Selected | A circular ring at `radius + 7/k`, `2.5/k` wide, in `--accent` | [src: `renderScene()`] |
| In the **Focus set** | A kind-shaped outline at `radius + 3/k`, `1.8/k` wide, in `--text` | [src: `renderScene()`] |
| **Pin**ned | A filled dot of radius `3.4/k + 1` in `--warn` at the node's upper left | [src: `renderScene()`] |

The selection ring is circular for every kind; the **Focus set** outline follows the kind's silhouette. The two therefore read differently even when both are present.

**DS-81.** A node with **Hidden neighbour**s MUST carry a `+n` badge above and to the right of it: a pill in `--surface` with a `--stroke-strong` border and `--text-secondary` text at `600 9.5px`, abbreviated to one decimal thousand above 999 and to whole thousands above 9,999 [src: `renderScene()`]. Badges MUST be suppressed below 0.3 zoom.

---

## Elevation and layering

**DS-82.** Axiom uses two distinct depth mechanisms, and the choice between them is not stylistic.

**Ground layering** — a value step between adjacent surfaces, no shadow — MUST be used for everything in the persistent window layout: the title bar and status bar against the window, the command bar against the workspace, panels against the ground, the table header against the table body, the dock header against the dock, the SPARQL editor well against its surround [src: `--ground`, `--surface`, `--surface-alt`, `--surface-sunken`]. These regions never move and never overlap; a shadow on them would be decoration.

**Shadow** — `--shadow-flyout` or `--shadow-dialog` — MUST be used for everything that floats over other content and can overlap it: flyout menus, the context menu, the graph toolbar, the **Budget** card, the minimap, the legend, the toast, and the modal dialog [src: `--shadow-flyout`, `--shadow-dialog`].

**DS-83.** An element MUST NOT use both a ground step and a shadow to express the same relationship. Floating elements do take `--surface` as their fill, but that is so their content reads, not to express depth.

**DS-84.** The stacking order MUST be, from back to front:

| Layer | Index | Members |
|---|---|---|
| Base | auto | Window chrome, panels, canvas, dock |
| Sticky | 2 | The table header, pinned to the top of its scroll viewport [src: `.tbl__head`] |
| Graph overlays | auto, in flow above the canvas | Toolbar, **Budget** card, minimap, legend, toast, empty state [src: `.graph__toolbar` … `.graph__empty`] |
| Flyouts | 60 | Flyout menus, context menu, search flyout [src: `.menu`] |
| Modal | 70 | Scrim and dialog [src: `.scrim`] |

**DS-85.** No other stacking index may be introduced. Any new floating element MUST join one of the three named tiers.

**DS-86.** Graph overlay cards MUST be inset `--sp-3` (12 px) from their canvas corner: toolbar top-left, **Budget** card top-right, legend bottom-left, minimap bottom-right; the toast is bottom-centre at `--sp-6` [src: `.graph__toolbar`, `.graph__budget`, `.graph__legend`, `.graph__minimap`, `.graph__trace`].

**DS-87.** The graph toolbar MUST be constrained to `calc(100% - 300px)` of the canvas width so that it wraps rather than sliding beneath the **Budget** card [src: `.graph__toolbar`].

**DS-88.** The modal scrim MUST be `rgba(0,0,0,0.30)` in both themes [src: `.scrim`]. It is deliberately not themed: a lighter scrim in dark theme would fail to separate a `--surface` dialog from a `--ground` window.

---

## Accessibility contract

### Focus visibility

**DS-89.** Every focusable element MUST show a visible focus indicator when focus arrives by keyboard. The indicator is a **2 px solid outline in `--accent`, offset 1 px outward, with a `--r-control` corner radius** [src: `:focus-visible`].

**DS-90.** The focus ring MUST NOT be suppressed. Two documented adjustments are permitted:

- **Window controls** draw the ring inset by 3 px, because the control is flush to the window edge and an outward ring would be clipped [src: `.wincontrol:focus-visible`].
- **Text and select fields** suppress the outward ring and express focus as the accent underline of DS-91, because an outline around a field duplicates a boundary the field already has [src: `.field:focus`, `.field:focus-visible`].

**DS-91.** A focused text or select field MUST express focus by changing its 2 px bottom border from `--stroke-strong` to `--accent`. The border's width MUST NOT change, so the control does not shift [src: `.field`, `.field:focus`].

**DS-92.** The SPARQL editor expresses focus as a 2 px inset ring in `--accent`, because it is a full-bleed region with no border of its own [src: `.sparql__input:focus`].

**DS-93.** The focus ring's contrast against every ground it can appear on MUST meet 3:1. The audited values are 5.38:1 light and 6.62:1 dark on `--surface`, 4.85:1 and 7.62:1 on `--ground`, and 5.03:1 and 8.37:1 on `--canvas`. All pass.

### Accessible names and roles

**DS-94.** Every control MUST have an accessible name. Where the control has a visible text label, that label is the name. Where the control is icon-only, it MUST carry an explicit label [src: `#cmdUndo`, `#gZoomIn`, `.wincontrol`, `#dockCollapse`].

**DS-95.** An icon-only control MUST additionally carry a tooltip naming the action *and its keyboard shortcut where one exists* — "Undo (Ctrl+Z)", "Save (Ctrl+S)", "Fit to view (F)", "Re-run layout (L)", "Rename (F2)" [src: `#cmdUndo`, `#cmdSave`, `#gFit`, `#gRelayout`, `#inspRename`]. The tooltip MUST NOT be the only name; the accessible name is separate.

**DS-96.** Accessible names and tooltips MUST be updated when the control's meaning changes. Three cases exist in the reference build:

- the theme toggle changes its name between "Switch to dark theme" and "Switch to light theme" and swaps its glyph [src: `setTheme()`];
- the simulation toggle changes its tooltip between "Simulation running — click to freeze" and "Simulation frozen — click to resume" and updates its pressed state [src: `wire()`];
- the canvas tooltip names the hovered **Entity**, its kind and its **Hidden neighbour** count [src: `wireCanvas()`].

**DS-97.** Roles MUST be assigned as follows [src: body markup]:

| Region | Role | Additional |
|---|---|---|
| Command bar | `toolbar` | labelled "Main commands" |
| Graph toolbar | `toolbar` | labelled "Graph view controls" |
| Tab strips | `tablist` / `tab` / `tabpanel` | each tab declares `aria-selected` and `aria-controls`; each panel declares `aria-labelledby` |
| Class hierarchy | `tree` / `treeitem` | each item declares `aria-level` and, when it has children, `aria-expanded` |
| Tables | `grid` / `row` / `columnheader` / `gridcell` | header cells declare `aria-sort` with `ascending`, `descending` or `none` |
| Splitters | `separator` | each declares `aria-orientation` and a label naming what it resizes |
| Menus | `menu` / `menuitem` | the opening button declares `aria-haspopup="menu"` and `aria-expanded` |
| Dialog | `dialog` | `aria-modal="true"`, `aria-labelledby` pointing at the heading |
| Toast | `status` | `aria-live="polite"` |
| Status bar | `status` | `aria-live="off"` |
| Toggle buttons | `button` | `aria-pressed` reflecting the current state |
| Meter | `img` | labelled "Viewport occupancy" |
| Minimap | — | `aria-hidden="true"`; it duplicates information available elsewhere |

**DS-98.** A required form field MUST mark the requirement twice: a visible asterisk hidden from assistive technology, and a visually hidden word "required" adjacent to the label [src: `newClassDialog()`].

**DS-99.** An editable table cell MUST announce itself as editable in its accessible name — "Price: £11.50, editable" — because the visual affordance, a hover ring, is unavailable to a screen-reader user [src: `renderTableRows()`].

### Keyboard reachability

**DS-100.** Every action MUST be reachable from the keyboard. No action may exist solely on a right-click, a double-click, a drag or a hover.

**DS-101.** The following bindings are normative [src: `wire()`, `wireCanvas()`, `renderTree()`, `beginCellEdit()`, `beginRename()`, `wireGlobalSearch()`]:

| Key | Context | Action |
|---|---|---|
| `Ctrl+F` | Global, including while typing | Focus and select the global search field |
| `Ctrl+Z` | Global, when not typing | Undo |
| `Ctrl+S` | Global, including while typing | Save |
| `Escape` | Global | Close any open flyout, then any open dialog |
| `F2` | Global, with a selection | Begin inline rename |
| `Delete` | Global, with a class selected that is not in the **Viewport** | Delete the class, via confirmation |
| `Arrow Down` / `Arrow Up` | Tree | Move selection, scrolling the row into view |
| `Arrow Right` / `Arrow Left` | Tree | Expand / collapse the selected node |
| `Enter` | Tree | Select and reveal in the graph |
| `Enter` | Search flyout | Activate the first result |
| `Escape` | Search field | Close the flyout and blur the field |
| `Enter` | Editable table cell | Begin editing |
| `Enter` | Cell editor or rename input | Commit |
| `Escape` | Cell editor or rename input | Cancel, restoring the previous value |
| `Ctrl+Enter` | SPARQL editor | Run the query |
| `Tab` | SPARQL editor | Insert two spaces rather than moving focus |
| `F` | Graph canvas | Fit to view |
| `L` | Graph canvas | Re-run layout |
| `Enter` | Graph canvas, with a node selected | Expand the node's neighbours |
| `Delete` / `Backspace` | Graph canvas, with a node selected | Remove the node from the **Viewport** |

**DS-102.** Global bindings that would conflict with text entry MUST be suppressed while focus is in a text input, a multi-line editor or a select — with the deliberate exception of `Ctrl+F`, `Ctrl+S` and `Escape`, which remain live everywhere [src: `wire()`].

**DS-103.** The `Tab`-inserts-spaces behaviour in the SPARQL editor traps keyboard focus in that control. **Status:** specified, not implemented in the reference build — the editor MUST provide an escape, conventionally `Escape` then `Tab`, and MUST document it in the console's help text.

**DS-104.** The class tree MUST use roving focus: exactly one row is in the tab order at a time and the rest carry a negative tab index [src: `renderTree()`]. The tree's scrolling container carries the tab stop [src: `#treePane`].

**DS-105.** The graph canvas MUST be focusable and MUST carry an accessible description stating how to populate it — "Ontology graph. Use the hierarchy or the table to add entities to the view." [src: `#canvas`].

**DS-106.** Splitters MUST be operable from the keyboard. **Status:** specified, not implemented in the reference build — the splitters carry a tab index and a separator role but no key handler. Arrow-key resizing MUST be implemented, moving 4 px per press and 40 px with a modifier, clamped to the bounds in [Runtime layout tokens](#runtime-layout-tokens) [src: `wireSplitter()`].

**DS-107.** A modal dialog MUST move focus to its first focusable control on open [src: `openDialog()`]. **Status:** focus trapping within the dialog and focus restoration to the invoking control on close are specified, not implemented in the reference build; both MUST be implemented.

### Non-colour status encoding

**DS-108.** Every status MUST be encoded without relying on colour:

| Status | Colour channel | Non-colour channel | Source |
|---|---|---|---|
| Query succeeded | `--ok` tick | Tick glyph plus row count, timing and triple count in words | [src: `runQuery()`] |
| Query failed | `--danger` text on `--danger-subtle`, 3 px left rule | Warning glyph, a bold message and a hint sentence | [src: `runQuery()`, `.sparql__error`] |
| **Budget** near capacity | Meter fill turns `--warn` at ≥ 75 % | The fill's width, and the in-view and budget numbers beside it | [src: `updateBudgetUI()`] |
| **Budget** at capacity | Meter fill turns `--danger` at ≥ 98 % | As above, plus a toast naming the refused count | [src: `updateBudgetUI()`, `reportView()`] |
| Sorted column | `--accent` sort mark | An up or down arrow glyph, and `aria-sort` | [src: `renderTableHead()`] |
| Selected row or tree node | `--layer-selected` fill | Semibold label; `aria-selected`; the status bar names the selection | [src: `.tree__row.is-selected`, `selectEntity()`] |
| Invalid cell | 2 px inset `--danger` ring | A toast stating what is wrong and what a valid value looks like | [src: `.cell-error`, `commitCell()`] |
| Invalid form field | `--danger` border | A visible error message below the field, in an alert region | [src: `.formrow.is-invalid`, `newClassDialog()`] |
| Disabled control | `--text-disabled` | The native disabled state, removing it from the tab order | [src: `.btn[disabled]`] |
| Toggle on | `--layer-selected` fill | `aria-pressed="true"` and a tooltip naming the current state | [src: `.btn.is-active`, `togglePanel()`] |
| **Pin**ned node | `--warn` dot | Legend entry, and the context menu reads "Unpin" | [src: `renderLegend()`, context menu] |
| Tree filter match | `--accent-subtle` label ground | The tree is filtered to matches and their ancestors, so position itself carries the signal | [src: `computeFilter()`, `.tree__row.is-match`] |

### Live regions

**DS-109.** Transient messages MUST be announced. The toast region MUST be a polite live region that exists in the document before any message is written to it, so that the first message is announced rather than swallowed [src: `#trace`].

**DS-110.** The status bar MUST NOT be a live region. It changes on every pan, zoom, selection and expansion; announcing it would make the application unusable with a screen reader. It is explicitly marked `aria-live="off"` for that reason [src: `.statusbar`].

**DS-111.** Inline form errors MUST be announced as alerts and MUST be associated with their field by a describedby relationship [src: `newClassDialog()`, `#errName`].

**DS-112.** A validation failure reported only by toast — as cell editing does — MUST state the rule and an example of a valid value, not merely that the value was rejected: "Price looks wrong — £612.00 exceeds the £500 sanity limit for a single pizza", "Rating must be a whole number, not '4.5'" [src: `commitCell()`].

### System font scaling

**DS-113.** The interface MUST remain usable at every system text-scaling step the platform offers, to at least 200 %.

**DS-114.** Control heights are the binding constraint. `--h-control`, `--h-row` and `--h-tree-row` are fixed pixel values in the reference build; at 200 % text scaling, 14 px body text in a 28 px control overflows. An implementation MUST either express these metrics relative to the resolved font size, or MUST scale the metric tokens alongside the type scale when the system scale changes. **Status:** specified, not implemented in the reference build.

**DS-115.** Under scaling, no text may be clipped and no control may lose its label. Regions that already truncate by design — tree labels, table cells, the title bar title — MUST continue to truncate with an ellipsis and MUST expose the full value as a tooltip or accessible name [src: `.tree__label`, `.tbl__cell`, `.od-truncate`].

**DS-116.** Layout regions MUST reflow rather than clip. The graph toolbar already wraps [src: `.graph__toolbar`]; the filter bar already wraps [src: `.filterbar`]; the legend already wraps [src: `.graph__legend`]. Every horizontal band of controls MUST wrap.

---

## Responsive behaviour

**DS-117.** The minimum supported window width is **1180 px**. Below it the layout reorganises rather than compressing [src: `@media (max-width: 1180px)`].

**DS-118.** Two breakpoints are defined:

| Breakpoint | Trigger | What reorganises |
|---|---|---|
| **Narrow** | width ≤ 1180 px | The **Inspector** panel is removed from the layout and its grid track collapses to 0. The hierarchy panel's default width drops from 280 px to 240 px. The graph legend is hidden. [src: `@media (max-width: 1180px)`] |
| **Very narrow** | width ≤ 1024 px | The **Budget** card narrows from 264 px to 210 px. All narrow-breakpoint changes remain in effect. [src: `@media (max-width: 1024px)`] |

**DS-119.** No essential action may be hidden at any width. The reorganisation above removes two things, and both are recoverable:

- the **Inspector** is hidden, but every fact it shows remains reachable — the status bar names the selection, the tree shows the hierarchy, and the panel returns when the window widens past 1180 px;
- the legend is hidden, but kind is still encoded by silhouette and by icon in the tree, and the canvas tooltip names the kind of any hovered node [src: `wireCanvas()`].

**DS-120.** Hiding the legend at the narrow breakpoint while the **Budget** card remains is a deliberate priority ordering: the **Budget** card carries controls — the slider and the **Eviction** mode select — and the legend carries only a key. Controls outrank keys.

**DS-121.** A panel hidden by breakpoint MUST NOT change the state of its toggle button. A user who collapses the **Inspector** at 1400 px and then narrows the window MUST find it still collapsed when they widen again. Breakpoint state and user state are separate.

**DS-122.** Below the minimum width the application MUST remain operable, not merely non-crashing: the graph must still pan and zoom, the dock must still list **Individual**s, and the command bar must still reach every command. If the command bar cannot fit its groups, it MUST overflow into a flyout rather than clipping a group. **Status:** specified, not implemented in the reference build.

**DS-123.** Panel widths set by splitter drag MUST be clamped to the bounds in [Runtime layout tokens](#runtime-layout-tokens) so that a drag can never produce an unusable layout, and the graph canvas MUST be re-measured and re-fitted when a drag ends [src: `wireSplitter()`].

---

## Anti-patterns

Each of the following is rejected by this product. The reason matters more than the rule: a reviewer who understands the reason can judge a case the list does not name.

**DS-124.** **No presenter or designer chrome in product UI.** No slide numbers, no section dividers, no "designed by" credits, no version banners, no demo captions, no annotation callouts pointing at features. *Reason:* the product is the artefact, not a presentation of the artefact. Chrome that explains the interface to a viewer takes space from the user trying to work in it. The reference build's one piece of explanatory copy — the graph empty state — teaches a genuine interaction model ("The graph never loads an ontology wholesale") and disappears the moment the **Viewport** has content [src: `.graph__empty`, `updateBudgetUI()`].

**DS-125.** **No decorative gradients, glass or blur.** The single gradient in the reference build is the skeleton shimmer, which is a motion device rather than decoration [src: `.skeleton`]. *Reason:* every gradient is a contrast hazard — text over a gradient has a different ratio at each end, so the audit in this document could not be written. Mica-style depth comes from ground layering, which is auditable.

**DS-126.** **Hover states MUST NOT lighten text.** A hover state changes the *background*, never the foreground, except to move a secondary colour towards the primary one — the table header cell moves from `--text-secondary` to `--text` on hover, increasing contrast [src: `.tbl__hcell:hover`, `.tab:hover`, `.statusbar button:hover`]. *Reason:* lightening text on hover reduces contrast at the exact moment the user has committed attention to the element. A hover must never make a thing harder to read than it was at rest.

**DS-127.** **No icon beside every heading.** Panel titles, **Inspector** section titles and the **Budget** card title carry no icon [src: `.panel__title`, `.section__title`, `.budget__title`]. Icons appear on headings only where the heading identifies a typed thing — the **Inspector** entity head, the dock tabs, the legend [src: `renderInspector()`, `#tabIndividuals`]. *Reason:* an icon beside every heading trains the eye to ignore icons, so the icons that carry meaning stop working.

**DS-128.** **No invented metrics in placeholder copy.** Every number shown in the reference build is computed from the **Store** or the **Viewport** at the moment it is shown: triple counts, class counts, **Individual** counts, row counts, node counts, query timings, export dimensions, file sizes [src: `updateStoreUI()`, `updateBudgetUI()`, `runQuery()`, `exportPNG()`]. The one class of stated-but-not-computed numbers is the dataset flyout's triple estimates ("~8K triples"), which are explicit approximations attached to a choice the user has not yet made [src: dataset flyout]. *Reason:* a fabricated metric in a prototype becomes a fabricated metric in a screenshot, then in a specification, then in a customer's expectation. A number on screen is a claim.

**DS-129.** **No unlabelled colour.** A colour swatch, a dot or a coloured bar MUST be accompanied by text or by an accessible name on its first appearance in a **Surface** [src: `renderLegend()`, `.statusbar__item`]. *Reason:* see DS-5.

**DS-130.** **No modal for anything reversible.** The reference build opens a modal for exactly three things: creating a class, creating an **Individual**, and confirming a class deletion [src: `newClassDialog()`, `newIndividualDialog()`, `deleteSelected()`]. Everything else — rename, cell edit, **Budget** change, **Layout mode** change, **Pin**, **Eviction** — happens in place and is undoable or trivially repeatable. *Reason:* a modal costs the user their context. Spend it only where the action is destructive or requires input that has nowhere else to live.

**DS-131.** **No progress indicator without a statement of what is progressing.** The spinner always appears beside words [src: `runQuery()`]. *Reason:* see DS-62.

**DS-132.** **No truncation of authored copy.** Clamping and ellipsis are for data — IRIs, entity names, cell values, the window title — never for sentences the product itself wrote. Explanatory copy is written to its space instead: the empty state's paragraph is capped at 44 characters per line and sized to fit [src: `.graph__empty p`, `.empty-state p`]. *Reason:* a truncated sentence written by the product is a sentence the product could have made shorter.

---

## Appendix A — Native stack mapping (non-normative)

This appendix records how the normative values above land on a Windows 11 native stack. Nothing here is binding.

### Windows theme resources

WinUI 3 and the Windows App SDK ship a theme-resource dictionary keyed by `Light`, `Dark` and `HighContrast`. The two-tier token architecture of DS-8 maps directly: Tier 1 tokens become application-level static resources in `App.xaml`; Tier 2 tokens become entries in a `ResourceDictionary.ThemeDictionaries` block, which the framework swaps when `RequestedTheme` or the system theme changes. The single attribute write of DS-9 becomes a `RequestedTheme` assignment on the root `FrameworkElement`.

Approximate correspondences, offered as starting points rather than substitutions:

| Axiom token | Nearest WinUI theme resource |
|---|---|
| `--ground` | `SolidBackgroundFillColorBase` |
| `--surface` | `LayerFillColorDefault` over `CardBackgroundFillColorDefault` |
| `--surface-alt` | `CardBackgroundFillColorSecondary` |
| `--surface-sunken` | `SolidBackgroundFillColorTertiary` |
| `--stroke` | `CardStrokeColorDefault` |
| `--stroke-strong` | `ControlStrokeColorDefault` |
| `--stroke-divider` | `DividerStrokeColorDefault` |
| `--text` | `TextFillColorPrimary` |
| `--text-secondary` | `TextFillColorSecondary` |
| `--text-disabled` | `TextFillColorDisabled` |
| `--text-on-accent` | `TextOnAccentFillColorPrimary` |
| `--accent` | `AccentFillColorDefault` |
| `--accent-hover` | `AccentFillColorSecondary` |
| `--accent-pressed` | `AccentFillColorTertiary` |
| `--layer-hover` | `ControlFillColorSecondary` |
| `--layer-pressed` | `ControlFillColorTertiary` |
| `--layer-selected` | `AccentFillColorSelectedTextBackground`, reduced in opacity |
| `--shadow-flyout` | `ThemeShadow` at 16 elevation |
| `--shadow-dialog` | `ThemeShadow` at 32 elevation |
| `--ok` / `--warn` / `--danger` | `SystemFillColorSuccess` / `SystemFillColorCaution` / `SystemFillColorCritical` |

The WinUI resources are not value-identical to the Axiom tokens. Adopting them wholesale would change the audited ratios in [Contrast audit](#contrast-audit), and the audit would have to be re-run.

Typography maps onto the WinUI type ramp: `--fs-caption` to `CaptionTextBlockStyle`, `--fs-body` to `BodyTextBlockStyle`, `--fs-subtitle` to `SubtitleTextBlockStyle`, `--fs-title` to `TitleTextBlockStyle`. The ramp's default sizes differ slightly from Axiom's; the Axiom values win, because the contrast and density decisions above depend on them.

### Mica and backdrop material

`--ground` corresponds to Mica as the window backdrop: set `SystemBackdrop` to `MicaBackdrop` with `Kind="Base"` on the window, and leave the title bar and command bar transparent so the material shows through. `--surface` regions — panels, dock, flyouts — should be opaque, because Mica is a *window* material and is not intended to layer beneath content regions. `MicaBackdrop` with `Kind="BaseAlt"` is the darker variant and suits a tool window better than a document window; the reference build's `--ground` is closer to `Base`.

The graph canvas MUST NOT be transparent to Mica. It is an opaque drawing surface with its own ground (`--canvas`) and its own grid, and compositing it over a desktop-derived material would destroy the contrast guarantees of DS-25.

Acrylic (`DesktopAcrylicBackdrop`) is the wrong material for every surface in Axiom. It is intended for transient, light-dismiss surfaces; the flyouts here are small and dense, and acrylic behind 12 px text is a contrast hazard. Use the shadow tiers instead.

### Fluent icon fonts

The 40-symbol sprite maps largely onto **Segoe Fluent Icons**, which ships with Windows 11 and is the correct family under DS-63 if the bespoke set is retired. Indicative glyph correspondences:

| Axiom symbol | Segoe Fluent Icons |
|---|---|
| `i-chevron` | `ChevronRight` (E76C) |
| `i-search` | `Search` (E721) |
| `i-plus` | `Add` (E710) |
| `i-minus` | `Remove` (E738) |
| `i-close` | `ChromeClose` (E8BB) |
| `i-min` | `ChromeMinimize` (E921) |
| `i-max` | `ChromeMaximize` (E922) |
| `i-pin` | `Pin` (E718) |
| `i-target` | `Target` (E1D2) |
| `i-trash` | `Delete` (E74D) |
| `i-play` | `Play` (E768) |
| `i-sun` | `Brightness` (E706) |
| `i-info` | `Info` (E946) |
| `i-warn` | `Warning` (E7BA) |
| `i-zoomin` / `i-zoomout` | `ZoomIn` (E8A3) / `ZoomOut` (E71F) |
| `i-fit` | `FitPage` (E9A6) |
| `i-undo` | `Undo` (E7A7) |
| `i-save` | `Save` (E74E) |
| `i-refresh` | `Refresh` (E72C) |
| `i-image` | `Photo2` (E90F) |
| `i-filter` | `Filter` (E71C) |
| `i-check` | `CheckMark` (E73E) |
| `i-table` | `GridView` (F0E2) |
| `i-code` | `Code` (E943) |
| `i-export` | `Download` (E896) |

Six symbols have no adequate Fluent equivalent and would have to stay bespoke: the five **Entity** kind glyphs (`i-class`, `i-defined`, `i-individual`, `i-objprop`, `i-dataprop`) and the application mark (`i-logo`). Because DS-68 forbids mixing families, this argues for keeping the bespoke set and matching its metrics to Fluent — 16 px box, 1.5 stroke, round caps — rather than adopting the font.

The window controls are the exception. On a native stack the title bar should use `AppWindowTitleBar` with the system-drawn caption buttons, which handles the close-button hover colour, the snap-layouts flyout on hover, and right-to-left mirroring at no cost. The `#C42B1C` literal of DS-11 exists only because the reference build draws its own caption buttons.

### System accent colour integration

Windows exposes a user-chosen accent through `UISettings.GetColorValue(UIColorType.Accent)` and through the `SystemAccentColor` family of theme resources, with `Light1`–`Light3` and `Dark1`–`Dark3` variants.

Honouring it is tempting and should be approached carefully. Two obligations from this document survive regardless:

1. **DS-16** — `--text-on-accent` must be recomputed for the user's accent, not assumed white. The platform's `TextOnAccentFillColorPrimary` does this correctly and should be used rather than a literal.
2. **DS-25** — the contrast audit must be re-run against the user's accent at runtime, not at build time. A user accent that fails 4.5:1 against `--surface` must be replaced for text use by the nearest passing variant — `SystemAccentColorDark2` in light theme, `SystemAccentColorLight2` in dark — keeping the user's hue while restoring the ratio.

A reasonable policy: follow the system accent for the focus ring, the selected-tab indicator and the primary button, and hold `--e-class` at the Axiom blue so that the **Entity** encoding does not shift with the user's wallpaper. DS-22 already keeps those two tokens separate for precisely this reason.

### High contrast

Windows high-contrast themes override colours at the system level, and a WinUI application built on theme resources inherits that for free. Two Axiom-specific obligations:

- The graph canvas draws from the palette object of DS-10 and must re-read it on a high-contrast change as well as on a theme change.
- Under high contrast the **Entity** palette collapses to the system's limited colour set. DS-76 is what makes this survivable: silhouette and icon still distinguish the five kinds when every node is drawn in the same system colour.
