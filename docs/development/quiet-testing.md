# Quiet local UI testing

Issue #165 adds an opt-in source-test mode that creates Electron windows hidden
and prevents native show, restore, and focus calls from revealing them. Normal
application launches and the normal desktop suite retain their existing behavior.

Run `npm run test:quiet`. It rebuilds the source before launching, so a stale
application bundle cannot ignore the quiet flag and open a normal window.
`node scripts/test-quiet.mjs --list` lists the allowed cases without launching
Electron. Use the direct Node command for arguments in PowerShell; forwarding
arguments through an npm PowerShell wrapper can lose them.
The command rejects arbitrary arguments and packaged executables. Unexpected
native dialogs, menus, or native-window maximization report that the test requires
the normal native test stage. Maximization can reveal a hidden Electron window;
quiet mode rejects it rather than pretending to establish maximized geometry.
Do not set `AXIOM_TEST_QUIET` manually for unqualified specs.

## Coverage allocation

| Test                                                                                      | Quiet coverage                                                                                                                 | Normal native coverage                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `state-updates.spec.ts`: a label delta refreshes Hierarchy, Find, Individuals and Details | Same scenario and assertions; real IPC edits and renderer results                                                              | Retained in the full desktop suite and qualification |
| `tests/quiet/window-policy.spec.ts`                                                       | Startup, hidden child/reference windows, activation requests, DOM keyboard input, rendered pixels, and rejected native dialogs | Quiet policy is exercised on a Windows runner        |
| Every other desktop spec, including future specs                                          | Unqualified; excluded from the quiet command                                                                                   | Required in CI or the explicit local desktop stage   |

The allowlist includes exact scenario names. Adding a test to a file does not
automatically qualify it. The quiet runner requires both listed cases to pass
without skips or retries. Native focus, window chrome, system dialogs, and visual
reference suites have not been qualified; their normal coverage remains necessary.
The state-update fixture already supplies file-dialog responses. This does not
test native file dialogs, in either mode.

## Evidence required for conversion

The `quiet-qualification` Windows CI job runs the existing state-update scenario
unchanged in normal and quiet modes. It then temporarily removes changed-entity
propagation from the application, rebuilds, and requires both modes to fail at the
stale rendered-label assertion. Source restoration runs in `finally`. A launch
failure, timeout elsewhere, skip, or empty run does not count as detecting the bug.
Reports and `evidence.json` are uploaded in the `quiet-qualification` artifact.
The standalone command `npm run test:quiet:qualify` is restricted to Windows CI
because part of this comparison displays native windows.

The quiet fixture also checks native show/focus events and constructor state
collected before Playwright receives the first window. The window-policy case
checks real DOM focus and keyboard editing, nonblank rendered pixels, and a detached
application pane. This supports the listed family only. It does not establish
equivalence for native activation or pixel baselines in other suites.

New families need the same passing baseline and meaningful negative control before
joining the allowlist. Preserve their assertions, screenshot tolerances, and native
coverage. Tests that cannot run quietly still run visibly, either on GitHub or in
the required local desktop stage. Quiet qualification does not decide whether a
test is reliable on a hosted desktop.

The native CI suite uses a verified 1920 by 1080 display. A smaller hosted display
can put otherwise ordinary panes into their responsive recovery state and hide
the controls a journey is meant to exercise. Eight Windows shards execute the CI
portion; tests within each file remain serial. Display setup runs only in CI and
never changes the local desktop.

Native CI installs the checksum-pinned Mutatoc 0.7.0 runtime and the project's
pinned full-precision MPNet model before validation. Their tests must execute
against the real engines. A missing runtime must not make a skipped test look
like successful coverage. Failed visual comparisons retain both images and
layout diagnostics in the CI report; their original assertions still apply.

## Native coverage migration

Issue #165 also repairs native coverage that still targeted controls replaced by
#93. Craig authorized this migration and completion of #164 as its prerequisite.
The quiet allowlist remains limited to the two cases above.

| Previous journey                                      | Current coverage                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find class creation with 101 values                   | The real Find handoff opens Add entity; every appended value receives focus and the saved RDF retains all 101 values in order.                                                                                                                                                                                                          |
| Find class groups, delimiter escaping and two parents | Add entity retains the grouped-value, planned-source and saved-parent assertions. A separate Find property case retains the original 143 px group-height assertion.                                                                                                                                                                     |
| Embedded Find class/individual contexts               | Native extension journeys assert the Add entity name, kind and parent chips, then verify the saved RDF. The Add entity visual suite covers the replacement form.                                                                                                                                                                        |
| Find draft persistence during searches                | The Add entity draft stays mounted and retains its field through pending and completed Find searches.                                                                                                                                                                                                                                   |
| Shared-value creation warning                         | The retained Find property editor still warns while typing and permits saving the shared value.                                                                                                                                                                                                                                         |
| Inspector linked-file actions                         | The card is restored within the current Inspector. Native coverage retains opt-in thumbnails, open/reveal dispatch, source metadata and unchanged original file bytes.                                                                                                                                                                  |
| Local parent-review dialog                            | Current Suggest > Add Parents uses a local CLI fixture through the real assistant pipeline. The journeys retain parent direction, Undo, invalid-input and stale-worker checks. Existing parents become disabled rows in the retained review; a fresh run excludes them. The original local matcher is still checked through the worker. |
| New-workspace discard prompt                          | Automatic recovery replaced that prompt. Cancelled Save As and Open retain the ontology; malformed Open preserves its recoverable contents. Stylesheet reopening uses an independent saved copy because opening another file autosaves the current document.                                                                            |

The combined inventory contains 1,447 native cases in 95 files: the original
1,440 cases, four new #164 journeys, the additional Find property geometry
case, and two #169 blank-draft journeys. List the inventory without launching windows with
`node node_modules/@playwright/test/cli.js test --config=config/playwright.config.ts --list`.
The existing opt-in large-source benchmark is separate from the normal acceptance
run; runtime-dependent tests must execute with their required engines installed.

The Find and Extend Windows captures were regenerated from their checksum-verified
HTML specimens on [Actions run 40569070367](https://github.com/craigtrim/axiom/actions/runs/40569070367)
at commit `7784bccebb6f823f54a0911e48997df4b5200b48`. That run passed all 20
reference cases, including direct application-to-specimen bitmap comparisons.
The HTML hashes remain unchanged. Normal CI compares the committed captures
against the independent specimens and application with zero differing pixels;
it does not regenerate expected images.

Each native CI shard first enumerates its complete inventory, then requires every
listed case to pass once. Missing cases, unexpected skips, expected-failure
annotations, retries and focused-only tests fail the job. The existing opt-in
large-source timing benchmark is the only declared skip. Inventory, execution and
coverage reports are retained under the artifact's `native` directory.

An independent build/package job runs 47 focused CI regression cases before its
packaged checks. The same cases remain in the regular CI inventory. Export
comparisons wait for complete expected RDF semantics, and export-history checks
wait for a preceding pane-close history entry. This adds earlier feedback without
retries or advisory failures.

## Required local desktop stage

Craig authorized a hybrid split after desktop-sensitive tests proved unreliable
on hosted Windows. Keep related input behavior together rather than assigning
only individual cases that have already failed. The exact assignment is maintained
in `scripts/hybrid-test-policy.mjs` and includes the complete keyboard, menu,
modal-stability and window-chrome suites; tests whose purpose is focus, caret,
shortcut or responsive-overflow behavior; the existing 11 visual/input cases; and
the large-import Quality cancellation journey. Query pixel comparisons run as a
complete local family in both themes. Functional Query coverage remains on CI.

All 232 assigned cases run locally with their existing assertions and may display
or focus windows. The remaining 1,221 listed native cases run on GitHub, including
the one existing opt-in benchmark exemption. The CI selection is the exact inverse
of the local selection. New focus or overflow scenarios belong in this local
assignment; moving a case changes its execution location without removing it.

Run `npm run test:desktop:local` from a clean checkout to validate the local group.
The command rebuilds that revision, runs one test at a time, and requires all 232
to pass without retries or skips. Reports are in `artifacts/local-desktop`.
`npm run build:exe` runs this group itself after verifying the CI candidate.
Delivery requires fresh local evidence for the same source commit and tree, and
retains that evidence in its receipt. A passing GitHub run alone cannot authorize
an EXE. The two-case quiet allowlist remains unchanged.

Individuals captures must settle to the same bitmap across fresh paint-layer
setups before comparison with the independent reference. Stability is decided
from successive images of each view. The focused-filter
scenario checks repeated captures and a restored capture at zero differing
pixels. It also deliberately changes the application's border color and requires
the same capture path to detect a difference, then restores the original color.
