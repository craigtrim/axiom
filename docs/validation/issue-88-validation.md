# Query and Query results validation

[Issue 88](https://github.com/craigtrim/axiom/issues/88) replaces Query's stacked controls with the shared action row, footer and right-hand composer. Fields produces an undoable edit. Describe retains a checked proposal until the user opens it. Each execution keeps its own results tab, with worker-side sorting, column statistics and CSV over all retained rows.

## Reference and boundaries

The unchanged, hash-pinned version 2 reference is in `tests/fixtures/query-visual/visual-reference.html`. Its README records both source hashes, the comparison method and every production-data mapping. The visual suite covers all 32 states in light and dark, including popups, generation outcomes, shallow and narrow layouts, and recovery.

The comparisons use the real 63-triple ontology and query engine. Temporary executable adapters return deterministic proposals through the actual subprocess runner and validation gate. They report the reference's CLI versions and exercise cancellation, discovery and failure diagnostics. No model calls are made by this validation. The opt-in live-provider suite has updated selectors and explicit proposal opening, but was not run for this issue.

All 64 comparisons passed. Fifty-nine have zero differing pixels at the documented channel threshold. The remaining five have 1, 14, 15, 2 and 2 pixels at the exact rounded or clipped edges listed in the fixture README, with no unexpected pixels. These five images are not pixel-identical. A full run after formatting detected a footer text-node spacing difference; keeping each suffix in one text node restored the measured layout.

The shell remains covered by issue 87. Shared controls retain their existing defaults; Query opts into its separate overflow group. Monaco continues to own editing, undo and retained document models. AG Grid continues to own result virtualization. Rows and their identities remain in the domain worker.

## Behavioral evidence

The full unit run passed 11,949 tests, with 182 optional native-runtime cases skipped in this isolated checkout. Tests cover proposal binding scope and IRI diagnostics, deterministic Fields queries, stable numeric sorting with blanks last, complete column statistics, CSV quoting, history persistence and explicit opening.

The candidate integrated with the main checkout's unpublished commits passed type checking and 11,953 unit tests, with the same 182 skips. Its extra four tests belong to the existing local audit work. The merge had no conflicts and retained that work outside the issue PR.

Desktop coverage exercises Fields undo, fresh context before Generate, every proposal outcome, cancellation and retry, save failure, independent documents and result tabs, restart and eviction, old-result recovery, history search, keyboard navigation and responsive editor focus. A 251-row query checks sorting and CSV beyond the first loaded block and scrolls to the last retained row. Failed persistence prevents a success toast or an accidental new document.

A second 251-row query copies 11,295,510 characters through the native clipboard and checks the entire CSV. A mismatched result key is rejected without changing that clipboard. Query copies its identity-checked worker result directly through the main process, so the general ten-million-character limit for arbitrary renderer text does not reject a retained result.

The shared-control regression suite passed 37 tests across behavior, themes and reference images. Its Electron theme scenario was also rerun serially with the Query regressions. All four window-chrome tests passed. Native Query menus, cancellation against a large ontology, detached editing and Text Analysis keyboard interoperability passed. Text Analysis used the existing local Mutatoc installation; the Query fixtures use no external service.

This evidence covers Query and the affected shared controls. It does not claim that the entire desktop suite passes; the unrelated baseline failures recorded in `issue-87-validation.md` remain outside this issue. The Query cancellation timing case in that baseline now waits for the native Cancel action to become available and passes.

## Review

Codex self-review covered proposal ownership and cancellation races, document preservation, dataset and session identity, cache eviction, full-result operations, keyboard event handling and shared-control compatibility. A proposal cannot open while another generation owns the reservation, and opening first flushes the current draft. Column census uses a non-touching cache lookup, so automatic refresh cannot keep old results alive indefinitely.

No data migration or deployment is required. Existing query-history files remain readable. Generated responses no longer create documents automatically; opening the retained response is an explicit user action.
