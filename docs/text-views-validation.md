# Text view separation and menu access keys

Implemented 4 October 2026.

## Behavior

- Text Analysis has View Summary / View Text. Both use one analysis session; the text editor remains mounted while Summary is displayed, preserving selection, scroll and Undo history.
- Add entity is a separate dockable pane with the existing form, parent and nested-parent drafts, Find handoff and source context. Opening Text Analysis alone no longer opens a second pane.
- The text-selection toolbar and context-menu action are named Add entity. View > Add entity opens an existing draft or a blank form.
- Automatically named Text Entities tabs migrate to Add entity with their sequence suffix and location retained. Custom names are retained.
- Editor context menus show unique underlined keys. Text Analysis has T Cut, C Copy, F Find, P Paste and A Add entity; selected-text commands are omitted when no text is selected. Query, ontology source, entity source and detached editor menus share the implementation.
- Paste reads through the trusted desktop bridge and targets the owning editor. It works through P, Enter and a mouse click without granting browser clipboard-read permission, including detached documents that share the main renderer. Pending reads are discarded when their editor context changes.

## Verification

TypeScript, changed-code Prettier checks and git diff --check passed.

The complete functional unit run passed: 100 files, 11,677 tests. An initial concurrent run had one failure in the unrelated Wikipedia request-coalescing test; that file passed separately (44 cases), and the full suite passed with two workers.

Desktop coverage includes native Mutatoc analysis and source highlights; summary colors, counts, Details navigation, empty results and persistence; separate pane creation, closing, resizing and docking; nested parent drafts; create/cancel/undo/redo; Find handoffs; blank standalone authoring; mouse and keyboard menus; Query and source editors; detached Add entity; detached Text Analysis summary and menu-letter invocation after pointer selection. Screenshots were visually inspected and light/dark accessibility checks are included.

The broad development desktop run completed 112 cases: 101 passed, ten application-menu failures also reproduced on the previous packaged executable, and one new test helper raced the asynchronous pane switch. The helper now waits for the pane before switching its presentation; its recheck passed. The 21 hierarchy and graph context-menu cases all passed. The ten menu failures concern window-title expectations, graph-pane restoration, query cancellation timing, cancelled-file expectations, detached graph reopening, menu coverage inventory, graph stylesheet restoration, two hierarchy rename selectors and edge selection. They are outside this change. Baseline artifact metadata is recorded in artifacts/text-views-baseline-build.json (package timestamp 2026-10-04T01:50:18.889Z).

Logs: artifacts/text-views-desktop-validation.log, artifacts/text-views-menu-baseline.log and artifacts/text-views-unit-validation-final.log.

## Package

The executable is D:\git\axiom\artifacts\installer-text-views\win-unpacked\Axiom.exe. The installer is D:\git\axiom\artifacts\installer-text-views\Axiom-Setup-1.0.0.exe.

Build timestamp: 2026-10-04T03:16:50.926Z. Packaging completed at 2026-10-04T03:20:59.544Z. Electron 44.3.0 and bundled Mutatoc 0.5.0 are retained. The installer remains unsigned, as in the previous build.

All 39 packaged application bundles and metadata files checked against dist matched byte for byte. The archive SHA-256 is 8d8003b08de9f036e35994cd28740a8da38869db908ba3dcb1d60a21e3e97c00. Verification data is in artifacts/text-views-package-provenance.json.

The final packaged executable passed all 82 desktop checks in 4.5 minutes: 61 Text Analysis / Add entity cases and 21 hierarchy and graph context-menu cases. Native analysis used the bundled Mutatoc runtime. Results are recorded in artifacts/text-views-packaged-validation.log and artifacts/text-views-packaged-test-results.
