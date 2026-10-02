# Issue 36: selection-only Find context

Find renders its context section only for an entity selected in the displayed results. With no selection, the section is absent from the DOM and the result area recovers its height. The pager sits directly above the store summary. No replacement text was added.

The short-pane fit calculation runs when selection appears or disappears. It measures an absent inspector as zero, fits the result header and pager independently of selection, and shows context only when the remaining space can accommodate it. This prevents selecting a row from withdrawing the header and shifting the table. Result tables reserve scrollbar space so adding context cannot change column widths. The empty-result creation editor does not reserve additional scrollbar space.

The selected entity's name, created-here indicator, kind, IRI, ancestry, synonyms and description are retained. Search behavior, RDF data and stored workspace formats are unchanged.

## Evidence

- The original empty line consumed 30.86 CSS pixels. A temporary DOM experiment reproduced a 15.33-pixel table-width change when context introduced a scrollbar. See `artifacts/issue-36/investigation.json`.
- Five new desktop tests pass: no-selection DOM/space behavior, clearing selection during a held search, selection at the scrollbar boundary in docked and detached panes, retaining scroll/focus, and short-pane header/pager stability.
- All 57 existing Find redesign, adaptive layout and stability tests pass. Together these runs cover 62 distinct desktop cases.
- All 27 focused context and Find redesign tests pass again directly against the rebuilt Windows EXE. See `artifacts/issue-36/packaged.log`.
- TypeScript validation passes. Logs are `artifacts/issue-36/typecheck.log`, `context.log` and `regression.log`.
- All 22 reference cases pass the separate empty-context and result-area/pager/store geometry comparisons. Evidence is recorded in `artifacts/issue-36/context-*.json`.
- All 22 baselines were regenerated from the amended HTML. Twenty images changed; the two shallow frames are unchanged because their context was already hidden.
- Packaged selection measurements retain table top 118.26 and width 620.67 CSS pixels before and after selection, in both docked and detached panes. The result viewport gives up about 31 pixels for context while columns and scroll position stay unchanged. See `artifacts/issue-36/selection-docked.json` and `selection-detached.json`.

## Windows delivery

Packaged October 2, 2026 at 18:31 UTC. All 563 packaged build files match the verified build byte for byte; the bundled Mutatoc runtime remains 0.3.1. See `artifacts/issue-36/package-verification.json` and `package.log`.

Application: `D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe`

Installer: `D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe`

## Existing visual limitation

Full-pane strict pixel comparisons pass in the two shallow cases and fail in the other 20. The statement editor differs from this older visual fixture following the previously committed grouped-values work. The old EXE also fails against the old committed HTML and snapshot in an isolated light-wide comparison, before issue 36 is applied. That comparison reports 86 differing pixels; the amended wide frame exposes more of the editor and reports 157.

The original full-pane assertions retain zero pixel tolerance, without masks, skips or expected-failure annotations. No reference was generated from application output. See `artifacts/issue-36/baseline-visual.log` and `visual.log`. This change does not claim full-pane visual equality.

## Changed files

- `src/renderer/FindPanel.tsx`: conditional context rendering, selection-aware measurement and stable short-pane fitting.
- `src/renderer/find-reference.css`: stable scrollbar space for result tables.
- `tests/e2e/find-context.spec.ts`: five focused desktop regressions, screenshots and measured selection geometry.
- `tests/e2e/find-redesign.spec.ts`: replaces the retired placeholder assertion and verifies appearance and removal.
- `tests/e2e/find-visual.spec.ts`: pins the amended reference hash, verifies context geometry independently and uses the current Add row accessible name.
- `tests/fixtures/find-visual/visual-reference.html`: removes the empty context from the zero frame.
- `tests/fixtures/find-visual/README.md`: records the amendment and verification limits.
- Twenty light/dark PNGs under `tests/e2e/find-visual.spec.ts-snapshots`: independently regenerated reference baselines.
- `docs/issue-36-validation.md`: this report.

The external reference and the user-owned files under `specs/` were not modified.
