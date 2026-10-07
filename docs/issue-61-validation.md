# Issue 61 validation

Observed on Windows on 2026-10-07, with Electron 44.3.0 and device scale 1.

## Reference and fixtures

The visual reference remains byte-for-byte unchanged: 71,021 bytes, SHA-256 `a331ecb4a08aafba275b1a19acfbe5b18d76004d0185b496660435575a38501a`. Every visual test checks this hash. `.gitattributes` prevents line-ending conversion.

The compressed census expands to 9,809,917 bytes with SHA-256 `5d7423ebf20410a24c27b005bc73561ebd52c21fbcd7b77776bd5cf7da193c63`. It contains 21,461 individuals and 231,619 triples. The computed chooser has 15 columns and the required five defaults. Census tests check every fill, distinct count, identifier tag and default, including the three corrected distinct counts. They also check a second `rdf:type` becoming eligible and search results of 1,271 with the default fields and 2 without comments.

Subsequent issue #59 replaces that phrase-preferred filter with Find's shared partial-token retrieval. The same query now matches 3,147 rows with the default fields and 578 without comments. The historical counts above describe #61's original validation; the visible-field boundary, census statistics, defaults and visual reference remain unchanged.

The eleven-row fixture comes from the reference's `ROWS`. The Inspector fixture uses the census's 29 aliases, ordered as drawn, including the reference's U+2010 hyphen. Wikipedia responses are recorded fixtures; visual tests disable the local model and make no live Wikipedia requests.

## Visual comparisons

The six surfaces are Individuals, Columns, individual Inspector, class Inspector, Touchpoints and the shared legend. Each runs at 1100×660, 360×680, 1100×260, 360×260, 230×660 and 1100×110, in light and dark: 72 comparisons.

All 72 comparisons pass against the packaged executable, with zero differing pixels. `artifacts/issue-61-visual-summary.json` records the result of each comparison.

| Surface              | Comparisons | Differing pixels |
| -------------------- | ----------: | ---------------: |
| Individuals          |          12 |                0 |
| Columns              |          12 |                0 |
| Individual Inspector |          12 |                0 |
| Class Inspector      |          12 |                0 |
| Touchpoints          |          12 |                0 |
| Shared legend        |          12 |                0 |

The harness compares raw bitmaps, without masks, tolerance or application-generated baselines. It saves application, reference and difference PNGs plus geometry and differing-pixel records under `artifacts/issue-61`. It uses the issue's permitted data/control substitutions and excludes Touchpoints' 33-pixel mock dock strip.

Like the existing Details and Extend capture helpers, both renders receive matching compositor boundaries (`translateZ(0)`) during capture: the frame, toolbar controls and pills. This preserves measured geometry, colors, borders, text and content while making Chromium's fractional-edge rasterization consistent between docked controls and static HTML. Direct captures without that normalization differ at antialiased edges; this report's zero-pixel criterion refers to the shared capture configuration. The reference file itself is never edited.

Regions that required multiple passes:

- All pane frames: rounded borders, background behind transparent corners, native resize grip and recovery clipping.
- Individuals toolbar: inherited control resets, filter sizing, the Columns count's spacing, class-select visibility and resize separators.
- Column chooser: header spacing, count kerning, body scrollbar, tags, fill bars and rounded corners.
- Inspector: predicate/value widths, fractional row heights, alias order, inferred-row styling, usage wrapping, header-only recovery and retained save controls.
- Touchpoints: pinned/query bands, relationship order, Linked/check/cross pills, footer clipping, mock-tab exclusion and narrow recovery geometry.
- Legend: theme token inheritance and tag/pill border rendering.

Screenshots were inspected by region in both themes, including expanded, narrow, shallow and recovery presentations. The reference's narrow class selector and clipped inferred tag/Touchpoints footer are preserved as drawn.

## Functional checks

- Packaged desktop validation passes: 53 tests, with the development-only intercepted updater case skipped. That updater case passed in the source run. The packaged run includes all 12 visual tests (72 image pairs), four new behavior tests, eight Inspector tests, five Touchpoints tests, eight shared statement-group tests, ten background-input tests and six multi-instance tests.
- The complete unit suite passes: 114 files, 12,005 tests (`artifacts/issue-61-unit-clean.log`). A concurrent Wikipedia-cache test now accepts either identical request finishing its initial disk lookup first, while still requiring exactly one fetch and one cache hit.
- Column interaction tests exercise shown-field filtering, multivalue popovers and focus return, pointer resizing without row mutations, real header dragging, keyboard resizing/autofit/sorting/navigation, per-class layouts, close/reopen and workspace save/reopen.
- Inspector tests exercise grouped additions/removals, metadata preservation, selection-retained drafts, typing during Apply, predicate-specific refusals, Rename/Discard and one Undo per Apply.
- Touchpoints tests cover explicit search, persistent caching, failed Refresh retaining rows, linked targets, batch Apply/Undo, stale results, subject pinning and tab reuse without suffixes.
- All eight existing shared statement-group desktop tests pass. Background-input and multi-instance desktop checks also pass.

## Contrast audit

The supplied colors are retained. Text, muted text, warning/Linked tags and primary buttons pass 4.5:1 in both themes. Focus against the ground is 5.90:1 light and 8.00:1 dark. The reference's idle control borders measure 1.45:1 light and 1.64:1 dark against their fields; these do not satisfy the prose's blanket 3:1 graphics target. The issue explicitly gives the rendered reference precedence. Measured pairs are in `artifacts/issue-61-contrast.json`.

## Build and delivery

`npm run typecheck` and `npm run package` pass. The packaged main process, domain worker, renderer JavaScript and renderer CSS match `dist` byte for byte; SHA-256 values are in `artifacts/issue-61-bundle-hashes.json`.

- Executable: `D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe`
- Installer: `D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe`
- Package log: `artifacts/issue-61-package.log`
- Packaged desktop log: `artifacts/issue-61-packaged-desktop.log`

The packaged build includes the preserved local multi-instance implementation from issue 60. The issue 61 commits are separated from that work; no remote publication was made.

## Existing Details visual blocker

The unrelated `details-visual.spec.ts` stops at its reference-hash assertion before rendering. Its expected hash is `3387b593125c5ba95e338c3dbdd6e0f8775b4ecf390eebd829d3401476e67e90`; the unchanged checked-in file hashes to `0cdd5cc4925e8e808eb1b81ddcc1da9d9dd6ed6d55cde1905a8420c58ecff95c`. Neither that fixture nor its expected hash was changed. Shared statement-group behavior is covered separately by the passing functional tests.
