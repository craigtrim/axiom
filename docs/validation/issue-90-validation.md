# Sparsity reference validation

Issue #90 replaces the legacy Sparsity card, sliders and table with the shared action row, fixed settings rails and grouped report. The report retains its settings, expansion, selected comparison, filter and page. Analysis remains local and does not edit RDF.

## Evidence

- TypeScript and the production build pass.
- The complete unit suite passes: 11,955 tests, with 182 optional tests skipped. The 21 Sparsity tests include every reference comparison at all five influence settings, rounding before filtering, clean children beneath cyclic parents, comparison totals, paging and persisted options.
- All 36 native behavior scenarios pass after correcting the empty results region's ARIA role and the inherited dark hover color. Coverage includes both context-menu entry points, invalid numeric drafts, overflow navigation, keyboard menus, recovery hysteresis, close/reopen, workspace restart, a held worker, failed recomputation, RDF edits and Undo. Accessibility checks pass in light and dark settings and selected reports, and in a detached narrow dark report.
- All 46 published frame pairs compare with zero differing raw pixels at device scale factor two. The keyboard-focus pair was then rerun using Tab and Shift+Tab, with an explicit `:focus-visible` assertion, and both comparisons also pass. The comparison uses no masks or color tolerance.

Screenshots were inspected for settings, collapsed groups, the selected sibling baseline, narrow menus, recovery and the keyboard focus ring. Native popups and reference popups use the same Chromium top layer during capture, so their rounded borders follow the same rasterization path. The reference host explicitly inherits the requested color scheme for native scrollbars.

## Fixture and reference decisions

The pinned HTML remains byte-identical to the issue's reference. The fixture evaluates its seeded taxonomy and emits real RDF, then the application computes the report through its domain worker. The whole-taxonomy totals are 467 named classes, 205 groups, 769 measured candidates, 51 unscored candidates and 4 excluded comparisons, for 824 comparisons in total.

The reference contains conflicting sibling-order requirements: Social Policy 3.3 orders Social System 4.2 before Social Measure 4.1, while Social System 3.1 reverses them. No single sort of RDF local names can satisfy both. Numeric local names therefore follow seed creation order, preserving the Business baseline shown in the frames; other ties retain store order as decision 12 requires. This refinement is recorded on the issue and in the fixture README.

The harness applies the issue's recovery, band, toast and paging corrections, pressed-button semantics, and shared Maximize spelling. Focused menu rows use the reference's existing active-item token to match SharedMenu. All calculations and visible fixture values come from the independent reference or the real store.

## Reproduction

Run `npm run typecheck`, `npm test` and `npm run build`. Run `npm run test:desktop -- tests/e2e/sparsity-visual.spec.ts` for the 46 image pairs. Run `npm run test:desktop -- tests/e2e/sparsity.spec.ts tests/e2e/sparsity-reference.spec.ts tests/e2e/entity-context-menu.spec.ts` for the 36 behavior scenarios.

For a manual check, open an ontology and choose View > Sparsity. Compute a report, expand a parent and select a finding. Resize the pane and use its overflow navigation. Close and reopen it, then edit a parent relationship and Undo; the report should refresh in place without a computation toast. No migration, paid model call or deployment is required for this change.
