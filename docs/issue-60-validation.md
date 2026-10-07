# Issue 60 validation

Observed on Windows on 2026-10-07.

- TypeScript checking and Prettier checks pass for all changed source and tests.
- The full unit suite passes: 113 files, 11,999 tests. The initial sandboxed run blocked fixture subprocesses from resolving paths under the Windows user directory; the unrestricted run passes.
- All seven new multi-instance desktop cases pass: profile/history/edit isolation and restart, silent probes and launch routing, Open/Recent/Save As conflicts, contested session restoration, crash recovery, New window, and installation after the last close.
- The targeted desktop regression set passes: 30 tests covering the new cases plus existing launch-file, session-startup and workspace-autosave suites.
- All six applicable multi-instance cases also pass against the packaged `Axiom.exe`. The intercepted updater case runs against the source executable without a release feed.
- The installer lifecycle test uses real Electron processes and an intercepted installer invocation. The first exit leaves the second workspace running, the last exit saves it, and exactly one silent NSIS invocation is recorded. No real update is installed during testing.
- The Windows installer and unpacked application build successfully. The packaged `dist/main/main.cjs` SHA-256 matches the source build: `79b18222604edd4059acb1d1af5b9f88973a721843689abc053c9ba606520fb1`.

## Existing broader menu failures

Three failures in `tests/e2e/menus.spec.ts` were reproduced against an isolated archive of the unchanged repository HEAD:

- File workflow expects the old window-title order (`Untitled ontology | Axiom`).
- View workflow expects a `data-pane-id="graph"` element after reopening the pane.
- Query workflow misses the enabled interval for `query.cancel`.

These same failures occur before the issue 60 implementation. Their logs are retained under `artifacts/issue60-baseline/baseline-menus.log`; the broader changed-build run is under `artifacts/issue-60-desktop-tests.log`.

## Evidence

- `artifacts/issue-60-unit-tests-unrestricted.log`
- `artifacts/issue-60-targeted-desktop.log`
- `artifacts/issue-60-packaged-desktop.log`
- `artifacts/issue-60-package.log`
- `artifacts/latest-electron.json`

Windows may report a terminated Electron PID gone before reclaiming its last named-pipe handle. The crash test waits for the reservation to become available before attempting to reopen the file. On this machine Playwright's launcher PID also differs from Electron's main PID, so forced termination uses the PID returned by the main process itself.
