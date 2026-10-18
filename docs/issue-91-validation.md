# Hierarchy reference validation

Issue #91 replaces the legacy Hierarchy toolbar bands with the shared action row and footer. Classes and properties keep their existing ordering, authoring actions and navigation. The tree adds asserted-property counts, destination feedback, blocked-drop explanations and atomic moves of several selected branches.

## Evidence

- All 56 published frame pairs pass with zero differing raw bitmap pixels at device scale factor two. Both themes cover selection, keyboard focus, properties, filtering, menus, drag targets, move and Undo, shallow panes and recovery. No masks or color tolerance are used.
- All nine new native behavior scenarios pass. They cover accessibility in both themes, counts, empty filtering, atomic moves, stale drags, focused-row Details, exact multi-selection graph seeding, overflow, recovery hysteresis and retained scroll position. A held worker reply verifies that a move waits for earlier expansion history before becoming the next Undo.
- All 72 selected existing native scenarios pass after fixture corrections and the inline-rename layout fix. Coverage includes actual pointer dragging, hover expansion, edge scrolling, save/restart, named definitions, multiple inheritance, batch actions with a local test assistant, detached panes, instance counts, authoring and one-shot reveals from Details and Find. Together with the nine new scenarios, this is 81 behavior checks.
- TypeScript and the production build pass. The complete unit suite passes 11,961 tests, with 182 optional tests skipped. The 16 taxonomy-move tests include a 5,000-branch transaction, exact restoration of the original RDF, named-graph provenance, nested-selection pruning and validation of every member before mutation.

The screenshots were inspected for the move confirmation, keyboard focus ring, narrow overflow menu and recovery view. Both popup renderings use Chromium's top layer, and both captures use the same engine, location, color scheme and compositing conditions. The normal and keyboard-focus frames in both themes were rerun after the inline-rename CSS fix; all four remained exact.

## Reference and fixture

The reference HTML remains byte-identical to the issue attachment. Its SHA-256 is `4d900c2e638462c79a917bf0ba43ad85302ff98cadaa2d5f072b305f66abdbb7`.

The fixture reads its 36 classes and 14 properties and generates real RDF instances and predicate assertions for the published counts. Numeric local identifiers preserve sibling order under the existing store ordering; display labels supply the reference names. The application opens that RDF through File > Open and uses its real domain worker.

The oracle applies the issue's recorded recovery, footer, toast, overflow, disabled-menu and property-drag decisions. Property roots retain the app's alphabetical order. As recorded on #91, hover expansion refreshes the reference's stale footer count, and a blocked root drag repaints the root selection that the reference has already made internally. These corrections happen in memory; the pinned HTML does not change.

## Regression fixes

UI history already in flight now finishes before a following mutation. Without that ordering, an earlier expansion could appear above a completed move in the Undo stack. Recovery restores focus without scrolling the retained tree. Enter uses the focused row when a range is selected; Ctrl+G seeds precisely the selection.

The new branch transaction has no arbitrary 4,096-item cap. A 5,000-branch regression failed before that restriction was removed and passes afterward, including one Undo that restores the complete original RDF.

Inline rename can grow its row while editing, so its validation message does not overlap the next row. Ordinary rows retain their 26-pixel height. A geometry assertion reproduced the overlap and passes after the fix.

Existing behavior fixtures reveal a hidden Hierarchy filter through More actions. Rename fixtures explicitly reveal their target before using it. The zoom alignment check measures the card against the shorter toolbar instead of assuming it lies outside the tree. Adaptive fixtures use the current Individuals toolbar and open Touchpoints for an explicitly selected entity.

## Reproduction

Run `npm run typecheck`, `npm test` and `npm run build`. Run `npx playwright test tests/e2e/hierarchy-visual.spec.ts tests/e2e/hierarchy-reference.spec.ts --workers=1` for the 56 visual pairs and nine new behavior scenarios. Existing coverage is in `taxonomy-move.spec.ts`, `hierarchy-multiselect.spec.ts` and `instances-menu.spec.ts`. Run native suites sequentially.

For a manual check, open an ontology and choose View > Hierarchy. Ctrl-click two branches, drag them onto another class and use Undo move. Switch to Properties to inspect assertion counts. Narrow the pane and reveal Filter hierarchy through More actions. Select a class from Details or Find, then scroll Details; the completed tree reveal should stay in place.

No migration, paid model call or deployment is required for this source change.
