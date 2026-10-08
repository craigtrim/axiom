# Issue 67: keep stale revisions out of the error log

The 16 revision guards specified in #67 now throw an error marked `stale: true`. The worker reply carries that marker to the main process, and `AuditLog.run` rethrows the error before saving a record or notifying subscribers. Callers still receive the original rejection and message. Existing log files remain untouched; other services' similarly worded errors retain their existing behavior.

Only the boolean `true` skips logging. An absent marker, `false`, or the string `"true"` still records an ordinary error, even if its message says the ontology changed. Nested audit runs preserve the same error without writing a record or assigning a failure reference.

Validation on Windows, 8 October 2026:

- TypeScript and formatting checks passed.
- All 12,038 unit tests passed across 115 files, including all 11 audit-log tests and the existing overlapping-operation test.
- All 24 source-build desktop tests passed: the two new stale-audit cases and 22 existing Find cases. These cover creation, undo/redo, parent selection, annotations, pending validation, collisions, dataset replacement, stale write prevention, and accessibility in both themes.
- The acceptance journey makes a real ontology edit and sends a Find preview using the old version. It checks the unchanged message, empty audit list, absence of disk records, and absent badge. An unknown renderer operation then creates exactly one ordinary error record and badge count of one. Further version and epoch rejections leave that record and badge unchanged; a fresh preview succeeds.
- The worker test exercises 20 operation variants covering all 16 specified guards, checks their original messages and `stale: true` reply marker, and verifies that none changes the ontology. It uses the actual compiled worker, including the private `applyTouchpoints` method, without expanding renderer permissions.

The Find regression run exposed two ambiguous test locators that selected an unrelated disabled `Foundation` option while waiting for the parent picker. Those tests now target the `Parent classes` listbox; application behavior is unchanged.

Implementation commit: `d2e4666`. Find test correction: `937a5cf`.

Local reports:

- `artifacts/issue-67-unit.json`
- `artifacts/issue-67-desktop.json`
- `artifacts/issue-67-typecheck.log`

Installer built from `937a5cff28ab2ecf429570f45827f4b5869c4173` at `2026-10-08T16:47:59.203Z`:

- Path: `D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe`
- Size: 208,771,942 bytes.
- SHA-256: `dcd4c90976a408aac8c640f65aa9896c54a58e8dd248beef7669668189e72a77`.
- All 49 packaged runtime bundles match `dist`; the receipt also hashes 310 source/build inputs.
- Receipt: `artifacts/issue-67-package-receipt.json`.

All 24 desktop cases also passed against this packaged application, including all 16 worker guards and the full stale-preview/ordinary-failure acceptance journey. Results: `artifacts/issue-67-packaged.json` and `artifacts/issue-67-packaged.log`.
