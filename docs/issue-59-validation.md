# Issue 59 validation

The Individuals grid and class instance report now use the shared Find engine. Both publish lexical results first and request MPNet enrichment after a 180 ms pause. Missing-model failures preserve the lexical page. Queries, class/column changes, ontology revisions and closed panes invalidate obsolete responses.

The grid searches shown columns and the local name, excluding hidden aliases and the hidden IRI namespace. Its search options exclude generated example rows before semantic admission. The report searches names, aliases and IRIs across the selected class's direct named and generated instances. Direct membership constrains lexical ranking, semantic fill and semantic relative cutoffs. No hierarchy instance rows or search-algorithm controls were introduced.

Active grid queries use relevance order unless the user has explicitly chosen a column sort. Empty filters retain the usual column sort, initially Individual ascending. Explicit sorting, numeric values and blank-last ordering remain available, and the explicit-sort setting survives saved preferences. Both consumers page the complete result set at 100 rows.

## Relationship to issue 61

Issue 59's shared matching replaces the older grid's AND/phrase-preferred filter. On the pinned school census, `higher education institution` now returns 3,147 rows with the default columns and 578 with comments hidden, replacing 1,271 and 2. This is the expected broader retrieval used by Find. The shown-column boundary, measured census statistics and visual reference are unchanged. The unfiltered default retains Individual ascending; relevance searches do not show a misleading ascending-column indicator.

## Domain and worker verification

- `npm run typecheck` passed.
- `npm test` passed: 115 files, 12,031 tests. Log: `artifacts/issue-59-unit.log`.
- `tests/domain/individual-search.test.ts` has 20 cases covering all issue examples, competing matches, class isolation, all four alias predicates, local names, hidden fields, semantic admission, generated rows, pagination, explicit sorting and index invalidation.
- The census/preferences tests passed again after adding explicit-sort persistence coverage.
- `tests/domain/progressive-search.test.ts` exercises cancellation and missing-model behavior for Find, resource suggestions and both instance consumers.
- `node --import tsx tests/performance/individual-search-worker.ts` passed against the built worker. With the installed full-precision local MPNet model, `car` returned the direct Transport instance `Automobile` in both consumers after lexical search returned no matches. The same probe with a nonexistent model directory returned no semantic page and kept lexical results. It also checked in-flight cancellation and obsolete dataset rejection. Evidence: `artifacts/issue-59-worker/results.json` and `artifacts/issue-59-worker.log`.

## Desktop behavior

The six focused filter cases passed before packaging. These exercise the actual inputs, visible-column boundary, aliases, best-match order, explicit sorting, class scope, retained rows during delayed replies and failures, focus retention and cancellation of obsolete requests. The report fixture contains School and Hospital instances sharing the same alias and confirms only the School instance appears in the School report. The hierarchy remains class-only.

Legacy instance-menu assertions were updated for issue 61's current surfaces: named ontologies scope the grid in place, and the Inspector shows a read-only direct-instance count. Existing report entry points remain covered for generated examples.

All 43 selected packaged desktop cases have a passing final result. The broad run passed 41 cases; focused follow-ups passed the corrected alias-only fixture and native disabled-option assertion. A workspace-reopen race in the test was resolved by waiting for the new workspace checkpoint before issuing File > Open; the final five-case interaction run passed. The per-case aggregate retains the originating report for every result in `artifacts/issue-59-desktop-summary.json`. Full reports are `artifacts/issue-59-desktop.json`, `artifacts/issue-59-desktop-followup.json` and `artifacts/issue-59-desktop-final.json`.

The 12 unchanged issue 61 visual tests produced 72 comparisons across both themes and six sizes, all with zero differing pixels. The reference HTML and CSS were not changed. Captures use the existing compositor-normalized reference harness, without pixel masks or tolerance. `artifacts/issue-59-visual-summary.json` includes only comparison files written after this package was built. Images and geometry reports remain under `artifacts/issue-61/`.

## Build

`npm run package` produced the updated executable and installer. The local model remains external to the installer.

```text
D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe
D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe
```

Package log: `artifacts/issue-59-package.log`. Build metadata: `artifacts/latest-electron.json`. The packaged main, domain worker, renderer JavaScript and CSS match the tested build byte-for-byte; hashes are recorded in `artifacts/issue-59-bundle-hashes.json`.
