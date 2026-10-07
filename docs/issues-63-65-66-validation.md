# Issues 63, 65 and 66: final Windows validation

Validated on Windows on 7 October 2026. The final package was built at `2026-10-07T21:45:37.618Z` and includes the entity-menu focus correction in `bedefad`.

- Executable: `D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe`.
- Installer: `D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe`.
- Package manifest: `artifacts/latest-electron.json`; package log: `artifacts/issues-63-65-66-final-package.log`.

## Requested behavior and visual fidelity

- TypeScript passed. The complete unit suite passed: 12,033 tests across 115 files (`artifacts/issues-63-65-66-unit.json`).
- All 31 Ontology Quality desktop cases passed in the packaged audit, including individual corrections, reviewed batch additions, stale guards, exports, named graphs and detached panes.
- The final package passed 32 targeted desktop cases: 21 entity context-menu cases, graph detachment/reopening, two correction journeys, three settings cases, the document-pill/palette journey and four chrome cases (`artifacts/issues-63-65-66-final-desktop.json`).
- All 164 visual region comparisons had zero differing pixels: 138 retained report regions in 36 cases, 12 settings regions and 14 title-band/menu regions. Comparisons use both themes, pinned references and the documented live-data substitutions, without masks or tolerance. Detailed artifacts are in `artifacts/issue-44/`, `artifacts/issue-65/` and `artifacts/issue-66/`; report totals are in `artifacts/issues-63-65-report-visual-summary.json`.
- The broader audit also passed the existing Windows native Alt/F10, dialog access-key and keyboard context-menu journey.

## Broader desktop audit

The first broader packaged run passed 80 of 99 cases (`artifacts/issues-63-65-66-packaged-desktop.json`). Two failures exposed an entity-menu focus regression; the focus correction is included in the final package. Two more used outdated Touchpoints selectors; the final suite verifies the current controls. All four now pass.

Fourteen other failures reproduced on the unchanged starting commit, `80c36e0`, in an isolated worktree with its own build. The baseline results and failure traces are recorded in `artifacts/issue-66-baseline-results.json`, `artifacts/issue-66-baseline-status.json` and `artifacts/issue-66-baseline-test-results/`. These are existing failures, not acceptance checks newly introduced for these issues:

| Existing journey | Baseline failure |
| --- | --- |
| Keyboard help, palette and pane navigation | Assumes Touchpoints shares the default Inspector tab group. |
| File creation, save and reopen | Expects the older window-title ordering. |
| View pane restoration | Expects a reused graph pane ID. |
| Window pane navigation | Expects focus inside an empty Inspector. |
| Query cancel and results | Expects cancellation to remain available after completion. |
| File cancellation and malformed input | Expects the older dirty/discard flow. |
| Native-menu outcome mapping | Omits eight existing commands. |
| Graph stylesheet | Expects validation of an obsolete size rule. |
| Keyboard settings and graph navigation | Assumes multiple tabs in a default single-tab group. |
| Inline hierarchy rename | Uses older hierarchy controls. |
| Context Rename | Uses older hierarchy controls. |
| Individual table rename | Uses older table editing controls. |
| Edge-menu relationship operations | Existing relationship expectation fails. |
| Details predicates and seeAlso | Expects the older Add row control. |

The remaining broad-run failure was intermittent graph reopening: after a closed graph is recreated, its layout sometimes remains `auto` instead of applying `radial`. It passed in the final 32-case run and the initial baseline audit. Five focused repeats then produced four failures and one pass on both the final package and the unchanged starting commit. Evidence is in `artifacts/issues-63-65-66-graph-repeat.json` and `artifacts/issue-66-baseline-graph-repeat.json`. The existing graph command replay and graph component were not changed by this task. This issue remains outside the three requested changes.

The complete desktop suite is therefore not reported as passing. The individual issue notes describe the implemented behavior and focused evidence. Both temporary baseline worktrees were removed after collecting their results; the pre-existing quality-pane worktree was left intact.
