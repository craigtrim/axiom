# Issue 66: complete shell correction

Craig's supplied reference requires the whole shell. The earlier title-band-only implementation was incomplete. This correction adds the 48 pixel pane rail, 32 pixel document tabs, 22 pixel status bar and reference command palette to the existing 36 pixel title band. All reference icons, metrics, colors, typography, borders, ordering, badge shapes, focus states and responsive thresholds are retained. Real application data replaces illustrative filenames, counts and menu contents.

The unchanged reference SHA-256 is `a0f5573c00809578d78a2d75ee39c5993a726a68d28b94ce1582ca31e67f871f`. The reference's explanatory sheet occupies the space where real dockable panes run in Axiom. Native Windows caption controls use the real overlay reservation, as the reference directs.

## Implementation

- Every rail entry opens its real pane and preserves rail focus. Settings exposes the installed Settings commands; Escape restores the gear. Suggestions, quality findings and audit entries supply the badges. Zero is absent and a count above 999 displays `999+` while its accessible name retains the full count.
- Document tabs select the workspace, source and visited queries, with real labels and dirty state. Arrow keys, Home and End select and reveal the tab. Existing docking, detached panes and tab history remain functional.
- The left-aligned status row follows the active pane, real totals, revision, scan state and save state. Opening a stale scan does not falsely clear its warning. A one-click quality correction never flashes an out-of-date warning for its own edit; an independent edit or Undo still makes the report stale.
- The palette uses the installed menu model, including current labels, hierarchy, enabled state and remapped accelerators. It follows the reference's filtering, first 60 results, keyboard selection, focus return and empty message.
- At 620 pixels the status counts withdraw. At 420 pixels high Error log withdraws and the rail scrolls with Settings reachable. At 239 wide or 119 high the rail, tabs and status withdraw. Short dock contents are clipped within their own workspace instead of painting over the status bar.
- Closed-graph commands now wait for tab closure and a registered graph listener. The old 40 ms guess could lose a layout command. A failed close restores the existing graph's command handler.
- The audit also found and corrected #65's missing settings-row scroll announcement.

## Source verification

TypeScript and changed-file formatting pass. The 58-case shell/quality/Individuals regression run passed 56 cases initially; the two short-scan cancellation cases passed after synchronizing the real Cancel button with displayed progress in the renderer. All partial-report assertions remain. No scanner behavior or production delay was changed for the tests.

All **142 fresh visual region comparisons have zero differing raw pixels**:

| Surface | Exact regions |
| --- | ---: |
| Existing title band and menu popups | 14 |
| Rail, document tabs, status bar and palette | 44 |
| Ontology Quality settings | 12 |
| Individuals, Columns, both Inspectors, Touchpoints and legend | 72 |

Both themes and the reference's responsive presentations are covered. Expected renders come from the pinned HTML, not application screenshots. Both renders use the same compositor treatment; there are no masks, pixel budgets or color tolerances. Reference provenance and live-data substitutions are documented in `tests/fixtures/window-chrome-visual/README.md`. Full-window and region captures were visually inspected.

The formerly intermittent graph detach/reattach/close/reopen case passed five consecutive runs. The restored-pane/palette journey also passes after replacing obsolete stable-pane-ID and old palette selectors with the actual pane and reference combobox.

The final full unit run passed **12,032 of 12,033 tests across 115 files**. One unchanged `suggestion-batches.test.ts` case reads `[3, undefined]` from the saved batch where it expects `[3, 3]`. An earlier full run failed three cases in that same file with Windows `EPERM` during temporary-file replacement; its isolated follow-up passed all **24 tests**. The repeated full run establishes that a persistence/timing failure remains, so the complete unit suite is **not** reported as green. No batch persistence code or test expectation was changed for this shell delivery.

Evidence:

- `artifacts/issue-66-shell-regressions.json` and `.log`
- `artifacts/issue-66-cancellation-final.json` and `.log`
- `artifacts/issue-66-graph-replay.json` and `.log`
- `artifacts/issue-66-full-unit.log`
- `artifacts/issue-66-unit-followup.json` and `.log`
- `artifacts/issue-66-final-unit.json` and `.log` (the final full run, one failure)
- `artifacts/issue-66-full-typecheck.log`

## Audit and source commits

The 14-issue audit is `docs/issues-last-24-hours-audit.md`. It identifies the incomplete #66 scope, broken #57/#58 Details reference gate and prior tolerance, unresolved #59/#61 search-count acceptance conflict, graph replay defect, missed #65 announcement, issue handoff gaps and real-update verification limit. #61 has been reopened; #57 and #59 remain open with explicit findings. These are not presented as completed requirements.

Local commits:

- `9e583f9`: full shell and command/state integration.
- `9fa6b89`: settings-row scroll announcement.
- `6dc3d93`: shell reference and functional regression tests.
- `da2ed06`: migrate existing startup/workspace readiness checks to the reference status bar. Triple-census assertions now read the real Store snapshot because the reference status row displays classes and individuals.
- `2c08f1c`: migrate palette roles/labels, modal scroll-container checks and the document-title check, retaining their behavioral assertions.

No push was performed.

## Windows installer

`npm run package` completed at **2026-10-08 02:24:28 UTC**, using Electron 44.3.0 and verified Mutatoc 0.5.1. The installer is unsigned, as configured.

Installer: `D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe`

Size: **208,771,469 bytes**. SHA-256: `a84ac80e5b755dbd4eb994e90e8cbb7a1cc6744e4cd022b4149463089646a321`.

All **49 bundled JavaScript, CSS, HTML and JSON files** match `dist` byte for byte. The receipt records 310 source/build inputs and the runtime build revision `6dc3d931b2b04f8cdf2ff564e73e5b1c11f052f2`. Subsequent changes are tests and documentation. The package log is `artifacts/issue-66-full-package.log`; the hash/input receipt is `artifacts/issue-66-full-package-receipt.json`.

The packaged application passed **68 distinct desktop cases** across the main run and follow-ups, including all 31 quality workflows, all shell/settings cases, all six multi-instance cases, all seven session-startup cases, all four file-launch cases, graph reopening, pane restoration, instance-count/disabled palette actions and three palette stability sizes. Its **58 shell and 12 settings image comparisons are again exact**. The palette stability checks include accessibility, input position and overflow.

The initial package run stopped six multi-instance cases at the removed `.status-counts` selector. Those pass with the new accessible status landmark. The workspace launch check similarly needed the current document-pill selector, and the palette checks needed its combobox role and actual list scroll container. These were test migrations, with no runtime changes after packaging.

The source-only, intercepted updater-coordination case also passed freshly. #60 is now closed with that evidence and the explicit limit that no real update was installed during the test.

The broader follow-ups still expose **four unresolved test failures**: three `file-open.spec.ts` expectations about the previous autosave/recent-file/prompt flow, and `instances-menu.spec.ts` expecting an exact `Expand` item in an empty graph's context menu before it reaches its palette assertions. These are recorded, not silently changed to produce a green broad-suite result. The full application desktop suite is not claimed to pass.

Packaged records: `artifacts/issue-66-full-packaged.json`, `artifacts/issue-66-full-packaged-menus.json`, `artifacts/issue-66-packaged-startup.json`, `artifacts/issue-66-packaged-palette-followup.json`, and `artifacts/issue-66-palette-stability.json`. The updater record is `artifacts/issue-60-update-audit.json`.

`artifacts/issue-66-delivery-verification.json` deduplicates the passing packaged cases, lists the four remaining failures and the source-only updater skip, checks all 70 packaged pixel results, and verifies that the installer and all 310 recorded build inputs are unchanged after testing.
