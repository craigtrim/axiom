# Quiet local UI testing

Issue #165 adds an opt-in source-test mode that creates Electron windows hidden
and prevents native show, restore, and focus calls from revealing them. Normal
application launches and the normal desktop suite retain their existing behavior.

Run `npm run test:quiet`. It rebuilds the source before launching, so a stale
application bundle cannot ignore the quiet flag and open a normal window.
`npm run test:quiet -- --list` lists the allowed cases without launching Electron.
The command rejects arbitrary arguments and packaged executables. Unexpected
native dialogs or menus report that the test requires the normal Windows CI suite.
Do not set `AXIOM_TEST_QUIET` manually for unqualified specs.

## Coverage allocation

| Test                                                                                      | Quiet coverage                                                                                                                 | Normal Windows CI coverage                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `state-updates.spec.ts`: a label delta refreshes Hierarchy, Find, Individuals and Details | Same scenario and assertions; real IPC edits and renderer results                                                              | Retained in the full desktop suite and qualification |
| `tests/quiet/window-policy.spec.ts`                                                       | Startup, hidden child/reference windows, activation requests, DOM keyboard input, rendered pixels, and rejected native dialogs | Quiet policy is exercised on a Windows runner        |
| Every other desktop spec, including future specs                                          | Unqualified; excluded from the quiet command                                                                                   | Retained unchanged in `npm run test:desktop`         |

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
coverage; move tests that cannot meet those conditions to Windows CI. Keep the full
desktop suite there while qualification remains partial.
