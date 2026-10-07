# Issue 57: Details reference implementation

Details now uses the reference's header, vertical ancestry, statement table, content-sized source region, and IRI/revision footer. The authoritative HTML is preserved unchanged at `tests/fixtures/details-visual/visual-reference.html`; every visual run verifies SHA-256 `3387b593125c5ba95e338c3dbdd6e0f8775b4ecf390eebd829d3401476e67e90`.

## Requirement accounting

| Area | Implementation and evidence |
| --- | --- |
| Header | Reference Back SVG, 40 px band, entity name, one status/actions slot, and More/Reload. Pending, invalid, and stale use the exact required words and actions. All four states are compared against fresh reference renders. |
| Ancestry | Vertical at every shape; no heading or wrapper card. Selected caption/name and ancestor/root circles, tiers, and fan connectors match. Existing tooltip, folding, peer expansion, traversal limit, navigation and `.ancestry-current` hooks remain. Ancestry regression cases cover deep/cyclic/intersection/individual data, zoom and detached views. |
| Statements | Reference count, headers, predicate typography and native dropdowns, value fields, fixed class declaration and action links. Existing folding, resource completion, keyboard traversal and automatic commit cases exercise real RDF changes. |
| Source | Always present when tall enough; no twisty or open preference. Native textarea matches the reference's metrics and colors, with one line per row up to 14. Local Undo/Redo, clipboard context-menu access keys and Find are exercised separately. Flat Turtle statements serialize to separate lines using N3 term escaping. |
| Formats | Six format choices; valid drafts apply before conversion, invalid and stale drafts block conversion, named-graph-incompatible formats are disabled. Domain tests parse each representation and verify graph preservation and unchanged native format. |
| Footer | Reference 28 px band with actual entity IRI and snapshot revision, withdrawn when shallow. |
| Presentations | Shared narrow/shallow measurements and 16 px hysteresis. Custom recovery below 240 px wide or 120 px tall portals the live header while retaining the controller. Tests retain the draft through withdrawal and save from recovery. |
| Draft integrity | Explicit one-step save, invalid preservation, refused conflicting save, discard/reload, independent grid/source merges, navigation, workspace restart, export, and anonymous expression editing. Error/stale metadata persists with drafts. Escape is scoped to source; resource Escape remains independent. |
| Copy and themes | Pinned-reference screenshots and DOM assertions cover light/dark colors, exact visible copy, source accessible names, and live announcements. |
| Documentation | Details editing, ancestry, adaptive-pane and source/file documentation updated. Old twisty and Monaco assertions replaced with the reference's native source semantics. |

## Visual method

The test imports the reference ontology through the real application and renders Craig's unchanged HTML in a second Electron window. It compares the full visible pane in both themes across four source states and six shapes; expanded and narrow shapes are additionally scrolled to inspect source. That produces 64 app/reference pairs. It never uses the application as its expected image.

Every pixel channel must agree within 2/255, with no masks or allowance for a count of wrong pixels. This accounts for observed rounding at independently rasterized antialiased corners. Geometry and computed fonts/colors/backgrounds/padding are exact assertions. Raw differences and full layouts remain in the artifacts. See `tests/fixtures/details-visual/README.md` for fixture provenance and reproduction.

Reference-specific limitations are deliberate: the 360 px pane's intrinsic statement widths produce horizontal overflow, and long header state/action groups can clip at narrow or recovery widths. The reference wins on appearance under #57. The docking host remains the application's host.

## Validation record

- TypeScript and the production build pass.
- All 12,037 unit cases have passing results. The full run passed 12,036 and encountered one Windows `EPERM` temporary-file rename failure in `suggestion-batches`; all 24 cases in that suite passed when rerun. Both logs are retained.
- Development desktop checks cover all 26 Details source cases, eight grouped-statement cases and 12 workspace/autosave cases. The new graph-format test needed to reopen Details after importing a new file; the unfinished-row test still used the old Add row accessible name. Both corrected cases pass. Invalid and stale text and validation survive full process restart.
- 109 distinct desktop cases have passing final results, including 66 run against the delivered executable. These include all 16 ancestry, 26 source, eight grouped-statement, 12 workspace/autosave, 25 export, six adaptive-pane, and the affected Find/Text Analysis cases. Counts deduplicate explicit follow-up runs; no automatic retries or skips were used.
- All 64 packaged app/reference image pairs pass: exact recorded geometry/styles, no channel difference above 2/255. The screenshot gallery and machine-readable validation record contain the final package's captures.
- Three broader authoring cases still fail at the graph inline-rename focus step: double-click creation, default-name retention, and detached light dismissal. All three reproduce with the same failures in an isolated build of the unchanged `c15d402` revision using the same test setup. They are pre-existing graph failures, outside #57. The suite is not represented as wholly green.

The audit also exposed a hierarchy selection race: pruning against the old Classes tab could discard an externally selected property just before the Properties tab appeared. Selection now survives that transition. Ancestry tests use the established viewport-center fallback when the new selected card sits above the tree's usable area, and pointer checks click rows fully inside the resulting viewport. Their strict no-scroll assertions remain.

The authoring test helper now waits for File → New to replace the dataset before issuing creation/edit requests. Previously the asynchronous replacement could erase a test's newly created class. It also honors background-window isolation, checks the current field-specific conflict message, and opens the full-width header before using More. These are test corrections; they do not change File → New or graph behavior.

This evidence is scoped to the automated Windows/Electron environments and captured presentations; physical touch, external screen readers and mixed-monitor DPI sessions are not claimed.

## Build and evidence

Version 1.0.0, built 2026-10-06T21:15:08.139Z, unsigned. Changes remain uncommitted on `c15d402`.

Executable: D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe

Installer: D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe

Executable SHA-256: `9b11c770ef9a5ac6d7fcdcbae447512e478dacfdb8c4b45766b715654ed0815b`.

Application archive SHA-256: `0c6093a4bf961dfc623f7180ac79cdd2136284f44c1252fe26d399eac94eff35`.

Installer SHA-256: `e3075c16a1b7d739f7e55c9301ba91c5560b55d3f3cc5740994afc50c41bb00d`.

Audit directory: D:\git\axiom\artifacts\issue-57

- `review.html`: app/reference screenshot gallery.
- `visual-results.json` and `*-layout.json`: raw image differences and exact geometry/style comparisons.
- `package-hashes.json`, `package.log`: delivered build identity.
- `unit.log`, `unit-batches-followup.log`: complete unit run and isolated Windows-file-error follow-up.
- `source-visual-regressions.log`, `followup.log`: source, statement, workspace and development visual checks, including earlier failures and their follow-up results.
- `validation.json`: final deduplicated case results, build identity, and visual metrics.
- `packaged-regressions.json`, `packaged-authoring-final.json`, `packaged-authoring-followup.json`, `packaged-interactions.json`: packaged test records; the corresponding logs retain earlier failures and explicit follow-ups.
- `baseline-authoring.json`, `baseline-authoring.log`, `baseline-traces`: reproduction of the three graph failures before #57. The baseline code is an archive of `c15d402`; only the corrected authoring test was copied into that isolated checkout.

Reproduce the primary package audit with:

```powershell
$env:AXIOM_TEST_BACKGROUND='1'
$env:AXIOM_TEST_EXE='D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe'
npx playwright test tests/e2e/details-visual.spec.ts tests/e2e/details-source.spec.ts tests/e2e/details-ancestry.spec.ts tests/e2e/statement-groups.spec.ts tests/e2e/workspace-autosave.spec.ts tests/e2e/ontology-export.spec.ts tests/e2e/adaptive-panes.spec.ts
```

Run Electron suites sequentially to avoid Windows focus interference. Reference captures require no accepted baseline updates.
