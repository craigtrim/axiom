# Grouped statement tables

Status: complete. The grouped editor and autosave correction are implemented, verified and packaged. All 13 acceptance checks are satisfied. The changes are recorded in local commits; nothing was pushed.

The requirements are FND-144 through FND-156 and the grouped-value amendments to FND-65, FND-66 and FND-70. The supplied README is normative. The reference HTML was opened in Electron and exhibit E was captured. Neither the specifications nor their screenshots were edited.

Craig's clarification preserves the restriction against adding `rdf:type` values and removes the limit of 100 additional statements. Existing individual type assertions share one row. The Find and shared authoring validators still reject additional fixed-predicate assertions.

## Model boundary

`StatementGroup<Value>` contains a predicate and a nonempty, ordered list of values. Details and Find construct this model at the table boundary and use one shared group-row component. The existing RDF triple, IPC, workspace and stored-draft formats remain intact. No migration or store schema change is needed. Blank parent fields are retained in the Find draft and filtered out at the existing creation boundary.

Insertion order is retained within each predicate. The editor adds no ordering semantics, sorting controls or drag controls. Imported RDF terms retain their literal/resource identity and their existing metadata.

## Acceptance

| Check                                             | Evidence                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. One predicate and chooser for 21 values        | Physical Education fixture in the running Details pane.                                                                                                 |
| 2. Three fields and `18 more`                     | Desktop assertions and captured group image.                                                                                                            |
| 3. Independent expansion                          | Expanding `rdfs:seeAlso` leaves `skos:altLabel` collapsed.                                                                                              |
| 4. Count only while values are hidden             | Desktop assertions before and after expansion.                                                                                                          |
| 5. Single-value add action appears on hover/focus | Opacity, focus and row-height assertions. Actions remain visible on devices without a fine hover pointer.                                               |
| 6. Add value appends and focuses a field          | Details and Find tests; predicate selection is unchanged.                                                                                               |
| 7. Removing the last value removes its statement  | Settled-save removal and the deterministic in-flight save reproduction both pass.                                                                       |
| 8. No textarea in the statement table             | DOM assertions; literal fields use single-line inputs.                                                                                                  |
| 9. No reordering affordances                      | No drag, sort or move controls were introduced.                                                                                                         |
| 10. One RDF/XML element per value in order        | Domain round trips, Find Source preview and Details source readback. Punctuation and XML escaping are covered.                                          |
| 11. Parent peers without an Ancestors subcard     | Separate cards and shared connector branches in Details and Find.                                                                                       |
| 12. Collapsed height near 132 CSS pixels          | Details and Find measure about 133 CSS pixels including the table border. The reference exhibit measures about 143; the README budget takes precedence. |
| 13. Keyboard access                               | Traversal covers all 21 fields, their removal controls, add, expand and collapse.                                                                       |

The fixed class declaration and the initial empty root-parent fallback retain their existing protections. Labels and comments offer no second value. Imported multiple annotations remain available without silently dropping RDF.

## Verification artifacts

All paths below are relative to `D:\git\axiom`.

- `artifacts/grouped-statements/reference.png`: supplied exhibit E rendered in Electron.
- `artifacts/grouped-statements/details-group.png`: collapsed 21-value group.
- `artifacts/grouped-statements/find-grouped.png`: grouped Find fields.
- `artifacts/grouped-statements/ancestry.png`: separate peer cards in Details.
- `artifacts/grouped-statements/final-unit.log`: 181 domain tests passed across eight files, including 101 and 1,001 inserted values and asynchronous save reversals.
- `artifacts/grouped-statements/typecheck.log`: successful TypeScript validation.
- `artifacts/grouped-statements/independent-regression.log`: 73 desktop tests passed; the detached-window orientation test failed and was subsequently reproduced in the previous EXE.
- `artifacts/grouped-statements/final-acceptance.log`: all eight grouped-editor acceptance tests passed, including the pending-save reproduction and settled-save keyboard removal.
- `artifacts/grouped-statements/final-regression.log`: all 67 surrounding desktop checks passed. Together with the eight grouped-editor tests, this verifies 75 distinct desktop cases. The separately confirmed pre-existing orientation failure was excluded from this final run.
- `artifacts/grouped-statements/packaged-acceptance.log`: all eight grouped-editor tests passed again directly against the rebuilt Windows EXE, including the autosave reversal and creating more than 100 values.
- `artifacts/grouped-statements/details-geometry.json` and `find-geometry.json`: both collapsed groups measure 132.6667 CSS pixels.
- `artifacts/grouped-statements/autosave-reproduction.log`: original failing reproduction, retained as evidence of the corrected save race.
- `artifacts/grouped-statements/package.log`: successful Windows packaging with Mutatoc 0.3.1 retained.
- `artifacts/grouped-statements/package-verification.json`: all 563 packaged build files match the tested build byte for byte.

Windows package built October 2, 2026:

Application: `D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe`

Installer: `D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe`

## Autosave correction

The reproduction holds an `updateEntity` reply, removes the newly entered value, then releases the reply. Before the correction, the saved values incorrectly contained both `Only` and `Pending value`. The passing regression now confirms that only `Only` remains.

Craig instructed completion, commits and executable packaging after this scope issue was reported. The narrow correction retains a draft that matches the original statements while a newer version is being saved, preserves it during reloads, and queues the reversal against the saved version. If the earlier save fails and the reversal already matches the document, its draft is cleared without another write. Tests cover reversing additions, deletions and edits; preserving a concurrently added parent; and failure cleanup with and without a queued save. Existing merge, rename, conflict and workspace-switch tests still pass.

## Observed issues outside scope

The separate desktop test for detached-window ancestry orientation also fails intermittently. Running it three times against the previous packaged EXE, built October 1 before this change, produced one failure and two passes. This confirms a pre-existing issue. The orientation and adaptive-layout implementation were not changed. See `artifacts/grouped-statements/baseline-orientation.log`.

The existing Details statement-count toolbar remains above its table. Its placement is outside this change. No Appendix B work, search behavior, other Find presentation, Add entity layout, pager or breakpoint changes were made.

## Changed files

| File under D:\git\axiom                 | Reason                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/renderer/statement-groups.ts`      | Nonempty grouped editor record and insertion-order adapter.                                            |
| `src/renderer/StatementGroupRow.tsx`    | Shared collapse, add, removal and keyboard-focus behavior.                                             |
| `src/renderer/statement-groups.css`     | Flat value stacks, compact height, pointer/focus actions and Find ancestry branches.                   |
| `src/renderer/StatementGrid.tsx`        | Details uses grouped records and single-line fields while preserving existing RDF terms.               |
| `src/renderer/FindCreatePanel.tsx`      | Find uses grouped values and separate retained parent fields; the 100-statement UI limit is removed.   |
| `src/renderer/EntityEditorParts.tsx`    | Two physical table columns, required Add row copy and peer ancestry markup.                            |
| `src/renderer/AncestryBreadcrumb.tsx`   | Removes the nested Ancestors card without changing chain computation.                                  |
| `src/renderer/styles.css`               | Styles the separate Details peer cards and shared connector branches.                                  |
| `src/domain/find-creation.ts`           | Removes the 100-statement validation limit while retaining fixed-predicate restrictions.               |
| `src/domain/text-analysis-authoring.ts` | Removes the same limit from the shared creation path.                                                  |
| `src/renderer/editor-drafts.ts`         | Retains reversals during pending saves and clears unchanged drafts after a failed save.                |
| `src/renderer/useEntityEditor.ts`       | Preserves pending reversals during reload and queues their automatic saves.                            |
| `tests/domain/editor-drafts.test.ts`    | Covers save reversals, concurrent edits and failure cleanup.                                           |
| `tests/domain/statement-groups.test.ts` | Grouping, delimiter preservation, metadata and RDF/XML insertion-order coverage.                       |
| `tests/domain/find-creation.test.ts`    | Replaces the obsolete 101-value rejection with 101- and 1,001-value save/readback tests.               |
| `tests/e2e/statement-groups.spec.ts`    | Running-app acceptance checks, screenshots, dimensions and deterministic autosave-race reproduction.   |
| `tests/e2e/details-source.spec.ts`      | Retains source/editing regression checks with grouped-value selectors and required action copy.        |
| `tests/e2e/details-ancestry.spec.ts`    | Checks peer markup and grouped parent editing; normalizes the detached test window before resizing it. |
| `tests/e2e/details.spec.ts`             | Updates the Add row accessible name in the detached-pane workflow.                                     |
| `tests/e2e/find-redesign.spec.ts`       | Updates removal and Add row selectors for the required copy and grouped markup.                        |
| `docs/grouped-statements-validation.md` | Records scope, model boundaries, acceptance evidence and remaining limitations.                        |
