# Repairs following the 24-hour audit

Craig asked to fix the audit findings that could be resolved immediately. This record supersedes the outstanding Details, batch-persistence and four desktop-test findings in `issues-last-24-hours-audit.md`; the original audit remains the record of what was found.

## Details visual gate (#57 / #58)

The reference hash now pins the already-authorized #58 copy edit: `0cdd5cc4925e8e808eb1b81ddcc1da9d9dd6ed6d55cde1905a8420c58ecff95c`. The HTML has not been edited during this repair. The old 2/255 channel tolerance is removed; every raw pixel must be identical.

Both surfaces receive the same compositor treatment for the pane and rounded body controls. The harness first removes the preceding presentation's layers and waits two animation frames, then promotes the current presentation. This matters because React retains nodes across sizes and draft states while the reference recreates them. It fixes cached edge-rasterization differences without modifying geometry, colors, content, masks or expected images.

All **64 source comparisons pass with zero differing pixels**: clean, pending, invalid and stale; light and dark; six sizes, with additional source-scroll comparisons. Computed geometry and styles remain exact assertions. Evidence: `artifacts/audit-repair-details-exact.json`, its log and `artifacts/audit-repair-details-source-pixels.json`.

## Batch history publication

The queue previously exposed its mutable working record through `history()`. A run could report completion before review metadata was resolved and the final JSON was replaced. Readers could therefore see a completed run whose persisted result was missing.

History now returns an isolated copy of the last successfully persisted record. Completion is published only after the final atomic replacement succeeds. A deterministic regression holds review metadata pending, verifies that history still says running, then confirms the published result equals the saved JSON. Existing cancellation, restart and sequential-queue tests remain.

The full unit suite passes **12,034 tests across 115 files**, including all 25 batch cases. Evidence: `artifacts/audit-repair-unit-full.json` and its log. An initial sandboxed run could not start fixture subprocesses because Node could not resolve the user's directory; the complete authorized Windows run above passes. TypeScript passes.

## Four desktop failures

The three File > Open tests still expected the pre-autosave workflow. They now verify the documented behavior: an unnamed document is retained as a complete `.axiom` recovery file in Recent, named workspace order survives restart, cancelled opens leave history untouched, and failed opens preserve the current ontology and its recovery contents. They inspect the saved entities rather than filtering unexpected entries out of the assertions.

The empty-graph test now waits for File > New to finish and checks the context action appropriate to the root's actual expanded state. A degree-zero root may already be expanded. Its displayed operation, native Expand/Collapse controls and palette command must still be disabled.

All five focused cases pass, including the fourth File > Open upgrade case. Evidence: `artifacts/audit-repair-file-menu.json` and its log.

## Search acceptance still needs a decision (#59 / #61)

No search code or acceptance numbers were changed. #59 requires Find's ranked, OR/fuzzy matching; #61 states the older stricter filter's 1,271 / 2 counts. The shared engine gives 3,147 / 578 for the pinned school fixture, while correctly limiting search to shown columns plus the local name. The full unit run verifies those actual counts and the shared engine's alias, typo and reordered-word behavior.

Craig was asked whether to retain #59's shared search and correct #61's counts, or require #61's old counts and revise the Individuals search requirement. Until that decision is supplied, both issues remain open. Neither contradictory requirement is silently discarded.

## Delivery

Local commits use the requested git-commit conventions. No push is performed.

- `c5eae42`: publish batch history after persistence.
- `9cf9a23`: verify recovery saves and the actual graph menu state.
- `c9751fd`: exact Details visual gate and amended reference provenance.

The installer was built at **2026-10-08 03:49:43 UTC**. All 49 bundled runtime files match `dist` byte for byte; the receipt records all 310 source/build inputs. Size: **208,772,061 bytes**. SHA-256: `ecac732932b42484364c60078bfcc3de05070b110c07b4c270c8e4244a60085e`. Receipt: `artifacts/audit-repair-package-receipt.json`. Build log: `artifacts/audit-repair-package.log`.

All **70 selected packaged desktop cases pass**: 26 Details source cases, 25 export cases, 12 workspace/autosave cases, two Details visual cases, four File > Open cases and the empty-graph menu case. The two visual cases produce **64 exact comparisons**, again with zero differing pixels. Logs and JSON: `artifacts/audit-repair-packaged` and `artifacts/audit-repair-packaged-menu`. Pixel record: `artifacts/audit-repair-details-packaged-pixels.json`.

`artifacts/audit-repair-delivery-verification.json` verifies those results, the full unit result, the installer hash and all 310 unchanged build inputs. These selected desktop suites are green; this is not a claim that every historical desktop case has been rerun.

#57 is closed with this evidence. #58 and the #66 audit handoff are updated. #59/#61 remain open for the search decision above.

Installer: D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe
