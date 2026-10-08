# Audit of the preceding 24 hours

Follow-up: `audit-followup-repairs.md` records the subsequent fixes to the Details visual gate, batch persistence and four desktop test failures. This audit preserves the findings as they stood when reviewed.

Craig requested this audit after the incomplete #66 delivery. The fixed review window is **2026-10-07 01:31:44 UTC through 2026-10-08 01:31:44 UTC**, measured from that request, not from the end of the repair. It includes issues created, updated or closed in the window. GitHub returned 14 issues: **#1, #6, #17, #20, #44, #57, #58, #59, #60, #61, #62, #63, #65 and #66**. #64 is a pull request, not an additional issue.

The source records are `artifacts/issues-last-24-hours.json`, `artifacts/audit-issue-<number>.md` and the corresponding comment JSON files. This review compares the issue requirements and subsequent overrides with the implementation, checked-in tests and actual validation records. An old passing report is identified as historical evidence, not a fresh test run or proof of every requirement.

## Confirmed omissions and unsupported claims

### 1. #66 omitted most of the supplied shell

The previous implementation and its 14 exact image comparisons covered the title band and menu popups. It omitted the reference's pane rail, document tabs, status bar, command palette presentation, live badges and corresponding responsive behavior. The issue's earlier exclusion was treated as permission to narrow the supplied spec. Craig explicitly rejected that interpretation. Closing #66 as if the supplied shell had been delivered was wrong.

**Correction:** #66 was reopened. The full shell is implemented and compared with the unchanged reference. The new rail is 48 pixels, document tabs 32 pixels and status bar 22 pixels, beside the existing 36 pixel title band. Controls use real panes, documents, menu commands, save state, scan state and counts. The palette follows the reference. The new harness adds 44 exact comparisons to the existing 14, with no differing-pixel or color tolerance. Both recovery thresholds and all rail actions have functional coverage. Final package evidence is in `docs/issue-66-full-shell-validation.md`.

The old `docs/issue-66-validation.md` and `docs/issues-63-65-66-validation.md` describe the earlier, incomplete delivery; their title-band-only success must not be read as full-shell acceptance.

### 2. #57's visual gate is broken, and its prior criterion was not exact equality

#58 authorized editing the Details reference to remove the prefix note. The fixture now hashes to `0cdd5cc4925e8e808eb1b81ddcc1da9d9dd6ed6d55cde1905a8420c58ecff95c`, but `tests/e2e/details-visual.spec.ts` and its fixture README still pin `3387b593125c5ba95e338c3dbdd6e0f8775b4ecf390eebd829d3401476e67e90`. The suite stops before rendering. This was already recorded under “Existing Details visual blocker” in `docs/issue-61-validation.md` and left unresolved.

The comparison also asserts `differences.aboveRounding === 0`, permitting channel differences of up to 2/255. `docs/issues57-validation.md` acknowledges that allowance. It therefore does **not** establish the requested zero-pixel visual match, even after the hash is corrected. That document's working-tree status is also stale relative to the committed implementation.

**Outstanding:** update the authorized reference pin, require raw pixel equality, repair any resulting rendering differences and rerun every Details presentation. #57 remains open. The prefix-note removal itself is present in both the application and the amended reference; this is a verification and handoff defect across #57/#58, not evidence that #58's copy change was omitted.

### 3. #59 and #61 have incompatible recorded result counts

#61 says `higher education institution` on `schools.ttl` returns **1,271** rows with default columns and **2** with `rdfs:comment` hidden. #59 requires the shared MiniSearch/MPNet ranking engine, including OR retrieval and typo tolerance. The implemented engine returns **3,147 / 578** for those two searches. The changed expectations and reason are recorded in `docs/issue-59-validation.md` and the Individuals behavior tests, but #61's written acceptance numbers remain unchanged.

Shown-column scoping and local-name search are implemented; the discrepancy is not explained by searching hidden comments. It is the broader ranking/retrieval behavior. Updating test expectations did not resolve the written acceptance conflict.

**Outstanding:** record an explicit resolution of the conflicting acceptance requirements and verify that resolved behavior. Do not silently restore substring matching, which would undo #59. #59 remains open with this finding; #61's earlier closure is qualified by this unresolved requirement.

#61 has been reopened with the concrete conflict. Audit findings were posted to #57 and #59 as well; the local implementation's test results do not override the issue requirements.

### 4. A reproducible graph-command defect was deferred as pre-existing

The earlier #63/#65/#66 audit recorded that closing Graph and immediately choosing a layout could reopen it in `auto` rather than apply `radial`. Five repeats failed four times on both the prior package and the starting revision. Calling it pre-existing established origin, but did not make the lost command acceptable.

**Correction:** graph commands now wait for asynchronous tab closure and for the restored graph's command listener. A closing graph stops accepting commands. The guessed 40 ms replay delay is removed. Five consecutive source repetitions of the detach/reattach/close/reopen journey pass. Packaged verification is recorded with the shell delivery.

### 5. #65 omitted the settings-row scroll announcement

QSS-102 requires a row scroll to be announced. `QualitySettings` retained and changed horizontal scroll positions but did not announce them. Toggle, withdrawal and scan announcements were already present.

**Correction:** user-triggered settings-row scrolls now publish a polite announcement through the existing status channel. The functional settings test asserts it while retaining the existing check that keyboard focus scrolls the row without moving the pane vertically. This adds no visible UI and does not alter the reference.

### 6. Issue completion state and test limits were not consistently carried through

#59 and #60 were still open when this audit began despite committed implementations and validation documents. #57 and #20 were also open with substantial implementation present. Open status alone is not proof of unfinished code, but leaving delivery and remaining work unexplained is an incomplete handoff. #59 has the unresolved acceptance conflict above. #60's implementation and tested boundaries are documented in its update.

#60 is now closed after fresh success in all six packaged instance cases and the source-only intercepted updater case. #65's omission and correction were posted on its issue. #61 was reopened; #57 and #59 retain their concrete outstanding findings.

The #60 updater test intercepts the final installer invocation. It verifies last-instance coordination and exactly one invocation, **not a real downloaded update replacing the installed app**. Historical #6 testing did perform a real install, file association, double-click and uninstall. Those are different tests; neither establishes a current end-to-end multi-instance upgrade. This remains a verification limit, not a claimed observed updater failure.

## Every issue in the window

| Issue | State at request | Requirements and evidence reviewed | Result |
| --- | --- | --- | --- |
| #66 | Open, after correction | Unchanged full `shell.html`; native menu/title integration; `window-chrome.spec.ts`; new `workbench-shell.spec.ts` | Major omitted scope corrected as finding 1. The earlier closure was unsupported for the full shell. |
| #65 | Closed | QSS rows, rails, idle/running/failure states, empty kinds, publication checks, withdrawals, census totals, keyboard/recovery; `QualitySettings.tsx`, `quality-settings.css`, settings desktop/visual tests | Missing scroll announcement corrected. Twelve exact settings comparisons existed. Rendered-reference precedence explicitly governs prose conflicts, including check-group counts and the limits-line geometry; those are not silently invented exceptions. |
| #63 | Closed | Exact Would add terms, one edit, refreshed report including affected peers, next-row focus, rejected writes and Undo; `quality-jobs.ts`, domain quality tests and correction desktop cases | No omitted write-path requirement found. New global status integration is guarded against a false stale flash during its own correction; a mutation observer checks all three successive applications, and Undo still marks it stale. |
| #62 | Closed | Findings bands, severity totals, coverage and all-clear states; `QualityPanel.tsx`, zero-band desktop case, visual amendment 10 | Zero-finding bands are removed; Coverage still lists passing checks. The pinned #44 reference remains unchanged and the authorized amendment is applied in memory. No additional omission found. |
| #61 | Closed | Individuals census/columns, resize/reorder/autofit, keyboard paging, persistence, Inspector grouped edits, Touchpoints pinning/links, all six visual surfaces | 72 exact comparisons and functional evidence exist. Search-count acceptance is unresolved (finding 3). Existing Details hash failure was explicitly deferred (finding 2). |
| #60 | Open | Free-slot profiles, ownership, launch routing, restoration, crash release, New window, last-close updater; instance/profile/update source and seven desktop cases | Implementation and source/package evidence exist. Closure/update was missed; real multi-instance installation of an update remains untested (finding 6). |
| #59 | Open | Shared search in Individuals and reports, class/field scope, empty search, lexical/semantic phases and stale-response protection; domain search tests and Individuals cases | Implemented in `84a84c5` and `6bc28fa`, with validation. Written #61 result-count conflict and incomplete issue handoff remain. |
| #58 | Closed | Remove prefix sentence; keep only the dirty-draft retention note; actual source and amended Details HTML | Copy change is present. Reference-hash pin was not updated, breaking #57's gate. A #57 comment records the superseding copy request even though older body text remains. |
| #57 | Open | Details content-sized source, dirty/saved copy, pinned visual reference and comparison criterion | Implementation exists, but visual acceptance is unproved: stale hash plus 2/255 tolerance. Remains open; no new claim of full fidelity. |
| #44 | Closed | Census withdrawal, eight scan states, reasoned staleness, paging, coverage denominators, exceptions, export, reviewed additions, adaptive presentations | Report functionality and zero-pixel reference evidence exist. Later #62, #63 and #65 intentionally supersede the affected requirements. #46's toolbar overflow was explicitly approved. No additional omitted report requirement found in this review. |
| #20 | Open | Wikipedia provider abstraction, local-model ranking/fallback, guarded batch link writes, SKOS relationships, individual-only sameAs, cache and pinned subjects | `TouchpointService` and provider/domain/desktop tests cover the core behavior; #61 replaces its presentation. The older Open Wikipedia link is explicitly removed by #61, so its absence is not an omission. No unsupported claim of fresh live-network or real-model verification is made. Issue remains open pending its own completion disposition. |
| #17 | Closed | MiniSearch exact pin, common revision index, weighted fields, OR/stopwords/prefix/fuzzy ranking, semantic admission/RRF, queue cancellation, resident vectors and benchmarks | `entity-find.ts` is removed. `resource-search.ts` is a compatibility/cache wrapper over `EntitySearchIndex`, not a leftover matcher. Historical real-model and worker timing evidence is recorded, with cold/warm and corpus limits stated. No additional omitted requirement found. |
| #6 | Closed | Per-user NSIS, HKCU association/quoted path, shortcuts, app identity, uninstall retention, GitHub updater and signing configuration | Configuration/tests and historical real installation lifecycle evidence are present. Unsigned builds are explicitly the configured state, not an omitted signing feature. #60 supersedes single-instance update timing. No new live upgrade claim. |
| #1 | Closed | Accepted launch extensions, argv handling, file-open queue, errors/save guards and ownership forwarding | Parser and launch desktop tests exist; #60 intentionally replaces the old single-instance routing policy. Windows coverage does not prove a fresh macOS open-file run. No additional Windows omission found. |

## Remaining test debt

The old broad desktop run was not green. `docs/issues-63-65-66-validation.md` lists fourteen baseline failures plus the graph race. This repair fixes the graph race and updates the palette's role/search selectors to the new reference. Other failures must not be represented as passing merely because they predate this change. They include obsolete title/control selectors and unresolved relationship/menu expectations. The audit does not silently rewrite those assertions or certify the entire application.

Fresh packaged follow-ups confirm three remaining File > Open test mismatches: switching away from an imported document saves a recovery workspace and adds its absolute path to Recent, while the tests expect no extra entry; another test expects a save/discard prompt that the current automatic-save flow does not show. An empty-graph context-menu case also fails while looking for an exact `Expand` item. These four failures remain recorded in the package follow-up logs. They are not a passing verification of those older expectations. The same runs did pass all seven session-startup cases, all four launch-file cases after a title-selector migration, and all six multi-instance cases.

The fresh full unit suite also exposes a remaining batch-persistence timing failure outside the changed shell: `suggestion-batches.test.ts:96` can read an undefined final run count from the saved JSON after completion is reported. The initial run failed three cases with Windows rename `EPERM`; the isolated 24-test file passed; the final full run still failed one of 12,033 tests with saved counts `[3, undefined]` rather than `[3, 3]`. This is retained as unresolved evidence, not dismissed because an isolated rerun passed. Logs: `artifacts/issue-66-full-unit.log`, `artifacts/issue-66-unit-followup.json`, and `artifacts/issue-66-final-unit.json`.

The requested #66 fidelity is measured against the unchanged reference on Windows with matched Electron rendering settings, live-data substitutions and native caption reservation. It is not a claim that every pane in Axiom, every OS rendering configuration, or every historical issue already has zero-difference visual coverage. The unresolved Details gate and search acceptance conflict above remain explicit follow-up work.

The fresh 58-case targeted run passed 56 cases initially. Two existing cancellation cases observed progress and then sent a separate pointer action after the short scan had finished. Their assertions are retained; the tests now activate the real Cancel button in the renderer turn that first displays at least 128 scanned entities. Both pass, including partial findings, paging and stale-state checks. No scanner timing or production behavior was altered to satisfy the tests. Attempts to use larger cancellation fixtures also exposed that the test's immediate Tools action after import can precede a settled pane layout; that timing is not treated as evidence of a completed large-import acceptance test.

GitHub had no open PRs at this audit's final repository check. Three old branch pointers remain unmerged by Git ancestry: `issue-1-open-launch-path`, `issue-2-register-file-type` and `issue-6-windows-installer`. Their launch/installer behavior is present on master and was reviewed above; their divergent commits were not deleted or merged as part of this UI repair. The pre-existing `wt-44` worktree is clean and was left in place. These are committed branch histories, not uncommitted changes hidden from the delivery.
