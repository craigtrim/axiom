# Issues 47 and 48 validation

Completed sequentially on 4 October 2026 (UTC). Issue 47 was committed, packaged and checked against its executable before issue 48 implementation began.

## Issue 47

Commit `46a481f` connects parent selection to the shared Find index through progressive resource search. Normalized label/local-name and drafted-parent checks suppress duplicate creation offers. Pending searches withhold choices; superseded replies cannot replace the current results.

TypeScript and 31 focused unit cases passed. The parent-workflow run passed 14 desktop cases, and the delayed-reply run passed two more. Both new regressions passed against the separate issue 47 package and again against the combined package. These include all requested spelling variants, partial/typo queries, selecting the existing class, saving the correct parent, undo and delayed responses in reverse order.

## Issue 48

Find's new-class offer uses the same creation preview and collision guard as its editor. It checks the title-cased label and its proposed IRI across the entire ontology. Result counts do not gate eligibility. Exact and IRI collisions disable creation; normalized-only collisions remain warnings. The existing zero-state editor remains inline.

The results plus opens the existing editor as an overlay. Back to results and Escape preserve the page, selected entity and draft; the table remains mounted and inert behind the editor. In shallow panes that withdraw the count strip, More exposes the same action. Creating a class, undoing it and reopening creation reseeds the query correctly. Row actions read `+ Synonym` and retain their existing rdfs:seeAlso behavior.

The pinned HTML reference was amended before the UI implementation, explicitly recording the #48 exception to #34. Four new action baselines were generated only from that HTML. Independent reference and application captures match exactly, including raw bitmap pixels, for both light and dark themes. Isolated controls use identical integer origins and compositor isolation; no masking, replacement or resampling is used. The unchanged shallow zero states also pass the original full-pane comparisons in both themes. This does not claim to resolve the previously documented full-pane grouped-editor differences in the wider #34 suite.

## Results

- TypeScript, changed-source Prettier and Git whitespace checks passed.
- Complete functional unit suite: 101 files, **11,699 passed**.
- Broader Find desktop run: **82 of 83 passed** initially. The remaining synonym-undo test raced the asynchronous focus restoration after opening Find. Its test now waits for the search field's focus before explicitly focusing the result and issuing ontology Undo. It passed on the final packaged executable. The same original case passed separately on the issue 47 package.
- Final combined packaged run: **11 of 11 passed** in 45.2 seconds, covering both #47 regressions, both #48 create/undo parent routes, collision rules, zero-state behavior, detached shallow creation, synonym undo/redo, new action visuals, and unchanged shallow zero-state visuals.

Logs are in `artifacts/issues47-48-unit.log`, `artifacts/issue48-desktop.log`, `artifacts/issue48-synonym-baseline.log`, `artifacts/issue48-visual.log` and `artifacts/issues47-48-packaged-tests.log`. Visual evidence and computed geometry/paint properties are in `artifacts/issue-48`.

## Package

Executable: D:\git\axiom\artifacts\installer-issues47-48\win-unpacked\Axiom.exe

Installer: D:\git\axiom\artifacts\installer-issues47-48\Axiom-Setup-1.0.0.exe

Application build timestamp: `2026-10-04T03:55:20.418Z`. Packaging completed at `2026-10-04T03:59:25.967Z`. Both issues and the preceding text-view changes are included. The installer remains unsigned, as before.

All 39 checked application bundles and build metadata files match the final build byte for byte. ASAR SHA-256: `b7742ee26e8cfd31eb50f6f38c4f6f11b19535ad3d8fb0e2794e0db738b047ca`. Verification is recorded in `artifacts/issues47-48-package-provenance.json`.
