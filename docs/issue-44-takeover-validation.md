# Issue #44 takeover and validation

The continuation starts from Claude's `ee40d63` on `issue-44-quality-pane-visual-reference`. All twelve commits are retained. The original worktree remains at `C:\Users\Craig\AppData\Local\Temp\wt-44`; continued work is on `issue-44-codex-takeover` in `D:\git\axiom`.

## Confirmed fixes

- Closing and reopening the pane retains filters, expanded bands, page, open detail, settings visibility and the unfinished label review. Filter effects no longer reset a restored page merely because the component mounted.
- Rules returns to the previous results scroll position. Reopening a tab defers scroll restoration until the shared pane measurement matches the actual docking rectangle; the initial unconstrained content height would otherwise clamp the restored offset to zero.
- Duplicate-selection rejections preserve the full entity identity across the worker's error message. Colons inside an IRI no longer truncate the entity to its scheme.
- Evidence and correction previews escape control characters, including Windows line endings. Identifiers ending in a dot use full IRIs instead of invalid abbreviated Turtle names. Twelve parser round-trip cases verify exact RDF terms in both evidence and preview output.

The two added desktop regression cases exercise real controls and the real worker. Both fail on the inherited build and pass with the fixes. No scanner matching semantics or RDF mutation rules changed.

## Verification

- TypeScript check passed.
- Full unit suite: **98 files, 11,653 tests passed**.
- Focused scanner and serialization suites: **207 tests passed**.
- Inherited build baseline: **19 functional desktop cases and 46 exact-pixel cases passed**.
- Packaged validation: **21 functional desktop cases and 46 exact-pixel cases passed** (67 total). Both themes, all scan states, reviewed additions, recovery and compact presentations are covered. No differing raw pixels were accepted.
- The packaged executable scanned an isolated copy of `C:\Users\Craig\Desktop\courses.owl`: 5,879 eligible entities, 23,836 statements, 27 enabled checks and 6,747 findings, in approximately 2.55 seconds through the UI. Industrial Safety retains its missing-label, missing-description and analysis-exclusion findings. The three retired-entity checks were withdrawn by the census. There were no renderer errors; scanning preserved the Store revision and dirty state.

The original ontology's SHA-256 before and after was `e4f06e10547551d84dcd6271f1f0156cb8867c2051db991537f2c1715f8443c8`. The report is in `artifacts/issue-44-takeover/packaged-real-check.json`; the packaged desktop log is `artifacts/issue-44-packaged-validation.log`. Light, dark, preview and real-ontology screenshots were visually inspected.

An initial full unit run, concurrent with packaging, had one failure in the unchanged Wikipedia cache coalescing test. Its 44-test file passed on isolated rerun, and the subsequent full suite passed after packaging. No Wikipedia test or implementation was changed. Logs: `artifacts/issue-44-final-unit.log`, `artifacts/issue-44-wikipedia-recheck.log` and `artifacts/issue-44-final-unit-recheck.log`.

The visual reference and its pinned fixture retain SHA-256 `9eee75ead939e8c1e21a3bd9e23cf756091c57edc9006f1d0a239c58e4e79fe6`. The existing harness renders the reference afresh and requires zero differing raw pixels; no application screenshot became a baseline and no tolerance was added.

## Package

`npm run package` completed at `2026-10-03T23:09:02.671Z`, with Electron 44.3.0 and verified Mutatoc 0.5.0. The package is unsigned.

```text
D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe
D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe
```

## Toolbar decision

Issue #44's final handoff identifies a conflict between exact reference fidelity and toolbar reachability. At the reference's ordinary Expanded width of 718 pixels, trailing toolbar controls are clipped. The current package preserves the reference's layout. Wrapping the toolbar is recommended when controls cannot fit, but it changes the authoritative appearance and is awaiting Craig's choice.

The pinned HTML and production toolbar CSS have not been changed. A wrapping proposal is captured by injecting CSS into one isolated test application solely for a comparison screenshot; that injection is removed afterward and does not alter the package. Issue #44 remains open pending the toolbar decision.

The comparison screenshots, inspected against the real ontology at 718 CSS pixels, are:

```text
D:\git\axiom\artifacts\issue-44-takeover\toolbar-current-718.png
D:\git\axiom\artifacts\issue-44-takeover\toolbar-wrapping-proposal-718.png
```

The second row in the proposal exposes Group by, Filter, Export and More. It is a design proposal, not a substitute baseline for the exact-reference tests.
