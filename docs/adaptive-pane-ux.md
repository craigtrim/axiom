# Adaptive layouts for docked views

Research and implementation record, 15 September 2026. The shared layouts are implemented in the desktop application. The source review below records the problem before implementation.

## Delivered behavior

Each view adapts to the space inside its pane. Research has a full working layout, a narrow layout for a side pane, and a shallow layout for a bottom pane. Primary actions remain outside the content scroller. Supporting explanations and occasional settings use named disclosures, Options and More.

All ten dockable component types use the shared pane measurement, with layouts suited to each view's content. Graph retains its existing presentation and interaction model at every size. Its canvas resizes without entering the form recovery presentation.

The [interactive Research mockup](adaptive-pane-preview.html) demonstrates the proposed layouts with sample content. Change its width and height independently, open Options, edit the instructions, and run the demonstration. Settings and results survive layout changes within the page session. It makes no assistant requests or ontology changes.

## Source review before implementation

The expanded Research pane gives its form enough room. In the shallow pane, the heading, explanation, assistant controls and template consume the visible height before the user reaches the instructions or Run research. A narrow pane has a different constraint: controls and explanatory text compete for width.

The supplied images were resized in transit. Their pixel dimensions cannot establish application breakpoints or Windows scaling. The implementation thresholds below use measured CSS pixels and include a recovery presentation for smaller panes.

| Location | Original behavior | Design consequence |
| --- | --- | --- |
| [ResearchPanel.tsx](../src/renderer/ResearchPanel.tsx) | One form followed by Run, source shortcuts and results. | The primary task can sit below a large amount of setup content. |
| [styles.css](../src/renderer/styles.css) | Research is a scrolling block. Shared panel toolbars wrap. | Reducing height can leave little space for work, even when width is plentiful. |
| [App.tsx](../src/renderer/App.tsx) | FlexLayout hosts ten component types, supports popouts and allows tabsets as small as 180 by 120 pixels. | Layouts must work wherever panes move. Extreme sizes need a recovery action. |
| [QueryPanel.tsx](../src/renderer/QueryPanel.tsx) | A ResizeObserver switches to compact behavior below 860 pixels of pane width. | There is an existing local adaptation pattern, but no shared height policy. |
| [GraphPanel.tsx](../src/renderer/GraphPanel.tsx) | Canvas size is observed independently of ontology data. | Preserve this separation when adding adaptation elsewhere. |

This inventory records the working tree before the adaptive layout changes, including the taxonomy work already in progress.

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

Pointer targets generally need at least 24 by 24 CSS pixels, subject to the criterion's exceptions. The mockup uses 32-pixel buttons. A smaller pane should first reduce spacing and secondary content. [W3C: Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

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

These are application defaults derived from the content and tested layouts. They are not thresholds prescribed by the cited UX guidance. A narrow pane leaves that mode at 616 pixels; a shallow pane leaves at 416 pixels. This 16-pixel interval prevents repeated switching near a boundary. Research gains simultaneous configuration and results at 960 pixels, where both columns can remain usable. Query already needs 860 pixels for its composer arrangement; preserve that requirement until testing supports a change. Consistency means shared priorities and behavior, with explicit space requirements for each view.

Below 240 pixels wide, or below 210 pixels high when narrow and 180 pixels high otherwise, form panes show their identity and a Maximize pane action. Their contents remain mounted but inert. The action enlarges the docked tabset or the detached window, and restores focus to the retained work. This recovery state cannot support normal editing. Graph continues displaying its canvas at these sizes. The earlier mockup uses a different 280-pixel width threshold.

### Rules every applicable view shares

1. Keep the primary action available while its task is active. Expose Cancel in the same action area when an operation supports cancellation.
2. Reserve a short action region outside the main scroller. In a narrow pane, identity may occupy a separate line. Secondary actions overflow in a stable order.
3. Keep names, ordering and icons consistent. Compact copy can remove redundant view names from buttons when meaning remains clear.
4. Put explanatory help, detailed metadata and occasional setup behind named disclosures. Preserve readable labels and the working content.
5. Keep errors, unsaved changes and invalid or outdated results visible. Explain why an action is unavailable.
6. Expose changed settings in the summary. Research should show the assistant, web permission and a Custom prompt indicator when applicable.
7. Make content access reversible. Closing Options returns to the same result and scroll position. Preserve entity selection, drafts, selections and active operations across resizes.
8. Keep the shell's maximize, restore and popout functions available.

## Research layouts

### Expanded

Retain the full form that already works in a large pane. Move Run and operation status into the task header. At ample width, show configuration on the left and results on the right. This keeps exact instructions available during review without requiring a scroll past them to reach results.

The form includes assistant selection, prompt template, editable instructions and web permission. Prompt preview remains explicit. Refresh and Restore default prompt are occasional commands. Applying suggestions remains a separate operation after review.

### Narrow side pane

Use this order:

1. Selected entity and kind.
2. Run, Options and More actions.
3. Compact summary of the active configuration.
4. Results, including expandable suggestion details and source access.

Options opens configuration in the pane body and changes its label to Results. Keep the task header available. The initial explanation becomes short empty-state guidance when no entity is selected. A user with a ready configuration can run research without passing through the form.

The exact prompt remains available in Options. Shortened result excerpts must provide access to full text. Preserve uncertainty and source attribution when reviewing suggestions.

### Shallow bottom pane

Use the width for a horizontal header: entity, Run, Options and More. Put the active configuration in a short line below it, then allocate remaining height to results. A wide but shallow pane should not stack the expanded form above the working content.

Options temporarily uses the body, with a compact two-column form where width permits. Preview can open a readable dialog in the containing window. Returning to results restores the previous position.

### Research state and actions

| State | Always evident | Body priority |
| --- | --- | --- |
| Nothing selected | Select an entity; Run unavailable | Brief selection guidance |
| Ready | Entity, assistant, web setting and Run | Previous results or a short invitation to run |
| Running | Running status and Cancel | Retained prior content with clear attribution |
| Complete | Result entity and completion state | Findings, sources and suggestions |
| Suggestions selected | Selection count and Apply selected | Selected suggestions and their details |
| Outdated result or error | Reason and recovery action | Preserved content with invalid application disabled |

If the user selects another entity during a run, keep the request and its eventual result attached to the original entity. Make that attribution visible. A resize must never trigger Run or Apply, change web permission, restore a prompt, or accept suggestions.

## Coverage across the current views

The ten dockable component types in App.tsx are covered below. Nested tools inherit the same rules, even when they are not independently dockable.

| View | Expanded | Narrow | Shallow | Preserve |
| --- | --- | --- | --- | --- |
| Research | Full setup and results | Actions/results; Options for setup | Horizontal actions; results or options body | Exact prompt, attribution and review before Apply |
| Inspector | Fields, relationships and usage | Name, label, common edits; secondary disclosures | Editable identity beside the active details section | Dirty draft, validation and Apply changes |
| Entity details | Full statement editor | Group each statement's fields; disclose optional metadata | Header actions above scrolling statements | All values, graph identifiers and drafts |
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

## Implementation

[AdaptivePane.tsx](../src/renderer/AdaptivePane.tsx) wraps each view at the FlexLayout factory boundary. It measures the content rectangle in its owner document. PaneToolbar keeps primary commands visible and moves secondary controls into a native popover. PaneDetails preserves explicit disclosure choices and keeps focused fields accessible across a mode change. Each view declares its commands and content-specific layout.

CSS container queries style descendants according to container dimensions. Queries using both width and height need an appropriate size containment context. The docking host must supply definite dimensions so containment cannot collapse the pane. [MDN: CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries).

Use CSS for spacing and column changes. Use the existing ResizeObserver approach when React must choose the visible working section. Share one measurement policy; avoid separately inferred JavaScript and CSS breakpoints that disagree. Measure the pane in its owner document, including popout windows.

Do not key or remount an editor by presentation mode. Keep drafts and operation ownership outside replaceable layout fragments. Research mixes local UI state with polled service status, so preservation across moves and popouts needs explicit verification. Monaco models and grid state must retain their existing owners.

Ignore zero-size readings from inactive tabs. Keep mode changes stable around boundaries, with a small tested hysteresis interval if needed. Preserve explicit Options choices across resizes. If a focused section would become hidden, keep it open or move focus to its named disclosure control with the work preserved.

Prefer a content scroller bounded by actual header/footer rows over layers that cover content. Avoid several nested scroll areas for ordinary fields. Exceptionally small panes should surface the maximize recovery action without changing the task.

Inspector submits its existing form through an associated Apply button in the fixed footer. Research retains its exact prompt and review selections, with the original request entity shown during a run. Query and Source retain their Monaco editors. Grids retain their existing models and column access. Provenance keeps progress and errors above its options scroller. The Edge inspector shares the action and disclosure components; taxonomy assistance remains a modal with its existing review footer.

## Validation criteria

Use the same tasks in an expanded pane, a narrow pane and a shallow pane. Test actual Electron docking, resizing, maximizing, restoring and popouts. Browser checks of the mockup establish only that the proposal is inspectable.

Suggested content rectangles are 1100 by 660, 360 by 680, 1100 by 260 and 360 by 260 CSS pixels. Include extreme tabset sizes, accounting for docking chrome. Test both sides of each breakpoint, rapid splitter movement, application zoom, Windows scaling and a popout moved between monitors.

Acceptance checks:

- With Research ready, Run is visible without scrolling at supported working sizes. Cancel stays visible during an operation. Selected suggestions have a reachable Apply action.
- Editing the exact prompt, opening a suggestion, resizing and returning preserves inputs and result identity.
- Resizing with focus in a field leaves a visible, meaningful focus location. Options, overflow and preview work by keyboard, with correct focus return.
- Errors, dirty drafts and stale-result explanations remain evident. Invalid operations stay disabled.
- Long names, identifiers and larger text do not hide primary actions. Ordinary forms avoid horizontal page scrolling.
- Grids retain all accessible values, virtualization and selected rows. Query and Source retain text, cursor and undo history.
- Graph retains camera, coordinates, pins and budget. Resizing causes no unintended relayout or replacement presentation.

Observe representative users running research, changing a prompt, editing an entity and returning to results. Compare whether they locate actions and recover secondary details in each shape. Adjust priorities and breakpoints using those observations. No user-performance measurements or mixed-monitor Windows scaling checks have been collected. Automated tests do not establish complete accessibility conformance.

## Desktop verification

[adaptive-panes.spec.ts](../tests/e2e/adaptive-panes.spec.ts) exercises actual Electron windows and the production views. It checks prompt and suggestion retention, original request attribution, stale application prevention, Inspector edits and focus, Query editor identity and undo, Graph state, and retained Entity details and query results. The remaining pane checks cover visible primary actions and horizontal overflow at expanded, narrow and shallow sizes.

Desktop screenshots are written under artifacts/testing with the adaptive view prefixes. The broader desktop suite continues to check entity editing, native menus, query execution, docking and workspace ownership. See the [verification record](verification.md) for the final run results.

## Mockup scope

The interactive Research mockup remains a design artifact with sample content and simulated operations. It is independent of the production implementation. Its simplified state machine omits real assistant failures, cross-window persistence and ontology conflict handling.

## Mockup verification

The standalone mockup was checked on 15 September 2026 using the locally installed Chromium headless browser with Playwright.

- Nine initial pane sizes kept Run or the minimum-size recovery action inside the pane, with no horizontal overflow in the pane body.
- Edited instructions, web permission and selected suggestions survived layout changes. Prompt preview, simulated Apply and cancellation after resizing worked.
- Automated axe checks reported no violations for the selected WCAG A/AA rule tags in five presentations. These checks do not establish complete accessibility conformance.
- Results and Options were also checked at widths of 280, 320, 600 and 1100 pixels with constrained heights. The 280 by 180 result presentation left only 23 pixels for content. This informed the production recovery thresholds, which reserve more height for narrow working panes.
- The expanded, narrow and shallow screenshots were visually reviewed. The shallow results use adjacent summary and suggestion areas.

Evidence: [browser check report](../artifacts/testing/adaptive-pane-preview-check.json), [expanded screenshot](../artifacts/testing/adaptive-pane-expanded.png), [narrow screenshot](../artifacts/testing/adaptive-pane-narrow.png), [shallow screenshot](../artifacts/testing/adaptive-pane-shallow.png). These files are local artifacts and may be absent from a fresh checkout.
