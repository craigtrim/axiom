# Adaptive layouts for docked views

The shared layouts adapt workbench views to their available pane dimensions.

## Delivered behavior

Each view adapts to the space inside its pane. Primary actions remain outside the content scroller. Supporting explanations and occasional settings use named disclosures, Options and More.

All seventeen dockable component types use the shared pane measurement, with layouts suited to each view's content. Graph retains its existing presentation and interaction model at every size. Its canvas resizes without entering the form recovery presentation.

## Evidence and its limits

### Predefined layouts are an established approach

Microsoft distinguishes fluid resizing from adaptive design, which substitutes layouts at defined breakpoints. Its guidance includes rearranging controls and reducing visible metadata as space decreases. This supports separate arrangements for Axiom's pane shapes. It does not prescribe Axiom's breakpoints. [Microsoft: Responsive design techniques](https://learn.microsoft.com/en-us/windows/apps/design/layout/responsive-design).

Microsoft's TwoPaneView supports wide, tall and single-pane presentations, with an explicit priority when both areas cannot fit. Content inside each pane still needs to adapt. Axiom can apply this principle to configuration and results using React. [Microsoft: Two-pane view](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/two-pane-view).

### Frequent actions should remain directly available

Nielsen Norman Group recommends putting frequently needed features in the initial display and making secondary features available through clearly labeled controls. Choosing the split requires task knowledge and usability observation. For Axiom, treating assistant refresh and prompt restoration as occasional actions is a hypothesis to verify. [NN/g: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

Fluent's toolbar guidance uses a single row with overflow for commands that do not fit. It also places task controls where they remain useful during the task. This supports reserving a small action area while content scrolls independently. [Fluent 2: Toolbar](https://fluent2.microsoft.design/components/web/react/core/toolbar/usage).

VS Code documents views that users can move between sidebars and the bottom panel. It recommends short names and restrained view actions. This is a close workbench precedent for keeping identity and commands consistent after docking changes. [VS Code: Views](https://code.visualstudio.com/api/ux-guidelines/views).

### Abbreviation must preserve meaning and access

Unfamiliar icons need text to communicate their meaning. Retain visible verbs such as Run, Apply and Cancel. Familiar shell icons may use tooltips and accessible names. Reducing explanatory paragraphs creates room without making users decode the primary action. [NN/g: Icon usability](https://www.nngroup.com/articles/icon-usability/).

WCAG 2.2 provides a useful accessibility baseline: ordinary vertically scrolling content should reflow at a width equivalent to 320 CSS pixels. Content whose meaning requires two dimensions, including diagrams and data tables, has an exception. The 256-pixel height provision applies to horizontally scrolling content; it is not a general minimum height for docked panes. Graph's surrounding controls still need accessible operation. [W3C: Reflow](https://www.w3.org/TR/WCAG22/#reflow).

Pointer targets generally need at least 24 by 24 CSS pixels, subject to the criterion's exceptions. The application uses labeled buttons. A smaller pane should first reduce spacing and secondary content. [W3C: Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Keyboard order must remain meaningful. Fixed action regions must avoid covering focused controls in scrolling content. Disclosures need keyboard activation and exposed expanded state. These requirements constrain how sections move or disappear during a resize. [W3C: Focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).

These sources support the approach. They do not establish that a particular Axiom layout is faster, or that every setting placed in Options is infrequently used. Those judgments need task-based testing.

## Shared layout policy

Use the pane's content width and height below the docking tabs. A right-hand pane can become wide; a detached window can be narrow. Docking location alone should never select the layout.

| Presentation | Entry threshold, CSS pixels | Arrangement |
| --- | --- | --- |
| Expanded | Width at least 600; height at least 400 | Full configuration and working content. At sufficient width, show them beside each other. |
| Narrow | Width below 600; height at least 400 | Single column. Task header and labeled actions precede results. Options opens configuration in the same pane. |
| Shallow | Width at least 600; height below 400 | Horizontal task header with compact context. Remaining height goes to results or the editor. Options temporarily replaces that body. |
| Narrow and shallow | Both dimensions below those thresholds | Narrow structure with shallow content priority. One working section at a time. |

These are application defaults derived from the content and tested layouts. They are not thresholds prescribed by the cited UX guidance. A narrow pane leaves that mode at 616 pixels; a shallow pane leaves at 416 pixels. This 16-pixel interval prevents repeated switching near a boundary. Query already needs 860 pixels for its composer arrangement; preserve that requirement until testing supports a change. Consistency means shared priorities and behavior, with explicit space requirements for each view.

Below 240 pixels wide, or below 210 pixels high when narrow and 180 pixels high otherwise, form panes show their identity and a Maximize pane action. Their contents remain mounted but inert. The action enlarges the docked tabset or the detached window, and restores focus to the retained work. This recovery state cannot support normal editing. Graph continues displaying its canvas at these sizes.

### Rules every applicable view shares

1. Keep the primary action available while its task is active. Expose Cancel in the same action area when an operation supports cancellation.
2. Reserve a short action region outside the main scroller. In a narrow pane, identity may occupy a separate line. Secondary actions overflow in a stable order.
3. Keep names, ordering and icons consistent. Compact copy can remove redundant view names from buttons when meaning remains clear.
4. Put explanatory help, detailed metadata and occasional setup behind named disclosures. Preserve readable labels and the working content.
5. Keep errors, unsaved changes and invalid or outdated results visible. Explain why an action is unavailable.
6. Expose changed settings in the summary. Touchpoints shows its query and the fetch date of the displayed results.
7. Make content access reversible. Closing Options returns to the same result and scroll position. Preserve entity selection, drafts, selections and active operations across resizes.
8. Keep the shell's maximize, restore and popout functions available.

## Touchpoints layout

The search field, Search and Refresh controls remain above the results scroller. Candidate rows wrap descriptions and IRIs. Selected rows expose their relationship and target controls, and the footer retains the selection count and Apply action. Resizing does not trigger a search or apply statements.

## Coverage across the current views

App.tsx declares seventeen dockable component types. The per-view policies below cover eleven of them; Taxonomy assistance, Error log, Tab history, Sparsity, Text Analysis and Text Entities also inherit the shared measurement. Nested tools inherit the same rules, even when they are not independently dockable.

| View | Expanded | Narrow | Shallow | Preserve |
| --- | --- | --- | --- | --- |
| Touchpoints | Search and ranked candidates | Wrapped rows and relationship controls | Compact actions above results | Query, candidate attribution and explicit Apply |
| Inspector | Fields, relationships and usage | Name, label, common edits; secondary disclosures | Editable identity beside the active details section | Dirty draft, validation and Apply changes |
| Details | Predicate and Value table | Searchable resource cells and scoped Source | Header actions above the statement table | Language, datatype, graph identifiers and source drafts |
| Find | Persistent scope rail; one query row; Entity, Type and Synonym columns | Options shows scope ratios; synonyms fold into Entity; condensed pager and one inspector line | Options replaces the body; rows take priority over header, pager and inspector | Query, scope, sort, page, selected result, scroll and creation draft |
| Hierarchy | Tree, filter and creation actions | Same tree; secondary action overflow | Filter/action row above tree viewport | Hierarchy, expansion and keyboard navigation |
| Individuals | Grid and filters | Compact filters; column access and deliberate horizontal scrolling | Compact actions/filters; maximum row area | Sort, filters, selection, values and virtualization |
| Query | Editor with composer alongside when space permits | Editor or composer in active body | Compact history/actions above editor | Text, undo, cursor, document identity and Run |
| Query results | Grid with execution context | Brief identity; execution-detail disclosure | Actions and counts above grid | Executed query, run attribution and column access |
| Source | Editor with format and edit actions | Same editor; compact controls | Action/status row above editor | Exact source, draft, cursor and validation |
| Filesystem provenance | Folder/options and collection details | Choose, Collect/Cancel and progress; options disclosed | Folder/action row above progress or evidence | Root, coverage limits, errors and status |
| Graph | Graph and existing interaction model | Same graph; smaller drawing area | Same graph; smaller drawing area | Camera, layout, budget, pins and selection |

For grids, a smaller width should not silently remove data columns or replace the grid with unbounded cards. Optional column presentation needs explicit access to hidden values. Tree indentation continues to represent hierarchy.

Linked file previews preserve images, document pages and other visual content. Their metadata can use disclosures. Taxonomy assistance retains its modal review flow and footer actions. Export and style settings also remain dialogs. These tools are not independently dockable layouts.

Graph is an explicit exception to content abbreviation. Its existing toolbar and canvas retain their behavior. Every pane shape keeps the visual workspace, camera and node budget.

### Find

Find reads the shared pane rectangle and hysteresis for both layout and keyboard behavior, including in detached windows. It adds no container breakpoints. In Narrow and shallow, Type joins Synonym inside the Entity cell; Sort withdraws, leaving the scope entry, field and More above the rows. Recovery retains the mounted controls and editor as inert content until Maximize pane restores the work.

Clear and Recent searches sit inside the field. Clear is absent for an empty query. More always contains Results per page (25, 50, 100 or 200; default 50), plus actions and full metadata for a selected result. The scope header owns Reset filters, which appears only when scope or sort differs from the defaults. Reset restores name/IRI fields, all entity types and Best match without changing the query. An explicit Search all fields remedy searches every field instead. The scope summary remains visible beside Options whenever the rail is not a column.

The results header owns Open results in new graph and leaves that slot empty with no results. Narrow presentation uses its icon with the full accessible name. Creation appears only in the zero state. In shallow panes one button opens the retained editor over the body; that button and editor never appear together. Options and the editor preserve explicit disclosure state across resizing. Escape closes a disclosure and restores its trigger.

From the query, Down enters the results, Escape clears the query (then enters results on the next press), and Alt+Down opens Recent searches. Rows use Up/Down, Home/End and Page Up/Page Down; Up from the first row returns to the query. Space selects without navigation; Enter opens Details. Page changes initiated from rows focus the first current result once it arrives. Ctrl+F retains the workbench's compact Find modal.

## Implementation

[AdaptivePane.tsx](../src/renderer/AdaptivePane.tsx) wraps each view at the FlexLayout factory boundary. It measures the content rectangle in its owner document. PaneToolbar keeps primary commands visible and moves secondary controls into a native popover. PaneDetails preserves explicit disclosure choices and keeps focused fields accessible across a mode change. Each view declares its commands and content-specific layout.

CSS container queries style descendants according to container dimensions. Queries using both width and height need an appropriate size containment context. The docking host must supply definite dimensions so containment cannot collapse the pane. [MDN: CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries).

Use CSS for spacing and column changes. Use the existing ResizeObserver approach when React must choose the visible working section. Share one measurement policy; avoid separately inferred JavaScript and CSS breakpoints that disagree. Measure the pane in its owner document, including popout windows.

Do not key or remount an editor by presentation mode. Keep drafts and operation ownership outside replaceable layout fragments. Touchpoints requests remain attached to the captured entity, with stale responses ignored after selection changes. Monaco models and grid state must retain their existing owners.

Ignore zero-size readings from inactive tabs. Keep mode changes stable around boundaries, with a small tested hysteresis interval if needed. Preserve explicit disclosure choices across resizes. Touchpoints keeps its search controls visible in every working layout. If a focused section would become hidden, keep it open or move focus to its named disclosure control with the work preserved.

Prefer a content scroller bounded by actual header/footer rows over layers that cover content. Avoid several nested scroll areas for ordinary fields. Exceptionally small panes should surface the maximize recovery action without changing the task.

Inspector submits its existing form through an associated Apply button in the fixed footer. Touchpoints shows the entity and query associated with its displayed candidates. Query and Source retain their Monaco editors. Grids retain their existing models and column access. Provenance keeps progress and errors above its options scroller. The Edge inspector shares the action and disclosure components; taxonomy assistance remains a modal with its existing review footer.

## Validation criteria

Use the same tasks in an expanded pane, a narrow pane and a shallow pane. Test actual Electron docking, resizing, maximizing, restoring and popouts.

Suggested content rectangles are 1100 by 660, 360 by 680, 1100 by 260 and 360 by 260 CSS pixels. Include extreme tabset sizes, accounting for docking chrome. Test both sides of each breakpoint, rapid splitter movement, application zoom, Windows scaling and a popout moved between monitors.

Acceptance checks:

- With Touchpoints ready, Search and Refresh remain visible without scrolling. Selected candidates have a reachable Apply action.
- Editing the exact prompt, opening a suggestion, resizing and returning preserves inputs and result identity.
- Resizing with focus in a field leaves a visible, meaningful focus location. Options, overflow and preview work by keyboard, with correct focus return.
- Errors, dirty drafts and stale-result explanations remain evident. Invalid operations stay disabled.
- Long names, identifiers and larger text do not hide primary actions. Ordinary forms avoid horizontal page scrolling.
- Grids retain all accessible values, virtualization and selected rows. Query and Source retain text, cursor and undo history.
- Graph retains camera, coordinates, pins and budget. Resizing causes no unintended relayout or replacement presentation.

Observe representative users finding touchpoints, editing a query, editing an entity and returning to results. Compare whether they locate actions and recover secondary details in each shape. Adjust priorities and breakpoints using those observations. No user-performance measurements or mixed-monitor Windows scaling checks have been collected. Automated tests do not establish complete accessibility conformance.

## Desktop verification

[adaptive-panes.spec.ts](../tests/e2e/adaptive-panes.spec.ts) exercises actual Electron windows and the production views. It checks Inspector edits and focus, Query editor identity and undo, Graph state, and retained Details and query results. The remaining pane checks cover visible primary actions and horizontal overflow at expanded, narrow and shallow sizes.

Find's additional desktop cases are in tests/e2e/find-adaptive.spec.ts. They exercise all four presentations, minimum usable sizes, hysteresis, recovery, detached-window measurement, retained scope/editor focus, keyboard selection and paging, and normalized-name warnings through both creation paths. Light and dark themes are checked separately with enlarged text, reduced motion, automated accessibility rules, 4.5:1 text contrast and 3:1 control/focus contrast. The existing Find and background-search suites cover ranking, graph results, synonyms, persistence, held replies and immediate lexical feedback.

Desktop screenshots are written under artifacts/testing with the adaptive view prefixes. The broader desktop suite continues to check entity editing, native menus, query execution, docking and workspace ownership. See the [verification record](verification.md) for the final run results.
